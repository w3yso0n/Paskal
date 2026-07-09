import type { ApiGoal, ApiGoalPeriod, ApiGoalShift, CreateGoalPayload } from "@/lib/api"
import type { BonusProductionConfigData } from "@/lib/bonus-production-config"
import {
  bendingDailyMetaFromMonthly,
  monthlyMeta100FromDaily,
} from "@/lib/bonus-production-config"

/** Operadores winding por turno cuando no hay maestro cargado (meta individual × este número = meta del turno). */
export const DEFAULT_WINDING_OPERATORS_PER_SHIFT = 20

export type WindingShiftHeadcount = {
  matutino: number
  vespertino: number
}

type EmployeeHeadcountRow = {
  status?: string | null
  shift?: number | null
  primaryRole?: string | null
}

export function resolveWindingShiftHeadcount(
  employees?: EmployeeHeadcountRow[],
): WindingShiftHeadcount {
  const countShift = (shiftNum: 1 | 2): number => {
    if (!employees?.length) return DEFAULT_WINDING_OPERATORS_PER_SHIFT
    const n = employees.filter((e) => {
      if (e.status && e.status !== "active") return false
      if (e.shift !== shiftNum) return false
      return e.primaryRole === "operator"
    }).length
    return n > 0 ? n : DEFAULT_WINDING_OPERATORS_PER_SHIFT
  }
  return { matutino: countShift(1), vespertino: countShift(2) }
}

export function windingHeadcountForShift(
  headcount: WindingShiftHeadcount,
  shift: ApiGoalShift | null | undefined,
): number {
  if (shift === "matutino") return headcount.matutino
  if (shift === "vespertino") return headcount.vespertino
  return DEFAULT_WINDING_OPERATORS_PER_SHIFT
}

/** Meta por operador (reglas de negocio) → meta agregada del turno en pantallas de cumplimiento grupal. */
export function aggregateWindingMetasGoalTarget(
  def: BonusGoalDefinition,
  operatorsPerShift: number,
): number {
  if (!isMetasBusinessGoalSourceKey(def.sourceKey)) return def.targetValue
  const n = Math.max(1, operatorsPerShift)
  return Math.round(def.targetValue * n)
}

export type BonusGoalDefinition = {
  sourceKey: string
  label: string
  targetValue: number
  period: ApiGoalPeriod
  shift: ApiGoalShift | null
}

/** Prefijo de ids virtuales para metas derivadas de reglas de negocio (no persistidas en BD). */
export const BUSINESS_GOAL_ID_PREFIX = "business:"

export function isVirtualBusinessGoalId(id: string): boolean {
  return id.startsWith(BUSINESS_GOAL_ID_PREFIX)
}

export function monthDateBounds(effectiveMonth: string): { startDate: string; endDate: string } {
  const [yRaw, mRaw] = effectiveMonth.split("-")
  const year = Number(yRaw)
  const month = Number(mRaw)
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth() + 1
    const mm = String(m).padStart(2, "0")
    return { startDate: `${y}-${mm}-01`, endDate: now.toISOString().slice(0, 10) }
  }
  const mm = String(month).padStart(2, "0")
  const lastDay = new Date(year, month, 0).getDate()
  return { startDate: `${year}-${mm}-01`, endDate: `${year}-${mm}-${String(lastDay).padStart(2, "0")}` }
}

const DAYS_PER_WEEK = 5

/** Metas de reglas de negocio visibles en la pantalla Metas (solo Winding diaria/mensual). */
export const METAS_BUSINESS_GOAL_SOURCE_KEYS = [
  "winding-t1-daily",
  "winding-t2-daily",
  "winding-t1-monthly",
  "winding-t2-monthly",
] as const

export type MetasBusinessGoalSourceKey = (typeof METAS_BUSINESS_GOAL_SOURCE_KEYS)[number]

export function isMetasBusinessGoalSourceKey(sourceKey: string): sourceKey is MetasBusinessGoalSourceKey {
  return (METAS_BUSINESS_GOAL_SOURCE_KEYS as readonly string[]).includes(sourceKey)
}

/** Subconjunto de definiciones de bono que se muestran como "Meta del negocio" en Metas. */
export function bonusConfigToMetasBusinessGoalDefinitions(
  config: BonusProductionConfigData,
): BonusGoalDefinition[] {
  return bonusConfigToGoalDefinitions(config).filter((def) =>
    isMetasBusinessGoalSourceKey(def.sourceKey),
  )
}

/** Metas operativas derivadas de la configuración de bono (fuente única). */
export function bonusConfigToGoalDefinitions(
  config: BonusProductionConfigData,
): BonusGoalDefinition[] {
  const w1 = config.winding.shift1
  const w2 = config.winding.shift2
  const b1 = config.bending.shift1
  const b2 = config.bending.shift2
  const r48 = config.roller48
  const r36 = config.roller36
  const workingDays = w1.workingDaysPerMonth > 0 ? w1.workingDaysPerMonth : 20

  return [
    {
      sourceKey: "winding-t1-daily",
      label: "Winding — meta diaria 100% (Turno 1)",
      targetValue: w1.dailyMeta100,
      period: "daily",
      shift: "matutino",
    },
    {
      sourceKey: "winding-t2-daily",
      label: "Winding — meta diaria 100% (Turno 2)",
      targetValue: w2.dailyMeta100,
      period: "daily",
      shift: "vespertino",
    },
    {
      sourceKey: "winding-t1-weekly",
      label: "Winding — meta semanal 100% (Turno 1)",
      targetValue: w1.dailyMeta100 * DAYS_PER_WEEK,
      period: "weekly",
      shift: "matutino",
    },
    {
      sourceKey: "winding-t2-weekly",
      label: "Winding — meta semanal 100% (Turno 2)",
      targetValue: w2.dailyMeta100 * DAYS_PER_WEEK,
      period: "weekly",
      shift: "vespertino",
    },
    {
      sourceKey: "winding-t1-monthly",
      label: "Winding — meta mensual 100% (Turno 1)",
      targetValue: monthlyMeta100FromDaily(w1.dailyMeta100, w1.workingDaysPerMonth),
      period: "monthly",
      shift: "matutino",
    },
    {
      sourceKey: "winding-t2-monthly",
      label: "Winding — meta mensual 100% (Turno 2)",
      targetValue: monthlyMeta100FromDaily(w2.dailyMeta100, w2.workingDaysPerMonth),
      period: "monthly",
      shift: "vespertino",
    },
    {
      sourceKey: "bending-t1-monthly",
      label: "Bending — meta mensual 100% (Turno 1)",
      targetValue: b1.monthlyMeta100,
      period: "monthly",
      shift: "matutino",
    },
    {
      sourceKey: "bending-t2-monthly",
      label: "Bending — meta mensual 100% (Turno 2)",
      targetValue: b2.monthlyMeta100,
      period: "monthly",
      shift: "vespertino",
    },
    {
      sourceKey: "bending-t1-daily",
      label: "Bending — meta diaria derivada (Turno 1)",
      targetValue: bendingDailyMetaFromMonthly(b1.monthlyMeta100, workingDays),
      period: "daily",
      shift: "matutino",
    },
    {
      sourceKey: "bending-t2-daily",
      label: "Bending — meta diaria derivada (Turno 2)",
      targetValue: bendingDailyMetaFromMonthly(b2.monthlyMeta100, workingDays),
      period: "daily",
      shift: "vespertino",
    },
    {
      sourceKey: "roller48-t1-daily",
      label: "Roller 48 mts — cajas / día (Turno 1)",
      targetValue: r48.shift1.dailyBoxes,
      period: "daily",
      shift: "matutino",
    },
    {
      sourceKey: "roller48-t2-daily",
      label: "Roller 48 mts — cajas / día (Turno 2)",
      targetValue: r48.shift2.dailyBoxes,
      period: "daily",
      shift: "vespertino",
    },
    {
      sourceKey: "roller36-t1-daily",
      label: "Roller 36 mts — cajas / día (Turno 1)",
      targetValue: r36.shift1.dailyBoxes,
      period: "daily",
      shift: "matutino",
    },
    {
      sourceKey: "roller36-t2-daily",
      label: "Roller 36 mts — cajas / día (Turno 2)",
      targetValue: r36.shift2.dailyBoxes,
      period: "daily",
      shift: "vespertino",
    },
  ]
}

export function goalMatchesBonusDefinition(
  goal: {
    metricKind: string
    period: ApiGoalPeriod
    shift?: ApiGoalShift | null
    sku?: string | null
    startDate: string
    endDate: string
    targetValue: number
  },
  def: BonusGoalDefinition,
  monthBounds: { startDate: string; endDate: string },
): boolean {
  if (goal.metricKind !== "production") return false
  if (goal.sku?.trim()) return false
  if (goal.period !== def.period) return false
  if ((goal.shift ?? null) !== def.shift) return false
  const monthPrefix = monthBounds.startDate.slice(0, 7)
  if (!goal.startDate.startsWith(monthPrefix)) return false
  return true
}

export function buildGoalPayloadFromDefinition(
  def: BonusGoalDefinition,
  monthBounds: { startDate: string; endDate: string },
): CreateGoalPayload {
  return {
    metricKind: "production",
    targetValue: def.targetValue,
    period: def.period,
    shift: def.shift,
    startDate: monthBounds.startDate,
    endDate: monthBounds.endDate,
  }
}

/** Meta virtual (solo UI / tablero) cuando aún no existe fila sincronizada en `goals`. */
export function syntheticGoalFromDefinition(
  def: BonusGoalDefinition,
  monthBounds: { startDate: string; endDate: string },
): ApiGoal {
  return {
    id: `${BUSINESS_GOAL_ID_PREFIX}${def.sourceKey}`,
    metricKind: "production",
    machineId: null,
    sku: null,
    targetValue: def.targetValue,
    period: def.period,
    shift: def.shift,
    active: true,
    startDate: monthBounds.startDate,
    endDate: monthBounds.endDate,
    createdAt: "",
    updatedAt: "",
  }
}

/**
 * Resuelve la meta a mostrar: prioriza el valor de reglas de negocio (definición) y
 * reutiliza la fila de BD si ya fue sincronizada.
 */
export function resolveBusinessGoalForDisplay(
  dbGoals: ApiGoal[],
  def: BonusGoalDefinition,
  monthBounds: { startDate: string; endDate: string },
  options?: {
    /** Meta del turno = meta individual × operadores (solo metas Winding en Metas). */
    operatorsPerShift?: number
  },
): ApiGoal {
  const targetValue = aggregateWindingMetasGoalTarget(
    def,
    options?.operatorsPerShift ?? DEFAULT_WINDING_OPERATORS_PER_SHIFT,
  )
  const synced = dbGoals.find((g) => goalMatchesBonusDefinition(g, def, monthBounds))
  if (synced) {
    return { ...synced, targetValue }
  }
  return { ...syntheticGoalFromDefinition(def, monthBounds), targetValue }
}

export function getBonusDefinitionForGoal(
  goal: ApiGoal,
  definitions: BonusGoalDefinition[],
  monthBounds: { startDate: string; endDate: string },
): BonusGoalDefinition | null {
  if (isVirtualBusinessGoalId(goal.id)) {
    const key = goal.id.slice(BUSINESS_GOAL_ID_PREFIX.length)
    return definitions.find((d) => d.sourceKey === key) ?? null
  }
  return definitions.find((def) => goalMatchesBonusDefinition(goal, def, monthBounds)) ?? null
}

export function isBusinessManagedGoal(
  goal: ApiGoal,
  definitions: BonusGoalDefinition[],
  monthBounds: { startDate: string; endDate: string },
): boolean {
  if (isVirtualBusinessGoalId(goal.id)) return true
  return definitions.some((def) => goalMatchesBonusDefinition(goal, def, monthBounds))
}

/** Lista unificada para cumplimiento en Metas: Winding del negocio + metas personalizadas. */
export function buildGoalsForProgressTracking(
  dbGoals: ApiGoal[],
  config: BonusProductionConfigData,
  effectiveMonth: string,
  options?: { headcount?: WindingShiftHeadcount },
): ApiGoal[] {
  const allDefinitions = bonusConfigToGoalDefinitions(config)
  const metasBusinessDefinitions = bonusConfigToMetasBusinessGoalDefinitions(config)
  const bounds = monthDateBounds(effectiveMonth)
  const headcount = options?.headcount ?? resolveWindingShiftHeadcount()
  const business = metasBusinessDefinitions.map((def) =>
    resolveBusinessGoalForDisplay(dbGoals, def, bounds, {
      operatorsPerShift: windingHeadcountForShift(headcount, def.shift),
    }),
  )
  const custom = dbGoals.filter((g) => !isBusinessManagedGoal(g, allDefinitions, bounds))
  return [...business, ...custom]
}
