import type { ApiGoal, ApiGoalShift, ApiProductionEvent } from "@/lib/api"
import type { BonusGoalDefinition } from "@/lib/bonus-goals-bridge"
import { goalComplianceDateRange, isGoalActive } from "@/lib/goal-compliance-range"
import { getPartsInTimeZone } from "@/lib/shift-timezone"
import {
  normalizeSku,
  productionUnitsFromEvent,
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
 * Turno por timestamp, en la zona horaria de la planta (TZ MX, sin depender del navegador):
 * T1/matutino 07:00–15:59, T2/vespertino 16:00–23:29. Misma ventana que los reportes Excel
 * (`getShiftBoundsForCalendarDate`). Fuera de esas ventanas (madrugada) → null.
 */
export function productionShiftFromMeasuredAt(iso: string): ApiGoalShift | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const { hour, minute } = getPartsInTimeZone(d, PLANT_TIMEZONE)
  const mins = hour * 60 + minute
  if (mins >= 7 * 60 && mins < 16 * 60) return "matutino"
  if (mins >= 16 * 60 && mins < 23 * 60 + 30) return "vespertino"
  return null
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
  return (
    goals.find(
      (g) =>
        g.period === "daily" &&
        (g.shift ?? null) === def.shift &&
        !g.machineId?.trim() &&
        !normalizeSku(g.sku) &&
        g.startDate <= today &&
        g.endDate >= today &&
        Math.abs(Number(g.targetValue) - def.targetValue) < 0.01,
    ) ?? null
  )
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

function isProductionIncrementEvent(e: ApiProductionEvent): boolean {
  const payload = e.payload ?? {}
  const rawEvent =
    (payload["EVENT"] as string | undefined) ??
    (payload["event"] as string | undefined) ??
    e.eventType
  const v = String(rawEvent ?? "").trim().toLowerCase()
  if (!v) return false
  if (v === "prod") return true
  if (v.includes("produ")) return true
  return v === "producción" || v === "produccion"
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
  resolveOperatorCode: (e: ApiProductionEvent) => string,
): number {
  const codeLower = operatorCode.trim().toLowerCase()
  if (!codeLower || codeLower === "sin_operador") return 0

  let total = 0
  for (const e of events) {
    if (!isProductionIncrementEvent(e)) continue
    const op = resolveOperatorCode(e).trim().toLowerCase()
    if (op !== codeLower) continue
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
