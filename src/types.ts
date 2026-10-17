export type Mode = 'melody' | 'drums'

export type PadId = 'kick' | 'snare' | 'hat' | 'clap'

export type ScaleId =
  | 'major'
  | 'naturalMinor'
  | 'harmonicMinor'
  | 'dorian'
  | 'mixolydian'
  | 'majorPentatonic'
  | 'minorPentatonic'
  | 'chromatic'
  | 'custom'

export type VoicingId = 'off' | 'triad' | 'seventh' | 'sus2' | 'sus4' | 'power' | 'custom'

export type Waveform = 'sawtooth' | 'square' | 'triangle' | 'sine'

export type AnalysisFrame = {
  frequency: number
  confidence: number
  rms: number
  centroid: number
  features: Float32Array | null
  time: number
}

export type RollNote = {
  id: string
  note: number
  velocity: number
  start: number
  duration: number
  channel: number
}

export type ControlEvent = {
  time: number
  channel: number
  kind: 'bend' | 'cc'
  value: number
  controller?: number
}

export type DrumExample = {
  pad: PadId
  features: number[]
}

export type SavedTake = {
  notes: RollNote[]
  controls: ControlEvent[]
  bpm: number
}
