import { useState } from 'react'
import { Package } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/** Item image urls from the API are the full-size image; the thumbnail is the same url with size=thumb. */
export const thumbUrl = (url: string | null) => (url ? `${url}${url.includes('?') ? '&' : '?'}size=thumb` : null)

type Props = { url: string | null; name: string; size?: number; className?: string; zoomable?: boolean }

/** Square thumbnail with a placeholder; clicking opens the full image. */
export function ItemThumb({ url, name, size = 56, className = '', zoomable = true }: Props) {
  const [open, setOpen] = useState(false)
  const box = { width: size, height: size }
  if (!url) return <div style={box} className={`grid shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground ${className}`} aria-hidden="true"><Package size={Math.round(size * 0.42)} /></div>
  const image = <img src={thumbUrl(url) ?? url} alt={name} loading="lazy" style={box} className={`shrink-0 rounded-lg border border-border bg-secondary object-cover ${className}`} />
  if (!zoomable) return image
  return <>
    <button type="button" onClick={(event) => { event.stopPropagation(); setOpen(true) }} className="shrink-0 rounded-lg focus-visible:outline-2 focus-visible:outline-primary" aria-label={name}>{image}</button>
    <ImageViewer open={open} onOpenChange={setOpen} url={url} title={name} />
  </>
}

/** Lightbox for one image. */
export function ImageViewer({ open, onOpenChange, url, title }: { open: boolean; onOpenChange: (open: boolean) => void; url: string; title: string }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
    <DialogHeader><DialogTitle className="truncate">{title}</DialogTitle><DialogDescription className="sr-only">{title}</DialogDescription></DialogHeader>
    <img src={url} alt={title} className="mx-auto max-h-[70dvh] w-auto max-w-full rounded-lg object-contain" />
  </DialogContent></Dialog>
}
