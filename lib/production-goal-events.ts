import type { ApiEmployee, ApiGoalShift, ApiProductionEvent } from "@/lib/api"
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

/** Turno asignado por código de empleada (minúsculas). Ver `buildOperatorShiftByCode`. */
export type OperatorShiftByCode = Map<string, ApiGoalShift>

function normalizeShift(value: unknown): ApiGoalShift | null {
  if (value === 1 || value === "1" || value === "matutino") return "matutino"
  if (value === 2 || value === "2" || value === "vespertino") return "vespertino"
  return null
}

function shiftFromCodeMap(value: unknown, code: string): ApiGoalShift | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const map = value as Record<string, unknown>
  return normalizeShift(map[code] ?? map[code.toLowerCase()])
}

/** Turno congelado de una persona dentro del payload histórico del evento. */
export function frozenParticipantShift(
  event: ApiProductionEvent,
  code: string | null | undefined,
  role: "operator" | "packager",
): ApiGoalShift | null {
  const key = code?.trim()
  if (!key) return null
  const payload = event.payload ?? {}
  const rosterSnapshot = payload["rosterSnapshot"] ?? payload["roster_snapshot"]
  if (rosterSnapshot && typeof rosterSnapshot === "object" && !Array.isArray(rosterSnapshot)) {
    const members = (rosterSnapshot as Record<string, unknown>)[
      role === "operator" ? "operators" : "packagers"
    ]
    if (Array.isArray(members)) {
      const match = members.find((member) => {
        if (!member || typeof member !== "object") return false
        const memberCode = String(
          (member as Record<string, unknown>)["employeeCode"] ??
            (member as Record<string, unknown>)["employee_code"] ??
            "",
        )
          .trim()
          .toLowerCase()
        return memberCode === key.toLowerCase()
      })
      if (match && typeof match === "object") {
        const shift = normalizeShift(
          (match as Record<string, unknown>)["assignedShift"] ??
            (match as Record<string, unknown>)["assigned_shift"],
        )
        if (shift) return shift
      }
    }
  }
  const participantMaps = [
    payload["participant_shifts"],
    payload["participantShifts"],
    role === "operator" ? payload["operator_shifts"] : payload["packager_shifts"],
    role === "operator" ? payload["operatorShifts"] : payload["packagerShifts"],
  ]
  for (const value of participantMaps) {
    const direct = shiftFromCodeMap(value, key)
    if (direct) return direct
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = (value as Record<string, unknown>)[`${role}s`]
      const fromNested = shiftFromCodeMap(nested, key)
      if (fromNested) return fromNested
    }
  }
  return null
}

export function frozenParticipantPrimaryRole(
  event: Pick<ApiProductionEvent, "payload">,
  employeeCode: string | null | undefined,
  role: "operator" | "packager",
): string | null {
  const key = employeeCode?.trim().toLowerCase()
  if (!key) return null
  const payload = event.payload ?? {}
  const snapshot = payload["rosterSnapshot"] ?? payload["roster_snapshot"]
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null
  const members = (snapshot as Record<string, unknown>)[
    role === "operator" ? "operators" : "packagers"
  ]
  if (!Array.isArray(members)) return null
  for (const member of members) {
    if (!member || typeof member !== "object") continue
    const data = member as Record<string, unknown>
    const code = String(data.employeeCode ?? data.employee_code ?? "")
      .trim()
      .toLowerCase()
    if (code !== key) continue
    const primaryRole = String(
      data.assignedPrimaryRole ?? data.assigned_primary_role ?? "",
    ).trim()
    return primaryRole || null
  }
  return null
}

/**
 * Mapa código → turno ASIGNADO (employees.shift: 1 = matutino, 2 = vespertino).
 * Indexa por employeeCode y nfcCardUid (en legacy coinciden) en minúsculas.
 */
export function buildOperatorShiftByCode(
  employees: ReadonlyArray<Pick<ApiEmployee, "employeeCode" | "nfcCardUid" | "shift">>,
): OperatorShiftByCode {
  const map: OperatorShiftByCode = new Map()
  for (const emp of employees) {
    const shift: ApiGoalShift | null =
      emp.shift === 1 ? "matutino" : emp.shift === 2 ? "vespertino" : null
    if (!shift) continue
    for (const key of [emp.employeeCode, emp.nfcCardUid]) {
      const k = key?.trim().toLowerCase()
      if (k) map.set(k, shift)
    }
  }
  return map
}

/** Código de la operadora principal del evento (OPERATOR_1 / operators[0]). */
export function eventPrimaryOperatorCode(event: ApiProductionEvent): string | null {
  const payload = event.payload ?? {}
  const direct = payloadString(payload, "OPERATOR_1", "operator_1", "OPERATOR", "operator")
  if (direct) return direct
  const arr = payload["operators"]
  if (Array.isArray(arr)) {
    const first = arr.find((x) => String(x ?? "").trim())
    if (first != null) {
      const s = String(first).trim()
      if (s && s.toLowerCase() !== "null" && s !== "undefined") return s
    }
  }
  return null
}

function codesFromPayloadArray(payload: Record<string, unknown>, key: string): string[] {
  const raw = payload[key]
  if (!Array.isArray(raw)) return []
  return raw
    .map((v) => String(v ?? "").trim())
    .filter((v) => Boolean(v) && v.toLowerCase() !== "null" && v !== "undefined")
}

/**
 * Códigos que reciben crédito de producción para meta de operadora:
 * operadores del evento + empacadores (una operadora de base puede estar en empaque
 * por rol secundario y su producción debe contar igual).
 */
export function eventCodesForOperatorGoalCredit(event: ApiProductionEvent): string[] {
  const payload = event.payload ?? {}
  const out: string[] = []
  const seen = new Set<string>()
  const push = (code: string | null | undefined) => {
    const c = code?.trim()
    if (!c) return
    const key = c.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    out.push(c)
  }

  for (const c of codesFromPayloadArray(payload, "operators")) push(c)
  push(payloadString(payload, "OPERATOR_1", "operator_1", "OPERATOR", "operator"))
  push(payloadString(payload, "OPERATOR_2", "operator_2"))

  for (const c of codesFromPayloadArray(payload, "packagers")) push(c)
  push(payloadString(payload, "PACKAGER_1", "packager_1", "PACKAGER1", "packager1"))
  push(payloadString(payload, "PACKAGER_2", "packager_2", "PACKAGER2", "packager2"))
  push(payloadString(payload, "PACKAGER_3", "packager_3", "PACKAGER3", "packager3"))
  push(payloadString(payload, "PACKAGER_4", "packager_4", "PACKAGER4", "packager4"))

  return out
}

export function eventCreditsPersonForOperatorGoal(
  event: ApiProductionEvent,
  personCode: string,
): boolean {
  const codeLower = personCode.trim().toLowerCase()
  if (!codeLower) return false
  return eventCodesForOperatorGoalCredit(event).some((c) => c.toLowerCase() === codeLower)
}

/**
 * Turno al que pertenece la producción de un evento (regla de negocio 2026-07-15):
 * manda el turno ASIGNADO de la operadora con check-in al momento de producir;
 * si no se conoce (sin mapa, código desconocido o empleada sin turno), fallback al
 * reloj de planta (`productionShiftFromMeasuredAt`: <16:00 matutino, ≥16:00 vespertino).
 */
export function productionShiftForEvent(
  event: ApiProductionEvent,
  operatorShiftByCode?: OperatorShiftByCode | null,
): ApiGoalShift | null {
  const payload = event.payload ?? {}
  const frozenProductionShift = normalizeShift(
    payload["production_shift"] ??
      payload["productionShift"] ??
      payload["assigned_shift"] ??
      payload["assignedShift"],
  )
  if (frozenProductionShift) return frozenProductionShift

  const code = eventPrimaryOperatorCode(event)?.toLowerCase()
  const frozenOperatorShift = frozenParticipantShift(event, code, "operator")
  if (frozenOperatorShift) return frozenOperatorShift

  // Compatibilidad legacy: congela conceptualmente el turno actual conocido. El reloj
  // queda reservado para producción sin persona/check-in.
  const assigned = code ? operatorShiftByCode?.get(code) : undefined
  return assigned ?? productionShiftFromMeasuredAt(event.occurredAt)
}

export type ProductionAggregateFilters = {
  machineId?: string | null
  from?: string
  to?: string
  /** Si true, `to` es exclusivo (>= from && < to). Por defecto inclusivo (<= to). */
  toExclusive?: boolean
  shift?: "matutino" | "vespertino" | null
  /** Turno asignado por operadora; con esto el filtro `shift` sigue a la persona, no al reloj. */
  operatorShiftByCode?: OperatorShiftByCode | null
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
  if (filters.shift && productionShiftForEvent(e, filters.operatorShiftByCode) !== filters.shift) {
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
