"use client"

import { useRef, useCallback, useEffect, useState, lazy, Suspense } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { EffectComposer, Bloom } from "@react-three/postprocessing"
import { type ColorMode, COLOR_MODE_LIST } from "@/lib/color-palettes"
import ControlsOverlay from "./controls-overlay"
import { AudioAnalyzer, type AudioDeviceInfo, type AudioSourceType } from "@/lib/audio-analyzer"

const TunnelScene = lazy(() => import("./tunnel-scene"))
const WaveformScene = lazy(() => import("./waveform-scene"))
const SphereScene = lazy(() => import("./sphere-scene"))
const TripleTorusScene = lazy(() => import("./triple-torus-scene"))
const GalaxyScene = lazy(() => import("./galaxy-scene"))
const FractalScene = lazy(() => import("./fractal-scene"))
const RingsScene = lazy(() => import("./rings-scene"))
const TerrainScene = lazy(() => import("./terrain-scene"))
const MatrixScene = lazy(() => import("./matrix-scene"))
const VortexScene = lazy(() => import("./vortex-scene"))

// ────────────────────────────────────────
// Scene definitions
// ────────────────────────────────────────
export const SCENE_LIST = [
  { id: "tunnel", label: "Tunnel" },
  { id: "waveform", label: "Plasma" },
  { id: "sphere", label: "Sphere" },
  { id: "tripleTorus", label: "Double torus" },
  { id: "galaxy", label: "Galaxy" },
  { id: "fractal", label: "Flower" },
  { id: "rings", label: "Rings" },
  { id: "terrain", label: "Terrain" },
  { id: "matrix", label: "Matrix" },
  { id: "vortex", label: "Vortex" },
] as const

export type SceneId = (typeof SCENE_LIST)[number]["id"]

// ────────────────────────────────────────
// Shared audio state (bridged into R3F)
// ────────────────────────────────────────
interface AudioState {
  bass: number
  subBass: number
  mid: number
  high: number
  bassEnergy: number
  bassImpact: number
}

const DEFAULT_AUDIO: AudioState = { bass: 0, subBass: 0, mid: 0, high: 0, bassEnergy: 0, bassImpact: 0 }

/**
 * AudioBridge updates a ref every frame (zero-cost) and throttles
 * React state updates to ~20fps to avoid overwhelming the main thread.
 * This prevents AudioContext suspension from excessive re-renders.
 */
function AudioBridge({
  analyzer,
  audioRef,
  onUpdate,
  onSensitivityFeedback,
}: {
  analyzer: AudioAnalyzer
  audioRef: React.MutableRefObject<AudioState>
  onUpdate: (data: AudioState) => void
  onSensitivityFeedback?: (v: number) => void
}) {
  const frameCount = useRef(0)
  const lastFedSens = useRef(-1)
  useFrame(() => {
    const data = analyzer.update()
    audioRef.current = data
    frameCount.current++
    if (frameCount.current % 3 === 0) {
      onUpdate(data)
      // Feed back auto-gain adjusted sensitivity to React state (~20fps)
      if (analyzer.autoGain && onSensitivityFeedback) {
        const s = Math.round(analyzer.sensitivity * 20) / 20 // snap to 0.05 steps
        if (s !== lastFedSens.current) {
          lastFedSens.current = s
          onSensitivityFeedback(s)
        }
      }
    }
  })
  return null
}

// ────────────────────────────────────────
// Idle animation provider
// ────────────────────────────────────────
function IdleAnimation({
  audioRef,
  onUpdate,
  active,
}: {
  audioRef: React.MutableRefObject<AudioState>
  onUpdate: (data: AudioState) => void
  active: boolean
}) {
  const timeRef = useRef(0)
  const frameCount = useRef(0)
  useFrame((_, delta) => {
    if (active) return
    timeRef.current += delta
    const t = timeRef.current
    const bassVal = 0.25 + Math.sin(t * 1.2) * 0.15 + Math.sin(t * 0.4) * 0.1
    const subBassVal = 0.2 + Math.sin(t * 0.8) * 0.1
    const data: AudioState = {
      bass: bassVal,
      subBass: subBassVal,
      mid: 0.2 + Math.sin(t * 1.8 + 1) * 0.15 + Math.cos(t * 0.7) * 0.05,
      high: 0.15 + Math.sin(t * 2.5 + 2) * 0.1 + Math.sin(t * 1.1) * 0.05,
      bassEnergy: bassVal * 0.7 + subBassVal * 0.3,
      bassImpact: Math.max(0, Math.sin(t * 0.5) * 0.3),
    }
    audioRef.current = data
    frameCount.current++
    if (frameCount.current % 3 === 0) {
      onUpdate(data)
    }
  })
  return null
}

// ────────────────────────────────────────
// Camera shake on bass hits (reads from ref for instant response)
// ────────────────────────────────────────
function CameraShake({ audioRef }: { audioRef: React.MutableRefObject<AudioState> }) {
  useFrame(({ camera }) => {
    const { bassImpact, subBass } = audioRef.current
    if (bassImpact > 0.5) {
      const intensity = bassImpact * 0.012
      camera.position.x += (Math.random() - 0.5) * intensity
      camera.position.y += (Math.random() - 0.5) * intensity
      camera.rotation.z += (Math.random() - 0.5) * intensity * 0.15
    }
    if (subBass > 0.3) {
      camera.position.z += Math.sin(Date.now() * 0.001) * subBass * 0.008
    }
  })
  return null
}

// ────────────────────────────────────────
// Scene renderer
// ────────────────────────────────────────
function ActiveScene({
  sceneId,
  ...props
}: {
  sceneId: SceneId
  bass: number
  subBass: number
  mid: number
  high: number
  bassEnergy: number
  bassImpact: number
  colorMode: ColorMode
  dropMode: boolean
  visualStyle: number
}) {
  switch (sceneId) {
    case "tunnel":
      return <TunnelScene {...props} />
    case "waveform":
      return <WaveformScene {...props} />
    case "sphere":
      return <SphereScene {...props} />
    case "tripleTorus":
      return <TripleTorusScene {...props} />
    case "galaxy":
      return <GalaxyScene {...props} />
    case "fractal":
      return <FractalScene {...props} />
    case "rings":
      return <RingsScene {...props} />
    case "terrain":
      return <TerrainScene {...props} />
    case "matrix":
      return <MatrixScene {...props} />
    case "vortex":
      return <VortexScene {...props} />
    default:
      return <TunnelScene {...props} />
  }
}

// ────────────────────────────────────────
// Main Visualizer Component
// ────────────────────────────────────────
export default function VisualizerCanvas() {
  const analyzerRef = useRef(new AudioAnalyzer())
  const [isActive, setIsActive] = useState(false)
  const [sourceType, setSourceType] = useState<AudioSourceType | null>(null)
  const [sensitivity, setSensitivity] = useState(1.0)
  const [colorMode, setColorMode] = useState<ColorMode>("euphoria")
  const [visualStyle, setVisualStyle] = useState(0)
  const [dropMode, setDropMode] = useState(false)
  const [activeScene, setActiveScene] = useState<SceneId>("tunnel")
  const [devices, setDevices] = useState<AudioDeviceInfo[]>([])
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [autoRotate, setAutoRotate] = useState(false)
  const [autoGain, setAutoGain] = useState(false)
  const [djName, setDjName] = useState("")

  // ── Scene transition state ──
  const [renderedScene, setRenderedScene] = useState<SceneId>("tunnel")
  const [transitionOpacity, setTransitionOpacity] = useState(0)
  const transitionRef = useRef<{ active: boolean; phase: "out" | "in"; start: number; targetScene: SceneId } | null>(null)
  const TRANSITION_DURATION = 600 // ms per half (total = 1.2s)

  // Intercept scene changes to trigger transition
  const changeScene = useCallback((newScene: SceneId) => {
    setActiveScene((prev) => {
      if (prev === newScene) return prev
      // If mid-transition, immediately swap to the new target
      if (transitionRef.current?.active) {
        setRenderedScene(newScene)
        transitionRef.current = { active: true, phase: "in", start: performance.now(), targetScene: newScene }
      } else {
        // Start fade-out transition
        transitionRef.current = { active: true, phase: "out", start: performance.now(), targetScene: newScene }
      }
      return newScene
    })
  }, [])

  // Run transition animation via requestAnimationFrame
  useEffect(() => {
    let raf: number
    const tick = () => {
      const t = transitionRef.current
      if (!t || !t.active) { raf = requestAnimationFrame(tick); return }
      const elapsed = performance.now() - t.start

      if (t.phase === "out") {
        const progress = Math.min(elapsed / TRANSITION_DURATION, 1)
        setTransitionOpacity(progress)
        if (progress >= 1) {
          // At peak darkness, swap the rendered scene
          setRenderedScene(t.targetScene)
          transitionRef.current = { active: true, phase: "in", start: performance.now(), targetScene: t.targetScene }
        }
      } else {
        const progress = Math.min(elapsed / TRANSITION_DURATION, 1)
        setTransitionOpacity(1 - progress)
        if (progress >= 1) {
          transitionRef.current = null
          setTransitionOpacity(0)
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Audio data ref: updated every frame inside R3F (no React re-renders)
  const audioRef = useRef<AudioState>(DEFAULT_AUDIO)
  // Throttled React state (~20fps) for DOM UI and Bloom
  const [audioState, setAudioState] = useState<AudioState>(DEFAULT_AUDIO)

  const handleAudioUpdate = useCallback((data: AudioState) => {
    setAudioState(data)
  }, [])

  // ── Source handlers ──

  const handleStop = useCallback(() => {
    analyzerRef.current.stop()
    setIsActive(false)
    setSourceType(null)
    setAudioElement(null)
    setFileName(null)
    audioRef.current = DEFAULT_AUDIO
  }, [])

  // Register the onStop callback so the analyzer can notify us if the
  // audio device disconnects or the stream track ends unexpectedly
  useEffect(() => {
    analyzerRef.current.onStop = () => {
      setIsActive(false)
      setSourceType(null)
      setAudioElement(null)
      setFileName(null)
      audioRef.current = DEFAULT_AUDIO
    }
    return () => {
      analyzerRef.current.onStop = null
    }
  }, [])

  const handleStartDevice = useCallback(async (deviceId?: string) => {
    const ok = await analyzerRef.current.startDevice(deviceId)
    setIsActive(ok)
    setSourceType(ok ? "device" : null)
    setAudioElement(null)
    setFileName(null)
  }, [])

  const handleStartTab = useCallback(async () => {
    const ok = await analyzerRef.current.startTab()
    setIsActive(ok)
    setSourceType(ok ? "tab" : null)
    setAudioElement(null)
    setFileName(null)
  }, [])

  const handleStartFile = useCallback(async (file: File) => {
    const ok = await analyzerRef.current.startFile(file)
    setIsActive(ok)
    setSourceType(ok ? "file" : null)
    if (ok) {
      setAudioElement(analyzerRef.current.getAudioElement())
      setFileName(file.name)
    } else {
      setAudioElement(null)
      setFileName(null)
    }
  }, [])

  const handleRefreshDevices = useCallback(async () => {
    const devs = await AudioAnalyzer.getDevices()
    setDevices(devs)
  }, [])

  // Sensitivity sync
  useEffect(() => {
    analyzerRef.current.sensitivity = sensitivity
  }, [sensitivity])

  // Auto-gain sync
  useEffect(() => {
    analyzerRef.current.autoGain = autoGain
  }, [autoGain])

  // When user manually changes sensitivity, turn off auto-gain
  const handleManualSensitivity = useCallback((v: number) => {
    setAutoGain(false)
    setSensitivity(v)
  }, [])

  const toggleAutoGain = useCallback(() => {
    setAutoGain((prev) => !prev)
  }, [])

  // Scene cycling
  const cycleScene = useCallback((direction: 1 | -1) => {
    const idx = SCENE_LIST.findIndex((s) => s.id === activeScene)
    const next = (idx + direction + SCENE_LIST.length) % SCENE_LIST.length
    changeScene(SCENE_LIST[next].id)
  }, [activeScene, changeScene])

  // ── Drag and drop ──
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)

      const file = e.dataTransfer.files?.[0]
      if (file && file.type.startsWith("audio/")) {
        handleStartFile(file)
      }
    },
    [handleStartFile]
  )

  // ── Keyboard controls ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return
      switch (e.code) {
        case "Space":
          e.preventDefault()
          setDropMode(true)
          break
        case "Digit1":
          setVisualStyle(0)
          break
        case "Digit2":
          setVisualStyle(1)
          break
        case "Digit3":
          setVisualStyle(2)
          break
        case "KeyM":
          if (isActive) {
            handleStop()
          } else {
            handleStartDevice()
          }
          break
        case "Equal":
        case "NumpadAdd":
          setAutoGain(false)
          setSensitivity((s) => Math.min(3, s + 0.2))
          break
        case "Minus":
        case "NumpadSubtract":
          setAutoGain(false)
          setSensitivity((s) => Math.max(0.1, s - 0.2))
          break
        case "BracketRight":
          cycleScene(1)
          break
        case "BracketLeft":
          cycleScene(-1)
          break
      }
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setDropMode(false)
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
    }
  }, [isActive, handleStop, handleStartDevice, cycleScene])

  // Auto-rotate timer: randomize scene + color + style every 15s
  // Sensitivity is no longer randomized — auto-gain handles it when enabled
  useEffect(() => {
    if (!autoRotate) return
    const interval = setInterval(() => {
      const colorModes = COLOR_MODE_LIST
      const randomScene = SCENE_LIST[Math.floor(Math.random() * SCENE_LIST.length)].id
      const randomColor = colorModes[Math.floor(Math.random() * colorModes.length)]
      const randomStyle = Math.floor(Math.random() * 3) // 0, 1, or 2

      changeScene(randomScene)
      setColorMode(randomColor)
      setVisualStyle(randomStyle)
    }, 15000)
    return () => clearInterval(interval)
  }, [autoRotate, changeScene])

  const toggleAutoRotate = useCallback(() => {
    setAutoRotate((prev) => !prev)
  }, [])

  // Resume AudioContext on any user interaction (browsers require user gesture)
  useEffect(() => {
    const resume = () => {
      analyzerRef.current.ensureContextRunning()
    }
    window.addEventListener("click", resume, { passive: true })
    window.addEventListener("touchstart", resume, { passive: true })
    window.addEventListener("keydown", resume, { passive: true })
    return () => {
      window.removeEventListener("click", resume)
      window.removeEventListener("touchstart", resume)
      window.removeEventListener("keydown", resume)
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      analyzerRef.current.stop()
    }
  }, [])

  return (
    <div
      className="fixed inset-0 bg-[#030303]"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Canvas
        camera={{ position: [0, 0, 5], fov: 75, near: 0.1, far: 100 }}
        dpr={[1, 1.5]}
        gl={{ antialias: false, alpha: false, powerPreference: "high-performance" }}
        style={{ background: "#030303" }}
      >
        {/* Audio bridge: updates ref every frame, throttles React state to ~20fps */}
        <AudioBridge analyzer={analyzerRef.current} audioRef={audioRef} onUpdate={handleAudioUpdate} onSensitivityFeedback={autoGain ? setSensitivity : undefined} />
        <IdleAnimation audioRef={audioRef} onUpdate={handleAudioUpdate} active={isActive} />
        <CameraShake
          audioRef={audioRef}
          intensityScale={renderedScene === "tripleTorus" ? 0.3 : 1}
        />

        {/* Scene */}
        <fog attach="fog" args={["#030303", 5, 40]} />
        <ambientLight intensity={0.1} />

        <Suspense fallback={null}>
          <ActiveScene
            sceneId={renderedScene}
            bass={audioState.bass}
            subBass={audioState.subBass}
            mid={audioState.mid}
            high={audioState.high}
            bassEnergy={audioState.bassEnergy}
            bassImpact={audioState.bassImpact}
            colorMode={colorMode}
            dropMode={dropMode}
            visualStyle={visualStyle}
          />
        </Suspense>

        {/* Post-processing bloom - tuned for comfortable viewing */}
        <EffectComposer>
          <Bloom
            intensity={
              0.5 +
              audioState.bassEnergy * 0.6 +
              audioState.subBass * 0.2 +
              audioState.bassImpact * 0.15 +
              (renderedScene === "tripleTorus" ? 0.16 + audioState.bassEnergy * 0.12 : 0)
            }
            luminanceThreshold={renderedScene === "tripleTorus" ? 0.36 : 0.45}
            luminanceSmoothing={0.9}
            mipmapBlur
          />
        </EffectComposer>
      </Canvas>

      {/* Vignette overlay */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.7) 100%)",
        }}
      />

      {/* Scene transition overlay */}
      {transitionOpacity > 0 && (
        <div
          className="pointer-events-none fixed inset-0 z-30"
          style={{ backgroundColor: `rgba(3, 3, 3, ${transitionOpacity})` }}
        />
      )}

      {/* DJ Name — HTML overlay, immune to camera shake / 3D effects */}
      {djName && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center">
          <span
            className="select-none text-center font-bold uppercase tracking-[0.25em]"
            style={{
              fontSize: "clamp(3rem, 10vw, 8rem)",
              color: "white",
              animation: "dj-pulse 3s ease-in-out infinite",
            }}
          >
            {djName}
          </span>
          <style>{`
            @keyframes dj-pulse {
              0%, 100% { transform: scale(1); opacity: 0.95; }
              50% { transform: scale(1.03); opacity: 1; }
            }
          `}</style>
        </div>
      )}

      {/* Drop mode flash overlay */}
      {dropMode && (
        <div
          className="pointer-events-none fixed inset-0 animate-pulse"
          style={{
            background: "radial-gradient(ellipse at center, rgba(255,255,255,0.03) 0%, transparent 60%)",
          }}
        />
      )}

      {/* Drag and drop overlay */}
      {isDragging && (
        <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-[#030303]/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-[#00ff8850] bg-[#00ff8808] px-12 py-10">
            <div className="text-3xl text-[#00ff88]">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </div>
            <span className="text-sm font-medium text-[#00ff88]">Drop audio file to play</span>
            <span className="text-[10px] uppercase tracking-widest text-[#00ff8866]">MP3, WAV, FLAC, OGG</span>
          </div>
        </div>
      )}

      {/* UI Controls */}
      <ControlsOverlay
        micActive={isActive}
        sourceType={sourceType}
        onStartDevice={handleStartDevice}
        onStartTab={handleStartTab}
        onStartFile={handleStartFile}
        onStop={handleStop}
        devices={devices}
        onRefreshDevices={handleRefreshDevices}
        sensitivity={sensitivity}
        onSensitivityChange={handleManualSensitivity}
        autoGain={autoGain}
        onAutoGainToggle={toggleAutoGain}
        colorMode={colorMode}
        onColorModeChange={setColorMode}
        visualStyle={visualStyle}
        bass={audioState.bass}
        subBass={audioState.subBass}
        mid={audioState.mid}
        high={audioState.high}
        bassEnergy={audioState.bassEnergy}
        bassImpact={audioState.bassImpact}
        activeScene={activeScene}
        onSceneChange={changeScene}
        audioElement={audioElement}
        fileName={fileName}
        autoRotate={autoRotate}
        onAutoRotateToggle={toggleAutoRotate}
        djName={djName}
        onDjNameChange={setDjName}
      />
    </div>
  )
}
