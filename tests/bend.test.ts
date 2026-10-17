import { describe, expect, it } from 'vitest'
import { BEND_CENTER, centsBetween, encodePitchBend } from '../src/audio/bend.ts'
import { midiToHz } from '../src/audio/pitch.ts'

describe('pitch bend', () => {
  it('centers silence and reaches the ends of the bend range', () => {
    expect(encodePitchBend(0, 2)).toBe(BEND_CENTER)
    expect(encodePitchBend(200, 2)).toBe(16383)
    expect(encodePitchBend(-200, 2)).toBe(0)
    expect(encodePitchBend(100, 2)).toBe(12287)
  })

  it('measures cents between frequencies', () => {
    expect(centsBetween(midiToHz(69), midiToHz(69))).toBeCloseTo(0, 5)
    expect(centsBetween(880, 440)).toBeCloseTo(1200, 5)
  })
})
