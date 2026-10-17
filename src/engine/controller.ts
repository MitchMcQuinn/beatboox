import { AudioEngine } from '../audio/AudioEngine.ts'
import { centsBetween } from '../audio/bend.ts'
import { drumVelocity, levelToMidi, unitToMidi } from '../audio/expression.ts'
import { NoteTracker, type TrackerEvent, type TrackerSettings } from '../audio/noteTracker.ts'
import { hzToMidiFloat, midiToHz } from '../audio/pitch.ts'
import { paletteForScale, scalePitchClasses } from '../audio/scales.ts'
import { DrumClassifier } from '../drums/classifier.ts'
import { padIdForNote, type PadConfig } from '../drums/pads.ts'
import { MidiRouter } from '../midi/MidiRouter.ts'
import { encodeSmf } from '../midi/smf.ts'
import { quantizeControls, quantizeNotes, Recorder } from '../sequencer/recorder.ts'
import { DrumSynth } from '../synth/DrumSynth.ts'
import { PolySynth } from '../synth/PolySynth.ts'
import { clearTake, loadExamples, loadTake, saveExamples, saveTake } from '../storage/db.ts'
import { loadSettings, saveSettings, type PersistedSettings } from '../storage/settings.ts'
import type { AnalysisFrame, DrumExample, Mode, PadId, RollNote, ScaleId, VoicingId } from '../types.ts'
import { clamp } from '../audio/math.ts'

export type UiState = PersistedSettings & {
  armed: boolean
  mode: Mode
  error: string | null
  midiBanner: string | null
  calibrating: boolean
  activeNote: number | null
  activeChord: number[]
  midiOutputs: { id: string; name: string }[]
  midiSupported: boolean
  trainingPad: PadId | null
  selectedPad: PadId
  modelReady: boolean
  modelLoading: boolean
  modelStale: boolean
  training: boolean
  recording: boolean
  playing: boolean
  notes: RollNote[]
  selectedNoteId: string | null
  lastPad: PadId | null
}

export type LiveMeters = {
  rms: number
  frequency: number
  confidence: number
  centroid: number
  cents: number
}

const MELODY_CHANNEL = 0
const DRUM_CHANNEL = 9

class Controller {
  readonly live: LiveMeters = { rms: 0, frequency: 0, confidence: 0, centroid: 0, cents: 0 }
  private state: UiState
  private listeners = new Set<() => void>()
  private audio = new AudioEngine()
  private midi = new MidiRouter()
  private tracker = new NoteTracker()
  private classifier = new DrumClassifier()
  private recorder = new Recorder()
  private synth: PolySynth | null = null
  private drumSynth: DrumSynth | null = null
  private monitorGain: GainNode | null = null
  private examples: DrumExample[] = []
  private calSamples: number[] = []
  private calTimer = 0
  private arming: Promise<void> | null = null
  private armGeneration = 0
  private lastRollPublish = 0
  private hitTimer = 0
  private timers: number[] = []
  private playToken = 0
  private playOrigin = 0
  private modelTried = false
  private midiRequested = false
  private held = new Set<string>()
  private padEpoch = new Map<number, number>()
  private peakRms = 0.05
  private loudSmooth = 0
  private brightSmooth = 0
  private lastLoud = -1
  private lastBright = -1

  constructor() {
    const saved = loadSettings()
    const midiSupported = this.midi.supported
    this.state = {
      ...saved,
      armed: false,
      mode: 'melody',
      error: null,
      midiBanner: midiSupported
        ? null
        : 'This browser has no Web MIDI. Notes still play on the in-app synth.',
      calibrating: false,
      activeNote: null,
      activeChord: [],
      midiOutputs: [],
      midiSupported,
      trainingPad: null,
      selectedPad: 'kick',
      modelReady: false,
      modelLoading: false,
      modelStale: false,
      training: false,
      recording: false,
      playing: false,
      notes: [],
      selectedNoteId: null,
      lastPad: null,
    }
    this.audio.onError = (message) => {
      this.audio.stopMic()
      this.releaseVoices()
      this.commit({ error: message, armed: false, activeNote: null, activeChord: [] })
    }
    this.midi.onChange = () => {
      const midiOutputs = this.midi.list()
      const midiOutputId = midiOutputs.some((port) => port.id === this.state.midiOutputId)
        ? this.state.midiOutputId
        : null
      this.midi.select(midiOutputId)
      this.commit({ midiOutputs, midiOutputId })
    }
    void this.hydrate()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getState = (): UiState => this.state

  getLive = (): LiveMeters => this.live

  getPlayhead = (): number => {
    if (!this.state.playing || !this.audio.context) return 0
    return Math.max(0, this.audio.context.currentTime - this.playOrigin)
  }

  visualLevel = (): { rms: number; peak: number } => this.audio.visual()

  readonly actions = {
    arm: () => this.arm(),
    disarm: () => this.disarm(),
    setMode: (mode: Mode) => this.setMode(mode),
    calibrate: () => this.calibrate(),
    setGain: (gain: number) => this.setGain(gain),
    setGate: (gate: number) => this.setGate(gate),
    setConfidence: (minConfidence: number) => this.setConfidence(minConfidence),
    setKey: (keyRoot: number) => this.setKey(keyRoot),
    setScale: (scaleId: ScaleId) => this.setScale(scaleId),
    togglePaletteNote: (note: number) => this.togglePaletteNote(note),
    resetPalette: () => this.resetPalette(),
    setVoicing: (voicing: VoicingId) => this.setVoicing(voicing),
    toggleCustomOffset: (semitone: number) => this.toggleCustomOffset(semitone),
    setBendRange: (bendRange: number) => this.update({ bendRange }, true),
    setDeadzone: (deadzoneCents: number) => this.update({ deadzoneCents }, true),
    setIntelliBend: (intelliBend: boolean) => this.update({ intelliBend }, true),
    setLoudnessCc: (patch: { enabled?: boolean; controller?: number }) => this.setLoudnessCc(patch),
    setBrightnessCc: (patch: { enabled?: boolean; controller?: number }) => this.setBrightnessCc(patch),
    setSynth: (patch: Partial<Pick<UiState, 'waveform' | 'cutoff' | 'attack' | 'release'>>) => this.setSynth(patch),
    setMonitor: (monitor: boolean) => this.setMonitor(monitor),
    enableMidi: () => this.enableMidi(),
    selectMidi: (id: string | null) => this.selectMidi(id),
    selectPad: (selectedPad: PadId) => this.commit({ selectedPad }),
    setTrainingPad: (id: PadId | null) => this.setTrainingPad(id),
    clearExamples: (id?: PadId) => this.clearExamples(id),
    trainDrums: () => this.trainDrums(),
    setPad: (id: PadId, patch: Partial<Pick<PadConfig, 'note' | 'sensitivity' | 'velocityAmount' | 'gateMs'>>) =>
      this.setPad(id, patch),
    setOnsetThreshold: (onsetThreshold: number) => this.setOnsetThreshold(onsetThreshold),
    setDrumThreshold: (drumThreshold: number) => this.update({ drumThreshold }, true),
    previewPad: (id: PadId) => this.previewPad(id),
    toggleRecord: () => this.toggleRecord(),
    togglePlay: () => this.togglePlay(),
    quantize: () => this.quantize(),
    selectNote: (selectedNoteId: string | null) => this.commit({ selectedNoteId }),
    updateNote: (id: string, patch: Partial<Pick<RollNote, 'start' | 'duration' | 'velocity' | 'note'>>) =>
      this.updateNote(id, patch),
    deleteNote: (id: string) => this.deleteNote(id),
    clearRoll: () => this.clearRoll(),
    exportMidi: () => this.exportMidi(),
    setBpm: (bpm: number) => this.setBpm(bpm),
  }

  private async hydrate(): Promise<void> {
    try {
      const [examples, take] = await Promise.all([loadExamples(), loadTake()])
      this.examples = examples
      const pads = this.state.pads.map((pad) => ({
        ...pad,
        examples: examples.filter((example) => example.pad === pad.id).length,
      }))
      if (take && take.notes.length > 0) {
        this.recorder.replace(take.notes, take.controls)
        this.commit({ pads, notes: take.notes, bpm: clamp(take.bpm, 40, 240) })
      } else {
        this.commit({ pads })
      }
    } catch {
      // Storage can be unavailable in private windows. The session still plays.
    }
  }

  private arm(): Promise<void> {
    if (this.state.armed) return Promise.resolve()
    if (this.arming) return this.arming
    const generation = ++this.armGeneration
    this.arming = this.armNow(generation).finally(() => {
      if (generation === this.armGeneration) this.arming = null
    })
    return this.arming
  }

  private async armNow(generation: number): Promise<void> {
    const ready = this.audio.startMic(this.onFrame)
    try {
      await this.ensureOutput()
      if (generation !== this.armGeneration) return
      this.audio.setGain(this.state.gain)
      const started = await ready
      if (!started || generation !== this.armGeneration) return
      this.pushDetection()
      void this.enableMidi()
      this.commit({ armed: true, error: null })
      this.chime()
    } catch (error) {
      if (generation !== this.armGeneration) return
      this.audio.stopMic()
      this.commit({
        armed: false,
        error: error instanceof Error ? error.message : 'Microphone permission was blocked.',
      })
    }
  }

  private disarm(): void {
    this.armGeneration += 1
    this.audio.stopMic()
    window.clearTimeout(this.calTimer)
    this.releaseVoices()
    this.commit({
      armed: false,
      calibrating: false,
      activeNote: null,
      activeChord: [],
      notes: this.state.recording ? [...this.recorder.notes] : this.state.notes,
    })
  }

  private setMode(mode: Mode): void {
    if (mode === this.state.mode) return
    this.releaseVoices()
    this.commit({
      mode,
      error: null,
      activeNote: null,
      activeChord: [],
      trainingPad: mode === 'melody' ? null : this.state.trainingPad,
      notes: this.state.recording ? [...this.recorder.notes] : this.state.notes,
    })
    if (mode === 'drums') void this.prepareDrums()
  }

  private async calibrate(): Promise<void> {
    if (this.state.calibrating) return
    this.calSamples = []
    window.clearTimeout(this.calTimer)
    this.commit({ calibrating: true, error: null })
    if (!this.state.armed) {
      await this.arm()
      if (!this.state.armed) {
        this.commit({ calibrating: false })
        return
      }
    }
    this.calTimer = window.setTimeout(() => {
      const samples = [...this.calSamples].sort((left, right) => left - right)
      const noiseFloor = samples[Math.floor(samples.length * 0.85)] ?? 0.005
      const gate = Math.min(0.3, noiseFloor * 3 + 0.004)
      this.commit({ calibrating: false, noiseFloor, gate })
      this.pushDetection()
      this.persist()
    }, 2000)
  }

  private setGain(gain: number): void {
    this.audio.setGain(gain)
    this.update({ gain }, true)
  }

  private setGate(gate: number): void {
    this.commit({ gate })
    this.pushDetection()
    this.persist()
  }

  private setConfidence(minConfidence: number): void {
    this.update({ minConfidence }, true)
  }

  private setKey(keyRoot: number): void {
    const next = ((keyRoot % 12) + 12) % 12
    if (this.state.paletteCustom || this.state.scaleId === 'custom') {
      this.update({ keyRoot: next }, true)
      return
    }
    this.update(
      {
        keyRoot: next,
        palette: paletteForScale(next, this.state.scaleId, this.state.palette),
      },
      true,
    )
  }

  private setScale(scaleId: ScaleId): void {
    if (scaleId === 'custom') {
      this.update({ scaleId, paletteCustom: true }, true)
      return
    }
    this.update(
      {
        scaleId,
        paletteCustom: false,
        palette: paletteForScale(this.state.keyRoot, scaleId, this.state.palette),
      },
      true,
    )
  }

  private togglePaletteNote(note: number): void {
    const palette = new Set(this.state.palette)
    if (palette.has(note)) palette.delete(note)
    else palette.add(note)
    this.update({ palette: [...palette].sort((a, b) => a - b), paletteCustom: true, scaleId: 'custom' }, true)
  }

  private resetPalette(): void {
    const scaleId = this.state.scaleId === 'custom' ? 'major' : this.state.scaleId
    this.update(
      {
        scaleId,
        paletteCustom: false,
        palette: paletteForScale(this.state.keyRoot, scaleId, []),
      },
      true,
    )
  }

  private setVoicing(voicing: VoicingId): void {
    this.update({ voicing }, true)
  }

  private toggleCustomOffset(semitone: number): void {
    if (semitone === 0) return
    const offsets = new Set(this.state.customOffsets)
    if (offsets.has(semitone)) offsets.delete(semitone)
    else offsets.add(semitone)
    offsets.add(0)
    this.update({ customOffsets: [...offsets].sort((a, b) => a - b) }, true)
  }

  private setLoudnessCc(patch: { enabled?: boolean; controller?: number }): void {
    const ccLoudnessEnabled = patch.enabled ?? this.state.ccLoudnessEnabled
    const ccLoudnessController = clamp(Math.round(patch.controller ?? this.state.ccLoudnessController), 0, 127)
    if (!ccLoudnessEnabled) this.synth?.setExpression(127)
    this.update({ ccLoudnessEnabled, ccLoudnessController }, true)
  }

  private setBrightnessCc(patch: { enabled?: boolean; controller?: number }): void {
    const ccBrightnessEnabled = patch.enabled ?? this.state.ccBrightnessEnabled
    const ccBrightnessController = clamp(Math.round(patch.controller ?? this.state.ccBrightnessController), 0, 127)
    if (!ccBrightnessEnabled) this.synth?.setModulation(127)
    this.update({ ccBrightnessEnabled, ccBrightnessController }, true)
  }

  private setSynth(patch: Partial<Pick<UiState, 'waveform' | 'cutoff' | 'attack' | 'release'>>): void {
    this.update(patch, true)
    this.applySynth()
  }

  private setMonitor(monitor: boolean): void {
    if (this.monitorGain) this.monitorGain.gain.value = monitor ? 1 : 0
    if (!monitor) this.synth?.allOff()
    this.update({ monitor }, true)
  }

  private async enableMidi(): Promise<void> {
    if (!this.midi.supported) {
      this.commit({
        midiSupported: false,
        midiBanner: 'This browser has no Web MIDI. Notes still play on the in-app synth.',
      })
      return
    }
    if (this.midiRequested) return
    this.midiRequested = true
    try {
      await this.midi.request()
      const midiOutputs = this.midi.list()
      const midiOutputId = midiOutputs.some((port) => port.id === this.state.midiOutputId)
        ? this.state.midiOutputId
        : null
      this.midi.select(midiOutputId)
      this.commit({ midiSupported: true, midiBanner: null, midiOutputs, midiOutputId })
    } catch {
      this.midiRequested = false
      this.commit({ midiBanner: 'Web MIDI permission was denied. The in-app synth still plays.' })
    }
  }

  private selectMidi(id: string | null): void {
    this.midi.select(id)
    this.update({ midiOutputId: id }, true)
  }

  private setTrainingPad(id: PadId | null): void {
    if (id) void this.prepareDrums()
    this.commit({ trainingPad: id !== null && this.state.trainingPad === id ? null : id, selectedPad: id ?? this.state.selectedPad })
  }

  private clearExamples(id?: PadId): void {
    this.examples = id ? this.examples.filter((example) => example.pad !== id) : []
    const pads = this.state.pads.map((pad) => ({
      ...pad,
      examples: this.examples.filter((example) => example.pad === pad.id).length,
    }))
    this.commit({ pads, modelStale: this.state.modelReady, trainingPad: null })
    void saveExamples(this.examples)
  }

  private async trainDrums(): Promise<void> {
    this.commit({ training: true, error: null })
    try {
      await this.classifier.train(this.examples)
      this.commit({ training: false, modelReady: true, modelStale: false, modelLoading: false })
    } catch (error) {
      this.commit({
        training: false,
        error: error instanceof Error ? error.message : 'Training failed.',
      })
    }
  }

  private setPad(
    id: PadId,
    patch: Partial<Pick<PadConfig, 'note' | 'sensitivity' | 'velocityAmount' | 'gateMs'>>,
  ): void {
    const pads = this.state.pads.map((pad) => {
      if (pad.id !== id) return pad
      return {
        ...pad,
        note: patch.note === undefined ? pad.note : clamp(Math.round(patch.note), 0, 127),
        sensitivity: patch.sensitivity === undefined ? pad.sensitivity : clamp(patch.sensitivity, 0, 1),
        velocityAmount: patch.velocityAmount === undefined ? pad.velocityAmount : clamp(patch.velocityAmount, 0, 1),
        gateMs: patch.gateMs === undefined ? pad.gateMs : clamp(Math.round(patch.gateMs), 30, 800),
      }
    })
    this.update({ pads }, true)
  }

  private setOnsetThreshold(onsetThreshold: number): void {
    this.commit({ onsetThreshold })
    this.pushDetection()
    this.persist()
  }

  private previewPad(id: PadId): void {
    const pad = this.state.pads.find((item) => item.id === id)
    if (!pad) return
    this.commit({ selectedPad: id })
    void this.ensureOutput().then((context) => {
      this.firePad(pad, 108, context.currentTime, false)
    })
  }

  private async toggleRecord(): Promise<void> {
    try {
      await this.ensureOutput()
    } catch (error) {
      this.commit({ error: error instanceof Error ? error.message : 'Could not start recording.' })
      return
    }
    if (this.state.playing) this.stopPlayback()
    if (this.state.recording) {
      const now = this.audio.context?.currentTime ?? 0
      this.recorder.stop(now)
      const notes = [...this.recorder.notes]
      this.commit({ recording: false, notes })
      void saveTake({ notes, controls: [...this.recorder.controls], bpm: this.state.bpm })
      return
    }
    this.recorder.start(this.audio.context?.currentTime ?? 0)
    this.commit({ recording: true, notes: [], selectedNoteId: null })
  }

  private togglePlay(): void {
    if (this.state.playing) {
      this.stopPlayback()
      return
    }
    void this.play()
  }

  private async play(): Promise<void> {
    if (this.state.notes.length === 0) return
    this.stopPlayback()
    const context = await this.ensureOutput()
    const start = context.currentTime + 0.06
    const token = this.playToken
    this.playOrigin = start
    this.commit({ playing: true })
    let end = start
    for (const note of this.state.notes) {
      const on = start + note.start
      const off = on + note.duration
      end = Math.max(end, off)
      if (note.channel === DRUM_CHANNEL) {
        if (this.state.monitor) this.drumSynth?.trigger(padIdForNote(note.note, this.state.pads), on, note.velocity)
      } else if (this.state.monitor) {
        this.synth?.noteOn(note.note, note.velocity, on)
        this.synth?.noteOff(note.note, off)
      }
      const now = context.currentTime
      this.midi.noteOn(note.channel, note.note, note.velocity, performance.now() + (on - now) * 1000)
      this.midi.noteOff(note.channel, note.note, performance.now() + (off - now) * 1000)
    }
    for (const control of this.recorder.controls) {
      const when = start + control.time
      const delay = Math.max(0, (when - context.currentTime) * 1000)
      this.later(delay, () => {
        if (token !== this.playToken) return
        if (control.kind === 'bend') {
          this.synth?.setBend(control.value, this.state.bendRange)
          this.midi.pitchBend(control.channel, control.value)
        } else {
          const controller = control.controller ?? 1
          if (controller === this.state.ccLoudnessController) this.synth?.setExpression(control.value)
          if (controller === this.state.ccBrightnessController) this.synth?.setModulation(control.value)
          this.midi.cc(control.channel, controller, control.value)
        }
      })
    }
    this.later(Math.max(0, (end - context.currentTime) * 1000) + 40, () => {
      if (token !== this.playToken) return
      this.playToken += 1
      this.commit({ playing: false })
    })
  }

  private quantize(): void {
    const notes = quantizeNotes(this.state.notes, this.state.bpm)
    const controls = quantizeControls(this.recorder.controls, this.state.bpm)
    this.recorder.replace(notes, controls)
    this.commit({ notes })
    void saveTake({ notes, controls, bpm: this.state.bpm })
  }

  private updateNote(id: string, patch: Partial<Pick<RollNote, 'start' | 'duration' | 'velocity' | 'note'>>): void {
    const notes = this.state.notes.map((note) => {
      if (note.id !== id) return note
      return {
        ...note,
        start: Math.max(0, patch.start ?? note.start),
        duration: Math.max(0.05, patch.duration ?? note.duration),
        velocity: clamp(Math.round(patch.velocity ?? note.velocity), 1, 127),
        note: clamp(Math.round(patch.note ?? note.note), 0, 127),
      }
    })
    this.recorder.replace(notes)
    this.commit({ notes })
    void saveTake({ notes, controls: this.recorder.controls, bpm: this.state.bpm })
  }

  private deleteNote(id: string): void {
    const notes = this.state.notes.filter((note) => note.id !== id)
    this.recorder.replace(notes)
    this.commit({ notes, selectedNoteId: this.state.selectedNoteId === id ? null : this.state.selectedNoteId })
    void saveTake({ notes, controls: this.recorder.controls, bpm: this.state.bpm })
  }

  private clearRoll(): void {
    this.recorder.replace([], [])
    this.commit({ notes: [], selectedNoteId: null })
    void clearTake()
  }

  private exportMidi(): void {
    const bytes = encodeSmf(this.state.notes, this.recorder.controls, this.state.bpm)
    const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    const url = URL.createObjectURL(new Blob([copy], { type: 'audio/midi' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'beatboox.mid'
    link.click()
    URL.revokeObjectURL(url)
  }

  private setBpm(bpm: number): void {
    const next = clamp(Math.round(bpm), 40, 240)
    this.update({ bpm: next }, true)
    if (this.state.notes.length > 0) {
      void saveTake({ notes: this.state.notes, controls: this.recorder.controls, bpm: next })
    }
  }

  private onFrame = (frame: AnalysisFrame): void => {
    this.live.rms = frame.rms
    this.live.frequency = frame.frequency
    this.live.confidence = frame.confidence
    this.live.centroid = frame.centroid
    if (this.state.calibrating) this.calSamples.push(frame.rms)
    if (!this.state.armed) return
    const time = Math.max(frame.time, this.audio.context?.currentTime ?? frame.time)
    const stamped = time === frame.time ? frame : { ...frame, time }
    this.updateExpression(stamped)
    if (this.state.mode === 'melody') {
      for (const event of this.tracker.push(stamped, this.trackerSettings())) this.dispatch(event)
      this.updateCents(stamped)
    } else if (stamped.features) {
      this.dispatchDrum(stamped)
    }
    if (this.state.recording && stamped.time - this.lastRollPublish > 0.1) {
      this.lastRollPublish = stamped.time
      this.commit({ notes: this.recorder.snapshot(stamped.time) })
    }
  }

  private updateCents(frame: AnalysisFrame): void {
    if (this.state.activeNote !== null && frame.frequency > 0) {
      this.live.cents = centsBetween(frame.frequency, midiToHz(this.state.activeNote))
    } else if (frame.frequency > 0 && frame.confidence > 0.45) {
      const midi = hzToMidiFloat(frame.frequency)
      this.live.cents = (midi - Math.round(midi)) * 100
    } else {
      this.live.cents = 0
    }
  }

  private dispatch(event: TrackerEvent): void {
    if (event.type === 'noteOn') {
      for (const note of event.notes) {
        this.playSynth(note, event.velocity, event.time)
        this.midi.noteOn(MELODY_CHANNEL, note, event.velocity)
        this.held.add(`${MELODY_CHANNEL}:${note}`)
        this.recorder.noteOn(MELODY_CHANNEL, note, event.velocity, event.time)
      }
      this.commit({
        activeNote: event.note,
        activeChord: event.notes,
        notes: this.state.recording ? this.recorder.snapshot(event.time) : this.state.notes,
      })
      return
    }
    if (event.type === 'noteOff') {
      for (const note of event.notes) {
        try {
          this.synth?.noteOff(note, event.time)
        } catch {
          // A failed envelope must not drop the recorded note.
        }
        this.midi.noteOff(MELODY_CHANNEL, note)
        this.held.delete(`${MELODY_CHANNEL}:${note}`)
        this.recorder.noteOff(MELODY_CHANNEL, note, event.time)
      }
      this.commit({
        activeNote: null,
        activeChord: [],
        notes: this.state.recording ? this.recorder.snapshot(event.time) : this.state.notes,
      })
      return
    }
    this.synth?.setBend(event.value, this.state.bendRange)
    this.midi.pitchBend(MELODY_CHANNEL, event.value)
    this.recorder.control({ time: 0, channel: MELODY_CHANNEL, kind: 'bend', value: event.value }, event.time)
  }

  private dispatchDrum(frame: AnalysisFrame): void {
    if (!frame.features) return
    const training = this.state.trainingPad
    if (training) {
      this.examples.push({ pad: training, features: Array.from(frame.features) })
      const count = this.examples.filter((example) => example.pad === training).length
      const pads = this.state.pads.map((pad) => (pad.id === training ? { ...pad, examples: count } : pad))
      this.commit({
        pads,
        trainingPad: count >= 8 ? null : training,
        modelStale: this.state.modelReady || this.state.modelStale,
      })
      void saveExamples(this.examples)
      return
    }
    if (!this.classifier.ready) return
    const prediction = this.classifier.predict(frame.features)
    if (!prediction) return
    const pad = this.state.pads.find((item) => item.id === prediction.pad)
    if (!pad) return
    const threshold = clamp(this.state.drumThreshold - (pad.sensitivity - 0.5) * 0.4, 0.2, 0.95)
    if (prediction.probability < threshold) return
    this.firePad(pad, drumVelocity(frame.rms, this.state.gate, pad.velocityAmount), frame.time, true)
  }

  private firePad(pad: PadConfig, velocity: number, time: number, record: boolean): void {
    const previous = this.padEpoch.get(pad.note) ?? -1
    if (record && previous >= 0 && time - previous < 0.05) return
    if (this.state.monitor) this.drumSynth?.trigger(pad.id, time, velocity)
    this.midi.noteOn(DRUM_CHANNEL, pad.note, velocity)
    const epoch = time
    this.padEpoch.set(pad.note, epoch)
    const duration = pad.gateMs / 1000
    const delay = Math.max(0, (time + duration - (this.audio.context?.currentTime ?? time)) * 1000)
    window.setTimeout(() => {
      if (this.padEpoch.get(pad.note) === epoch) this.midi.noteOff(DRUM_CHANNEL, pad.note)
    }, delay)
    if (record) this.recorder.oneShot(DRUM_CHANNEL, pad.note, velocity, time, duration)
    window.clearTimeout(this.hitTimer)
    this.hitTimer = window.setTimeout(() => this.commit({ lastPad: null }), 140)
    this.commit({
      lastPad: pad.id,
      notes: record && this.state.recording ? [...this.recorder.notes] : this.state.notes,
    })
  }

  private updateExpression(frame: AnalysisFrame): void {
    this.peakRms = Math.max(frame.rms, this.peakRms * 0.995)
    this.loudSmooth += 0.25 * (frame.rms - this.loudSmooth)
    this.brightSmooth += 0.2 * (frame.centroid - this.brightSmooth)
    if (this.state.ccLoudnessEnabled) {
      const value = levelToMidi(this.loudSmooth, this.state.gate, Math.max(this.peakRms, this.state.gate + 0.02))
      if (value !== this.lastLoud) {
        this.lastLoud = value
        this.synth?.setExpression(value)
        this.midi.cc(MELODY_CHANNEL, this.state.ccLoudnessController, value)
        this.recorder.control(
          { time: 0, channel: MELODY_CHANNEL, kind: 'cc', controller: this.state.ccLoudnessController, value },
          frame.time,
        )
      }
    }
    if (this.state.ccBrightnessEnabled) {
      const value = unitToMidi(this.brightSmooth)
      if (value !== this.lastBright) {
        this.lastBright = value
        this.synth?.setModulation(value)
        this.midi.cc(MELODY_CHANNEL, this.state.ccBrightnessController, value)
        this.recorder.control(
          { time: 0, channel: MELODY_CHANNEL, kind: 'cc', controller: this.state.ccBrightnessController, value },
          frame.time,
        )
      }
    }
  }

  private async prepareDrums(): Promise<void> {
    if (this.modelTried) return
    this.modelTried = true
    this.commit({ modelLoading: true })
    try {
      const modelReady = await this.classifier.load()
      this.commit({ modelLoading: false, modelReady })
    } catch {
      this.commit({ modelLoading: false, modelReady: false })
    }
  }

  private playSynth(note: number, velocity: number, time: number): void {
    if (!this.state.monitor) return
    try {
      this.synth?.noteOn(note, velocity, time)
    } catch {
      // Scheduling in the past used to throw and skip the recorded note.
    }
  }

  private chime(): void {
    if (!this.state.monitor || !this.synth || !this.audio.context) return
    const now = this.audio.context.currentTime + 0.05
    this.playSynth(72, 90, now)
    try {
      this.synth.noteOff(72, now + 0.09)
    } catch {
      // The chime is only a speaker check.
    }
  }

  private async ensureOutput(): Promise<AudioContext> {
    const context = await this.audio.ensure()
    if (!this.monitorGain) {
      this.monitorGain = context.createGain()
      this.monitorGain.gain.value = this.state.monitor ? 1 : 0
      this.monitorGain.connect(this.audio.output())
      this.audio.keepMonitor(this.monitorGain)
      this.synth = new PolySynth(context, this.monitorGain)
      this.drumSynth = new DrumSynth(context, this.monitorGain)
      this.applySynth()
    }
    return context
  }

  private applySynth(): void {
    if (!this.synth) return
    this.synth.waveform = this.state.waveform
    this.synth.cutoff = this.state.cutoff
    this.synth.attack = this.state.attack
    this.synth.release = this.state.release
  }

  private trackerSettings(): TrackerSettings {
    return {
      gate: this.state.gate,
      minConfidence: this.state.minConfidence,
      holdTime: 0.045,
      minDuration: 0.07,
      releaseTime: 0.08,
      enabledNotes: this.state.palette,
      pitchClasses: scalePitchClasses(this.state.keyRoot, this.state.scaleId, this.state.palette),
      voicing: this.state.voicing,
      customOffsets: this.state.customOffsets,
      intelliBend: this.state.intelliBend,
      deadzoneCents: this.state.deadzoneCents,
      bendRange: this.state.bendRange,
    }
  }

  private pushDetection(): void {
    this.audio.configure({
      onsetThreshold: this.state.onsetThreshold,
      minRms: Math.max(0.008, this.state.gate * 0.35),
    })
  }

  private releaseVoices(): void {
    const now = this.audio.context?.currentTime ?? 0
    for (const key of this.held) {
      const [channelText, noteText] = key.split(':')
      const channel = Number(channelText)
      const note = Number(noteText)
      this.midi.noteOff(channel, note)
      if (channel === MELODY_CHANNEL) this.synth?.noteOff(note, now)
      this.recorder.noteOff(channel, note, now)
    }
    this.held.clear()
    this.synth?.allOff()
    this.midi.silence(MELODY_CHANNEL)
    this.midi.silence(DRUM_CHANNEL)
    this.tracker.reset()
  }

  private stopPlayback(): void {
    for (const id of this.timers) window.clearTimeout(id)
    this.timers = []
    this.playToken += 1
    this.synth?.allOff()
    this.midi.silence(MELODY_CHANNEL)
    this.midi.silence(DRUM_CHANNEL)
    if (this.state.playing) this.commit({ playing: false })
  }

  private later(ms: number, fn: () => void): void {
    this.timers.push(window.setTimeout(fn, ms))
  }

  private update(patch: Partial<UiState>, persist: boolean): void {
    this.commit(patch)
    if (persist) this.persist()
  }

  private persist(): void {
    const state = this.state
    saveSettings({
      gain: state.gain,
      gate: state.gate,
      noiseFloor: state.noiseFloor,
      minConfidence: state.minConfidence,
      keyRoot: state.keyRoot,
      scaleId: state.scaleId,
      palette: state.palette,
      paletteCustom: state.paletteCustom,
      voicing: state.voicing,
      customOffsets: state.customOffsets,
      bendRange: state.bendRange,
      deadzoneCents: state.deadzoneCents,
      intelliBend: state.intelliBend,
      ccLoudnessEnabled: state.ccLoudnessEnabled,
      ccLoudnessController: state.ccLoudnessController,
      ccBrightnessEnabled: state.ccBrightnessEnabled,
      ccBrightnessController: state.ccBrightnessController,
      waveform: state.waveform,
      cutoff: state.cutoff,
      attack: state.attack,
      release: state.release,
      monitor: state.monitor,
      midiOutputId: state.midiOutputId,
      onsetThreshold: state.onsetThreshold,
      drumThreshold: state.drumThreshold,
      pads: state.pads.map((pad) => ({ ...pad, examples: 0 })),
      bpm: state.bpm,
    })
  }

  private commit(patch: Partial<UiState>): void {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }
}

export const controller = new Controller()
