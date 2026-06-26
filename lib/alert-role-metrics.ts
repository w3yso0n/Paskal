import type { ApiAlert } from "@/lib/api"

export type AlertPersonnelRole = "operator" | "packager" | "other"

export type AlertRoleCounts = {
  operator: number
  packager: number
  other: number
  total: number
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
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T23:59:59.999`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return alerts

  return alerts.filter((a) => {
    const created = new Date(a.createdAt)
    if (Number.isNaN(created.getTime())) return false
    return created >= start && created <= end
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
