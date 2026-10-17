import { describe, expect, it } from 'vitest'
import { notesInRange, SCALE_INTERVALS, scalePitchClasses } from '../src/audio/scales.ts'

describe('scales', () => {
  it('fills C major inside the voice range and leaves out accidentals', () => {
    const notes = notesInRange(0, SCALE_INTERVALS.major)
    expect(notes).toContain(60)
    expect(notes).toContain(64)
    expect(notes).toContain(67)
    expect(notes).not.toContain(61)
    expect(notes[0]).toBeGreaterThanOrEqual(36)
    expect(notes.at(-1)).toBeLessThanOrEqual(84)
  })

  it('rotates pitch classes by key and reads a custom palette', () => {
    expect(scalePitchClasses(2, 'major', [])).toEqual([2, 4, 6, 7, 9, 11, 1])
    expect(scalePitchClasses(2, 'major', [])).not.toContain(5)
    expect(scalePitchClasses(0, 'custom', [60, 61, 64])).toEqual([0, 1, 4])
  })
})
