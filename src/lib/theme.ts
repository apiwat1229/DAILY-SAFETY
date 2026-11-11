// Appearance settings (accent colour, sidebar style, corner radius). Stored per device and applied as CSS variables on <html>.

export type AccentId = 'blue' | 'sky' | 'indigo' | 'violet' | 'pink' | 'orange'
export type SidebarStyle = 'dark' | 'accent' | 'light'
export type RadiusId = 'sharp' | 'normal' | 'round'
export type ThemeSettings = { accent: AccentId; sidebar: SidebarStyle; radius: RadiusId }

export const ACCENTS: { id: AccentId; label: string; hex: string }[] = [
  { id: 'blue', label: 'ฟ้าสด', hex: '#2563eb' },
  { id: 'sky', label: 'ฟ้าอมเขียว', hex: '#0891b2' },
  { id: 'indigo', label: 'น้ำเงินคราม', hex: '#4f46e5' },
  { id: 'violet', label: 'ม่วง', hex: '#7c3aed' },
  { id: 'pink', label: 'ชมพู', hex: '#db2777' },
  { id: 'orange', label: 'ส้ม', hex: '#ea580c' },
]
export const RADII: Record<RadiusId, { label: string; value: string }> = {
  sharp: { label: 'เหลี่ยม', value: '3px' },
  normal: { label: 'ปกติ', value: '6px' },
  round: { label: 'มน', value: '12px' },
}
export const DEFAULT_THEME: ThemeSettings = { accent: 'blue', sidebar: 'dark', radius: 'normal' }
const STORAGE_KEY = 'ds-device:theme'

// ---- colour helpers (hex <-> hsl, mixing) ----
type Hsl = { h: number; s: number; l: number }
function hexToHsl(hex: string): Hsl {
  const n = Number.parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  const l = (max + min) / 2
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  let h = 0
  if (d !== 0) h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: h * 60, s, l }
}
function hslToHex({ h, s, l }: Hsl): string {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  const part = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${part(r)}${part(g)}${part(b)}`
}
const tone = (hex: string, s: number, l: number) => hslToHex({ ...hexToHsl(hex), s, l })

/** Every colour variable the theme controls, derived from the accent and sidebar style. */
export function themeVariables(settings: ThemeSettings): Record<string, string> {
  const hex = ACCENTS.find((entry) => entry.id === settings.accent)?.hex ?? ACCENTS[0].hex
  const hsl = hexToHsl(hex)
  const vars: Record<string, string> = {
    '--primary': hex,
    '--primary-foreground': '#ffffff',
    '--secondary': tone(hex, Math.min(hsl.s, 0.9), 0.95),
    '--secondary-foreground': tone(hex, Math.min(hsl.s, 0.8), 0.3),
    '--accent': tone(hex, Math.min(hsl.s, 0.8), 0.96),
    '--accent-foreground': tone(hex, Math.min(hsl.s, 0.8), 0.32),
    '--ring': tone(hex, Math.min(hsl.s, 0.85), 0.68),
    '--modal-overlay': `${tone(hex, 0.5, 0.12)}80`,
    '--radius': RADII[settings.radius].value,
    '--modal-radius': RADII[settings.radius].value,
  }
  if (settings.sidebar === 'dark') Object.assign(vars, {
    '--sidebar': tone(hex, 0.55, 0.16), '--sidebar-soft': tone(hex, 0.5, 0.23), '--sidebar-active': tone(hex, 0.9, 0.82),
    '--sidebar-muted': tone(hex, 0.25, 0.75), '--sidebar-foreground': '#ffffff',
  })
  else if (settings.sidebar === 'accent') Object.assign(vars, {
    '--sidebar': hex, '--sidebar-soft': tone(hex, hsl.s, Math.max(hsl.l - 0.1, 0.2)), '--sidebar-active': '#ffffff',
    '--sidebar-muted': tone(hex, 0.7, 0.88), '--sidebar-foreground': '#ffffff',
  })
  else Object.assign(vars, {
    '--sidebar': '#ffffff', '--sidebar-soft': tone(hex, Math.min(hsl.s, 0.9), 0.95), '--sidebar-active': hex,
    '--sidebar-muted': '#5b6770', '--sidebar-foreground': '#15232b',
  })
  return vars
}

export function applyTheme(settings: ThemeSettings) {
  const root = document.documentElement
  const vars = themeVariables(settings)
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value)
  root.dataset.sidebar = settings.sidebar
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', settings.sidebar === 'light' ? vars['--primary'] : vars['--sidebar'])
}

const isAccent = (value: unknown): value is AccentId => ACCENTS.some((entry) => entry.id === value)
export function loadTheme(): ThemeSettings {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null') as Partial<ThemeSettings> | null
    return {
      accent: isAccent(stored?.accent) ? stored.accent : DEFAULT_THEME.accent,
      sidebar: stored?.sidebar === 'accent' || stored?.sidebar === 'light' || stored?.sidebar === 'dark' ? stored.sidebar : DEFAULT_THEME.sidebar,
      radius: stored?.radius === 'sharp' || stored?.radius === 'round' || stored?.radius === 'normal' ? stored.radius : DEFAULT_THEME.radius,
    }
  } catch { return DEFAULT_THEME }
}
export function saveTheme(settings: ThemeSettings) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)) } catch { /* storage unavailable: the choice lasts until reload */ }
}
