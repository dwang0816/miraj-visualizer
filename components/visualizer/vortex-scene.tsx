"use client"

import { useRef, useMemo, useEffect, memo } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { COLOR_PALETTES, samplePalette, type ColorMode } from "@/lib/color-palettes"

const RING_COUNT = 24
const RING_SEGMENTS = 48
const SPIRAL_LINES = 12
const SPIRAL_POINTS = 48
const ORBIT_SHAPES = 8
const VORTEX_HEIGHT = 12

interface VortexSceneProps {
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

function VortexScene({ bass, subBass, mid, high, bassEnergy, bassImpact, colorMode, dropMode, visualStyle }: VortexSceneProps) {
  const groupRef = useRef<THREE.Group>(null)
  const ringsRef = useRef<THREE.LineLoop[]>([])
  const spiralsRef = useRef<THREE.Line[]>([])
  const shapesRef = useRef<THREE.Mesh[]>([])
  const shockwaveRef = useRef<THREE.LineLoop>(null)
  const timeRef = useRef(0)
  const shockwaveAge = useRef(10)
  const tmpColor = useRef(new THREE.Color())
  const tmpWhite = useRef(new THREE.Color(0xffffff))

  // Stacked horizontal rings forming funnel/vortex
  const ringGeometries = useMemo(() => {
    return Array.from({ length: RING_COUNT }, () => {
      const points: number[] = []
      for (let s = 0; s <= RING_SEGMENTS; s++) {
        const angle = (s / RING_SEGMENTS) * Math.PI * 2
        points.push(Math.cos(angle), 0, Math.sin(angle))
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(points), 3))
      const colors = new Float32Array((RING_SEGMENTS + 1) * 3)
      geo.setAttribute("color", new THREE.BufferAttribute(colors, 3))
      return geo
    })
  }, [])

  const ringMaterials = useMemo(() => {
    return Array.from({ length: RING_COUNT }, () =>
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
      })
    )
  }, [])

  // Vertical spiral lines connecting rings
  const spiralGeometries = useMemo(() => {
    return Array.from({ length: SPIRAL_LINES }, () => {
      const positions = new Float32Array(SPIRAL_POINTS * 3)
      const colors = new Float32Array(SPIRAL_POINTS * 3)
      const geo = new THREE.BufferGeometry()
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3))
      geo.setAttribute("color", new THREE.BufferAttribute(colors, 3))
      return geo
    })
  }, [])

  const spiralMaterials = useMemo(() => {
    return Array.from({ length: SPIRAL_LINES }, () =>
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
      })
    )
  }, [])

  // Orbiting wireframe shapes
  const shapeGeometries = useMemo(() => {
    return Array.from({ length: ORBIT_SHAPES }, (_, i) => {
      if (i % 3 === 0) return new THREE.IcosahedronGeometry(0.25, 0)
      if (i % 3 === 1) return new THREE.OctahedronGeometry(0.2, 0)
      return new THREE.TetrahedronGeometry(0.2, 0)
    })
  }, [])

  const shapeMaterials = useMemo(() => {
    return Array.from({ length: ORBIT_SHAPES }, () =>
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        wireframe: true,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
      })
    )
  }, [])

  // Shockwave ring
  const shockwaveGeo = useMemo(() => {
    const points: number[] = []
    for (let i = 0; i <= 64; i++) {
      const angle = (i / 64) * Math.PI * 2
      points.push(Math.cos(angle), 0, Math.sin(angle))
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(points), 3))
    return geo
  }, [])

  const shockwaveMat = useMemo(
    () => new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending }),
    []
  )

  useEffect(() => {
    return () => {
      ringGeometries.forEach(g => g.dispose())
      ringMaterials.forEach(m => m.dispose())
      spiralGeometries.forEach(g => g.dispose())
      spiralMaterials.forEach(m => m.dispose())
      shapeGeometries.forEach(g => g.dispose())
      shapeMaterials.forEach(m => m.dispose())
      shockwaveGeo.dispose()
      shockwaveMat.dispose()
    }
  }, [ringGeometries, ringMaterials, spiralGeometries, spiralMaterials, shapeGeometries, shapeMaterials, shockwaveGeo, shockwaveMat])

  useFrame((_, delta) => {
    timeRef.current += delta
    const t = timeRef.current
    const palette = COLOR_PALETTES[colorMode]
    const dm = dropMode ? 1.5 : 1
    const tc = tmpColor.current

    // Shockwave on bass impact
    if (bassImpact > 0.5) shockwaveAge.current = 0
    shockwaveAge.current += delta * 2.5

    if (shockwaveRef.current) {
      const age = shockwaveAge.current
      if (age < 1.2) {
        const scale = 0.5 + age * 6
        shockwaveRef.current.scale.set(scale, 1, scale)
        shockwaveMat.opacity = Math.max(0, 0.4 * (1 - age / 1.2))
        shockwaveMat.color.lerpColors(palette.a, tmpWhite.current, 0.5)
      } else {
        shockwaveMat.opacity = 0
      }
    }

    const breathe = 1 + subBass * 0.15

    // Vortex radius: wide at bottom, narrow at top (tornado)
    const getRadius = (heightNorm: number) => {
      return (0.6 + (1 - heightNorm) * 3.5) * breathe
    }

    // Animate rings
    ringsRef.current.forEach((ring, i) => {
      if (!ring) return
      const heightNorm = i / (RING_COUNT - 1)
      const y = (heightNorm - 0.5) * VORTEX_HEIGHT
      const baseRadius = getRadius(heightNorm)
      const pos = ring.geometry.attributes.position as THREE.BufferAttribute
      const col = ring.geometry.attributes.color as THREE.BufferAttribute
      const pArr = pos.array as Float32Array
      const cArr = col.array as Float32Array

      const twist = t * (0.5 + heightNorm * 1.5) * (1 + bassEnergy * 0.3 * dm)

      for (let s = 0; s <= RING_SEGMENTS; s++) {
        const angle = (s / RING_SEGMENTS) * Math.PI * 2 + twist
        let r = baseRadius

        let chaosY = 0
        if (visualStyle === 0) {
          // Smooth: single clean sine ripple around each ring — gentle, hypnotic
          r += Math.sin(angle * 2 + t * 1.5 + i * 0.3) * (0.08 + bassEnergy * 0.28) * dm
        } else if (visualStyle === 1) {
          // Slight disorder: multi-freq ripples + each ring pulses at its own rate
          r += Math.sin(angle * 4 + t * 2.5 + i * 0.5) * (0.12 + bassEnergy * 0.42) * dm
          r += Math.cos(angle * 2 - t * 1.8 + i * 0.7) * mid * 0.22 * dm
          r += bassImpact * 0.45 * Math.sin(angle + t * 3 + i * 0.4)
        } else {
          // Chaos: ring segments freeze in corrupted positions, slowly stutter to next state
          const seg    = Math.floor(s / 4)
          const sh     = Math.sin(seg * 127.1 + i * 311.7) * 43758.5453
          const sv     = sh - Math.floor(sh)
          const slowT  = Math.floor(t * 1.0) / 1.0   // snaps ~every 1 s
          const isGlitch = Math.sin(slowT * 1.5 + sv * 22) > 0.3
          r += (isGlitch ? sv * bassEnergy * 2.8 * dm : sv * 0.15) + (sv > 0.6 ? bassImpact * 2.0 : 0)
          chaosY = Math.sin(slowT * 1.2 + i * 0.8 + sv * 10) * bassEnergy * 0.7 * dm
        }

        const h = y + Math.sin(angle * 2 + t * 1.5) * bassEnergy * 0.15 * dm + chaosY

        pArr[s * 3] = Math.cos(angle) * r
        pArr[s * 3 + 1] = h
        pArr[s * 3 + 2] = Math.sin(angle) * r

        const ct = (heightNorm + angle / (Math.PI * 2) * 0.2 + t * 0.04) % 1
        samplePalette(palette, ct, tc)
        const bri = 0.2 + (1 - heightNorm) * 0.3 + bassEnergy * 0.15
        cArr[s * 3] = tc.r * bri
        cArr[s * 3 + 1] = tc.g * bri
        cArr[s * 3 + 2] = tc.b * bri
      }

      pos.needsUpdate = true
      col.needsUpdate = true
      ringMaterials[i].opacity = 0.15 + (1 - heightNorm) * 0.25 + bassEnergy * 0.1
    })

    // Animate spiral lines
    spiralsRef.current.forEach((line, s) => {
      if (!line) return
      const baseAngle = (s / SPIRAL_LINES) * Math.PI * 2
      const pos = line.geometry.attributes.position as THREE.BufferAttribute
      const col = line.geometry.attributes.color as THREE.BufferAttribute
      const pArr = pos.array as Float32Array
      const cArr = col.array as Float32Array

      for (let p = 0; p < SPIRAL_POINTS; p++) {
        const heightNorm = p / (SPIRAL_POINTS - 1)
        const y = (heightNorm - 0.5) * VORTEX_HEIGHT
        const radius = getRadius(heightNorm) + Math.sin(heightNorm * Math.PI * 4 + t * 2) * bassEnergy * 0.15 * dm
        const twist = t * (0.5 + heightNorm * 1.5) * (1 + bassEnergy * 0.3 * dm)
        const angle = baseAngle + heightNorm * Math.PI * 3 + twist

        pArr[p * 3] = Math.cos(angle) * radius
        pArr[p * 3 + 1] = y + Math.sin(angle * 2 + t) * bassEnergy * 0.1
        pArr[p * 3 + 2] = Math.sin(angle) * radius

        const ct = (heightNorm + s / SPIRAL_LINES * 0.5 + t * 0.03) % 1
        samplePalette(palette, ct + 0.33, tc)
        const bri = 0.12 + bassEnergy * 0.1 + bassImpact * 0.05
        cArr[p * 3] = tc.r * bri
        cArr[p * 3 + 1] = tc.g * bri
        cArr[p * 3 + 2] = tc.b * bri
      }

      pos.needsUpdate = true
      col.needsUpdate = true
    })

    // Animate orbiting shapes
    shapesRef.current.forEach((mesh, i) => {
      if (!mesh) return
      const baseH = (i + 0.5) / ORBIT_SHAPES
      const heightNorm = (baseH + Math.sin(t * 0.3 + i) * 0.08) % 1
      const y = (heightNorm - 0.5) * VORTEX_HEIGHT
      const radius = getRadius(heightNorm) + 0.5
      const orbitAngle = t * (0.5 + i * 0.2) + i * (Math.PI * 2 / ORBIT_SHAPES)

      mesh.position.set(Math.cos(orbitAngle) * radius, y, Math.sin(orbitAngle) * radius)
      mesh.rotation.x = t + i
      mesh.rotation.y = t * 0.7 + i * 0.5
      const pulse = 1 + bassEnergy * 0.3 + bassImpact * 0.5
      mesh.scale.setScalar(pulse)

      const ct = (i / ORBIT_SHAPES + t * 0.05) % 1
      samplePalette(palette, ct, tc)
      shapeMaterials[i].color.copy(tc)
      shapeMaterials[i].opacity = 0.2 + bassEnergy * 0.2 + bassImpact * 0.1
    })

    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.15 * (1 + bassEnergy * 0.2 * dm)
    }
  })

  return (
    <group ref={groupRef}>
      {ringGeometries.map((geo, i) => (
        <lineLoop
          key={`ring-${i}`}
          ref={(el: any) => { if (el) ringsRef.current[i] = el }}
          geometry={geo}
          material={ringMaterials[i]}
        />
      ))}
      {spiralGeometries.map((geo, i) => (
        <line
          key={`spiral-${i}`}
          ref={(el: any) => { if (el) spiralsRef.current[i] = el }}
          // @ts-expect-error R3F line element accepts geometry
          geometry={geo}
          material={spiralMaterials[i]}
        />
      ))}
      {shapeGeometries.map((geo, i) => (
        <mesh
          key={`shape-${i}`}
          ref={(el: any) => { if (el) shapesRef.current[i] = el }}
          geometry={geo}
          material={shapeMaterials[i]}
        />
      ))}
      <lineLoop
        ref={(el: any) => { shockwaveRef.current = el }}
        geometry={shockwaveGeo}
        material={shockwaveMat}
      />
    </group>
  )
}

export default memo(VortexScene)
