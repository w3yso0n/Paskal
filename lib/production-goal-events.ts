import type { ApiProductionEvent } from "@/lib/api"
import { productionShiftFromMeasuredAt } from "@/lib/tablero-operator-goal"

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

/** Producción pendiente sin check-in (no cuenta en dashboards hasta asignarse). */
export function isOrphanProductionEvent(event: ApiProductionEvent): boolean {
  return (event.eventType ?? "").trim().toUpperCase() === "ORPHAN_PROD"
}

/**
 * Producción que cuenta para operador / gráficas / metas.
 * Excluye ORPHAN_PROD pendiente y ajustes legacy (attributedFrom).
 */
export function countsAsOperatorProduction(event: ApiProductionEvent): boolean {
  if (isOrphanProductionEvent(event)) return false
  const payload = event.payload ?? {}
  const eventRaw = String(
    payloadString(payload, "EVENT", "event") ?? event.eventType ?? "",
  ).trim().toUpperCase()
  if (eventRaw !== "PROD" && event.eventType?.trim().toUpperCase() !== "PROD") {
    return false
  }
  const attr = payload["attributedFrom"] as string | undefined
  if (attr === "orphan" || attr === "packager_orphan") return false
  return true
}

/** Suma piezas ORPHAN_PROD pendientes de un episodio (alerta). */
export function sumOrphanPendingForAlert(
  events: ApiProductionEvent[],
  alertId: string,
): number {
  let sum = 0
  for (const e of events) {
    if (!isOrphanProductionEvent(e)) continue
    const p = e.payload ?? {}
    if (p["assignmentStatus"] !== "pending") continue
    if (p["orphanAlertId"] !== alertId) continue
    const u = Number(p["units"] ?? 0)
    if (Number.isFinite(u) && u > 0) sum += u
  }
  return sum
}

/** Piezas pendientes en alertas de producción sin empacador (mensaje de la alerta). */
export function parsePendingUnitsFromAlertMessage(
  message: string | null | undefined,
): number {
  if (!message?.trim()) return 0
  const m = message.match(/(\d+)\s*piezas/i)
  const n = m ? Number(m[1]) : 0
  return Number.isFinite(n) && n > 0 ? n : 0
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
  if (isOrphanProductionEvent(event)) return 0

  const payload = event.payload ?? {}
  const eventRaw = String(payloadString(payload, "EVENT", "event") ?? event.eventType ?? "")
  if (!isProductionMetricEventType(eventRaw) && !isProductionMetricEventType(event.eventType)) {
    return 0
  }
  if (!countsAsOperatorProduction(event) && event.eventType?.trim().toUpperCase() === "PROD") {
    return 0
  }

  const unitsDirect = payload["units"]
  if (unitsDirect != null && (event.eventType === "PROD" || eventRaw === "PROD")) {
    const asNum = typeof unitsDirect === "number" ? unitsDirect : Number(unitsDirect)
    if (Number.isFinite(asNum) && asNum > 0) return asNum
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

export type ProductionAggregateFilters = {
  machineId?: string | null
  from?: string
  to?: string
  /** Si true, `to` es exclusivo (>= from && < to). Por defecto inclusivo (<= to). */
  toExclusive?: boolean
  shift?: "matutino" | "vespertino" | null
  sku?: string | null
  machineSkuById?: Map<string, string>
  machineUpbById?: Map<string, number>
}

function eventMatchesProductionAggregate(
  e: ApiProductionEvent,
  filters: ProductionAggregateFilters,
): boolean {
  if (!countsAsOperatorProduction(e)) return false
  if (filters.machineId && e.machineId !== filters.machineId) return false
  if (filters.from && e.occurredAt < filters.from) return false
  if (filters.to) {
    if (filters.toExclusive) {
      if (e.occurredAt >= filters.to) return false
    } else if (e.occurredAt > filters.to) {
      return false
    }
  }
  if (filters.shift && productionShiftFromMeasuredAt(e.occurredAt) !== filters.shift) {
    return false
  }
  if (filters.sku) {
    const goalSku = filters.sku.trim().toLowerCase()
    const eventSku = resolveProductionEventSku(e, filters.machineSkuById)?.trim().toLowerCase()
    if (eventSku !== goalSku) return false
  }
  return productionUnitsFromEvent(e, filters.machineUpbById) > 0
}

/** Suma piezas contables para metas/dashboards — única fuente de verdad. */
export function sumProductionUnitsInRange(
  events: ApiProductionEvent[],
  filters: ProductionAggregateFilters,
): number {
  let sum = 0
  for (const e of events) {
    if (!eventMatchesProductionAggregate(e, filters)) continue
    sum += productionUnitsFromEvent(e, filters.machineUpbById)
  }
  return sum
}
