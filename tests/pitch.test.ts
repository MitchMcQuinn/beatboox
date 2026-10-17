import { describe, expect, it } from 'vitest'
import { hzToMidi, hzToMidiFloat, midiToHz, noteName, snapMidi } from '../src/audio/pitch.ts'
import { yinPitch } from '../src/audio/yin.ts'

function sine(frequency: number, sampleRate = 16000, length = 1024): Float32Array {
  const buffer = new Float32Array(length)
  for (let index = 0; index < length; index += 1) {
    buffer[index] = Math.sin((2 * Math.PI * frequency * index) / sampleRate)
  }
  return buffer
}

describe('pitch conversion', () => {
  it('maps A4 and C4 to MIDI note numbers', () => {
    expect(hzToMidi(440)).toBe(69)
    expect(hzToMidi(midiToHz(60))).toBe(60)
    expect(hzToMidiFloat(440)).toBeCloseTo(69, 5)
  })

  it('names notes from MIDI numbers', () => {
    expect(noteName(69)).toBe('A4')
    expect(noteName(60)).toBe('C4')
    expect(noteName(61)).toBe('C#4')
  })

  it('snaps to the nearest enabled note and keeps the lower tie', () => {
    expect(snapMidi(61, [60, 62, 64])).toBe(60)
    expect(snapMidi(61.2, [60, 62])).toBe(62)
    expect(snapMidi(60.2, [])).toBe(60)
  })
})

describe('YIN', () => {
  it('tracks a 440 Hz sine', () => {
    const estimate = yinPitch(sine(440), 16000)
    expect(Math.abs(estimate.frequency - 440)).toBeLessThan(1.5)
    expect(estimate.confidence).toBeGreaterThan(0.85)
  })

  it('tracks a 220 Hz sine', () => {
    const estimate = yinPitch(sine(220), 16000)
    expect(Math.abs(estimate.frequency - 220)).toBeLessThan(2)
    expect(estimate.confidence).toBeGreaterThan(0.8)
  })

  it('rejects silence', () => {
    expect(yinPitch(new Float32Array(1024), 16000)).toEqual({ frequency: 0, confidence: 0 })
  })
})
