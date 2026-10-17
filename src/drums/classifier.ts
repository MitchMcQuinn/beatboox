import { FEATURE_SIZE } from '../audio/features.ts'
import type { PadId } from '../types.ts'
import { loadLabels, saveLabels } from '../storage/db.ts'

type TfModule = typeof import('@tensorflow/tfjs')
type LayersModel = import('@tensorflow/tfjs').LayersModel

const MODEL_URL = 'indexeddb://beatboox-drums'

export class DrumClassifier {
  private tf: TfModule | null = null
  private model: LayersModel | null = null
  labels: PadId[] = []
  ready = false

  async train(examples: { pad: PadId; features: number[] }[]): Promise<PadId[]> {
    const grouped = new Map<PadId, number[][]>()
    for (const example of examples) {
      if (example.features.length !== FEATURE_SIZE) continue
      const list = grouped.get(example.pad) ?? []
      list.push(example.features)
      grouped.set(example.pad, list)
    }
    const labels = [...grouped.keys()].filter((pad) => (grouped.get(pad)?.length ?? 0) >= 4)
    if (labels.length < 2) {
      throw new Error('Train at least two pads with four hits each.')
    }

    const tf = await this.lib()
    const largest = Math.max(...labels.map((pad) => grouped.get(pad)?.length ?? 0))
    const inputs: number[][] = []
    const targets: number[] = []
    labels.forEach((pad, index) => {
      const rows = grouped.get(pad) ?? []
      for (let copy = 0; copy < largest; copy += 1) {
        const row = rows[copy % rows.length]
        if (!row) continue
        inputs.push(row)
        targets.push(index)
      }
    })

    const xs = tf.tensor2d(inputs)
    const ys = tf.oneHot(tf.tensor1d(targets, 'int32'), labels.length)
    this.model?.dispose()
    const model = tf.sequential({
      layers: [
        tf.layers.dense({ inputShape: [FEATURE_SIZE], units: 32, activation: 'relu' }),
        tf.layers.dense({ units: 16, activation: 'relu' }),
        tf.layers.dense({ units: labels.length, activation: 'softmax' }),
      ],
    })
    model.compile({ optimizer: tf.train.adam(0.01), loss: 'categoricalCrossentropy' })
    await model.fit(xs, ys, {
      epochs: 40,
      batchSize: Math.min(8, inputs.length),
      shuffle: true,
    })
    xs.dispose()
    ys.dispose()
    this.model = model
    this.labels = labels
    this.ready = true
    await model.save(MODEL_URL)
    await saveLabels(labels)
    return labels
  }

  async load(): Promise<boolean> {
    const labels = await loadLabels()
    if (!labels || labels.length < 2) return false
    try {
      const tf = await this.lib()
      this.model?.dispose()
      this.model = await tf.loadLayersModel(MODEL_URL)
      this.labels = labels
      this.ready = true
      return true
    } catch {
      this.ready = false
      return false
    }
  }

  predict(features: Float32Array): { pad: PadId; probability: number } | null {
    const tf = this.tf
    const model = this.model
    if (!tf || !model || features.length !== FEATURE_SIZE || this.labels.length === 0) return null
    const probabilities = tf.tidy(() => {
      const input = tf.tensor2d([Array.from(features)])
      const output = model.predict(input)
      const tensor = Array.isArray(output) ? output[0] : output
      return tensor?.dataSync() ?? new Float32Array()
    })
    let best = 0
    let probability = probabilities[0] ?? 0
    for (let index = 1; index < probabilities.length; index += 1) {
      const value = probabilities[index] ?? 0
      if (value > probability) {
        probability = value
        best = index
      }
    }
    const pad = this.labels[best]
    if (!pad) return null
    return { pad, probability }
  }

  private async lib(): Promise<TfModule> {
    if (!this.tf) this.tf = await import('@tensorflow/tfjs')
    return this.tf
  }
}
