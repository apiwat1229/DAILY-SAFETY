import type { User } from '@/lib/types'
import type { NavigateFn } from '@/components/app-pages'

export function RequisitionsPage({ user }: { user: User; onPage: NavigateFn }) {
  return <div className="page-stack"><h2 className="page-heading font-semibold">ใบเบิกของฉัน</h2><p className="text-sm text-muted-foreground">{user.name}</p></div>
}
