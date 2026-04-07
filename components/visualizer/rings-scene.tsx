"use client"

import { useRef, useMemo, useEffect, memo } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { COLOR_PALETTES, samplePalette, type ColorMode } from "@/lib/color-palettes"

// ── Geometry constants ───────────────────────────────────────────────────────
const STRIP_COUNT    = 4
const U_SEGS         = 120   // segments along the loop (longitude)
const V_SEGS         = 8     // segments across the strip width
const VERT_PER_STRIP = (U_SEGS + 1) * (V_SEGS + 1)
const STRIP_RADIUS   = 2.2
const STRIP_WIDTH    = 0.5
const CONNECTOR_COUNT = 60   // web lines between strips
const PARTICLE_COUNT  = 600  // ambient surface particles

// Fixed orientation matrices (3×3, row-major flattened) for each strip.
// The four orientations are like an armillary sphere — interlocked rings.
// Built once at module level (this is a "use client" module, never SSR'd).
const STRIP_ROT: number[][] = (() => {
  const make = (ax: number, ay: number, az: number, angle: number): number[] => {
    const q = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(ax, ay, az).normalize(), angle
    )
    const e = new THREE.Matrix4().makeRotationFromQuaternion(q).elements
    // THREE Matrix4 is column-major: e[0]=c0r0, e[4]=c1r0, e[8]=c2r0
    // Build row-major 3×3: [r0c0, r0c1, r0c2, r1c0, r1c1, r1c2, r2c0, r2c1, r2c2]
    return [e[0], e[1], e[2],  e[4], e[5], e[6],  e[8], e[9], e[10]]
  }
  return [
    make(0, 0, 1, 0),                    // identity — strip in XY plane
    make(1, 0, 0, Math.PI / 2),          // 90° tilt around X
    make(0, 1, 1, Math.PI / 3),          // diagonal tilt
    make(1, 1, 0, Math.PI * 0.6),        // cross-diagonal
  ]
})()

// Each strip scrolls at a different speed and direction (creates flowing motion)
const STRIP_U_SPEEDS = [0.18, -0.14, 0.12, -0.17]

interface RingsSceneProps {
  bass: number
  subBass: number
  mid: number
  high: number
  bassEnergy: number
  bassImpact: number
  colorMode: ColorMode
  dropMode: boolean
  visualStyle: number
}

function RingsScene({ bass, subBass, mid, high, bassEnergy, bassImpact, colorMode, dropMode, visualStyle }: RingsSceneProps) {
  const groupRef = useRef<THREE.Group>(null)
  const timeRef  = useRef(0)
  const uOffsets = useRef(new Float32Array(STRIP_COUNT))
  const tmpColor = useRef(new THREE.Color())

  // ── Möbius strip mesh geometries (wireframe MeshBasicMaterial) ──────────
  const stripGeometries = useMemo(() => {
    return Array.from({ length: STRIP_COUNT }, () => {
      const pos     = new Float32Array(VERT_PER_STRIP * 3)
      const col     = new Float32Array(VERT_PER_STRIP * 3)
      const indices: number[] = []
      for (let ui = 0; ui < U_SEGS; ui++) {
        for (let vi = 0; vi < V_SEGS; vi++) {
          const a = ui * (V_SEGS + 1) + vi
          const b = a + 1
          const c = (ui + 1) * (V_SEGS + 1) + vi
          const d = c + 1
          indices.push(a, b, c,  b, d, c)
        }
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3))
      geo.setAttribute("color",    new THREE.BufferAttribute(col, 3))
      geo.setIndex(indices)
      return geo
    })
  }, [])

  const stripMaterials = useMemo(() =>
    Array.from({ length: STRIP_COUNT }, (_, i) =>
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        wireframe: true,
        transparent: true,
        opacity: i === 0 ? 0.65 : 0.42,
        blending: THREE.AdditiveBlending,
      })
    )
  , [])

  // ── Connector LineSegments — web threads between strips ─────────────────
  const connGeometry = useMemo(() => {
    const pos = new Float32Array(CONNECTOR_COUNT * 2 * 3)
    const col = new Float32Array(CONNECTOR_COUNT * 2 * 3)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3))
    geo.setAttribute("color",    new THREE.BufferAttribute(col, 3))
    return geo
  }, [])

  const connMaterial = useMemo(() =>
    new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
    })
  , [])

  // Pre-computed: for each connector, which strip+vertex index each endpoint is
  // [sA, uIdxA, vIdxA, sB, uIdxB, vIdxB]
  const connMeta = useMemo(() => {
    const meta = new Int32Array(CONNECTOR_COUNT * 6)
    for (let k = 0; k < CONNECTOR_COUNT; k++) {
      const sA = k % STRIP_COUNT
      const sB = (k + 2) % STRIP_COUNT              // cross-connect (skip one strip)
      const uA = Math.round((k / CONNECTOR_COUNT) * (U_SEGS - 1))
      const uB = Math.round(((k / CONNECTOR_COUNT + 0.5) % 1) * (U_SEGS - 1))
      const vA = k % 2 === 0 ? 0 : V_SEGS           // alternate outer edges
      const vB = k % 2 === 0 ? V_SEGS : 0
      meta[k * 6]     = sA
      meta[k * 6 + 1] = uA
      meta[k * 6 + 2] = vA
      meta[k * 6 + 3] = sB
      meta[k * 6 + 4] = uB
      meta[k * 6 + 5] = vB
    }
    return meta
  }, [])

  // ── Floating particles that ride the strip surfaces ──────────────────────
  const particleMeta = useMemo(() => {
    const meta = new Float32Array(PARTICLE_COUNT * 5) // [si, uParam, vNorm, speed, phase]
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      meta[i * 5]     = Math.floor(Math.random() * STRIP_COUNT)
      meta[i * 5 + 1] = Math.random() * Math.PI * 2
      meta[i * 5 + 2] = Math.random() * 2 - 1
      meta[i * 5 + 3] = 0.15 + Math.random() * 0.5
      meta[i * 5 + 4] = Math.random() * Math.PI * 2
    }
    return meta
  }, [])

  const particleGeometry = useMemo(() => {
    const pos = new Float32Array(PARTICLE_COUNT * 3)
    const col = new Float32Array(PARTICLE_COUNT * 3)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3))
    geo.setAttribute("color",    new THREE.BufferAttribute(col, 3))
    return geo
  }, [])

  const particleMaterial = useMemo(() =>
    new THREE.PointsMaterial({
      size: 0.04,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true,
      sizeAttenuation: true,
    })
  , [])

  useEffect(() => {
    return () => {
      stripGeometries.forEach(g => g.dispose())
      stripMaterials.forEach(m => m.dispose())
      connGeometry.dispose()
      connMaterial.dispose()
      particleGeometry.dispose()
      particleMaterial.dispose()
    }
  }, [stripGeometries, stripMaterials, connGeometry, connMaterial, particleGeometry, particleMaterial])

  useFrame((_, delta) => {
    timeRef.current += delta
    const t   = timeRef.current
    const pal = COLOR_PALETTES[colorMode]
    const dm  = dropMode ? 1.5 : 1
    const tc  = tmpColor.current
    const mainBass = Math.min(0.8, bassEnergy * dm + bassImpact * 0.3)

    // Advance each strip's u-scroll offset — creates independent flowing motion
    for (let si = 0; si < STRIP_COUNT; si++) {
      uOffsets.current[si] += delta * STRIP_U_SPEEDS[si] * (1 + bassEnergy * 0.4)
    }

    // ── Update Möbius strips ─────────────────────────────────────────────
    for (let si = 0; si < STRIP_COUNT; si++) {
      const rot  = STRIP_ROT[si]
      const geo  = stripGeometries[si]
      const pos  = geo.attributes.position as THREE.BufferAttribute
      const col  = geo.attributes.color    as THREE.BufferAttribute
      const pArr = pos.array as Float32Array
      const cArr = col.array as Float32Array
      const uOff = uOffsets.current[si]

      for (let ui = 0; ui <= U_SEGS; ui++) {
        const u = (ui / U_SEGS) * Math.PI * 2 + uOff

        for (let vi = 0; vi <= V_SEGS; vi++) {
          const vn = vi / V_SEGS * 2 - 1  // normalised v ∈ [-1, 1]

          // Audio-reactive surface perturbation
          let radP = 0
          let zP   = 0

          if (visualStyle === 0) {
            // Smooth: single clean wave propagates around each ring
            radP = mainBass * 0.4 * Math.sin(u * 2 - t * 1.5 + si * 0.8)
            zP   = mid * 0.1  * Math.cos(u + t)
          } else if (visualStyle === 1) {
            // Slight disorder: two interfering frequencies + v-direction twist
            radP = mainBass * 0.35 * (Math.sin(u * 5 - t * 2.5 + si) + 0.5 * Math.sin(u * 9 + t * 1.8))
            zP   = subBass * 0.28 * Math.sin(u * 3 + vn * Math.PI + t * 2.2) + mid * 0.14 * Math.cos(u * 2 - t * 3)
          } else {
            // Chaos: cells freeze in glitched state — slowly snaps to new corrupted shape
            const cu    = Math.floor(u / (Math.PI / 6))
            const ch    = Math.sin(cu * 127.1 + si * 311.7 + Math.floor(vn + 1) * 71.3) * 43758.5453
            const cv    = ch - Math.floor(ch)
            const slowT = Math.floor(t * 1.0) / 1.0   // snaps ~every 1 s
            const flip  = Math.sin(slowT * 1.5 + cv * 25) > 0.4 ? 1 : 0
            radP = flip * mainBass * 1.5 + cv * (bassEnergy * 0.5 + 0.1) * Math.sin(slowT * 0.8 + cv * 12)
            zP   = mainBass * 0.7 * Math.sin(u * 3 + slowT * 1.2 + cv * 8) * (flip ? 2.0 : 0.2) + subBass * 0.4 * Math.cos(vn * Math.PI + slowT * 0.8)
          }

          // Möbius parametric surface: one half-twist per loop
          const half  = u / 2
          const baseR = STRIP_RADIUS + vn * STRIP_WIDTH * Math.cos(half) + radP
          const bx    = baseR * Math.cos(u)
          const by    = baseR * Math.sin(u)
          const bz    = vn * STRIP_WIDTH * Math.sin(half) + zP

          // Apply strip orientation matrix (rot is row-major 3×3)
          const fx = rot[0]*bx + rot[3]*by + rot[6]*bz
          const fy = rot[1]*bx + rot[4]*by + rot[7]*bz
          const fz = rot[2]*bx + rot[5]*by + rot[8]*bz

          const idx = (ui * (V_SEGS + 1) + vi) * 3
          pArr[idx]     = fx
          pArr[idx + 1] = fy
          pArr[idx + 2] = fz

          // Vertex color: cycles by u-position, time, and strip index
          const disp = (Math.abs(radP) + Math.abs(zP)) * 1.5
          const ct   = (((u / (Math.PI * 2)) * 0.6 + t * 0.05 + si * 0.25) % 1 + 1) % 1
          samplePalette(pal, ct, tc)
          const bri = Math.min(0.7, 0.2 + disp + bassEnergy * 0.14 + Math.abs(vn) * 0.08)
          cArr[idx]     = tc.r * bri
          cArr[idx + 1] = tc.g * bri
          cArr[idx + 2] = tc.b * bri
        }
      }

      pos.needsUpdate = true
      col.needsUpdate = true
      stripMaterials[si].opacity = (si === 0 ? 0.55 : 0.35) + bassEnergy * 0.15 * dm
    }

    // ── Update connector web — reads already-computed strip positions ─────
    {
      const cPos  = connGeometry.attributes.position as THREE.BufferAttribute
      const cCol  = connGeometry.attributes.color    as THREE.BufferAttribute
      const cpArr = cPos.array as Float32Array
      const ccArr = cCol.array as Float32Array

      for (let k = 0; k < CONNECTOR_COUNT; k++) {
        for (let ep = 0; ep < 2; ep++) {
          const base = k * 6 + ep * 3
          const si   = connMeta[base]
          const uIdx = connMeta[base + 1]
          const vIdx = connMeta[base + 2]
          const vI   = (uIdx * (V_SEGS + 1) + vIdx) * 3
          const gArr = (stripGeometries[si].attributes.position as THREE.BufferAttribute).array as Float32Array
          const pIdx = (k * 2 + ep) * 3
          cpArr[pIdx]     = gArr[vI]
          cpArr[pIdx + 1] = gArr[vI + 1]
          cpArr[pIdx + 2] = gArr[vI + 2]

          const ct = (k / CONNECTOR_COUNT + t * 0.03) % 1
          samplePalette(pal, ct + 0.5, tc)
          const bri = 0.06 + bassEnergy * 0.1 + bassImpact * 0.04
          ccArr[pIdx]     = tc.r * bri
          ccArr[pIdx + 1] = tc.g * bri
          ccArr[pIdx + 2] = tc.b * bri
        }
      }

      cPos.needsUpdate = true
      cCol.needsUpdate = true
      connMaterial.opacity = 0.1 + bassEnergy * 0.18 * dm + bassImpact * 0.05
    }

    // ── Update particles — drift along strip surfaces ─────────────────────
    {
      const pPos  = particleGeometry.attributes.position as THREE.BufferAttribute
      const pCol  = particleGeometry.attributes.color    as THREE.BufferAttribute
      const ppArr = pPos.array as Float32Array
      const pcArr = pCol.array as Float32Array

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const si    = Math.floor(particleMeta[i * 5]) % STRIP_COUNT
        const vn    = particleMeta[i * 5 + 2]
        const speed = particleMeta[i * 5 + 3]
        const phase = particleMeta[i * 5 + 4]

        particleMeta[i * 5 + 1] += delta * speed * (0.5 + bassEnergy * 0.4)
        const u    = particleMeta[i * 5 + 1] + uOffsets.current[si]
        const half = u / 2
        const r    = STRIP_RADIUS + vn * STRIP_WIDTH * Math.cos(half) + 0.1 + Math.sin(t * 1.5 + phase) * 0.08
        const bx   = r * Math.cos(u)
        const by   = r * Math.sin(u)
        const bz   = vn * STRIP_WIDTH * Math.sin(half)

        const rot = STRIP_ROT[si]
        const fx  = rot[0]*bx + rot[3]*by + rot[6]*bz
        const fy  = rot[1]*bx + rot[4]*by + rot[7]*bz
        const fz  = rot[2]*bx + rot[5]*by + rot[8]*bz

        const pi = i * 3
        ppArr[pi]     = fx + Math.sin(t * 2   + phase) * 0.06
        ppArr[pi + 1] = fy + Math.cos(t * 1.5 + phase) * 0.06
        ppArr[pi + 2] = fz + Math.sin(t * 1.7 + phase) * 0.06

        const ct = (phase / (Math.PI * 2) + t * 0.04) % 1
        samplePalette(pal, ct + 0.5, tc)
        const bri = Math.min(0.4, 0.1 + bassEnergy * 0.2 + high * 0.08)
        pcArr[pi]     = tc.r * bri
        pcArr[pi + 1] = tc.g * bri
        pcArr[pi + 2] = tc.b * bri
      }

      pPos.needsUpdate = true
      pCol.needsUpdate = true
      particleMaterial.size = 0.03 + bassEnergy * 0.03 + bassImpact * 0.02
    }

    // ── Global slow rotation — makes the armillary sphere effect visible ──
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.07 * (1 + bassEnergy * 0.2)
      groupRef.current.rotation.x  = Math.sin(t * 0.25) * 0.15 + subBass * 0.04
    }
  })

  return (
    <group ref={groupRef}>
      {stripGeometries.map((geo, i) => (
        <mesh
          key={`strip-${i}`}
          geometry={geo}
          material={stripMaterials[i]}
        />
      ))}
      <lineSegments
        // @ts-expect-error R3F lineSegments accepts geometry prop
        geometry={connGeometry}
        material={connMaterial}
      />
      <points
        geometry={particleGeometry}
        material={particleMaterial}
      />
    </group>
  )
}

export default memo(RingsScene)
