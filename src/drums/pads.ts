import type { PadId } from '../types.ts'

export type PadConfig = {
  id: PadId
  label: string
  note: number
  sensitivity: number
  velocityAmount: number
  gateMs: number
  examples: number
}

export const DEFAULT_PADS: PadConfig[] = [
  { id: 'kick', label: 'Kick', note: 36, sensitivity: 0.5, velocityAmount: 0.85, gateMs: 120, examples: 0 },
  { id: 'snare', label: 'Snare', note: 38, sensitivity: 0.5, velocityAmount: 0.85, gateMs: 150, examples: 0 },
  { id: 'hat', label: 'Hat', note: 42, sensitivity: 0.55, velocityAmount: 0.7, gateMs: 80, examples: 0 },
  { id: 'clap', label: 'Clap', note: 39, sensitivity: 0.5, velocityAmount: 0.8, gateMs: 120, examples: 0 },
]

export const PAD_IDS: PadId[] = ['kick', 'snare', 'hat', 'clap']

export function padIdForNote(note: number, pads: PadConfig[]): PadId {
  return pads.find((pad) => pad.note === note)?.id ?? 'kick'
}
