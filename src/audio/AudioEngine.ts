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
    if (!this.context) this.context = new AudioContext({ latencyHint: 'interactive' })
    if (this.context.state === 'suspended') await this.context.resume()
    return this.context
  }

  async startMic(onFrame: (frame: AnalysisFrame) => void): Promise<void> {
    this.onFrame = onFrame
    const context = await this.ensure()
    await this.ensureWorklet(context)
    this.disconnectInput()
    this.stream = await captureMicrophone()
    this.source = context.createMediaStreamSource(this.stream)
    this.gain = context.createGain()
    this.gain.gain.value = this.gainValue
    this.analyser = context.createAnalyser()
    this.analyser.fftSize = 1024
    this.analyser.smoothingTimeConstant = 0.65
    this.source.connect(this.gain)
    this.gain.connect(this.analyser)
    if (this.worklet) this.gain.connect(this.worklet)
  }

  stopMic(): void {
    this.disconnectInput()
    this.stream?.getTracks().forEach((track) => track.stop())
    this.stream = null
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
  const raw: MediaStreamConstraints = {
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
    },
    video: false,
  }
  try {
    return await navigator.mediaDevices.getUserMedia(raw)
  } catch {
    return navigator.mediaDevices.getUserMedia({ audio: true, video: false })
  }
}
