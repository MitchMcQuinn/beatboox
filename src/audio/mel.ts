export function createMelBank(
  fftSize: number,
  sampleRate: number,
  bands: number,
  fMin = 80,
  fMax?: number,
): Float32Array[] {
  const nyquist = sampleRate / 2
  const maxHz = Math.min(fMax ?? nyquist * 0.95, nyquist - 1)
  const hzToMel = (hz: number) => 2595 * Math.log10(1 + hz / 700)
  const melToHz = (mel: number) => 700 * (10 ** (mel / 2595) - 1)
  const melMin = hzToMel(fMin)
  const melMax = hzToMel(maxHz)
  const points = bands + 2
  const bins: number[] = []
  for (let index = 0; index < points; index += 1) {
    const hz = melToHz(melMin + ((melMax - melMin) * index) / (points - 1))
    bins.push(Math.max(0, Math.min(fftSize / 2 - 1, Math.floor((fftSize * hz) / sampleRate))))
  }

  const specBins = fftSize / 2
  const filters: Float32Array[] = []
  for (let band = 1; band <= bands; band += 1) {
    const filter = new Float32Array(specBins)
    const left = bins[band - 1] ?? 0
    const center = bins[band] ?? left
    const right = bins[band + 1] ?? center
    if (center <= left) {
      if (center < specBins) filter[center] = 1
    } else {
      for (let bin = left; bin < center; bin += 1) filter[bin] = (bin - left) / (center - left)
    }
    if (right > center) {
      for (let bin = center; bin < right; bin += 1) {
        if (bin >= 0 && bin < specBins) filter[bin] = (right - bin) / (right - center)
      }
    } else if (center < specBins && filter[center] === 0) {
      filter[center] = 1
    }
    filters.push(filter)
  }
  return filters
}

export function applyMel(magnitude: Float32Array, filters: Float32Array[], out: Float32Array): void {
  for (let band = 0; band < filters.length; band += 1) {
    const filter = filters[band]
    let energy = 0
    if (filter) {
      for (let bin = 0; bin < filter.length; bin += 1) energy += (magnitude[bin] ?? 0) * (filter[bin] ?? 0)
    }
    out[band] = Math.log(energy + 1e-8)
  }
}
