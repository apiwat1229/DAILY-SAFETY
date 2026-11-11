import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RotateCw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'

type State = { failed: boolean }

/** Last line of defence: show a recoverable message instead of a blank page when a screen throws while rendering. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State { return { failed: true } }

  componentDidCatch(error: Error, info: ErrorInfo) { console.error('UI error', error, info.componentStack) }

  render() {
    if (!this.state.failed) return this.props.children
    // This renders outside the language provider, so the text is bilingual on purpose.
    return <main className="grid min-h-screen place-items-center bg-background p-6">
      <div className="max-w-md rounded-lg border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-lg bg-destructive/10 text-destructive"><TriangleAlert size={22} /></div>
        <h1 className="text-lg font-semibold">เกิดข้อผิดพลาดในการแสดงหน้านี้</h1>
        <p className="mt-1 text-sm text-muted-foreground">Something went wrong while showing this page.</p>
        <p className="mt-3 text-sm text-muted-foreground">ข้อมูลที่บันทึกแล้วไม่สูญหาย ลองโหลดหน้าใหม่อีกครั้ง</p>
        <Button className="mt-5 gap-2" onClick={() => window.location.reload()}><RotateCw size={16} />โหลดใหม่ / Reload</Button>
      </div>
    </main>
  }
}
