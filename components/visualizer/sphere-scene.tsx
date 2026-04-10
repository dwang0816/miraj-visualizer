"use client"

import { useRef, useMemo, useEffect, memo } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { COLOR_PALETTES, samplePalette, type ColorMode } from "@/lib/color-palettes"

const POINT_COUNT = 4000
const BASE_RADIUS = 2.5
const ORBIT_COUNT = 3
const TRAIL_COUNT = 500

interface SphereSceneProps {
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

function SphereScene({ bass, subBass, mid, high, bassEnergy, bassImpact, colorMode, dropMode, visualStyle }: SphereSceneProps) {
  const groupRef = useRef<THREE.Group>(null)
  const pointsRef = useRef<THREE.Points>(null)
  const orbitRefs = useRef<THREE.Line[]>([])
  const trailRef = useRef<THREE.Points>(null)
  const timeRef = useRef(0)
  const scatterRef = useRef(0)
  const tmpColor = useRef(new THREE.Color())

  const { positions, originalPositions } = useMemo(() => {
    const pos = new Float32Array(POINT_COUNT * 3)
    const orig = new Float32Array(POINT_COUNT * 3)
    for (let i = 0; i < POINT_COUNT; i++) {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / POINT_COUNT)
      const theta = Math.PI * (1 + Math.sqrt(5)) * i
      const x = Math.sin(phi) * Math.cos(theta) * BASE_RADIUS
      const y = Math.sin(phi) * Math.sin(theta) * BASE_RADIUS
      const z = Math.cos(phi) * BASE_RADIUS
      pos[i * 3] = x
      pos[i * 3 + 1] = y
      pos[i * 3 + 2] = z
      orig[i * 3] = x
      orig[i * 3 + 1] = y
      orig[i * 3 + 2] = z
    }
    return { positions: pos, originalPositions: orig }
  }, [])

  const pointsGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3))
    // Per-particle vertex colors
    const colors = new Float32Array(POINT_COUNT * 3)
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3))
    return geo
  }, [positions])

  const pointsMaterial = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 0.03,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        vertexColors: true,
      }),
    []
  )

  // Orbit ring geometries
  const orbitGeometries = useMemo(() => {
    return Array.from({ length: ORBIT_COUNT }, () => {
      const segments = 128
      const points: THREE.Vector3[] = []
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2
        points.push(new THREE.Vector3(Math.cos(angle) * BASE_RADIUS * 1.3, Math.sin(angle) * BASE_RADIUS * 1.3, 0))
      }
      return new THREE.BufferGeometry().setFromPoints(points)
    })
  }, [])

  const orbitMaterials = useMemo(
    () =>
      Array.from(
        { length: ORBIT_COUNT },
        () => new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending })
      ),
    []
  )

  // Orbit trail particles
  const trailMeta = useMemo(() => {
    const meta = new Float32Array(TRAIL_COUNT * 4) // orbitIndex, angle, speed, offset
    for (let i = 0; i < TRAIL_COUNT; i++) {
      meta[i * 4] = Math.floor(Math.random() * ORBIT_COUNT)
      meta[i * 4 + 1] = Math.random() * Math.PI * 2
      meta[i * 4 + 2] = 0.3 + Math.random() * 1.2
      meta[i * 4 + 3] = (Math.random() - 0.5) * 0.4
    }
    return meta
  }, [])

  const trailGeometry = useMemo(() => {
    const pos = new Float32Array(TRAIL_COUNT * 3)
    const col = new Float32Array(TRAIL_COUNT * 3)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3))
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3))
    return geo
  }, [])

  const trailMaterial = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 0.03,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        vertexColors: true,
        sizeAttenuation: true,
      }),
    []
  )

  useEffect(() => {
    return () => {
      pointsGeometry.dispose()
      pointsMaterial.dispose()
      trailGeometry.dispose()
      trailMaterial.dispose()
      orbitGeometries.forEach(g => g.dispose())
      orbitMaterials.forEach(m => m.dispose())
    }
  }, [pointsGeometry, pointsMaterial, trailGeometry, trailMaterial, orbitGeometries, orbitMaterials])

  useFrame((_, delta) => {
    if (!pointsRef.current) return
    timeRef.current += delta
    const t = timeRef.current
    const palette = COLOR_PALETTES[colorMode]
    const dropMult = dropMode ? 1.5 : 1.0
    const tc = tmpColor.current

    const pos = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute
    const col = pointsRef.current.geometry.attributes.color as THREE.BufferAttribute
    const arr = pos.array as Float32Array
    const cArr = col.array as Float32Array

    const mainBass = Math.min(0.8, bassEnergy * dropMult + bassImpact * 0.3)
    const subBassScale = 1 + subBass * 0.1

    // Bass scatter effect: on impact, scatter particles outward, then snap back
    if (bassImpact > 0.5) {
      scatterRef.current = 1.0
    }
    scatterRef.current *= 0.92
    const scatter = scatterRef.current

    for (let i = 0; i < POINT_COUNT; i++) {
      const ix = i * 3
      const iy = i * 3 + 1
      const iz = i * 3 + 2

      const ox = originalPositions[ix]
      const oy = originalPositions[iy]
      const oz = originalPositions[iz]

      const len = Math.sqrt(ox * ox + oy * oy + oz * oz)
      const nx = ox / len
      const ny = oy / len
      const nz = oz / len

      let displacement = 0

      if (visualStyle === 0) {
        // Smooth: all points breathe as one — perfect sphere pulse, no surface detail
        displacement = mainBass * 1.4 + Math.sin(t * 0.8) * subBass * 0.35
      } else if (visualStyle === 1) {
        // Slight disorder: surface lobe pattern — sphere warps into multi-lobed star shape
        const lon  = Math.atan2(oy, ox)
        const lat  = Math.atan2(Math.sqrt(ox * ox + oy * oy), oz)
        const lobe = Math.sin(lon * 4 + t * 2.0) * Math.sin(lat * 3 + t * 1.5)
        displacement = mainBass * 0.9 + lobe * (0.55 + bassEnergy * 0.55) + mid * 0.22 * Math.cos(lat * 2 + t)
      } else {
        // Chaos: per-vertex hash frozen in glitched state — stutters slowly to new shape
        const hv    = Math.sin(i * 127.1) * 43758.5453
        const rv    = hv - Math.floor(hv)
        const slowT = Math.floor(t * 1.2) / 1.2   // snaps ~every 0.8 s
        const noise = Math.sin(rv * 25 + slowT * 0.5) * Math.cos(rv * 17 - slowT * 0.35)
        displacement = noise * (0.7 + mainBass * 1.8) + high * Math.sin(ox * 4 + slowT) * 0.25
      }

      // Add scatter burst
      const scatterDisp = scatter * (visualStyle === 2 ? 1.2 + Math.random() * 0.4 : 0.5 + Math.random() * 0.2) * 0.6

      arr[ix] = (ox + nx * (displacement + scatterDisp)) * subBassScale
      arr[iy] = (oy + ny * (displacement + scatterDisp)) * subBassScale
      arr[iz] = (oz + nz * (displacement + scatterDisp)) * subBassScale

      // Per-particle color based on displacement
      const dispMag = Math.abs(displacement + scatterDisp) / 4
      const ct = (dispMag + t * 0.08 + i * 0.0002) % 1
      samplePalette(palette, ct, tc)
      const bri = Math.min(0.65, 0.2 + dispMag * 0.4 + bassEnergy * 0.15)
      cArr[ix] = tc.r * bri
      cArr[iy] = tc.g * bri
      cArr[iz] = tc.b * bri
    }
    pos.needsUpdate = true
    col.needsUpdate = true

    pointsMaterial.size = 0.02 + bassEnergy * 0.05 * dropMult + bassImpact * 0.02

    // Orbit rings
    orbitRefs.current.forEach((line, i) => {
      if (!line) return
      const speed = 0.3 + i * 0.15 + bassEnergy * 0.2
      line.rotation.x = t * speed + i * (Math.PI / ORBIT_COUNT) + bassImpact * 0.5
      line.rotation.y = t * speed * 0.7 + i * 0.5
      line.rotation.z = Math.sin(t * 0.5 + i) * 0.3 + subBass * 0.4

      const scale = 1 + bassEnergy * 0.25 * dropMult + Math.sin(t * 2 + i) * mid * 0.08 + bassImpact * 0.1
      line.scale.set(scale, scale, scale)

      const oColorT = (t * 0.15 + i * 0.33) % 1
      samplePalette(palette, oColorT, orbitMaterials[i].color)
      orbitMaterials[i].opacity = Math.min(0.45, 0.1 + bassEnergy * 0.2 + bassImpact * 0.1)
    })

    // Trail particles along orbits
    if (trailRef.current) {
      const tPos = trailRef.current.geometry.attributes.position as THREE.BufferAttribute
      const tCol = trailRef.current.geometry.attributes.color as THREE.BufferAttribute
      const tArr = tPos.array as Float32Array
      const tCArr = tCol.array as Float32Array

      for (let i = 0; i < TRAIL_COUNT; i++) {
        const orbitIdx = Math.floor(trailMeta[i * 4]) % ORBIT_COUNT
        trailMeta[i * 4 + 1] += delta * trailMeta[i * 4 + 2] * (1 + bassEnergy * 2)
        const angle = trailMeta[i * 4 + 1]
        const offset = trailMeta[i * 4 + 3]

        const orbitScale = 1 + bassEnergy * 0.25 * dropMult + Math.sin(t * 2 + orbitIdx) * mid * 0.08
        const r = BASE_RADIUS * 1.3 * orbitScale

        const orbitRot = t * (0.3 + orbitIdx * 0.15 + bassEnergy * 0.2)
        const rx = orbitRot + orbitIdx * (Math.PI / ORBIT_COUNT) + bassImpact * 0.5
        const ry = orbitRot * 0.7 + orbitIdx * 0.5

        let px = Math.cos(angle) * r
        let py = Math.sin(angle) * r + offset
        let pz = 0

        const cosRx = Math.cos(rx), sinRx = Math.sin(rx)
        const cosRy = Math.cos(ry), sinRy = Math.sin(ry)
        const y1 = py * cosRx - pz * sinRx
        const z1 = py * sinRx + pz * cosRx
        const x2 = px * cosRy + z1 * sinRy
        const z2 = -px * sinRy + z1 * cosRy

        tArr[i * 3] = x2
        tArr[i * 3 + 1] = y1
        tArr[i * 3 + 2] = z2

        const ct = (angle * 0.1 + t * 0.05 + orbitIdx * 0.33) % 1
        samplePalette(palette, ct + 0.5, tc)
        const bri = Math.min(0.4, 0.15 + bassEnergy * 0.2)
        tCArr[i * 3] = tc.r * bri
        tCArr[i * 3 + 1] = tc.g * bri
        tCArr[i * 3 + 2] = tc.b * bri
      }
      tPos.needsUpdate = true
      tCol.needsUpdate = true
      trailMaterial.size = 0.02 + bassEnergy * 0.03
    }

    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.2 * (1 + bassEnergy * 0.7)
      groupRef.current.rotation.x = Math.sin(t * 0.3) * 0.15 + subBass * 0.1
    }
  })

  return (
    <group ref={groupRef}>
      <points ref={pointsRef} geometry={pointsGeometry} material={pointsMaterial} />
      {orbitGeometries.map((geo, i) => (
        <line
          key={i}
          ref={(el: any) => { if (el) orbitRefs.current[i] = el }}
          geometry={geo}
          material={orbitMaterials[i]}
        />
      ))}
      <points ref={trailRef} geometry={trailGeometry} material={trailMaterial} />
    </group>
  )
}

export default memo(SphereScene)
