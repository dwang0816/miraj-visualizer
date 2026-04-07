"use client"

import { useRef, useMemo, useEffect, memo } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { COLOR_PALETTES, samplePalette, type ColorMode } from "@/lib/color-palettes"

const GRID_W = 120
const GRID_H = 80
const CELL_SIZE = 0.2
const FLOAT_PARTICLE_COUNT = 1500

interface TerrainSceneProps {
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

function fbm(x: number, z: number, t: number): number {
  const st = t * 0.15
  let val = 0
  val += Math.sin(x * 0.3 + st) * Math.cos(z * 0.4 + st * 0.6) * 0.5
  val += Math.sin(x * 0.7 + z * 0.5 + st * 1.2) * 0.3
  val += Math.sin(x * 1.2 + st * 0.8) * Math.cos(z * 1.0 - st * 0.3) * 0.15
  return val
}

function TerrainScene({ bass, subBass, mid, high, bassEnergy, bassImpact, colorMode, dropMode, visualStyle }: TerrainSceneProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const particlesRef = useRef<THREE.Points>(null)
  const timeRef = useRef(0)
  const scrollRef = useRef(0)
  const tmpColor = useRef(new THREE.Color())

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(GRID_W * CELL_SIZE, GRID_H * CELL_SIZE, GRID_W - 1, GRID_H - 1)
    geo.rotateX(-Math.PI * 0.5)
    const colors = new Float32Array(geo.attributes.position.count * 3)
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3))
    return geo
  }, [])

  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        wireframe: true,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
      }),
    []
  )

  // Floating particles above terrain
  const particleMeta = useMemo(() => {
    const meta = new Float32Array(FLOAT_PARTICLE_COUNT * 4) // x, z, speed, phase
    for (let i = 0; i < FLOAT_PARTICLE_COUNT; i++) {
      meta[i * 4] = (Math.random() - 0.5) * GRID_W * CELL_SIZE
      meta[i * 4 + 1] = (Math.random() - 0.5) * GRID_H * CELL_SIZE
      meta[i * 4 + 2] = 0.3 + Math.random() * 1.5
      meta[i * 4 + 3] = Math.random() * Math.PI * 2
    }
    return meta
  }, [])

  const particleGeometry = useMemo(() => {
    const pos = new Float32Array(FLOAT_PARTICLE_COUNT * 3)
    const col = new Float32Array(FLOAT_PARTICLE_COUNT * 3)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3))
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3))
    return geo
  }, [])

  const particleMaterial = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 0.06,
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
      geometry.dispose()
      material.dispose()
      particleGeometry.dispose()
      particleMaterial.dispose()
    }
  }, [geometry, material, particleGeometry, particleMaterial])

  useFrame((_, delta) => {
    timeRef.current += delta
    const t = timeRef.current
    const palette = COLOR_PALETTES[colorMode]
    const dm = dropMode ? 1.5 : 1

    // Scroll terrain toward camera driven by subBass (synthwave aesthetic)
    scrollRef.current += delta * (0.8 + subBass * 2.0) * dm

    if (!meshRef.current) return
    const pos = geometry.attributes.position as THREE.BufferAttribute
    const col = geometry.attributes.color as THREE.BufferAttribute
    const pArr = pos.array as Float32Array
    const cArr = col.array as Float32Array
    const tc = tmpColor.current
    const halfW = (GRID_W * CELL_SIZE) / 2
    const halfH = (GRID_H * CELL_SIZE) / 2

    for (let i = 0; i < pos.count; i++) {
      const x = pArr[i * 3]
      const z = pArr[i * 3 + 2]

      // Scrolled z for noise sampling
      const scrollZ = z - scrollRef.current

      let h = fbm(x * 0.8, scrollZ * 0.8, t)

      if (visualStyle === 0) {
        // Smooth: gentle rolling hills — fbm only, no eruptions at all
        const d = Math.sqrt(x * x + scrollZ * scrollZ)
        h += Math.sin(d * 1.0 - t * 2.2) * bassEnergy * 0.9 * dm
        h += Math.cos(x * 0.6 + t * 1.4) * mid * 0.18
      } else if (visualStyle === 1) {
        // Slight disorder: two crossed sine waves + occasional pillar burst on hard hits
        h += Math.sin(x * 1.4 - t * 4.0) * bassEnergy * 1.5 * dm
        h += Math.cos(scrollZ * 1.8 + t * 2.5) * mid * 0.6 * dm
        if (bassImpact > 0.35) {
          const cellX = Math.floor((x + halfW) / 2.5)
          const cellZ = Math.floor((scrollZ + halfH) / 2.5)
          const cellHash = Math.sin(cellX * 71.1 + cellZ * 191.7) * 43758.5453
          const cellVal  = cellHash - Math.floor(cellHash)
          if (cellVal > 0.78) h += bassImpact * 2.2 * dm
        }
      } else {
        // Chaos: terrain freezes in spiked corruption, then snaps to new frozen shape
        const cellX    = Math.floor((x + halfW) / 1.0)
        const cellZ2   = Math.floor((scrollZ + halfH) / 1.0)
        const cellHash = Math.sin(cellX * 127.1 + cellZ2 * 311.7) * 43758.5453
        const cellVal  = cellHash - Math.floor(cellHash)
        const slowT    = Math.floor(t * 0.8) / 0.8   // snaps ~every 1.25 s
        const spike    = (cellVal > 0.5 ? 1 : 0) * bassEnergy * dm * 4.0 * Math.abs(Math.sin(slowT * 1.2 + cellVal * 15))
        h += spike + Math.sin(slowT * 1.0 + cellVal * 20) * bassEnergy * dm * 1.5
        h += (cellVal > 0.75 ? 1 : 0) * bassImpact * 5.0 * dm + subBass * Math.sin(x * 0.8 + slowT * 0.6) * 1.0
      }

      pArr[i * 3 + 1] = h

      // Color by height with glow at peaks
      const hNorm = (h + 2) / 4
      const ct = (hNorm * 0.6 + t * 0.05) % 1
      samplePalette(palette, ct, tc)
      const bri = 0.3 + Math.abs(hNorm) * 0.7
      // Extra glow at height peaks
      const peakGlow = Math.max(0, h - 1.5) * 0.3
      cArr[i * 3] = tc.r * bri + peakGlow
      cArr[i * 3 + 1] = tc.g * bri + peakGlow * 0.5
      cArr[i * 3 + 2] = tc.b * bri + peakGlow * 0.3
    }

    pos.needsUpdate = true
    col.needsUpdate = true

    // No mesh movement needed — scroll is handled by the noise offset

    // Floating particles above terrain
    if (particlesRef.current) {
      const pPos = particlesRef.current.geometry.attributes.position as THREE.BufferAttribute
      const pCol = particlesRef.current.geometry.attributes.color as THREE.BufferAttribute
      const ppArr = pPos.array as Float32Array
      const pcArr = pCol.array as Float32Array

      for (let i = 0; i < FLOAT_PARTICLE_COUNT; i++) {
        const mx = particleMeta[i * 4]
        const mz = particleMeta[i * 4 + 1]
        const speed = particleMeta[i * 4 + 2]
        const phase = particleMeta[i * 4 + 3]

        const yBase = 0.8 + Math.sin(t * speed * 0.5 + phase) * 1.2 + bassEnergy * 1.5 * dm
        ppArr[i * 3] = mx + Math.sin(t * 0.2 + phase) * 0.8
        ppArr[i * 3 + 1] = yBase + Math.sin(t * speed + phase) * 0.5 + bassImpact * 0.5
        ppArr[i * 3 + 2] = mz + Math.cos(t * 0.15 + phase) * 0.8

        const ct = (phase / (Math.PI * 2) + t * 0.04) % 1
        samplePalette(palette, ct + 0.5, tc)
        const bri = Math.min(0.4, 0.1 + bassEnergy * 0.2 + high * 0.15)
        pcArr[i * 3] = tc.r * bri
        pcArr[i * 3 + 1] = tc.g * bri
        pcArr[i * 3 + 2] = tc.b * bri
      }
      pPos.needsUpdate = true
      pCol.needsUpdate = true
      particleMaterial.size = 0.04 + bassEnergy * 0.04 + bassImpact * 0.03
    }
  })

  return (
    <group position={[0, -2, -4]} rotation={[0.2, 0, 0]}>
      <mesh ref={meshRef} geometry={geometry} material={material} />
      <points ref={particlesRef} geometry={particleGeometry} material={particleMaterial} />
    </group>
  )
}

export default memo(TerrainScene)
