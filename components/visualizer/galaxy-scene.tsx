"use client"

import { useRef, useMemo, useEffect, memo } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { COLOR_PALETTES, type ColorMode } from "@/lib/color-palettes"

const RING_COUNT = 18
const SEGMENTS = 96
const RADIAL_LINES = 36
const DISC_LAYERS = 6

interface GalaxySceneProps {
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

function GalaxyScene({ bass, subBass, mid, high, bassEnergy, bassImpact, colorMode, dropMode, visualStyle }: GalaxySceneProps) {
  const groupRef = useRef<THREE.Group>(null)
  const discRef = useRef<THREE.Mesh>(null)
  const ringsRef = useRef<THREE.LineLoop[]>([])
  const radialsRef = useRef<THREE.Line[]>([])
  const layerMeshesRef = useRef<THREE.Mesh[]>([])
  const timeRef = useRef(0)
  const tmpColor = useRef(new THREE.Color())

  // Concentric wireframe rings (flat circles at different radii)
  const ringGeometries = useMemo(() => {
    return Array.from({ length: RING_COUNT }, (_, i) => {
      const radius = 0.8 + i * 0.55
      const points: number[] = []
      for (let s = 0; s <= SEGMENTS; s++) {
        const angle = (s / SEGMENTS) * Math.PI * 2
        points.push(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(points), 3))
      const colors = new Float32Array((SEGMENTS + 1) * 3)
      geo.setAttribute("color", new THREE.BufferAttribute(colors, 3))
      return geo
    })
  }, [])

  const ringMaterials = useMemo(() => {
    return Array.from({ length: RING_COUNT }, () =>
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
      })
    )
  }, [])

  // Radial spoke lines from center outward
  const radialGeometries = useMemo(() => {
    const maxR = 0.8 + (RING_COUNT - 1) * 0.55 + 0.5
    return Array.from({ length: RADIAL_LINES }, (_, i) => {
      const angle = (i / RADIAL_LINES) * Math.PI * 2
      const points = new Float32Array(6)
      points[0] = 0; points[1] = 0; points[2] = 0
      points[3] = Math.cos(angle) * maxR
      points[4] = 0
      points[5] = Math.sin(angle) * maxR
      const geo = new THREE.BufferGeometry()
      geo.setAttribute("position", new THREE.BufferAttribute(points, 3))
      const colors = new Float32Array(6)
      geo.setAttribute("color", new THREE.BufferAttribute(colors, 3))
      return geo
    })
  }, [])

  const radialMaterials = useMemo(() => {
    return Array.from({ length: RADIAL_LINES }, () =>
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.25,
        blending: THREE.AdditiveBlending,
      })
    )
  }, [])

  // Stacked wireframe disc layers (like terrain but circular)
  const layerGeometries = useMemo(() => {
    return Array.from({ length: DISC_LAYERS }, (_, layer) => {
      const rings = 12
      const segs = 48
      const maxR = 10
      const verts: number[] = []
      const indices: number[] = []
      const colors: number[] = []

      for (let r = 0; r <= rings; r++) {
        const radius = (r / rings) * maxR
        for (let s = 0; s <= segs; s++) {
          const angle = (s / segs) * Math.PI * 2
          verts.push(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
          colors.push(0.5, 0.5, 0.5)
        }
      }

      for (let r = 0; r < rings; r++) {
        for (let s = 0; s < segs; s++) {
          const a = r * (segs + 1) + s
          const b = a + 1
          const c = a + (segs + 1)
          const d = c + 1
          indices.push(a, b, c, b, d, c)
        }
      }

      const geo = new THREE.BufferGeometry()
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts), 3))
      geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(colors), 3))
      geo.setIndex(indices)
      return geo
    })
  }, [])

  const layerMaterials = useMemo(() => {
    return Array.from({ length: DISC_LAYERS }, () =>
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        wireframe: true,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
      })
    )
  }, [])

  useEffect(() => {
    return () => {
      ringGeometries.forEach(g => g.dispose())
      ringMaterials.forEach(m => m.dispose())
      radialGeometries.forEach(g => g.dispose())
      radialMaterials.forEach(m => m.dispose())
      layerGeometries.forEach(g => g.dispose())
      layerMaterials.forEach(m => m.dispose())
    }
  }, [ringGeometries, ringMaterials, radialGeometries, radialMaterials, layerGeometries, layerMaterials])

  useFrame((_, delta) => {
    timeRef.current += delta
    const t = timeRef.current
    const palette = COLOR_PALETTES[colorMode]
    const dm = dropMode ? 1.5 : 1
    const tc = tmpColor.current

    // Animate concentric rings — height displacement from bass
    ringsRef.current.forEach((ring, i) => {
      if (!ring) return
      const progress = i / RING_COUNT
      const radius = 0.8 + i * 0.55
      const pos = ring.geometry.attributes.position as THREE.BufferAttribute
      const col = ring.geometry.attributes.color as THREE.BufferAttribute
      const pArr = pos.array as Float32Array
      const cArr = col.array as Float32Array

      for (let s = 0; s <= SEGMENTS; s++) {
        const angle = (s / SEGMENTS) * Math.PI * 2
        const spiralOffset = progress * 0.4 + t * 0.1

        let h = 0
        if (visualStyle === 0) {
          h = Math.sin(angle * 3 + t * 1.5 + i * 0.5) * (0.1 + bassEnergy * 0.4 * dm)
          h += Math.sin(radius * 0.8 - t * 2) * subBass * 0.3
        } else if (visualStyle === 1) {
          h = Math.sin(angle * 2 + radius * 0.5 - t * 2) * (0.15 + bassEnergy * 0.3 * dm)
          h += Math.cos(angle * 5 + t * 3) * bassImpact * 0.2
        } else {
          const wave = Math.sin(radius - t * 3 + angle * 2) * (0.2 + bassEnergy * 0.35 * dm)
          h = wave + Math.sin(angle * 6 + t) * subBass * 0.15
        }

        pArr[s * 3] = Math.cos(angle + spiralOffset) * radius
        pArr[s * 3 + 1] = h
        pArr[s * 3 + 2] = Math.sin(angle + spiralOffset) * radius

        const ct = (progress + angle / (Math.PI * 2) * 0.3 + t * 0.04) % 1
        if (ct < 0.5) tc.lerpColors(palette.a, palette.b, ct * 2)
        else tc.lerpColors(palette.b, palette.c, (ct - 0.5) * 2)
        const bri = 0.3 + (1 - progress) * 0.4 + bassEnergy * 0.15 * dm
        cArr[s * 3] = tc.r * bri
        cArr[s * 3 + 1] = tc.g * bri
        cArr[s * 3 + 2] = tc.b * bri
      }
      pos.needsUpdate = true
      col.needsUpdate = true

      ringMaterials[i].opacity = 0.25 + (1 - progress) * 0.3 + bassEnergy * 0.1
    })

    // Animate radial spokes — subtle wave along length
    radialsRef.current.forEach((line, i) => {
      if (!line) return
      const angle = (i / RADIAL_LINES) * Math.PI * 2
      const maxR = 0.8 + (RING_COUNT - 1) * 0.55 + 0.5
      const pos = line.geometry.attributes.position as THREE.BufferAttribute
      const col = line.geometry.attributes.color as THREE.BufferAttribute
      const pArr = pos.array as Float32Array
      const cArr = col.array as Float32Array

      const h = Math.sin(angle * 3 + t * 2) * bassEnergy * 0.2 * dm
      pArr[4] = h

      const ct = (i / RADIAL_LINES + t * 0.03) % 1
      if (ct < 0.5) tc.lerpColors(palette.a, palette.c, ct * 2)
      else tc.lerpColors(palette.c, palette.b, (ct - 0.5) * 2)
      const bri = 0.15 + bassEnergy * 0.1
      cArr[0] = tc.r * bri * 1.5; cArr[1] = tc.g * bri * 1.5; cArr[2] = tc.b * bri * 1.5
      cArr[3] = tc.r * bri * 0.3; cArr[4] = tc.g * bri * 0.3; cArr[5] = tc.b * bri * 0.3
      pos.needsUpdate = true
      col.needsUpdate = true
    })

    // Animate wireframe disc layers — stacked and displaced
    layerMeshesRef.current.forEach((mesh, layer) => {
      if (!mesh) return
      const pos = mesh.geometry.attributes.position as THREE.BufferAttribute
      const col = mesh.geometry.attributes.color as THREE.BufferAttribute
      const pArr = pos.array as Float32Array
      const cArr = col.array as Float32Array
      const rings = 12
      const segs = 48
      const layerOffset = (layer - DISC_LAYERS / 2) * 0.6

      for (let r = 0; r <= rings; r++) {
        for (let s = 0; s <= segs; s++) {
          const idx = r * (segs + 1) + s
          const radius = (r / rings) * 10
          const angle = (s / segs) * Math.PI * 2

          let h = layerOffset
          h += Math.sin(radius * 0.5 - t * 1.5 + layer * 1.2) * (0.15 + bassEnergy * 0.25 * dm)
          h += Math.sin(angle * 3 + t + layer * 0.8) * subBass * 0.15

          pArr[idx * 3 + 1] = h

          const rNorm = r / rings
          const ct = (rNorm + t * 0.03 + layer * 0.15) % 1
          if (ct < 0.5) tc.lerpColors(palette.a, palette.b, ct * 2)
          else tc.lerpColors(palette.b, palette.c, (ct - 0.5) * 2)
          const bri = 0.15 + (1 - rNorm) * 0.2 + bassEnergy * 0.08
          cArr[idx * 3] = tc.r * bri
          cArr[idx * 3 + 1] = tc.g * bri
          cArr[idx * 3 + 2] = tc.b * bri
        }
      }
      pos.needsUpdate = true
      col.needsUpdate = true

      mesh.rotation.y = t * 0.05 * (layer % 2 === 0 ? 1 : -1) + layer * 0.3
      layerMaterials[layer].opacity = 0.12 + bassEnergy * 0.06
    })

    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.06 * (1 + bassEnergy * 0.2)
    }
  })

  return (
    <group ref={groupRef} rotation={[0.5, 0, 0.1]}>
      {ringGeometries.map((geo, i) => (
        <lineLoop
          key={`ring-${i}`}
          ref={(el: any) => { if (el) ringsRef.current[i] = el }}
          geometry={geo}
          material={ringMaterials[i]}
        />
      ))}
      {radialGeometries.map((geo, i) => (
        <line
          key={`rad-${i}`}
          ref={(el: any) => { if (el) radialsRef.current[i] = el }}
          // @ts-expect-error R3F line element accepts geometry
          geometry={geo}
          material={radialMaterials[i]}
        />
      ))}
      {layerGeometries.map((geo, i) => (
        <mesh
          key={`layer-${i}`}
          ref={(el: any) => { if (el) layerMeshesRef.current[i] = el }}
          geometry={geo}
          material={layerMaterials[i]}
        />
      ))}
    </group>
  )
}

export default memo(GalaxyScene)
