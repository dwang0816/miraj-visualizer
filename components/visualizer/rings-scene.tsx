"use client"

import { useRef, useMemo } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { COLOR_PALETTES, type ColorMode } from "@/lib/color-palettes"

const SHAPE_COUNT = 12
const CROSS_LINES = 24

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

export default function RingsScene({ bass, subBass, mid, high, bassEnergy, bassImpact, colorMode, dropMode, visualStyle }: RingsSceneProps) {
  const groupRef = useRef<THREE.Group>(null)
  const shapesRef = useRef<THREE.Mesh[]>([])
  const crossRef = useRef<THREE.Line[]>([])
  const timeRef = useRef(0)
  const tmpColor = useRef(new THREE.Color())

  // Nested wireframe polyhedra — alternating icosahedrons and octahedrons
  const shapeGeometries = useMemo(() => {
    return Array.from({ length: SHAPE_COUNT }, (_, i) => {
      const scale = 0.5 + i * 0.5
      if (i % 3 === 0) return new THREE.IcosahedronGeometry(scale, 1)
      if (i % 3 === 1) return new THREE.OctahedronGeometry(scale, 1)
      return new THREE.DodecahedronGeometry(scale, 0)
    })
  }, [])

  const shapeMaterials = useMemo(() => {
    return Array.from({ length: SHAPE_COUNT }, () =>
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        wireframe: true,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
      })
    )
  }, [])

  // Cross-connecting lines through the center
  const crossGeometries = useMemo(() => {
    return Array.from({ length: CROSS_LINES }, (_, i) => {
      const angle = (i / CROSS_LINES) * Math.PI * 2
      const elev = ((i % 6) / 6 - 0.5) * Math.PI
      const maxR = 0.5 + (SHAPE_COUNT - 1) * 0.5 + 0.3
      const dx = Math.cos(angle) * Math.cos(elev) * maxR
      const dy = Math.sin(elev) * maxR
      const dz = Math.sin(angle) * Math.cos(elev) * maxR
      const verts = new Float32Array([-dx, -dy, -dz, dx, dy, dz])
      const colors = new Float32Array(6)
      const geo = new THREE.BufferGeometry()
      geo.setAttribute("position", new THREE.BufferAttribute(verts, 3))
      geo.setAttribute("color", new THREE.BufferAttribute(colors, 3))
      return geo
    })
  }, [])

  const crossMaterials = useMemo(() => {
    return Array.from({ length: CROSS_LINES }, () =>
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.2,
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

    // Animate nested wireframe shapes
    shapesRef.current.forEach((mesh, i) => {
      if (!mesh) return
      const progress = i / SHAPE_COUNT
      const even = i % 2 === 0
      const baseScale = 0.5 + i * 0.5

      // Scale pulse on bass
      const pulse = 1 + Math.sin(t * 1.5 + i * 0.7) * bassEnergy * 0.12 * dm + bassImpact * 0.05
      mesh.scale.setScalar(baseScale * pulse)

      if (visualStyle === 0) {
        const speed = (even ? 0.3 : -0.3) * (1 - progress * 0.3)
        mesh.rotation.x = t * speed + Math.sin(t * 0.5 + i) * 0.3
        mesh.rotation.y = t * speed * 0.7 + Math.cos(t * 0.4 + i) * 0.2
        mesh.rotation.z = Math.sin(t * 0.15 + i * 0.8) * 0.2
      } else if (visualStyle === 1) {
        const wave = Math.sin(t * 1.2 - i * 0.4) * 0.6
        mesh.rotation.x = wave
        mesh.rotation.y = Math.cos(t * 0.8 - i * 0.3) * 0.4
        mesh.rotation.z = (even ? 1 : -1) * t * 0.1
      } else {
        const scatter = bassEnergy * 0.8 * dm
        mesh.position.y = (i - SHAPE_COUNT / 2) * 0.15 * scatter
        mesh.rotation.x = t * 0.2 * (even ? 1 : -1)
        mesh.rotation.y = t * 0.15 + i * 0.5
        mesh.rotation.z = Math.sin(t * 0.3 + i) * scatter * 0.3
      }

      if (visualStyle !== 2) mesh.position.y = 0

      // Color cycling
      const ct = (progress + t * 0.05) % 1
      if (ct < 0.33) tc.lerpColors(palette.a, palette.b, ct * 3)
      else if (ct < 0.66) tc.lerpColors(palette.b, palette.c, (ct - 0.33) * 3)
      else tc.lerpColors(palette.c, palette.a, (ct - 0.66) * 3)
      shapeMaterials[i].color.copy(tc)
      shapeMaterials[i].opacity = 0.15 + (1 - progress) * 0.25 + bassEnergy * 0.1 * dm
    })

    // Animate cross lines
    crossRef.current.forEach((line, i) => {
      if (!line) return
      const col = line.geometry.attributes.color as THREE.BufferAttribute
      const cArr = col.array as Float32Array

      const ct = (i / CROSS_LINES + t * 0.04) % 1
      if (ct < 0.5) tc.lerpColors(palette.a, palette.c, ct * 2)
      else tc.lerpColors(palette.c, palette.b, (ct - 0.5) * 2)
      const bri = 0.12 + bassEnergy * 0.08 + bassImpact * 0.04
      cArr[0] = tc.r * bri; cArr[1] = tc.g * bri; cArr[2] = tc.b * bri
      cArr[3] = tc.r * bri * 0.4; cArr[4] = tc.g * bri * 0.4; cArr[5] = tc.b * bri * 0.4
      col.needsUpdate = true

      crossMaterials[i].opacity = 0.08 + bassEnergy * 0.06
    })

    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.08 * (1 + bassEnergy * 0.15)
    }
  })

  return (
    <group ref={groupRef}>
      {shapeGeometries.map((geo, i) => (
        <mesh
          key={`shape-${i}`}
          ref={(el: any) => { if (el) shapesRef.current[i] = el }}
          geometry={geo}
          material={shapeMaterials[i]}
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
    </group>
  )
}
