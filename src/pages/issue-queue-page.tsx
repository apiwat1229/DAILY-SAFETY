import type { User } from '@/lib/types'

export function IssueQueuePage({ user }: { user: User }) {
  return <div className="page-stack"><h2 className="page-heading font-semibold">จ่ายของ</h2><p className="text-sm text-muted-foreground">{user.name}</p></div>
}
