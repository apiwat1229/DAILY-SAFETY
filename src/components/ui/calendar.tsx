import * as React from 'react'
import { DayPicker } from '@daypicker/react'
import { th } from '@daypicker/react/locale/th'
import { cn } from '@/lib/utils'

function Calendar({ className, classNames, locale = th, ...props }: React.ComponentProps<typeof DayPicker>) {
  return <DayPicker
    locale={locale}
    className={cn('w-fit p-3', className)}
    classNames={{
      root: 'relative w-fit',
      months: 'flex flex-col gap-3',
      month: 'space-y-3',
      month_caption: 'relative flex h-8 items-center justify-center px-9',
      caption_label: 'text-sm font-semibold capitalize',
      nav: 'absolute inset-x-0 top-[18px] z-10 flex items-center justify-between px-3',
      button_previous: 'inline-flex size-7 items-center justify-center rounded-lg border border-input bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40',
      button_next: 'inline-flex size-7 items-center justify-center rounded-lg border border-input bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40',
      chevron: 'size-4',
      month_grid: 'w-full border-collapse',
      weekdays: 'flex',
      weekday: 'w-9 rounded-md text-center text-xs font-normal text-muted-foreground',
      week: 'mt-1 flex w-full',
      day: 'relative p-0 text-center text-sm focus-within:relative focus-within:z-20',
      day_button: 'inline-flex size-9 items-center justify-center rounded-lg p-0 text-sm font-normal transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40',
      selected: '[&>button]:bg-primary [&>button]:font-semibold [&>button]:text-primary-foreground [&>button]:hover:bg-primary [&>button]:hover:text-primary-foreground',
      today: '[&>button]:bg-accent [&>button]:text-accent-foreground',
      outside: '[&>button]:text-muted-foreground [&>button]:opacity-45',
      disabled: '[&>button]:pointer-events-none [&>button]:opacity-35',
      hidden: 'invisible',
      ...classNames,
    }}
    {...props}
  />
}

export { Calendar }
