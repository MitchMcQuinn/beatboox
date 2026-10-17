import { noteName } from '../audio/pitch.ts'
import type { Beatboox } from '../engine/useBeatboox.ts'
import { Panel, Slider } from './ui.tsx'

export function DrumPanel({ state, actions }: Beatboox) {
  const selected = state.pads.find((pad) => pad.id === state.selectedPad) ?? state.pads[0]
  const readyCount = state.pads.filter((pad) => pad.examples >= 4).length

  return (
    <Panel title="Beatbox pads" className="min-w-0">
      <p className="mb-3 text-xs leading-5 text-muted">
        Train a mouth sound into each pad. Four hits on two pads is enough to fit the classifier. It stays in this browser.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {state.pads.map((pad) => {
          const hot = state.lastPad === pad.id
          const training = state.trainingPad === pad.id
          return (
            <div key={pad.id} className={`rounded border p-2 ${hot ? 'border-signal' : 'border-line'}`}>
              <button className="min-h-28 w-full rounded bg-black text-left" onClick={() => actions.previewPad(pad.id)}>
                <span className="block px-3 pt-3 text-lg">{pad.label}</span>
                <span className="block px-3 font-mono text-sm text-signal">{noteName(pad.note)}</span>
                <span className="block px-3 pb-3 text-xs text-muted">{pad.examples} examples</span>
              </button>
              <button
                className={`mt-2 min-h-11 w-full rounded border text-sm ${training ? 'border-signal text-signal' : 'border-line'}`}
                onClick={() => actions.setTrainingPad(pad.id)}
              >
                {training ? 'Listening…' : 'Train'}
              </button>
            </div>
          )
        })}
      </div>
      {selected && (
        <div className="mt-4 space-y-3 border-t border-line pt-3">
          <p className="text-xs tracking-[0.14em] text-muted uppercase">{selected.label} mapping</p>
          <label className="block text-xs text-muted">
            <span className="mb-1 block">MIDI note</span>
            <input
              className="w-full"
              type="number"
              min={0}
              max={127}
              value={selected.note}
              onChange={(event) => actions.setPad(selected.id, { note: Number(event.target.value) })}
            />
          </label>
          <Slider
            label="Sensitivity"
            min={0}
            max={1}
            step={0.01}
            value={selected.sensitivity}
            onChange={(sensitivity) => actions.setPad(selected.id, { sensitivity })}
            display={selected.sensitivity.toFixed(2)}
          />
          <Slider
            label="Velocity amount"
            min={0}
            max={1}
            step={0.01}
            value={selected.velocityAmount}
            onChange={(velocityAmount) => actions.setPad(selected.id, { velocityAmount })}
            display={selected.velocityAmount.toFixed(2)}
          />
          <Slider
            label="Gate"
            min={40}
            max={400}
            step={1}
            value={selected.gateMs}
            onChange={(gateMs) => actions.setPad(selected.id, { gateMs })}
            display={`${Math.round(selected.gateMs)} ms`}
          />
          <button className="min-h-11 text-xs text-muted" onClick={() => actions.clearExamples(selected.id)}>
            Clear {selected.label} examples
          </button>
        </div>
      )}
      <div className="mt-4 space-y-3">
        <Slider
          label="Hit threshold"
          min={0.05}
          max={1}
          step={0.01}
          value={state.onsetThreshold}
          onChange={actions.setOnsetThreshold}
          display={state.onsetThreshold.toFixed(2)}
        />
        <Slider
          label="Class confidence"
          min={0.25}
          max={0.95}
          step={0.01}
          value={state.drumThreshold}
          onChange={actions.setDrumThreshold}
          display={state.drumThreshold.toFixed(2)}
        />
      </div>
      <button
        className="mt-3 min-h-11 w-full rounded bg-signal font-semibold text-black disabled:bg-zinc-800 disabled:text-muted"
        disabled={state.training || readyCount < 2}
        onClick={() => void actions.trainDrums()}
      >
        {state.training ? 'Training…' : state.modelReady ? 'Retrain model' : 'Train model'}
      </button>
      <p className="mt-2 text-xs text-muted">
        {state.modelLoading && 'Loading saved model…'}
        {!state.modelLoading && state.modelReady && !state.modelStale && 'Model ready.'}
        {!state.modelLoading && state.modelStale && 'Examples changed. Retrain to update the model.'}
        {!state.modelLoading && !state.modelReady && !state.modelStale && `${readyCount}/2 pads have enough examples.`}
      </p>
    </Panel>
  )
}
