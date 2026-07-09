import type { ApiAlert, ApiAlertKind, ApiProductionEvent } from "@/lib/api"
import type { Alert, AlertCategory, AlertType } from "@/lib/types"
import {
  parsePendingUnitsFromAlertMessage,
  sumOrphanPendingForAlert,
} from "@/lib/production-goal-events"

const KNOWN_ALERT_KINDS = new Set<ApiAlertKind>([
  "no_checkin",
  "no_packager",
  "idle",
  "no_checkout",
  "overtime_hours",
  "plant_outage",
  "counter_not_zero",
  "device_down",
  "other",
])

/** Etiquetas legibles por causa — alineadas con los títulos que genera el backend. */
export const ALERT_KIND_LABELS: Record<ApiAlertKind, string> = {
  no_checkin: "Producción sin check-in",
  no_packager: "Producción sin empacador",
  idle: "Paro / inactividad",
  no_checkout: "Sin check-out",
  overtime_hours: "Horas de trabajo excedidas",
  plant_outage: "Corte de conectividad",
  counter_not_zero: "Contador no en cero",
  device_down: "Equipo caído",
  other: "Otra",
}

/** Orden del filtro por causa en el centro de alertas. */
export const ALERT_KIND_FILTER_ORDER: ApiAlertKind[] = [
  "idle",
  "no_checkin",
  "no_packager",
  "overtime_hours",
  "no_checkout",
  "plant_outage",
  "device_down",
  "counter_not_zero",
  "other",
]

const ALERT_KIND_CATEGORY: Record<ApiAlertKind, AlertCategory> = {
  no_checkin: "production",
  no_packager: "production",
  idle: "machine",
  no_checkout: "machine",
  overtime_hours: "employee",
  plant_outage: "system",
  counter_not_zero: "machine",
  device_down: "machine",
  other: "system",
}

function inferKindFromTitle(title: string): ApiAlertKind {
  if (title.startsWith("Producción sin check-in")) return "no_checkin"
  if (title.startsWith("Producción sin empacador")) return "no_packager"
  if (title.startsWith("Paro / inactividad")) return "idle"
  if (title.startsWith("Sin check-out")) return "no_checkout"
  if (title.startsWith("Horas de trabajo excedidas")) return "overtime_hours"
  if (title.startsWith("Posible corte de conectividad")) return "plant_outage"
  if (title.startsWith("Contador no inició en 0")) return "counter_not_zero"
  if (title.startsWith("Equipo caído")) return "device_down"
  return "other"
}

/** Resuelve la causa real de una alerta (campo `type` o título legacy). */
export function resolveAlertKind(
  alert: Pick<ApiAlert, "type" | "title">,
): ApiAlertKind {
  if (alert.type && KNOWN_ALERT_KINDS.has(alert.type)) return alert.type
  return inferKindFromTitle(alert.title)
}

/** Severidad visual según causa — no todo `critical` del API es un “error” de máquina. */
function resolveUiSeverity(alert: ApiAlert, kind: ApiAlertKind): AlertType {
  switch (kind) {
    case "overtime_hours":
    case "no_checkout":
    case "no_checkin":
    case "no_packager":
    case "counter_not_zero":
      return "warning"
    case "idle":
      return alert.severity === "high" || alert.severity === "critical" ? "error" : "warning"
    case "plant_outage":
    case "device_down":
      return "error"
    case "other":
      if (alert.severity === "critical") return "error"
      if (alert.severity === "high") return "warning"
      if (alert.severity === "low") return "info"
      return "warning"
    default:
      return "warning"
  }
}

export function isOperatorOrphanAlertKind(kind: ApiAlertKind): boolean {
  return kind === "no_checkin"
}

export function isPackagerOrphanAlertKind(kind: ApiAlertKind): boolean {
  return kind === "no_packager"
}

/** Convierte alerta API → modelo UI del centro de alertas y la campanita. */
export function mapApiAlertToUi(
  a: ApiAlert,
  productionEvents: ApiProductionEvent[] = [],
): Alert {
  const kind = resolveAlertKind(a)
  const type = resolveUiSeverity(a, kind)
  const category = ALERT_KIND_CATEGORY[kind]

  const timestamp = new Date(a.createdAt)
  const isOperatorOrphan = kind === "no_checkin"
  const isPackagerOrphan = kind === "no_packager"
  const orphanPending = isOperatorOrphan
    ? sumOrphanPendingForAlert(productionEvents, a.id)
    : isPackagerOrphan && a.status === "open"
      ? parsePendingUnitsFromAlertMessage(a.message)
      : 0
  const isRead = a.status !== "open" && orphanPending === 0
  const actionRequired = a.status === "open" || orphanPending > 0

  return {
    id: a.id,
    type,
    kind,
    category,
    title: a.title,
    message: a.message ?? "",
    timestamp: Number.isNaN(timestamp.getTime()) ? new Date() : timestamp,
    isRead,
    machineId: a.machineId ?? undefined,
    actionRequired,
  }
}

export const ALERTS_POLL_MS = 30_000

export const severityRank: Record<AlertType, number> = {
  error: 4,
  warning: 3,
  info: 2,
  success: 1,
}
