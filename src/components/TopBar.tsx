import type { Beatboox } from '../engine/useBeatboox.ts'

export function TopBar({ state, actions }: Beatboox) {
  return (
    <header className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
      <div className="mr-2">
        <p className="text-sm font-semibold tracking-wide">Beatboox</p>
        <p className="text-[11px] text-muted">Voice stays on this device</p>
      </div>
      <button
        className={`min-h-11 rounded px-4 text-sm font-semibold ${state.armed ? 'bg-danger text-white' : 'bg-signal text-black'}`}
        onClick={() => (state.armed ? actions.disarm() : void actions.arm())}
      >
        {state.armed ? 'Stop mic' : 'Arm mic'}
      </button>
      <div className="flex rounded border border-line">
        {(['melody', 'drums'] as const).map((mode) => (
          <button
            key={mode}
            className={`min-h-11 px-4 text-sm capitalize ${state.mode === mode ? 'bg-signal font-semibold text-black' : 'text-muted'}`}
            onClick={() => actions.setMode(mode)}
            aria-pressed={state.mode === mode}
          >
            {mode}
          </button>
        ))}
      </div>
      <button
        className={`min-h-11 rounded border px-4 text-sm ${state.recording ? 'border-danger bg-danger text-white' : 'border-line'}`}
        onClick={() => void actions.toggleRecord()}
      >
        {state.recording ? 'Stop rec' : 'Record'}
      </button>
      <button
        className={`min-h-11 rounded border px-4 text-sm ${state.playing ? 'border-signal text-signal' : 'border-line'}`}
        onClick={() => actions.togglePlay()}
      >
        {state.playing ? 'Stop' : 'Play'}
      </button>
      <label className="min-w-44 flex-1 text-xs text-muted">
        <span className="mb-1 block">MIDI output</span>
        <select
          className="w-full"
          value={state.midiOutputId ?? ''}
          onPointerDown={() => void actions.enableMidi()}
          onChange={(event) => actions.selectMidi(event.target.value || null)}
        >
          <option value="">In-app synth only</option>
          {state.midiOutputs.map((port) => (
            <option key={port.id} value={port.id}>
              {port.name}
            </option>
          ))}
        </select>
      </label>
      <button
        className={`min-h-11 rounded border px-3 text-sm ${state.monitor ? 'border-signal text-signal' : 'border-line text-muted'}`}
        onClick={() => actions.setMonitor(!state.monitor)}
        aria-pressed={state.monitor}
      >
        {state.monitor ? 'Monitor on' : 'Monitor off'}
      </button>
    </header>
  )
}
