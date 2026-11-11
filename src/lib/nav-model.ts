import type { PageKey } from './pages'

// Pure module (type imports only) so tests can load it directly. Icons are referenced by name; the UI maps them to components.
export type Role = 'admin' | 'leader' | 'employee' | 'storekeeper'
export type IconName =
  | 'Activity' | 'FileBarChart2' | 'Plus' | 'UserRoundCog' | 'ContactRound' | 'ListChecks' | 'ClipboardCheck' | 'FileSpreadsheet'
  | 'BookOpenText' | 'ClipboardPenLine' | 'History' | 'Boxes' | 'Package' | 'Warehouse' | 'ClipboardList' | 'ArrowLeftRight' | 'PackagePlus' | 'Menu'

/** `label` is the sidebar text (Thai, passed through t()); `short` is the bottom-bar text when the label is too long. */
export type NavItem = { key: PageKey; label: string; icon: IconName; short?: string }
export type TabSlot =
  | { kind: 'tab'; item: NavItem }
  | { kind: 'center'; label: string; icon: IconName; page: PageKey; query?: string }
  | { kind: 'more' }
export type NavGroup = { title: string; items: NavItem[] }

const item = (key: PageKey, label: string, icon: IconName, short?: string): NavItem => ({ key, label, icon, short })

const ITEMS: Record<Role, NavItem[]> = {
  admin: [
    item('dashboard', 'ภาพรวม', 'Activity'),
    item('inspections', 'รายการตรวจ', 'FileBarChart2'),
    item('new', 'บันทึกการตรวจ', 'Plus'),
    item('users', 'ผู้ใช้งาน', 'UserRoundCog'),
    item('employees', 'รายชื่อพนักงาน', 'ContactRound'),
    item('checklist', 'หัวข้อตรวจ', 'ListChecks'),
    item('assessments', 'แบบประเมิน', 'ClipboardCheck'),
    item('assessment-reports', 'รายงานแบบประเมิน', 'FileSpreadsheet'),
    item('training-materials', 'สื่ออบรม', 'BookOpenText'),
    item('hiyari', 'Hiyari Hat', 'ClipboardPenLine'),
    item('hiyari-reports', 'รายงาน Hiyari Hat', 'FileSpreadsheet'),
    item('inventory-stock', 'สต็อกคงเหลือ', 'Boxes', 'สต็อก'),
    item('inventory-items', 'สินค้าและหมวด', 'Package'),
    item('inventory-warehouses', 'คลังสินค้า', 'Warehouse'),
    item('inventory-counts', 'นับสต็อก', 'ClipboardList'),
    item('inventory-movements', 'ประวัติสต็อก', 'ArrowLeftRight'),
    item('audit-log', 'บันทึกการใช้งาน', 'History'),
  ],
  leader: [
    item('dashboard', 'ภาพรวมทีม', 'Activity'),
    item('inspections', 'ติดตามงานทีม', 'FileBarChart2', 'ติดตามงาน'),
    item('new', 'บันทึกการตรวจ', 'Plus'),
  ],
  employee: [
    item('new', 'บันทึกการตรวจ', 'Plus'),
    item('inspections', 'ประวัติของฉัน', 'FileBarChart2', 'ประวัติ'),
  ],
  storekeeper: [
    item('inventory-stock', 'สต็อกคงเหลือ', 'Boxes', 'สต็อก'),
    item('inventory-movements', 'ประวัติสต็อก', 'ArrowLeftRight', 'ประวัติ'),
    item('inventory-counts', 'นับสต็อก', 'ClipboardList'),
    item('new', 'บันทึกการตรวจ', 'Plus'),
    item('inspections', 'ประวัติของฉัน', 'FileBarChart2', 'ประวัติ'),
  ],
}

const RECORD: TabSlot = { kind: 'center', label: 'บันทึกตรวจ', icon: 'Plus', page: 'new' }
const RECEIVE: TabSlot = { kind: 'center', label: 'รับเข้า', icon: 'PackagePlus', page: 'inventory-stock', query: '?action=receive' }
const MORE: TabSlot = { kind: 'more' }

/** Bottom-bar layout per role. The centre action always lands at index floor(n / 2). */
const BAR: Record<Role, { tabs: PageKey[]; center: TabSlot }> = {
  admin: { tabs: ['dashboard', 'inspections', 'inventory-stock'], center: RECORD },
  leader: { tabs: ['dashboard', 'inspections'], center: RECORD },
  employee: { tabs: ['inspections'], center: RECORD },
  storekeeper: { tabs: ['inventory-stock', 'inventory-movements', 'inventory-counts'], center: RECEIVE },
}

const GROUP_OF = (key: PageKey): string => {
  if (key.startsWith('inventory-')) return 'คลังสินค้า'
  if (key === 'users' || key === 'employees' || key === 'checklist' || key === 'audit-log') return 'ข้อมูลระบบ'
  if (key === 'assessments' || key === 'assessment-reports' || key === 'training-materials' || key === 'hiyari' || key === 'hiyari-reports') return 'การตรวจและอบรม'
  return 'การตรวจ'
}
const GROUP_ORDER = ['การตรวจ', 'คลังสินค้า', 'การตรวจและอบรม', 'ข้อมูลระบบ']

export function navFor(role: Role): { all: NavItem[]; tabs: TabSlot[]; groups: NavGroup[] } {
  const all = ITEMS[role]
  const bar = BAR[role]
  const tabItems = bar.tabs.map((key) => all.find((entry) => entry.key === key)!)
  const middle = Math.floor((tabItems.length + 2) / 2)
  const tabs: TabSlot[] = tabItems.map((entry): TabSlot => ({ kind: 'tab', item: entry }))
  tabs.splice(middle, 0, bar.center)
  tabs.push(MORE)

  const onBar = new Set<PageKey>([...bar.tabs, (bar.center as { page: PageKey }).page])
  const rest = all.filter((entry) => !onBar.has(entry.key))
  const groups = GROUP_ORDER
    .map((title) => ({ title, items: rest.filter((entry) => GROUP_OF(entry.key) === title) }))
    .filter((group) => group.items.length > 0)
  return { all, tabs, groups }
}

/** Which bar slot is highlighted: the matching tab, the centre action, or More when the page only lives in the sheet. */
export function activeSlotIndex(tabs: TabSlot[], page: PageKey): number {
  const direct = tabs.findIndex((slot) => (slot.kind === 'tab' && slot.item.key === page) || (slot.kind === 'center' && slot.page === page))
  return direct >= 0 ? direct : tabs.findIndex((slot) => slot.kind === 'more')
}
