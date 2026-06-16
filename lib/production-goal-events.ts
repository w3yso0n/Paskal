import type { ApiProductionEvent } from "@/lib/api"

function payloadString(
  payload: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const v = payload[key]
    if (v === null || v === undefined) continue
    const s = String(v).trim()
    if (s) return s
  }
  return undefined
}

export function skuFromMessage(message: string | null | undefined): string | undefined {
  if (!message?.trim()) return undefined
  const m = message.match(/SKU\s*:\s*([^,]+)/i)
  const raw = m?.[1]?.trim()
  return raw || undefined
}

export function isProductionMetricEventType(eventType: string): boolean {
  const v = (eventType ?? "").trim().toUpperCase()
  return v === "PROD" || v === "BOOT" || v === "SKU_CHANGE"
}

export function resolveProductionEventSku(
  event: ApiProductionEvent,
  machineSkuById?: Map<string, string>,
): string | null {
  const payload = event.payload ?? {}
  const mid = event.machineId?.trim()
  const fromPayload =
    payloadString(payload, "SKU", "sku", "PRODUCT", "product", "PRODUCT_CODE", "product_code") ??
    (mid ? machineSkuById?.get(mid) : undefined) ??
    skuFromMessage(event.message)
  const sku = fromPayload?.trim()
  return sku || null
}

export function productionUnitsFromEvent(
  event: ApiProductionEvent,
  machineUpbById?: Map<string, number>,
): number {
  const payload = event.payload ?? {}
  const eventRaw = String(payloadString(payload, "EVENT", "event") ?? event.eventType ?? "")
  if (!isProductionMetricEventType(eventRaw) && !isProductionMetricEventType(event.eventType)) {
    return 0
  }

  const countRaw =
    (payload["COUNT"] as unknown) ??
    (payload["count"] as unknown) ??
    (payload["units"] as unknown)
  const boxes = typeof countRaw === "number" ? countRaw : Number(countRaw)
  if (!Number.isFinite(boxes) || boxes <= 0) return 0

  const mid = event.machineId?.trim()
  const upbRaw =
    (payload["units_per_box"] as unknown) ??
    (payload["unitsPerBox"] as unknown) ??
    (mid ? machineUpbById?.get(mid) : undefined)
  const unitsPerBox =
    typeof upbRaw === "number" && Number.isFinite(upbRaw) && upbRaw > 0
      ? upbRaw
      : Number(upbRaw) > 0
        ? Number(upbRaw)
        : mid
          ? (machineUpbById?.get(mid) ?? 48)
          : 48

  return boxes * unitsPerBox
}

export function normalizeSku(value: string | null | undefined): string | null {
  const sku = value?.trim()
  return sku ? sku : null
}
