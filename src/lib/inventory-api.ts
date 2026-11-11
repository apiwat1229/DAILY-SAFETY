import { request } from './api'
import type { Category, CountSheet, CountSummary, Item, Lot, Movement, MovementFilters, ReceiptLine, StockAlerts, StockRow, Variant, Warehouse, WriteOffReason, InventoryType } from './inventory-types'

const json = (method: string, body?: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
const qs = (params: Record<string, string | number | undefined>) => {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') query.set(key, String(value))
  const text = query.toString()
  return text ? `?${text}` : ''
}
const base = '/api/inventory'

export type ItemInput = {
  sku: string; name: string; type: InventoryType; categoryId?: string; unit: string; minStock: number; trackLot?: boolean; trackExpiry?: boolean; variants?: string[]
}

/** One method per endpoint in server/inventory/routes.js. */
export const inventoryApi = {
  categories: () => request<{ categories: Category[] }>(`${base}/categories`),
  createCategory: (input: { name: string; type: InventoryType; sortOrder?: number }) => request<{ category: Category }>(`${base}/categories`, json('POST', input)),
  updateCategory: (id: string, input: { name?: string; sortOrder?: number }) => request<{ category: Category }>(`${base}/categories/${id}`, json('PATCH', input)),
  deleteCategory: (id: string) => request<{ ok: boolean }>(`${base}/categories/${id}`, json('DELETE')),

  items: (filters: { type?: InventoryType; q?: string; active?: '1' | '0' } = {}) => request<{ items: Item[] }>(`${base}/items${qs(filters)}`),
  createItem: (input: ItemInput) => request<{ item: Item }>(`${base}/items`, json('POST', input)),
  updateItem: (id: string, input: Partial<Pick<Item, 'name' | 'unit' | 'minStock' | 'categoryId' | 'trackLot' | 'trackExpiry' | 'isActive'>>) => request<{ item: Item }>(`${base}/items/${id}`, json('PATCH', input)),
  deleteItem: (id: string) => request<{ ok: boolean }>(`${base}/items/${id}`, json('DELETE')),
  uploadItemImage: (id: string, file: File) => {
    const form = new FormData()
    form.append('image', file)
    return request<{ item: Item }>(`${base}/items/${id}/image`, { method: 'POST', body: form })
  },
  deleteItemImage: (id: string) => request<{ item: Item }>(`${base}/items/${id}/image`, json('DELETE')),
  addVariant: (itemId: string, label: string) => request<{ variant: Variant }>(`${base}/items/${itemId}/variants`, json('POST', { label })),
  updateVariant: (id: string, input: { label?: string; isActive?: boolean }) => request<{ variant: Variant }>(`${base}/variants/${id}`, json('PATCH', input)),
  deleteVariant: (id: string) => request<{ ok: boolean }>(`${base}/variants/${id}`, json('DELETE')),

  warehouses: () => request<{ warehouses: Warehouse[] }>(`${base}/warehouses`),
  createWarehouse: (input: { code: string; name: string; type?: string }) => request<{ warehouse: Warehouse }>(`${base}/warehouses`, json('POST', input)),
  updateWarehouse: (id: string, input: { code?: string; name?: string; type?: string; isActive?: boolean }) => request<{ warehouse: Warehouse }>(`${base}/warehouses/${id}`, json('PATCH', input)),
  deleteWarehouse: (id: string) => request<{ ok: boolean }>(`${base}/warehouses/${id}`, json('DELETE')),
  setWarehouseStaff: (id: string, userIds: string[]) => request<{ warehouse: Warehouse }>(`${base}/warehouses/${id}/staff`, json('PUT', { userIds })),

  stock: (filters: { warehouseId?: string; type?: InventoryType; categoryId?: string; q?: string; filter?: 'low' | 'expiring' } = {}) => request<{ rows: StockRow[] }>(`${base}/stock${qs(filters)}`),
  lots: (warehouseId: string, variantId: string) => request<{ lots: Lot[] }>(`${base}/stock/lots${qs({ warehouseId, variantId })}`),
  receive: (input: { warehouseId: string; note?: string; lines: ReceiptLine[] }) => request<{ receiptId: string; movements: { variantId: string; lotId: string; movementId: string }[] }>(`${base}/receipts`, json('POST', input)),
  adjust: (input: { warehouseId: string; variantId: string; lotId: string; delta: number; reason: string }) => request<{ movementId: string }>(`${base}/adjustments`, json('POST', input)),
  writeOff: (input: { warehouseId: string; variantId: string; lotId: string; qty: number; reason: WriteOffReason; note?: string }) => request<{ movementId: string }>(`${base}/write-offs`, json('POST', input)),
  transfer: (input: { fromWarehouseId: string; toWarehouseId: string; lines: { variantId: string; lotId: string; qty: number }[] }) => request<{ transfers: unknown[] }>(`${base}/transfers`, json('POST', input)),
  movements: (filters: MovementFilters = {}) => request<{ rows: Movement[]; total: number; page: number; pageSize: number }>(`${base}/movements${qs({ ...filters })}`),
  movementsExportUrl: (filters: MovementFilters = {}) => `${base}/movements/export${qs({ warehouseId: filters.warehouseId, variantId: filters.variantId, type: filters.type, from: filters.from, to: filters.to })}`,
  alerts: (warehouseId?: string) => request<StockAlerts>(`${base}/alerts${qs({ warehouseId })}`),
  settings: () => request<{ expiryWarnDays: number[] }>(`${base}/settings`),
  saveSettings: (expiryWarnDays: number[]) => request<{ expiryWarnDays: number[] }>(`${base}/settings`, json('PUT', { expiryWarnDays })),

  counts: (warehouseId?: string) => request<{ counts: CountSummary[] }>(`${base}/counts${qs({ warehouseId })}`),
  createCount: (warehouseId: string) => request<{ id: string }>(`${base}/counts`, json('POST', { warehouseId })),
  count: (id: string) => request<{ count: CountSheet }>(`${base}/counts/${id}`),
  saveCountLines: (id: string, lines: { variantId: string; lotId: string; countedQty: number }[]) => request<{ ok: boolean }>(`${base}/counts/${id}/lines`, json('PUT', { lines })),
  postCount: (id: string) => request<{ adjustments: number }>(`${base}/counts/${id}/post`, json('POST')),
}
