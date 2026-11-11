import { Activity, ArrowLeftRight, BadgeCheck, BookOpenText, Boxes, ClipboardCheck, ClipboardList, ClipboardPenLine, ContactRound, FileBarChart2, FileSpreadsheet, History, ListChecks, ListOrdered, Menu, Package, PackageCheck, PackagePlus, Plus, ReceiptText, ShoppingCart, UserRoundCog, Warehouse, Workflow, type LucideIcon } from 'lucide-react'
import type { IconName } from '@/lib/nav-model'

const ICONS: Record<IconName, LucideIcon> = {
  Activity, ArrowLeftRight, BookOpenText, Boxes, ClipboardCheck, ClipboardList, ClipboardPenLine, ContactRound, FileBarChart2, FileSpreadsheet,
  History, ListChecks, Menu, Package, PackagePlus, Plus, UserRoundCog, Warehouse,
  ShoppingCart, ReceiptText, BadgeCheck, PackageCheck, ListOrdered, Workflow,
}

/** Navigation data refers to icons by name so it stays free of React imports. */
export const iconFor = (name: IconName): LucideIcon => ICONS[name]
