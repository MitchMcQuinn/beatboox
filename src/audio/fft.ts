export class Spectrum {
  readonly size: number
  private real: Float32Array
  private imag: Float32Array
  readonly magnitude: Float32Array

  constructor(size: number) {
    this.size = size
    this.real = new Float32Array(size)
    this.imag = new Float32Array(size)
    this.magnitude = new Float32Array(size / 2)
  }

  analyze(input: Float32Array): Float32Array {
    const size = this.size
    for (let index = 0; index < size; index += 1) {
      this.real[index] = input[index] ?? 0
      this.imag[index] = 0
    }

    for (let index = 1, reversed = 0; index < size; index += 1) {
      let bit = size >> 1
      for (; reversed & bit; bit >>= 1) reversed ^= bit
      reversed ^= bit
      if (index < reversed) {
        const real = this.real[index] ?? 0
        this.real[index] = this.real[reversed] ?? 0
        this.real[reversed] = real
        const imag = this.imag[index] ?? 0
        this.imag[index] = this.imag[reversed] ?? 0
        this.imag[reversed] = imag
      }
    }

    for (let length = 2; length <= size; length <<= 1) {
      const angle = (-2 * Math.PI) / length
      const stepReal = Math.cos(angle)
      const stepImag = Math.sin(angle)
      for (let start = 0; start < size; start += length) {
        let twiddleReal = 1
        let twiddleImag = 0
        const half = length >> 1
        for (let offset = 0; offset < half; offset += 1) {
          const evenReal = this.real[start + offset] ?? 0
          const evenImag = this.imag[start + offset] ?? 0
          const oddReal = this.real[start + offset + half] ?? 0
          const oddImag = this.imag[start + offset + half] ?? 0
          const mixedReal = oddReal * twiddleReal - oddImag * twiddleImag
          const mixedImag = oddReal * twiddleImag + oddImag * twiddleReal
          this.real[start + offset] = evenReal + mixedReal
          this.imag[start + offset] = evenImag + mixedImag
          this.real[start + offset + half] = evenReal - mixedReal
          this.imag[start + offset + half] = evenImag - mixedImag
          const nextReal = twiddleReal * stepReal - twiddleImag * stepImag
          twiddleImag = twiddleReal * stepImag + twiddleImag * stepReal
          twiddleReal = nextReal
        }
      }
    }

    for (let bin = 0; bin < size / 2; bin += 1) {
      this.magnitude[bin] = Math.hypot(this.real[bin] ?? 0, this.imag[bin] ?? 0)
    }
    return this.magnitude
  }
}
