import { useEffect, useRef } from 'react'
import type { Beatboox } from '../engine/useBeatboox.ts'
import { Panel, Slider } from './ui.tsx'

export function InputPanel({ state, actions, getLive, visualLevel }: Beatboox) {
  const bar = useRef<HTMLDivElement>(null)
  const peak = useRef<HTMLDivElement>(null)
  const level = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let frame = 0
    const tick = () => {
      const visual = visualLevel()
      const live = getLive()
      const width = Math.min(100, Math.max(0, (20 * Math.log10(Math.max(visual.rms, 1e-5)) + 52) * 2))
      if (bar.current) bar.current.style.width = `${width}%`
      if (peak.current) peak.current.style.left = `${Math.min(100, visual.peak * 140)}%`
      if (level.current) level.current.textContent = live.rms.toFixed(3)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [getLive, visualLevel])

  return (
    <Panel title="Input">
      <div className="relative mb-3 h-3 overflow-hidden rounded-sm border border-line bg-black">
        <div ref={bar} className="h-full w-0 bg-signal" />
        <div ref={peak} className="absolute top-0 h-full w-px bg-white" />
      </div>
      <p className="mb-3 font-mono text-xs text-muted">
        Detector <span ref={level}>0.000</span>
        <span className="ml-3">Floor {state.noiseFloor.toFixed(3)}</span>
      </p>
      <div className="space-y-3">
        <Slider label="Gain" min={0.2} max={3} step={0.01} value={state.gain} onChange={actions.setGain} display={`${state.gain.toFixed(2)}×`} />
        <Slider label="Noise gate" min={0} max={0.3} step={0.001} value={state.gate} onChange={actions.setGate} display={state.gate.toFixed(3)} />
        <Slider
          label="Pitch confidence"
          min={0.35}
          max={0.95}
          step={0.01}
          value={state.minConfidence}
          onChange={actions.setConfidence}
          display={state.minConfidence.toFixed(2)}
        />
      </div>
      <button
        className="mt-3 min-h-11 w-full rounded border border-line text-sm"
        onClick={() => actions.calibrate()}
        disabled={state.calibrating}
      >
        {state.calibrating ? 'Listening to the room…' : 'Calibrate noise floor'}
      </button>
      <p className="mt-3 text-xs leading-5 text-muted">Use headphones so the synth does not leak back into the microphone. Raw input is used: echo cancellation and auto gain stay off.</p>
    </Panel>
  )
}
