import { describe, expect, it } from 'vitest'
import { encodeSmf } from '../src/midi/smf.ts'
import { quantizeNotes } from '../src/sequencer/recorder.ts'

function includesBytes(bytes: Uint8Array, sequence: number[]): boolean {
  outer: for (let start = 0; start <= bytes.length - sequence.length; start += 1) {
    for (let offset = 0; offset < sequence.length; offset += 1) {
      if (bytes[start + offset] !== sequence[offset]) continue outer
    }
    return true
  }
  return false
}

describe('MIDI file', () => {
  it('writes a format 0 header and the note on', () => {
    const bytes = encodeSmf(
      [{ id: '1', note: 60, velocity: 100, start: 0, duration: 0.5, channel: 0 }],
      [],
      120,
    )
    expect(String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0, bytes[3] ?? 0)).toBe('MThd')
    expect(bytes[8]).toBe(0)
    expect(bytes[9]).toBe(0)
    expect(bytes[11]).toBe(1)
    expect(bytes[12]).toBe(0x01)
    expect(bytes[13]).toBe(0xe0)
    expect(includesBytes(bytes, [0x90, 60, 100])).toBe(true)
    expect(includesBytes(bytes, [0x80, 60, 0])).toBe(true)
    expect(String.fromCharCode(bytes[14] ?? 0, bytes[15] ?? 0, bytes[16] ?? 0, bytes[17] ?? 0)).toBe('MTrk')
  })
})

describe('quantize', () => {
  it('moves notes onto a sixteenth-note grid', () => {
    const [note] = quantizeNotes(
      [{ id: '1', note: 60, velocity: 100, start: 0.12, duration: 0.2, channel: 0 }],
      120,
    )
    expect(note?.start).toBeCloseTo(0.125, 5)
    expect(note?.duration).toBeCloseTo(0.25, 5)
  })
})
