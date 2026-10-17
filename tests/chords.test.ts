import { describe, expect, it } from 'vitest'
import { buildChord } from '../src/audio/chords.ts'

const cMajor = [0, 2, 4, 5, 7, 9, 11]

describe('chords', () => {
  it('builds a C major triad and the diatonic ii chord', () => {
    expect(buildChord(60, cMajor, 'triad', [])).toEqual([60, 64, 67])
    expect(buildChord(62, cMajor, 'triad', [])).toEqual([62, 65, 69])
  })

  it('builds power chords and custom offsets', () => {
    expect(buildChord(60, cMajor, 'power', [])).toEqual([60, 67])
    expect(buildChord(60, cMajor, 'custom', [0, 7, 12])).toEqual([60, 67, 72])
  })

  it('uses a major triad when the scale is chromatic', () => {
    expect(buildChord(60, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 'triad', [])).toEqual([60, 64, 67])
  })
})
