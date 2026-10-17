import { describe, expect, it } from 'vitest'
import { Spectrum } from '../src/audio/fft.ts'
import { assembleFeatures, FEATURE_SIZE } from '../src/audio/features.ts'
import { createMelBank } from '../src/audio/mel.ts'

describe('spectrum', () => {
  it('peaks on the bin of a periodic sine', () => {
    const size = 512
    const sampleRate = 16000
    const frequency = (10 * sampleRate) / size
    const input = new Float32Array(size)
    for (let index = 0; index < size; index += 1) {
      input[index] = Math.sin((2 * Math.PI * frequency * index) / sampleRate)
    }
    const magnitude = new Spectrum(size).analyze(input)
    let peakBin = 0
    let peak = 0
    for (let bin = 1; bin < magnitude.length; bin += 1) {
      const value = magnitude[bin] ?? 0
      if (value > peak) {
        peak = value
        peakBin = bin
      }
    }
    expect(peakBin).toBe(10)
  })
})

describe('beatbox features', () => {
  it('builds a normalized 67-wide vector', () => {
    const frames = Array.from({ length: 4 }, () => Array.from({ length: 16 }, (_, band) => band + 1))
    const features = assembleFeatures(frames, 0.2, 8, 1.2)
    expect(features.length).toBe(FEATURE_SIZE)
    expect(FEATURE_SIZE).toBe(67)
    let energy = 0
    for (let index = 0; index < 64; index += 1) energy += (features[index] ?? 0) ** 2
    expect(energy).toBeCloseTo(1, 5)
    expect(features[64]).toBeCloseTo(0.2, 5)
    expect(features[65]).toBeCloseTo(0.4, 5)
    expect(features[66]).toBeCloseTo(0.3, 5)
  })

  it('gives every mel band some weight', () => {
    const filters = createMelBank(512, 16000, 16)
    expect(filters).toHaveLength(16)
    for (const filter of filters) {
      const weight = filter.reduce((sum, value) => sum + value, 0)
      expect(weight).toBeGreaterThan(0)
    }
  })
})
