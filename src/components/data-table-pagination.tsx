import { useEffect, useRef, useState } from 'react'
import { ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function useDataPagination<T>(items: T[]) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSizeState] = useState(10)
  const previousItems = useRef(items)
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const currentPage = Math.min(page, totalPages)

  useEffect(() => {
    if (previousItems.current !== items) {
      previousItems.current = items
      setPage(1)
    } else if (page !== currentPage) setPage(currentPage)
  }, [currentPage, items, page])

  const visibleItems = items.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  function setPageSize(value: number) {
    setPageSizeState(value)
    setPage(1)
  }

  return { page: currentPage, pageSize, totalPages, visibleItems, setPage, setPageSize }
}

export function DataTablePagination({ total, page, pageSize, totalPages, onPageChange, onPageSizeChange, t }: {
  total: number
  page: number
  pageSize: number
  totalPages: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
  t: (thai: string) => string
}) {
  if (total === 0) return null
  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)
  return <nav aria-label={t('การแบ่งหน้า')} className="flex flex-col gap-3 border-t border-border-subtle px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-5">
    <p className="tabular-nums">{t('แสดง')} {start}–{end} {t('จาก')} {total} {t('รายการ')}</p>
    <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
      <div className="flex items-center gap-2"><span className="whitespace-nowrap">{t('รายการต่อหน้า')}</span><Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}><SelectTrigger className="h-9 w-[76px]" aria-label={t('รายการต่อหน้า')}><SelectValue /></SelectTrigger><SelectContent>{[10, 25, 50, 100].map((size) => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}</SelectContent></Select></div>
      <div className="flex items-center gap-1">
        <Button type="button" variant="outline" size="icon" className="size-9" aria-label={t('หน้าแรก')} title={t('หน้าแรก')} disabled={page <= 1} onClick={() => onPageChange(1)}><ChevronsLeft size={15} /></Button>
        <Button type="button" variant="outline" size="icon" className="size-9" aria-label={t('ก่อนหน้า')} title={t('ก่อนหน้า')} disabled={page <= 1} onClick={() => onPageChange(page - 1)}><ChevronLeft size={15} /></Button>
        <span className="min-w-16 px-1 text-center tabular-nums">{t('หน้า')} {page} / {totalPages}</span>
        <Button type="button" variant="outline" size="icon" className="size-9" aria-label={t('ถัดไป')} title={t('ถัดไป')} disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}><ChevronRight size={15} /></Button>
        <Button type="button" variant="outline" size="icon" className="size-9" aria-label={t('หน้าสุดท้าย')} title={t('หน้าสุดท้าย')} disabled={page >= totalPages} onClick={() => onPageChange(totalPages)}><ChevronsRight size={15} /></Button>
      </div>
    </div>
  </nav>
}
