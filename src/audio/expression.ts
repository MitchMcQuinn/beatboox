import { clamp } from './math.ts'

export function levelToMidi(rms: number, gate: number, peak: number): number {
  const span = Math.max(0.01, peak - gate)
  const normalized = clamp((rms - gate) / span, 0, 1)
  return clamp(Math.round(1 + normalized * 126), 1, 127)
}

export function unitToMidi(value: number): number {
  return clamp(Math.round(clamp(value, 0, 1) * 127), 0, 127)
}

export function drumVelocity(rms: number, gate: number, amount: number): number {
  const dynamic = levelToMidi(rms, gate, Math.max(gate + 0.12, rms * 2))
  const mixed = (1 - amount) * 100 + amount * dynamic
  return clamp(Math.round(mixed), 1, 127)
}
