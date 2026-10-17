# Beatboox

Live app: https://mitchmcquinn.github.io/beatboox/

Beatboox is a browser voice-to-MIDI controller. Sing or hum to play notes, or beatbox to trigger drums. Pitch detection runs in an AudioWorklet. Notes go to the built-in synth and, where the browser allows it, to a Web MIDI port. Microphone audio never leaves the device.

## Run

```bash
npm install
npm run dev
```

Open the printed local URL, tap **Arm mic**, and allow the microphone. Use headphones so the synth does not feed back into the mic.

```bash
npm test
npm run build
```

## Play it

- **Melody** tracks monophonic pitch, snaps it to the selected key and scale, and can expand one root into a diatonic chord.
- The keyboard is a note palette. Click a key to allow or block it. That switches the scale to **Custom palette**. **Reset to scale** restores the dropdown.
- **IntelliBend** keeps pitch bend centered until the voice moves past the deadzone. Set the destination synth to the same bend range, ±2 semitones by default.
- Loudness is sent as CC 11 and spectral brightness as CC 1. Both controller numbers can be changed.
- **Drums** listens for transients. Train at least two pads with four mouth sounds each, then train the model. Weights stay in this browser.
- **Record** captures the performance. Drag notes to move them, drag the right edge to resize, and use Delete to remove the selection. **Quantize 1/16** aligns the take. **Export .mid** writes a Format 0 file.

## MIDI routing

Web MIDI works in Chromium on desktop.

- macOS: open Audio MIDI Setup, enable the IAC Driver, then pick that port in Beatboox and in the DAW.
- Windows: install a loopback driver such as loopMIDI and select it here and in the DAW.
- Melody notes use MIDI channel 1. Drums use channel 10, with GM defaults Kick 36, Snare 38, Clap 39, and Closed Hat 42.

Safari and iOS do not implement Web MIDI. The in-app synth still plays. Turn **Monitor** off when an external instrument should be the only sound.

## Latency

A sung note needs roughly one pitch window, about 50–80 ms plus the operating system's audio buffer. A drum hit waits for a short attack before the classifier runs, about 60–90 ms. `AudioContext` is created with `latencyHint: "interactive"`.
