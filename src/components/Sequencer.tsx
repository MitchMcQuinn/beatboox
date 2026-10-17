import { useEffect, useRef, type PointerEvent } from 'react'
import { noteName } from '../audio/pitch.ts'
import type { Beatboox } from '../engine/useBeatboox.ts'
import type { RollNote } from '../types.ts'

export function Sequencer({ state, actions, getPlayhead }: Beatboox) {
  const section = useRef<HTMLElement>(null)
  const line = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: string; mode: 'move' | 'resize'; originX: number; start: number; duration: number; nextStart: number; nextDuration: number } | null>(null)
  const pps = 90
  const rowH = 14
  const pitches = pitchRange(state.notes)
  const high = pitches[0] ?? 72
  const span = Math.max(((60 / state.bpm) * 4) * 4, ...state.notes.map((note) => note.start + note.duration), 1) + 0.5
  const selected = state.notes.find((note) => note.id === state.selectedNoteId) ?? null

  useEffect(() => {
    let frame = 0
    const tick = () => {
      if (line.current) {
        const playhead = getPlayhead()
        line.current.style.transform = `translateX(${playhead * pps}px)`
        line.current.style.opacity = state.playing ? '1' : '0'
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [getPlayhead, state.playing])

  useEffect(() => {
    if (state.recording) section.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [state.recording])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return
      if ((event.key === 'Backspace' || event.key === 'Delete') && state.selectedNoteId) {
        event.preventDefault()
        actions.deleteNote(state.selectedNoteId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [actions, state.selectedNoteId])

  return (
    <section ref={section} className="border-t border-line bg-panel">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <h2 className={`mr-2 text-[11px] tracking-[0.16em] uppercase ${state.recording ? 'text-danger' : 'text-muted'}`}>
          {state.recording ? 'Recording' : 'Piano roll'}
        </h2>
        <label className="flex items-center gap-2 text-xs text-muted">
          BPM
          <input
            className="w-20"
            type="number"
            min={40}
            max={240}
            value={state.bpm}
            onChange={(event) => actions.setBpm(Number(event.target.value))}
          />
        </label>
        <button className="min-h-11 rounded border border-line px-3 text-sm" onClick={() => actions.quantize()}>
          Quantize 1/16
        </button>
        <button className="min-h-11 rounded border border-line px-3 text-sm" onClick={() => actions.clearRoll()}>
          Clear
        </button>
        <button
          className="min-h-11 rounded border border-line px-3 text-sm disabled:border-line disabled:text-muted disabled:opacity-40"
          disabled={state.notes.length === 0}
          onClick={() => actions.exportMidi()}
        >
          Export .mid
        </button>
        {selected && (
          <label className="flex min-w-40 flex-1 items-center gap-2 text-xs text-muted">
            Velocity {selected.velocity}
            <input
              className="w-full"
              type="range"
              min={1}
              max={127}
              value={selected.velocity}
              onChange={(event) => actions.updateNote(selected.id, { velocity: Number(event.target.value) })}
            />
          </label>
        )}
      </div>
      {state.notes.length === 0 && (
        <p className="px-3 pb-2 text-xs leading-5 text-muted">
          {state.recording
            ? 'Sing a steady note. It is drawn here as soon as the pitch locks, and you should hear the synth.'
            : 'Press Record, then sing. Notes show up in this roll, and Play listens back through the synth.'}
        </p>
      )}
      <div className="max-h-64 overflow-auto border-t border-line" onPointerDown={() => actions.selectNote(null)}>
        <div className="relative" style={{ width: 48 + span * pps, height: Math.max(pitches.length, 1) * rowH }}>
          <div className="absolute top-0 bottom-0 left-0 w-12 border-r border-line bg-panel">
            {pitches.map((pitch) => (
              <div key={pitch} className="pr-1 text-right font-mono text-[9px] text-muted" style={{ height: rowH }}>
                {pitch % 12 === 0 ? noteName(pitch) : ''}
              </div>
            ))}
          </div>
          <div className="absolute top-0 right-0 bottom-0 left-12">
            {pitches.map((pitch, index) => (
              <div
                key={pitch}
                className={`absolute right-0 left-0 border-b border-line/70 ${pitch % 12 === 0 ? 'bg-white/5' : ''}`}
                style={{ top: index * rowH, height: rowH }}
              />
            ))}
            {Array.from({ length: Math.ceil(span / (60 / state.bpm / 4)) }, (_, index) => (
              <div
                key={index}
                className={`absolute top-0 bottom-0 ${index % 4 === 0 ? 'bg-white/15' : 'bg-white/5'} w-px`}
                style={{ left: index * (60 / state.bpm / 4) * pps }}
              />
            ))}
            {state.notes.map((note) => (
              <div
                key={note.id}
                className={`absolute touch-none rounded-sm ${note.id === state.selectedNoteId ? 'bg-signal' : 'bg-signal/70'}`}
                style={{
                  left: note.start * pps,
                  width: Math.max(6, note.duration * pps),
                  top: (high - note.note) * rowH + 1,
                  height: rowH - 2,
                }}
                onPointerDown={(event) => startDrag(event, note)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
              />
            ))}
            <div ref={line} className="pointer-events-none absolute top-0 bottom-0 w-px bg-white opacity-0" />
          </div>
        </div>
      </div>
    </section>
  )

  function startDrag(event: PointerEvent<HTMLDivElement>, note: RollNote): void {
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const rect = event.currentTarget.getBoundingClientRect()
    drag.current = {
      id: note.id,
      mode: event.clientX > rect.right - 8 ? 'resize' : 'move',
      originX: event.clientX,
      start: note.start,
      duration: note.duration,
      nextStart: note.start,
      nextDuration: note.duration,
    }
    actions.selectNote(note.id)
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>): void {
    const current = drag.current
    if (!current) return
    const delta = (event.clientX - current.originX) / pps
    current.nextStart = current.mode === 'move' ? Math.max(0, current.start + delta) : current.start
    current.nextDuration = current.mode === 'resize' ? Math.max(0.05, current.duration + delta) : current.duration
    event.currentTarget.style.left = `${current.nextStart * pps}px`
    event.currentTarget.style.width = `${Math.max(6, current.nextDuration * pps)}px`
  }

  function endDrag(): void {
    const current = drag.current
    drag.current = null
    if (!current) return
    actions.updateNote(current.id, { start: current.nextStart, duration: current.nextDuration })
  }
}

function pitchRange(notes: RollNote[]): number[] {
  const low = Math.min(48, ...notes.map((note) => note.note))
  const high = Math.max(72, ...notes.map((note) => note.note))
  const pitches: number[] = []
  for (let pitch = high; pitch >= low; pitch -= 1) pitches.push(pitch)
  return pitches
}
