import type { ApiAlert, ApiProductionEvent } from "@/lib/api"
import type { Alert, AlertCategory, AlertType } from "@/lib/types"
import {
  parsePendingUnitsFromAlertMessage,
  sumOrphanPendingForAlert,
} from "@/lib/production-goal-events"

/** Convierte alerta API → modelo UI del centro de alertas y la campanita. */
export function mapApiAlertToUi(
  a: ApiAlert,
  productionEvents: ApiProductionEvent[] = [],
): Alert {
  const type: AlertType =
    a.severity === "critical"
      ? "error"
      : a.severity === "high"
        ? "warning"
        : a.severity === "low"
          ? "info"
          : "warning"

  const category: AlertCategory = a.machineId != null ? "machine" : "system"

  const timestamp = new Date(a.createdAt)
  const isOperatorOrphan = a.title.startsWith("Producción sin check-in")
  const isPackagerOrphan = a.title.startsWith("Producción sin empacador")
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
