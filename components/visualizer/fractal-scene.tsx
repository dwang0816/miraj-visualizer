"use client"

import { useRef, useMemo, useEffect, memo } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { COLOR_PALETTES, type ColorMode } from "@/lib/color-palettes"

interface FractalSceneProps {
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

const DEPTH = 4
const BRANCHES = 5

interface FNode {
  ox: number; oy: number; oz: number
  depth: number
  parentIdx: number
  scale: number
}

function buildTree(): FNode[] {
  const nodes: FNode[] = [{ ox: 0, oy: 0, oz: 0, depth: 0, parentIdx: -1, scale: 1 }]

  for (let d = 1; d < DEPTH; d++) {
    const parents = nodes.filter(n => n.depth === d - 1)
    const parentStart = nodes.length - parents.length

    for (let p = 0; p < parents.length; p++) {
      const parent = parents[p]
      const pIdx = parentStart + p
      const childCount = d === 1 ? BRANCHES : Math.max(2, BRANCHES - d)
      const armLen = parent.scale * (2.0 - d * 0.25)
      const childScale = parent.scale * (0.5 - d * 0.04)

      for (let c = 0; c < childCount; c++) {
        const angle = (c / childCount) * Math.PI * 2 + d * 0.4
        const elev = (c % 2 === 0 ? 1 : -1) * (0.4 + d * 0.15)
        nodes.push({
          ox: parent.ox + Math.cos(angle) * armLen,
          oy: parent.oy + Math.sin(angle) * armLen * elev,
          oz: parent.oz + Math.sin(angle * 2) * armLen * 0.5,
          depth: d,
          parentIdx: pIdx,
          scale: childScale,
        })
      }
    }
  }
  return nodes
}

function FractalScene({ bass, subBass, mid, high, bassEnergy, bassImpact, colorMode, dropMode, visualStyle }: FractalSceneProps) {
  const groupRef = useRef<THREE.Group>(null)
  const wireShapesRef = useRef<THREE.Mesh[]>([])
  const connectionsRef = useRef<THREE.LineSegments>(null)
  const timeRef = useRef(0)
  const tmpColor = useRef(new THREE.Color())

  const nodes = useMemo(() => buildTree(), [])

  // Pre-allocate the animated positions buffer once (avoids per-frame allocation)
  const animPosRef = useRef<Float32Array | null>(null)
  if (!animPosRef.current || animPosRef.current.length !== nodes.length * 3) {
    animPosRef.current = new Float32Array(nodes.length * 3)
  }

  // A wireframe shape at each node — icosahedron scaled by node.scale
  const shapeGeometries = useMemo(() => {
    return nodes.map(node => {
      const size = Math.max(0.08, node.scale * 0.6)
      if (node.depth === 0) return new THREE.IcosahedronGeometry(size * 1.5, 1)
      if (node.depth % 2 === 0) return new THREE.OctahedronGeometry(size, 0)
      return new THREE.IcosahedronGeometry(size, 0)
    })
  }, [nodes])

  const shapeMaterials = useMemo(() => {
    return nodes.map(() =>
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        wireframe: true,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
      })
    )
  }, [nodes])

  // Connection lines between parent and child
  const connectionGeometry = useMemo(() => {
    const conns = nodes.filter(n => n.parentIdx >= 0)
    const pos = new Float32Array(conns.length * 6)
    const colors = new Float32Array(conns.length * 6)

    conns.forEach((node, i) => {
      const parent = nodes[node.parentIdx]
      pos[i * 6] = parent.ox; pos[i * 6 + 1] = parent.oy; pos[i * 6 + 2] = parent.oz
      pos[i * 6 + 3] = node.ox; pos[i * 6 + 4] = node.oy; pos[i * 6 + 5] = node.oz
      for (let c = 0; c < 6; c++) colors[i * 6 + c] = 0.3
    })

    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3))
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3))
    return geo
  }, [nodes])

  const connectionMaterial = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
      }),
    []
  )

  // Precompute connection node indices for animation
  const connIndices = useMemo(() => {
    const conns = nodes.filter(n => n.parentIdx >= 0)
    return conns.map(n => ({
      parentIdx: n.parentIdx,
      childIdx: nodes.indexOf(n),
      depth: n.depth,
    }))
  }, [nodes])

  useEffect(() => {
    return () => {
      shapeGeometries.forEach(g => g.dispose())
      shapeMaterials.forEach(m => m.dispose())
      connectionGeometry.dispose()
      connectionMaterial.dispose()
    }
  }, [shapeGeometries, shapeMaterials, connectionGeometry, connectionMaterial])

  useFrame((_, delta) => {
    timeRef.current += delta
    const t = timeRef.current
    const palette = COLOR_PALETTES[colorMode]
    const dm = dropMode ? 1.5 : 1
    const tc = tmpColor.current

    // Reuse pre-allocated buffer for animated positions
    const animPos = animPosRef.current!

    // Animate wireframe shapes at each node
    wireShapesRef.current.forEach((mesh, i) => {
      if (!mesh) return
      const node = nodes[i]
      const depthNorm = node.depth / DEPTH
      const dist = Math.sqrt(node.ox * node.ox + node.oy * node.oy + node.oz * node.oz)

      let breathScale = 1
      let rotAngle = 0

      if (visualStyle === 0) {
        breathScale = 1 + bassEnergy * (0.1 + depthNorm * 0.15) * dm
        rotAngle = t * 0.2 * (1 - depthNorm * 0.4) + bassImpact * 0.1
      } else if (visualStyle === 1) {
        const wave = Math.sin(dist * 1.5 - t * 2) * 0.5 + 0.5
        breathScale = 1 + wave * bassEnergy * 0.2 * dm + subBass * 0.08
        rotAngle = t * 0.15 + wave * bassEnergy * 0.2
      } else {
        breathScale = 1 + Math.sin(t * 1.5 + depthNorm * Math.PI * 3) * bassEnergy * 0.15 * dm
        rotAngle = t * 0.3 * (node.depth % 2 === 0 ? 1 : -1) + bassImpact * 0.15
      }

      const cosR = Math.cos(rotAngle * (1 + depthNorm))
      const sinR = Math.sin(rotAngle * (1 + depthNorm))
      const rx = node.ox * cosR - node.oz * sinR
      const rz = node.ox * sinR + node.oz * cosR

      const px = rx * breathScale
      const py = node.oy * breathScale
      const pz = rz * breathScale

      mesh.position.set(px, py, pz)
      animPos[i * 3] = px
      animPos[i * 3 + 1] = py
      animPos[i * 3 + 2] = pz

      // Each shape rotates on its own axis
      mesh.rotation.x = t * 0.3 * (i % 2 === 0 ? 1 : -1) + bassEnergy * 0.2
      mesh.rotation.y = t * 0.2 + i * 0.5
      mesh.rotation.z = Math.sin(t * 0.4 + i * 0.3) * 0.3

      // Color by depth
      const ct = (depthNorm + t * 0.06) % 1
      if (ct < 0.33) tc.lerpColors(palette.a, palette.b, ct * 3)
      else if (ct < 0.66) tc.lerpColors(palette.b, palette.c, (ct - 0.33) * 3)
      else tc.lerpColors(palette.c, palette.a, (ct - 0.66) * 3)

      shapeMaterials[i].color.copy(tc)
      shapeMaterials[i].opacity = 0.2 + (1 - depthNorm) * 0.3 + bassEnergy * 0.08 * dm
    })

    // Update connection lines to follow animated positions
    if (connectionsRef.current) {
      const pos = connectionsRef.current.geometry.attributes.position as THREE.BufferAttribute
      const col = connectionsRef.current.geometry.attributes.color as THREE.BufferAttribute
      const pArr = pos.array as Float32Array
      const cArr = col.array as Float32Array

      connIndices.forEach((conn, i) => {
        pArr[i * 6] = animPos[conn.parentIdx * 3]
        pArr[i * 6 + 1] = animPos[conn.parentIdx * 3 + 1]
        pArr[i * 6 + 2] = animPos[conn.parentIdx * 3 + 2]
        pArr[i * 6 + 3] = animPos[conn.childIdx * 3]
        pArr[i * 6 + 4] = animPos[conn.childIdx * 3 + 1]
        pArr[i * 6 + 5] = animPos[conn.childIdx * 3 + 2]

        const depthNorm = conn.depth / DEPTH
        const ct = (depthNorm + t * 0.05) % 1
        if (ct < 0.5) tc.lerpColors(palette.a, palette.b, ct * 2)
        else tc.lerpColors(palette.b, palette.c, (ct - 0.5) * 2)
        const bri = 0.2 + bassEnergy * 0.12 * dm
        cArr[i * 6] = tc.r * bri; cArr[i * 6 + 1] = tc.g * bri; cArr[i * 6 + 2] = tc.b * bri
        cArr[i * 6 + 3] = tc.r * bri * 0.5; cArr[i * 6 + 4] = tc.g * bri * 0.5; cArr[i * 6 + 5] = tc.b * bri * 0.5
      })
      pos.needsUpdate = true
      col.needsUpdate = true
      connectionMaterial.opacity = 0.2 + bassEnergy * 0.1
    }

    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.1 * (1 + bassEnergy * 0.15)
      groupRef.current.rotation.x = Math.sin(t * 0.12) * 0.15
    }
  })

  return (
    <group ref={groupRef}>
      {shapeGeometries.map((geo, i) => (
        <mesh
          key={`fnode-${i}`}
          ref={(el: any) => { if (el) wireShapesRef.current[i] = el }}
          geometry={geo}
          material={shapeMaterials[i]}
        />
      ))}
      <lineSegments ref={connectionsRef} geometry={connectionGeometry} material={connectionMaterial} />
    </group>
  )
}

export default memo(FractalScene)
