import type { VoicingId } from '../types.ts'
import { clamp } from './math.ts'

export const CUSTOM_INTERVALS = [0, 2, 3, 4, 5, 7, 9, 10, 11, 12] as const

export function buildChord(
  root: number,
  pitchClasses: number[],
  voicing: VoicingId,
  customOffsets: number[],
): number[] {
  const safeRoot = clamp(Math.round(root), 0, 127)
  if (voicing === 'off') return [safeRoot]
  if (voicing === 'power') return withinMidi([safeRoot, safeRoot + 7], safeRoot)
  if (voicing === 'sus2') return withinMidi([safeRoot, safeRoot + 2, safeRoot + 7], safeRoot)
  if (voicing === 'sus4') return withinMidi([safeRoot, safeRoot + 5, safeRoot + 7], safeRoot)
  if (voicing === 'custom') {
    const offsets = customOffsets.includes(0) ? customOffsets : [0, ...customOffsets]
    const notes = [...new Set(offsets.map((offset) => safeRoot + offset))].sort((a, b) => a - b)
    return withinMidi(notes, safeRoot)
  }

  const classes = new Set(pitchClasses.map((pitch) => ((pitch % 12) + 12) % 12))
  if (classes.size >= 12) {
    const stacked = voicing === 'seventh' ? [0, 4, 7, 11] : [0, 4, 7]
    return withinMidi(stacked.map((interval) => safeRoot + interval), safeRoot)
  }

  const scaleNotes: number[] = []
  for (let midi = safeRoot; midi < safeRoot + 36; midi += 1) {
    if (classes.has(((midi % 12) + 12) % 12)) scaleNotes.push(midi)
  }
  const count = voicing === 'seventh' ? 4 : 3
  const notes: number[] = []
  for (let step = 0; step < count; step += 1) {
    const note = scaleNotes[step * 2]
    if (note === undefined) break
    notes.push(note)
  }
  return withinMidi(notes.length > 0 ? notes : [safeRoot], safeRoot)
}

function withinMidi(notes: number[], fallback: number): number[] {
  const filtered = notes.filter((note) => note >= 0 && note <= 127)
  return filtered.length > 0 ? filtered : [fallback]
}
