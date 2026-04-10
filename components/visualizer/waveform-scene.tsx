"use client"

import { useRef, useMemo, useEffect, memo } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { COLOR_PALETTES, samplePalette, type ColorMode } from "@/lib/color-palettes"

// ── Mandala constants ─────────────────────────────────────────────────────────
const ARMS            = 12    // rotational symmetry order (12-fold)
const RINGS           = 7     // concentric rings
const RING_STEP       = 0.40  // radial spacing between rings
const CROSS_SKIP      = 3     // arm-skip for star cross-diagonals
const SPARKS_PER_RING = 10    // sparks orbiting each ring
const PULSES_PER_ARM  = 4     // pulses flowing along each spoke
const TOTAL_NODES     = RINGS * ARMS                                    // 84
const TOTAL_SPARKS    = SPARKS_PER_RING * RINGS + PULSES_PER_ARM * ARMS // 118

// Alternating CW / CCW rotation multipliers, decaying outward.
// This makes inner rings spin fast one way, outer rings slowly the other —
// the key ingredient for the swirling mandala twist effect.
const RING_MULT = Object.freeze([2.8, -2.2, 1.7, -1.3, 0.9, -0.6, 0.3])

// ── Pre-compute segment topology ──────────────────────────────────────────────
// Segments = pairs of node indices (ring r, arm a) → flat index = r*ARMS + a
const { allSegs, N_SEGS, N_RING_SEGS, N_SPOKE_SEGS } = (() => {
  const ringSegs: number[]  = []   // arcs around each ring
  const spokeSegs: number[] = []   // radial spokes outward
  const crossSegs: number[] = []   // star cross-diagonals between rings

  for (let r = 0; r < RINGS; r++) {
    for (let a = 0; a < ARMS; a++) {
      const idx = r * ARMS + a
      ringSegs.push(idx, r * ARMS + (a + 1) % ARMS)
      if (r < RINGS - 1) {
        const nb = (r + 1) * ARMS
        spokeSegs.push(idx, nb + a)
        crossSegs.push(idx, nb + (a + CROSS_SKIP) % ARMS)
      }
    }
  }

  const all = new Int32Array([...ringSegs, ...spokeSegs, ...crossSegs])
  return {
    allSegs:      all,
    N_SEGS:       all.length / 2,            // 228
    N_RING_SEGS:  ringSegs.length  / 2,      // 84
    N_SPOKE_SEGS: spokeSegs.length / 2,      // 72
  }
})()

// ── Component ─────────────────────────────────────────────────────────────────
interface WaveformSceneProps {
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

function WaveformScene({
  subBass, mid, high, bassEnergy, bassImpact, colorMode, dropMode, visualStyle,
}: WaveformSceneProps) {
  const groupRef   = useRef<THREE.Group>(null)
  const timeRef    = useRef(0)
  const impactRef  = useRef(0)
  const tmpColor   = useRef(new THREE.Color())
  const nodePosRef = useRef(new Float32Array(TOTAL_NODES * 3))

  // Soft circular glow texture for spark particles
  const glowTex = useMemo(() => {
    const size = 32
    const data = new Uint8Array(size * size * 4)
    const c    = (size - 1) / 2
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = Math.sqrt((x - c) ** 2 + (y - c) ** 2) / (size / 2)
        const a = Math.max(0, Math.exp(-d * d * 4))
        const i = (y * size + x) * 4
        data[i] = 255; data[i+1] = 255; data[i+2] = 255
        data[i+3] = Math.round(a * 255)
      }
    }
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
    tex.needsUpdate = true
    return tex
  }, [])

  // Mandala web: ring arcs + radial spokes + star cross-diagonals
  const webGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N_SEGS * 6), 3))
    geo.setAttribute("color",    new THREE.BufferAttribute(new Float32Array(N_SEGS * 6), 3))
    return geo
  }, [])

  const webMat = useMemo(() => new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: 1.0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }), [])

  // Hub spokes: center (0,0,0) → innermost ring (ARMS line segments)
  const hubGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(ARMS * 6), 3))
    geo.setAttribute("color",    new THREE.BufferAttribute(new Float32Array(ARMS * 6), 3))
    return geo
  }, [])

  const hubMat = useMemo(() => new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: 1.0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }), [])

  // Spark particles: orbiting each ring + flowing outward along spokes
  // Layout: [type, which, phase, speed]  type 0 = ring spark, type 1 = spoke pulse
  const sparkMeta = useMemo(() => {
    const m = new Float32Array(TOTAL_SPARKS * 4)
    let idx = 0
    for (let r = 0; r < RINGS; r++) {
      for (let s = 0; s < SPARKS_PER_RING; s++) {
        m[idx*4] = 0; m[idx*4+1] = r
        m[idx*4+2] = s / SPARKS_PER_RING
        m[idx*4+3] = 0.8 + Math.random() * 0.4
        idx++
      }
    }
    for (let a = 0; a < ARMS; a++) {
      for (let p = 0; p < PULSES_PER_ARM; p++) {
        m[idx*4] = 1; m[idx*4+1] = a
        m[idx*4+2] = p / PULSES_PER_ARM
        m[idx*4+3] = 0.5 + Math.random() * 0.5
        idx++
      }
    }
    return m
  }, [])

  const sparkGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(TOTAL_SPARKS * 3), 3))
    geo.setAttribute("color",    new THREE.BufferAttribute(new Float32Array(TOTAL_SPARKS * 3), 3))
    return geo
  }, [])

  const sparkMat = useMemo(() => new THREE.PointsMaterial({
    size: 0.12, map: glowTex, alphaTest: 0.01,
    transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, vertexColors: true, sizeAttenuation: true,
  }), [glowTex])

  useEffect(() => {
    return () => {
      webGeo.dispose(); webMat.dispose()
      hubGeo.dispose(); hubMat.dispose()
      sparkGeo.dispose(); sparkMat.dispose()
      glowTex.dispose()
    }
  }, [webGeo, webMat, hubGeo, hubMat, sparkGeo, sparkMat, glowTex])

  useFrame((_, delta) => {
    timeRef.current += delta
    const t      = timeRef.current
    const pal    = COLOR_PALETTES[colorMode]
    const dm     = dropMode ? 1.5 : 1
    const tc     = tmpColor.current
    const energy = Math.min(0.9, bassEnergy * dm + bassImpact * 0.3)

    if (bassImpact > 0.5) impactRef.current = Math.min(1, impactRef.current + bassImpact * 0.6)
    impactRef.current *= 0.88
    const bloom = impactRef.current

    // ── Compute node positions for each (ring, arm) ──────────────────────
    const np      = nodePosRef.current
    const baseSpd = visualStyle === 0 ? 0.22 : visualStyle === 1 ? 0.28 : 0.10

    for (let r = 0; r < RINGS; r++) {
      const radius = (r + 1) * RING_STEP * (1 + energy * 0.22 + bloom * 0.12)

      let ringAngle: number
      if (visualStyle === 2) {
        // Chaos: each ring snaps to a new random rotation every ~1.4 s
        const slowT  = Math.floor(t * 0.7) / 0.7
        const rh     = Math.sin(r * 127.1 + slowT * 311.7) * 43758.5453
        const rv     = rh - Math.floor(rh)
        ringAngle    = t * baseSpd * RING_MULT[r] * 0.2 + rv * Math.PI * 2
      } else {
        // Smooth base rotation driven by RING_MULT
        ringAngle = t * baseSpd * RING_MULT[r] * (1 + energy * 0.4)
        if (visualStyle === 1) {
          // Slight disorder: each ring gets its own secondary oscillation
          ringAngle += Math.sin(t * 0.35 * (r + 1) + r * 0.9) * 0.35
        }
      }

      for (let a = 0; a < ARMS; a++) {
        const angle = (a / ARMS) * Math.PI * 2 + ringAngle

        // Z-wobble gives the flat mandala 3D depth — outer rings wobble more
        let z: number
        if (visualStyle === 0) {
          z = Math.sin(angle * 2 + t * 0.7) * (r / RINGS) * (subBass * 0.4 + bloom * 0.1)
        } else if (visualStyle === 1) {
          z = Math.sin(angle * 3 + t * 1.1 + r * 0.5) * (r / RINGS) * (0.08 + mid * 0.35)
        } else {
          const sh = Math.sin(r * 311.7 + a * 74.83 + Math.floor(t * 0.7) * 127.1) * 43758.5453
          z = (sh - Math.floor(sh) - 0.5) * (r / RINGS) * 0.7 * (1 + energy * 0.4)
        }

        const ni   = (r * ARMS + a) * 3
        np[ni]     = Math.cos(angle) * radius
        np[ni + 1] = Math.sin(angle) * radius
        np[ni + 2] = z
      }
    }

    // ── Web lines ─────────────────────────────────────────────────────────
    {
      const wPos  = webGeo.attributes.position as THREE.BufferAttribute
      const wCol  = webGeo.attributes.color    as THREE.BufferAttribute
      const wpArr = wPos.array as Float32Array
      const wcArr = wCol.array as Float32Array
      const slowT = Math.floor(t * 1.0) / 1.0

      for (let si = 0; si < N_SEGS; si++) {
        const a = allSegs[si*2], b = allSegs[si*2+1]
        wpArr[si*6]   = np[a*3];   wpArr[si*6+1] = np[a*3+1]; wpArr[si*6+2] = np[a*3+2]
        wpArr[si*6+3] = np[b*3];   wpArr[si*6+4] = np[b*3+1]; wpArr[si*6+5] = np[b*3+2]

        // Color based on ring membership → different palette regions per ring
        const ra  = Math.floor(a / ARMS), rb = Math.floor(b / ARMS)
        const ctA = (ra / RINGS + t * 0.025) % 1
        const ctB = (rb / RINGS + t * 0.025) % 1

        let bri: number
        if (visualStyle === 2) {
          // Chaos: connections flicker in slow stuttered bursts
          const sh      = Math.sin(si * 127.1) * 43758.5453
          const sv      = sh - Math.floor(sh)
          const flicker = Math.sin(slowT * 3.0 + sv * 25) > 0.25 ? 1 : 0
          bri = flicker * (0.16 + energy * 0.38 + bloom * 0.2)
        } else {
          // Visual hierarchy: ring arcs brightest → spokes medium → cross-diags dim
          const isRing  = si < N_RING_SEGS
          const isSpoke = si < N_RING_SEGS + N_SPOKE_SEGS
          const base    = isRing ? 0.14 : isSpoke ? 0.07 : 0.035
          bri = base + energy * 0.26 + mid * 0.06 + bloom * 0.12
        }

        samplePalette(pal, ctA, tc)
        wcArr[si*6]   = tc.r * bri; wcArr[si*6+1] = tc.g * bri; wcArr[si*6+2] = tc.b * bri
        samplePalette(pal, ctB, tc)
        wcArr[si*6+3] = tc.r * bri; wcArr[si*6+4] = tc.g * bri; wcArr[si*6+5] = tc.b * bri
      }
      wPos.needsUpdate = true; wCol.needsUpdate = true
    }

    // ── Hub spokes (center → ring-0) ──────────────────────────────────────
    {
      const hPos  = hubGeo.attributes.position as THREE.BufferAttribute
      const hCol  = hubGeo.attributes.color    as THREE.BufferAttribute
      const hpArr = hPos.array as Float32Array
      const hcArr = hCol.array as Float32Array

      for (let a = 0; a < ARMS; a++) {
        const ni = a * 3
        // Center endpoint stays at origin
        hpArr[a*6] = 0; hpArr[a*6+1] = 0; hpArr[a*6+2] = 0
        // Outer endpoint follows ring-0 node position
        hpArr[a*6+3] = np[ni]; hpArr[a*6+4] = np[ni+1]; hpArr[a*6+5] = np[ni+2]

        const ct  = (a / ARMS + t * 0.035) % 1
        samplePalette(pal, ct, tc)
        const bri = 0.20 + energy * 0.35 + bloom * 0.2
        // Fade from dim center to bright ring-0 endpoint
        hcArr[a*6]   = tc.r * 0.1; hcArr[a*6+1] = tc.g * 0.1; hcArr[a*6+2] = tc.b * 0.1
        hcArr[a*6+3] = tc.r * bri; hcArr[a*6+4] = tc.g * bri; hcArr[a*6+5] = tc.b * bri
      }
      hPos.needsUpdate = true; hCol.needsUpdate = true
    }

    // ── Spark particles ───────────────────────────────────────────────────
    {
      const sPos  = sparkGeo.attributes.position as THREE.BufferAttribute
      const sCol  = sparkGeo.attributes.color    as THREE.BufferAttribute
      const spArr = sPos.array as Float32Array
      const scArr = sCol.array as Float32Array

      const sparkSpd = visualStyle === 2
        ? 0.10
        : 0.45 + energy * (visualStyle === 0 ? 0.8 : 1.5)

      for (let i = 0; i < TOTAL_SPARKS; i++) {
        const type  = sparkMeta[i*4]
        const which = sparkMeta[i*4+1]
        const spd   = sparkMeta[i*4+3]
        sparkMeta[i*4+2] = (sparkMeta[i*4+2] + delta * spd * sparkSpd) % 1
        const phase = sparkMeta[i*4+2]

        let sx = 0, sy = 0, sz = 0

        if (type === 0) {
          // Ring spark: orbits ring r, interpolating between adjacent arm nodes
          const r     = Math.floor(which)
          const armF  = phase * ARMS
          const armLo = Math.floor(armF) % ARMS
          const armHi = (armLo + 1) % ARMS
          const t2    = armF - Math.floor(armF)
          const nLo   = (r * ARMS + armLo) * 3
          const nHi   = (r * ARMS + armHi) * 3
          sx = np[nLo]   * (1 - t2) + np[nHi]   * t2
          sy = np[nLo+1] * (1 - t2) + np[nHi+1] * t2
          sz = np[nLo+2] * (1 - t2) + np[nHi+2] * t2
        } else {
          // Spoke pulse: flows from ring 0 → outermost ring along arm a
          const a   = Math.floor(which)
          const rF  = phase * (RINGS - 1)
          const rLo = Math.floor(rF)
          const rHi = Math.min(RINGS - 1, rLo + 1)
          const t2  = rF - rLo
          const nLo = (rLo * ARMS + a) * 3
          const nHi = (rHi * ARMS + a) * 3
          sx = np[nLo]   * (1 - t2) + np[nHi]   * t2
          sy = np[nLo+1] * (1 - t2) + np[nHi+1] * t2
          sz = np[nLo+2] * (1 - t2) + np[nHi+2] * t2
        }

        spArr[i*3] = sx; spArr[i*3+1] = sy; spArr[i*3+2] = sz

        // Ring sparks and spoke pulses get offset palette regions so they contrast
        const ct  = (type === 0 ? which / RINGS : which / ARMS + 0.5)
        samplePalette(pal, (ct + t * 0.04) % 1, tc)
        const bri = 0.45 + energy * 0.5 + high * 0.15 + bloom * 0.25
        scArr[i*3] = tc.r * bri; scArr[i*3+1] = tc.g * bri; scArr[i*3+2] = tc.b * bri
      }
      sPos.needsUpdate = true; sCol.needsUpdate = true
      sparkMat.size = 0.10 + energy * 0.10 + bloom * 0.06
    }

    // ── Group: tilt mandala slightly toward viewer + slow continuous spin ─
    if (groupRef.current) {
      // X tilt gives a "god's eye" perspective without going fully face-on
      groupRef.current.rotation.x = -0.30 + Math.sin(t * 0.12) * 0.04 + subBass * 0.03
      if (visualStyle !== 2) {
        groupRef.current.rotation.z += delta * 0.024 * (1 + energy * 0.25)
      }
    }
  })

  return (
    <group ref={groupRef}>
      <lineSegments
        geometry={webGeo}
        material={webMat}
      />
      <lineSegments
        geometry={hubGeo}
        material={hubMat}
      />
      <points geometry={sparkGeo} material={sparkMat} />
    </group>
  )
}

export default memo(WaveformScene)
