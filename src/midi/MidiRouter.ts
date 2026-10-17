import { clamp } from '../audio/math.ts'

export type MidiPort = {
  id: string
  name: string
}

export class MidiRouter {
  onChange: (() => void) | null = null
  private access: MIDIAccess | null = null
  private output: MIDIOutput | null = null
  private outputs: MidiPort[] = []

  get supported(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function'
  }

  list(): MidiPort[] {
    return this.outputs
  }

  async request(): Promise<void> {
    if (!this.supported) return
    this.access = await navigator.requestMIDIAccess({ sysex: false })
    this.access.onstatechange = () => {
      this.readOutputs()
      this.onChange?.()
    }
    this.readOutputs()
  }

  select(id: string | null): void {
    this.output = id ? (this.access?.outputs.get(id) ?? null) : null
  }

  noteOn(channel: number, note: number, velocity: number, when?: number): void {
    this.send([0x90 | (channel & 0x0f), note & 0x7f, clamp(Math.round(velocity), 0, 127)], when)
  }

  noteOff(channel: number, note: number, when?: number): void {
    this.send([0x80 | (channel & 0x0f), note & 0x7f, 0], when)
  }

  pitchBend(channel: number, value: number, when?: number): void {
    const bend = clamp(Math.round(value), 0, 16383)
    this.send([0xe0 | (channel & 0x0f), bend & 0x7f, (bend >> 7) & 0x7f], when)
  }

  cc(channel: number, controller: number, value: number, when?: number): void {
    this.send(
      [0xb0 | (channel & 0x0f), controller & 0x7f, clamp(Math.round(value), 0, 127)],
      when,
    )
  }

  silence(channel: number): void {
    this.cc(channel, 120, 0)
    this.cc(channel, 123, 0)
  }

  private readOutputs(): void {
    const outputs: MidiPort[] = []
    this.access?.outputs.forEach((port) => {
      outputs.push({ id: port.id, name: port.name || 'MIDI output' })
    })
    this.outputs = outputs
    if (this.output && ![...outputs].some((port) => port.id === this.output?.id)) this.output = null
  }

  private send(data: number[], when?: number): void {
    if (!this.output) return
    try {
      this.output.send(data, when)
    } catch {
      this.output = null
    }
  }
}
