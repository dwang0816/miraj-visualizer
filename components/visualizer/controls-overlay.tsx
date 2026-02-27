"use client"

import { useState, useRef, useEffect } from "react"
import {
  Mic,
  MicOff,
  ChevronUp,
  ChevronDown,
  Keyboard,
  ChevronLeft,
  ChevronRight,
  Monitor,
  Music,
  Play,
  Pause,
  SkipBack,
  Volume2,
  Upload,
} from "lucide-react"
import type { ColorMode } from "@/lib/color-palettes"
import { SCENE_LIST, type SceneId } from "./visualizer-canvas"
import type { AudioSourceType, AudioDeviceInfo } from "@/lib/audio-analyzer"

interface ControlsOverlayProps {
  micActive: boolean
  sourceType: AudioSourceType | null
  onStartDevice: (deviceId?: string) => void
  onStartTab: () => void
  onStartFile: (file: File) => void
  onStop: () => void
  devices: AudioDeviceInfo[]
  onRefreshDevices: () => void
  sensitivity: number
  onSensitivityChange: (v: number) => void
  colorMode: ColorMode
  onColorModeChange: (mode: ColorMode) => void
  visualStyle: number
  bass: number
  subBass: number
  mid: number
  high: number
  bassEnergy: number
  bassImpact: number
  activeScene: SceneId
  onSceneChange: (scene: SceneId) => void
  audioElement: HTMLAudioElement | null
  fileName: string | null
  autoRotate: boolean
  onAutoRotateToggle: () => void
  djName: string
  onDjNameChange: (name: string) => void
}

const COLOR_OPTIONS: { value: ColorMode; label: string; swatch: string }[] = [
  { value: "neon", label: "Neon", swatch: "#00ffff" },
  { value: "inferno", label: "Inferno", swatch: "#ff6600" },
  { value: "arctic", label: "Arctic", swatch: "#00ccff" },
  { value: "ultraviolet", label: "UV", swatch: "#cc00ff" },
  { value: "emerald", label: "Emerald", swatch: "#00ff66" },
  { value: "sunset", label: "Sunset", swatch: "#ffaa22" },
]

const SCENE_ICONS: Record<SceneId, string> = {
  tunnel: "\u25CE",
  waveform: "\u2261",
  sphere: "\u25CF",
  helix: "\u2742",
  galaxy: "\u2726",
  fractal: "\u2698",
  rings: "\u25D4",
  terrain: "\u25A6",
  matrix: "\u2593",
  vortex: "\u058D",
}

export default function ControlsOverlay({
  micActive,
  sourceType,
  onStartDevice,
  onStartTab,
  onStartFile,
  onStop,
  devices,
  onRefreshDevices,
  sensitivity,
  onSensitivityChange,
  colorMode,
  onColorModeChange,
  visualStyle,
  bass,
  subBass,
  mid,
  high,
  bassEnergy,
  bassImpact,
  activeScene,
  onSceneChange,
  audioElement,
  fileName,
  autoRotate,
  onAutoRotateToggle,
  djName,
  onDjNameChange,
}: ControlsOverlayProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [showKeys, setShowKeys] = useState(false)
  const [showSourcePanel, setShowSourcePanel] = useState(false)
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("")
  const [isPlaying, setIsPlaying] = useState(true)
  const [connectedDeviceLabel, setConnectedDeviceLabel] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Auto-load devices when source panel opens
  useEffect(() => {
    if (showSourcePanel) {
      onRefreshDevices()
    }
  }, [showSourcePanel, onRefreshDevices])

  const currentSceneIndex = SCENE_LIST.findIndex((s) => s.id === activeScene)

  const cycleScene = (direction: 1 | -1) => {
    const next = (currentSceneIndex + direction + SCENE_LIST.length) % SCENE_LIST.length
    onSceneChange(SCENE_LIST[next].id)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onStartFile(file)
      setShowSourcePanel(false)
    }
  }

  const togglePlayPause = () => {
    if (!audioElement) return
    if (audioElement.paused) {
      audioElement.play()
      setIsPlaying(true)
    } else {
      audioElement.pause()
      setIsPlaying(false)
    }
  }

  const restartTrack = () => {
    if (!audioElement) return
    audioElement.currentTime = 0
    audioElement.play()
    setIsPlaying(true)
  }

  const sourceLabel =
    sourceType === "device"
      ? "Device"
      : sourceType === "tab"
        ? "Tab Audio"
        : sourceType === "file"
          ? "File"
          : "Off"

  const sourceColor =
    sourceType === "device"
      ? "#00ffff"
      : sourceType === "tab"
        ? "#ff71ce"
        : sourceType === "file"
          ? "#00ff88"
          : "#666"

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex flex-col items-center pb-4 pointer-events-none">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Keyboard hint tooltip */}
      {showKeys && (
        <div className="pointer-events-auto mb-3 rounded-lg border border-[#ffffff15] bg-[#0a0a0a]/90 px-5 py-3 text-xs text-[#aaa] backdrop-blur-md">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
            <span className="text-[#666]">Space</span>
            <span>Drop mode (hold)</span>
            <span className="text-[#666]">1 / 2 / 3</span>
            <span>Switch visual style</span>
            <span className="text-[#666]">{"[ / ]"}</span>
            <span>Prev / Next scene</span>
            <span className="text-[#666]">M</span>
            <span>Toggle audio source</span>
            <span className="text-[#666]">+{"/"}-</span>
            <span>Adjust sensitivity</span>
          </div>
        </div>
      )}

      {/* Audio source panel */}
      {showSourcePanel && (
        <div className="pointer-events-auto mb-3 w-80 rounded-xl border border-[#ffffff12] bg-[#0a0a0a]/95 p-4 backdrop-blur-xl">
          <div className="mb-3 text-[10px] uppercase tracking-widest text-[#666]">Audio Source</div>

          {/* Device input */}
          <div className="mb-3">
            <div className="mb-1.5 flex items-center gap-2 text-xs text-[#aaa]">
              <Mic size={12} />
              <span>Audio Input Device</span>
            </div>
            <p className="mb-2 text-[10px] leading-relaxed text-[#555]">
              Select your virtual cable (VB-Cable, BlackHole, Voicemeeter), audio interface, or microphone.
              For Serato, route your master output to the virtual cable.
            </p>

            {/* Connected device indicator */}
            {connectedDeviceLabel && sourceType === "device" && (
              <div className="mb-2 flex items-center gap-2 rounded-lg border border-[#00ffff20] bg-[#00ffff08] px-3 py-2">
                <div className="h-2 w-2 animate-pulse rounded-full bg-[#00ffff]" />
                <span className="flex-1 truncate text-[11px] text-[#00ffff]">{connectedDeviceLabel}</span>
                <span className="text-[9px] uppercase tracking-wider text-[#00ffff66]">Active</span>
              </div>
            )}

            {/* Device list as clickable cards */}
            <div className="flex max-h-40 flex-col gap-1 overflow-y-auto pr-1">
              {devices.length === 0 ? (
                <div className="py-3 text-center text-[10px] text-[#555]">
                  No devices found. Click refresh to scan again.
                </div>
              ) : (
                devices.map((d) => {
                  const isVirtualCable = /virtual|vb-|cable|blackhole|voicemeeter|loopback|soundflower/i.test(d.label)
                  const isSelected = selectedDeviceId === d.deviceId
                  return (
                    <button
                      key={d.deviceId}
                      onClick={() => setSelectedDeviceId(d.deviceId)}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-[11px] transition-all ${
                        isSelected
                          ? "border-[#00ffff40] bg-[#00ffff12] text-[#eee]"
                          : "border-[#ffffff08] bg-[#ffffff04] text-[#888] hover:border-[#ffffff15] hover:bg-[#ffffff08] hover:text-[#ccc]"
                      }`}
                    >
                      <div className="flex-1 truncate">
                        {d.label}
                      </div>
                      {isVirtualCable && (
                        <span className="shrink-0 rounded-full bg-[#ff71ce18] px-2 py-0.5 text-[8px] uppercase tracking-wider text-[#ff71ce]">
                          Virtual
                        </span>
                      )}
                      {isSelected && (
                        <div className="h-2 w-2 shrink-0 rounded-full bg-[#00ffff]" />
                      )}
                    </button>
                  )
                })
              )}
            </div>

            <div className="mt-2 flex gap-1.5">
              <button
                onClick={onRefreshDevices}
                className="rounded-lg border border-[#ffffff10] bg-[#ffffff06] px-3 py-1.5 text-[10px] text-[#666] transition-colors hover:text-[#aaa]"
              >
                Refresh
              </button>
              <button
                onClick={() => {
                  const label = devices.find(d => d.deviceId === selectedDeviceId)?.label || "Default device"
                  onStartDevice(selectedDeviceId || undefined)
                  setConnectedDeviceLabel(selectedDeviceId ? label : "Default device")
                  setShowSourcePanel(false)
                }}
                className="flex-1 rounded-lg bg-[#00ffff15] px-3 py-1.5 text-xs font-medium text-[#00ffff] transition-colors hover:bg-[#00ffff25]"
              >
                Connect{selectedDeviceId ? "" : " (Default)"}
              </button>
            </div>
          </div>

          {/* Tab capture */}
          <div className="mb-3 border-t border-[#ffffff08] pt-3">
            <div className="mb-1.5 flex items-center gap-2 text-xs text-[#aaa]">
              <Monitor size={12} />
              <span>Tab Audio Capture</span>
            </div>
            <p className="mb-2 text-[10px] leading-relaxed text-[#555]">
              Capture audio from a browser tab (Spotify Web, YouTube, SoundCloud). Check &quot;Share audio&quot; when prompted.
            </p>
            <button
              onClick={() => {
                onStartTab()
                setShowSourcePanel(false)
              }}
              className="rounded-lg bg-[#ff71ce15] px-3 py-1.5 text-xs font-medium text-[#ff71ce] transition-colors hover:bg-[#ff71ce25]"
            >
              Share Tab Audio
            </button>
          </div>

          {/* File playback */}
          <div className="border-t border-[#ffffff08] pt-3">
            <div className="mb-1.5 flex items-center gap-2 text-xs text-[#aaa]">
              <Music size={12} />
              <span>Audio File</span>
            </div>
            <p className="mb-2 text-[10px] leading-relaxed text-[#555]">
              Drop or select an audio file (MP3, WAV, FLAC, OGG) to play and visualize.
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-lg bg-[#00ff8815] px-3 py-1.5 text-xs font-medium text-[#00ff88] transition-colors hover:bg-[#00ff8825]"
            >
              <Upload size={12} />
              Choose File
            </button>
          </div>

          {/* Stop button if active */}
          {micActive && (
            <div className="mt-3 border-t border-[#ffffff08] pt-3">
              <button
                onClick={() => {
                  onStop()
                  setConnectedDeviceLabel(null)
                  setShowSourcePanel(false)
                }}
                className="w-full rounded-lg bg-[#ff004415] px-3 py-1.5 text-xs font-medium text-[#ff4444] transition-colors hover:bg-[#ff004425]"
              >
                Disconnect Source
              </button>
            </div>
          )}
        </div>
      )}

      {/* Scene switcher */}
      <div className="pointer-events-auto mb-3 flex items-center gap-1">
        <button
          onClick={() => cycleScene(-1)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#ffffff10] bg-[#0a0a0a]/70 text-[#666] backdrop-blur-md transition-colors hover:border-[#ffffff20] hover:text-[#aaa]"
          aria-label="Previous scene"
        >
          <ChevronLeft size={14} />
        </button>

        <div className="flex max-w-[80vw] items-center gap-0.5 overflow-x-auto rounded-xl border border-[#ffffff10] bg-[#0a0a0a]/80 px-1.5 py-1 backdrop-blur-xl scrollbar-none">
          {SCENE_LIST.map((scene) => (
            <button
              key={scene.id}
              onClick={() => onSceneChange(scene.id)}
              className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-all ${
                activeScene === scene.id
                  ? "bg-[#ffffff12] text-[#eee] shadow-[0_0_12px_rgba(255,255,255,0.05)]"
                  : "text-[#555] hover:text-[#999]"
              }`}
              aria-label={`Scene: ${scene.label}`}
            >
              <span className="text-sm">{SCENE_ICONS[scene.id]}</span>
              {scene.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => cycleScene(1)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#ffffff10] bg-[#0a0a0a]/70 text-[#666] backdrop-blur-md transition-colors hover:border-[#ffffff20] hover:text-[#aaa]"
          aria-label="Next scene"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="pointer-events-auto mb-2 flex items-center gap-1.5 rounded-full border border-[#ffffff10] bg-[#0a0a0a]/70 px-3 py-1 text-[10px] uppercase tracking-widest text-[#666] backdrop-blur-md transition-colors hover:text-[#aaa]"
      >
        {collapsed ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {collapsed ? "Show Controls" : "Hide"}
      </button>

      {!collapsed && (
        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-[#ffffff10] bg-[#0a0a0a]/80 px-5 py-3 backdrop-blur-xl">
          {/* Audio source button */}
          <button
            onClick={() => setShowSourcePanel(!showSourcePanel)}
            className={`flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-medium transition-all ${
              micActive
                ? "ring-1"
                : "bg-[#ffffff08] text-[#666] hover:text-[#aaa]"
            }`}
            style={
              micActive
                ? {
                    backgroundColor: `${sourceColor}15`,
                    color: sourceColor,
                    boxShadow: `0 0 0 1px ${sourceColor}30`,
                  }
                : undefined
            }
            aria-label="Audio source settings"
          >
            {sourceType === "tab" ? (
              <Monitor size={14} />
            ) : sourceType === "file" ? (
              <Music size={14} />
            ) : micActive ? (
              <Mic size={14} />
            ) : (
              <MicOff size={14} />
            )}
            {micActive ? sourceLabel : "Source"}
          </button>

          {/* File playback controls */}
          {sourceType === "file" && audioElement && (
            <>
              <div className="h-6 w-px bg-[#ffffff10]" />
              <div className="flex items-center gap-1.5">
                <button
                  onClick={restartTrack}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-[#666] transition-colors hover:text-[#aaa]"
                  aria-label="Restart track"
                >
                  <SkipBack size={13} />
                </button>
                <button
                  onClick={togglePlayPause}
                  className="flex h-7 w-7 items-center justify-center rounded-md bg-[#00ff8815] text-[#00ff88] transition-colors hover:bg-[#00ff8825]"
                  aria-label={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? <Pause size={13} /> : <Play size={13} />}
                </button>
                {fileName && (
                  <span className="max-w-28 truncate text-[10px] text-[#555]">{fileName}</span>
                )}
              </div>
            </>
          )}

          {/* Divider */}
          <div className="h-6 w-px bg-[#ffffff10]" />

          {/* Sensitivity slider */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-[#666]">Sens</span>
            <input
              type="range"
              min={0.1}
              max={3}
              step={0.05}
              value={sensitivity}
              onChange={(e) => onSensitivityChange(parseFloat(e.target.value))}
              className="h-1 w-20 cursor-pointer appearance-none rounded-full bg-[#ffffff15] accent-[#00ffff] [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#00ffff]"
              aria-label="Audio sensitivity"
            />
            <span className="w-6 text-right text-[10px] tabular-nums text-[#555]">{sensitivity.toFixed(1)}</span>
          </div>

          {/* Divider */}
          <div className="h-6 w-px bg-[#ffffff10]" />

          {/* Bass Energy Indicator */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-[#666]">Bass</span>
            <div className="relative h-5 w-20 overflow-hidden rounded-full bg-[#ffffff08]">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#ff00ff] to-[#00ffff] transition-all duration-75"
                style={{ 
                  width: `${Math.min(bassEnergy * 100, 100)}%`,
                  opacity: 0.7 + bassImpact * 0.3,
                  boxShadow: bassImpact > 0.5 ? '0 0 8px rgba(0, 255, 255, 0.6)' : 'none'
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center text-[9px] font-medium text-white mix-blend-difference">
                {Math.round(bassEnergy * 100)}%
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="h-6 w-px bg-[#ffffff10]" />

          {/* Color mode selector */}
          <div className="flex items-center gap-1.5">
            {COLOR_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onColorModeChange(opt.value)}
                className={`flex h-7 items-center gap-1.5 rounded-md px-2 text-[10px] uppercase tracking-wider transition-all ${
                  colorMode === opt.value
                    ? "bg-[#ffffff12] text-[#eee]"
                    : "text-[#555] hover:text-[#999]"
                }`}
                aria-label={`Color mode: ${opt.label}`}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: opt.swatch }} />
                {opt.label}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="h-6 w-px bg-[#ffffff10]" />

          {/* Visual style indicator */}
          <div className="text-[10px] uppercase tracking-wider text-[#555]">
            Style <span className="text-[#999]">{visualStyle + 1}</span>
          </div>

          {/* Divider */}
          <div className="h-6 w-px bg-[#ffffff10]" />

          {/* Auto-rotate toggle */}
          <button
            onClick={onAutoRotateToggle}
            className={`flex h-7 items-center gap-1.5 rounded-md px-2 text-[10px] uppercase tracking-wider transition-all ${
              autoRotate
                ? "bg-[#ff71ce15] text-[#ff71ce]"
                : "text-[#555] hover:text-[#999]"
            }`}
            aria-label="Auto-rotate: randomize everything every 15 seconds"
            title="Randomize scene, color, style & sensitivity every 15s"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
            </svg>
            Auto
          </button>

          {/* Divider */}
          <div className="h-6 w-px bg-[#ffffff10]" />

          {/* DJ Name input */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-[#666]">DJ</span>
            <input
              type="text"
              value={djName}
              onChange={(e) => onDjNameChange(e.target.value)}
              placeholder="Enter name..."
              maxLength={24}
              className="h-7 w-28 rounded-md border border-[#ffffff10] bg-[#ffffff06] px-2 text-[11px] text-[#ddd] placeholder-[#444] outline-none transition-colors focus:border-[#ffffff30] focus:bg-[#ffffff0a]"
            />
          </div>

          {/* Divider */}
          <div className="h-6 w-px bg-[#ffffff10]" />

          {/* Keyboard shortcut toggle */}
          <button
            onClick={() => setShowKeys(!showKeys)}
            className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
              showKeys ? "bg-[#ffffff12] text-[#aaa]" : "text-[#555] hover:text-[#999]"
            }`}
            aria-label="Show keyboard shortcuts"
          >
            <Keyboard size={14} />
          </button>

          {/* Divider */}
          <div className="h-6 w-px bg-[#ffffff10]" />

          {/* Live levels */}
          <div className="flex items-center gap-2">
            <LevelBar label="B" value={bass} color="#ff0066" />
            <LevelBar label="M" value={mid} color="#00ffff" />
            <LevelBar label="H" value={high} color="#00ff88" />
          </div>
        </div>
      )}
    </div>
  )
}

function LevelBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="relative h-10 w-1.5 overflow-hidden rounded-full bg-[#ffffff08]">
        <div
          className="absolute bottom-0 w-full rounded-full transition-all duration-75"
          style={{ height: `${value * 100}%`, backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
        />
      </div>
      <span className="text-[8px] uppercase text-[#555]">{label}</span>
    </div>
  )
}
