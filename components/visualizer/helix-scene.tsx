"use client"

import { useRef, useMemo } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { COLOR_PALETTES, type ColorMode } from "@/lib/color-palettes"

const STRAND_POINTS = 120
const HELIX_RADIUS = 2.0
const HELIX_LENGTH = 18
const HELIX_TURNS = 5
const NODE_COUNT = 20
const RING_COUNT = 6
const RING_SEGMENTS = 48

interface HelixSceneProps {
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

export default function HelixScene({ bass, subBass, mid, high, bassEnergy, bassImpact, colorMode, dropMode, visualStyle }: HelixSceneProps) {
  const groupRef = useRef<THREE.Group>(null)
  const strand1Ref = useRef<THREE.Line>(null)
  const strand2Ref = useRef<THREE.Line>(null)
  const nodesRef = useRef<THREE.Mesh[]>([])
  const crossRef = useRef<THREE.Line[]>([])
  const encircleRef = useRef<THREE.LineLoop[]>([])
  const timeRef = useRef(0)
  const pulseRef = useRef(2)
  const tmpColor = useRef(new THREE.Color())

  // Strand 1 geometry (line with vertex colors)
  const strand1Geo = useMemo(() => {
    const positions = new Float32Array(STRAND_POINTS * 3)
    const colors = new Float32Array(STRAND_POINTS * 3)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3))
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3))
    return geo
  }, [])

  // Strand 2 geometry
  const strand2Geo = useMemo(() => {
    const positions = new Float32Array(STRAND_POINTS * 3)
    const colors = new Float32Array(STRAND_POINTS * 3)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3))
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3))
    return geo
  }, [])

  const strandMat1 = useMemo(
    () => new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending }),
    []
  )
  const strandMat2 = useMemo(
    () => new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending }),
    []
  )

  // Wireframe polyhedra at node points along the strands
  const nodeGeometries = useMemo(() => {
    return Array.from({ length: NODE_COUNT * 2 }, (_, i) => {
      const size = 0.12 + (i % 3) * 0.04
      if (i % 3 === 0) return new THREE.IcosahedronGeometry(size, 0)
      if (i % 3 === 1) return new THREE.OctahedronGeometry(size, 0)
      return new THREE.TetrahedronGeometry(size, 0)
    })
  }, [])

  const nodeMaterials = useMemo(() => {
    return Array.from({ length: NODE_COUNT * 2 }, () =>
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        wireframe: true,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
      })
    )
  }, [])

  // Cross-connecting bars between strands
  const crossGeometries = useMemo(() => {
    return Array.from({ length: NODE_COUNT }, () => {
      const positions = new Float32Array(6)
      const colors = new Float32Array(6)
      const geo = new THREE.BufferGeometry()
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3))
      geo.setAttribute("color", new THREE.BufferAttribute(colors, 3))
      return geo
    })
  }, [])

  const crossMaterials = useMemo(() => {
    return Array.from({ length: NODE_COUNT }, () =>
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
      })
    )
  }, [])

  // Encircling wireframe rings at intervals
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
        opacity: 0.25,
        blending: THREE.AdditiveBlending,
      })
    )
  }, [])

  useFrame((_, delta) => {
    timeRef.current += delta
    const t = timeRef.current
    const palette = COLOR_PALETTES[colorMode]
    const dm = dropMode ? 1.5 : 1
    const tc = tmpColor.current

    // Energy pulse that travels along helix on bass hit
    if (bassImpact > 0.4) pulseRef.current = 0
    pulseRef.current += delta * 2
    const pulsePos = Math.min(pulseRef.current, 1)
    const pulseActive = pulsePos < 1

    // Helper: compute helix point
    const helixPoint = (progress: number, offset: number) => {
      const angle = progress * Math.PI * 2 * HELIX_TURNS + t * 0.5 + offset
      let r = HELIX_RADIUS

      if (visualStyle === 0) {
        r += Math.sin(progress * Math.PI * 4 + t * 3 + offset) * bassEnergy * 1.2 * dm
      } else if (visualStyle === 1) {
        const splitGap = bassEnergy * 2.0 * dm
        const yShift = (offset === 0 ? -1 : 1) * splitGap * Math.sin(progress * Math.PI)
        return {
          x: Math.cos(angle) * r,
          y: (progress - 0.5) * HELIX_LENGTH + yShift,
          z: Math.sin(angle) * r,
        }
      } else {
        const taper = 0.3 + (1 - progress) * 1.5
        r = HELIX_RADIUS * taper + Math.sin(progress * 10 + t * 5 + offset) * bassEnergy * 0.5 * dm
        r += subBass * 0.3 * Math.sin(progress * Math.PI * 2 + t)
      }

      if (pulseActive) {
        const dist = Math.abs(progress - pulsePos)
        if (dist < 0.05) r += (1 - dist / 0.05) * bassEnergy * 0.8
      }

      return {
        x: Math.cos(angle) * r,
        y: (progress - 0.5) * HELIX_LENGTH,
        z: Math.sin(angle) * r,
      }
    }

    // Update strand 1 with vertex colors
    if (strand1Ref.current) {
      const pos = strand1Geo.attributes.position as THREE.BufferAttribute
      const col = strand1Geo.attributes.color as THREE.BufferAttribute
      const pArr = pos.array as Float32Array
      const cArr = col.array as Float32Array

      for (let i = 0; i < STRAND_POINTS; i++) {
        const progress = i / STRAND_POINTS
        const p = helixPoint(progress, 0)
        pArr[i * 3] = p.x
        pArr[i * 3 + 1] = p.y
        pArr[i * 3 + 2] = p.z

        const ct = (progress + t * 0.06) % 1
        if (ct < 0.5) tc.lerpColors(palette.a, palette.b, ct * 2)
        else tc.lerpColors(palette.b, palette.c, (ct - 0.5) * 2)
        let bri = 0.3 + bassEnergy * 0.3
        if (pulseActive) {
          const dist = Math.abs(progress - pulsePos)
          if (dist < 0.06) bri += (1 - dist / 0.06) * 0.5
        }
        bri = Math.min(0.8, bri)
        cArr[i * 3] = tc.r * bri
        cArr[i * 3 + 1] = tc.g * bri
        cArr[i * 3 + 2] = tc.b * bri
      }
      pos.needsUpdate = true
      col.needsUpdate = true
      strandMat1.opacity = 0.4 + bassEnergy * 0.35
    }

    // Update strand 2 with vertex colors
    if (strand2Ref.current) {
      const pos = strand2Geo.attributes.position as THREE.BufferAttribute
      const col = strand2Geo.attributes.color as THREE.BufferAttribute
      const pArr = pos.array as Float32Array
      const cArr = col.array as Float32Array

      for (let i = 0; i < STRAND_POINTS; i++) {
        const progress = i / STRAND_POINTS
        const p = helixPoint(progress, Math.PI)
        pArr[i * 3] = p.x
        pArr[i * 3 + 1] = p.y
        pArr[i * 3 + 2] = p.z

        const ct = (progress + t * 0.06 + 0.5) % 1
        if (ct < 0.5) tc.lerpColors(palette.b, palette.c, ct * 2)
        else tc.lerpColors(palette.c, palette.a, (ct - 0.5) * 2)
        let bri = 0.3 + bassEnergy * 0.3
        if (pulseActive) {
          const dist = Math.abs(progress - pulsePos)
          if (dist < 0.06) bri += (1 - dist / 0.06) * 0.5
        }
        bri = Math.min(0.8, bri)
        cArr[i * 3] = tc.r * bri
        cArr[i * 3 + 1] = tc.g * bri
        cArr[i * 3 + 2] = tc.b * bri
      }
      pos.needsUpdate = true
      col.needsUpdate = true
      strandMat2.opacity = 0.4 + bassEnergy * 0.35
    }

    // Update node polyhedra at regular intervals along both strands
    nodesRef.current.forEach((mesh, i) => {
      if (!mesh) return
      const strandIdx = i < NODE_COUNT ? 0 : 1
      const nodeIdx = i % NODE_COUNT
      const progress = (nodeIdx + 0.5) / NODE_COUNT
      const offset = strandIdx === 0 ? 0 : Math.PI
      const p = helixPoint(progress, offset)

      mesh.position.set(p.x, p.y, p.z)
      mesh.rotation.x = t * 1.5 + i * 0.3
      mesh.rotation.y = t + i * 0.5

      const pulse = 1 + bassEnergy * 0.4 + bassImpact * 0.3
      let pulseBri = 1
      if (pulseActive) {
        const dist = Math.abs(progress - pulsePos)
        if (dist < 0.06) {
          pulseBri = 1 + (1 - dist / 0.06) * 2
        }
      }
      mesh.scale.setScalar(pulse * Math.min(1.5, pulseBri))

      const ct = (progress + t * 0.05 + strandIdx * 0.4) % 1
      if (ct < 0.5) tc.lerpColors(palette.a, palette.c, ct * 2)
      else tc.lerpColors(palette.c, palette.b, (ct - 0.5) * 2)
      nodeMaterials[i].color.copy(tc)
      nodeMaterials[i].opacity = 0.2 + bassEnergy * 0.25 + (pulseBri > 1 ? 0.15 : 0)
    })

    // Update cross-connecting bars between strand1 and strand2 nodes
    crossRef.current.forEach((line, i) => {
      if (!line) return
      const progress = (i + 0.5) / NODE_COUNT
      const p1 = helixPoint(progress, 0)
      const p2 = helixPoint(progress, Math.PI)

      const pos = line.geometry.attributes.position as THREE.BufferAttribute
      const col = line.geometry.attributes.color as THREE.BufferAttribute
      const pArr = pos.array as Float32Array
      const cArr = col.array as Float32Array

      pArr[0] = p1.x; pArr[1] = p1.y; pArr[2] = p1.z
      pArr[3] = p2.x; pArr[4] = p2.y; pArr[5] = p2.z
      pos.needsUpdate = true

      const ct = (progress + t * 0.08) % 1
      if (ct < 0.5) tc.lerpColors(palette.a, palette.b, ct * 2)
      else tc.lerpColors(palette.b, palette.c, (ct - 0.5) * 2)

      let bri = 0.1 + bassEnergy * 0.2 + bassImpact * 0.2
      if (pulseActive) {
        const dist = Math.abs(progress - pulsePos)
        if (dist < 0.08) bri += (1 - dist / 0.08) * 0.4
      }
      bri = Math.min(0.6, bri)
      cArr[0] = tc.r * bri; cArr[1] = tc.g * bri; cArr[2] = tc.b * bri
      cArr[3] = tc.r * bri * 0.6; cArr[4] = tc.g * bri * 0.6; cArr[5] = tc.b * bri * 0.6
      col.needsUpdate = true

      crossMaterials[i].opacity = 0.1 + bassEnergy * 0.15 + bassImpact * 0.15
    })

    // Update encircling rings
    encircleRef.current.forEach((ring, i) => {
      if (!ring) return
      const progress = (i + 0.5) / RING_COUNT
      const y = (progress - 0.5) * HELIX_LENGTH

      const angle = progress * Math.PI * 2 * HELIX_TURNS + t * 0.5
      const r = HELIX_RADIUS * 1.6 + Math.sin(t * 2 + i * 1.5) * bassEnergy * 0.4 * dm

      const pos = ring.geometry.attributes.position as THREE.BufferAttribute
      const col = ring.geometry.attributes.color as THREE.BufferAttribute
      const pArr = pos.array as Float32Array
      const cArr = col.array as Float32Array

      for (let s = 0; s <= RING_SEGMENTS; s++) {
        const a = (s / RING_SEGMENTS) * Math.PI * 2
        pArr[s * 3] = Math.cos(a) * r
        pArr[s * 3 + 1] = 0
        pArr[s * 3 + 2] = Math.sin(a) * r

        const ct = (s / RING_SEGMENTS + t * 0.04 + i * 0.15) % 1
        if (ct < 0.5) tc.lerpColors(palette.c, palette.a, ct * 2)
        else tc.lerpColors(palette.a, palette.b, (ct - 0.5) * 2)
        const bri = 0.1 + bassEnergy * 0.08 + bassImpact * 0.05
        cArr[s * 3] = tc.r * bri
        cArr[s * 3 + 1] = tc.g * bri
        cArr[s * 3 + 2] = tc.b * bri
      }
      pos.needsUpdate = true
      col.needsUpdate = true

      ring.position.y = y
      ring.rotation.x = Math.sin(angle) * 0.3
      ring.rotation.z = Math.cos(angle) * 0.3
      ringMaterials[i].opacity = 0.1 + bassEnergy * 0.08
    })

    // Group rotation
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.15 * (1 + bassEnergy * 0.3)
      groupRef.current.rotation.x = Math.sin(t * 0.2) * 0.1 + 0.25 + subBass * 0.05
    }
  })

  return (
    <group ref={groupRef}>
      {/* @ts-expect-error - R3F line element */}
      <line ref={strand1Ref as React.Ref<THREE.Line>} geometry={strand1Geo} material={strandMat1} />
      {/* @ts-expect-error - R3F line element */}
      <line ref={strand2Ref as React.Ref<THREE.Line>} geometry={strand2Geo} material={strandMat2} />

      {nodeGeometries.map((geo, i) => (
        <mesh
          key={`node-${i}`}
          ref={(el: any) => { if (el) nodesRef.current[i] = el }}
          geometry={geo}
          material={nodeMaterials[i]}
        />
      ))}

      {crossGeometries.map((geo, i) => (
        <line
          key={`cross-${i}`}
          // @ts-expect-error - R3F line element
          ref={(el: any) => { if (el) crossRef.current[i] = el }}
          geometry={geo}
          material={crossMaterials[i]}
        />
      ))}

      {ringGeometries.map((geo, i) => (
        <lineLoop
          key={`ring-${i}`}
          ref={(el: any) => { if (el) encircleRef.current[i] = el }}
          geometry={geo}
          material={ringMaterials[i]}
        />
      ))}
    </group>
  )
}
