import type { ScrapMaterialConfig } from "./shared/scrap/scrap-types"
import {
  computeScrapGrossCostMxn,
  computeScrapRecoveryMxn,
  computeScrapNetLossMxn,
  getScrapMaterialConfig,
  roundMxn,
} from "./shared/scrap/scrap-calculations"
import { SCRAP_MATERIALS } from "@/lib/data-capture-config"

export type { ScrapMaterialConfig }

export function scrapMaterialLabel(
  sourceKey: string,
  materials?: ScrapMaterialConfig[],
): string {
  if (materials?.length) {
    const m = getScrapMaterialConfig(sourceKey, materials)
    if (m) return m.name
  }
  const found = SCRAP_MATERIALS.find((m) => m.key === sourceKey)
  if (found) return found.label
  if (sourceKey === "scrap-total") return "Scrap general"
  return sourceKey
}

export function scrapCostPerKgMxn(
  sourceKey: string,
  materials: ScrapMaterialConfig[] = [],
): number {
  const m = getScrapMaterialConfig(sourceKey, materials)
  const rate = m?.costPerKgMxn ?? 0
  return rate > 0 ? roundMxn(rate) : 0
}

export function scrapSalePricePerKgMxn(
  sourceKey: string,
  materials: ScrapMaterialConfig[] = [],
): number {
  const m = getScrapMaterialConfig(sourceKey, materials)
  const rate = m?.scrapSalePricePerKgMxn ?? 0
  return rate > 0 ? roundMxn(rate) : 0
}

export function computeScrapCostMxn(
  kg: number | null | undefined,
  sourceKey: string,
  materials: ScrapMaterialConfig[] = [],
): number {
  const rate = scrapCostPerKgMxn(sourceKey, materials)
  return computeScrapGrossCostMxn(Number(kg), rate)
}

export function computeScrapRecoveryForMaterial(
  kg: number | null | undefined,
  sourceKey: string,
  materials: ScrapMaterialConfig[] = [],
): number {
  const rate = scrapSalePricePerKgMxn(sourceKey, materials)
  return computeScrapRecoveryMxn(Number(kg), rate)
}

export function computeScrapNetLossForMaterial(
  kg: number | null | undefined,
  sourceKey: string,
  materials: ScrapMaterialConfig[] = [],
): number {
  const gross = computeScrapCostMxn(kg, sourceKey, materials)
  const recovery = computeScrapRecoveryForMaterial(kg, sourceKey, materials)
  return computeScrapNetLossMxn(gross, recovery)
}

export function formatScrapCostMxn(amount: number): string {
  return amount.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  })
}

export function isScrapMaterialKey(key: string): boolean {
  return SCRAP_MATERIALS.some((m) => m.key === key) || key.startsWith("scrap-")
}
