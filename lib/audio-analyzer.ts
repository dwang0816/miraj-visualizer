/**
 * Audio Analyzer Module
 * Supports three input sources:
 *   1. Device input (microphone or virtual audio cable like VB-Cable / BlackHole)
 *   2. Tab/screen audio capture via getDisplayMedia
 *   3. Audio file playback (MP3, WAV, FLAC, OGG, etc.)
 */

export type AudioSourceType = "device" | "tab" | "file"

export interface AudioData {
  bass: number          // 60-250Hz
  subBass: number       // 20-60Hz
  mid: number
  high: number
  bassEnergy: number    // Peak-detected bass intensity
  bassImpact: number    // Transient/hit detection
  raw: Uint8Array | null
}

export interface AudioDeviceInfo {
  deviceId: string
  label: string
}

const SMOOTHING = 0.82
const FFT_SIZE = 2048  // Increased for better low-frequency resolution

export class AudioAnalyzer {
  private context: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private source: MediaStreamAudioSourceNode | MediaElementAudioSourceNode | null = null
  private stream: MediaStream | null = null
  private dataArray: Uint8Array | null = null
  private _sensitivity = 1.0
  private audioElement: HTMLAudioElement | null = null
  private objectUrl: string | null = null
  private gainNode: GainNode | null = null
  private onStopCallback: (() => void) | null = null

  // Bass-specific configuration
  private _bassBoost = 2.5
  private _bassSmoothingAttack = 0.3
  private _bassSmoothingDecay = 0.08
  private _bassThreshold = 0.1
  private _subBassEnabled = true

  // Smoothed output values (0..1)
  private smoothBass = 0
  private smoothSubBass = 0
  private smoothMid = 0
  private smoothHigh = 0
  private smoothBassEnergy = 0
  private smoothBassImpact = 0
  private prevBass = 0

  public isActive = false
  public sourceType: AudioSourceType | null = null
  public currentDeviceId: string | null = null

  /** Register a callback to be notified when the audio source stops unexpectedly */
  set onStop(cb: (() => void) | null) {
    this.onStopCallback = cb
  }

  get sensitivity() {
    return this._sensitivity
  }
  set sensitivity(v: number) {
    this._sensitivity = Math.max(0.1, Math.min(3.0, v))
  }

  get bassBoost() {
    return this._bassBoost
  }
  set bassBoost(v: number) {
    this._bassBoost = Math.max(1.0, Math.min(4.0, v))
  }

  get subBassEnabled() {
    return this._subBassEnabled
  }
  set subBassEnabled(v: boolean) {
    this._subBassEnabled = v
  }

  /** List available audio input devices */
  static async getDevices(): Promise<AudioDeviceInfo[]> {
    try {
      // Need to request permission first to get labels
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      tempStream.getTracks().forEach((t) => t.stop())

      const devices = await navigator.mediaDevices.enumerateDevices()
      const audioInputs = devices
        .filter((d) => d.kind === "audioinput")
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `Audio Input ${d.deviceId.slice(0, 8)}`,
        }))

      return audioInputs
    } catch {
      return []
    }
  }

  /** Start from an audio input device (mic, virtual cable, etc.) */
  async startDevice(deviceId?: string): Promise<boolean> {
    this.stop()
    try {
      const constraints: MediaStreamConstraints = {
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
        video: false,
      }
      this.stream = await navigator.mediaDevices.getUserMedia(constraints)
      this.context = new AudioContext()
      this.setupContextRecovery()
      this.analyser = this.context.createAnalyser()
      this.analyser.fftSize = FFT_SIZE
      this.analyser.smoothingTimeConstant = SMOOTHING

      const mediaSource = this.context.createMediaStreamSource(this.stream)
      mediaSource.connect(this.analyser)
      this.source = mediaSource

      // Listen for audio track ending (device disconnect, OS reset, etc.)
      const audioTrack = this.stream.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.addEventListener("ended", () => {
          this.stop()
          this.onStopCallback?.()
        })
      }

      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount)
      this.isActive = true
      this.sourceType = "device"
      this.currentDeviceId = deviceId || null
      return true
    } catch {
      this.isActive = false
      return false
    }
  }

  /** Start from tab/screen audio capture */
  async startTab(): Promise<boolean> {
    this.stop()
    try {
      // getDisplayMedia with audio captures tab audio in Chrome/Edge
      this.stream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: true, // Video required by spec, but we ignore it
      })

      // Stop the video track immediately, we only need audio
      this.stream.getVideoTracks().forEach((t) => t.stop())

      const audioTracks = this.stream.getAudioTracks()
      if (audioTracks.length === 0) {
        this.stream.getTracks().forEach((t) => t.stop())
        console.warn("No audio track found in tab capture. Make sure to select a tab and check 'Share audio'.")
        return false
      }

      this.context = new AudioContext()
      this.setupContextRecovery()
      this.analyser = this.context.createAnalyser()
      this.analyser.fftSize = FFT_SIZE
      this.analyser.smoothingTimeConstant = SMOOTHING

      const mediaSource = this.context.createMediaStreamSource(
        new MediaStream(audioTracks)
      )
      mediaSource.connect(this.analyser)
      this.source = mediaSource

      // Listen for track ending (user stops sharing)
      audioTracks[0].addEventListener("ended", () => {
        this.stop()
        this.onStopCallback?.()
      })

      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount)
      this.isActive = true
      this.sourceType = "tab"
      return true
    } catch (err) {
      console.warn("Tab capture denied or unavailable:", err)
      this.isActive = false
      return false
    }
  }

  /** Start from an audio file */
  async startFile(file: File): Promise<boolean> {
    this.stop()
    try {
      this.context = new AudioContext()
      this.setupContextRecovery()
      this.analyser = this.context.createAnalyser()
      this.analyser.fftSize = FFT_SIZE
      this.analyser.smoothingTimeConstant = SMOOTHING

      // Create audio element for playback
      this.audioElement = new Audio()
      this.objectUrl = URL.createObjectURL(file)
      this.audioElement.src = this.objectUrl
      this.audioElement.crossOrigin = "anonymous"
      this.audioElement.loop = true

      // Wait for audio to load
      await new Promise<void>((resolve, reject) => {
        this.audioElement!.addEventListener("canplay", () => resolve(), { once: true })
        this.audioElement!.addEventListener("error", () => reject(new Error("Failed to load audio file")), { once: true })
      })

      const mediaSource = this.context.createMediaElementSource(this.audioElement)

      // Gain node for volume control
      this.gainNode = this.context.createGain()
      this.gainNode.gain.value = 1.0

      // Connect: source -> analyser -> gain -> destination (speakers)
      mediaSource.connect(this.analyser)
      this.analyser.connect(this.gainNode)
      this.gainNode.connect(this.context.destination)

      this.source = mediaSource

      await this.audioElement.play()

      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount)
      this.isActive = true
      this.sourceType = "file"
      return true
    } catch (err) {
      console.warn("File playback failed:", err)
      this.cleanup()
      return false
    }
  }

  /** Get the audio element for file playback controls */
  getAudioElement(): HTMLAudioElement | null {
    return this.audioElement
  }

  /** Stop all sources and clean up */
  stop() {
    this.cleanup()
    this.isActive = false
    this.sourceType = null
    this.currentDeviceId = null
    this.smoothBass = 0
    this.smoothSubBass = 0
    this.smoothMid = 0
    this.smoothHigh = 0
    this.smoothBassEnergy = 0
    this.smoothBassImpact = 0
    this.prevBass = 0
  }

  /** Attempt to resume a suspended AudioContext (browser throttle, focus loss, etc.) */
  async ensureContextRunning(): Promise<void> {
    if (this.context && this.context.state === "suspended") {
      try {
        await this.context.resume()
      } catch {
        // Context may be permanently closed — nothing we can do
      }
    }
  }

  /** Auto-resume AudioContext when the browser suspends it */
  private setupContextRecovery() {
    if (!this.context) return
    this.context.onstatechange = () => {
      if (this.context?.state === "suspended" && this.isActive) {
        this.context.resume().catch(() => {})
      }
    }
  }

  private cleanup() {
    if (this.source) {
      this.source.disconnect()
      this.source = null
    }
    if (this.gainNode) {
      this.gainNode.disconnect()
      this.gainNode = null
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop())
      this.stream = null
    }
    if (this.audioElement) {
      this.audioElement.pause()
      this.audioElement.src = ""
      this.audioElement = null
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl)
      this.objectUrl = null
    }
    if (this.context) {
      this.context.close()
      this.context = null
    }
    this.analyser = null
    this.dataArray = null
  }

  /** Call every frame to get latest frequency data */
  update(): AudioData {
    if (!this.analyser || !this.dataArray) {
      return {
        bass: this.smoothBass,
        subBass: this.smoothSubBass,
        mid: this.smoothMid,
        high: this.smoothHigh,
        bassEnergy: this.smoothBassEnergy,
        bassImpact: this.smoothBassImpact,
        raw: null,
      }
    }

    // Auto-resume context if browser suspended it (non-blocking)
    if (this.context?.state === "suspended") {
      this.context.resume().catch(() => {})
    }

    this.analyser.getByteFrequencyData(this.dataArray)

    const binCount = this.dataArray.length
    const sampleRate = this.context?.sampleRate || 48000
    const binWidth = sampleRate / FFT_SIZE

    // Calculate frequency range bins with higher resolution
    const subBassEnd = Math.floor(60 / binWidth)      // 20-60Hz
    const bassEnd = Math.floor(250 / binWidth)        // 60-250Hz
    const midEnd = Math.floor(2000 / binWidth)        // 250-2000Hz
    const highMidEnd = Math.floor(6000 / binWidth)    // 2000-6000Hz

    // Calculate sums for each range
    let subBassSum = 0
    let bassSum = 0
    let midSum = 0
    let highSum = 0

    if (this._subBassEnabled) {
      for (let i = 0; i < subBassEnd; i++) subBassSum += this.dataArray[i]
    }
    for (let i = subBassEnd; i < bassEnd; i++) bassSum += this.dataArray[i]
    for (let i = bassEnd; i < midEnd; i++) midSum += this.dataArray[i]
    for (let i = midEnd; i < binCount; i++) highSum += this.dataArray[i]

    // Normalize to 0-1 range with sensitivity
    const subBassNorm = this._subBassEnabled
      ? Math.min(1, (subBassSum / (subBassEnd * 255)) * this._sensitivity * this._bassBoost)
      : 0
    const bassNorm = Math.min(1, (bassSum / ((bassEnd - subBassEnd) * 255)) * this._sensitivity * this._bassBoost)
    const midNorm = Math.min(1, (midSum / ((midEnd - bassEnd) * 255)) * this._sensitivity)
    const highNorm = Math.min(1, (highSum / ((binCount - midEnd) * 255)) * this._sensitivity)

    // Adaptive smoothing for bass: fast attack, slow decay
    if (bassNorm > this.smoothBass) {
      this.smoothBass += (bassNorm - this.smoothBass) * this._bassSmoothingAttack
    } else {
      this.smoothBass += (bassNorm - this.smoothBass) * this._bassSmoothingDecay
    }

    // Adaptive smoothing for sub-bass
    if (subBassNorm > this.smoothSubBass) {
      this.smoothSubBass += (subBassNorm - this.smoothSubBass) * this._bassSmoothingAttack
    } else {
      this.smoothSubBass += (subBassNorm - this.smoothSubBass) * this._bassSmoothingDecay
    }

    // Standard smoothing for mid/high
    const lerpFactor = 0.15
    this.smoothMid += (midNorm - this.smoothMid) * lerpFactor
    this.smoothHigh += (highNorm - this.smoothHigh) * lerpFactor

    // Bass energy: combination of bass and sub-bass for visual triggers
    const rawBassEnergy = Math.min(1, this.smoothBass * 0.7 + this.smoothSubBass * 0.3)
    this.smoothBassEnergy += (rawBassEnergy - this.smoothBassEnergy) * 0.2

    // Bass impact detection: detect transients/hits
    const instantBass = this.smoothBass
    let impactValue = this.smoothBassImpact

    if (instantBass > this.prevBass * 1.4 && instantBass > this._bassThreshold) {
      // Bass hit detected!
      impactValue = 1.0
    } else {
      // Decay impact
      impactValue *= 0.85
    }

    this.smoothBassImpact = impactValue
    this.prevBass = instantBass

    return {
      bass: this.smoothBass,
      subBass: this.smoothSubBass,
      mid: this.smoothMid,
      high: this.smoothHigh,
      bassEnergy: this.smoothBassEnergy,
      bassImpact: this.smoothBassImpact,
      raw: this.dataArray,
    }
  }
}
