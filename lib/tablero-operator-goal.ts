import type { ApiGoal, ApiGoalShift, ApiProductionEvent } from "@/lib/api"
import type { BonusGoalDefinition } from "@/lib/bonus-goals-bridge"
import {
  monthDateBounds,
  resolveBusinessGoalForDisplay,
} from "@/lib/bonus-goals-bridge"
import { goalComplianceDateRange, isGoalActive } from "@/lib/goal-compliance-range"
import { getPartsInTimeZone, makeZonedDate } from "@/lib/shift-timezone"
import {
  countsAsOperatorProduction,
  eventCreditsPersonForOperatorGoal,
  normalizeSku,
  productionShiftForEvent,
  productionUnitsFromEvent,
  type OperatorShiftByCode,
} from "@/lib/production-goal-events"

/** Zona horaria de la planta (única fuente de verdad para clasificar turnos). */
export const PLANT_TIMEZONE = "America/Mexico_City"

export type OperatorGoalSection =
  | "winding"
  | "roller48"
  | "roller36"
  | "bending"
  | "unknown"

/**
 * Turno por timestamp — FALLBACK de reloj cuando no se conoce a la operadora del evento
 * (la regla principal es por persona: ver `productionShiftForEvent`). El día se parte en
 * dos: antes de las 16:00 → matutino, desde las 16:00 → vespertino, en TZ de planta.
 * Toda producción post check-in cuenta al turno aunque ocurra fuera del horario oficial;
 * la producción sin check-in ya queda fuera por ser ORPHAN_PROD.
 */
export function productionShiftFromMeasuredAt(iso: string): ApiGoalShift | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const { hour, minute } = getPartsInTimeZone(d, PLANT_TIMEZONE)
  const mins = hour * 60 + minute
  return mins < 16 * 60 ? "matutino" : "vespertino"
}

const T1_START_MINS = 7 * 60
const T2_START_MINS = 16 * 60
const T2_END_MINS = 23 * 60 + 30

/**
 * Turno cuya meta diaria muestra el tablero según el reloj de planta.
 * Tras la salida de T2 (23:30) o antes de la entrada de T1 (07:00) → matutino (siguiente turno).
 */
export function tableroDisplayGoalShiftFromClock(iso: string): ApiGoalShift {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "matutino"
  const { hour, minute } = getPartsInTimeZone(d, PLANT_TIMEZONE)
  const mins = hour * 60 + minute
  if (mins >= T1_START_MINS && mins < T2_START_MINS) return "matutino"
  if (mins >= T2_START_MINS && mins < T2_END_MINS) return "vespertino"
  return "matutino"
}

function addDaysToDateKey(dayKey: string, days: number, timeZone = PLANT_TIMEZONE): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey.trim())
  if (!m) return dayKey
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return dayKey
  const anchor = makeZonedDate(year, month, day, 12, 0, timeZone)
  const shifted = new Date(anchor.getTime() + days * 24 * 60 * 60 * 1000)
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(shifted)
}

/** Día calendario al que pertenece la producción contada para la meta en curso. */
export function resolveTableroGoalProductionDayKey(
  dayKey: string,
  goalShift: ApiGoalShift,
  referenceIso: string,
): string {
  if (goalShift !== "matutino") return dayKey
  const d = new Date(referenceIso)
  if (Number.isNaN(d.getTime())) return dayKey
  const { hour, minute } = getPartsInTimeZone(d, PLANT_TIMEZONE)
  const mins = hour * 60 + minute
  if (mins >= T2_END_MINS) return addDaysToDateKey(dayKey, 1)
  return dayKey
}

/** Día calendario completo [00:00, 24:00) en zona de planta. */
function dayBoundsOnDateKey(
  dayKey: string,
  timeZone = PLANT_TIMEZONE,
): { start: Date; end: Date } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey.trim())
  if (!m) {
    const now = new Date()
    return { start: now, end: now }
  }
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  return {
    start: makeZonedDate(year, month, day, 0, 0, timeZone),
    // Hora 24 = medianoche del día siguiente (Date.UTC normaliza el desbordamiento).
    end: makeZonedDate(year, month, day, 24, 0, timeZone),
  }
}

export function filterEventsForTableroGoalShift(
  events: ApiProductionEvent[],
  dayKey: string,
  shift: ApiGoalShift,
  referenceIso: string,
  isLiveView: boolean,
  operatorShiftByCode?: OperatorShiftByCode | null,
): ApiProductionEvent[] {
  const prodDayKey = isLiveView
    ? resolveTableroGoalProductionDayKey(dayKey, shift, referenceIso)
    : dayKey
  // Día completo + clasificación por operadora: el turno lo define la persona con
  // check-in (turno asignado), con fallback al reloj (<16:00) si no se conoce.
  const { start, end } = dayBoundsOnDateKey(prodDayKey)
  const startMs = start.getTime()
  const endMs = end.getTime()
  return events.filter((e) => {
    const t = new Date(e.occurredAt).getTime()
    if (!(t >= startMs && t < endMs)) return false
    return productionShiftForEvent(e, operatorShiftByCode) === shift
  })
}

/** Producción de T1 o T2 en un día calendario (sin lógica de “siguiente turno”). */
export function filterEventsForCalendarDayShift(
  events: ApiProductionEvent[],
  dayKey: string,
  shift: ApiGoalShift,
  operatorShiftByCode?: OperatorShiftByCode | null,
): ApiProductionEvent[] {
  return filterEventsForTableroGoalShift(events, dayKey, shift, dayKey, false, operatorShiftByCode)
}

/** Producción atribuible a un turno en un rango (mes/semestre). */
export function filterEventsForShiftInPeriod(
  events: ApiProductionEvent[],
  shift: ApiGoalShift,
  operatorShiftByCode?: OperatorShiftByCode | null,
): ApiProductionEvent[] {
  return events.filter((e) => productionShiftForEvent(e, operatorShiftByCode) === shift)
}

/** Mediodía del día calendario (YYYY-MM-DD) en zona de planta — referencia para días históricos. */
export function noonIsoForDateKey(dateKey: string, timeZone = PLANT_TIMEZONE): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim())
  if (!m) return new Date().toISOString()
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return new Date().toISOString()
  }
  return makeZonedDate(year, month, day, 12, 0, timeZone).toISOString()
}

/**
 * Turno para meta diaria en tablero.
 * En vivo: solo reloj (al terminar T2 ya muestra meta T1, con 0 hasta que arranque).
 * Histórico: turno con más eventos del día, o reloj del mediodía.
 */
export function resolveTableroProductionShift(options: {
  nowIso?: string
  dayEvents: ApiProductionEvent[]
  dayReferenceIso?: string
  operatorShiftByCode?: OperatorShiftByCode | null
}): ApiGoalShift {
  if (options.nowIso?.trim()) {
    return tableroDisplayGoalShiftFromClock(options.nowIso)
  }

  if (options.dayEvents.length > 0) {
    let matutino = 0
    let vespertino = 0
    for (const e of options.dayEvents) {
      const s = productionShiftForEvent(e, options.operatorShiftByCode)
      if (s === "matutino") matutino += 1
      else if (s === "vespertino") vespertino += 1
    }
    if (vespertino > matutino) return "vespertino"
    if (matutino > 0) return "matutino"
    const last = productionShiftForEvent(
      options.dayEvents[options.dayEvents.length - 1],
      options.operatorShiftByCode,
    )
    if (last) return last
  }

  const ref = options.dayReferenceIso ?? new Date().toISOString()
  return tableroDisplayGoalShiftFromClock(ref)
}

export function todayDateKeyInTimeZone(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

function machineIncludesAny(text: string, keywords: string[]): boolean {
  const v = text.trim().toLowerCase()
  if (!v) return false
  return keywords.some((k) => v.includes(k))
}

export function inferOperatorGoalSection(ctx: {
  machineCode: string
  machineName: string
  sku: string
  unitsPerBox: number | null
}): OperatorGoalSection {
  const machineText = `${ctx.machineCode} ${ctx.machineName}`.trim()
  if (machineIncludesAny(machineText, ["bend", "bending", "doblado", "dobladora"])) {
    return "bending"
  }
  if (machineIncludesAny(machineText, ["roll", "roller", "rodillo"])) {
    const upb = ctx.unitsPerBox
    if (upb != null && upb <= 40) return "roller36"
    return "roller48"
  }

  return "winding"
}

function sectionToSourceKey(section: OperatorGoalSection, shift: ApiGoalShift): string | null {
  const turn = shift === "matutino" ? "t1" : "t2"
  if (section === "winding") return `winding-${turn}-daily`
  if (section === "roller48") return `roller48-${turn}-daily`
  if (section === "roller36") return `roller36-${turn}-daily`
  if (section === "bending") return `bending-${turn}-daily`
  return null
}

function goalSpecificityScore(goal: ApiGoal): number {
  let score = 0
  if (goal.machineId?.trim()) score += 4
  if (normalizeSku(goal.sku)) score += 2
  if (goal.shift) score += 1
  return score
}

function goalUsesBoxes(sourceKey: string | null): boolean {
  if (!sourceKey) return false
  return sourceKey.startsWith("roller")
}

function findGoalByBonusDefinition(
  goals: ApiGoal[],
  definitions: BonusGoalDefinition[],
  sourceKey: string,
  today: string,
): ApiGoal | null {
  const def = definitions.find((d) => d.sourceKey === sourceKey)
  if (!def) return null
  const month = today.slice(0, 7)
  const monthBounds = monthDateBounds(month)
  // Meta individual por operador (no × headcount del turno).
  return resolveBusinessGoalForDisplay(goals, def, monthBounds, {
    operatorsPerShift: 1,
  })
}

export function findDailyGoalForOperator(
  goals: ApiGoal[],
  definitions: BonusGoalDefinition[],
  ctx: {
    machineId: string | null
    machineCode: string
    machineName: string
    sku: string
    unitsPerBox: number | null
    shift: ApiGoalShift | null
    today: string
  },
): { goal: ApiGoal | null; sourceKey: string | null } {
  const shift = ctx.shift
  const daily = goals.filter((g) => {
    if (!isGoalActive(g) || g.period !== "daily") return false
    if (g.shift != null && shift && g.shift !== shift) return false
    const range = goalComplianceDateRange(g)
    return ctx.today >= range.startDate && ctx.today <= range.endDate
  })

  const skuNorm = normalizeSku(ctx.sku)?.toLowerCase()
  const explicit = daily
    .filter((g) => {
      if (g.machineId?.trim() && g.machineId !== ctx.machineId) return false
      const goalSku = normalizeSku(g.sku)?.toLowerCase()
      if (goalSku && goalSku !== skuNorm) return false
      return Boolean(g.machineId?.trim() || goalSku)
    })
    .sort((a, b) => goalSpecificityScore(b) - goalSpecificityScore(a))

  if (explicit.length > 0) {
    const goal = explicit[0]
    const section = inferOperatorGoalSection(ctx)
    const sourceKey = shift ? sectionToSourceKey(section, shift) : null
    return { goal, sourceKey }
  }

  if (!shift) return { goal: null, sourceKey: null }

  const section = inferOperatorGoalSection(ctx)
  const sourceKey = sectionToSourceKey(section, shift)
  if (!sourceKey) return { goal: null, sourceKey: null }

  const goal = findGoalByBonusDefinition(goals, definitions, sourceKey, ctx.today)
  return { goal, sourceKey }
}

function getEventBoxCount(e: ApiProductionEvent): number {
  const payload = e.payload ?? {}
  const raw =
    (payload["COUNT"] as unknown) ??
    (payload["count"] as unknown) ??
    (payload["units"] as unknown)
  const n = typeof raw === "number" ? raw : Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function aggregateOperatorDailyProduction(
  events: ApiProductionEvent[],
  operatorCode: string,
  useBoxes: boolean,
  skuById: Map<string, string>,
  upbById: Map<string, number>,
  _resolveOperatorCode: (e: ApiProductionEvent) => string,
): number {
  const codeLower = operatorCode.trim().toLowerCase()
  if (!codeLower || codeLower === "sin_operador") return 0

  let total = 0
  for (const e of events) {
    if (!countsAsOperatorProduction(e)) continue
    // Incluye producción como empacadora: la meta sigue siendo la de operadora.
    if (!eventCreditsPersonForOperatorGoal(e, codeLower)) continue
    total += useBoxes
      ? getEventBoxCount(e)
      : productionUnitsFromEvent(e, upbById)
  }
  return total
}

export function computeDailyGoalProgress(
  actual: number,
  target: number,
): { percentage: number; remaining: number } {
  if (target <= 0) return { percentage: 0, remaining: 0 }
  const remaining = Math.max(0, target - actual)
  const percentage = Math.min(100, Math.round((actual / target) * 100))
  return { percentage, remaining }
}

export type OperatorDailyGoalResult = {
  percentage: number
  goalRemaining: number | null
  goalTarget: number | null
}

/** Meta diaria Winding (reglas de negocio) para el tablero — misma meta para todos los operadores. */
export function resolveTableroWindingDailyGoalProgress(
  goals: ApiGoal[],
  definitions: BonusGoalDefinition[],
  todayEvents: ApiProductionEvent[],
  operatorCode: string,
  shift: ApiGoalShift,
  today: string,
  referenceIso: string,
  isLiveView: boolean,
  skuById: Map<string, string>,
  upbById: Map<string, number>,
  resolveOperatorCode: (e: ApiProductionEvent) => string,
  operatorShiftByCode?: OperatorShiftByCode | null,
): OperatorDailyGoalResult {
  const sourceKey = shift === "matutino" ? "winding-t1-daily" : "winding-t2-daily"
  const def = definitions.find((d) => d.sourceKey === sourceKey)
  if (!def) {
    return { percentage: 0, goalRemaining: null, goalTarget: null }
  }

  const monthBounds = monthDateBounds(today.slice(0, 7))
  // Meta diaria Winding por persona (3650 T1 / 3000 T2), no la meta agregada del turno.
  const goal = resolveBusinessGoalForDisplay(goals, def, monthBounds, {
    operatorsPerShift: 1,
  })
  const target = Number(goal.targetValue)
  if (!Number.isFinite(target) || target <= 0) {
    return { percentage: 0, goalRemaining: null, goalTarget: null }
  }

  const goalEvents = filterEventsForTableroGoalShift(
    todayEvents,
    today,
    shift,
    referenceIso,
    isLiveView,
    operatorShiftByCode,
  )
  const actual = aggregateOperatorDailyProduction(
    goalEvents,
    operatorCode,
    false,
    skuById,
    upbById,
    resolveOperatorCode,
  )
  const { percentage, remaining } = computeDailyGoalProgress(actual, target)
  return { percentage, goalRemaining: remaining, goalTarget: target }
}

/** Meses incluidos en la ventana de semestre del tablero (6 meses calendario). */
export const TABLERO_SEMESTER_MONTHS = 6

export function tableroWindingMonthlyTarget(
  definitions: BonusGoalDefinition[],
  shift: ApiGoalShift,
): number | null {
  const sourceKey = shift === "matutino" ? "winding-t1-monthly" : "winding-t2-monthly"
  const def = definitions.find((d) => d.sourceKey === sourceKey)
  if (!def) return null
  const target = Number(def.targetValue)
  return Number.isFinite(target) && target > 0 ? target : null
}

export function tableroWindingPeriodTarget(
  definitions: BonusGoalDefinition[],
  shift: ApiGoalShift,
  period: "month" | "semester",
): number | null {
  const monthly = tableroWindingMonthlyTarget(definitions, shift)
  if (monthly == null) return null
  return period === "semester" ? monthly * TABLERO_SEMESTER_MONTHS : monthly
}

export function resolveTableroWindingPeriodGoalProgress(
  actual: number,
  shift: ApiGoalShift,
  period: "month" | "semester",
  definitions: BonusGoalDefinition[],
): OperatorDailyGoalResult {
  const target = tableroWindingPeriodTarget(definitions, shift, period)
  if (target == null) {
    return { percentage: 0, goalRemaining: null, goalTarget: null }
  }
  const { percentage, remaining } = computeDailyGoalProgress(actual, target)
  return { percentage, goalRemaining: remaining, goalTarget: target }
}

export function resolveOperatorDailyGoalProgress(
  goals: ApiGoal[],
  definitions: BonusGoalDefinition[],
  todayEvents: ApiProductionEvent[],
  ctx: {
    operatorCode: string
    machineId: string | null
    machineCode: string
    machineName: string
    sku: string
    unitsPerBox: number | null
    shift: ApiGoalShift | null
    today: string
  },
  skuById: Map<string, string>,
  upbById: Map<string, number>,
  resolveOperatorCode: (e: ApiProductionEvent) => string,
): OperatorDailyGoalResult {
  const { goal, sourceKey } = findDailyGoalForOperator(goals, definitions, ctx)
  if (!goal) {
    return { percentage: 0, goalRemaining: null, goalTarget: null }
  }

  const target = Number(goal.targetValue)
  if (!Number.isFinite(target) || target <= 0) {
    return { percentage: 0, goalRemaining: null, goalTarget: null }
  }

  const useBoxes = normalizeSku(goal.sku)
    ? false
    : goalUsesBoxes(sourceKey)
  const actual = aggregateOperatorDailyProduction(
    todayEvents,
    ctx.operatorCode,
    useBoxes,
    skuById,
    upbById,
    resolveOperatorCode,
  )
  const { percentage, remaining } = computeDailyGoalProgress(actual, target)
  return { percentage, goalRemaining: remaining, goalTarget: target }
}
