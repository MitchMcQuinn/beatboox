import type { AnalysisFrame } from '../types.ts'

export type DetectionConfig = {
  onsetThreshold: number
  minRms: number
}

export class AudioEngine {
  context: AudioContext | null = null
  private stream: MediaStream | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private gain: GainNode | null = null
  private analyser: AnalyserNode | null = null
  private worklet: AudioWorkletNode | null = null
  private gainValue = 1
  private detection: DetectionConfig = { onsetThreshold: 0.28, minRms: 0.012 }
  private timeDomain = new Float32Array(1024)
  private onFrame: ((frame: AnalysisFrame) => void) | null = null
  private captureGeneration = 0
  private speakerDest: MediaStreamAudioDestinationNode | null = null
  private speaker: HTMLAudioElement | null = null
  private monitor: AudioNode | null = null
  onError: ((message: string) => void) | null = null

  setGain(value: number): void {
    this.gainValue = value
    if (this.gain) this.gain.gain.value = value
  }

  configure(detection: DetectionConfig): void {
    this.detection = detection
    this.worklet?.port.postMessage({ type: 'config', ...detection })
  }

  async ensure(): Promise<AudioContext> {
    const context = this.openContext()
    this.mountSpeaker()
    if (context.state === 'suspended') await context.resume()
    return context
  }

  output(): AudioNode {
    const context = this.openContext()
    this.mountSpeaker()
    return this.speakerDest ?? context.destination
  }

  keepMonitor(monitor: AudioNode): void {
    this.monitor = monitor
  }

  async startMic(onFrame: (frame: AnalysisFrame) => void): Promise<boolean> {
    this.onFrame = onFrame
    const generation = ++this.captureGeneration
    const context = this.openContext()
    // Unlock the loudspeaker and request the mic before any await. Android drops both after a wait.
    this.mountSpeaker()
    const micPromise = captureMicrophone()
    try {
      await this.ensure()
      await this.ensureWorklet(context)
      const stream = await micPromise
      if (generation !== this.captureGeneration) {
        stream.getTracks().forEach((track) => track.stop())
        return false
      }
      this.disconnectInput()
      this.stream = stream
      this.source = context.createMediaStreamSource(this.stream)
      this.gain = context.createGain()
      this.gain.gain.value = this.gainValue
      this.analyser = context.createAnalyser()
      this.analyser.fftSize = 1024
      this.analyser.smoothingTimeConstant = 0.65
      this.source.connect(this.gain)
      this.gain.connect(this.analyser)
      if (this.worklet) this.gain.connect(this.worklet)
      void this.speaker?.play().catch(() => undefined)
      return true
    } catch (error) {
      if (generation === this.captureGeneration) {
        this.captureGeneration += 1
        void micPromise.then((stream) => stream.getTracks().forEach((track) => track.stop())).catch(() => undefined)
      }
      throw error
    }
  }

  stopMic(): void {
    this.captureGeneration += 1
    this.disconnectInput()
    this.stream?.getTracks().forEach((track) => track.stop())
    this.stream = null
    this.onFrame = null
  }

  visual(): { rms: number; peak: number } {
    if (!this.analyser) return { rms: 0, peak: 0 }
    if (this.timeDomain.length !== this.analyser.fftSize) {
      this.timeDomain = new Float32Array(this.analyser.fftSize)
    }
    this.analyser.getFloatTimeDomainData(this.timeDomain)
    let sum = 0
    let peak = 0
    for (let index = 0; index < this.timeDomain.length; index += 1) {
      const sample = this.timeDomain[index] ?? 0
      sum += sample * sample
      const abs = Math.abs(sample)
      if (abs > peak) peak = abs
    }
    return { rms: Math.sqrt(sum / this.timeDomain.length), peak }
  }

  private async ensureWorklet(context: AudioContext): Promise<void> {
    if (this.worklet) return
    await context.audioWorklet.addModule(`${import.meta.env.BASE_URL}pitch-processor.js`)
    this.worklet = new AudioWorkletNode(context, 'pitch-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      processorOptions: { sampleRate: context.sampleRate },
    })
    this.worklet.port.onmessage = (event: MessageEvent<Partial<AnalysisFrame> & { type?: string }>) => {
      const data = event.data
      if (!data || data.type !== 'frame' || !this.onFrame) return
      this.onFrame({
        frequency: typeof data.frequency === 'number' ? data.frequency : 0,
        confidence: typeof data.confidence === 'number' ? data.confidence : 0,
        rms: typeof data.rms === 'number' ? data.rms : 0,
        centroid: typeof data.centroid === 'number' ? data.centroid : 0,
        features: data.features instanceof Float32Array ? data.features : null,
        time: typeof data.time === 'number' ? data.time : context.currentTime,
      })
    }
    this.worklet.onprocessorerror = () => {
      this.onError?.('The audio processor stopped. Arm the microphone again.')
    }
    this.configure(this.detection)
  }

  private openContext(): AudioContext {
    if (!this.context) this.context = new AudioContext({ latencyHint: 'interactive' })
    if (this.context.state === 'suspended') void this.context.resume()
    return this.context
  }

  private mountSpeaker(): void {
    const context = this.context
    if (!context || this.speakerDest || !/Android/i.test(navigator.userAgent)) return
    const dest = context.createMediaStreamDestination()
    const audio = document.createElement('audio')
    audio.autoplay = true
    audio.setAttribute('playsinline', 'true')
    audio.volume = 1
    audio.srcObject = dest.stream
    audio.style.display = 'none'
    document.body.appendChild(audio)
    this.speakerDest = dest
    this.speaker = audio
    void audio.play().catch(() => {
      audio.remove()
      if (this.speaker === audio) {
        this.speaker = null
        this.speakerDest = null
      }
      const monitor = this.monitor
      if (!monitor) return
      try {
        monitor.disconnect()
      } catch {
        // The monitor may not be connected yet.
      }
      monitor.connect(context.destination)
    })
  }

  private disconnectInput(): void {
    this.source?.disconnect()
    this.gain?.disconnect()
    this.analyser?.disconnect()
    this.source = null
    this.gain = null
    this.analyser = null
  }
}

async function captureMicrophone(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser cannot open a microphone.')
  }
  // Exact false keeps Android out of call mode, which plays the synth through the earpiece.
  const clean: MediaTrackConstraints = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  }
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: { ...clean, channelCount: 1 }, video: false })
  } catch {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: clean, video: false })
    } catch {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      await stream.getAudioTracks()[0]?.applyConstraints(clean).catch(() => undefined)
      return stream
    }
  }
}
