import { toast } from 'sonner'
import { api } from '@/lib/api'
import { clearPersistentState } from '@/lib/persistent-state'
import type { User } from '@/lib/types'

/** Ends the session and forgets per-user remembered state (the device-level view mode and language stay). */
export async function signOut(onUserChange: (user: User | null) => void, message: string) {
  try { await api.logout() } catch { /* session may already have expired */ }
  navigator.serviceWorker?.controller?.postMessage('clear-data')
  clearPersistentState()
  onUserChange(null)
  toast.success(message)
}
