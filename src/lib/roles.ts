import type { User } from '@/lib/types'

/** Admins and leaders can see every inspection and assign follow-up work. */
export const isManager = (user: Pick<User, 'role'>) => user.role === 'admin' || user.role === 'leader'

/** Admins and storekeepers work with stock; the server limits storekeepers to their own warehouses. */
export const isStockStaff = (user: Pick<User, 'role'>) => user.role === 'admin' || user.role === 'storekeeper'
