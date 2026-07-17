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
import { PLANT_TIMEZONE } from "@/lib/tablero-operator-goal"

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
  // no_checkin: suma real por eventos ORPHAN_PROD cuando hay `productionEvents` a mano — se
  // CONFIA en ese cálculo tal cual, incluyendo un 0 real (alerta ya atribuida, o cerrada por
  // límite de turno sin nada pendiente): el mensaje de texto NUNCA se limpia al cerrar la
  // alerta, así que antes un 0 real caía por `||` al mensaje viejo y una alerta ya atribuida
  // resucitaba como pendiente (bug reportado: M-016 seguía ofreciendo "Asignar" para piezas ya
  // atribuidas). Solo se cae al mensaje cuando NO se cargaron eventos (p. ej. la campana de
  // notificaciones, que ya no descarga 1500 eventos solo para esto) y la alerta sigue activa —
  // un episodio cerrado por límite de turno puede seguir teniendo piezas reales pendientes de
  // atribuir (quedan ligadas a la alerta cerrada, ver `closeOrphanEpisode`), así que ese caso
  // sigue detectándose vía la suma real de eventos, nunca vía el mensaje de una alerta cerrada.
  const orphanPending = isOperatorOrphan
    ? productionEvents.length > 0
      ? sumOrphanPendingForAlert(productionEvents, a.id)
      : a.status !== "closed"
        ? parsePendingUnitsFromAlertMessage(a.message)
        : 0
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
    metadata: a.metadata ?? null,
    timestamp: Number.isNaN(timestamp.getTime()) ? new Date() : timestamp,
    isRead,
    machineId: a.machineId ?? undefined,
    actionRequired,
  }
}

// --- Detalle estructurado por causa (metadata) ------------------------------

/** Hora en zona de planta, "HH:mm". Null si el ISO no es válido. */
function formatPlantTime(iso: unknown): string | null {
  if (typeof iso !== "string" || !iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: PLANT_TIMEZONE,
  })
}

/** "1 h 13 min" a partir de minutos. Null si no es un número usable. */
function formatMinutesLabel(minutes: unknown): string | null {
  if (typeof minutes !== "number" || !Number.isFinite(minutes)) return null
  const total = Math.max(0, Math.round(minutes))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : []
}

export type AlertDetailRow = { label: string; value: string }

/**
 * Filas de detalle estructurado, específicas de cada causa — lo que se muestra al expandir
 * una alerta ("a qué hora hizo check-in", "quién quedó asignado", etc.), separado del mensaje
 * de texto libre. Defensivo: `metadata` es JSON crudo del backend, puede faltar o venir viejo
 * (alertas creadas antes de esta migración no tienen metadata).
 */
export function buildAlertDetailRows(
  kind: ApiAlertKind,
  metadata: Record<string, unknown> | null | undefined,
): AlertDetailRow[] {
  if (!metadata) return []
  const rows: AlertDetailRow[] = []

  switch (kind) {
    case "idle": {
      const operator = asString(metadata.operator)
      const operator2 = asString(metadata.operator2)
      if (operator) rows.push({ label: "Operador", value: operator })
      if (operator2) rows.push({ label: "2º operador", value: operator2 })
      const sku = asString(metadata.sku)
      if (sku) rows.push({ label: "SKU", value: sku })
      const checkedInAt = formatPlantTime(metadata.checkedInAt)
      if (checkedInAt) rows.push({ label: "Check-in", value: checkedInAt })
      const lastProductionAt = formatPlantTime(metadata.lastProductionAt)
      if (lastProductionAt) rows.push({ label: "Última producción", value: lastProductionAt })
      const idleMinutes = formatMinutesLabel(metadata.idleMinutes)
      if (idleMinutes) rows.push({ label: "Tiempo sin producir", value: idleMinutes })
      break
    }
    case "no_checkout": {
      const personnel = asStringArray(metadata.personnel)
      if (personnel.length) rows.push({ label: "Personal asignado", value: personnel.join(", ") })
      const checkedInAt = formatPlantTime(metadata.checkedInAt)
      if (checkedInAt) rows.push({ label: "Check-in", value: checkedInAt })
      const lastSeenAt = formatPlantTime(metadata.lastSeenAt)
      if (lastSeenAt) rows.push({ label: "Última señal", value: lastSeenAt })
      break
    }
    case "plant_outage": {
      const machineCodes = asStringArray(metadata.machineCodes)
      if (machineCodes.length) rows.push({ label: "Máquinas afectadas", value: machineCodes.join(", ") })
      if (typeof metadata.totalOfflineNow === "number") {
        rows.push({ label: "Total caídas ahora", value: String(metadata.totalOfflineNow) })
      }
      break
    }
    case "checkin_blocked": {
      const role = asString(metadata.role)
      if (role) rows.push({ label: "Rol", value: role })
      const rejectedName = asString(metadata.rejectedName)
      if (rejectedName) rows.push({ label: "Tap rechazado", value: rejectedName })
      const occupyingName = asString(metadata.occupyingName)
      if (occupyingName) rows.push({ label: "Sigue registrado", value: occupyingName })
      break
    }
    case "overtime_hours": {
      const violators = Array.isArray(metadata.violators) ? metadata.violators : []
      for (const raw of violators) {
        if (typeof raw !== "object" || raw === null) continue
        const v = raw as Record<string, unknown>
        const name = asString(v.name) ?? asString(v.code) ?? "—"
        const checkedInAt = formatPlantTime(v.checkedInAt)
        const worked = formatMinutesLabel(v.workedMinutes)
        const limit = formatMinutesLabel(v.limitMinutes)
        const shiftLabel = asString(v.shiftLabel)
        const parts: string[] = []
        if (checkedInAt) parts.push(`check-in ${checkedInAt}`)
        if (worked) parts.push(`lleva ${worked}`)
        if (limit) parts.push(`límite ${limit}${shiftLabel ? ` (turno ${shiftLabel})` : ""}`)
        if (v.pastShiftEnd) parts.push("después de su turno")
        rows.push({ label: name, value: parts.join(" · ") || "—" })
      }
      break
    }
    case "counter_not_zero": {
      const operatorCode = asString(metadata.operatorCode)
      if (operatorCode) rows.push({ label: "Operador", value: operatorCode })
      const checkedInAt = formatPlantTime(metadata.checkedInAt)
      if (checkedInAt) rows.push({ label: "Check-in", value: checkedInAt })
      if (typeof metadata.countAtCheckin === "number") {
        rows.push({ label: "Contador al check-in", value: String(metadata.countAtCheckin) })
      }
      if (typeof metadata.countAtCheckout === "number") {
        rows.push({ label: "Contador al check-out anterior", value: String(metadata.countAtCheckout) })
      }
      break
    }
    case "counter_reset": {
      if (typeof metadata.from === "number" && typeof metadata.to === "number") {
        rows.push({ label: "De → a", value: `${metadata.from} → ${metadata.to}` })
      }
      const operators = asStringArray(metadata.operators)
      if (operators.length) rows.push({ label: "Operador(es)", value: operators.join(", ") })
      break
    }
    default:
      break
  }

  return rows
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
