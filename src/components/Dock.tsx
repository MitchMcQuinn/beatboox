import type { Beatboox } from '../engine/useBeatboox.ts'
import type { Waveform } from '../types.ts'
import { Panel, Select, Slider } from './ui.tsx'

const WAVES: Waveform[] = ['sawtooth', 'square', 'triangle', 'sine']

export function Dock({ state, actions }: Beatboox) {
  return (
    <div className="space-y-3">
      <Panel title="Expression">
        <label className="mb-3 flex min-h-11 items-center justify-between text-sm">
          <span>IntelliBend</span>
          <input
            type="checkbox"
            checked={state.intelliBend}
            onChange={(event) => actions.setIntelliBend(event.target.checked)}
          />
        </label>
        <div className="space-y-3">
          <Slider
            label="Deadzone"
            min={5}
            max={60}
            step={1}
            value={state.deadzoneCents}
            onChange={actions.setDeadzone}
            display={`${Math.round(state.deadzoneCents)} cents`}
          />
          <Slider
            label="Bend range"
            min={1}
            max={12}
            step={1}
            value={state.bendRange}
            onChange={actions.setBendRange}
            display={`±${Math.round(state.bendRange)} st`}
          />
        </div>
        <p className="mt-2 text-xs leading-5 text-muted">
          Match the receiving synth pitch-bend range to ±{Math.round(state.bendRange)} semitones.
        </p>
        <CcRow
          label="Loudness"
          enabled={state.ccLoudnessEnabled}
          controller={state.ccLoudnessController}
          onEnabled={(enabled) => actions.setLoudnessCc({ enabled })}
          onController={(controller) => actions.setLoudnessCc({ controller })}
        />
        <CcRow
          label="Brightness"
          enabled={state.ccBrightnessEnabled}
          controller={state.ccBrightnessController}
          onEnabled={(enabled) => actions.setBrightnessCc({ enabled })}
          onController={(controller) => actions.setBrightnessCc({ controller })}
        />
      </Panel>
      <Panel title="Synth">
        <Select label="Wave" value={state.waveform} onChange={(value) => actions.setSynth({ waveform: value as Waveform })}>
          {WAVES.map((wave) => (
            <option key={wave} value={wave}>
              {wave}
            </option>
          ))}
        </Select>
        <div className="mt-3 space-y-3">
          <Slider label="Cutoff" min={200} max={8000} step={10} value={state.cutoff} onChange={(cutoff) => actions.setSynth({ cutoff })} display={`${Math.round(state.cutoff)} Hz`} />
          <Slider label="Attack" min={0.005} max={0.4} step={0.005} value={state.attack} onChange={(attack) => actions.setSynth({ attack })} display={`${Math.round(state.attack * 1000)} ms`} />
          <Slider label="Release" min={0.02} max={1.2} step={0.01} value={state.release} onChange={(release) => actions.setSynth({ release })} display={`${Math.round(state.release * 1000)} ms`} />
        </div>
      </Panel>
    </div>
  )
}

function CcRow({
  label,
  enabled,
  controller,
  onEnabled,
  onController,
}: {
  label: string
  enabled: boolean
  controller: number
  onEnabled: (enabled: boolean) => void
  onController: (controller: number) => void
}) {
  return (
    <div className="mt-3 flex items-center gap-2">
      <label className="flex min-h-11 flex-1 items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(event) => onEnabled(event.target.checked)} />
        {label}
      </label>
      <input
        className="w-20"
        type="number"
        min={0}
        max={127}
        value={controller}
        aria-label={`${label} CC`}
        onChange={(event) => onController(Number(event.target.value))}
      />
    </div>
  )
}
