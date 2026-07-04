import type {
  EnrichedScrapRow,
  ScrapCaptureInput,
  ScrapFamily,
  ScrapMaterialConfig,
  ScrapMaterialRank,
  ScrapSummary,
  ScrapSummaryFilters,
  ScrapSummaryTotals,
} from "./scrap-types"

export function roundKg(value: number): number {
  return Math.round(value * 10_000) / 10_000
}

export function roundMxn(value: number): number {
  return Math.round(value * 100) / 100
}

export function roundPercent(value: number): number {
  return Math.round(value * 100) / 100
}

export function getScrapMaterialConfig(
  sourceKey: string,
  materials: ScrapMaterialConfig[],
): ScrapMaterialConfig | null {
  const key = sourceKey.trim()
  if (!key) return null
  return materials.find((m) => m.sourceKey === key) ?? null
}

export function computeScrapGrossCostMxn(
  scrapQtyKg: number,
  costPerKgMxn: number,
): number {
  const kg = Number(scrapQtyKg)
  const rate = Number(costPerKgMxn)
  if (!Number.isFinite(kg) || kg <= 0) return 0
  if (!Number.isFinite(rate) || rate <= 0) return 0
  return roundMxn(kg * rate)
}

export function computeScrapRecoveryMxn(
  scrapQtyKg: number,
  scrapSalePricePerKgMxn: number | undefined,
): number {
  const kg = Number(scrapQtyKg)
  const rate = Number(scrapSalePricePerKgMxn)
  if (!Number.isFinite(kg) || kg <= 0) return 0
  if (!Number.isFinite(rate) || rate <= 0) return 0
  return roundMxn(kg * rate)
}

export function computeScrapNetLossMxn(grossCostMxn: number, recoveryMxn: number): number {
  const gross = Number(grossCostMxn)
  const recovery = Number(recoveryMxn)
  if (!Number.isFinite(gross) || gross <= 0) return 0
  const net = gross - (Number.isFinite(recovery) ? recovery : 0)
  return roundMxn(Math.max(0, net))
}

export function computeMaterialParticipationPercent(
  materialKg: number,
  totalFamilyKg: number,
): number | null {
  const mat = Number(materialKg)
  const total = Number(totalFamilyKg)
  if (!Number.isFinite(mat) || mat <= 0) return null
  if (!Number.isFinite(total) || total <= 0) return null
  return roundPercent((mat / total) * 100)
}

function familyKgTotals(
  rows: EnrichedScrapRow[],
): Map<ScrapFamily, number> {
  const map = new Map<ScrapFamily, number>()
  for (const row of rows) {
    const prev = map.get(row.family) ?? 0
    map.set(row.family, roundKg(prev + row.scrapQtyKg))
  }
  return map
}

export function enrichScrapCaptureRow(
  capture: ScrapCaptureInput,
  materials: ScrapMaterialConfig[],
  familyKgForParticipation?: number,
): EnrichedScrapRow | null {
  const year = capture.recordYear
  const month = capture.recordMonth
  if (year == null || month == null) return null

  const kgRaw = Number(capture.scrapQty)
  const scrapQtyKg = roundKg(Number.isFinite(kgRaw) && kgRaw >= 0 ? kgRaw : 0)

  const material = getScrapMaterialConfig(capture.sourceKey, materials)
  const costPerKgMxn = material?.costPerKgMxn ?? 0
  const salePricePerKgMxn = material?.scrapSalePricePerKgMxn ?? 0
  const costConfigured = costPerKgMxn > 0

  const grossCostMxn = computeScrapGrossCostMxn(scrapQtyKg, costPerKgMxn)
  const recoveryMxn = computeScrapRecoveryMxn(scrapQtyKg, salePricePerKgMxn)
  const netLossMxn = computeScrapNetLossMxn(grossCostMxn, recoveryMxn)

  const family = material?.family ?? "other"
  const participationPercent =
    familyKgForParticipation != null
      ? computeMaterialParticipationPercent(scrapQtyKg, familyKgForParticipation)
      : null

  return {
    id: capture.id,
    sourceKey: capture.sourceKey,
    materialName: material?.name ?? capture.sourceKey,
    family,
    recordYear: year,
    recordMonth: month,
    scrapQtyKg,
    costPerKgMxn: roundMxn(costPerKgMxn),
    grossCostMxn,
    salePricePerKgMxn: roundMxn(salePricePerKgMxn),
    recoveryMxn,
    netLossMxn,
    participationPercent,
    notes: capture.notes ?? null,
    costConfigured,
  }
}

function sumTotals(rows: EnrichedScrapRow[]): ScrapSummaryTotals {
  let scrapQtyKg = 0
  let grossCostMxn = 0
  let recoveryMxn = 0
  let netLossMxn = 0
  for (const r of rows) {
    scrapQtyKg += r.scrapQtyKg
    grossCostMxn += r.grossCostMxn
    recoveryMxn += r.recoveryMxn
    netLossMxn += r.netLossMxn
  }
  return {
    scrapQtyKg: roundKg(scrapQtyKg),
    grossCostMxn: roundMxn(grossCostMxn),
    recoveryMxn: roundMxn(recoveryMxn),
    netLossMxn: roundMxn(netLossMxn),
  }
}

function buildMaterialRanks(rows: EnrichedScrapRow[]): {
  topByKg: ScrapMaterialRank[]
  topByNetLoss: ScrapMaterialRank[]
} {
  const byMaterial = new Map<string, ScrapMaterialRank>()
  for (const r of rows) {
    const prev = byMaterial.get(r.sourceKey) ?? {
      sourceKey: r.sourceKey,
      materialName: r.materialName,
      family: r.family,
      scrapQtyKg: 0,
      netLossMxn: 0,
    }
    prev.scrapQtyKg = roundKg(prev.scrapQtyKg + r.scrapQtyKg)
    prev.netLossMxn = roundMxn(prev.netLossMxn + r.netLossMxn)
    byMaterial.set(r.sourceKey, prev)
  }
  const list = [...byMaterial.values()]
  const topByKg = [...list].sort((a, b) => b.scrapQtyKg - a.scrapQtyKg).slice(0, 5)
  const topByNetLoss = [...list].sort((a, b) => b.netLossMxn - a.netLossMxn).slice(0, 5)
  return { topByKg, topByNetLoss }
}

export function buildScrapSummary(
  captures: ScrapCaptureInput[],
  materials: ScrapMaterialConfig[],
  filters: ScrapSummaryFilters,
): ScrapSummary {
  const filtered = captures.filter((c) => {
    if (c.recordYear !== filters.recordYear) return false
    if (filters.recordMonth != null && c.recordMonth !== filters.recordMonth) return false
    return true
  })

  const preRows: EnrichedScrapRow[] = []
  for (const c of filtered) {
    const row = enrichScrapCaptureRow(c, materials)
    if (row) preRows.push(row)
  }

  const familyTotals = familyKgTotals(preRows)
  const rows = preRows.map((row) => {
    const familyKg = familyTotals.get(row.family) ?? 0
    return {
      ...row,
      participationPercent: computeMaterialParticipationPercent(row.scrapQtyKg, familyKg),
    }
  })

  rows.sort((a, b) => {
    if (a.recordMonth !== b.recordMonth) return a.recordMonth - b.recordMonth
    return a.materialName.localeCompare(b.materialName, "es")
  })

  const totals = sumTotals(rows)

  const byFamilyMap = new Map<ScrapFamily, EnrichedScrapRow[]>()
  for (const r of rows) {
    const list = byFamilyMap.get(r.family) ?? []
    list.push(r)
    byFamilyMap.set(r.family, list)
  }

  const byFamily = [...byFamilyMap.entries()]
    .map(([family, familyRows]) => {
      const t = sumTotals(familyRows)
      return {
        family,
        scrapQtyKg: t.scrapQtyKg,
        grossCostMxn: t.grossCostMxn,
        recoveryMxn: t.recoveryMxn,
        netLossMxn: t.netLossMxn,
      }
    })
    .sort((a, b) => a.family.localeCompare(b.family))

  const { topByKg, topByNetLoss } = buildMaterialRanks(rows)

  return { rows, totals, byFamily, topByKg, topByNetLoss }
}
