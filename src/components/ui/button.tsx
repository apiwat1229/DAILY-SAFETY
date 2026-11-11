import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        outline:
          "border-transparent bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-transparent dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-(--control-height) gap-1.5 px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        xs: "h-(--control-height) gap-1 rounded-[min(var(--radius-md),10px)] px-2.5 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-(--control-height) gap-1 rounded-[min(var(--radius-md),12px)] px-3 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-(--control-height) gap-1.5 px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        icon: "size-(--control-height)",
        "icon-xs":
          "size-(--control-height) rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-(--control-height) rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-(--control-height)",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

/** Concatenate the plain-text children of a node (used as the tooltip label of icon-only buttons). */
function textOf(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(textOf).join(" ")
  return ""
}

/** Drop text children, keep icons/elements. */
function withoutText(node: React.ReactNode): React.ReactNode {
  return React.Children.map(node, (child) => (typeof child === "string" || typeof child === "number" ? null : child))
}

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /** Render as a square icon button; the text children become the tooltip and accessible name. */
    iconOnly?: boolean
    /** Explicit tooltip text for icon buttons (defaults to the text children, aria-label or title). */
    tooltip?: string
  }

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  iconOnly = false,
  tooltip,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button"
  const isIconSize = typeof size === "string" && size.startsWith("icon")
  const resolvedSize = iconOnly && !isIconSize ? "icon" : size
  const ariaLabel = props["aria-label"]
  const label = (tooltip ?? (iconOnly ? textOf(children).replace(/\s+/g, " ").trim() : "")) || ariaLabel || (iconOnly || isIconSize ? props.title : undefined) || ""
  const showTooltip = (iconOnly || isIconSize) && Boolean(label)

  let content = children
  if (iconOnly) {
    if (asChild && React.isValidElement<{ children?: React.ReactNode }>(children)) {
      content = React.cloneElement(children, undefined, withoutText(children.props.children))
    } else content = withoutText(children)
  }

  const button = (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={resolvedSize}
      className={cn(buttonVariants({ variant, size: resolvedSize, className }))}
      {...props}
      aria-label={showTooltip ? label : ariaLabel}
      title={showTooltip ? undefined : props.title}
    >
      {content}
    </Comp>
  )
  if (!showTooltip) return button
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>{label}</TooltipContent>
    </Tooltip>
  )
}

export { Button, buttonVariants }


