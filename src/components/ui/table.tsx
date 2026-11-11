"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Responsive table. On phones (below 768px) rows become stacked cards: each cell is labelled with its column
 * heading and action cells sit at the bottom of the card. Pass `stack={false}` to keep a horizontally scrolling table.
 */
function Table({ className, stack = true, ...props }: React.ComponentProps<"table"> & { stack?: boolean }) {
  const ref = React.useRef<HTMLTableElement>(null)

  React.useLayoutEffect(() => {
    const table = ref.current
    if (!stack || !table) return
    const label = () => {
      const heads = Array.from(table.querySelectorAll("thead th")).map((th) => th.textContent?.trim() ?? "")
      table.querySelectorAll("tbody tr").forEach((row) => {
        Array.from(row.children).forEach((cell, index) => {
          if (!(cell instanceof HTMLElement)) return
          const text = heads[index] ?? ""
          if (cell.dataset.label !== text) cell.dataset.label = text
          const isActions = Boolean(cell.querySelector("button, a[download]")) && !cell.textContent?.trim().replace(/\s+/g, "")
          if (isActions !== ("actions" in cell.dataset)) {
            if (isActions) cell.dataset.actions = ""
            else delete cell.dataset.actions
          }
        })
      })
    }
    label()
    const observer = new MutationObserver(label)
    observer.observe(table, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [stack])

  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <table
        ref={ref}
        data-slot="table"
        data-stack={stack ? "" : undefined}
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b [&_tr]:border-border", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b border-border transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}


