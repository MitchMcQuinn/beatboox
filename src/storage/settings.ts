import { paletteForScale } from '../audio/scales.ts'
import { DEFAULT_PADS, type PadConfig } from '../drums/pads.ts'
import type { ScaleId, VoicingId, Waveform } from '../types.ts'

const STORAGE_KEY = 'beatboox-settings'

export type PersistedSettings = {
  gain: number
  gate: number
  noiseFloor: number
  minConfidence: number
  keyRoot: number
  scaleId: ScaleId
  palette: number[]
  paletteCustom: boolean
  voicing: VoicingId
  customOffsets: number[]
  bendRange: number
  deadzoneCents: number
  intelliBend: boolean
  ccLoudnessEnabled: boolean
  ccLoudnessController: number
  ccBrightnessEnabled: boolean
  ccBrightnessController: number
  waveform: Waveform
  cutoff: number
  attack: number
  release: number
  monitor: boolean
  midiOutputId: string | null
  onsetThreshold: number
  drumThreshold: number
  pads: PadConfig[]
  bpm: number
}

export function defaultSettings(): PersistedSettings {
  return {
    gain: 1,
    gate: 0.02,
    noiseFloor: 0.005,
    minConfidence: 0.7,
    keyRoot: 0,
    scaleId: 'major',
    palette: paletteForScale(0, 'major', []),
    paletteCustom: false,
    voicing: 'off',
    customOffsets: [0, 4, 7],
    bendRange: 2,
    deadzoneCents: 20,
    intelliBend: true,
    ccLoudnessEnabled: true,
    ccLoudnessController: 11,
    ccBrightnessEnabled: true,
    ccBrightnessController: 1,
    waveform: 'sawtooth',
    cutoff: 1800,
    attack: 0.02,
    release: 0.12,
    monitor: true,
    midiOutputId: null,
    onsetThreshold: 0.28,
    drumThreshold: 0.55,
    pads: DEFAULT_PADS.map((pad) => ({ ...pad })),
    bpm: 120,
  }
}

export function loadSettings(): PersistedSettings {
  const defaults = defaultSettings()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaults
    const parsed = JSON.parse(raw) as Partial<PersistedSettings>
    const scaleId = isScale(parsed.scaleId) ? parsed.scaleId : defaults.scaleId
    const keyRoot = clampInt(parsed.keyRoot, 0, 11, defaults.keyRoot)
    const palette = Array.isArray(parsed.palette)
      ? parsed.palette.filter((note) => Number.isInteger(note) && note >= 0 && note <= 127)
      : paletteForScale(keyRoot, scaleId, defaults.palette)
    return {
      ...defaults,
      ...parsed,
      keyRoot,
      scaleId,
      palette: palette.length > 0 ? palette : paletteForScale(keyRoot, scaleId === 'custom' ? 'major' : scaleId, []),
      customOffsets: Array.isArray(parsed.customOffsets)
        ? parsed.customOffsets.filter((offset) => Number.isInteger(offset))
        : defaults.customOffsets,
      pads: mergePads(parsed.pads),
      waveform: isWaveform(parsed.waveform) ? parsed.waveform : defaults.waveform,
      voicing: isVoicing(parsed.voicing) ? parsed.voicing : defaults.voicing,
      midiOutputId: typeof parsed.midiOutputId === 'string' ? parsed.midiOutputId : null,
      bpm: clampInt(parsed.bpm, 40, 240, defaults.bpm),
      gain: clampNum(parsed.gain, 0.1, 4, defaults.gain),
      gate: clampNum(parsed.gate, 0, 0.4, defaults.gate),
    }
  } catch {
    return defaults
  }
}

export function saveSettings(settings: PersistedSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

function mergePads(value: PadConfig[] | undefined): PadConfig[] {
  const defaults = DEFAULT_PADS.map((pad) => ({ ...pad }))
  if (!Array.isArray(value)) return defaults
  return defaults.map((pad) => {
    const saved = value.find((item) => item?.id === pad.id)
    if (!saved) return pad
    return {
      ...pad,
      note: clampInt(saved.note, 0, 127, pad.note),
      sensitivity: clampNum(saved.sensitivity, 0, 1, pad.sensitivity),
      velocityAmount: clampNum(saved.velocityAmount, 0, 1, pad.velocityAmount),
      gateMs: clampInt(saved.gateMs, 30, 800, pad.gateMs),
    }
  })
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === 'number' ? Math.round(value) : fallback
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, number))
}

function clampNum(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === 'number' ? value : fallback
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, number))
}

function isScale(value: unknown): value is ScaleId {
  return (
    value === 'major' ||
    value === 'naturalMinor' ||
    value === 'harmonicMinor' ||
    value === 'dorian' ||
    value === 'mixolydian' ||
    value === 'majorPentatonic' ||
    value === 'minorPentatonic' ||
    value === 'chromatic' ||
    value === 'custom'
  )
}

function isVoicing(value: unknown): value is VoicingId {
  return (
    value === 'off' ||
    value === 'triad' ||
    value === 'seventh' ||
    value === 'sus2' ||
    value === 'sus4' ||
    value === 'power' ||
    value === 'custom'
  )
}

function isWaveform(value: unknown): value is Waveform {
  return value === 'sawtooth' || value === 'square' || value === 'triangle' || value === 'sine'
}
