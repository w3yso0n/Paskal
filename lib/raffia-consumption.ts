import { normalizeSkuCode } from "@/lib/sku-catalog"
import {
  roundTotalMeters,
  TWINE_COLOR_CATALOG,
  RAFIA_M_KG_CATALOG,
} from "@/lib/hook-sku-generator"

const RAFIA_CODE_TO_MKG: Record<string, number> = Object.fromEntries(
  Object.entries(RAFIA_M_KG_CATALOG).map(([kg, code]) => [code, Number(kg)]),
)

const COLOR_CODE_TO_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(TWINE_COLOR_CATALOG).map(([name, code]) => [
    code,
    name.charAt(0).toUpperCase() + name.slice(1),
  ]),
)

export type ParsedHookSku = {
  sku: string
  hookTypeCode: string
  windingTypeCode: string
  metersCode: string
  mainMeters: number
  freeFallMeters: number
  totalMeters: number
  colorCodes: string[]
  rafiaCode: string
  rafiaMKg: number
}

export type RaffiaColorConsumption = {
  colorCode: string
  colorLabel: string
  meters: number
  kg: number
}

export type RaffiaProductionContribution = {
  sku: string
  pieces: number
  parsed: ParsedHookSku
  totalMeters: number
  totalKg: number
  byColor: RaffiaColorConsumption[]
}

export type RaffiaYearSummary = {
  year: number
  totalKg: number
  totalMeters: number
  parsedSkuCount: number
  unrecognizedSkuCount: number
  byColor: RaffiaColorConsumption[]
  bySku: Array<{
    sku: string
    pieces: number
    meters: number
    kg: number
    rafiaMKg: number
    totalMetersPerPiece: number
    colors: string[]
  }>
}

function parseMetersSegment(code: string): { main: number; freeFall: number; total: number } | null {
  const trimmed = code.trim()
  if (!trimmed) return null
  const parts = trimmed.split("+")
  const main = Number(parts[0])
  const freeFall = parts.length > 1 ? Number(parts[1]) : 0
  if (!Number.isFinite(main) || main <= 0) return null
  if (parts.length > 1 && (!Number.isFinite(freeFall) || freeFall < 0)) return null
  return {
    main,
    freeFall,
    total: roundTotalMeters(main, freeFall),
  }
}

/**
 * Parsea SKU hook: [gancho][embobinado][metros][color][rafia]
 * Ej: 522pk18+4l-10, 522pk18+4w/o/y-12
 */
export function parseHookSkuFromCode(rawSku: string): ParsedHookSku | null {
  const sku = normalizeSkuCode(rawSku)
  if (!sku) return null

  const rafiaMatch = sku.match(/(-1[025])$/)
  if (!rafiaMatch) return null
  const rafiaCode = rafiaMatch[1]
  const rafiaMKg = RAFIA_CODE_TO_MKG[rafiaCode]
  if (!rafiaMKg) return null

  const body = sku.slice(0, -rafiaCode.length)
  const prefixMatch = body.match(/^(518|522)(pk|nf|tl)(.+)$/i)
  if (!prefixMatch) return null

  const hookTypeCode = prefixMatch[1]
  const windingTypeCode = prefixMatch[2].toLowerCase()
  const rest = prefixMatch[3]

  const metersColorMatch = rest.match(
    /^(\d+(?:\.\d+)?(?:\+\d+(?:\.\d+)?)?)((?:[wbygol])(?:\/[wbygol])*)/i,
  )
  if (!metersColorMatch) return null

  const metersCode = metersColorMatch[1]
  const colorSegment = metersColorMatch[2]
  const meters = parseMetersSegment(metersCode)
  if (!meters) return null

  const colorCodes = colorSegment
    .split("/")
    .map((c) => c.trim().toLowerCase())
    .filter((c) => /^[wbygol]$/.test(c))
  if (colorCodes.length === 0) return null

  return {
    sku,
    hookTypeCode,
    windingTypeCode,
    metersCode,
    mainMeters: meters.main,
    freeFallMeters: meters.freeFall,
    totalMeters: meters.total,
    colorCodes,
    rafiaCode,
    rafiaMKg,
  }
}

export function computeRaffiaForPieces(
  parsed: ParsedHookSku,
  pieces: number,
): RaffiaProductionContribution {
  const safePieces = Number.isFinite(pieces) && pieces > 0 ? pieces : 0
  const metersPerColor = safePieces * parsed.totalMeters

  const byColor: RaffiaColorConsumption[] = parsed.colorCodes.map((colorCode) => ({
    colorCode,
    colorLabel: COLOR_CODE_TO_LABEL[colorCode] ?? colorCode,
    meters: metersPerColor,
    kg: metersPerColor / parsed.rafiaMKg,
  }))

  const totalMeters = byColor.reduce((acc, c) => acc + c.meters, 0)
  const totalKg = byColor.reduce((acc, c) => acc + c.kg, 0)

  return {
    sku: parsed.sku,
    pieces: safePieces,
    parsed,
    totalMeters,
    totalKg,
    byColor,
  }
}

type ProductionRaffiaRow = {
  sku: string
  timestamp: string
  event: string
  count: number
  unitsPerBox: number
}

type SkuCatalogEntry = { code: string; unitsPerBox: number }

function resolvePieces(row: ProductionRaffiaRow, catalog: SkuCatalogEntry[]): number {
  const boxes = Number(row.count)
  if (!Number.isFinite(boxes) || boxes <= 0) return 0
  let upb = Number(row.unitsPerBox)
  if (!Number.isFinite(upb) || upb <= 0) {
    const hit = catalog.find((s) => normalizeSkuCode(s.code) === normalizeSkuCode(row.sku))
    upb = hit?.unitsPerBox ?? 0
  }
  if (!Number.isFinite(upb) || upb <= 0) return 0
  return boxes * upb
}

export function aggregateRaffiaYearConsumption(
  rows: ProductionRaffiaRow[],
  options: { year?: number; catalog?: SkuCatalogEntry[] } = {},
): RaffiaYearSummary {
  const year = options.year ?? new Date().getFullYear()
  const catalog = options.catalog ?? []

  const yearStart = new Date(`${year}-01-01T00:00:00`)
  const yearEnd = new Date(`${year}-12-31T23:59:59.999`)

  const colorAgg = new Map<string, RaffiaColorConsumption>()
  const skuAgg = new Map<
    string,
    {
      pieces: number
      meters: number
      kg: number
      parsed: ParsedHookSku
    }
  >()

  let totalKg = 0
  let totalMeters = 0
  let parsedSkuCount = 0
  let unrecognizedSkuCount = 0

  for (const row of rows) {
    if (row.event !== "Producción") continue
    const ts = new Date(row.timestamp)
    if (Number.isNaN(ts.getTime()) || ts < yearStart || ts > yearEnd) continue

    const skuRaw = row.sku?.trim()
    if (!skuRaw || skuRaw === "—") {
      unrecognizedSkuCount++
      continue
    }

    const parsed = parseHookSkuFromCode(skuRaw)
    if (!parsed) {
      unrecognizedSkuCount++
      continue
    }

    const pieces = resolvePieces(row, catalog)
    if (pieces <= 0) continue

    const contrib = computeRaffiaForPieces(parsed, pieces)
    parsedSkuCount++
    totalKg += contrib.totalKg
    totalMeters += contrib.totalMeters

    for (const c of contrib.byColor) {
      const prev = colorAgg.get(c.colorCode) ?? {
        colorCode: c.colorCode,
        colorLabel: c.colorLabel,
        meters: 0,
        kg: 0,
      }
      prev.meters += c.meters
      prev.kg += c.kg
      colorAgg.set(c.colorCode, prev)
    }

    const skuKey = parsed.sku
    const prevSku = skuAgg.get(skuKey) ?? { pieces: 0, meters: 0, kg: 0, parsed }
    prevSku.pieces += pieces
    prevSku.meters += contrib.totalMeters
    prevSku.kg += contrib.totalKg
    skuAgg.set(skuKey, prevSku)
  }

  return {
    year,
    totalKg,
    totalMeters,
    parsedSkuCount,
    unrecognizedSkuCount,
    byColor: [...colorAgg.values()].sort((a, b) => b.kg - a.kg),
    bySku: [...skuAgg.entries()]
      .map(([sku, v]) => ({
        sku,
        pieces: v.pieces,
        meters: v.meters,
        kg: v.kg,
        rafiaMKg: v.parsed.rafiaMKg,
        totalMetersPerPiece: v.parsed.totalMeters,
        colors: v.parsed.colorCodes.map((c) => COLOR_CODE_TO_LABEL[c] ?? c),
      }))
      .sort((a, b) => b.kg - a.kg),
  }
}

export function formatRaffiaKg(kg: number): string {
  if (!Number.isFinite(kg) || kg <= 0) return "0 kg"
  if (kg >= 1000) return `${(kg / 1000).toLocaleString("es-MX", { maximumFractionDigits: 2 })} t`
  return `${kg.toLocaleString("es-MX", { maximumFractionDigits: 1 })} kg`
}
