import type { ApiAlert, ApiAlertKind } from "@/lib/api"
import { ALERT_KIND_LABELS, resolveAlertKind } from "@/lib/alert-ui"
import { getPartsInTimeZone, makeZonedDate, plantDateOnlyRangeToIso } from "@/lib/shift-timezone"
import { PLANT_TIMEZONE } from "@/lib/tablero-operator-goal"

export type AlertPersonnelRole = "operator" | "packager" | "other"

export type AlertRoleCounts = {
  operator: number
  packager: number
  other: number
  total: number
}

/** Colores distintos por causa de alerta (gráfica de métricas). */
export const ALERT_KIND_CHART_COLORS: Record<ApiAlertKind, string> = {
  idle: "#f97316",
  no_checkin: "#2563eb",
  no_packager: "#8b5cf6",
  overtime_hours: "#eab308",
  no_checkout: "#14b8a6",
  checkin_blocked: "#f43f5e",
  plant_outage: "#ef4444",
  counter_not_zero: "#06b6d4",
  counter_reset: "#0ea5e9",
  device_down: "#64748b",
  other: "#94a3b8",
}

export type AlertsByKindDailyRow = {
  date: string
  total: number
} & Partial<Record<ApiAlertKind, number>>

export type AlertsByKindDailySeries = {
  series: AlertsByKindDailyRow[]
  kindsInRange: ApiAlertKind[]
  total: number
}

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

/** Día calendario en zona de planta (no la del navegador) — evita que un turno se parta distinto. */
export function dayKeyFromDate(d: Date): string {
  const p = getPartsInTimeZone(d, PLANT_TIMEZONE)
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`
}

/** Orden preferido de causas (coincide con el filtro del centro de alertas) — compartido por
 * todas las vistas que apilan/ordenan por tipo, para que el orden nunca diverja entre ellas. */
export const ALERT_KIND_PREFERRED_ORDER: ApiAlertKind[] = [
  "idle",
  "no_checkin",
  "no_packager",
  "overtime_hours",
  "no_checkout",
  "checkin_blocked",
  "plant_outage",
  "counter_not_zero",
  "counter_reset",
  "device_down",
  "other",
]

/** Suma/resta días calendario a un `YYYY-MM-DD`, en zona de planta (p. ej. rango "últimos N días"). */
export function addPlantDays(dayKey: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey.trim())
  if (!m) return dayKey
  const [, y, mo, d] = m
  const anchor = makeZonedDate(Number(y), Number(mo), Number(d), 12, 0, PLANT_TIMEZONE)
  const shifted = new Date(anchor.getTime() + days * 24 * 60 * 60 * 1000)
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PLANT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(shifted)
}

/**
 * Serie diaria de alertas apiladas por tipo (`ApiAlert.type` / causa resuelta).
 * Solo incluye días con al menos una alerta en el rango.
 */
export function buildDailyAlertsByKindSeries(
  alerts: ApiAlert[],
  startDate: string,
  endDate: string,
): AlertsByKindDailySeries {
  const scoped = filterAlertsInDateRange(alerts, startDate, endDate)
  const dailyAgg = new Map<string, Partial<Record<ApiAlertKind, number>>>()
  const kindTotals = new Map<ApiAlertKind, number>()

  for (const alert of scoped) {
    const created = new Date(alert.createdAt)
    if (Number.isNaN(created.getTime())) continue
    const kind = resolveAlertKind(alert)
    const day = dayKeyFromDate(created)
    const row = dailyAgg.get(day) ?? {}
    row[kind] = (row[kind] ?? 0) + 1
    dailyAgg.set(day, row)
    kindTotals.set(kind, (kindTotals.get(kind) ?? 0) + 1)
  }

  const kindsInRange = (
    Object.keys(ALERT_KIND_LABELS) as ApiAlertKind[]
  ).filter((k) => (kindTotals.get(k) ?? 0) > 0)

  // Preferir el orden de filtro del centro de alertas cuando esté presente.
  kindsInRange.sort(
    (a, b) => ALERT_KIND_PREFERRED_ORDER.indexOf(a) - ALERT_KIND_PREFERRED_ORDER.indexOf(b),
  )

  const series: AlertsByKindDailyRow[] = [...dailyAgg.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, counts]) => {
      let total = 0
      const row: AlertsByKindDailyRow = { date: date.slice(5), total: 0 }
      for (const kind of kindsInRange) {
        const n = counts[kind] ?? 0
        row[kind] = n
        total += n
      }
      row.total = total
      return row
    })

  return {
    series,
    kindsInRange,
    total: scoped.length,
  }
}

export function buildAlertsByKindChartConfig(
  kinds: ApiAlertKind[],
): Record<string, { label: string; color: string }> {
  const config: Record<string, { label: string; color: string }> = {}
  for (const kind of kinds) {
    config[kind] = {
      label: ALERT_KIND_LABELS[kind],
      color: ALERT_KIND_CHART_COLORS[kind],
    }
  }
  return config
}

/** Clasifica una alerta como de operador, empacador u otra categoría. */
export function classifyAlertPersonnelRole(alert: ApiAlert): AlertPersonnelRole {
  const title = alert.title.trim().toLowerCase()
  const message = (alert.message ?? "").trim().toLowerCase()
  const combined = `${title} ${message}`

  if (title.includes("sin empacador") || message.includes("sin empacador")) {
    return "packager"
  }

  if (
    title.includes("sin check-in") ||
    title.includes("contador no inició en 0") ||
    title.includes("contador no inicio en 0") ||
    combined.includes("alert_no_checkin") ||
    combined.includes("operario registrado") ||
    combined.includes("sin operador")
  ) {
    return "operator"
  }

  return "other"
}

export function countAlertsByPersonnelRole(alerts: ApiAlert[]): AlertRoleCounts {
  let operator = 0
  let packager = 0
  let other = 0

  for (const alert of alerts) {
    const role = classifyAlertPersonnelRole(alert)
    if (role === "operator") operator++
    else if (role === "packager") packager++
    else other++
  }

  return { operator, packager, other, total: alerts.length }
}

export function filterAlertsInDateRange(
  alerts: ApiAlert[],
  startDate: string,
  endDate: string,
): ApiAlert[] {
  const bounds = plantDateOnlyRangeToIso(startDate, endDate, PLANT_TIMEZONE)
  if (!bounds) return alerts
  const startMs = new Date(bounds.from).getTime()
  const endExclusiveMs = new Date(bounds.toExclusive).getTime()

  return alerts.filter((a) => {
    const created = new Date(a.createdAt)
    if (Number.isNaN(created.getTime())) return false
    const t = created.getTime()
    return t >= startMs && t < endExclusiveMs
  })
}

/** Cuenta eventos PLC `ALERT_NO_CHECKIN` (operador) en filas de producción del rango. */
export function countOperatorCheckinAlertEvents(
  rows: Array<{ eventRaw: string; timestamp: string }>,
): number {
  let count = 0
  for (const row of rows) {
    if (row.eventRaw.trim().toUpperCase() !== "ALERT_NO_CHECKIN") continue
    count++
  }
  return count
}

export function buildAlertRoleCounts(input: {
  alerts: ApiAlert[]
  startDate: string
  endDate: string
  productionAlertRows?: Array<{ eventRaw: string; timestamp: string }>
}): AlertRoleCounts {
  const scopedAlerts = filterAlertsInDateRange(input.alerts, input.startDate, input.endDate)
  const fromAlerts = countAlertsByPersonnelRole(scopedAlerts)

  const plcOperatorAlerts = input.productionAlertRows
    ? countOperatorCheckinAlertEvents(input.productionAlertRows)
    : 0

  // Las alertas MQTT de sin check-in se deduplican por máquina; los eventos PLC cuentan cada disparo.
  const operator = Math.max(fromAlerts.operator, plcOperatorAlerts)

  return {
    operator,
    packager: fromAlerts.packager,
    other: fromAlerts.other,
    total: operator + fromAlerts.packager + fromAlerts.other,
  }
}
