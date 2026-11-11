export type InventoryType = 'ppe' | 'medicine'

export type Category = { id: string; name: string; type: InventoryType; sortOrder: number; itemCount: number }
export type Variant = { id: string; label: string; isActive: boolean }
export type Item = {
  id: string; sku: string; name: string; type: InventoryType; categoryId: string; categoryName: string; unit: string; image: string
  minStock: number; trackLot: boolean; trackExpiry: boolean; isActive: boolean; variants: Variant[]
}
export type Warehouse = { id: string; code: string; name: string; isActive: boolean; staff: { userId: string; name: string }[] }

export type StockRow = {
  variantId: string; itemId: string; sku: string; name: string; variantLabel: string; type: InventoryType; unit: string
  warehouseId: string; warehouseName: string; onHand: number; reserved: number; available: number; minStock: number
  nearestExpiry: string; isLow: boolean; isExpiring: boolean
}
export type Lot = { lotId: string; lotNo: string; expiryDate: string; onHand: number; reserved: number }

export type MovementType = 'receive' | 'issue' | 'return' | 'transfer_out' | 'transfer_in' | 'adjust' | 'count_adjust' | 'write_off'
export type Movement = {
  id: string; type: MovementType; variantId: string; sku: string; itemName: string; variantLabel: string; warehouseId: string; warehouseName: string
  lotNo: string; expiryDate: string; qty: number; reason: string; refType: string; refId: string; userName: string; createdAt: string
}
export type MovementFilters = { warehouseId?: string; variantId?: string; type?: string; from?: string; to?: string; page?: number; pageSize?: number }

export type LowStockRow = { itemId: string; sku: string; name: string; warehouseId: string; warehouseName: string; onHand: number; minStock: number }
export type ExpiringRow = {
  itemId: string; variantId: string; name: string; variantLabel: string; warehouseId: string; warehouseName: string
  lotNo: string; expiryDate: string; daysLeft: number; onHand: number
}
export type StockAlerts = { lowStock: LowStockRow[]; expiring: ExpiringRow[]; expiryWarnDays: number[] }

export type CountStatus = 'draft' | 'counting' | 'posted'
export type CountSummary = { id: string; warehouseId: string; warehouseName: string; status: CountStatus; createdAt: string; postedAt: string; createdByName: string; lineCount: number }
export type CountLine = {
  variantId: string; lotId: string; sku: string; itemName: string; variantLabel: string; lotNo: string; expiryDate: string
  systemQty: number; countedQty: number | null
}
export type CountSheet = CountSummary & { lines: CountLine[] }

export type ReceiptLine = { variantId: string; qty: number; lotNo?: string; expiryDate?: string }
export type WriteOffReason = 'expired' | 'damaged' | 'lost' | 'other'
