import type { LucideIcon } from "lucide-react"
import {
  AlertTriangle,
  CircleHelp,
  Factory,
  LogIn,
  LogOut,
  Power,
  RotateCcw,
  Tags,
  WifiOff,
  Wrench,
} from "lucide-react"
import type {
  ApiAlert,
  ApiAlertKind,
  ApiAlertSeverity,
  ApiEmployee,
  ApiGoalShift,
  ApiMachine,
  ApiProductionEvent,
} from "@/lib/api"
import {
  ALERT_KIND_ICONS,
  ALERT_KIND_LABELS,
  resolveAlertKind,
} from "@/lib/alert-ui"
import { parsePendingUnitsFromAlertMessage } from "@/lib/production-goal-events"
import { PLANT_TIMEZONE } from "@/lib/tablero-operator-goal"
import { SHIFT_SCHEDULE } from "@/lib/shift-schedule"
import { getPlantDayBoundsForCalendarDate, makeZonedDate } from "@/lib/shift-timezone"
import { eventCodesForOperatorGoalCredit } from "@/lib/production-goal-events"

export type CronologiaMode = "machine" | "operator"
export type CronologiaShift = "all" | "matutino" | "vespertino"

export type TimelineKind =
  | "boot"
  | "offline"
  | "checkin"
  | "checkout"
  | "counter_reset"
  | "sku_change"
  | "maintenance_in"
  | "maintenance_out"
  | "production_span"
  | "orphan_span"
  | "alert"
  | "other"

export interface TimelineBadge {
  label: string
  tone: "warning" | "info" | "neutral"
}

/** Datos para atribuir piezas pendientes desde la cronología (igual que en Alertas). */
export interface TimelineAttribution {
  /** Operador para huérfanas sin check-in; empacador para producción sin empacador. */
  target: "operator" | "packager"
  /** Alerta a la que se ligan las piezas (el backend la usa para cerrar el episodio). */
  alertId: string
  units: number
}

export interface TimelineItem {
  /** Ancla DOM (`tl-…`) para saltar de la banda al detalle. */
  id: string
  kind: TimelineKind
  at: Date
  /** Solo tramos de producción. */
  endAt?: Date
  machineId: string | null
  machineCode?: string
  title: string
  detail?: string
  badges?: TimelineBadge[]
  severity?: ApiAlertSeverity
  alertKind?: ApiAlertKind
  /** Solo alertas: metadata estructurada (para el detalle por causa). */
  alertMetadata?: Record<string, unknown> | null
  /** Solo alertas: cierre (fin del episodio, p. ej. fin del paro). */
  closedAt?: Date | null
  units?: number
  /** Piezas de la máquina acumuladas en el día al cierre de este tramo. */
  cumulativeUnits?: number
  /** Riel de producción del listado: piezas del día acumuladas AL MOMENTO del suceso
   * (según el filtro del modo: máquina = contador de la máquina, operador = lo suyo). */
  unitsSoFar?: number
  /** `false` en volcados atribuidos: no son piezas del contador de la máquina. */
  countsInTotal?: boolean
  /** Si trae valor, se puede atribuir estas piezas desde la cronología. */
  attribution?: TimelineAttribution
  /** Este item (volcado de atribución) resuelve la alerta con este id. */
  resolvesAlertId?: string
  /** Autoría del volcado manual: usuario de plataforma que atribuyó. */
  attributedByUser?: string
  /** Esta alerta fue resuelta por una atribución ('auto' | 'manual'). */
  resolvedBy?: "auto" | "manual"
  /** Con `resolvedBy: manual`: usuario de plataforma que hizo la atribución. */
  resolvedByName?: string
  sourceEventIds: string[]
}

/**
 * Identidad visual por tipo de suceso (mismo criterio que `ALERT_KIND_ICONS`: el ícono es la
 * identidad; el color acompaña pero no sustituye). `dotClass` = círculo del listado,
 * `bandClass` = marca/bloque en la banda horizontal.
 */
export const CRONO_CATALOG: Record<
  TimelineKind,
  { label: string; icon: LucideIcon; dotClass: string; bandClass: string }
> = {
  boot: {
    label: "Encendido",
    icon: Power,
    dotClass: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    bandClass: "bg-green-500",
  },
  offline: {
    label: "Sin señal / apagada",
    icon: WifiOff,
    dotClass: "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    bandClass: "bg-slate-400",
  },
  checkin: {
    label: "Check-in",
    icon: LogIn,
    dotClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    bandClass: "bg-blue-500",
  },
  checkout: {
    label: "Check-out",
    icon: LogOut,
    dotClass: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
    bandClass: "bg-sky-400",
  },
  counter_reset: {
    label: "Reset de contador",
    icon: RotateCcw,
    dotClass: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    bandClass: "bg-amber-500",
  },
  sku_change: {
    label: "Cambio de SKU",
    icon: Tags,
    dotClass: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    bandClass: "bg-violet-500",
  },
  maintenance_in: {
    label: "Entra mantenimiento",
    icon: Wrench,
    dotClass: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
    bandClass: "bg-cyan-500",
  },
  maintenance_out: {
    label: "Sale mantenimiento",
    icon: Wrench,
    dotClass: "bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400",
    bandClass: "bg-cyan-400",
  },
  production_span: {
    label: "Producción",
    icon: Factory,
    dotClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    bandClass: "bg-emerald-500",
  },
  orphan_span: {
    label: "Producción sin atribuir",
    icon: AlertTriangle,
    dotClass: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    bandClass: "bg-amber-400",
  },
  alert: {
    label: "Alerta",
    icon: AlertTriangle,
    dotClass: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
    bandClass: "bg-rose-500",
  },
  other: {
    label: "Otro suceso",
    icon: CircleHelp,
    dotClass: "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    bandClass: "bg-slate-400",
  },
}

const SOURCE_LABELS: Record<string, string> = {
  nfc: "NFC",
  platform: "plataforma",
  "tap-out": "tap de salida",
  mqtt: "dispositivo",
  presence: "presencia",
  nightly: "cierre automático de turno",
}

/** Margen antes del turno: el BOOT/reset/check-in ocurre ~06:45, antes del arranque de 07:00. */
const WINDOW_LEAD_MINUTES = 60
/** Margen después del turno: check-out/apagado tardíos. */
const WINDOW_TAIL_MINUTES = 30
/** Hueco máximo entre PRODs para seguir considerándolos el mismo tramo. */
export const SPAN_GAP_MINUTES = 20

export interface CronologiaWindow {
  /** Rango para pedir datos al backend (ISO UTC). */
  from: string
  toExclusive: string
  /** Extremos del eje de la banda (coinciden con el rango pedido: nada queda fuera). */
  bandStart: Date
  bandEnd: Date
}

/** Ventana del día/turno en TZ de planta. OJO: `getShiftBoundsForCalendarDate` NO sirve aquí
 * (son mitades de reloj 00–16/16–24); la ventana real sale de `SHIFT_SCHEDULE` + márgenes. */
export function computeCronologiaWindow(
  dateIso: string,
  shift: CronologiaShift,
): CronologiaWindow | null {
  const [y, m, d] = dateIso.split("-").map((n) => Number(n))
  if (!y || !m || !d) return null

  if (shift === "all") {
    const day = getPlantDayBoundsForCalendarDate(dateIso, PLANT_TIMEZONE)
    // La banda arranca a las 06:00: antes no pasa nada en planta y el eje gana legibilidad.
    // Un suceso de madrugada igual se pide al backend y se "clampa" al borde izquierdo.
    const bandStart = makeZonedDate(y, m, d, 6, 0, PLANT_TIMEZONE)
    return {
      from: day.start.toISOString(),
      toExclusive: day.end.toISOString(),
      bandStart,
      bandEnd: day.end,
    }
  }

  const sched = SHIFT_SCHEDULE[shift]
  const startMin =
    sched.productionStart.hour * 60 + sched.productionStart.minute - WINDOW_LEAD_MINUTES
  const endMin = sched.productionEnd.hour * 60 + sched.productionEnd.minute + WINDOW_TAIL_MINUTES
  const start = makeZonedDate(y, m, d, Math.floor(startMin / 60), startMin % 60, PLANT_TIMEZONE)
  const end = makeZonedDate(y, m, d, Math.floor(endMin / 60), endMin % 60, PLANT_TIMEZONE)
  return { from: start.toISOString(), toExclusive: end.toISOString(), bandStart: start, bandEnd: end }
}

export interface CronoContext {
  /** employeeCode y nfcCardUid (minúsculas) → nombre completo. */
  nameByCode: Map<string, string>
  /** employeeCode y nfcCardUid (minúsculas) → turno asignado. */
  shiftByCode: Map<string, ApiGoalShift>
  machineCodeById: Map<string, string>
}

export function buildCronoContext(
  employees: ReadonlyArray<
    Pick<ApiEmployee, "employeeCode" | "nfcCardUid" | "fullName" | "shift">
  >,
  machines: ReadonlyArray<Pick<ApiMachine, "id" | "code">>,
): CronoContext {
  const nameByCode = new Map<string, string>()
  const shiftByCode = new Map<string, ApiGoalShift>()
  for (const emp of employees) {
    const shift: ApiGoalShift | null =
      emp.shift === 1 ? "matutino" : emp.shift === 2 ? "vespertino" : null
    for (const key of [emp.employeeCode, emp.nfcCardUid]) {
      const k = key?.trim().toLowerCase()
      if (!k) continue
      if (emp.fullName) nameByCode.set(k, emp.fullName)
      if (shift) shiftByCode.set(k, shift)
    }
  }
  const machineCodeById = new Map<string, string>()
  for (const mach of machines) {
    if (mach.id && mach.code) machineCodeById.set(mach.id, mach.code)
  }
  return { nameByCode, shiftByCode, machineCodeById }
}

const SHIFT_LABELS: Record<ApiGoalShift, string> = {
  matutino: "matutino",
  vespertino: "vespertino",
}

const CHECKIN_ROLE_LABELS: Record<string, string> = {
  OPERATOR: "operador",
  PACKAGER: "empacadora",
  MAINTENANCE: "mantenimiento",
}

export function formatPlantTime(at: Date | string): string {
  const d = typeof at === "string" ? new Date(at) : at
  if (Number.isNaN(d.getTime())) return "--:--"
  return d.toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: PLANT_TIMEZONE,
  })
}

/** Hora con segundos — para desempatar sucesos del mismo minuto en la lista y tooltips. */
export function formatPlantTimeSeconds(at: Date | string): string {
  const d = typeof at === "string" ? new Date(at) : at
  if (Number.isNaN(d.getTime())) return "--:--:--"
  return d.toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: PLANT_TIMEZONE,
  })
}

export function formatUnits(n: number): string {
  return Math.round(n).toLocaleString("es-MX")
}

function payloadStr(payload: Record<string, unknown>, key: string): string | null {
  const v = payload[key]
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s && s.toLowerCase() !== "null" && s !== "undefined" ? s : null
}

function payloadNum(payload: Record<string, unknown>, key: string): number | null {
  const v = payload[key]
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function resolveName(ctx: CronoContext, code: string | null): string | null {
  if (!code) return null
  return ctx.nameByCode.get(code.trim().toLowerCase()) ?? code
}

function sourceLabel(payload: Record<string, unknown>): string | null {
  const raw = payloadStr(payload, "source")
  if (!raw) return null
  return SOURCE_LABELS[raw] ?? raw
}

function machineCodeFor(ctx: CronoContext, machineId: string | null): string | undefined {
  return machineId ? ctx.machineCodeById.get(machineId) : undefined
}

/** Usuario de plataforma que ejecutó el movimiento (autoría): nombre, o correo si no hay. */
function actorLabel(payload: Record<string, unknown>): string | null {
  return payloadStr(payload, "byUserName") ?? payloadStr(payload, "byUser")
}

/**
 * Evento suelto (no-PROD) → item narrativo. PROD/ORPHAN_PROD devuelven null: se agrupan en
 * tramos aparte. `event_type` es texto libre en la BD — un tipo desconocido cae al genérico.
 */
export function normalizeEvent(e: ApiProductionEvent, ctx: CronoContext): TimelineItem | null {
  const at = new Date(e.occurredAt)
  if (Number.isNaN(at.getTime())) return null
  const payload = e.payload ?? {}
  const type = (e.eventType ?? "").trim().toUpperCase()
  const base = {
    id: `tl-${e.id}`,
    at,
    machineId: e.machineId,
    machineCode: machineCodeFor(ctx, e.machineId),
    sourceEventIds: [e.id],
  }

  switch (type) {
    case "PROD":
    case "ORPHAN_PROD":
      return null
    case "BOOT": {
      const fw = payloadStr(payload, "fw")
      return {
        ...base,
        kind: "boot",
        title: "Máquina encendida",
        detail: fw ? `Firmware ${fw}` : undefined,
      }
    }
    case "OFFLINE":
      return {
        ...base,
        kind: "offline",
        title: "Máquina sin señal (apagada o sin conexión)",
      }
    case "CHECK_IN":
    case "CHECK_OUT": {
      const isIn = type === "CHECK_IN"
      const code = payloadStr(payload, "employee")
      const name = resolveName(ctx, code) ?? "Sin nombre"
      const via = sourceLabel(payload)
      const role = payloadStr(payload, "role")?.toUpperCase() ?? ""
      const roleLabel = CHECKIN_ROLE_LABELS[role]
      const shift = code ? ctx.shiftByCode.get(code.trim().toLowerCase()) : undefined
      const badges: TimelineBadge[] = []
      if (roleLabel) badges.push({ label: roleLabel, tone: "neutral" })
      if (shift) badges.push({ label: `turno ${SHIFT_LABELS[shift]}`, tone: "info" })
      // Autoría: si el movimiento lo hizo un usuario desde plataforma, decir QUIÉN.
      const by = actorLabel(payload)
      const viaText = via ? `Vía ${via}${by ? ` · por ${by}` : ""}` : by ? `Por ${by}` : undefined
      return {
        ...base,
        kind: isIn ? "checkin" : "checkout",
        title: `${isIn ? "Check-in" : "Check-out"}: ${name}`,
        detail: viaText,
        badges: badges.length ? badges : undefined,
      }
    }
    case "COUNTER_RESET": {
      const from = payloadNum(payload, "from")
      const to = payloadNum(payload, "to")
      const midSession = payload["midSession"] === true
      const ops = Array.isArray(payload["operators"])
        ? (payload["operators"] as unknown[])
            .map((c) => resolveName(ctx, String(c ?? "").trim() || null))
            .filter(Boolean)
        : []
      // El reset a media sesión es el que amerita atención; el de inicio de sesión/turno es
      // el esperado (poner el contador en 0 antes de arrancar). Se etiquetan distinto.
      const badge: TimelineBadge = midSession
        ? { label: "a media sesión", tone: "warning" }
        : { label: "al iniciar sesión", tone: "info" }
      // El destino real de un reset SIEMPRE es 0. La telemetría es periódica, así que si ya se
      // produjeron piezas antes de la muestra, `to` las capta (>0) — no es que reseteara a `to`.
      const detailParts: string[] = []
      if (to !== null && to > COUNTER_RESET_RESIDUAL_MAX) {
        detailParts.push(`~${formatUnits(to)} ya producidas tras el reset`)
      }
      if (ops.length) detailParts.push(`Operador: ${ops.join(", ")}`)
      return {
        ...base,
        kind: "counter_reset",
        title:
          from !== null
            ? `Reset de contador: venía en ${formatUnits(from)} → 0`
            : "Reset de contador",
        detail: detailParts.length ? detailParts.join(" · ") : undefined,
        badges: [badge],
      }
    }
    case "SKU_CHANGE": {
      const from = payloadStr(payload, "from")
      const to = payloadStr(payload, "to")
      const by = actorLabel(payload)
      return {
        ...base,
        kind: "sku_change",
        title: `Cambio de SKU: ${from ?? "—"} → ${to ?? "—"}`,
        detail: by ? `Por ${by} (plataforma)` : undefined,
      }
    }
    case "MAINTENANCE_IN":
    case "MAINTENANCE_OUT": {
      const isIn = type === "MAINTENANCE_IN"
      const name = resolveName(ctx, payloadStr(payload, "employee")) ?? "Sin nombre"
      return {
        ...base,
        kind: isIn ? "maintenance_in" : "maintenance_out",
        title: `${isIn ? "Entró" : "Salió"} mantenimiento: ${name}`,
      }
    }
    default:
      return {
        ...base,
        kind: "other",
        title: type || "Evento",
        detail: e.message ?? undefined,
      }
  }
}

export function normalizeAlert(a: ApiAlert, ctx: CronoContext): TimelineItem | null {
  const at = new Date(a.createdAt)
  if (Number.isNaN(at.getTime())) return null
  const kind = resolveAlertKind(a)
  // Producción sin empacador: las piezas pendientes viven solo en el mensaje de la alerta
  // (no hay evento por pieza), así que la atribución de empacador se ofrece desde la alerta.
  let attribution: TimelineAttribution | undefined
  if (kind === "no_packager" && a.status === "open" && a.machineId) {
    const units = parsePendingUnitsFromAlertMessage(a.message)
    if (units > 0) attribution = { target: "packager", alertId: a.id, units }
  }
  const closedAt = a.closedAt ? new Date(a.closedAt) : null
  return {
    id: `tl-alert-${a.id}`,
    kind: "alert",
    at,
    machineId: a.machineId,
    machineCode: machineCodeFor(ctx, a.machineId),
    title: `Alerta: ${ALERT_KIND_LABELS[kind]}`,
    detail: a.message ?? undefined,
    severity: a.severity,
    alertKind: kind,
    alertMetadata: a.metadata ?? null,
    closedAt: closedAt && !Number.isNaN(closedAt.getTime()) ? closedAt : null,
    attribution,
    sourceEventIds: [a.id],
  }
}

/** Rango del paro de una alerta idle: desde = max(lastProductionAt, checkedInAt); hasta = cierre. */
export function idleRange(item: TimelineItem): { from: Date; to: Date | null } | null {
  if (item.alertKind !== "idle") return null
  const md = item.alertMetadata ?? {}
  const lastProd = typeof md.lastProductionAt === "string" ? new Date(md.lastProductionAt).getTime() : 0
  const checkin = typeof md.checkedInAt === "string" ? new Date(md.checkedInAt).getTime() : 0
  const fromMs = Math.max(lastProd, checkin)
  if (!fromMs) return null
  return { from: new Date(fromMs), to: item.closedAt ?? null }
}

export function alertIcon(kind: ApiAlertKind): LucideIcon {
  return ALERT_KIND_ICONS[kind] ?? AlertTriangle
}

// --- Tramos de producción --------------------------------------------------

interface ProdPiece {
  eventId: string
  machineId: string | null
  start: Date
  end: Date
  units: number
  sku: string | null
  operators: string[]
  /** ORPHAN_PROD pendiente de atribuir. */
  orphanPending: boolean
  /** PROD ya atribuido manualmente (assignmentStatus assigned). */
  attributed: boolean
  /** Volcado de empacadora / ajuste atribuido — no es pieza del contador de la máquina. */
  isDump: boolean
  /** Alerta (no_checkin / no_packager) a la que se ligan/resuelven las piezas. */
  orphanAlertId: string | null
  /** 'auto' (dispositivo al check-in de empacadora) | 'manual' (supervisor en plataforma). */
  attributionMode: string | null
  /** 'orphan' | 'packager_orphan' — de qué tipo de huérfana proviene el volcado. */
  attributedFrom: string | null
  /** Autoría de la atribución manual: nombre (o correo) del usuario de plataforma. */
  attributedBy: string | null
}

function prodPieceFromEvent(e: ApiProductionEvent): ProdPiece | null {
  const payload = e.payload ?? {}
  const occurred = new Date(e.occurredAt)
  if (Number.isNaN(occurred.getTime())) return null
  // Resumen del rollup horario: extremos reales del grupo compactado.
  const first = payloadStr(payload, "first_occurred_at")
  const last = payloadStr(payload, "last_occurred_at")
  const start = first ? new Date(first) : occurred
  const end = last ? new Date(last) : occurred
  const attr = payloadStr(payload, "attributedFrom")
  const type = (e.eventType ?? "").trim().toUpperCase()
  return {
    eventId: e.id,
    machineId: e.machineId,
    start: Number.isNaN(start.getTime()) ? occurred : start,
    end: Number.isNaN(end.getTime()) ? occurred : end,
    units: Math.max(0, payloadNum(payload, "units") ?? 0),
    sku: payloadStr(payload, "sku"),
    operators: Array.isArray(payload["operators"])
      ? (payload["operators"] as unknown[]).map((c) => String(c ?? "").trim()).filter(Boolean)
      : [],
    orphanPending: type === "ORPHAN_PROD" && payload["assignmentStatus"] !== "assigned",
    attributed: payload["assignmentStatus"] === "assigned",
    isDump: attr === "orphan" || attr === "packager_orphan",
    orphanAlertId: payloadStr(payload, "orphanAlertId"),
    attributionMode: payloadStr(payload, "attributionMode"),
    attributedFrom: attr,
    attributedBy: actorLabel(payload),
  }
}

const BREAKER_KINDS = new Set<TimelineKind>([
  "checkout",
  "counter_reset",
  "offline",
  "boot",
  "sku_change",
  "maintenance_in",
])

/**
 * Agrupa PROD/ORPHAN_PROD contiguos en tramos ("07:11–15:30 produjo 4,000 pzas"). Corta el
 * tramo si entre dos piezas hay un suceso relevante de la MISMA máquina (checkout, reset,
 * offline, boot, cambio de SKU, mantenimiento) o un hueco mayor a `gapMinutes`. Agnóstico a
 * rollup vs crudo: un día puede mezclar horas compactadas con la hora en curso sin compactar.
 */
export function groupProductionSpans(
  prodEvents: ApiProductionEvent[],
  breakers: TimelineItem[],
  ctx: CronoContext,
  gapMinutes = SPAN_GAP_MINUTES,
): TimelineItem[] {
  const allPieces = prodEvents
    .map(prodPieceFromEvent)
    .filter((p): p is ProdPiece => p !== null)
    .sort((a, b) => a.start.getTime() - b.start.getTime())

  // Agrupar POR MÁQUINA: con 2+ máquinas intercaladas (modo operador) una sola pasada cerraba
  // el tramo en cada alternancia y fragmentaba la producción en pedazos por hora.
  const piecesByMachine = new Map<string, ProdPiece[]>()
  for (const p of allPieces) {
    const key = p.machineId ?? "∅"
    const list = piecesByMachine.get(key)
    if (list) list.push(p)
    else piecesByMachine.set(key, [p])
  }

  const sortedBreakers = breakers
    .filter((b) => BREAKER_KINDS.has(b.kind))
    .sort((a, b) => a.at.getTime() - b.at.getTime())

  const hasBreakerBetween = (machineId: string | null, fromMs: number, toMs: number): boolean =>
    sortedBreakers.some(
      (b) =>
        b.machineId === machineId && b.at.getTime() > fromMs && b.at.getTime() <= toMs,
    )

  const gapMs = gapMinutes * 60_000
  const items: TimelineItem[] = []

  interface OpenSpan {
    pieces: ProdPiece[]
    start: Date
    end: Date
    units: number
    skus: Set<string>
    operators: Set<string>
    orphanPending: boolean
    attributed: boolean
    orphanAlertId: string | null
  }
  let open: OpenSpan | null = null

  const closeSpan = (span: OpenSpan) => {
    const kind: TimelineKind = span.orphanPending ? "orphan_span" : "production_span"
    const skuList = [...span.skus]
    const operatorNames = [...span.operators]
      .map((c) => resolveName(ctx, c))
      .filter((n): n is string => Boolean(n))
    const detailParts: string[] = []
    if (skuList.length) detailParts.push(`SKU ${skuList.join(", ")}`)
    if (operatorNames.length) detailParts.push(operatorNames.join(", "))
    const badges: TimelineBadge[] = []
    if (span.orphanPending) badges.push({ label: "sin atribuir", tone: "warning" })
    else if (span.attributed) badges.push({ label: "atribuida después", tone: "info" })
    const first = span.pieces[0]
    // Piezas huérfanas pendientes con alerta ligada: se pueden atribuir desde aquí.
    const attribution: TimelineAttribution | undefined =
      span.orphanPending && span.orphanAlertId && first.machineId
        ? { target: "operator", alertId: span.orphanAlertId, units: span.units }
        : undefined
    items.push({
      id: `tl-span-${first.eventId}`,
      kind,
      at: span.start,
      endAt: span.end,
      machineId: first.machineId,
      machineCode: machineCodeFor(ctx, first.machineId),
      title: span.orphanPending
        ? `Producción sin operador asignado: ${formatUnits(span.units)} pzas`
        : `Produjo ${formatUnits(span.units)} pzas`,
      detail: detailParts.length ? detailParts.join(" · ") : undefined,
      badges: badges.length ? badges : undefined,
      units: span.units,
      countsInTotal: true,
      attribution,
      sourceEventIds: span.pieces.map((p) => p.eventId),
    })
  }

  for (const pieces of piecesByMachine.values())
  for (const piece of pieces) {
    // Volcados/ajustes atribuidos: item puntual aparte, fuera del contador de la máquina.
    if (piece.isDump) {
      const isPackager = piece.attributedFrom === "packager_orphan"
      const what = isPackager ? "Producción de empaque" : "Producción"
      // Auto = el dispositivo al hacer check-in la empacadora; manual = supervisor en plataforma.
      // Eventos viejos (sin attributionMode) caen a una etiqueta neutra.
      const title =
        piece.attributionMode === "auto"
          ? `${what} atribuida automáticamente: ${formatUnits(piece.units)} pzas`
          : piece.attributionMode === "manual"
            ? `${what} atribuida por supervisor: ${formatUnits(piece.units)} pzas`
            : `${what} atribuida: ${formatUnits(piece.units)} pzas`
      const modeBadge: TimelineBadge =
        piece.attributionMode === "auto"
          ? { label: "automática", tone: "info" }
          : piece.attributionMode === "manual"
            ? { label: "por supervisor", tone: "info" }
            : { label: "volcado atribuido", tone: "info" }
      // Autoría: la atribución manual dice QUÉ usuario de plataforma la hizo.
      const dumpDetail = [
        piece.sku ? `SKU ${piece.sku}` : null,
        piece.attributionMode === "manual" && piece.attributedBy
          ? `Atribuida por ${piece.attributedBy}`
          : null,
      ].filter(Boolean)
      items.push({
        id: `tl-span-${piece.eventId}`,
        kind: "orphan_span",
        at: piece.start,
        endAt: piece.end.getTime() > piece.start.getTime() ? piece.end : undefined,
        machineId: piece.machineId,
        machineCode: machineCodeFor(ctx, piece.machineId),
        title,
        detail: dumpDetail.length ? dumpDetail.join(" · ") : undefined,
        badges: [modeBadge],
        units: piece.units,
        countsInTotal: false,
        resolvesAlertId: piece.orphanAlertId ?? undefined,
        attributedByUser: piece.attributedBy ?? undefined,
        sourceEventIds: [piece.eventId],
      })
      continue
    }

    const sameSpan =
      open !== null &&
      open.pieces[0].machineId === piece.machineId &&
      open.orphanPending === piece.orphanPending &&
      // Episodios huérfanos distintos (otra alerta) no se mezclan: cada uno se atribuye aparte.
      open.orphanAlertId === piece.orphanAlertId &&
      piece.start.getTime() - open.end.getTime() <= gapMs &&
      (piece.sku === null || open.skus.size === 0 || open.skus.has(piece.sku)) &&
      !hasBreakerBetween(piece.machineId, open.end.getTime(), piece.start.getTime())

    if (sameSpan && open) {
      open.pieces.push(piece)
      if (piece.end.getTime() > open.end.getTime()) open.end = piece.end
      open.units += piece.units
      if (piece.sku) open.skus.add(piece.sku)
      for (const c of piece.operators) open.operators.add(c)
      open.attributed = open.attributed || piece.attributed
    } else {
      if (open) closeSpan(open)
      open = {
        pieces: [piece],
        start: piece.start,
        end: piece.end,
        units: piece.units,
        skus: new Set(piece.sku ? [piece.sku] : []),
        operators: new Set(piece.operators),
        orphanPending: piece.orphanPending,
        attributed: piece.attributed,
        orphanAlertId: piece.orphanAlertId,
      }
    }
  }
  if (open) closeSpan(open)

  return items
}

// --- Modo operador -----------------------------------------------------------

/** ¿El evento involucra a la persona? (check-in/out/mantenimiento por `payload.employee`;
 * producción y resets por `operators`/`packagers`). Case-insensitive. */
export function eventInvolvesPerson(e: ApiProductionEvent, codes: ReadonlySet<string>): boolean {
  const payload = e.payload ?? {}
  const emp = payloadStr(payload, "employee")?.toLowerCase()
  if (emp && codes.has(emp)) return true
  return eventCodesForOperatorGoalCredit(e).some((c) => codes.has(c.toLowerCase()))
}

/** Claves de búsqueda de una persona: employeeCode + nfcCardUid (en legacy coinciden). */
export function personCodeSet(
  employee: Pick<ApiEmployee, "employeeCode" | "nfcCardUid">,
): Set<string> {
  const set = new Set<string>()
  for (const key of [employee.employeeCode, employee.nfcCardUid]) {
    const k = key?.trim().toLowerCase()
    if (k) set.add(k)
  }
  return set
}

// --- Limpieza de rebotes de doble-lectura ------------------------------------

/** Segundos máximos para considerar un par de eventos un "rebote" de doble lectura de tarjeta. */
const SPURIOUS_TAP_SECONDS = 5

/** Un `to` de reset por encima de esto significa que ya se produjeron piezas antes de la muestra
 * (el destino real siempre es 0). Igual al COUNTER_ZERO_THRESHOLD del backend. */
const COUNTER_RESET_RESIDUAL_MAX = 5

function evType(e: ApiProductionEvent): string {
  return (e.eventType ?? "").trim().toUpperCase()
}

function evEmployee(e: ApiProductionEvent): string | null {
  return payloadStr(e.payload ?? {}, "employee")?.toLowerCase() ?? null
}

function secondsBetween(a: ApiProductionEvent, b: ApiProductionEvent): number {
  return Math.abs(new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()) / 1000
}

/** Segundos máximos entre dos CHECK_IN idénticos (misma persona/máquina, sin salida entre
 * medio) para tratarlos como registro duplicado (p. ej. doble guardado desde plataforma). */
const DUPLICATE_TAP_SECONDS = 120

/** ¿El evento demuestra que el DISPOSITIVO está vivo? (para cerrar intervalos OFFLINE y
 * deduplicar OFFLINEs). Los eventos de plataforma no cuentan: los genera el backend. */
function isDeviceProofEvent(e: ApiProductionEvent): boolean {
  const t = evType(e)
  if (t === "BOOT" || t === "PROD" || t === "ORPHAN_PROD" || t === "COUNTER_RESET") return true
  if (t === "CHECK_IN" || t === "CHECK_OUT") {
    return payloadStr(e.payload ?? {}, "source") === "nfc"
  }
  return false
}

/**
 * Quita el ruido de la doble lectura del lector NFC y del doble OFFLINE, SOLO para la vista
 * (el dato crudo sigue en BD / sección Datos):
 *  - OFFLINE consecutivos sin señal de vida del dispositivo entre medio → deja el primero.
 *  - CHECK_IN + CHECK_OUT (o al revés) del mismo empleado en ≤5 s → rebote, quita ambos.
 *  - MAINTENANCE_IN + MAINTENANCE_OUT del mismo empleado en ≤5 s → rebote, quita ambos.
 *  - CHECK_IN (o MAINTENANCE_IN) repetido de la misma persona en la misma máquina en ≤2 min
 *    sin salida entre medio → registro duplicado, deja el primero.
 * Recibe los eventos ya ordenados ascendentemente.
 */
export function collapseSpuriousEvents(events: ApiProductionEvent[]): ApiProductionEvent[] {
  const drop = new Set<string>()

  // Rebotes de tap: pares opuestos consecutivos DE LA MISMA PERSONA en ventana corta. Se escanea
  // la secuencia de taps de cada persona (no la lista global): con varias máquinas a la vez, un
  // evento ajeno en medio rompía la adyacencia y el mismo rebote se veía en un modo y en otro no.
  const CHECK = new Set(["CHECK_IN", "CHECK_OUT"])
  const MAINT = new Set(["MAINTENANCE_IN", "MAINTENANCE_OUT"])
  const tapsByPerson = new Map<string, ApiProductionEvent[]>()
  for (const e of events) {
    const type = evType(e)
    if (!CHECK.has(type) && !MAINT.has(type)) continue
    const emp = evEmployee(e)
    if (!emp) continue
    const list = tapsByPerson.get(emp)
    if (list) list.push(e)
    else tapsByPerson.set(emp, [e])
  }
  for (const taps of tapsByPerson.values()) {
    for (let i = 0; i < taps.length - 1; i++) {
      const a = taps[i]
      const b = taps[i + 1]
      if (drop.has(a.id)) continue
      const ta = evType(a)
      const tb = evType(b)
      const opposite =
        (CHECK.has(ta) && CHECK.has(tb) && ta !== tb) ||
        (MAINT.has(ta) && MAINT.has(tb) && ta !== tb)
      if (opposite && a.machineId === b.machineId && secondsBetween(a, b) <= SPURIOUS_TAP_SECONDS) {
        drop.add(a.id)
        drop.add(b.id)
        i++ // consumir el par
      }
    }
  }

  // Entradas duplicadas: mismo empleado+máquina+tipo de entrada sin la salida correspondiente
  // entre medio, en ventana corta (doble guardado de asignaciones desde plataforma).
  const lastIn = new Map<string, number>() // emp|máquina|tipo → ms del IN vigente
  for (const e of events) {
    if (drop.has(e.id)) continue
    const type = evType(e)
    const emp = evEmployee(e)
    if (!emp || !e.machineId) continue
    const isIn = type === "CHECK_IN" || type === "MAINTENANCE_IN"
    const isOut = type === "CHECK_OUT" || type === "MAINTENANCE_OUT"
    if (!isIn && !isOut) continue
    const key = `${emp}|${e.machineId}|${type.startsWith("CHECK") ? "C" : "M"}`
    const ms = new Date(e.occurredAt).getTime()
    if (isOut) {
      lastIn.delete(key)
    } else {
      const prev = lastIn.get(key)
      if (prev !== undefined && ms - prev <= DUPLICATE_TAP_SECONDS * 1000) drop.add(e.id)
      else lastIn.set(key, ms)
    }
  }

  // OFFLINE consecutivos sin señal de vida del dispositivo entre medio (por máquina).
  const lastOffline = new Map<string, string>() // machineId → id del OFFLINE previo vigente
  for (const e of events) {
    if (drop.has(e.id)) continue
    const mid = e.machineId ?? "∅"
    const type = evType(e)
    if (type === "OFFLINE") {
      if (lastOffline.has(mid)) drop.add(e.id) // ya hay un OFFLINE vigente → este es duplicado
      else lastOffline.set(mid, e.id)
    } else if (isDeviceProofEvent(e)) {
      lastOffline.delete(mid) // el dispositivo dio señales de vida → el siguiente OFFLINE es real
    }
  }

  return events.filter((e) => !drop.has(e.id))
}

/** Intervalos de mantenimiento [inicio, fin] derivados de MAINTENANCE_IN/OUT (fin abierto = ahora). */
function maintenanceIntervals(events: ApiProductionEvent[]): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = []
  let open: number | null = null
  for (const e of events) {
    const t = evType(e)
    const ms = new Date(e.occurredAt).getTime()
    if (t === "MAINTENANCE_IN") open = open ?? ms
    else if (t === "MAINTENANCE_OUT" && open !== null) {
      out.push({ from: open, to: ms })
      open = null
    }
  }
  if (open !== null) out.push({ from: open, to: Number.POSITIVE_INFINITY })
  return out
}

// --- Orquestación --------------------------------------------------------------

export interface CronologiaResult {
  items: TimelineItem[]
  /** Piezas del contador de la máquina en el día (tramos normales + huérfanos pendientes). */
  totalUnits: number
  /** Parte del total que sigue sin atribuir a un operador. */
  orphanUnits: number
  alertCount: number
  /** Estatus LED reconstruido a lo largo del día (solo en modo máquina). */
  statusSegments: StatusSegment[]
}

/** Margen alrededor de la presencia (check-in→check-out) para incluir contexto pegado al borde
 * (el OFFLINE que tumbó la sesión, el reset justo antes de entrar, etc.). */
const PRESENCE_MARGIN_MS = 2 * 60_000

/** Alertas idénticas (misma causa y máquina) separadas por menos de esto se cuentan como UNA
 * ráfaga (p. ej. re-taps sin resetear, idle que parpadea en el cambio de turno). */
const ALERT_BURST_WINDOW_MS = 3 * 60_000

export function buildTimeline(args: {
  events: ApiProductionEvent[]
  alerts: ApiAlert[]
  mode: CronologiaMode
  /** Requerido en modo operador: claves de la persona (ver `personCodeSet`). */
  personCodes?: ReadonlySet<string>
  /** Modo operador: nombre completo, para reconocer alertas que la mencionan por nombre. */
  personName?: string
  ctx: CronoContext
  gapMinutes?: number
  /** Ventana de la banda; con ella se reconstruye la pista de estatus LED (modo máquina). */
  window?: { bandStart: Date; bandEnd: Date }
}): CronologiaResult {
  const { alerts, mode, personCodes, ctx } = args
  // A2: limpiar rebotes de doble-lectura (OFFLINE doble, taps/mantenimiento espurios) para la vista.
  let events = collapseSpuriousEvents(
    [...args.events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)),
  )
  // Eventos COMPLETOS (todas las máquinas) antes del filtro por persona: los necesita la banda
  // de estatus en modo operador para reconstruir el estatus de cada máquina donde estuvo.
  const allEvents = events
  let relevantAlerts = alerts

  if (mode === "operator" && personCodes) {
    // La historia de la persona: sus propios eventos + TODO lo que pasó en sus máquinas
    // MIENTRAS estuvo dentro (check-in→check-out). Lo que ocurre en esas máquinas cuando ella
    // no está (otros turnos, otras horas) no es parte de su historia y solo mete ruido.
    const personEvents = events.filter((e) => eventInvolvesPerson(e, personCodes))
    const fallback = events.length
      ? { start: new Date(events[0].occurredAt), end: new Date(events[events.length - 1].occurredAt) }
      : { start: new Date(0), end: new Date(0) }
    const bandStart = args.window?.bandStart ?? fallback.start
    const bandEnd = args.window?.bandEnd ?? fallback.end
    const intervals = operatorMachineIntervals(events, personCodes, bandStart, bandEnd)
    const inPresence = (mid: string | null, t: number) =>
      mid !== null &&
      intervals.some(
        (iv) =>
          iv.machineId === mid &&
          t >= iv.from - PRESENCE_MARGIN_MS &&
          t <= iv.to + PRESENCE_MARGIN_MS,
      )
    const seen = new Set(personEvents.map((e) => e.id))
    const contextEvents = events.filter(
      (e) => !seen.has(e.id) && inPresence(e.machineId, new Date(e.occurredAt).getTime()),
    )
    events = [...personEvents, ...contextEvents].sort((a, b) =>
      a.occurredAt.localeCompare(b.occurredAt),
    )
    // Alertas: las que solapan su presencia en la máquina, o que la mencionan por código o
    // nombre (rechazos de tap, horas excedidas…) aunque ocurran fuera de su sesión.
    const personName = args.personName?.trim().toLowerCase()
    const mentionsPerson = (a: ApiAlert): boolean => {
      const hay = `${a.title} ${a.message ?? ""} ${JSON.stringify(a.metadata ?? {})}`.toLowerCase()
      if (personName && hay.includes(personName)) return true
      return [...personCodes].some((c) => c && hay.includes(c))
    }
    relevantAlerts = alerts.filter((a) => {
      const from = new Date(a.createdAt).getTime()
      const to = a.closedAt ? new Date(a.closedAt).getTime() : from
      const overlapsPresence =
        a.machineId !== null &&
        intervals.some(
          (iv) =>
            iv.machineId === a.machineId &&
            from <= iv.to + PRESENCE_MARGIN_MS &&
            to >= iv.from - PRESENCE_MARGIN_MS,
        )
      return overlapsPresence || mentionsPerson(a)
    })
  }

  const prodEvents: ApiProductionEvent[] = []
  const plainItems: TimelineItem[] = []
  for (const e of events) {
    const type = (e.eventType ?? "").trim().toUpperCase()
    if (type === "PROD" || type === "ORPHAN_PROD") {
      prodEvents.push(e)
      continue
    }
    const item = normalizeEvent(e, ctx)
    if (item) plainItems.push(item)
  }

  // Reset fuera de sesión: sin operadores dentro y sin un check-in inmediato después, el reset
  // no "arranca" nada (es la limpieza del contador tras el check-out / cierre del turno).
  const checkinTimesByMachine = new Map<string, number[]>()
  for (const e of events) {
    if (evType(e) !== "CHECK_IN" || !e.machineId) continue
    const arr = checkinTimesByMachine.get(e.machineId) ?? []
    arr.push(new Date(e.occurredAt).getTime())
    checkinTimesByMachine.set(e.machineId, arr)
  }
  const resetWithOperators = new Set<string>()
  for (const e of events) {
    const ops = (e.payload ?? {})["operators"]
    if (evType(e) === "COUNTER_RESET" && Array.isArray(ops) && ops.length > 0)
      resetWithOperators.add(e.id)
  }
  for (const item of plainItems) {
    if (item.kind !== "counter_reset") continue
    if (item.badges?.[0]?.label !== "al iniciar sesión") continue
    if (resetWithOperators.has(item.sourceEventIds[0])) continue
    const t = item.at.getTime()
    const times = item.machineId ? checkinTimesByMachine.get(item.machineId) ?? [] : []
    const checkinSoon = times.some((c) => c >= t && c - t <= 15 * 60_000)
    if (!checkinSoon) item.badges = [{ label: "fuera de sesión", tone: "neutral" }]
  }

  const spanItems = groupProductionSpans(prodEvents, plainItems, ctx, args.gapMinutes)

  // Alertas redundantes con lo que ya muestra la cronología (A3/A4/A6):
  //  - counter_reset: el evento COUNTER_RESET ya lo dice todo (incluye midSession).
  //  - no_checkin: ya lo muestra el tramo "sin operador" (orphan_span) con su rango y Asignar.
  //  - idle que solape mantenimiento: no es culpa de la operadora (el backend ya no las genera,
  //    esto cubre históricos).
  const orphanAlertIds = new Set(
    spanItems.map((s) => s.attribution?.alertId).filter((id): id is string => Boolean(id)),
  )
  const maint = maintenanceIntervals(events)
  const overlapsMaintenance = (from: number, to: number) =>
    maint.some((m) => from < m.to && to > m.from)

  // A8: alertas resueltas por una atribución (el volcado liga con su alerta vía orphanAlertId).
  const resolvedByAttribution = new Map<string, { mode: "auto" | "manual"; by: string | null }>()
  for (const s of spanItems) {
    if (!s.resolvesAlertId) continue
    const mode = s.badges?.[0]?.label === "automática" ? "auto" : "manual"
    resolvedByAttribution.set(s.resolvesAlertId, { mode, by: s.attributedByUser ?? null })
  }

  const alertItems = relevantAlerts
    .map((a) => normalizeAlert(a, ctx))
    .filter((i): i is TimelineItem => i !== null)
    .filter((i) => {
      if (i.alertKind === "counter_reset") return false
      if (i.alertKind === "no_checkin" && orphanAlertIds.has(i.sourceEventIds[0])) return false
      if (i.alertKind === "idle") {
        const r = idleRange(i)
        if (r && overlapsMaintenance(r.from.getTime(), (r.to ?? i.at).getTime())) return false
      }
      return true
    })
    .map((i) => {
      const resolved = resolvedByAttribution.get(i.sourceEventIds[0])
      return resolved
        ? { ...i, resolvedBy: resolved.mode, resolvedByName: resolved.by ?? undefined }
        : i
    })

  // Ráfagas de la misma alerta (misma causa y máquina en minutos): re-taps sin resetear o idle
  // parpadeando crean 3-4 idénticas seguidas; para la historia basta UNA con su repetición.
  const alertChains = new Map<string, { item: TimelineItem; count: number; lastAt: number }[]>()
  for (const it of [...alertItems].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    const key = `${it.machineId}|${it.alertKind}`
    const chains = alertChains.get(key) ?? []
    const last = chains[chains.length - 1]
    if (last && it.at.getTime() - last.lastAt <= ALERT_BURST_WINDOW_MS) {
      last.count += 1
      last.lastAt = it.at.getTime()
      last.item.sourceEventIds = [...last.item.sourceEventIds, ...it.sourceEventIds]
      if (it.closedAt && (!last.item.closedAt || it.closedAt > last.item.closedAt))
        last.item.closedAt = it.closedAt
      if (it.resolvedBy) last.item.resolvedBy = it.resolvedBy
    } else {
      chains.push({ item: { ...it }, count: 1, lastAt: it.at.getTime() })
    }
    alertChains.set(key, chains)
  }
  const mergedAlertItems = [...alertChains.values()].flat().map((g) =>
    g.count > 1
      ? {
          ...g.item,
          badges: [
            ...(g.item.badges ?? []),
            { label: `se repitió ×${g.count}`, tone: "warning" as const },
          ],
        }
      : g.item,
  )

  const items = [...plainItems, ...spanItems, ...mergedAlertItems].sort(
    (a, b) => a.at.getTime() - b.at.getTime(),
  )

  // Riel de producción del listado: cuánto llevaba producido el día AL MOMENTO de cada suceso,
  // para leer la lista con el contador subiendo a la derecha ("cuando sonó el paro llevaba
  // 940"). Solo cuenta piezas YA OBSERVADAS (registros con fin ≤ el momento): el contador real
  // avanza de 10 en 10 y estimar dentro de un resumen horario inventaba números que la máquina
  // nunca marcó. En días compactados por rollup el valor avanza al cierre de cada hora.
  const counterPieces = prodEvents
    .map(prodPieceFromEvent)
    .filter((p): p is ProdPiece => p !== null && !p.isDump && p.units > 0)
    .sort((a, b) => a.start.getTime() - b.start.getTime())
  const unitsAt = (t: number): number => {
    let sum = 0
    for (const p of counterPieces) {
      if (p.start.getTime() > t) break // ordenadas por inicio: las que siguen empiezan aún después
      if (p.end.getTime() <= t) sum += p.units
    }
    return sum
  }
  for (const item of items) item.unitsSoFar = unitsAt(item.at.getTime())

  let running = 0
  let orphanUnits = 0
  for (const item of items) {
    if (item.countsInTotal && item.units) {
      running += item.units
      item.cumulativeUnits = running
      if (item.kind === "orphan_span") orphanUnits += item.units
    }
  }

  // Pista de estatus LED: en modo máquina, el estatus de esa máquina; en modo operador, el
  // estatus de la(s) máquina(s) donde el operador estuvo, en cada momento.
  const statusSegments = !args.window
    ? []
    : mode === "machine"
      ? buildStatusSegments(events, spanItems, args.window.bandStart, args.window.bandEnd)
      : personCodes
        ? buildOperatorStatusSegments(allEvents, personCodes, ctx, args.window.bandStart, args.window.bandEnd)
        : []

  return {
    items,
    totalUnits: running,
    orphanUnits,
    alertCount: mergedAlertItems.length,
    statusSegments,
  }
}

// --- Banda horizontal --------------------------------------------------------

/** Posición 0–100 dentro de la banda, con clamp (los márgenes ya cubren lo normal). */
export function bandPositionPct(at: Date, bandStart: Date, bandEnd: Date): number {
  const total = bandEnd.getTime() - bandStart.getTime()
  if (total <= 0) return 0
  const pct = ((at.getTime() - bandStart.getTime()) / total) * 100
  return Math.min(100, Math.max(0, pct))
}

/** Pasos de tick candidatos (segundos), de fino a grueso. */
const TICK_STEPS_S = [
  5, 10, 15, 30, // segundos
  60, 120, 300, 600, 900, 1800, // 1–30 min
  3600, 7200, // 1–2 h
]

/**
 * Ticks del eje adaptivos al zoom: elige el paso más fino que deje ~≥`minPxPerTick` px por
 * etiqueta, según el ancho actual de la banda. Al acercar (mucho ancho por hora) muestra
 * minutos e incluso segundos; alejado, horas. Etiqueta con segundos cuando el paso < 1 min.
 */
export function bandTicks(
  bandStart: Date,
  bandEnd: Date,
  widthPx: number,
  minPxPerTick = 62,
): { leftPct: number; label: string }[] {
  const spanMs = bandEnd.getTime() - bandStart.getTime()
  if (spanMs <= 0) return []
  const maxTicks = Math.max(2, Math.floor(widthPx / minPxPerTick))
  const stepS =
    TICK_STEPS_S.find((s) => spanMs / (s * 1000) <= maxTicks) ??
    TICK_STEPS_S[TICK_STEPS_S.length - 1]
  const stepMs = stepS * 1000
  const withSeconds = stepS < 60
  // Arrancar en el primer múltiplo del paso (en ms epoch) dentro de la ventana.
  const first = Math.ceil(bandStart.getTime() / stepMs) * stepMs
  const ticks: { leftPct: number; label: string }[] = []
  for (let t = first; t <= bandEnd.getTime(); t += stepMs) {
    const d = new Date(t)
    ticks.push({
      leftPct: bandPositionPct(d, bandStart, bandEnd),
      label: withSeconds ? formatPlantTimeSeconds(d) : formatPlantTime(d),
    })
  }
  return ticks
}

// --- Pista de estatus LED (código de colores del piso de producción) ---------

/** Igual que MachineStatus: verde activa · amarillo esperando · azul mantenimiento · rojo apagada. */
export type LedStatus = "active" | "waiting" | "maintenance" | "inactive"

export const LED_STATUS_LABELS: Record<LedStatus, string> = {
  active: "Produciendo",
  waiting: "Encendida sin producir",
  maintenance: "Mantenimiento",
  inactive: "Apagada / sin señal",
}

export interface StatusSegment {
  status: LedStatus
  startPct: number
  endPct: number
  from: Date
  to: Date
  /** Piezas válidas producidas dentro de este tramo (delta). */
  producedUnits: number
  /** Total de producción válida acumulada del día hasta el fin de este tramo. */
  cumulativeValid: number
  /** Solo en modo operador: de qué máquina es el estatus de este tramo. */
  machineCode?: string
}

interface Interval {
  from: number
  to: number
}

function inAny(t: number, intervals: Interval[]): boolean {
  return intervals.some((iv) => t >= iv.from && t < iv.to)
}

/**
 * Reconstruye el estatus del LED de la máquina a lo largo de la ventana, con el mismo código de
 * colores del piso: **verde** produciendo (tramos de producción atribuida), **azul**
 * mantenimiento (entre MAINTENANCE_IN/OUT), **rojo** apagada/sin señal (antes del primer BOOT y
 * de OFFLINE al siguiente BOOT), **amarillo** el resto (encendida pero sin producir). Es una
 * aproximación derivada de los eventos, no el estado exacto del backend, pero suficiente para
 * ver de un vistazo qué hacía la máquina en cada momento. Solo tiene sentido por máquina.
 */
export function buildStatusSegments(
  events: ApiProductionEvent[],
  spanItems: TimelineItem[],
  bandStart: Date,
  bandEnd: Date,
): StatusSegment[] {
  const startMs = bandStart.getTime()
  const endMs = bandEnd.getTime()
  const evs = [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
  const timeOf = (e: ApiProductionEvent) => new Date(e.occurredAt).getTime()

  const boots = evs
    .filter((e) => (e.eventType ?? "").toUpperCase() === "BOOT")
    .map(timeOf)
    .sort((a, b) => a - b)

  // Momentos en que el dispositivo dio señales de vida (BOOT, producción, reset, tap NFC):
  // cierran un intervalo OFFLINE aunque no haya habido re-BOOT (el equipo puede recuperar señal
  // sin reiniciarse; sin esto una máquina viva se pintaba "apagada" horas).
  const proofs = evs.filter(isDeviceProofEvent).map(timeOf).sort((a, b) => a - b)

  // Intervalos apagada: antes del primer BOOT de la ventana, y de cada OFFLINE a la siguiente
  // señal de vida.
  const off: Interval[] = []
  if (boots.length && boots[0] > startMs) off.push({ from: startMs, to: boots[0] })
  for (const e of evs) {
    if ((e.eventType ?? "").toUpperCase() !== "OFFLINE") continue
    const t = timeOf(e)
    const nextProof = proofs.find((p) => p > t)
    off.push({ from: t, to: nextProof ?? endMs })
  }

  // Intervalos mantenimiento: de MAINTENANCE_IN al siguiente MAINTENANCE_OUT.
  const maint: Interval[] = []
  let maintOpen: number | null = null
  for (const e of evs) {
    const t = (e.eventType ?? "").toUpperCase()
    if (t === "MAINTENANCE_IN") maintOpen = maintOpen ?? timeOf(e)
    else if (t === "MAINTENANCE_OUT" && maintOpen !== null) {
      maint.push({ from: maintOpen, to: timeOf(e) })
      maintOpen = null
    }
  }
  if (maintOpen !== null) maint.push({ from: maintOpen, to: endMs })

  // Intervalos produciendo: tramos de producción atribuida (verde real del LED).
  const green: Interval[] = spanItems
    .filter((s) => s.kind === "production_span" && s.endAt)
    .map((s) => ({ from: s.at.getTime(), to: (s.endAt as Date).getTime() }))

  // Puntos de corte: todos los bordes de intervalos dentro de la ventana.
  const points = new Set<number>([startMs, endMs])
  for (const iv of [...off, ...maint, ...green]) {
    if (iv.from > startMs && iv.from < endMs) points.add(iv.from)
    if (iv.to > startMs && iv.to < endMs) points.add(iv.to)
  }
  const sorted = [...points].sort((a, b) => a - b)

  const statusAt = (mid: number): LedStatus => {
    if (inAny(mid, maint)) return "maintenance"
    if (inAny(mid, green)) return "active"
    if (inAny(mid, off)) return "inactive"
    return "waiting"
  }

  const raw: { status: LedStatus; from: number; to: number }[] = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (b <= a) continue
    const status = statusAt((a + b) / 2)
    const last = raw[raw.length - 1]
    if (last && last.status === status) last.to = b
    else raw.push({ status, from: a, to: b })
  }

  // Producción válida (atribuida) por tramo: se acredita al tramo que contiene el inicio del
  // tramo de producción; el acumulado corre en orden temporal para el total al pasar el mouse.
  const validSpans = spanItems.filter((s) => s.kind === "production_span" && s.units)
  let cumulative = 0
  return raw.map((seg) => {
    let delta = 0
    for (const sp of validSpans) {
      const st = sp.at.getTime()
      if (st >= seg.from && st < seg.to) delta += sp.units ?? 0
    }
    cumulative += delta
    return {
      status: seg.status,
      from: new Date(seg.from),
      to: new Date(seg.to),
      startPct: bandPositionPct(new Date(seg.from), bandStart, bandEnd),
      endPct: bandPositionPct(new Date(seg.to), bandStart, bandEnd),
      producedUnits: delta,
      cumulativeValid: cumulative,
    }
  })
}

/** Tramos de producción de UNA máquina, reconstruidos de sus eventos crudos (para el estatus). */
function machineSpanItems(mEvents: ApiProductionEvent[], ctx: CronoContext): TimelineItem[] {
  const prod: ApiProductionEvent[] = []
  const plain: TimelineItem[] = []
  for (const e of mEvents) {
    const t = (e.eventType ?? "").trim().toUpperCase()
    if (t === "PROD" || t === "ORPHAN_PROD") {
      prod.push(e)
      continue
    }
    const item = normalizeEvent(e, ctx)
    if (item) plain.push(item)
  }
  return groupProductionSpans(prod, plain, ctx)
}

/** Intervalos [from,to] por máquina donde el operador estuvo con check-in. */
function operatorMachineIntervals(
  allEvents: ApiProductionEvent[],
  codes: ReadonlySet<string>,
  bandStart: Date,
  bandEnd: Date,
): { machineId: string; from: number; to: number }[] {
  const startMs = bandStart.getTime()
  const endMs = bandEnd.getTime()
  const sorted = allEvents
    .filter((e) => {
      const t = evType(e)
      const emp = evEmployee(e)
      return (t === "CHECK_IN" || t === "CHECK_OUT") && !!e.machineId && !!emp && codes.has(emp)
    })
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
  const open = new Map<string, number>()
  const out: { machineId: string; from: number; to: number }[] = []
  for (const e of sorted) {
    const mid = e.machineId as string
    const ms = new Date(e.occurredAt).getTime()
    if (evType(e) === "CHECK_IN") {
      if (!open.has(mid)) open.set(mid, ms)
    } else {
      const from = open.get(mid)
      if (from !== undefined) {
        out.push({ machineId: mid, from, to: ms })
        open.delete(mid)
      } else {
        // Check-out sin check-in en la ventana: la sesión venía de antes → cuenta desde el inicio.
        out.push({ machineId: mid, from: startMs, to: ms })
      }
    }
  }
  for (const [mid, from] of open) out.push({ machineId: mid, from, to: endMs })
  return out
    .map((iv) => ({
      machineId: iv.machineId,
      from: Math.max(iv.from, startMs),
      to: Math.min(iv.to, endMs),
    }))
    .filter((iv) => iv.to > iv.from)
}

/**
 * Estatus LED que vivió el OPERADOR a lo largo del día: para cada intervalo en que estuvo con
 * check-in en una máquina, toma el estatus de ESA máquina (reconstruido de sus eventos) recortado
 * al intervalo, y los concatena. Así la banda del modo operador muestra colores en vez de "sin
 * datos". Necesita los eventos COMPLETOS (todas las máquinas), no los filtrados por persona.
 */
export function buildOperatorStatusSegments(
  allEvents: ApiProductionEvent[],
  codes: ReadonlySet<string>,
  ctx: CronoContext,
  bandStart: Date,
  bandEnd: Date,
): StatusSegment[] {
  const intervals = operatorMachineIntervals(allEvents, codes, bandStart, bandEnd)
  if (intervals.length === 0) return []

  const statusByMachine = new Map<string, StatusSegment[]>()
  for (const mid of new Set(intervals.map((iv) => iv.machineId))) {
    const mEvents = allEvents.filter((e) => e.machineId === mid)
    statusByMachine.set(mid, buildStatusSegments(mEvents, machineSpanItems(mEvents, ctx), bandStart, bandEnd))
  }

  const raw: { status: LedStatus; from: number; to: number; machineId: string }[] = []
  for (const iv of intervals) {
    for (const s of statusByMachine.get(iv.machineId) ?? []) {
      const from = Math.max(s.from.getTime(), iv.from)
      const to = Math.min(s.to.getTime(), iv.to)
      if (to > from) raw.push({ status: s.status, from, to, machineId: iv.machineId })
    }
  }

  // La persona puede estar en 2+ máquinas A LA VEZ: los tramos se traslapan y pintarlos tal
  // cual encimaba uno sobre otro (p. ej. el rojo de una máquina caída tapaba el verde de la que
  // sí producía). En cada instante gana el estatus de mayor prioridad, diciendo de qué máquina es.
  const PRIORITY: Record<LedStatus, number> = { active: 3, maintenance: 2, waiting: 1, inactive: 0 }
  const cuts = new Set<number>()
  for (const s of raw) {
    cuts.add(s.from)
    cuts.add(s.to)
  }
  const sortedCuts = [...cuts].sort((a, b) => a - b)
  const merged: typeof raw = []
  for (let i = 0; i < sortedCuts.length - 1; i++) {
    const a = sortedCuts[i]
    const b = sortedCuts[i + 1]
    if (b <= a) continue
    const mid = (a + b) / 2
    let winner: (typeof raw)[number] | null = null
    for (const s of raw) {
      if (mid < s.from || mid >= s.to) continue
      if (!winner || PRIORITY[s.status] > PRIORITY[winner.status]) winner = s
    }
    if (!winner) continue
    const last = merged[merged.length - 1]
    if (last && last.status === winner.status && last.machineId === winner.machineId && last.to === a) {
      last.to = b
    } else {
      merged.push({ status: winner.status, from: a, to: b, machineId: winner.machineId })
    }
  }

  // Conteo del hover: piezas DE LA PERSONA (mismo criterio que el riel del listado — solo lo
  // ya observado, sin estimar dentro de resúmenes). "En este tramo" = su máquina en ese rango;
  // "lleva del día" = todo lo suyo hasta el fin del tramo, converge con su Total del día.
  const personPieces = allEvents
    .filter((e) => eventInvolvesPerson(e, codes))
    .map(prodPieceFromEvent)
    .filter((p): p is ProdPiece => p !== null && !p.isDump && p.units > 0)
  const observedUpTo = (t: number, machineId?: string): number => {
    let sum = 0
    for (const p of personPieces) {
      if (machineId && p.machineId !== machineId) continue
      if (p.end.getTime() <= t) sum += p.units
    }
    return sum
  }

  return merged.map((seg) => ({
    status: seg.status,
    from: new Date(seg.from),
    to: new Date(seg.to),
    startPct: bandPositionPct(new Date(seg.from), bandStart, bandEnd),
    endPct: bandPositionPct(new Date(seg.to), bandStart, bandEnd),
    producedUnits: observedUpTo(seg.to, seg.machineId) - observedUpTo(seg.from, seg.machineId),
    cumulativeValid: observedUpTo(seg.to),
    machineCode: ctx.machineCodeById.get(seg.machineId),
  }))
}

// --- Anti-colisión de marcas (escalonado en filas) ---------------------------

export interface PackedMarker {
  item: TimelineItem
  leftPct: number
  row: number
}

/** Grupo de marcas que no cupieron en el escalonado (ráfaga de sucesos casi simultáneos). */
export interface MarkerCluster {
  leftPct: number
  items: TimelineItem[]
  row: number
}

/**
 * Reparte marcas en filas para que dos sucesos cercanos en el tiempo no se encimen: cada marca
 * baja a la primera fila libre. Se acota a `maxRows` filas; lo que no cabe (ráfagas de eventos
 * casi simultáneos, p. ej. el arranque o el cambio de turno) se agrupa en un chip "+N" para no
 * estirar la banda sin control. Necesita el ancho real en px de la banda para medir el solape.
 */
export function packMarkers(
  items: TimelineItem[],
  bandStart: Date,
  bandEnd: Date,
  widthPx: number,
  chipPx: number,
  gapPx: number,
  maxRows = 4,
): { packed: PackedMarker[]; clusters: MarkerCluster[]; rows: number } {
  const sorted = [...items].sort((a, b) => a.at.getTime() - b.at.getTime())
  const rowsRight: number[] = []
  const packed: PackedMarker[] = []
  const overflow: { item: TimelineItem; centerPx: number; leftPct: number }[] = []

  for (const item of sorted) {
    const leftPct = bandPositionPct(item.at, bandStart, bandEnd)
    const centerPx = (leftPct / 100) * widthPx
    const leftEdge = centerPx - chipPx / 2
    let row = rowsRight.findIndex((right) => right + gapPx <= leftEdge)
    if (row === -1) {
      if (rowsRight.length < maxRows) {
        row = rowsRight.length
        rowsRight.push(0)
      } else {
        overflow.push({ item, centerPx, leftPct })
        continue
      }
    }
    rowsRight[row] = centerPx + chipPx / 2
    packed.push({ item, leftPct, row })
  }

  // Agrupar el exceso en clusters por cercanía en x; cada cluster va en la fila extra.
  const clusters: MarkerCluster[] = []
  const overflowRow = Math.min(rowsRight.length, maxRows)
  for (const o of overflow) {
    const last = clusters[clusters.length - 1]
    if (last && o.centerPx - (last.leftPct / 100) * widthPx <= chipPx + gapPx) {
      last.items.push(o.item)
    } else {
      clusters.push({ leftPct: o.leftPct, items: [o.item], row: overflowRow })
    }
  }

  return {
    packed,
    clusters,
    rows: (rowsRight.length || 1) + (clusters.length ? 1 : 0),
  }
}
