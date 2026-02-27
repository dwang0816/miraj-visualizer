"use client"

import { useRef, useMemo } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { COLOR_PALETTES, type ColorMode } from "@/lib/color-palettes"

const GRID_COLS = 60
const GRID_ROWS = 80
const CELL_W = 0.22
const CELL_H = 0.16
const DEPTH_LAYERS = 3
const FALLING_SHAPES = 24
const SCAN_LINES = 5

interface MatrixSceneProps {
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

export default function MatrixScene({ bass, subBass, mid, high, bassEnergy, bassImpact, colorMode, dropMode, visualStyle }: MatrixSceneProps) {
  const groupRef = useRef<THREE.Group>(null)
  const layersRef = useRef<THREE.Mesh[]>([])
  const shapesRef = useRef<THREE.Mesh[]>([])
  const scanRef = useRef<THREE.Line[]>([])
  const timeRef = useRef(0)
  const scrollRef = useRef(0)
  const tmpColor = useRef(new THREE.Color())

  const halfW = (GRID_COLS * CELL_W) / 2
  const halfH = (GRID_ROWS * CELL_H) / 2

  // Vertical wireframe grid layers at different Z depths
  const layerGeometries = useMemo(() => {
    return Array.from({ length: DEPTH_LAYERS }, () => {
      const geo = new THREE.PlaneGeometry(
        GRID_COLS * CELL_W,
        GRID_ROWS * CELL_H,
        GRID_COLS - 1,
        GRID_ROWS - 1
      )
      const colors = new Float32Array(geo.attributes.position.count * 3)
      geo.setAttribute("color", new THREE.BufferAttribute(colors, 3))
      return geo
    })
  }, [])

  const layerMaterials = useMemo(() => {
    return Array.from({ length: DEPTH_LAYERS }, (_, i) =>
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        wireframe: true,
        transparent: true,
        opacity: i === 1 ? 0.6 : 0.35,
        blending: THREE.AdditiveBlending,
      })
    )
  }, [])

  // Small falling wireframe polyhedra
  const shapeGeometries = useMemo(() => {
    return Array.from({ length: FALLING_SHAPES }, (_, i) => {
      if (i % 3 === 0) return new THREE.OctahedronGeometry(0.15, 0)
      if (i % 3 === 1) return new THREE.TetrahedronGeometry(0.12, 0)
      return new THREE.IcosahedronGeometry(0.1, 0)
    })
  }, [])

  const shapeMaterials = useMemo(() => {
    return Array.from({ length: FALLING_SHAPES }, () =>
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        wireframe: true,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
      })
    )
  }, [])

  const shapeMeta = useMemo(() => {
    const meta = new Float32Array(FALLING_SHAPES * 5)
    for (let i = 0; i < FALLING_SHAPES; i++) {
      meta[i * 5] = (Math.random() - 0.5) * halfW * 2
      meta[i * 5 + 1] = halfH + Math.random() * halfH * 2
      meta[i * 5 + 2] = 1 + Math.random() * 3
      meta[i * 5 + 3] = Math.random() * Math.PI * 2
      meta[i * 5 + 4] = (Math.random() - 0.5) * 4
    }
    return meta
  }, [halfW, halfH])

  // Horizontal scan lines
  const scanGeometries = useMemo(() => {
    const w = halfW + 1
    return Array.from({ length: SCAN_LINES }, () => {
      const points = [
        new THREE.Vector3(-w, 0, 0),
        new THREE.Vector3(w, 0, 0),
      ]
      return new THREE.BufferGeometry().setFromPoints(points)
    })
  }, [halfW])

  const scanMaterials = useMemo(() => {
    return Array.from({ length: SCAN_LINES }, () =>
      new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.12,
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

    scrollRef.current += delta * (1.5 + bassEnergy * 3) * dm

    // Animate wireframe grid layers
    layersRef.current.forEach((mesh, layer) => {
      if (!mesh) return
      const geo = layerGeometries[layer]
      const pos = geo.attributes.position as THREE.BufferAttribute
      const col = geo.attributes.color as THREE.BufferAttribute
      const pArr = pos.array as Float32Array
      const cArr = col.array as Float32Array
      const layerDepth = (layer - 1) * 2.5

      for (let i = 0; i < pos.count; i++) {
        const x = pArr[i * 3]
        const y = pArr[i * 3 + 1]
        const colNorm = (x + halfW) / (halfW * 2)
        const rowNorm = (y + halfH) / (halfH * 2)
        const scrollY = y - scrollRef.current * (0.8 + layer * 0.3)

        let z = layerDepth

        if (visualStyle === 0) {
          z += Math.sin(colNorm * 6 + scrollY * 0.3 + t * 2) * (0.2 + bassEnergy * 0.8) * dm
          z += Math.sin(rowNorm * 4 - t * 3) * subBass * 0.3
          if (bassImpact > 0.4) {
            const cellHash = Math.sin(Math.floor(colNorm * 20) * 127.1) * 43758.5453
            const cellVal = cellHash - Math.floor(cellHash)
            if (cellVal > 0.85) z += bassImpact * 1.5 * dm
          }
        } else if (visualStyle === 1) {
          const sweep = Math.sin(colNorm * Math.PI * 2 - t * 2) * 0.5 + 0.5
          z += sweep * (0.3 + bassEnergy * 1.2) * dm
          z += Math.cos(scrollY * 0.5 + t * 1.5) * subBass * 0.4
        } else {
          const cellX = Math.floor(colNorm * 15)
          const cellY = Math.floor(rowNorm * 20)
          const cellHash = Math.sin(cellX * 127.1 + cellY * 311.7) * 43758.5453
          const cellVal = cellHash - Math.floor(cellHash)
          const glitch = Math.sin(t * 8 + cellVal * 30) > 0.7 ? 1 : 0
          z += glitch * bassEnergy * 1.5 * dm + cellVal * subBass * 0.4
          z += Math.sin(cellVal * 10 + t * 5) * bassImpact * 0.5
        }

        pArr[i * 3 + 2] = z

        const depth = Math.abs(z - layerDepth)
        const ct = ((scrollY * 0.05 + colNorm * 0.3 + t * 0.03 + layer * 0.2) % 1 + 1) % 1
        if (ct < 0.5) tc.lerpColors(palette.a, palette.b, ct * 2)
        else tc.lerpColors(palette.b, palette.c, (ct - 0.5) * 2)
        const bri = 0.12 + depth * 0.35 + rowNorm * 0.12 + bassEnergy * 0.1
        cArr[i * 3] = tc.r * bri
        cArr[i * 3 + 1] = tc.g * bri
        cArr[i * 3 + 2] = tc.b * bri
      }

      pos.needsUpdate = true
      col.needsUpdate = true
      layerMaterials[layer].opacity = (layer === 1 ? 0.4 : 0.15) + bassEnergy * 0.12
    })

    // Animate falling wireframe shapes
    shapesRef.current.forEach((mesh, i) => {
      if (!mesh) return
      const speed = shapeMeta[i * 5 + 2]
      const phase = shapeMeta[i * 5 + 3]

      shapeMeta[i * 5 + 1] -= delta * speed * (1 + bassEnergy * 2) * dm
      if (shapeMeta[i * 5 + 1] < -halfH - 2) {
        shapeMeta[i * 5 + 1] = halfH + 2 + Math.random() * 4
        shapeMeta[i * 5] = (Math.random() - 0.5) * halfW * 2
      }

      mesh.position.set(shapeMeta[i * 5], shapeMeta[i * 5 + 1], shapeMeta[i * 5 + 4])
      mesh.rotation.x = t * 1.5 + phase
      mesh.rotation.y = t + phase * 0.5
      const pulse = 1 + bassImpact * 0.5 + Math.sin(t * 3 + phase) * bassEnergy * 0.3
      mesh.scale.setScalar(pulse)

      const ct = (i / FALLING_SHAPES + t * 0.06) % 1
      if (ct < 0.5) tc.lerpColors(palette.a, palette.b, ct * 2)
      else tc.lerpColors(palette.b, palette.c, (ct - 0.5) * 2)
      shapeMaterials[i].color.copy(tc)
      shapeMaterials[i].opacity = 0.15 + bassEnergy * 0.2 + bassImpact * 0.1
    })

    // Animate scan lines sweeping vertically
    scanRef.current.forEach((line, i) => {
      if (!line) return
      const speed = 0.4 + i * 0.2
      const y = ((t * speed * 2 + i * halfH * 0.5) % (halfH * 2.5)) - halfH * 1.25
      line.position.y = y
      line.position.z = -1 + i * 0.5
      scanMaterials[i].opacity = 0.05 + bassEnergy * 0.06
      scanMaterials[i].color.copy(palette.a)
    })
  })

  return (
    <group ref={groupRef}>
      {layerGeometries.map((geo, i) => (
        <mesh
          key={`layer-${i}`}
          ref={(el: any) => { if (el) layersRef.current[i] = el }}
          geometry={geo}
          material={layerMaterials[i]}
          position={[0, 0, (i - 1) * 2.5]}
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
      {scanGeometries.map((geo, i) => (
        <line
          key={`scan-${i}`}
          // @ts-expect-error - R3F line element
          ref={(el: any) => { if (el) scanRef.current[i] = el }}
          geometry={geo}
          material={scanMaterials[i]}
        />
      ))}
    </group>
  )
}
