import { clamp } from './math.ts'

export const MEL_BANDS = 16
export const MEL_FRAMES = 4
export const FEATURE_SIZE = MEL_BANDS * MEL_FRAMES + 3

export function assembleFeatures(
  frames: ArrayLike<number>[],
  zcr: number,
  crest: number,
  decay: number,
): Float32Array {
  const out = new Float32Array(FEATURE_SIZE)
  let cursor = 0
  for (let frameIndex = 0; frameIndex < MEL_FRAMES; frameIndex += 1) {
    const frame = frames[frameIndex]
    for (let band = 0; band < MEL_BANDS; band += 1) {
      out[cursor] = frame?.[band] ?? 0
      cursor += 1
    }
  }

  const melCount = MEL_BANDS * MEL_FRAMES
  let sum = 0
  for (let index = 0; index < melCount; index += 1) sum += (out[index] ?? 0) ** 2
  const norm = Math.sqrt(sum) || 1
  for (let index = 0; index < melCount; index += 1) out[index] = (out[index] ?? 0) / norm
  out[cursor] = clamp(zcr, 0, 1)
  out[cursor + 1] = clamp(crest / 20, 0, 1)
  out[cursor + 2] = clamp(decay / 4, 0, 1)
  return out
}
