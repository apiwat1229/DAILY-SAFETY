import { useSyncExternalStore } from 'react'
import { applyTheme, loadTheme, saveTheme, type ThemeSettings } from './theme'

let current: ThemeSettings = loadTheme()
const listeners = new Set<() => void>()

/** Applies the saved theme before the first render so there is no flash of the default colours. */
export function initTheme() { applyTheme(current) }

export function setTheme(next: ThemeSettings) {
  current = next
  applyTheme(next)
  saveTheme(next)
  listeners.forEach((listener) => listener())
}

export function useTheme(): [ThemeSettings, (next: ThemeSettings) => void] {
  const settings = useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener) } }, () => current, () => current)
  return [settings, setTheme]
}
