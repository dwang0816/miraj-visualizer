"use client"

import { useRef, useMemo, useEffect, memo } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { COLOR_PALETTES, type ColorMode } from "@/lib/color-palettes"

const ROWS = 60
const COLS = 120
const SPACING = 0.18
const BASE_HEIGHT = 0
const MIST_COUNT = 2000

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

function WaveformScene({ bass, subBass, mid, high, bassEnergy, bassImpact, colorMode, dropMode, visualStyle }: WaveformSceneProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const mistRef = useRef<THREE.Points>(null)
  const groupRef = useRef<THREE.Group>(null)
  const timeRef = useRef(0)
  const scrollRef = useRef(0)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const colorObj = useMemo(() => new THREE.Color(), [])
  const tmpColor = useRef(new THREE.Color())

  const count = ROWS * COLS

  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ toneMapped: false }),
    []
  )
  const geometry = useMemo(() => new THREE.BoxGeometry(SPACING * 0.7, 0.05, SPACING * 0.7), [])

  // Mist particles above the grid
  const mistMeta = useMemo(() => {
    const meta = new Float32Array(MIST_COUNT * 4) // x, z, speed, phase
    for (let i = 0; i < MIST_COUNT; i++) {
      meta[i * 4] = (Math.random() - 0.5) * COLS * SPACING
      meta[i * 4 + 1] = (Math.random() - 0.5) * ROWS * SPACING
      meta[i * 4 + 2] = 0.3 + Math.random() * 1.5
      meta[i * 4 + 3] = Math.random() * Math.PI * 2
    }
    return meta
  }, [])

  const mistGeometry = useMemo(() => {
    const pos = new Float32Array(MIST_COUNT * 3)
    const col = new Float32Array(MIST_COUNT * 3)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3))
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3))
    return geo
  }, [])

  const mistMaterial = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 0.08,
        transparent: true,
        opacity: 0.3,
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
      mistGeometry.dispose()
      mistMaterial.dispose()
    }
  }, [geometry, material, mistGeometry, mistMaterial])

  useFrame((_, delta) => {
    if (!meshRef.current) return
    timeRef.current += delta
    const t = timeRef.current
    const palette = COLOR_PALETTES[colorMode]
    const dropMult = dropMode ? 1.5 : 1.0

    // Scroll the grid forward with subBass
    scrollRef.current += delta * (0.3 + subBass * 1.5) * dropMult

    const halfCols = COLS / 2
    const halfRows = ROWS / 2

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const idx = row * COLS + col
        const x = (col - halfCols) * SPACING
        const z = (row - halfRows) * SPACING
        const scrollZ = z - scrollRef.current

        const distFromCenter = Math.sqrt(x * x + scrollZ * scrollZ)
        const normalizedDist = distFromCenter / (Math.max(halfCols, halfRows) * SPACING)

        let height = BASE_HEIGHT

        if (visualStyle === 0) {
          height =
            Math.sin(distFromCenter * 3 - t * 3) * bassEnergy * 2.5 * dropMult +
            Math.sin(x * 2 + t * 2) * mid * 0.5 +
            Math.cos(scrollZ * 3 + t * 4) * high * 0.3 +
            bassImpact * 0.5
        } else if (visualStyle === 1) {
          const cellHash = Math.sin(col * 127.1 + row * 311.7) * 43758.5453
          const cellVal = cellHash - Math.floor(cellHash)
          const isActive = cellVal > 0.3
          const pillarPhase = cellVal * Math.PI * 2
          const pillarHeight = isActive
            ? cellVal * bassEnergy * 4.0 * dropMult * Math.abs(Math.sin(t * 2 + pillarPhase))
            : 0
          const midPulse = Math.sin(t * 3 + col * 0.15) * mid * 0.4
          const highShimmer = Math.sin(t * 8 + row * 0.3 + col * 0.2) * high * 0.2
          height = pillarHeight + midPulse + highShimmer + bassImpact * cellVal * 1.5
        } else {
          const angle = Math.atan2(scrollZ, x)
          const ringDist = Math.abs(distFromCenter - 3)
          height =
            Math.sin(angle * 6 - t * 3) * bassEnergy * 2.0 * dropMult * Math.exp(-ringDist * 0.5) +
            Math.sin(distFromCenter * 4 - t * 4) * mid * 0.6 +
            Math.cos(angle * 12 + t * 6) * high * 0.4 * Math.exp(-ringDist) +
            bassImpact * 0.6 * Math.exp(-ringDist * 0.3)
        }

        const scaleY = Math.max(0.1, Math.abs(height) * 4 + 0.1 + bassImpact * 0.3)

        dummy.position.set(x, height * 0.5, z)
        dummy.scale.set(1, scaleY, 1)
        dummy.updateMatrix()
        meshRef.current.setMatrixAt(idx, dummy.matrix)

        const colorT = Math.min(Math.abs(height), 1)
        const fadeT = (normalizedDist + t * 0.1 + bassImpact * 0.2) % 1
        if (fadeT < 0.5) {
          colorObj.lerpColors(palette.a, palette.b, fadeT * 2)
        } else {
          colorObj.lerpColors(palette.b, palette.c, (fadeT - 0.5) * 2)
        }
        const brightness = Math.min(0.3 + colorT * 0.5 + bassImpact * 0.3, 1.0)
        colorObj.multiplyScalar(brightness)
        meshRef.current.setColorAt(idx, colorObj)
      }
    }

    meshRef.current.instanceMatrix.needsUpdate = true
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true

    // --- Update mist particles ---
    if (mistRef.current) {
      const pos = mistRef.current.geometry.attributes.position as THREE.BufferAttribute
      const col = mistRef.current.geometry.attributes.color as THREE.BufferAttribute
      const pArr = pos.array as Float32Array
      const cArr = col.array as Float32Array
      const tc = tmpColor.current

      for (let i = 0; i < MIST_COUNT; i++) {
        const mx = mistMeta[i * 4]
        const mz = mistMeta[i * 4 + 1]
        const speed = mistMeta[i * 4 + 2]
        const phase = mistMeta[i * 4 + 3]

        const yBase = 0.5 + Math.sin(t * speed + phase) * 0.8 + high * 1.5
        pArr[i * 3] = mx + Math.sin(t * 0.3 + phase) * 0.5
        pArr[i * 3 + 1] = yBase + bassImpact * 0.5
        pArr[i * 3 + 2] = mz + Math.cos(t * 0.2 + phase) * 0.5

        const ct = (phase / (Math.PI * 2) + t * 0.05) % 1
        if (ct < 0.5) tc.lerpColors(palette.a, palette.c, ct * 2)
        else tc.lerpColors(palette.c, palette.b, (ct - 0.5) * 2)
        const bri = Math.min(0.4, 0.1 + high * 0.25 + bassImpact * 0.15)
        cArr[i * 3] = tc.r * bri
        cArr[i * 3 + 1] = tc.g * bri
        cArr[i * 3 + 2] = tc.b * bri
      }
      pos.needsUpdate = true
      col.needsUpdate = true
      mistMaterial.size = 0.06 + high * 0.06 + bassImpact * 0.04
    }
  })

  return (
    <group ref={groupRef} rotation={[-0.5, 0, 0]} position={[0, -1, -4]}>
      <instancedMesh ref={meshRef} args={[geometry, material, count]}>
        <boxGeometry args={[SPACING * 0.7, 0.05, SPACING * 0.7]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <points ref={mistRef} geometry={mistGeometry} material={mistMaterial} />
    </group>
  )
}

export default memo(WaveformScene)
