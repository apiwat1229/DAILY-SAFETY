import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'

const PREFIX = 'ds:'

type Kind = 'local' | 'session'
const store = (kind: Kind) => { try { return kind === 'local' ? window.localStorage : window.sessionStorage } catch { return null } }

function read<T>(key: string, kind: Kind, fallback: T): T {
  try {
    const raw = store(kind)?.getItem(PREFIX + key)
    return raw === null || raw === undefined ? fallback : (JSON.parse(raw) as T)
  } catch { return fallback }
}

/**
 * useState that survives reloads. "session" (default) lasts for the browser tab, "local" lasts until cleared.
 * Storage can be unavailable or hold stale data, so every access is wrapped and falls back to the initial value.
 */
export function usePersistentState<T>(key: string, initial: T, kind: Kind = 'session'): [T, Dispatch<SetStateAction<T>>, () => void] {
  const initialRef = useRef(initial)
  const [value, setValue] = useState<T>(() => read(key, kind, initial))

  useEffect(() => {
    try { store(kind)?.setItem(PREFIX + key, JSON.stringify(value)) } catch { /* quota or private mode */ }
  }, [key, kind, value])

  const reset = useCallback(() => {
    setValue(initialRef.current)
    try { store(kind)?.removeItem(PREFIX + key) } catch { /* ignore */ }
  }, [key, kind])

  return [value, setValue, reset]
}

/** Forget remembered filters and drafts, e.g. when someone signs out of a shared device. Language is kept. */
export function clearPersistentState() {
  for (const kind of ['local', 'session'] as const) {
    const target = store(kind)
    if (!target) continue
    try {
      for (const key of Object.keys(target)) if (key.startsWith(PREFIX)) target.removeItem(key)
    } catch { /* ignore */ }
  }
}

/** Plain read/write/remove for values that are not React state (form drafts). Always stored in localStorage. */
export function readDraft<T>(key: string): T | null { return read<T | null>(key, 'local', null) }
export function writeDraft(key: string, value: unknown) { try { store('local')?.setItem(PREFIX + key, JSON.stringify(value)) } catch { /* quota or private mode */ } }
export function removeDraft(key: string) { try { store('local')?.removeItem(PREFIX + key) } catch { /* ignore */ } }
