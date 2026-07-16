import {
  Ban,
  CircleHelp,
  Hourglass,
  LogOut,
  PackageX,
  PauseCircle,
  RotateCcw,
  RotateCw,
  UserX,
  WifiOff,
  type LucideIcon,
} from "lucide-react"
import type { ApiAlert, ApiAlertKind, ApiAlertSeverity, ApiProductionEvent } from "@/lib/api"
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
  "checkin_blocked",
  "overtime_hours",
  "plant_outage",
  "counter_not_zero",
  "counter_reset",
  "device_down",
  "other",
])

/** Etiquetas legibles por causa — alineadas con los títulos que genera el backend. */
export const ALERT_KIND_LABELS: Record<ApiAlertKind, string> = {
  no_checkin: "Producción sin check-in",
  no_packager: "Producción sin empacador",
  idle: "Paro / inactividad",
  no_checkout: "Sin check-out",
  checkin_blocked: "Falta check-out (tap rechazado)",
  overtime_hours: "Horas de trabajo excedidas",
  plant_outage: "Corte de conectividad",
  counter_not_zero: "Contador no en cero",
  counter_reset: "Contador reseteado en turno",
  device_down: "Equipo caído",
  other: "Otra",
}

/**
 * Símbolo fijo por causa — identidad, nunca color (el color lo lleva la gravedad). Mismo
 * ícono en el centro de alertas y en la campanita para que sea un solo lenguaje visual.
 */
export const ALERT_KIND_ICONS: Record<ApiAlertKind, LucideIcon> = {
  idle: PauseCircle,
  no_checkin: UserX,
  no_packager: PackageX,
  overtime_hours: Hourglass,
  no_checkout: LogOut,
  checkin_blocked: Ban,
  plant_outage: WifiOff,
  counter_not_zero: RotateCcw,
  counter_reset: RotateCw,
  device_down: WifiOff,
  other: CircleHelp,
}

/** Explicación fija de qué significa cada causa — independiente del mensaje dinámico (que trae
 * los números del caso concreto). Se muestra bajo demanda ("Más info"), no en la fila colapsada. */
export const ALERT_KIND_EXPLAINERS: Record<ApiAlertKind, string> = {
  idle: "La máquina está en verde (con operador y SKU) pero no ha producido en el tiempo esperado.",
  no_checkin: "Hay producción registrada pero nadie hizo check-in (o falta el SKU) en la máquina.",
  no_packager: "La máquina está en verde produciendo, pero no hay empacadora asignada.",
  overtime_hours: "La persona sigue en check-in después de exceder las horas reguladas de su turno.",
  no_checkout: "La máquina se apagó o perdió conexión sin que el personal asignado hiciera check-out.",
  checkin_blocked: "Alguien intentó tapear pero la ranura de su rol sigue ocupada por otra persona.",
  plant_outage:
    "Varias máquinas cayeron casi al mismo tiempo — probable falla de red, no apagados individuales.",
  counter_not_zero: "El operador entró sin resetear el contador físico de la máquina a cero.",
  counter_reset: "Registro informativo: alguien reseteó el contador a media sesión. No requiere acción.",
  device_down: "El equipo dejó de reportar señal.",
  other: "Alerta sin causa específica registrada.",
}

/** Orden del filtro por causa en el centro de alertas (sin tipos legacy que ya no se generan). */
export const ALERT_KIND_FILTER_ORDER: ApiAlertKind[] = [
  "idle",
  "no_checkin",
  "no_packager",
  "overtime_hours",
  "no_checkout",
  "checkin_blocked",
  "plant_outage",
  "counter_not_zero",
  "counter_reset",
]

const ALERT_KIND_CATEGORY: Record<ApiAlertKind, AlertCategory> = {
  no_checkin: "production",
  no_packager: "production",
  idle: "machine",
  no_checkout: "machine",
  checkin_blocked: "machine",
  overtime_hours: "employee",
  plant_outage: "system",
  counter_not_zero: "machine",
  counter_reset: "machine",
  device_down: "machine",
  other: "system",
}

function inferKindFromTitle(title: string): ApiAlertKind {
  if (title.startsWith("Producción sin check-in")) return "no_checkin"
  if (title.startsWith("Producción sin empacador")) return "no_packager"
  if (title.startsWith("Paro / inactividad")) return "idle"
  if (title.startsWith("Sin check-out")) return "no_checkout"
  if (title.startsWith("Falta check-out")) return "checkin_blocked"
  if (title.startsWith("Horas de trabajo excedidas")) return "overtime_hours"
  if (title.startsWith("Posible corte de conectividad")) return "plant_outage"
  if (title.startsWith("Contador no inició en 0")) return "counter_not_zero"
  if (title.startsWith("Contador reseteado en turno")) return "counter_reset"
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
    case "checkin_blocked":
    case "no_checkin":
    case "no_packager":
    case "counter_not_zero":
      return "warning"
    case "counter_reset":
      return "info"
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
  // no_checkin: suma real por eventos ORPHAN_PROD cuando hay `productionEvents` a mano; si no
  // (p. ej. la campana de notificaciones, que ya no descarga 1500 eventos solo para esto), cae
  // al mismo mensaje que ya trae el total ("N piezas huérfanas pendientes de atribuir").
  const orphanPending = isOperatorOrphan
    ? sumOrphanPendingForAlert(productionEvents, a.id) || parsePendingUnitsFromAlertMessage(a.message)
    : isPackagerOrphan && a.status === "open"
      ? parsePendingUnitsFromAlertMessage(a.message)
      : 0
  const isRead = a.status !== "open" && orphanPending === 0
  const actionRequired = a.status === "open" || orphanPending > 0

  return {
    id: a.id,
    type,
    kind,
    severity: a.severity,
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

/**
 * Estilos por GRAVEDAD real (no por la causa) — canal separado del ícono de causa. "Crítica"
 * reutiliza el mismo rojo que ya usa la plataforma para acciones destructivas; el resto es una
 * extensión coherente de ese mismo tono (rampa ordenada, nunca arcoíris). Todas las clases
 * traen su variante `dark:` — antes los colores de alertas solo se veían bien en modo claro.
 */
export const ALERT_SEVERITY_STYLES: Record<
  ApiAlertSeverity,
  { label: string; border: string; chipBg: string; chipText: string; dot: string; rowTint: string }
> = {
  low: {
    label: "Baja",
    border: "border-l-slate-400 dark:border-l-slate-500",
    chipBg: "bg-slate-100 dark:bg-slate-800/60",
    chipText: "text-slate-600 dark:text-slate-300",
    dot: "bg-slate-400 dark:bg-slate-400",
    rowTint: "bg-slate-50 dark:bg-slate-900/30",
  },
  medium: {
    label: "Media",
    border: "border-l-amber-400 dark:border-l-amber-500",
    chipBg: "bg-amber-100 dark:bg-amber-900/40",
    chipText: "text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500",
    rowTint: "bg-amber-50 dark:bg-amber-950/20",
  },
  high: {
    label: "Alta",
    border: "border-l-orange-500 dark:border-l-orange-400",
    chipBg: "bg-orange-100 dark:bg-orange-900/40",
    chipText: "text-orange-700 dark:text-orange-300",
    dot: "bg-orange-500",
    rowTint: "bg-orange-50 dark:bg-orange-950/20",
  },
  critical: {
    label: "Crítica",
    border: "border-l-red-500 dark:border-l-red-400",
    chipBg: "bg-red-100 dark:bg-red-900/40",
    chipText: "text-red-700 dark:text-red-300",
    dot: "bg-red-500",
    rowTint: "bg-red-50 dark:bg-red-950/20",
  },
}

/** Orden para el listado del centro de alertas: gravedad real, no el bucket visual (antes
 * `overtime_hours`, siempre `critical` en el backend, ordenaba POR DEBAJO de un `idle` alto
 * porque el bucket visual los agrupaba distinto — con la gravedad real ya no pasa). */
export const ALERT_SEVERITY_RANK: Record<ApiAlertSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
}
