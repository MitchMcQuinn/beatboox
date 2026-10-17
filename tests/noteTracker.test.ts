import { describe, expect, it } from 'vitest'
import { BEND_CENTER } from '../src/audio/bend.ts'
import { NoteTracker, TRACKER_DEFAULTS, type TrackerSettings } from '../src/audio/noteTracker.ts'
import { midiToHz } from '../src/audio/pitch.ts'
import { notesInRange, SCALE_INTERVALS } from '../src/audio/scales.ts'
import type { AnalysisFrame } from '../src/types.ts'

function frame(frequency: number, time: number, confidence = 0.95, rms = 0.08): AnalysisFrame {
  return { frequency, confidence, rms, centroid: 0.4, features: null, time }
}

function settings(overrides: Partial<TrackerSettings> = {}): TrackerSettings {
  return {
    gate: 0.02,
    minConfidence: TRACKER_DEFAULTS.minConfidence,
    holdTime: TRACKER_DEFAULTS.holdTime,
    minDuration: TRACKER_DEFAULTS.minDuration,
    releaseTime: TRACKER_DEFAULTS.releaseTime,
    enabledNotes: notesInRange(0, SCALE_INTERVALS.chromatic),
    pitchClasses: [...SCALE_INTERVALS.major],
    voicing: 'off',
    customOffsets: [0, 4, 7],
    intelliBend: TRACKER_DEFAULTS.intelliBend,
    deadzoneCents: TRACKER_DEFAULTS.deadzoneCents,
    bendRange: TRACKER_DEFAULTS.bendRange,
    ...overrides,
  }
}

function feed(tracker: NoteTracker, frequency: number, from: number, until: number, options = settings()) {
  const events = []
  for (let time = from; time <= until + 0.0001; time += 0.01) {
    events.push(...tracker.push(frame(frequency, Number(time.toFixed(3))), options))
  }
  return events
}

describe('note tracker', () => {
  it('arms a stable A4 once and releases it after silence', () => {
    const tracker = new NoteTracker()
    const options = settings()
    const onset = feed(tracker, 440, 0, 0.1, options)
    const noteOns = onset.filter((event) => event.type === 'noteOn')
    expect(noteOns).toHaveLength(1)
    expect(noteOns[0]).toMatchObject({ type: 'noteOn', note: 69 })
    const more = feed(tracker, 440, 0.11, 0.16, options)
    expect(more.some((event) => event.type === 'noteOn')).toBe(false)
    const release = []
    for (let time = 0.2; time <= 0.32; time += 0.02) {
      release.push(...tracker.push(frame(0, time, 0, 0.001), options))
    }
    expect(release.some((event) => event.type === 'noteOff' && event.notes.includes(69))).toBe(true)
  })

  it('snaps C# to C in C major and spells an A minor triad', () => {
    const tracker = new NoteTracker()
    const snapped = feed(
      tracker,
      midiToHz(61),
      0,
      0.1,
      settings({ enabledNotes: notesInRange(0, SCALE_INTERVALS.major) }),
    )
    expect(snapped.find((event) => event.type === 'noteOn')).toMatchObject({ note: 60 })

    const harmony = new NoteTracker()
    const chord = feed(harmony, 440, 0, 0.1, settings({ voicing: 'triad' }))
    expect(chord.find((event) => event.type === 'noteOn')).toMatchObject({ note: 69, notes: [69, 72, 76] })
  })

  it('holds the bend at center inside the deadzone and follows a larger slide', () => {
    const tracker = new NoteTracker()
    const options = settings()
    feed(tracker, 440, 0, 0.08, options)
    const tiny = feed(tracker, 440 * 2 ** (10 / 1200), 0.09, 0.16, options)
    expect(tiny.filter((event) => event.type === 'bend').every((event) => event.type === 'bend' && event.value === BEND_CENTER)).toBe(true)
    const slide = feed(tracker, 440 * 2 ** (50 / 1200), 0.17, 0.34, options)
    const bends = slide.filter((event) => event.type === 'bend')
    expect(bends.some((event) => event.type === 'bend' && event.value > BEND_CENTER + 24)).toBe(true)
  })
})
