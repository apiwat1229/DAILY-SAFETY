import type { User } from '@/lib/types'

export function InventoryStockPage({ user }: { user: User }) {
  return <div className="page-stack"><h2 className="page-heading font-semibold">Stock</h2><p className="text-sm text-muted-foreground">{user.name}</p></div>
}
