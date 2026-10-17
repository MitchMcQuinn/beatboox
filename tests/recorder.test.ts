import { describe, expect, it } from 'vitest'
import { Recorder } from '../src/sequencer/recorder.ts'

describe('recorder snapshot', () => {
  it('includes a note that is still being sung', () => {
    const recorder = new Recorder()
    recorder.start(0)
    recorder.noteOn(0, 60, 100, 1)
    expect(recorder.notes).toEqual([])
    expect(recorder.snapshot(2)).toEqual([
      { id: '1', note: 60, velocity: 100, start: 1, duration: 1, channel: 0 },
    ])
  })
})