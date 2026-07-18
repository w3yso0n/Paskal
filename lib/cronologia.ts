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
  ApiMachine,
  ApiProductionEvent,
} from "@/lib/api"
import { ALERT_KIND_ICONS, ALERT_KIND_LABELS, resolveAlertKind } from "@/lib/alert-ui"
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
  units?: number
  /** Piezas de la máquina acumuladas en el día al cierre de este tramo. */
  cumulativeUnits?: number
  /** `false` en volcados atribuidos: no son piezas del contador de la máquina. */
  countsInTotal?: boolean
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
}

const ROLE_BADGES: Record<string, string> = {
  PACKAGER: "empacadora",
  MAINTENANCE: "mantenimiento",
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
  machineCodeById: Map<string, string>
}

export function buildCronoContext(
  employees: ReadonlyArray<Pick<ApiEmployee, "employeeCode" | "nfcCardUid" | "fullName">>,
  machines: ReadonlyArray<Pick<ApiMachine, "id" | "code">>,
): CronoContext {
  const nameByCode = new Map<string, string>()
  for (const emp of employees) {
    for (const key of [emp.employeeCode, emp.nfcCardUid]) {
      const k = key?.trim().toLowerCase()
      if (k && emp.fullName) nameByCode.set(k, emp.fullName)
    }
  }
  const machineCodeById = new Map<string, string>()
  for (const mach of machines) {
    if (mach.id && mach.code) machineCodeById.set(mach.id, mach.code)
  }
  return { nameByCode, machineCodeById }
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
      const name = resolveName(ctx, payloadStr(payload, "employee")) ?? "Sin nombre"
      const via = sourceLabel(payload)
      const role = payloadStr(payload, "role")?.toUpperCase() ?? ""
      const roleBadge = ROLE_BADGES[role]
      return {
        ...base,
        kind: isIn ? "checkin" : "checkout",
        title: `${isIn ? "Check-in" : "Check-out"}: ${name}`,
        detail: via ? `Vía ${via}` : undefined,
        badges: roleBadge ? [{ label: roleBadge, tone: "neutral" }] : undefined,
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
      return {
        ...base,
        kind: "counter_reset",
        title:
          from !== null && to !== null
            ? `Reset de contador (${formatUnits(from)} → ${formatUnits(to)})`
            : "Reset de contador",
        detail: ops.length ? `Operador: ${ops.join(", ")}` : undefined,
        badges: midSession ? [{ label: "a media sesión", tone: "warning" }] : undefined,
      }
    }
    case "SKU_CHANGE": {
      const from = payloadStr(payload, "from")
      const to = payloadStr(payload, "to")
      return {
        ...base,
        kind: "sku_change",
        title: `Cambio de SKU: ${from ?? "—"} → ${to ?? "—"}`,
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
    sourceEventIds: [a.id],
  }
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
  const pieces = prodEvents
    .map(prodPieceFromEvent)
    .filter((p): p is ProdPiece => p !== null)
    .sort((a, b) => a.start.getTime() - b.start.getTime())

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
      sourceEventIds: span.pieces.map((p) => p.eventId),
    })
  }

  for (const piece of pieces) {
    // Volcados/ajustes atribuidos: item puntual aparte, fuera del contador de la máquina.
    if (piece.isDump) {
      items.push({
        id: `tl-span-${piece.eventId}`,
        kind: "orphan_span",
        at: piece.start,
        endAt: piece.end.getTime() > piece.start.getTime() ? piece.end : undefined,
        machineId: piece.machineId,
        machineCode: machineCodeFor(ctx, piece.machineId),
        title: `Producción atribuida manualmente: ${formatUnits(piece.units)} pzas`,
        detail: piece.sku ? `SKU ${piece.sku}` : undefined,
        badges: [{ label: "volcado atribuido", tone: "info" }],
        units: piece.units,
        countsInTotal: false,
        sourceEventIds: [piece.eventId],
      })
      continue
    }

    const sameSpan =
      open !== null &&
      open.pieces[0].machineId === piece.machineId &&
      open.orphanPending === piece.orphanPending &&
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

// --- Orquestación --------------------------------------------------------------

export interface CronologiaResult {
  items: TimelineItem[]
  /** Piezas del contador de la máquina en el día (tramos normales + huérfanos pendientes). */
  totalUnits: number
  /** Parte del total que sigue sin atribuir a un operador. */
  orphanUnits: number
  alertCount: number
}

export function buildTimeline(args: {
  events: ApiProductionEvent[]
  alerts: ApiAlert[]
  mode: CronologiaMode
  /** Requerido en modo operador: claves de la persona (ver `personCodeSet`). */
  personCodes?: ReadonlySet<string>
  ctx: CronoContext
  gapMinutes?: number
}): CronologiaResult {
  const { alerts, mode, personCodes, ctx } = args
  let events = [...args.events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
  let relevantAlerts = alerts

  if (mode === "operator" && personCodes) {
    const personEvents = events.filter((e) => eventInvolvesPerson(e, personCodes))
    // Contexto de las máquinas donde la persona tuvo actividad: BOOT/OFFLINE explican huecos
    // (apagones) y sus alertas son parte de la historia; las de máquinas ajenas son ruido.
    const machineIds = new Set(personEvents.map((e) => e.machineId).filter(Boolean))
    const contextEvents = events.filter((e) => {
      const type = (e.eventType ?? "").trim().toUpperCase()
      return (
        (type === "BOOT" || type === "OFFLINE") &&
        e.machineId !== null &&
        machineIds.has(e.machineId)
      )
    })
    const seen = new Set(personEvents.map((e) => e.id))
    events = [...personEvents, ...contextEvents.filter((e) => !seen.has(e.id))].sort((a, b) =>
      a.occurredAt.localeCompare(b.occurredAt),
    )
    relevantAlerts = alerts.filter((a) => a.machineId !== null && machineIds.has(a.machineId))
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

  const spanItems = groupProductionSpans(prodEvents, plainItems, ctx, args.gapMinutes)
  const alertItems = relevantAlerts
    .map((a) => normalizeAlert(a, ctx))
    .filter((i): i is TimelineItem => i !== null)

  const items = [...plainItems, ...spanItems, ...alertItems].sort(
    (a, b) => a.at.getTime() - b.at.getTime(),
  )

  let running = 0
  let orphanUnits = 0
  for (const item of items) {
    if (item.countsInTotal && item.units) {
      running += item.units
      item.cumulativeUnits = running
      if (item.kind === "orphan_span") orphanUnits += item.units
    }
  }

  return { items, totalUnits: running, orphanUnits, alertCount: alertItems.length }
}

// --- Banda horizontal --------------------------------------------------------

/** Posición 0–100 dentro de la banda, con clamp (los márgenes ya cubren lo normal). */
export function bandPositionPct(at: Date, bandStart: Date, bandEnd: Date): number {
  const total = bandEnd.getTime() - bandStart.getTime()
  if (total <= 0) return 0
  const pct = ((at.getTime() - bandStart.getTime()) / total) * 100
  return Math.min(100, Math.max(0, pct))
}

/** Ticks del eje: una marca por hora en TZ de planta. */
export function bandHourTicks(
  bandStart: Date,
  bandEnd: Date,
): { leftPct: number; label: string }[] {
  const ticks: { leftPct: number; label: string }[] = []
  const HOUR = 3_600_000
  // La banda siempre arranca en hora cerrada (06:00 / 15:00); avanzar de hora en hora.
  for (let t = bandStart.getTime(); t <= bandEnd.getTime(); t += HOUR) {
    const d = new Date(t)
    ticks.push({ leftPct: bandPositionPct(d, bandStart, bandEnd), label: formatPlantTime(d) })
  }
  return ticks
}
