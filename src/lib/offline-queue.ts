// Offline queue for inspection submissions (IndexedDB). Submissions made without a connection are stored on the
// device, including their photos, and sent automatically when the network is back.

const DB_NAME = 'daily-safety-offline'
const STORE = 'inspections'
export const QUEUE_EVENT = 'daily-safety-queue-changed'

type StoredPhoto = { name: string; type: string; blob: Blob }
type StoredInspection = {
  id: string
  publicMode: boolean
  createdAt: string
  payload: string
  photoMetadata: string
  photos: StoredPhoto[]
  error?: string
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => { request.result.createObjectStore(STORE, { keyPath: 'id' }) }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(STORE, mode).objectStore(STORE))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  } finally { db.close() }
}

const notify = () => window.dispatchEvent(new Event(QUEUE_EVENT))

export function isNetworkError(error: unknown) {
  return error instanceof TypeError || !navigator.onLine
}

export async function enqueueInspection(body: FormData, publicMode: boolean) {
  const photos: StoredPhoto[] = []
  for (const value of body.getAll('photos')) {
    if (value instanceof File) photos.push({ name: value.name, type: value.type, blob: value })
  }
  const item: StoredInspection = {
    id: crypto.randomUUID(),
    publicMode,
    createdAt: new Date().toISOString(),
    payload: String(body.get('payload') ?? ''),
    photoMetadata: String(body.get('photoMetadata') ?? '[]'),
    photos,
  }
  await withStore('readwrite', (store) => store.put(item))
  notify()
}

async function all(): Promise<StoredInspection[]> {
  const rows = await withStore<StoredInspection[]>('readonly', (store) => store.getAll())
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function queueStatus() {
  try {
    const rows = await all()
    const failed = rows.filter((row) => row.error).length
    return { pending: rows.length - failed, failed }
  } catch { return { pending: 0, failed: 0 } }
}

export async function discardFailed() {
  const rows = await all()
  await Promise.all(rows.filter((row) => row.error).map((row) => withStore('readwrite', (store) => store.delete(row.id))))
  notify()
}

let flushing = false

/** Try to send every queued inspection. Stops at the first network/auth/server problem so order is kept. */
export async function flushQueue(): Promise<{ sent: number }> {
  if (flushing || !navigator.onLine) return { sent: 0 }
  flushing = true
  let sent = 0
  try {
    for (const item of (await all()).filter((row) => !row.error)) {
      const body = new FormData()
      body.set('payload', item.payload)
      body.set('photoMetadata', item.photoMetadata)
      for (const photo of item.photos) body.append('photos', new File([photo.blob], photo.name, { type: photo.type }))
      let response: Response
      try {
        response = await fetch(item.publicMode ? '/api/public/daily-inspections' : '/api/inspections', { method: 'POST', body, credentials: 'same-origin' })
      } catch { break }
      if (response.ok) {
        await withStore('readwrite', (store) => store.delete(item.id))
        sent += 1
        continue
      }
      if (response.status === 401 || response.status === 403 || response.status === 429 || response.status >= 500) break
      const payload = await response.json().catch(() => null)
      await withStore('readwrite', (store) => store.put({ ...item, error: payload?.error || `HTTP ${response.status}` }))
    }
  } finally {
    flushing = false
    notify()
  }
  return { sent }
}
