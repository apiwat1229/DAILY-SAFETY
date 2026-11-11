import { localDateString } from '@/lib/api'

/** Whole days from today (Bangkok) to a YYYY-MM-DD date; negative when already past. */
export function daysUntil(date: string, today = localDateString()): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
}

export type ExpiryTone = 'expired' | 'soon' | 'ok'

/** Red when expired, amber inside the smallest warning window, otherwise neutral. */
export function expiryTone(days: number, warnDays: number[]): ExpiryTone {
  if (days < 0) return 'expired'
  const smallest = warnDays.length ? Math.min(...warnDays) : 30
  return days <= smallest ? 'soon' : 'ok'
}

export const toneClass: Record<ExpiryTone, string> = {
  expired: 'border-destructive/25 bg-destructive/10 text-destructive',
  soon: 'border-warning/25 bg-warning/10 text-warning',
  ok: 'text-muted-foreground',
}
