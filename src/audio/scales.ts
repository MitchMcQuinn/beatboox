import type { ScaleId } from '../types.ts'

export const KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

export const SCALE_INTERVALS = {
  major: [0, 2, 4, 5, 7, 9, 11],
  naturalMinor: [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  majorPentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
} as const

export const SCALE_OPTIONS: { id: ScaleId; label: string }[] = [
  { id: 'major', label: 'Major' },
  { id: 'naturalMinor', label: 'Natural minor' },
  { id: 'harmonicMinor', label: 'Harmonic minor' },
  { id: 'dorian', label: 'Dorian' },
  { id: 'mixolydian', label: 'Mixolydian' },
  { id: 'majorPentatonic', label: 'Major pentatonic' },
  { id: 'minorPentatonic', label: 'Minor pentatonic' },
  { id: 'chromatic', label: 'Chromatic' },
  { id: 'custom', label: 'Custom palette' },
]

export const VOICE_LOW = 36
export const VOICE_HIGH = 84

export function notesInRange(
  key: number,
  intervals: readonly number[],
  low = VOICE_LOW,
  high = VOICE_HIGH,
): number[] {
  const pitchClasses = new Set(intervals.map((interval) => (key + interval) % 12))
  const notes: number[] = []
  for (let note = low; note <= high; note += 1) {
    if (pitchClasses.has(note % 12)) notes.push(note)
  }
  return notes
}

export function scalePitchClasses(key: number, scale: ScaleId, palette: number[]): number[] {
  if (scale === 'custom') {
    return [...new Set(palette.map((note) => ((note % 12) + 12) % 12))].sort((a, b) => a - b)
  }
  return SCALE_INTERVALS[scale].map((interval) => (key + interval) % 12)
}

export function paletteForScale(key: number, scale: ScaleId, current: number[]): number[] {
  if (scale === 'custom') return current
  return notesInRange(key, SCALE_INTERVALS[scale])
}
