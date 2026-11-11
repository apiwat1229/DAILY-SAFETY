const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string)

/** Tagged template that escapes every interpolated value; use `raw()` to embed already-safe markup. */
export class RawHtml {
  html: string
  constructor(html: string) { this.html = html }
}
export const raw = (html: string) => new RawHtml(html)
export function html(strings: TemplateStringsArray, ...values: unknown[]): RawHtml {
  return new RawHtml(strings.reduce((out, part, index) => {
    const value = values[index - 1]
    const text = value instanceof RawHtml ? value.html : Array.isArray(value) ? value.map((entry) => (entry instanceof RawHtml ? entry.html : escapeHtml(entry))).join('') : escapeHtml(value)
    return out + (index === 0 ? '' : text) + part
  }, ''))
}

const PRINT_CSS = `
  @page { size: A4; margin: 14mm; }
  body { font-family: 'Noto Sans Thai', 'Sarabun', 'Segoe UI', sans-serif; color: #111; font-size: 13px; line-height: 1.5; }
  h1 { font-size: 20px; margin: 0 0 2px; } .muted { color: #555; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { border: 1px solid #999; padding: 5px 8px; text-align: left; vertical-align: top; }
  th { background: #eee; } td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .meta { display: grid; grid-template-columns: 140px 1fr; gap: 2px 12px; margin-top: 10px; }
  .meta dt { color: #555; } .meta dd { margin: 0; }
  .sign { display: flex; gap: 24px; margin-top: 56px; } .sign div { flex: 1; border-top: 1px solid #333; padding-top: 4px; text-align: center; }
`

/** Opens a clean printable document in a new window and starts the print dialog. Returns false when the popup was blocked. */
export function printDocument(title: string, body: RawHtml, language = 'th'): boolean {
  const popup = window.open('', '_blank', 'width=900,height=1000')
  if (!popup) return false
  popup.document.write(`<!doctype html><html lang="${escapeHtml(language)}"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${PRINT_CSS}</style></head><body>${body.html}</body></html>`)
  popup.document.close()
  popup.focus()
  popup.onload = () => popup.print()
  setTimeout(() => popup.print(), 400)
  return true
}
