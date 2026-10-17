import { DrumPanel } from './components/DrumPanel.tsx'
import { Dock } from './components/Dock.tsx'
import { InputPanel } from './components/InputPanel.tsx'
import { MelodyPanel } from './components/MelodyPanel.tsx'
import { Sequencer } from './components/Sequencer.tsx'
import { TopBar } from './components/TopBar.tsx'
import { useBeatboox } from './engine/useBeatboox.ts'

export default function App() {
  const beat = useBeatboox()
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar {...beat} />
      {beat.state.error && <p className="bg-danger/15 px-3 py-2 text-sm text-danger">{beat.state.error}</p>}
      {!beat.state.monitor && (
        <p className="bg-signal/15 px-3 py-2 text-sm text-signal">Monitor is off, so the built-in synth is silent.</p>
      )}
      {beat.state.midiBanner && (
        <p className="border-b border-line bg-black/40 px-3 py-2 text-sm text-muted">{beat.state.midiBanner}</p>
      )}
      <div className="grid flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-[260px_minmax(0,1fr)_300px]">
        <InputPanel {...beat} />
        {beat.state.mode === 'melody' ? <MelodyPanel {...beat} /> : <DrumPanel {...beat} />}
        <Dock {...beat} />
      </div>
      <Sequencer {...beat} />
    </div>
  )
}
