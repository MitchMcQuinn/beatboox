import type { ControlEvent, RollNote } from '../types.ts'

export class Recorder {
  notes: RollNote[] = []
  controls: ControlEvent[] = []
  recording = false
  private open = new Map<string, RollNote>()
  private origin = 0
  private nextId = 1
  private lastControl = new Map<string, number>()

  start(now: number): void {
    this.recording = true
    this.origin = now
    this.notes = []
    this.controls = []
    this.open.clear()
    this.lastControl.clear()
  }

  stop(now: number): void {
    if (!this.recording) return
    for (const note of this.open.values()) {
      note.duration = Math.max(0.05, now - this.origin - note.start)
      this.notes.push(note)
    }
    this.open.clear()
    this.recording = false
  }

  noteOn(channel: number, note: number, velocity: number, now: number): void {
    if (!this.recording) return
    this.noteOff(channel, note, now)
    const id = String(this.nextId)
    this.nextId += 1
    this.open.set(key(channel, note), {
      id,
      note,
      velocity,
      start: Math.max(0, now - this.origin),
      duration: 0.05,
      channel,
    })
  }

  noteOff(channel: number, note: number, now: number): void {
    if (!this.recording) return
    const entry = this.open.get(key(channel, note))
    if (!entry) return
    entry.duration = Math.max(0.05, now - this.origin - entry.start)
    this.notes.push(entry)
    this.open.delete(key(channel, note))
  }

  oneShot(channel: number, note: number, velocity: number, now: number, duration: number): void {
    if (!this.recording) return
    const id = String(this.nextId)
    this.nextId += 1
    this.notes.push({
      id,
      note,
      velocity,
      start: Math.max(0, now - this.origin),
      duration: Math.max(0.05, duration),
      channel,
    })
  }

  control(event: ControlEvent, now: number): void {
    if (!this.recording) return
    const slot = `${event.kind}:${event.controller ?? 0}:${event.channel}`
    const previous = this.lastControl.get(slot) ?? -1
    if (now - previous < 0.03) return
    this.lastControl.set(slot, now)
    this.controls.push({ ...event, time: Math.max(0, now - this.origin) })
  }

  replace(notes: RollNote[], controls: ControlEvent[] = this.controls): void {
    this.notes = notes
    this.controls = controls
    const maxId = notes.reduce((max, note) => Math.max(max, Number(note.id) || 0), 0)
    this.nextId = maxId + 1
  }
}

export function quantizeNotes(notes: RollNote[], bpm: number): RollNote[] {
  return notes.map((note) => {
    const start = quantizeTime(note.start, bpm)
    const end = Math.max(start + gridSeconds(bpm), quantizeTime(note.start + note.duration, bpm))
    return { ...note, start, duration: end - start }
  })
}

export function quantizeControls(controls: ControlEvent[], bpm: number): ControlEvent[] {
  return controls.map((control) => ({ ...control, time: quantizeTime(control.time, bpm) }))
}

export function gridSeconds(bpm: number): number {
  return 60 / Math.max(1, bpm) / 4
}

export function quantizeTime(time: number, bpm: number): number {
  const grid = gridSeconds(bpm)
  return Math.max(0, Math.round(time / grid) * grid)
}

function key(channel: number, note: number): string {
  return `${channel}:${note}`
}
