import { clamp } from './math.ts'

export const BEND_CENTER = 8192

export function centsBetween(frequency: number, anchorFrequency: number): number {
  if (frequency <= 0 || anchorFrequency <= 0) return 0
  return 1200 * Math.log2(frequency / anchorFrequency)
}

export function encodePitchBend(cents: number, rangeSemitones: number): number {
  const span = Math.max(1, rangeSemitones) * 100
  const normalized = clamp(cents / span, -1, 1)
  return clamp(Math.round(((normalized + 1) / 2) * 16383), 0, 16383)
}
