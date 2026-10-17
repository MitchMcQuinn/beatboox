export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

export function hzToMidiFloat(frequency: number): number {
  return 69 + 12 * Math.log2(frequency / 440)
}

export function hzToMidi(frequency: number): number {
  return Math.round(hzToMidiFloat(frequency))
}

export function midiToHz(note: number): number {
  return 440 * 2 ** ((note - 69) / 12)
}

export function noteName(midi: number): string {
  const pitch = ((midi % 12) + 12) % 12
  const octave = Math.floor(midi / 12) - 1
  return `${NOTE_NAMES[pitch]}${octave}`
}

export function snapMidi(midiFloat: number, enabled: number[]): number {
  if (enabled.length === 0) return Math.round(midiFloat)
  let best = enabled[0] ?? Math.round(midiFloat)
  let bestDist = Math.abs(best - midiFloat)
  for (let index = 1; index < enabled.length; index += 1) {
    const note = enabled[index]
    if (note === undefined) continue
    const distance = Math.abs(note - midiFloat)
    if (distance < bestDist) {
      best = note
      bestDist = distance
    }
  }
  return best
}
