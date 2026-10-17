import { Spectrum } from '../fft.ts'
import { assembleFeatures, MEL_BANDS, MEL_FRAMES } from '../features.ts'
import { applyMel, createMelBank } from '../mel.ts'
import { YinDetector } from '../yin.ts'

const TARGET_RATE = 16000
const WINDOW = 1024
const HOP = 160
const FFT_SIZE = 512
const RING = 2048
const INPUT_MASK = 8191

declare class AudioWorkletProcessor {
  readonly port: MessagePort
  constructor(options?: AudioWorkletNodeOptions)
}

declare function registerProcessor(
  name: string,
  processorCtor: new (options?: AudioWorkletNodeOptions) => AudioWorkletProcessor,
): void

function audioNow(): number {
  const scope = globalThis as { currentTime?: number }
  return typeof scope.currentTime === 'number' ? scope.currentTime : 0
}

class PitchProcessor extends AudioWorkletProcessor {
  private inputRate: number
  private step: number
  private readPos = 0
  private written = 0
  private inputRing = new Float32Array(8192)
  private ring = new Float32Array(RING)
  private ringPos = 0
  private filled = 0
  private sinceHop = 0
  private window = new Float32Array(WINDOW)
  private fftInput = new Float32Array(FFT_SIZE)
  private hann = new Float32Array(FFT_SIZE)
  private yin: YinDetector
  private spectrum: Spectrum
  private filters: Float32Array[]
  private mel = new Float32Array(MEL_BANDS)
  private melRing: Float32Array[] = []
  private zcrRing = new Float32Array(12)
  private rmsRing = new Float32Array(12)
  private peakRing = new Float32Array(12)
  private slotFrame = new Int32Array(12)
  private prevMag: Float32Array
  private hasPrev = false
  private onsetThreshold = 0.28
  private minRms = 0.012
  private lastOnset = -1
  private pendingStart = -1
  private frameIndex = 0
  private prevHopRms = 0

  constructor(options?: AudioWorkletNodeOptions) {
    super()
    const raw = options?.processorOptions as { sampleRate?: number } | undefined
    this.inputRate = raw?.sampleRate && raw.sampleRate > 0 ? raw.sampleRate : 48000
    this.step = this.inputRate / TARGET_RATE
    this.yin = new YinDetector(WINDOW)
    this.spectrum = new Spectrum(FFT_SIZE)
    this.filters = createMelBank(FFT_SIZE, TARGET_RATE, MEL_BANDS)
    this.prevMag = new Float32Array(FFT_SIZE / 2)
    for (let index = 0; index < FFT_SIZE; index += 1) {
      this.hann[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (FFT_SIZE - 1))
    }
    for (let index = 0; index < 12; index += 1) this.melRing.push(new Float32Array(MEL_BANDS))
    this.slotFrame.fill(-1)
    this.port.onmessage = (event: MessageEvent<unknown>) => {
      const data = event.data as { type?: string; onsetThreshold?: number; minRms?: number }
      if (data?.type !== 'config') return
      if (typeof data.onsetThreshold === 'number') this.onsetThreshold = data.onsetThreshold
      if (typeof data.minRms === 'number') this.minRms = data.minRms
    }
  }

  process(inputs: Float32Array[][]): boolean {
    const channel = inputs[0]?.[0]
    if (!channel) return true
    try {
      this.pushInput(channel)
    } catch {
      // Keep the processor alive if one analysis frame fails.
    }
    return true
  }

  private pushInput(input: Float32Array): void {
    for (let index = 0; index < input.length; index += 1) {
      this.inputRing[this.written & INPUT_MASK] = input[index] ?? 0
      this.written += 1
    }
    while (this.readPos + 1 < this.written) {
      const base = Math.floor(this.readPos)
      const fraction = this.readPos - base
      const first = this.inputRing[base & INPUT_MASK] ?? 0
      const second = this.inputRing[(base + 1) & INPUT_MASK] ?? 0
      this.pushSample(first + (second - first) * fraction)
      this.readPos += this.step
    }
  }

  private pushSample(sample: number): void {
    this.ring[this.ringPos] = sample
    this.ringPos = (this.ringPos + 1) % RING
    if (this.filled < RING) this.filled += 1
    this.sinceHop += 1
    if (this.filled >= WINDOW && this.sinceHop >= HOP) {
      this.sinceHop = 0
      this.analyze()
    }
  }

  private analyze(): void {
    const start = (this.ringPos - WINDOW + RING) % RING
    for (let index = 0; index < WINDOW; index += 1) {
      this.window[index] = this.ring[(start + index) % RING] ?? 0
    }

    let windowSum = 0
    for (let index = 0; index < WINDOW; index += 1) windowSum += (this.window[index] ?? 0) ** 2
    const rms = Math.sqrt(windowSum / WINDOW)

    const hopStart = WINDOW - HOP
    let hopSum = 0
    let peak = 0
    let crossings = 0
    let previous = this.window[hopStart] ?? 0
    for (let index = hopStart; index < WINDOW; index += 1) {
      const sample = this.window[index] ?? 0
      hopSum += sample * sample
      const abs = Math.abs(sample)
      if (abs > peak) peak = abs
      if (index > hopStart && ((previous >= 0 && sample < 0) || (previous < 0 && sample >= 0))) crossings += 1
      previous = sample
    }
    const hopRms = Math.sqrt(hopSum / HOP)
    const hopZcr = crossings / HOP

    const offset = WINDOW - FFT_SIZE
    for (let index = 0; index < FFT_SIZE; index += 1) {
      this.fftInput[index] = (this.window[offset + index] ?? 0) * (this.hann[index] ?? 1)
    }
    const magnitude = this.spectrum.analyze(this.fftInput)
    applyMel(magnitude, this.filters, this.mel)

    let weighted = 0
    let weight = 0
    const binHz = TARGET_RATE / FFT_SIZE
    for (let bin = 1; bin < magnitude.length; bin += 1) {
      const value = magnitude[bin] ?? 0
      weighted += bin * binHz * value
      weight += value
    }
    const centroid = weight > 0 ? Math.min(1, weighted / weight / (TARGET_RATE / 2)) : 0

    let flux = 0
    if (this.hasPrev) {
      for (let bin = 1; bin < magnitude.length; bin += 1) {
        const delta = Math.log((magnitude[bin] ?? 0) + 1e-8) - Math.log((this.prevMag[bin] ?? 0) + 1e-8)
        if (delta > 0) flux += delta
      }
      flux /= Math.max(1, magnitude.length - 1)
    }
    this.prevMag.set(magnitude)
    this.hasPrev = true

    const pitch = this.yin.detect(this.window, TARGET_RATE)
    const slot = this.frameIndex % 12
    this.melRing[slot]?.set(this.mel)
    this.zcrRing[slot] = hopZcr
    this.rmsRing[slot] = hopRms
    this.peakRing[slot] = peak
    this.slotFrame[slot] = this.frameIndex

    const now = audioNow()
    const rmsJump = hopRms > this.prevHopRms * 1.8 && hopRms > this.minRms
    const fluxHit = flux > this.onsetThreshold && hopRms > this.minRms * 0.5
    if ((rmsJump || fluxHit) && now - this.lastOnset > 0.08 && this.pendingStart < 0) {
      this.lastOnset = now
      this.pendingStart = this.frameIndex
    }
    this.prevHopRms = hopRms
    const frameIndex = this.frameIndex
    this.frameIndex += 1

    let features: Float32Array | null = null
    if (this.pendingStart >= 0 && frameIndex >= this.pendingStart + MEL_FRAMES - 1) {
      features = this.collectFeatures(this.pendingStart)
      this.pendingStart = -1
    }

    this.port.postMessage({
      type: 'frame',
      frequency: pitch.frequency,
      confidence: pitch.confidence,
      rms,
      centroid,
      features,
      time: now,
    })
  }

  private collectFeatures(start: number): Float32Array | null {
    const frames: Float32Array[] = []
    let zcr = 0
    let peak = 0
    const levels: number[] = []
    for (let offset = 0; offset < MEL_FRAMES; offset += 1) {
      const index = start + offset
      const slot = index % 12
      if (this.slotFrame[slot] !== index) return null
      const frame = this.melRing[slot]
      if (!frame) return null
      frames.push(frame)
      zcr += this.zcrRing[slot] ?? 0
      peak = Math.max(peak, this.peakRing[slot] ?? 0)
      levels.push(this.rmsRing[slot] ?? 0)
    }
    const early = (levels[0] ?? 0) + (levels[1] ?? 0)
    const late = (levels[2] ?? 0) + (levels[3] ?? 0)
    const mean = levels.reduce((sum, value) => sum + value, 0) / MEL_FRAMES
    return assembleFeatures(frames, zcr / MEL_FRAMES, peak / (mean + 1e-8), late / (early + 1e-8))
  }
}

registerProcessor('pitch-processor', PitchProcessor)
