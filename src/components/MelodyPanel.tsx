import { useEffect, useRef } from 'react'
import { CUSTOM_INTERVALS } from '../audio/chords.ts'
import { hzToMidi, noteName } from '../audio/pitch.ts'
import { KEY_NAMES, SCALE_OPTIONS, VOICE_HIGH, VOICE_LOW } from '../audio/scales.ts'
import type { Beatboox } from '../engine/useBeatboox.ts'
import type { VoicingId } from '../types.ts'
import { Panel, Select } from './ui.tsx'

const BLACK = new Set([1, 3, 6, 8, 10])
const VOICINGS: { id: VoicingId; label: string }[] = [
  { id: 'off', label: 'Single note' },
  { id: 'triad', label: 'Diatonic triad' },
  { id: 'seventh', label: 'Diatonic 7th' },
  { id: 'sus2', label: 'Sus2' },
  { id: 'sus4', label: 'Sus4' },
  { id: 'power', label: 'Power' },
  { id: 'custom', label: 'Custom' },
]

export function MelodyPanel({ state, actions, getLive }: Beatboox) {
  const nameRef = useRef<HTMLParagraphElement>(null)
  const detailRef = useRef<HTMLParagraphElement>(null)
  const needleRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let frame = 0
    const tick = () => {
      const live = getLive()
      const heard = live.frequency > 0 && live.confidence > 0.45
      if (nameRef.current) {
        nameRef.current.textContent =
          state.activeNote !== null ? noteName(state.activeNote) : heard ? noteName(hzToMidi(live.frequency)) : '–'
      }
      if (detailRef.current) {
        detailRef.current.textContent =
          state.activeNote !== null
            ? `${live.frequency.toFixed(1)} Hz · synth on`
            : heard
              ? `${live.frequency.toFixed(1)} Hz · conf ${live.confidence.toFixed(2)} · waiting to lock`
              : 'Waiting for a note'
      }
      if (needleRef.current) {
        const cents = Math.max(-50, Math.min(50, live.cents))
        needleRef.current.style.left = `${50 + cents}%`
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [getLive, state.activeNote])

  const whites: number[] = []
  for (let note = VOICE_LOW; note <= VOICE_HIGH; note += 1) {
    if (!BLACK.has(note % 12)) whites.push(note)
  }

  return (
    <Panel title="Melody" className="min-w-0">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p ref={nameRef} className="font-mono text-5xl leading-none">
            –
          </p>
          <p ref={detailRef} className="mt-2 font-mono text-xs text-muted">
            Waiting for a note
          </p>
        </div>
        <div className="w-40">
          <div className="relative h-2 rounded-sm bg-black">
            <div className="absolute top-0 left-1/2 h-full w-px bg-muted" />
            <div ref={needleRef} className="absolute top-[-3px] h-3.5 w-0.5 bg-signal" />
          </div>
          <p className="mt-1 text-center text-[10px] tracking-widest text-muted">FLAT · SHARP</p>
        </div>
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Select label="Key" value={state.keyRoot} onChange={(value) => actions.setKey(Number(value))}>
          {KEY_NAMES.map((name, index) => (
            <option key={name} value={index}>
              {name}
            </option>
          ))}
        </Select>
        <Select label="Scale" value={state.scaleId} onChange={(value) => actions.setScale(value as typeof state.scaleId)}>
          {SCALE_OPTIONS.map((scale) => (
            <option key={scale.id} value={scale.id}>
              {scale.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="mb-2 flex items-center justify-between text-xs text-muted">
        <span>{state.paletteCustom ? 'Custom palette' : 'Scale palette'} · click a key to toggle</span>
        <button className="min-h-11 px-2 text-ink" onClick={() => actions.resetPalette()}>
          Reset to scale
        </button>
      </div>
      <div className="overflow-x-auto pb-2">
        <div className="relative h-28" style={{ width: whites.length * 22 }}>
          {whites.map((note, index) => {
            const enabled = state.palette.includes(note)
            const active = state.activeChord.includes(note)
            return (
              <button
                key={note}
                aria-label={noteName(note)}
                className={`absolute top-0 flex h-28 items-end justify-center border border-line pb-1 text-[9px] leading-none ${enabled ? 'bg-zinc-100 text-black' : 'bg-zinc-800 text-zinc-500'} ${active ? 'outline outline-2 outline-signal' : ''}`}
                style={{ left: index * 22, width: 22 }}
                onClick={() => actions.togglePaletteNote(note)}
              >
                {note % 12 === 0 ? noteName(note) : ''}
              </button>
            )
          })}
          {Array.from({ length: VOICE_HIGH - VOICE_LOW + 1 }, (_, offset) => VOICE_LOW + offset)
            .filter((note) => BLACK.has(note % 12))
            .map((note) => {
              const whiteBefore = whites.filter((white) => white < note).length
              const enabled = state.palette.includes(note)
              const active = state.activeChord.includes(note)
              return (
                <button
                  key={note}
                  aria-label={noteName(note)}
                  className={`absolute top-0 z-10 h-16 border border-black ${enabled ? 'bg-zinc-900' : 'bg-zinc-700'} ${active ? 'outline outline-2 outline-signal' : ''}`}
                  style={{ left: whiteBefore * 22 - 7, width: 14 }}
                  onClick={() => actions.togglePaletteNote(note)}
                />
              )
            })}
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Select label="Chord" value={state.voicing} onChange={(value) => actions.setVoicing(value as VoicingId)}>
          {VOICINGS.map((voicing) => (
            <option key={voicing.id} value={voicing.id}>
              {voicing.label}
            </option>
          ))}
        </Select>
        {state.activeChord.length > 1 && (
          <p className="font-mono text-sm text-signal">{state.activeChord.map((note) => noteName(note)).join(' ')}</p>
        )}
      </div>
      {state.voicing === 'custom' && (
        <div className="mt-3 flex flex-wrap gap-2">
          {CUSTOM_INTERVALS.map((interval) => {
            const on = state.customOffsets.includes(interval)
            return (
              <button
                key={interval}
                className={`min-h-11 min-w-11 rounded border text-sm ${on ? 'border-signal text-signal' : 'border-line text-muted'}`}
                onClick={() => actions.toggleCustomOffset(interval)}
                disabled={interval === 0}
              >
                {interval === 0 ? 'R' : `+${interval}`}
              </button>
            )
          })}
        </div>
      )}
    </Panel>
  )
}
