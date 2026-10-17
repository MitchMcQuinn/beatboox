import type { DrumExample, PadId, SavedTake } from '../types.ts'

const DB_NAME = 'beatboox'
const DB_VERSION = 1

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta')
      if (!db.objectStoreNames.contains('examples')) db.createObjectStore('examples')
      if (!db.objectStoreNames.contains('takes')) db.createObjectStore('takes')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function put(store: 'meta' | 'examples' | 'takes', key: string, value: unknown): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(store, 'readwrite')
  tx.objectStore(store).put(value, key)
  await transactionDone(tx)
  db.close()
}

async function get<T>(store: 'meta' | 'examples' | 'takes', key: string): Promise<T | null> {
  const db = await openDb()
  const tx = db.transaction(store, 'readonly')
  const value = await requestToPromise<T | undefined>(tx.objectStore(store).get(key))
  db.close()
  return value ?? null
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export async function saveExamples(examples: DrumExample[]): Promise<void> {
  await put('examples', 'all', examples)
}

export async function loadExamples(): Promise<DrumExample[]> {
  const value = await get<DrumExample[]>('examples', 'all')
  if (!Array.isArray(value)) return []
  return value.filter((example) => example && Array.isArray(example.features) && typeof example.pad === 'string')
}

export async function saveLabels(labels: PadId[]): Promise<void> {
  await put('meta', 'labels', labels)
}

export async function loadLabels(): Promise<PadId[] | null> {
  const value = await get<PadId[]>('meta', 'labels')
  return Array.isArray(value) ? value : null
}

export async function saveTake(take: SavedTake): Promise<void> {
  await put('takes', 'last', take)
}

export async function loadTake(): Promise<SavedTake | null> {
  const value = await get<SavedTake>('takes', 'last')
  if (!value || !Array.isArray(value.notes)) return null
  return {
    notes: value.notes,
    controls: Array.isArray(value.controls) ? value.controls : [],
    bpm: typeof value.bpm === 'number' ? value.bpm : 120,
  }
}

export async function clearTake(): Promise<void> {
  const db = await openDb()
  const tx = db.transaction('takes', 'readwrite')
  tx.objectStore('takes').delete('last')
  await transactionDone(tx)
  db.close()
}
