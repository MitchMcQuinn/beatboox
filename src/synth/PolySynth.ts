import { midiToHz } from '../audio/pitch.ts'
import { clamp } from '../audio/math.ts'
import type { Waveform } from '../types.ts'

type Voice = {
  note: number
  stopped: boolean
  peak: number
  osc: OscillatorNode | null
  filter: BiquadFilterNode | null
  gain: GainNode | null
}

export class PolySynth {
  waveform: Waveform = 'sawtooth'
  cutoff = 1800
  attack = 0.02
  release = 0.12
  private voices: Voice[] = []
  private readonly maxVoices = 12
  private ctx: AudioContext
  private master: GainNode
  private bendCents = 0
  private expression = 1
  private modulation = 1

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx
    this.master = ctx.createGain()
    this.master.gain.value = 0.85
    this.master.connect(destination)
  }

  noteOn(note: number, velocity: number, time: number): void {
    this.noteOff(note, time)
    const voice = this.allocate()
    this.silence(voice)
    const oscillator = this.ctx.createOscillator()
    const filter = this.ctx.createBiquadFilter()
    const gain = this.ctx.createGain()
    oscillator.type = this.waveform
    oscillator.frequency.setValueAtTime(midiToHz(note), time)
    oscillator.detune.setValueAtTime(this.bendCents, time)
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(this.currentCutoff(), time)
    filter.Q.value = 0.7
    const peak = Math.max(0.0001, (velocity / 127) * 0.2)
    gain.gain.setValueAtTime(0.0001, time)
    gain.gain.exponentialRampToValueAtTime(peak, time + Math.max(0.005, this.attack))
    oscillator.connect(filter)
    filter.connect(gain)
    gain.connect(this.master)
    oscillator.start(time)
    voice.note = note
    voice.stopped = false
    voice.peak = peak
    voice.osc = oscillator
    voice.filter = filter
    voice.gain = gain
  }

  noteOff(note: number, time: number): void {
    for (const voice of this.voices) {
      if (voice.note === note && !voice.stopped) this.stopVoice(voice, time)
    }
  }

  allOff(): void {
    const time = this.ctx.currentTime
    for (const voice of this.voices) {
      if (!voice.stopped) this.stopVoice(voice, time)
    }
  }

  setBend(value14: number, rangeSemitones: number): void {
    const normalized = (clamp(value14, 0, 16383) - 8192) / 8192
    this.bendCents = normalized * rangeSemitones * 100
    const time = this.ctx.currentTime
    for (const voice of this.voices) {
      if (!voice.stopped && voice.osc) voice.osc.detune.setTargetAtTime(this.bendCents, time, 0.015)
    }
  }

  setExpression(value: number): void {
    this.expression = clamp(value / 127, 0, 1)
    this.master.gain.setTargetAtTime(0.2 + 0.8 * this.expression, this.ctx.currentTime, 0.03)
  }

  setModulation(value: number): void {
    this.modulation = clamp(value / 127, 0, 1)
    const time = this.ctx.currentTime
    const cutoff = this.currentCutoff()
    for (const voice of this.voices) {
      if (!voice.stopped && voice.filter) voice.filter.frequency.setTargetAtTime(cutoff, time, 0.02)
    }
  }

  private currentCutoff(): number {
    return clamp(this.cutoff * (0.35 + 0.65 * this.modulation), 80, 12000)
  }

  private allocate(): Voice {
    const free = this.voices.find((voice) => voice.stopped)
    if (free) return free
    if (this.voices.length < this.maxVoices) {
      const voice = this.createVoice()
      this.voices.push(voice)
      return voice
    }
    const oldest = this.voices[0] ?? this.createVoice()
    this.stopVoice(oldest, this.ctx.currentTime)
    this.silence(oldest)
    return oldest
  }

  private createVoice(): Voice {
    return { note: 0, stopped: true, peak: 0, osc: null, filter: null, gain: null }
  }

  private stopVoice(voice: Voice, time: number): void {
    if (!voice.gain || !voice.osc) {
      voice.stopped = true
      return
    }
    voice.stopped = true
    const gain = voice.gain.gain
    gain.cancelScheduledValues(time)
    gain.setValueAtTime(Math.max(0.0001, voice.peak), time)
    gain.exponentialRampToValueAtTime(0.0001, time + Math.max(0.03, this.release))
    try {
      voice.osc.stop(time + this.release + 0.05)
    } catch {
      // The oscillator may already have a stop time.
    }
  }

  private silence(voice: Voice): void {
    try {
      voice.osc?.stop()
    } catch {
      // Already stopped.
    }
    voice.osc?.disconnect()
    voice.filter?.disconnect()
    voice.gain?.disconnect()
    voice.osc = null
    voice.filter = null
    voice.gain = null
    voice.stopped = true
  }
}
