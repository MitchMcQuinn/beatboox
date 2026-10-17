import { clamp } from '../audio/math.ts'
import type { ControlEvent, RollNote } from '../types.ts'

const TICKS_PER_QUARTER = 480

export function encodeSmf(notes: RollNote[], controls: ControlEvent[], bpm: number): Uint8Array {
  const safeBpm = clamp(bpm, 20, 300)
  const events: { tick: number; data: number[] }[] = []
  const tempo = Math.round(60_000_000 / safeBpm)
  events.push({
    tick: 0,
    data: [0xff, 0x51, 0x03, (tempo >> 16) & 0xff, (tempo >> 8) & 0xff, tempo & 0xff],
  })

  for (const note of notes) {
    const on = secondsToTicks(Math.max(0, note.start), safeBpm)
    const off = Math.max(on + 1, secondsToTicks(note.start + Math.max(0.01, note.duration), safeBpm))
    const channel = note.channel & 0x0f
    events.push({
      tick: on,
      data: [0x90 | channel, note.note & 0x7f, clamp(note.velocity, 1, 127)],
    })
    events.push({ tick: off, data: [0x80 | channel, note.note & 0x7f, 0] })
  }

  for (const control of controls) {
    const tick = secondsToTicks(Math.max(0, control.time), safeBpm)
    const channel = control.channel & 0x0f
    if (control.kind === 'bend') {
      const value = clamp(Math.round(control.value), 0, 16383)
      events.push({ tick, data: [0xe0 | channel, value & 0x7f, (value >> 7) & 0x7f] })
    } else {
      events.push({
        tick,
        data: [0xb0 | channel, (control.controller ?? 1) & 0x7f, clamp(Math.round(control.value), 0, 127)],
      })
    }
  }

  events.sort((a, b) => a.tick - b.tick || rank(a.data) - rank(b.data))
  const track: number[] = []
  let lastTick = 0
  for (const event of events) {
    writeVarLen(track, event.tick - lastTick)
    lastTick = event.tick
    track.push(...event.data)
  }
  writeVarLen(track, 0)
  track.push(0xff, 0x2f, 0x00)

  const header = [
    0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01,
    (TICKS_PER_QUARTER >> 8) & 0xff,
    TICKS_PER_QUARTER & 0xff,
  ]
  const length = track.length
  const trackHeader = [
    0x4d, 0x54, 0x72, 0x6b,
    (length >> 24) & 0xff,
    (length >> 16) & 0xff,
    (length >> 8) & 0xff,
    length & 0xff,
  ]
  return Uint8Array.from([...header, ...trackHeader, ...track])
}

export function secondsToTicks(seconds: number, bpm: number, ticksPerQuarter = TICKS_PER_QUARTER): number {
  return Math.max(0, Math.round(seconds * (bpm / 60) * ticksPerQuarter))
}

function rank(data: number[]): number {
  const status = data[0] ?? 0
  if (status === 0xff) return 0
  if ((status & 0xf0) === 0x80) return 1
  return 2
}

function writeVarLen(out: number[], value: number): void {
  let remaining = Math.max(0, Math.floor(value))
  const bytes = [remaining & 0x7f]
  remaining >>= 7
  while (remaining > 0) {
    bytes.push((remaining & 0x7f) | 0x80)
    remaining >>= 7
  }
  for (let index = bytes.length - 1; index >= 0; index -= 1) out.push(bytes[index] ?? 0)
}
