import type { AnalysisFrame, VoicingId } from '../types.ts'
import { BEND_CENTER, centsBetween, encodePitchBend } from './bend.ts'
import { buildChord } from './chords.ts'
import { levelToMidi } from './expression.ts'
import { hzToMidiFloat, snapMidi } from './pitch.ts'

export type TrackerSettings = {
  gate: number
  minConfidence: number
  holdTime: number
  minDuration: number
  releaseTime: number
  enabledNotes: number[]
  pitchClasses: number[]
  voicing: VoicingId
  customOffsets: number[]
  intelliBend: boolean
  deadzoneCents: number
  bendRange: number
}

export type TrackerEvent =
  | { type: 'noteOn'; note: number; notes: number[]; velocity: number; time: number }
  | { type: 'noteOff'; notes: number[]; time: number }
  | { type: 'bend'; value: number; time: number }

export const TRACKER_DEFAULTS = {
  holdTime: 0.045,
  minDuration: 0.07,
  releaseTime: 0.08,
  minConfidence: 0.7,
  deadzoneCents: 20,
  bendRange: 2,
  intelliBend: true,
} as const

export class NoteTracker {
  private pendingNote: number | null = null
  private pendingSince = 0
  private activeNote: number | null = null
  private activeNotes: number[] = []
  private activeSince = 0
  private quietSince: number | null = null
  private anchorFrequency = 0
  private bending = false
  private bendSmooth = 0
  private lastBend = BEND_CENTER
  private peakRms = 0.05

  reset(): void {
    this.pendingNote = null
    this.activeNote = null
    this.activeNotes = []
    this.quietSince = null
    this.anchorFrequency = 0
    this.bending = false
    this.bendSmooth = 0
    this.lastBend = BEND_CENTER
  }

  push(frame: AnalysisFrame, settings: TrackerSettings): TrackerEvent[] {
    const events: TrackerEvent[] = []
    this.peakRms = Math.max(frame.rms, this.peakRms * 0.999)
    const audible =
      frame.rms >= settings.gate &&
      frame.confidence >= settings.minConfidence &&
      frame.frequency > 70 &&
      frame.frequency < 1200

    if (!audible) {
      this.pendingNote = null
      if (this.activeNote !== null) {
        if (this.quietSince === null) this.quietSince = frame.time
        const held = frame.time - this.activeSince
        const quiet = frame.time - this.quietSince
        if (quiet >= settings.releaseTime && held >= settings.minDuration) {
          events.push({ type: 'noteOff', notes: [...this.activeNotes], time: frame.time })
          this.clearActive()
        }
      }
      return events
    }

    this.quietSince = null
    const snapped = snapMidi(hzToMidiFloat(frame.frequency), settings.enabledNotes)

    if (this.activeNote === null) {
      if (this.pendingNote !== snapped) {
        this.pendingNote = snapped
        this.pendingSince = frame.time
      } else if (frame.time - this.pendingSince >= settings.holdTime) {
        this.startNote(snapped, frame, settings, events)
      }
    } else if (snapped !== this.activeNote) {
      if (this.pendingNote !== snapped) {
        this.pendingNote = snapped
        this.pendingSince = frame.time
      } else if (
        frame.time - this.pendingSince >= settings.holdTime &&
        frame.time - this.activeSince >= settings.minDuration
      ) {
        events.push({ type: 'noteOff', notes: [...this.activeNotes], time: frame.time })
        this.startNote(snapped, frame, settings, events)
      }
    } else {
      this.pendingNote = snapped
    }

    if (this.activeNote !== null && this.anchorFrequency > 0) {
      const cents = centsBetween(frame.frequency, this.anchorFrequency)
      const bend = this.nextBend(cents, settings)
      if (Math.abs(bend - this.lastBend) >= 24) {
        this.lastBend = bend
        events.push({ type: 'bend', value: bend, time: frame.time })
      }
    }
    return events
  }

  private startNote(note: number, frame: AnalysisFrame, settings: TrackerSettings, events: TrackerEvent[]): void {
    const notes = buildChord(note, settings.pitchClasses, settings.voicing, settings.customOffsets)
    const peak = Math.max(this.peakRms, settings.gate + 0.02)
    const velocity = levelToMidi(frame.rms, settings.gate, peak)
    this.activeNote = note
    this.activeNotes = notes
    this.activeSince = frame.time
    this.anchorFrequency = frame.frequency
    this.bending = false
    this.bendSmooth = 0
    this.lastBend = BEND_CENTER
    events.push({ type: 'bend', value: BEND_CENTER, time: frame.time })
    events.push({ type: 'noteOn', note, notes, velocity, time: frame.time })
  }

  private nextBend(cents: number, settings: TrackerSettings): number {
    const distance = Math.abs(cents)
    if (settings.intelliBend) {
      if (!this.bending) {
        if (distance < settings.deadzoneCents) {
          this.bendSmooth = 0
          return BEND_CENTER
        }
        this.bending = true
      } else if (distance < settings.deadzoneCents * 0.45) {
        this.bending = false
        this.bendSmooth = 0
        return BEND_CENTER
      }
    }
    this.bendSmooth += 0.35 * (cents - this.bendSmooth)
    return encodePitchBend(this.bendSmooth, settings.bendRange)
  }

  private clearActive(): void {
    this.activeNote = null
    this.activeNotes = []
    this.anchorFrequency = 0
    this.bending = false
    this.bendSmooth = 0
    this.lastBend = BEND_CENTER
    this.pendingNote = null
  }
}
