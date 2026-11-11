// Pure module (no imports) so tests can load it directly.
export type ViewPreference = 'auto' | 'mobile' | 'desktop'
export type ViewMode = 'mobile' | 'desktop'

/** Anything other than the three known values (corrupt storage, old data) means "auto". */
export function parsePreference(raw: string | null | undefined): ViewPreference {
  return raw === 'mobile' || raw === 'desktop' ? raw : 'auto'
}

export function resolveViewMode(preference: ViewPreference, isNarrow: boolean): ViewMode {
  return preference === 'auto' ? (isNarrow ? 'mobile' : 'desktop') : preference
}
