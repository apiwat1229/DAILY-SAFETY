import * as React from "react"
import { cn } from "@/lib/utils"
import { Dialog as DialogPrimitive } from "radix-ui"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { XIcon } from "lucide-react"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

/** Class tokens that would fight the structured (header / scrolling body / footer) layout; they are dropped from legacy callers. */
function structuredClassName(className?: string) {
  return (className ?? "")
    .split(/\s+/)
    .filter((token) => {
      const base = token.includes(":") ? token.slice(token.lastIndexOf(":") + 1) : token
      if (token.includes(":")) return !(base.startsWith("p-") || base.startsWith("px-") || base.startsWith("py-"))
      return !(
        base.startsWith("max-h-") || base.startsWith("overflow-") || base.startsWith("gap-") || base.startsWith("grid") ||
        base.startsWith("p-") || base.startsWith("px-") || base.startsWith("py-")
      )
    })
    .join(" ")
}

type DialogContentProps = React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
  /**
   * "structured" (default): the first DialogHeader stays pinned, everything else scrolls inside a ScrollArea and a
   * DialogFooter stays pinned at the bottom. "custom": render children untouched for bespoke layouts (photo viewer, paper preview).
   */
  layout?: "structured" | "custom"
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  layout,
  ...props
}: DialogContentProps) {
  const custom = layout === "custom" || (className ?? "").split(/\s+/).includes("p-0")
  const items = React.Children.toArray(children)
  const headers = items.filter((child) => React.isValidElement(child) && child.type === DialogHeader)
  const footers = items.filter((child) => React.isValidElement(child) && child.type === DialogFooter)
  const body = items.filter((child) => !headers.includes(child) && !footers.includes(child))

  const closeButton = showCloseButton && (
    <DialogPrimitive.Close data-slot="dialog-close" asChild>
      <Button
        variant="ghost"
        className="absolute top-3 right-3 z-10 rounded-full text-muted-foreground hover:text-foreground"
        size="icon-sm"
      >
        <XIcon />
        <span className="sr-only">Close</span>
      </Button>
    </DialogPrimitive.Close>
  )

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        data-layout={custom ? "custom" : "structured"}
        className={cn(
          "fixed top-1/2 left-1/2 z-50 w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-popover text-sm text-popover-foreground ring-1 ring-border duration-150 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          custom ? "grid gap-5 p-6" : "flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden",
          custom ? className : structuredClassName(className)
        )}
        {...props}
      >
        {custom ? children : (
          <>
            {headers.length > 0 && <div data-slot="dialog-top" className="shrink-0 border-b border-border-subtle px-6 pt-6 pb-4 pr-14">{headers}</div>}
            <ScrollArea className="min-h-0 flex-1">
              <div data-slot="dialog-body" className="grid grid-cols-[minmax(0,1fr)] gap-5 px-6 py-5">{body}</div>
            </ScrollArea>
            {footers.length > 0 && <div data-slot="dialog-bottom" className="shrink-0">{footers}</div>}
          </>
        )}
        {closeButton}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-1.5", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 border-t border-border bg-surface-subtle px-6 py-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}


