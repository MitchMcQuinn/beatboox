import type { PadId } from '../types.ts'

export class DrumSynth {
  private ctx: AudioContext
  private output: GainNode
  private noise: AudioBuffer | null = null

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx
    this.output = ctx.createGain()
    this.output.gain.value = 0.9
    this.output.connect(destination)
  }

  trigger(pad: PadId, time: number, velocity: number): void {
    const level = Math.max(0.0001, (velocity / 127) * 0.9)
    if (pad === 'kick') this.kick(time, level)
    else if (pad === 'snare') this.snare(time, level)
    else if (pad === 'hat') this.hat(time, level)
    else this.clap(time, level)
  }

  private kick(time: number, level: number): void {
    const oscillator = this.ctx.createOscillator()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(168, time)
    oscillator.frequency.exponentialRampToValueAtTime(46, time + 0.09)
    const gain = this.envelope(time, level, 0.2)
    oscillator.connect(gain)
    oscillator.start(time)
    oscillator.stop(time + 0.22)
  }

  private snare(time: number, level: number): void {
    const source = this.ctx.createBufferSource()
    source.buffer = this.noiseBuffer()
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = 900
    const gain = this.envelope(time, level * 0.65, 0.16)
    source.connect(filter)
    filter.connect(gain)
    source.start(time)
    source.stop(time + 0.18)

    const body = this.ctx.createOscillator()
    body.type = 'triangle'
    body.frequency.setValueAtTime(196, time)
    const bodyGain = this.envelope(time, level * 0.35, 0.1)
    body.connect(bodyGain)
    body.start(time)
    body.stop(time + 0.12)
  }

  private hat(time: number, level: number): void {
    const source = this.ctx.createBufferSource()
    source.buffer = this.noiseBuffer()
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = 6500
    const gain = this.envelope(time, level * 0.4, 0.055)
    source.connect(filter)
    filter.connect(gain)
    source.start(time)
    source.stop(time + 0.08)
  }

  private clap(time: number, level: number): void {
    for (const offset of [0, 0.012, 0.026]) {
      const source = this.ctx.createBufferSource()
      source.buffer = this.noiseBuffer()
      const filter = this.ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.value = 1500
      filter.Q.value = 0.7
      const gain = this.envelope(time + offset, level * 0.38, 0.09)
      source.connect(filter)
      filter.connect(gain)
      source.start(time + offset)
      source.stop(time + offset + 0.12)
    }
  }

  private envelope(time: number, level: number, decay: number): GainNode {
    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(Math.max(0.0001, level), time)
    gain.gain.exponentialRampToValueAtTime(0.0001, time + decay)
    gain.connect(this.output)
    return gain
  }

  private noiseBuffer(): AudioBuffer {
    if (this.noise) return this.noise
    const length = Math.floor(this.ctx.sampleRate * 0.4)
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1
    this.noise = buffer
    return buffer
  }
}
