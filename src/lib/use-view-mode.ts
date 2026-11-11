import { useCallback, useSyncExternalStore } from 'react'
import { parsePreference, resolveViewMode, type ViewMode, type ViewPreference } from './view-mode-core'

// Device-level setting: lives outside the `ds:` prefix so signing out (clearPersistentState) does not reset it.
const KEY = 'ds-device:view.mode'
const NARROW_QUERY = '(max-width: 767px)'

let memory: ViewPreference = 'auto'
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

function readPreference(): ViewPreference {
  try { return parsePreference(window.localStorage.getItem(KEY)) } catch { return memory }
}

function writePreference(value: ViewPreference) {
  memory = value
  try {
    if (value === 'auto') window.localStorage.removeItem(KEY)
    else window.localStorage.setItem(KEY, value)
  } catch { /* storage blocked: the in-memory value still applies for this session */ }
  notify()
}

const isNarrow = () => window.matchMedia(NARROW_QUERY).matches

function subscribe(listener: () => void) {
  listeners.add(listener)
  const query = window.matchMedia(NARROW_QUERY)
  const onStorage = (event: StorageEvent) => { if (event.key === KEY) listener() }
  // matchMedia change events are not delivered everywhere (some webviews, emulators), so resize is listened to as well.
  query.addEventListener('change', listener)
  window.addEventListener('resize', listener)
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    query.removeEventListener('change', listener)
    window.removeEventListener('resize', listener)
    window.removeEventListener('storage', onStorage)
  }
}

/** "preference|narrow" — a primitive snapshot so React can compare it cheaply. */
const snapshot = () => `${readPreference()}|${isNarrow() ? 1 : 0}`

export function useViewMode(): { mode: ViewMode; preference: ViewPreference; narrow: boolean; setPreference: (value: ViewPreference) => void } {
  const [preferenceText, narrowFlag] = useSyncExternalStore(subscribe, snapshot, () => 'auto|0').split('|')
  const preference = parsePreference(preferenceText)
  const narrow = narrowFlag === '1'
  const setPreference = useCallback((value: ViewPreference) => writePreference(value), [])
  return { mode: resolveViewMode(preference, narrow), preference, narrow, setPreference }
}
