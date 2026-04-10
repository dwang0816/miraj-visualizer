"use client"

import { useRef, useMemo, useEffect, memo } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { COLOR_PALETTES, samplePalette, type ColorMode } from "@/lib/color-palettes"

// ── Sacred geometry constants ─────────────────────────────────────────────────
const HEX_RINGS      = 3      // rings → 37 circles
const SEGS           = 80     // arc segments per circle
const BASE_R         = 1.0    // circle radius = hex spacing
const SCALE          = 0.88   // visual scale
const SQRT3_HALF     = Math.sqrt(3) / 2
const PARTICLE_COUNT = 400

// Breath rings — large expanding halos that sit behind the flower
const BREATH_COUNT   = 8
const BREATH_SPEED   = 0.22   // full expansion in ~4.5 seconds
const BREATH_MIN_R   = 0.15   // smallest breath ring radius
const BREATH_MAX_R   = 4.6    // largest (extends well beyond the flower)

// Pre-compute arc trig once
const ARC_COS = new Float32Array(SEGS)
const ARC_SIN = new Float32Array(SEGS)
for (let i = 0; i < SEGS; i++) {
  const a = (i / SEGS) * Math.PI * 2
  ARC_COS[i] = Math.cos(a)
  ARC_SIN[i] = Math.sin(a)
}

interface FlowerSceneProps {
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

function FlowerScene({ bass, subBass, mid, high, bassEnergy, bassImpact, colorMode, dropMode, visualStyle }: FlowerSceneProps) {
  const timeRef   = useRef(0)
  const impactRef = useRef(0)
  const tmpColor  = useRef(new THREE.Color())

  // ── Build Flower of Life hex lattice ─────────────────────────────────────
  const flowerData = useMemo(() => {
    const xs: number[] = [], ys: number[] = [], ringIdx: number[] = []
    for (let q = -HEX_RINGS; q <= HEX_RINGS; q++) {
      for (let s = -HEX_RINGS; s <= HEX_RINGS; s++) {
        const hexDist = (Math.abs(q) + Math.abs(s) + Math.abs(q + s)) / 2
        if (hexDist <= HEX_RINGS) {
          xs.push(BASE_R * SCALE * (q + s * 0.5))
          ys.push(BASE_R * SCALE * s * SQRT3_HALF)
          ringIdx.push(hexDist)
        }
      }
    }
    const N  = xs.length
    const cx = new Float32Array(xs)
    const cy = new Float32Array(ys)
    const ro = new Int32Array(ringIdx)

    // Sacred geometry connections (hex grid + Metatron's Cube + Fruit of Life)
    const pairs: number[] = []
    const rSqAdj = (BASE_R * SCALE * 1.05) ** 2

    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const dx = cx[i] - cx[j], dy = cy[i] - cy[j]
        if (dx * dx + dy * dy < rSqAdj) pairs.push(i, j)
      }
    }

    const seedOfLife = ringIdx.map((r, i) => r <= 1 ? i : -1).filter(i => i >= 0)
    for (let a = 0; a < seedOfLife.length; a++)
      for (let b = a + 1; b < seedOfLife.length; b++)
        pairs.push(seedOfLife[a], seedOfLife[b])

    const fruitOfLife = ringIdx.map((r, i) => r <= 2 ? i : -1).filter(i => i >= 0)
    for (let a = 0; a < fruitOfLife.length; a++) {
      for (let b = a + 1; b < fruitOfLife.length; b++) {
        const ia = fruitOfLife[a], ib = fruitOfLife[b]
        const alreadyAdj = (cx[ia]-cx[ib])**2 + (cy[ia]-cy[ib])**2 < rSqAdj
        const alreadySeed = ro[ia] <= 1 && ro[ib] <= 1
        if (!alreadyAdj && !alreadySeed) pairs.push(ia, ib)
      }
    }

    return { N, cx, cy, ro, sacredPairs: new Int32Array(pairs), N_SACRED: pairs.length / 2 }
  }, [])

  const { N, cx, cy, ro, sacredPairs, N_SACRED } = flowerData

  // ── Flower circle geometry ────────────────────────────────────────────────
  const circleGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * SEGS * 2 * 3), 3))
    geo.setAttribute("color",    new THREE.BufferAttribute(new Float32Array(N * SEGS * 2 * 3), 3))
    return geo
  }, [N])

  const circleMaterial = useMemo(() => new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }), [])

  // ── Sacred geometry lines ─────────────────────────────────────────────────
  const sacredGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N_SACRED * 2 * 3), 3))
    geo.setAttribute("color",    new THREE.BufferAttribute(new Float32Array(N_SACRED * 2 * 3), 3))
    return geo
  }, [N_SACRED])

  const sacredMaterial = useMemo(() => new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.35,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }), [])

  // ── Background breath rings ───────────────────────────────────────────────
  // BREATH_COUNT large expanding circles that slowly ripple outward like breathing
  const breathGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(BREATH_COUNT * SEGS * 2 * 3), 3))
    geo.setAttribute("color",    new THREE.BufferAttribute(new Float32Array(BREATH_COUNT * SEGS * 2 * 3), 3))
    return geo
  }, [])

  const breathMaterial = useMemo(() => new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: 1.0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }), [])

  // ── Particles ─────────────────────────────────────────────────────────────
  const particleMeta = useMemo(() => {
    const meta = new Float32Array(PARTICLE_COUNT * 4)
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      meta[i * 4]     = Math.floor(Math.random() * N)
      meta[i * 4 + 1] = Math.random() * Math.PI * 2
      meta[i * 4 + 2] = 0.4 + Math.random() * 1.2
      meta[i * 4 + 3] = Math.random() * Math.PI * 2
    }
    return meta
  }, [N])

  const particleGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(PARTICLE_COUNT * 3), 3))
    geo.setAttribute("color",    new THREE.BufferAttribute(new Float32Array(PARTICLE_COUNT * 3), 3))
    return geo
  }, [])

  // Soft gaussian circle texture so particles render as discs, not squares
  const particleTexture = useMemo(() => {
    const size = 32
    const data = new Uint8Array(size * size * 4)
    const c = (size - 1) / 2
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - c, dy = y - c
        const dist = Math.sqrt(dx * dx + dy * dy) / (size / 2)
        const alpha = Math.max(0, Math.exp(-dist * dist * 4))
        const i = (y * size + x) * 4
        data[i] = 255; data[i + 1] = 255; data[i + 2] = 255
        data[i + 3] = Math.round(alpha * 255)
      }
    }
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
    tex.needsUpdate = true
    return tex
  }, [])

  const particleMaterial = useMemo(() => new THREE.PointsMaterial({
    size: 0.09, map: particleTexture, alphaTest: 0.01,
    transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false,
    vertexColors: true, sizeAttenuation: true,
  }), [particleTexture])

  useEffect(() => {
    return () => {
      circleGeometry.dispose(); circleMaterial.dispose()
      sacredGeometry.dispose(); sacredMaterial.dispose()
      breathGeometry.dispose(); breathMaterial.dispose()
      particleGeometry.dispose(); particleMaterial.dispose()
      particleTexture.dispose()
    }
  }, [circleGeometry, circleMaterial, sacredGeometry, sacredMaterial,
      breathGeometry, breathMaterial, particleGeometry, particleMaterial, particleTexture])

  useFrame((_, delta) => {
    timeRef.current += delta
    const t        = timeRef.current
    const palette  = COLOR_PALETTES[colorMode]
    const dm       = dropMode ? 1.5 : 1
    const tc       = tmpColor.current
    const mainBass = Math.min(0.9, bassEnergy * dm + bassImpact * 0.3)

    // Impact bloom decay
    if (bassImpact > 0.5) impactRef.current = Math.min(1, impactRef.current + bassImpact * 0.7)
    impactRef.current *= 0.86
    const bloom = impactRef.current

    // ── Background breath rings ───────────────────────────────────────────
    // Each ring slowly expands from center outward, fading as it grows.
    // Offset in phase so there's always a visible ring — creates continuous breath.
    {
      const bPos  = breathGeometry.attributes.position as THREE.BufferAttribute
      const bCol  = breathGeometry.attributes.color    as THREE.BufferAttribute
      const bpArr = bPos.array as Float32Array
      const bcArr = bCol.array as Float32Array

      // Breath speed is slow and steady — subBass adds a subtle heartbeat nudge
      const breathRate = BREATH_SPEED + subBass * 0.06

      for (let bi = 0; bi < BREATH_COUNT; bi++) {
        const phase  = (t * breathRate + bi / BREATH_COUNT) % 1  // 0..1 looping
        const radius = BREATH_MIN_R + phase * (BREATH_MAX_R - BREATH_MIN_R)

        // Opacity peaks at mid-expansion then fades to nothing at the edges
        const opRaw  = Math.sin(phase * Math.PI)  // 0 → 1 → 0 over full cycle
        const opFade = opRaw * (0.055 + bassEnergy * 0.03 + bloom * 0.025)

        // Color shifts gently across palette as ring expands
        const ct = (phase * 0.5 + t * 0.015 + bi * 0.12) % 1
        samplePalette(palette, ct, tc)

        for (let si = 0; si < SEGS; si++) {
          const si2 = (si + 1) % SEGS
          for (let v = 0; v < 2; v++) {
            const k   = v === 0 ? si : si2
            const vIdx = (bi * SEGS * 2 + si * 2 + v) * 3
            bpArr[vIdx]     = radius * ARC_COS[k]
            bpArr[vIdx + 1] = radius * ARC_SIN[k]
            bpArr[vIdx + 2] = -0.3   // behind the flower
            bcArr[vIdx]     = tc.r * opFade
            bcArr[vIdx + 1] = tc.g * opFade
            bcArr[vIdx + 2] = tc.b * opFade
          }
        }
      }
      bPos.needsUpdate = true
      bCol.needsUpdate = true
    }

    // ── Update 37 Flower of Life circle arcs (flat, facing forward) ───────
    const cPos  = circleGeometry.attributes.position as THREE.BufferAttribute
    const cCol  = circleGeometry.attributes.color    as THREE.BufferAttribute
    const cpArr = cPos.array as Float32Array
    const ccArr = cCol.array as Float32Array

    for (let ci = 0; ci < N; ci++) {
      const baseCx = cx[ci]
      const baseCy = cy[ci]
      const r      = ro[ci]
      const rNorm  = r / HEX_RINGS   // 0 = center, 1 = outermost ring

      // ── Pulse wave radiating from center to outer rings ─────────────────
      // Each ring receives the ripple slightly later than the inner ring,
      // creating a physical "wave propagating outward" sensation.
      let radiusMult = 1.0
      let renderCx   = baseCx
      let renderCy   = baseCy

      if (visualStyle === 0) {
        // Smooth: single clean ripple propagates outward — one unified pulse wave
        const wavePhase = t * 1.5 - rNorm * Math.PI * 2.2
        const ripple    = Math.max(0, Math.sin(wavePhase)) * mainBass * 0.22
        radiusMult = 1 + ripple + bloom * 0.14 * (1 - rNorm * 0.5)

      } else if (visualStyle === 1) {
        // Slight disorder: two interfering waves at different speeds — moiré breathing
        const w1 = Math.max(0, Math.sin(t * 1.8 - rNorm * Math.PI * 2.2)) * mainBass * 0.22
        const w2 = Math.max(0, Math.sin(t * 3.4 - rNorm * Math.PI * 1.4 + Math.PI * 0.5)) * mid * 0.15
        radiusMult = 1 + w1 + w2 + bloom * 0.16 * (1 - rNorm * 0.4)

      } else {
        // Chaos: circles drift slowly to scattered positions, then snap to a new glitched layout
        const slowT    = Math.floor(t * 0.8) / 0.8   // snaps ~every 1.25 s
        const orbit    = ci * 0.618 * Math.PI * 2 + slowT * (0.15 + (ci % 3) * 0.08)
        const scatter2 = rNorm * mainBass * 1.8
        renderCx = baseCx + Math.cos(orbit) * scatter2
        renderCy = baseCy + Math.sin(orbit) * scatter2
        const chaosRipple = Math.sin(slowT * 2.5 + ci * 1.9) * mainBass + high * Math.cos(slowT * 3.0 + ci * 2.5) * 0.3
        radiusMult = 1 + Math.abs(chaosRipple) * 0.6 + bloom * 0.5
      }

      const R = BASE_R * SCALE * radiusMult

      for (let si = 0; si < SEGS; si++) {
        const si2 = (si + 1) % SEGS

        for (let v = 0; v < 2; v++) {
          const k    = v === 0 ? si : si2
          const vIdx = (ci * SEGS * 2 + si * 2 + v) * 3

          // Flat in XY — chaos mode scatters circle centers, stays in XY plane
          cpArr[vIdx]     = renderCx + R * ARC_COS[k]
          cpArr[vIdx + 1] = renderCy + R * ARC_SIN[k]
          cpArr[vIdx + 2] = 0

          // Color: cycles around each arc + by ring + slow time drift
          const arcT = k / SEGS
          const ct   = (arcT * 0.65 + rNorm * 0.25 + t * 0.04 + ci * 0.06) % 1
          samplePalette(palette, ct, tc)

          // Inner circles are brighter; pulse peak brightens the glow
          const pulseBright = (radiusMult - 1) * 0.6   // brighter during ripple peak
          const bri = Math.min(0.9, 0.28 + (1 - rNorm) * 0.38 + pulseBright + bloom * 0.12)
          ccArr[vIdx]     = tc.r * bri
          ccArr[vIdx + 1] = tc.g * bri
          ccArr[vIdx + 2] = tc.b * bri
        }
      }
    }

    cPos.needsUpdate = true
    cCol.needsUpdate = true
    circleMaterial.opacity = 0.7 + mainBass * 0.25 + bloom * 0.05

    // ── Sacred geometry lines (flat in XY, follow circle centers) ─────────
    {
      const sPos  = sacredGeometry.attributes.position as THREE.BufferAttribute
      const sCol  = sacredGeometry.attributes.color    as THREE.BufferAttribute
      const spArr = sPos.array as Float32Array
      const scArr = sCol.array as Float32Array

      for (let li = 0; li < N_SACRED; li++) {
        const iA = sacredPairs[li * 2]
        const iB = sacredPairs[li * 2 + 1]

        const bothSeed  = ro[iA] <= 1 && ro[iB] <= 1
        const bothFruit = ro[iA] <= 2 && ro[iB] <= 2

        spArr[li * 6]     = cx[iA]; spArr[li * 6 + 1] = cy[iA]; spArr[li * 6 + 2] = 0
        spArr[li * 6 + 3] = cx[iB]; spArr[li * 6 + 4] = cy[iB]; spArr[li * 6 + 5] = 0

        const ct = ((iA + iB) / (N * 2.5) + t * 0.02) % 1
        samplePalette(palette, ct + 0.33, tc)

        const bri = bothSeed  ? 0.2  + mainBass * 0.35 + bloom * 0.3
                  : bothFruit ? 0.09 + mainBass * 0.15 + bloom * 0.08
                  :             0.04 + mainBass * 0.07

        scArr[li * 6]     = tc.r * bri;    scArr[li * 6 + 1] = tc.g * bri;    scArr[li * 6 + 2] = tc.b * bri
        scArr[li * 6 + 3] = tc.r * bri * 0.3; scArr[li * 6 + 4] = tc.g * bri * 0.3; scArr[li * 6 + 5] = tc.b * bri * 0.3
      }

      sPos.needsUpdate = true
      sCol.needsUpdate = true
      sacredMaterial.opacity = 0.28 + mainBass * 0.22 + bloom * 0.2
    }

    // ── Particles — ride circle arcs in 2D ───────────────────────────────
    {
      const pPos  = particleGeometry.attributes.position as THREE.BufferAttribute
      const pCol  = particleGeometry.attributes.color    as THREE.BufferAttribute
      const ppArr = pPos.array as Float32Array
      const pcArr = pCol.array as Float32Array

      for (let pi = 0; pi < PARTICLE_COUNT; pi++) {
        const ci    = Math.floor(particleMeta[pi * 4]) % N
        const speed = particleMeta[pi * 4 + 2]
        const phase = particleMeta[pi * 4 + 3]

        particleMeta[pi * 4 + 1] += delta * speed * (0.4 + bassEnergy * 0.6)
        const a     = particleMeta[pi * 4 + 1]
        const rNorm = ro[ci] / HEX_RINGS
        const R     = BASE_R * SCALE * (1 + mainBass * 0.1)

        ppArr[pi * 3]     = cx[ci] + R * Math.cos(a)
        ppArr[pi * 3 + 1] = cy[ci] + R * Math.sin(a)
        ppArr[pi * 3 + 2] = Math.sin(t * 1.5 + phase) * 0.08  // subtle Z float

        const ct = ((a / (Math.PI * 2)) * 0.6 + rNorm * 0.25 + t * 0.04) % 1
        samplePalette(palette, (ct + 1) % 1, tc)
        const bri = Math.min(0.6, 0.15 + bassEnergy * 0.25 + high * 0.08 + bloom * 0.12)
        pcArr[pi * 3]     = tc.r * bri
        pcArr[pi * 3 + 1] = tc.g * bri
        pcArr[pi * 3 + 2] = tc.b * bri
      }

      pPos.needsUpdate = true
      pCol.needsUpdate = true
      particleMaterial.size = 0.07 + bassEnergy * 0.06 + bloom * 0.035
    }
  })

  return (
    // No rotation — Flower of Life always faces forward
    <group>
      {/* Breath rings: large expanding halos behind the flower */}
      <lineSegments
        geometry={breathGeometry}
        material={breathMaterial}
      />
      {/* Sacred geometry web */}
      <lineSegments
        // @ts-expect-error R3F lineSegments accepts geometry prop
        geometry={sacredGeometry}
        material={sacredMaterial}
      />
      {/* Flower of Life circle arcs */}
      <lineSegments
        // @ts-expect-error R3F lineSegments accepts geometry prop
        geometry={circleGeometry}
        material={circleMaterial}
      />
      {/* Particles riding the arcs */}
      <points
        geometry={particleGeometry}
        material={particleMaterial}
      />
    </group>
  )
}

export default memo(FlowerScene)
