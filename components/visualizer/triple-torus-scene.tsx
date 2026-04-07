"use client"

import { useRef, useMemo, useEffect, memo } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { COLOR_PALETTES, samplePalette, type ColorMode } from "@/lib/color-palettes"

const RADIAL_SEG = 56
const TUBULAR_SEG = 88

/** Outer and inner major radius + tube — same plane (XY), shared center */
const TORI_SPECS = [
  { R: 2.12, tube: 0.46 },
  { R: 1.02, tube: 0.34 },
] as const

const PARTICLE_COUNT = 1100
const STARFIELD_COUNT = 1600

/** Aurora ribbon curtains in the background */
const AURORA_COUNT = 8
const AURORA_SEGS = 64
const AURORA_WVERTS = 5 // edge · soft · center · soft · edge per cross-section
// Bell-curve brightness falloff across ribbon width (index = vi)
const AURORA_WFADE = [0, 0.45, 1.0, 0.45, 0] as const

interface AuroraSpec {
  xC: number; xS: number   // arc center X and half-span
  yC: number; yA: number   // vertical center and parabolic arc height
  z: number                // depth
  w: number                // ribbon width
  amp: number              // wave amplitude
  phase: number            // time phase offset
  speed: number            // wave speed multiplier
  pOff: number             // palette offset
}

const AURORA_SPECS: AuroraSpec[] = [
  // Broad top band — dominant, wide, slow
  { xC:  0.0, xS: 13.0, yC:  5.2, yA: 1.6, z: -11.0, w: 4.5, amp: 0.95, phase: 0.0, speed: 0.80, pOff: 0.05 },
  // High secondary band
  { xC: -0.5, xS:  9.5, yC:  8.0, yA: 0.9, z: -14.0, w: 3.0, amp: 0.60, phase: 1.5, speed: 1.15, pOff: 0.40 },
  // Mid-high — crosses through torus zone
  { xC:  1.0, xS: 12.0, yC:  2.5, yA: 1.3, z: -12.5, w: 3.8, amp: 0.80, phase: 2.8, speed: 0.90, pOff: 0.22 },
  // Center layer — behind the torus itself
  { xC: -1.0, xS:  9.0, yC: -0.4, yA: 0.7, z: -13.5, w: 3.2, amp: 0.60, phase: 4.5, speed: 1.05, pOff: 0.65 },
  // Mid-low
  { xC:  0.5, xS: 11.5, yC: -3.2, yA: 1.2, z: -10.5, w: 4.0, amp: 0.85, phase: 3.3, speed: 0.78, pOff: 0.80 },
  // Broad bottom band
  { xC: -0.5, xS: 12.5, yC: -6.0, yA: 1.6, z: -12.0, w: 3.5, amp: 0.75, phase: 1.0, speed: 0.92, pOff: 0.55 },
  // Close foreground accent — thinner, faster
  { xC:  2.0, xS:  8.0, yC:  3.8, yA: 1.0, z:  -9.5, w: 2.2, amp: 0.50, phase: 5.8, speed: 1.35, pOff: 0.15 },
  // Deep background layer
  { xC: -2.0, xS: 10.0, yC: -4.2, yA: 1.3, z: -15.5, w: 3.0, amp: 0.65, phase: 0.8, speed: 0.68, pOff: 0.90 },
]

/** Color dust — chromatic atmosphere particles around the scene */
const DUST_COUNT = 600


/** Expanding pulse rings — multi-axis, bass-driven */
const PULSE_COUNT = 8
const PULSE_SEGS = 80
const PULSE_MIN_R = 0.5
const PULSE_MAX_R = 9.5
const PULSE_CX = 0, PULSE_CY = 0, PULSE_CZ = -3.5

const PULSE_COS = new Float32Array(PULSE_SEGS)
const PULSE_SIN = new Float32Array(PULSE_SEGS)
for (let i = 0; i < PULSE_SEGS; i++) {
  const a = (i / PULSE_SEGS) * Math.PI * 2
  PULSE_COS[i] = Math.cos(a)
  PULSE_SIN[i] = Math.sin(a)
}

// Tilted ring tracks — varied orientations so rings fan out in 3-D
const PULSE_TRACKS = [
  { tiltX: 0.00,  tiltY: 0.00,  phase: 0.00,  speed: 0.18 },
  { tiltX: 0.45,  tiltY: 0.00,  phase: 0.18,  speed: 0.14 },
  { tiltX: 0.00,  tiltY: 0.52,  phase: 0.36,  speed: 0.22 },
  { tiltX: -0.38, tiltY: 0.28,  phase: 0.54,  speed: 0.16 },
  { tiltX: 0.30,  tiltY: -0.42, phase: 0.72,  speed: 0.20 },
  { tiltX: 0.58,  tiltY: 0.20,  phase: 0.12,  speed: 0.17 },
  { tiltX: -0.22, tiltY: 0.65,  phase: 0.48,  speed: 0.19 },
  { tiltX: 0.18,  tiltY: -0.50, phase: 0.84,  speed: 0.21 },
] as const

// Precomputed orthonormal basis (U, V) for each ring plane
const PULSE_BASES = PULSE_TRACKS.map(({ tiltX, tiltY }) => ({
  ux:  Math.cos(tiltY),
  uy:  0,
  uz: -Math.sin(tiltY),
  vx:  Math.sin(tiltX) * Math.sin(tiltY),
  vy:  Math.cos(tiltX),
  vz:  Math.sin(tiltX) * Math.cos(tiltY),
}))

interface TripleTorusSceneProps {
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

function fbm3(x: number, y: number, z: number, t: number): number {
  const st = t * 0.15
  let val = 0
  val += Math.sin(x * 0.35 + st) * Math.cos(z * 0.4 + st * 0.6) * Math.cos(y * 0.28) * 0.48
  val += Math.sin(x * 0.75 + y * 0.52 + st * 1.1) * 0.3
  val += Math.sin(y * 0.9 + st * 0.78) * Math.cos(z * 1.05 - st * 0.32) * 0.16
  return val
}

function buildTorusGeometry(R: number, tube: number) {
  const g = new THREE.TorusGeometry(R, tube, RADIAL_SEG, TUBULAR_SEG)
  g.computeVertexNormals()
  const posAttr = g.attributes.position as THREE.BufferAttribute
  const norAttr = g.attributes.normal as THREE.BufferAttribute
  const n = posAttr.count
  const bp = new Float32Array(n * 3)
  const bn = new Float32Array(n * 3)
  bp.set(posAttr.array as Float32Array)
  bn.set(norAttr.array as Float32Array)
  const colors = new Float32Array(n * 3)
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3))
  return { geometry: g, basePos: bp, baseNor: bn, vertCount: n }
}

function displacementH(
  bx: number,
  by: number,
  bz: number,
  t: number,
  scroll: number,
  visualStyle: number,
  bassEnergy: number,
  bassImpact: number,
  subBass: number,
  mid: number,
  dm: number
): number {
  const sx = bx * 0.85
  const sy = by * 0.85 - scroll * 0.12
  const sz = bz * 0.85
  let h = fbm3(sx, sy, sz, t)
  const half = 5.5

  if (visualStyle === 0) {
    const d = Math.sqrt(bx * bx + by * by + bz * bz)
    h += Math.sin(d * 1.05 - t * 2.2) * bassEnergy * 0.85 * dm
    h += Math.cos(bx * 0.55 + t * 1.35) * mid * 0.16
  } else if (visualStyle === 1) {
    h += Math.sin(bx * 1.35 - t * 3.8) * bassEnergy * 1.35 * dm
    h += Math.cos(bz * 1.75 + t * 2.4) * mid * 0.55 * dm
    if (bassImpact > 0.35) {
      const cellX = Math.floor((bx + half) / 2.2)
      const cellZ = Math.floor((bz + half) / 2.2)
      const cellHash = Math.sin(cellX * 71.1 + cellZ * 191.7) * 43758.5453
      const cellVal = cellHash - Math.floor(cellHash)
      if (cellVal > 0.78) h += bassImpact * 1.9 * dm
    }
  } else {
    const cellX = Math.floor((bx + half) / 0.95)
    const cellZ = Math.floor((bz + half) / 0.95)
    const cellHash = Math.sin(cellX * 127.1 + cellZ * 311.7) * 43758.5453
    const cellVal = cellHash - Math.floor(cellHash)
    const slowT = Math.floor(t * 0.8) / 0.8
    const spike =
      (cellVal > 0.5 ? 1 : 0) * bassEnergy * dm * 3.2 * Math.abs(Math.sin(slowT * 1.15 + cellVal * 14))
    h += spike + Math.sin(slowT * 0.95 + cellVal * 19) * bassEnergy * dm * 1.25
    h += (cellVal > 0.75 ? 1 : 0) * bassImpact * 4.2 * dm + subBass * Math.sin(bx * 0.75 + slowT * 0.55) * 0.85
  }
  return h
}

function updateTorusVertices(
  geometry: THREE.BufferGeometry,
  basePos: Float32Array,
  baseNor: Float32Array,
  vertCount: number,
  t: number,
  scroll: number,
  palette: (typeof COLOR_PALETTES)[ColorMode],
  visualStyle: number,
  bassEnergy: number,
  bassImpact: number,
  subBass: number,
  mid: number,
  dm: number,
  tmpColor: THREE.Color
) {
  const pos = geometry.attributes.position as THREE.BufferAttribute
  const col = geometry.attributes.color as THREE.BufferAttribute
  const pArr = pos.array as Float32Array
  const cArr = col.array as Float32Array

  for (let i = 0; i < vertCount; i++) {
    const bx = basePos[i * 3]
    const by = basePos[i * 3 + 1]
    const bz = basePos[i * 3 + 2]
    const nx = baseNor[i * 3]
    const ny = baseNor[i * 3 + 1]
    const nz = baseNor[i * 3 + 2]

    const h = displacementH(bx, by, bz, t, scroll, visualStyle, bassEnergy, bassImpact, subBass, mid, dm)
    const disp = h * 0.2 * dm
    pArr[i * 3] = bx + nx * disp
    pArr[i * 3 + 1] = by + ny * disp
    pArr[i * 3 + 2] = bz + nz * disp

    const hNorm = (h + 1.8) / 3.6
    const ct = (hNorm * 0.6 + t * 0.048) % 1
    samplePalette(palette, ct, tmpColor)
    const bri = 0.28 + Math.abs(hNorm) * 0.65
    const peakGlow = Math.max(0, h - 1.1) * 0.22
    cArr[i * 3] = tmpColor.r * bri + peakGlow
    cArr[i * 3 + 1] = tmpColor.g * bri + peakGlow * 0.48
    cArr[i * 3 + 2] = tmpColor.b * bri + peakGlow * 0.28
  }

  pos.needsUpdate = true
  col.needsUpdate = true
}

function particleDisplacementH(
  bx: number,
  by: number,
  bz: number,
  t: number,
  scroll: number,
  visualStyle: number,
  bassEnergy: number,
  dm: number
): number {
  const sx = bx * 0.85
  const sy = by * 0.85 - scroll * 0.12
  const sz = bz * 0.85
  let h = fbm3(sx, sy, sz, t)
  if (visualStyle === 0) {
    const d = Math.sqrt(bx * bx + by * by + bz * bz)
    h += Math.sin(d * 1.05 - t * 2.2) * bassEnergy * 0.85 * dm
  } else if (visualStyle === 1) {
    h += Math.sin(bx * 1.35 - t * 3.8) * bassEnergy * 1.35 * dm
  } else {
    const cellX = Math.floor((bx + 5.5) / 0.95)
    const cellZ = Math.floor((bz + 5.5) / 0.95)
    const cellHash = Math.sin(cellX * 127.1 + cellZ * 311.7) * 43758.5453
    const cellVal = cellHash - Math.floor(cellHash)
    const slowT = Math.floor(t * 0.8) / 0.8
    h += (cellVal > 0.5 ? 1 : 0) * bassEnergy * dm * 2.5 * Math.abs(Math.sin(slowT * 1.15 + cellVal * 14))
  }
  return h
}

function TripleTorusScene({
  bass,
  subBass,
  mid,
  high,
  bassEnergy,
  bassImpact,
  colorMode,
  dropMode,
  visualStyle,
}: TripleTorusSceneProps) {
  const outerMeshRef = useRef<THREE.Mesh>(null)
  const innerMeshRef = useRef<THREE.Mesh>(null)
  const particlesRef = useRef<THREE.Points>(null)
  const motionRef = useRef<THREE.Group>(null)
  const spinRef = useRef<THREE.Group>(null)
  const innerSpinRef = useRef<THREE.Group>(null)
  const backdropRef = useRef<THREE.Mesh>(null)
  const starfieldRef = useRef<THREE.Points>(null)
  const timeRef = useRef(0)
  const scrollRef = useRef(0)
  const tmpColor = useRef(new THREE.Color())
  const backdropTint = useRef(new THREE.Color())

  const { outer, inner, totalVertCount, particleBasePos, particleBaseNor } = useMemo(() => {
    const o = buildTorusGeometry(TORI_SPECS[0].R, TORI_SPECS[0].tube)
    const i = buildTorusGeometry(TORI_SPECS[1].R, TORI_SPECS[1].tube)
    const total = o.vertCount + i.vertCount
    const pbp = new Float32Array(total * 3)
    const pbn = new Float32Array(total * 3)
    pbp.set(o.basePos, 0)
    pbp.set(i.basePos, o.vertCount * 3)
    pbn.set(o.baseNor, 0)
    pbn.set(i.baseNor, o.vertCount * 3)
    return {
      outer: o,
      inner: i,
      totalVertCount: total,
      particleBasePos: pbp,
      particleBaseNor: pbn,
    }
  }, [])

  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        wireframe: true,
        transparent: true,
        opacity: 0.82,
        blending: THREE.AdditiveBlending,
      }),
    []
  )

  const particleMeta = useMemo(() => {
    const m = new Float32Array(PARTICLE_COUNT * 4)
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      m[i * 4] = Math.floor(Math.random() * totalVertCount)
      m[i * 4 + 1] = Math.random() * Math.PI * 2
      m[i * 4 + 2] = 0.35 + Math.random() * 1.4
      m[i * 4 + 3] = 0.12 + Math.random() * 0.35
    }
    return m
  }, [totalVertCount])

  const particleGeometry = useMemo(() => {
    const pos = new Float32Array(PARTICLE_COUNT * 3)
    const col = new Float32Array(PARTICLE_COUNT * 3)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3))
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3))
    return geo
  }, [])

  const particleMaterial = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 0.055,
        transparent: true,
        opacity: 0.34,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        vertexColors: true,
        sizeAttenuation: true,
      }),
    []
  )

  const auroraGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const vertsPerRibbon = (AURORA_SEGS + 1) * AURORA_WVERTS
    const totalVerts = AURORA_COUNT * vertsPerRibbon
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(totalVerts * 3), 3))
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(totalVerts * 3), 3))
    // (AURORA_WVERTS-1) panels × 2 triangles × 3 verts per segment
    const PANELS = AURORA_WVERTS - 1
    const indices = new Uint32Array(AURORA_COUNT * AURORA_SEGS * PANELS * 6)
    let idx = 0
    for (let ri = 0; ri < AURORA_COUNT; ri++) {
      const base = ri * vertsPerRibbon
      for (let si = 0; si < AURORA_SEGS; si++) {
        for (let p = 0; p < PANELS; p++) {
          const va = base + si * AURORA_WVERTS + p
          const vb = base + si * AURORA_WVERTS + p + 1
          const vc = base + (si + 1) * AURORA_WVERTS + p
          const vd = base + (si + 1) * AURORA_WVERTS + p + 1
          indices[idx++] = va; indices[idx++] = vb; indices[idx++] = vc
          indices[idx++] = vb; indices[idx++] = vd; indices[idx++] = vc
        }
      }
    }
    geo.setIndex(new THREE.BufferAttribute(indices, 1))
    return geo
  }, [])

  const auroraMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    []
  )

  const pulseGeometry = useMemo(() => {
    const n = PULSE_COUNT * PULSE_SEGS * 2
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3))
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3), 3))
    return geo
  }, [])

  const pulseMaterial = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    []
  )

  const backdropMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        color: new THREE.Color(0x050308),
      }),
    []
  )

  // Per-particle palette phase offset (precomputed so useFrame stays cheap)
  const dustPhases = useMemo(() => {
    const phases = new Float32Array(DUST_COUNT)
    for (let i = 0; i < DUST_COUNT; i++) {
      const h = Math.sin(i * 127.1) * 43758.5453
      phases[i] = h - Math.floor(h)
    }
    return phases
  }, [])

  const { dustGeo, dustMat } = useMemo(() => {
    const pos = new Float32Array(DUST_COUNT * 3)
    const col = new Float32Array(DUST_COUNT * 3)
    for (let i = 0; i < DUST_COUNT; i++) {
      // Sphere shell r = 4–15, biased toward the back half of the scene
      const theta = Math.random() * Math.PI * 2
      const phi   = Math.acos(2 * Math.random() - 1)
      const r     = 4 + Math.random() * 11
      pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta)
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      pos[i * 3 + 2] = r * Math.cos(phi) - 9
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3))
    geo.setAttribute("color",    new THREE.BufferAttribute(col, 3))
    const mat = new THREE.PointsMaterial({
      size: 0.08,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true,
      sizeAttenuation: true,
    })
    return { dustGeo: geo, dustMat: mat }
  }, [])

  const { starfieldGeometry, starfieldMaterial } = useMemo(() => {
    const pos = new Float32Array(STARFIELD_COUNT * 3)
    const col = new Float32Array(STARFIELD_COUNT * 3)
    const tmp = new THREE.Color()
    const palette = COLOR_PALETTES[colorMode]
    for (let i = 0; i < STARFIELD_COUNT; i++) {
      const u = Math.random()
      const v = Math.random()
      const theta = u * Math.PI * 2
      const phi = Math.acos(2 * v - 1)
      const r = 20 + Math.random() * 24
      const sp = Math.sin(phi)
      pos[i * 3] = r * sp * Math.cos(theta)
      pos[i * 3 + 1] = r * sp * Math.sin(theta)
      pos[i * 3 + 2] = r * Math.cos(phi) - 2.5
      const hash = Math.sin(i * 12.9898 + i * i * 0.001) * 43758.5453
      const hue = hash - Math.floor(hash)
      samplePalette(palette, hue * 0.85 + 0.08, tmp)
      const dim = 0.07 + hue * 0.14
      col[i * 3] = tmp.r * dim
      col[i * 3 + 1] = tmp.g * dim
      col[i * 3 + 2] = tmp.b * dim
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3))
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3))
    const mat = new THREE.PointsMaterial({
      size: 0.038,
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true,
      sizeAttenuation: true,
    })
    return { starfieldGeometry: geo, starfieldMaterial: mat }
  }, [colorMode])

  useEffect(() => {
    return () => {
      outer.geometry.dispose()
      inner.geometry.dispose()
      material.dispose()
      particleGeometry.dispose()
      particleMaterial.dispose()
      auroraGeometry.dispose()
      auroraMaterial.dispose()
      pulseGeometry.dispose()
      pulseMaterial.dispose()
      dustGeo.dispose()
      dustMat.dispose()
      backdropMaterial.dispose()
    }
  }, [
    outer.geometry,
    inner.geometry,
    material,
    particleGeometry,
    particleMaterial,
    auroraGeometry,
    auroraMaterial,
    pulseGeometry,
    pulseMaterial,
    dustGeo,
    dustMat,
    backdropMaterial,
  ])

  useEffect(() => {
    return () => {
      starfieldGeometry.dispose()
      starfieldMaterial.dispose()
    }
  }, [starfieldGeometry, starfieldMaterial])

  useFrame((_, delta) => {
    timeRef.current = (timeRef.current + delta) % (Math.PI * 200)
    const t = timeRef.current
    const palette = COLOR_PALETTES[colorMode]
    const dm = dropMode ? 1.5 : 1
    const tc = tmpColor.current

    // Wrap scroll to prevent floating-point precision loss after long sessions
    scrollRef.current = (scrollRef.current + delta * (0.65 + subBass * 1.6) * dm) % (Math.PI * 200)

    {
      const mesh = backdropRef.current
      const mat = mesh?.material as THREE.MeshBasicMaterial | undefined
      if (mesh && mat) {
        const verySlow = 0.5 + 0.5 * Math.sin(t * 0.58)
        const slowPulse = 0.5 + 0.5 * Math.sin(t * (1.35 + subBass * 0.28))
        const beatPulse = bassEnergy * 0.34 + bassImpact * 0.24
        const mix = 0.1 + verySlow * 0.14 + slowPulse * 0.16 + beatPulse
        samplePalette(palette, (t * 0.022 + bassEnergy * 0.12) % 1, backdropTint.current)
        mat.color.setRGB(
          0.028 + backdropTint.current.r * mix,
          0.02 + backdropTint.current.g * mix * 0.92,
          0.032 + backdropTint.current.b * mix * 0.98
        )
        const s = 1 + 0.022 * Math.sin(t * 0.48) + bassEnergy * 0.014 + bassImpact * 0.01
        mesh.scale.setScalar(s)
      }

      // ── Aurora ribbon curtains ──────────────────────────────────────
      const aPos = auroraGeometry.attributes.position as THREE.BufferAttribute
      const aCol = auroraGeometry.attributes.color as THREE.BufferAttribute
      const apArr = aPos.array as Float32Array
      const acArr = aCol.array as Float32Array
      const vertsPerRibbon = (AURORA_SEGS + 1) * AURORA_WVERTS

      for (let ri = 0; ri < AURORA_COUNT; ri++) {
        const sp = AURORA_SPECS[ri]
        const ribbonBase = ri * vertsPerRibbon
        const spd = t * sp.speed
        const ph = sp.phase

        for (let si = 0; si <= AURORA_SEGS; si++) {
          const u = si / AURORA_SEGS
          const tu = 2 * u - 1 // -1 → 1

          // Spine: parabolic arc across X
          const xSpine = sp.xC + tu * sp.xS
          const yArc = sp.yC + sp.yA * (1 - tu * tu)

          // 3-harmonic traveling wave for organic curtain motion
          const wave =
            sp.amp * Math.sin(u * Math.PI * 4.0 + spd * 0.55 + ph) +
            sp.amp * 0.40 * Math.sin(u * Math.PI * 7.5 + spd * 0.90 + ph * 1.6) +
            sp.amp * 0.15 * Math.sin(u * Math.PI * 13.0 + spd * 1.50 + ph * 2.4)

          // Wave slope → subtle X lean on width edges
          const dWave =
            sp.amp * Math.PI * 4.0 * Math.cos(u * Math.PI * 4.0 + spd * 0.55 + ph) +
            sp.amp * 0.40 * Math.PI * 7.5 * Math.cos(u * Math.PI * 7.5 + spd * 0.90 + ph * 1.6) +
            sp.amp * 0.15 * Math.PI * 13.0 * Math.cos(u * Math.PI * 13.0 + spd * 1.50 + ph * 2.4)

          const ySpine = yArc + wave
          const lean = dWave * 0.035
          const halfW = sp.w * 0.5

          // Color: fade at ribbon ends, brighter for stage
          const edgeFade = Math.sin(u * Math.PI)
          const ct = (u * 0.45 + t * 0.015 + sp.pOff) % 1
          samplePalette(palette, ct, tc)
          const baseAlpha = edgeFade * (0.20 + bassEnergy * 0.06) * dm

          for (let vi = 0; vi < AURORA_WVERTS; vi++) {
            const vBase = (ribbonBase + si * AURORA_WVERTS + vi) * 3
            // tw: -1 (bottom edge) → 0 (center) → +1 (top edge)
            const tw = (vi / (AURORA_WVERTS - 1)) * 2 - 1
            const yOff = tw * halfW
            // Edges lean in X and curl in Z following the wave
            const xOff = lean * tw * halfW * 0.45
            const zOff = wave * 0.20 * Math.abs(tw)

            apArr[vBase]     = xSpine + xOff
            apArr[vBase + 1] = ySpine + yOff
            apArr[vBase + 2] = sp.z + zOff

            // Bell-curve falloff: center bright, edges transparent
            const alpha = baseAlpha * AURORA_WFADE[vi]
            acArr[vBase]     = tc.r * alpha
            acArr[vBase + 1] = tc.g * alpha
            acArr[vBase + 2] = tc.b * alpha
          }
        }
      }
      aPos.needsUpdate = true
      aCol.needsUpdate = true
    }

    // ── Pulse rings — multi-axis, expanding from torus center ─────
    {
      const rPos = pulseGeometry.attributes.position as THREE.BufferAttribute
      const rCol = pulseGeometry.attributes.color as THREE.BufferAttribute
      const rpArr = rPos.array as Float32Array
      const rcArr = rCol.array as Float32Array

      for (let ri = 0; ri < PULSE_COUNT; ri++) {
        const track = PULSE_TRACKS[ri]
        const base  = PULSE_BASES[ri]

        const speed  = track.speed * (1 + bassEnergy * 0.35 + bassImpact * 0.25) * dm
        const phase  = (t * speed + track.phase) % 1
        const radius = PULSE_MIN_R + phase * (PULSE_MAX_R - PULSE_MIN_R)

        // Smooth sine envelope — slow fade in, slow fade out
        const opRaw    = Math.sin(phase * Math.PI)
        const brightness = opRaw * (0.16 + bassEnergy * 0.07 + bassImpact * 0.08) * dm

        const ct = (phase * 0.6 + t * 0.018 + ri * 0.11) % 1
        samplePalette(palette, ct, tc)

        for (let si = 0; si < PULSE_SEGS; si++) {
          const si2 = (si + 1) % PULSE_SEGS
          for (let v = 0; v < 2; v++) {
            const k    = v === 0 ? si : si2
            const co   = PULSE_COS[k]
            const sn   = PULSE_SIN[k]
            const vIdx = (ri * PULSE_SEGS * 2 + si * 2 + v) * 3

            rpArr[vIdx]     = PULSE_CX + radius * (co * base.ux + sn * base.vx)
            rpArr[vIdx + 1] = PULSE_CY + radius * (co * base.uy + sn * base.vy)
            rpArr[vIdx + 2] = PULSE_CZ + radius * (co * base.uz + sn * base.vz)

            rcArr[vIdx]     = tc.r * brightness
            rcArr[vIdx + 1] = tc.g * brightness
            rcArr[vIdx + 2] = tc.b * brightness
          }
        }
      }
      rPos.needsUpdate = true
      rCol.needsUpdate = true
    }

    // ── Color dust — chromatic atmosphere ─────────────────────────
    {
      const dCol = dustGeo.attributes.color as THREE.BufferAttribute
      const dcArr = dCol.array as Float32Array
      const bri = 0.032 + bassEnergy * 0.015
      for (let i = 0; i < DUST_COUNT; i++) {
        const ct = (dustPhases[i] + t * 0.018) % 1
        samplePalette(palette, ct, tc)
        dcArr[i * 3]     = tc.r * bri
        dcArr[i * 3 + 1] = tc.g * bri
        dcArr[i * 3 + 2] = tc.b * bri
      }
      dCol.needsUpdate = true
    }

    if (motionRef.current) {
      const w = 1 + bassEnergy * 0.22 * dm
      motionRef.current.position.x =
        Math.sin(t * 0.48 * w) * 0.22 + Math.cos(t * 0.29 + 0.7) * 0.08 * mid * dm + bassImpact * 0.045
      motionRef.current.position.y =
        Math.sin(t * 0.4 * w + 1.1) * 0.16 + subBass * 0.1 * Math.sin(t * 0.82) * dm
      motionRef.current.position.z =
        Math.cos(t * 0.35 * w) * 0.18 + Math.sin(t * 0.24) * 0.08 + high * 0.05 * dm
    }

    if (spinRef.current) {
      const spinSpeed = 0.88 + bassEnergy * 0.58 * dm + mid * 0.24
      spinRef.current.rotation.y += delta * spinSpeed
      spinRef.current.rotation.x += delta * (0.32 + subBass * 0.38 * dm)
      spinRef.current.rotation.z += delta * (0.2 + high * 0.22 * dm)
    }

    if (innerSpinRef.current) {
      const innerYaw = 1.05 + bassEnergy * 0.72 * dm + mid * 0.31
      innerSpinRef.current.rotation.y += delta * innerYaw
    }

    const scroll = scrollRef.current

    if (outerMeshRef.current) {
      updateTorusVertices(
        outer.geometry,
        outer.basePos,
        outer.baseNor,
        outer.vertCount,
        t,
        scroll,
        palette,
        visualStyle,
        bassEnergy,
        bassImpact,
        subBass,
        mid,
        dm,
        tc
      )
    }

    if (innerMeshRef.current) {
      updateTorusVertices(
        inner.geometry,
        inner.basePos,
        inner.baseNor,
        inner.vertCount,
        t,
        scroll,
        palette,
        visualStyle,
        bassEnergy,
        bassImpact,
        subBass,
        mid,
        dm,
        tc
      )
    }

    if (particlesRef.current) {
      const pPos = particlesRef.current.geometry.attributes.position as THREE.BufferAttribute
      const pCol = particlesRef.current.geometry.attributes.color as THREE.BufferAttribute
      const ppArr = pPos.array as Float32Array
      const pcArr = pCol.array as Float32Array

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const vIdx = Math.min(totalVertCount - 1, Math.max(0, Math.floor(particleMeta[i * 4])))
        const phase = particleMeta[i * 4 + 1]
        const speed = particleMeta[i * 4 + 2]
        const shell = particleMeta[i * 4 + 3]

        const bx = particleBasePos[vIdx * 3]
        const by = particleBasePos[vIdx * 3 + 1]
        const bz = particleBasePos[vIdx * 3 + 2]
        const nx = particleBaseNor[vIdx * 3]
        const ny = particleBaseNor[vIdx * 3 + 1]
        const nz = particleBaseNor[vIdx * 3 + 2]

        const h = particleDisplacementH(bx, by, bz, t, scroll, visualStyle, bassEnergy, dm)
        const disp = h * 0.2 * dm

        const ox = bx + nx * disp
        const oy = by + ny * disp
        const oz = bz + nz * disp

        const lift =
          shell + Math.sin(t * speed * 0.45 + phase) * 0.5 + bassEnergy * 1.05 * dm + bassImpact * 0.32
        ppArr[i * 3] = ox + nx * lift + Math.sin(t * 0.18 + phase) * 0.32
        ppArr[i * 3 + 1] = oy + ny * lift + Math.sin(t * speed + phase) * 0.38
        ppArr[i * 3 + 2] = oz + nz * lift + Math.cos(t * 0.14 + phase) * 0.32

        const ct = (phase / (Math.PI * 2) + t * 0.042) % 1
        samplePalette(palette, ct + 0.45, tc)
        const bri = Math.min(0.42, 0.1 + bassEnergy * 0.2 + high * 0.14)
        pcArr[i * 3] = tc.r * bri
        pcArr[i * 3 + 1] = tc.g * bri
        pcArr[i * 3 + 2] = tc.b * bri
      }
      pPos.needsUpdate = true
      pCol.needsUpdate = true
      particleMaterial.size = 0.038 + bassEnergy * 0.038 + bassImpact * 0.028
    }
  })

  return (
    <group>
      <mesh ref={backdropRef} position={[0, 0, -1]} renderOrder={-20} material={backdropMaterial}>
        <sphereGeometry args={[46, 40, 28]} />
      </mesh>
      <points
        ref={starfieldRef}
        geometry={starfieldGeometry}
        material={starfieldMaterial}
        position={[0, 0, -1.2]}
        renderOrder={-19}
      />
      <mesh
        geometry={auroraGeometry}
        material={auroraMaterial}
        renderOrder={-15}
      />
      <points
        geometry={dustGeo}
        material={dustMat}
        renderOrder={-12}
      />
      <lineSegments
        geometry={pulseGeometry}
        material={pulseMaterial}
        renderOrder={-10}
      />
      <group position={[0, 0, -3.5]} rotation={[0.18, 0, 0]}>
        <group ref={motionRef}>
          <group ref={spinRef}>
            <mesh ref={outerMeshRef} geometry={outer.geometry} material={material} />
            <points ref={particlesRef} geometry={particleGeometry} material={particleMaterial} />
          </group>
          <group ref={innerSpinRef}>
            <mesh ref={innerMeshRef} geometry={inner.geometry} material={material} />
          </group>
        </group>
      </group>
    </group>
  )
}

export default memo(TripleTorusScene)
