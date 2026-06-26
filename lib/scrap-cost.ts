import type { AlertThresholdsConfig } from "@/lib/business-rules"
import { SCRAP_MATERIALS, type ScrapMaterialKey } from "@/lib/data-capture-config"

export function scrapMaterialLabel(sourceKey: string): string {
  const found = SCRAP_MATERIALS.find((m) => m.key === sourceKey)
  if (found) return found.label
  if (sourceKey === "scrap-total") return "Scrap general"
  return sourceKey
}

export function scrapCostPerKgMxn(
  sourceKey: string,
  thresholds: Pick<AlertThresholdsConfig, "scrapMetalCostPerKgMxn" | "scrapTwineCostPerKgMxn">,
): number {
  if (sourceKey === "scrap-metal") return thresholds.scrapMetalCostPerKgMxn
  if (sourceKey === "scrap-twine") return thresholds.scrapTwineCostPerKgMxn
  return 0
}

export function computeScrapCostMxn(
  kg: number | null | undefined,
  sourceKey: string,
  thresholds: Pick<AlertThresholdsConfig, "scrapMetalCostPerKgMxn" | "scrapTwineCostPerKgMxn">,
): number {
  const qty = Number(kg)
  if (!Number.isFinite(qty) || qty <= 0) return 0
  const rate = scrapCostPerKgMxn(sourceKey, thresholds)
  if (!Number.isFinite(rate) || rate <= 0) return 0
  return qty * rate
}

export function formatScrapCostMxn(amount: number): string {
  return amount.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  })
}

export function isScrapMaterialKey(key: string): key is ScrapMaterialKey {
  return SCRAP_MATERIALS.some((m) => m.key === key)
}
