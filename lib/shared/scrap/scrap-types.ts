export type ScrapFamily = "metal" | "twine" | "other"

export interface ScrapMaterialConfig {
  sourceKey: string
  name: string
  family: ScrapFamily
  costPerKgMxn: number
  scrapSalePricePerKgMxn?: number
  weightPerPieceKg?: number
  active: boolean
}

export interface ScrapMaterialsConfig {
  materials: ScrapMaterialConfig[]
}

/** Fila mínima de captura scrap (compatible backend y frontend). */
export interface ScrapCaptureInput {
  id: string
  sourceKey: string
  recordYear: number | null
  recordMonth: number | null
  scrapQty: number | null
  notes?: string | null
}

export interface EnrichedScrapRow {
  id: string
  sourceKey: string
  materialName: string
  family: ScrapFamily
  recordYear: number
  recordMonth: number
  scrapQtyKg: number
  costPerKgMxn: number
  grossCostMxn: number
  salePricePerKgMxn: number
  recoveryMxn: number
  netLossMxn: number
  participationPercent: number | null
  notes: string | null
  costConfigured: boolean
}

export interface ScrapFamilyTotals {
  family: ScrapFamily
  scrapQtyKg: number
  grossCostMxn: number
  recoveryMxn: number
  netLossMxn: number
}

export interface ScrapSummaryTotals {
  scrapQtyKg: number
  grossCostMxn: number
  recoveryMxn: number
  netLossMxn: number
}

export interface ScrapMaterialRank {
  sourceKey: string
  materialName: string
  family: ScrapFamily
  scrapQtyKg: number
  netLossMxn: number
}

export interface ScrapSummary {
  rows: EnrichedScrapRow[]
  totals: ScrapSummaryTotals
  byFamily: ScrapFamilyTotals[]
  topByKg: ScrapMaterialRank[]
  topByNetLoss: ScrapMaterialRank[]
}

export interface ScrapSummaryFilters {
  recordYear: number
  recordMonth?: number
}
