import { useCallback, useEffect, useState } from 'react'
import { requisitionApi } from './requisition-api'
import type { Badges } from './requisition-types'

const EMPTY: Badges = { approvals: 0, issue: 0, cart: 0 }

/** Ask every mounted badge hook to reload (call after the cart, an approval or an issue changes). */
export const refreshBadges = () => window.dispatchEvent(new Event('ds:badges'))

/** Counts for the nav badges: cart lines, approvals waiting for me, requisitions waiting to be issued. Polls once a minute. */
export function useBadges(active: boolean): Badges {
  const [badges, setBadges] = useState<Badges>(EMPTY)
  const load = useCallback(() => {
    requisitionApi.badges().then(setBadges).catch(() => undefined)
  }, [])
  useEffect(() => {
    if (!active) return
    load()
    const timer = window.setInterval(load, 60_000)
    window.addEventListener('ds:badges', load)
    window.addEventListener('ds:navigate', load)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('ds:badges', load)
      window.removeEventListener('ds:navigate', load)
    }
  }, [active, load])
  return badges
}
