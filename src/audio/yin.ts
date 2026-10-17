import { clamp } from './math.ts'

export type PitchEstimate = {
  frequency: number
  confidence: number
}

export class YinDetector {
  private diff: Float32Array
  private cmndf: Float32Array

  constructor(windowSize: number) {
    this.diff = new Float32Array(windowSize)
    this.cmndf = new Float32Array(windowSize)
  }

  detect(
    buffer: Float32Array,
    sampleRate: number,
    threshold = 0.15,
    freqMin = 70,
    freqMax = 1100,
  ): PitchEstimate {
    let energy = 0
    for (let index = 0; index < buffer.length; index += 1) energy += (buffer[index] ?? 0) ** 2
    if (energy < 1e-6) return { frequency: 0, confidence: 0 }

    const half = Math.floor(buffer.length / 2)
    const tauMax = Math.min(half - 2, Math.floor(sampleRate / freqMin), this.diff.length - 1)
    const tauMin = Math.max(2, Math.floor(sampleRate / freqMax))
    if (tauMax <= tauMin) return { frequency: 0, confidence: 0 }

    for (let tau = 1; tau <= tauMax; tau += 1) {
      let sum = 0
      for (let index = 0; index < half; index += 1) {
        const delta = (buffer[index] ?? 0) - (buffer[index + tau] ?? 0)
        sum += delta * delta
      }
      this.diff[tau] = sum
    }

    this.cmndf[0] = 1
    let running = 0
    for (let tau = 1; tau <= tauMax; tau += 1) {
      running += this.diff[tau] ?? 0
      this.cmndf[tau] = ((this.diff[tau] ?? 0) * tau) / (running || 1)
    }

    let tau = -1
    for (let candidate = tauMin; candidate <= tauMax; candidate += 1) {
      if ((this.cmndf[candidate] ?? 1) < threshold) {
        while (candidate + 1 <= tauMax && (this.cmndf[candidate + 1] ?? 1) < (this.cmndf[candidate] ?? 1)) {
          candidate += 1
        }
        tau = candidate
        break
      }
    }

    if (tau < 0) {
      let minimum = 1
      for (let candidate = tauMin; candidate <= tauMax; candidate += 1) {
        const value = this.cmndf[candidate] ?? 1
        if (value < minimum) {
          minimum = value
          tau = candidate
        }
      }
      if (tau < 0 || minimum > 0.5) return { frequency: 0, confidence: 0 }
    }

    const earlier = Math.max(1, tau - 1)
    const later = Math.min(tauMax, tau + 1)
    const s0 = this.cmndf[earlier] ?? 1
    const s1 = this.cmndf[tau] ?? 1
    const s2 = this.cmndf[later] ?? 1
    let refined = tau
    const denominator = 2 * (2 * s1 - s2 - s0)
    if (earlier !== tau && later !== tau && denominator !== 0) refined = tau + (s2 - s0) / denominator
    if (!Number.isFinite(refined) || refined < 1) refined = tau

    const frequency = sampleRate / refined
    if (!Number.isFinite(frequency) || frequency < freqMin * 0.9 || frequency > freqMax * 1.08) {
      return { frequency: 0, confidence: 0 }
    }
    return { frequency, confidence: clamp(1 - s1, 0, 1) }
  }
}

export function yinPitch(buffer: Float32Array, sampleRate: number, threshold = 0.15): PitchEstimate {
  return new YinDetector(buffer.length).detect(buffer, sampleRate, threshold)
}
