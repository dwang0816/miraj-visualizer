"use client"

import { useRef, useMemo, useEffect, memo } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { COLOR_PALETTES, type ColorMode } from "@/lib/color-palettes"

export type { ColorMode }

const RING_COUNT = 80
const RING_SEGMENTS = 64
const TUNNEL_DEPTH = 40
const TUNNEL_RADIUS = 4
const SPARK_COUNT = 1000

interface TunnelSceneProps {
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

function TunnelScene({ bass, subBass, mid, high, bassEnergy, bassImpact, colorMode, dropMode, visualStyle }: TunnelSceneProps) {
  const groupRef = useRef<THREE.Group>(null)
  const ringsRef = useRef<THREE.Mesh[]>([])
  const particlesRef = useRef<THREE.Points>(null)
  const sparksRef = useRef<THREE.Points>(null)
  const timeRef = useRef(0)
  const tmpColor = useRef(new THREE.Color())

  const ringGeometry = useMemo(() => new THREE.TorusGeometry(TUNNEL_RADIUS, 0.02, 8, RING_SEGMENTS), [])

  const particleData = useMemo(() => {
    const count = 2000
    const positions = new Float32Array(count * 3)
    const velocities = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const r = TUNNEL_RADIUS * (0.3 + Math.random() * 0.7)
      positions[i * 3] = Math.cos(angle) * r
      positions[i * 3 + 1] = Math.sin(angle) * r
      positions[i * 3 + 2] = -Math.random() * TUNNEL_DEPTH
      velocities[i * 3] = (Math.random() - 0.5) * 0.02
      velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.02
      velocities[i * 3 + 2] = -(0.02 + Math.random() * 0.04)
    }
    return { positions, velocities, count }
  }, [])

  const particleGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(particleData.positions.slice(), 3))
    return geo
  }, [particleData])

  // Spark burst particles
  const sparkData = useMemo(() => {
    const pos = new Float32Array(SPARK_COUNT * 3)
    const vel = new Float32Array(SPARK_COUNT * 3)
    const meta = new Float32Array(SPARK_COUNT * 2) // life, maxLife
    for (let i = 0; i < SPARK_COUNT; i++) {
      pos[i * 3] = 0
      pos[i * 3 + 1] = 0
      pos[i * 3 + 2] = -TUNNEL_DEPTH * 0.5
      const angle = Math.random() * Math.PI * 2
      const speed = 0.5 + Math.random() * 2
      vel[i * 3] = Math.cos(angle) * speed
      vel[i * 3 + 1] = Math.sin(angle) * speed
      vel[i * 3 + 2] = (Math.random() - 0.5) * 1.5
      meta[i * 2] = 0
      meta[i * 2 + 1] = 0.5 + Math.random() * 1.5
    }
    return { positions: pos, velocities: vel, meta }
  }, [])

  const sparkGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(sparkData.positions.slice(), 3))
    const colors = new Float32Array(SPARK_COUNT * 3)
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3))
    return geo
  }, [sparkData])

  const sparkMaterial = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 0.06,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        vertexColors: true,
        sizeAttenuation: true,
      }),
    []
  )

  const ringMaterials = useMemo(() => {
    return Array.from({ length: RING_COUNT }, () =>
      new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
    )
  }, [])

  const particleMaterial = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 0.04,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        color: 0x00ffff,
      }),
    []
  )

  useEffect(() => {
    return () => {
      ringGeometry.dispose()
      particleGeometry.dispose()
      sparkGeometry.dispose()
      sparkMaterial.dispose()
      particleMaterial.dispose()
      ringMaterials.forEach(m => m.dispose())
    }
  }, [ringGeometry, particleGeometry, sparkGeometry, sparkMaterial, particleMaterial, ringMaterials])

  useFrame((_, delta) => {
    timeRef.current += delta
    const t = timeRef.current
    const palette = COLOR_PALETTES[colorMode]
    const dropMult = dropMode ? 1.5 : 1.0

    // --- Update tunnel rings ---
    ringsRef.current.forEach((ring, i) => {
      if (!ring) return
      const progress = i / RING_COUNT
      let z = -progress * TUNNEL_DEPTH + ((t * (2 + bassEnergy * 8) * dropMult) % TUNNEL_DEPTH)
      if (z > 0) z -= TUNNEL_DEPTH
      ring.position.z = z

      const pulseFactor = visualStyle === 1 ? Math.sin(t * 4 + i * 0.3) * 0.3 : 0
      const baseScale = 1 + bassEnergy * 2.0 * dropMult + pulseFactor + bassImpact * 0.5
      const breathe = 1 + Math.sin(t * 2 + i * 0.2) * 0.1 * mid
      // Ring thickness pulse with bassEnergy
      const thickScale = 1 + bassEnergy * 1.5 * dropMult
      ring.scale.set(baseScale * breathe, baseScale * breathe, thickScale)

      if (visualStyle === 0) {
        ring.rotation.z = t * 0.3 + i * 0.05 + mid * 2 + subBass * 0.5
      } else if (visualStyle === 1) {
        ring.rotation.z = Math.sin(t + i * 0.1) * Math.PI * mid + bassImpact * 0.3
        ring.rotation.x = Math.cos(t * 0.5 + i * 0.1) * 0.3 * high
      } else {
        // Style 2: asymmetric wobble patterns
        ring.rotation.z = t * 0.1 + i * 0.1 + subBass * 0.3
        ring.rotation.x = Math.sin(t * 0.8 + i * 0.25) * 0.7 * bassEnergy + Math.cos(t * 0.3 + i * 0.4) * 0.3
        ring.rotation.y = Math.sin(t * 0.5 + i * 0.15) * 0.4 * mid
      }

      const colorT = (progress + mid * 0.5 + t * 0.1 + bassImpact * 0.3) % 1
      const mat = ringMaterials[i]
      if (colorT < 0.5) {
        mat.color.lerpColors(palette.a, palette.b, colorT * 2)
      } else {
        mat.color.lerpColors(palette.b, palette.c, (colorT - 0.5) * 2)
      }
      mat.opacity = Math.min(0.4, 0.08 + bassEnergy * 0.2 * dropMult + (1 - progress) * 0.1 + bassImpact * 0.05)
    })

    // --- Update particles ---
    if (particlesRef.current) {
      const pos = particlesRef.current.geometry.attributes.position as THREE.BufferAttribute
      const arr = pos.array as Float32Array

      for (let i = 0; i < particleData.count; i++) {
        const ix = i * 3
        const iy = i * 3 + 1
        const iz = i * 3 + 2

        const speed = (1 + high * 4 + bassEnergy * 2) * dropMult
        arr[iz] += particleData.velocities[iz] * speed * 60 * delta

        const angle = Math.atan2(arr[iy], arr[ix])
        const r = Math.sqrt(arr[ix] * arr[ix] + arr[iy] * arr[iy])
        const swirl = bassEnergy * 0.03 * dropMult + subBass * 0.01
        arr[ix] = Math.cos(angle + swirl) * r
        arr[iy] = Math.sin(angle + swirl) * r

        if (arr[iz] < -TUNNEL_DEPTH || arr[iz] > 1) {
          const a = Math.random() * Math.PI * 2
          const rad = TUNNEL_RADIUS * (0.3 + Math.random() * 0.7)
          arr[ix] = Math.cos(a) * rad
          arr[iy] = Math.sin(a) * rad
          arr[iz] = -Math.random() * 2
        }
      }
      pos.needsUpdate = true

      const pColorT = (t * 0.2 + mid + bassImpact * 0.2) % 1
      if (pColorT < 0.5) {
        particleMaterial.color.lerpColors(palette.a, palette.c, pColorT * 2)
      } else {
        particleMaterial.color.lerpColors(palette.c, palette.b, (pColorT - 0.5) * 2)
      }
      particleMaterial.size = 0.03 + bassEnergy * 0.04 * dropMult + bassImpact * 0.01
      particleMaterial.opacity = Math.min(0.4, 0.15 + bassEnergy * 0.15 + bassImpact * 0.05)
    }

    // --- Update spark burst particles ---
    if (sparksRef.current) {
      const pos = sparksRef.current.geometry.attributes.position as THREE.BufferAttribute
      const col = sparksRef.current.geometry.attributes.color as THREE.BufferAttribute
      const pArr = pos.array as Float32Array
      const cArr = col.array as Float32Array
      const tc = tmpColor.current

      for (let i = 0; i < SPARK_COUNT; i++) {
        sparkData.meta[i * 2] += delta

        if (bassImpact > 0.4 && sparkData.meta[i * 2] > sparkData.meta[i * 2 + 1]) {
          // Respawn spark on bass hit
          const spawnZ = -TUNNEL_DEPTH * (0.1 + Math.random() * 0.5)
          const spawnAngle = Math.random() * Math.PI * 2
          const spawnR = TUNNEL_RADIUS * 0.1
          pArr[i * 3] = Math.cos(spawnAngle) * spawnR
          pArr[i * 3 + 1] = Math.sin(spawnAngle) * spawnR
          pArr[i * 3 + 2] = spawnZ
          const burstAngle = Math.random() * Math.PI * 2
          const burstSpeed = 1 + Math.random() * 3
          sparkData.velocities[i * 3] = Math.cos(burstAngle) * burstSpeed
          sparkData.velocities[i * 3 + 1] = Math.sin(burstAngle) * burstSpeed
          sparkData.velocities[i * 3 + 2] = (Math.random() - 0.5) * 2
          sparkData.meta[i * 2] = 0
          sparkData.meta[i * 2 + 1] = 0.3 + Math.random() * 0.8
        }

        const life = sparkData.meta[i * 2]
        const maxLife = sparkData.meta[i * 2 + 1]
        const lifeRatio = Math.min(1, life / maxLife)

        // Move outward
        pArr[i * 3] += sparkData.velocities[i * 3] * delta * (1 - lifeRatio * 0.5)
        pArr[i * 3 + 1] += sparkData.velocities[i * 3 + 1] * delta * (1 - lifeRatio * 0.5)
        pArr[i * 3 + 2] += sparkData.velocities[i * 3 + 2] * delta

        // Color fading
        const ct = (lifeRatio + t * 0.1) % 1
        if (ct < 0.5) tc.lerpColors(palette.a, palette.b, ct * 2)
        else tc.lerpColors(palette.b, palette.c, (ct - 0.5) * 2)
        const bri = Math.max(0, (1 - lifeRatio) * 0.6)
        cArr[i * 3] = tc.r * bri
        cArr[i * 3 + 1] = tc.g * bri
        cArr[i * 3 + 2] = tc.b * bri
      }
      pos.needsUpdate = true
      col.needsUpdate = true
      sparkMaterial.size = 0.04 + bassImpact * 0.08
    }

    if (groupRef.current) {
      groupRef.current.rotation.z += delta * 0.05 * (1 + bassEnergy * 0.7)
    }
  })

  return (
    <group ref={groupRef}>
      {Array.from({ length: RING_COUNT }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            if (el) ringsRef.current[i] = el
          }}
          geometry={ringGeometry}
          material={ringMaterials[i]}
          position={[0, 0, -(i / RING_COUNT) * TUNNEL_DEPTH]}
        />
      ))}
      <points ref={particlesRef} geometry={particleGeometry} material={particleMaterial} />
      <points ref={sparksRef} geometry={sparkGeometry} material={sparkMaterial} />
    </group>
  )
}

export default memo(TunnelScene)
