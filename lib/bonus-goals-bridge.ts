import type { ApiGoalPeriod, ApiGoalShift, CreateGoalPayload } from "@/lib/api"
import type { BonusProductionConfigData } from "@/lib/bonus-production-config"

export type BonusGoalDefinition = {
  sourceKey: string
  label: string
  targetValue: number
  period: ApiGoalPeriod
  shift: ApiGoalShift | null
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

/** Metas operativas derivadas de la configuración de bono (fuente única). */
export function bonusConfigToGoalDefinitions(
  config: BonusProductionConfigData,
): BonusGoalDefinition[] {
  const t1 = config.turbo.shift1
  const t2 = config.turbo.shift2
  const r48 = config.roller48
  const r36 = config.roller36

  return [
    {
      sourceKey: "turbo-t1-daily",
      label: "Turbo — máquina 100% / día (Turno 1)",
      targetValue: t1.machine100Daily,
      period: "daily",
      shift: "matutino",
    },
    {
      sourceKey: "turbo-t2-daily",
      label: "Turbo — máquina 100% / día (Turno 2)",
      targetValue: t2.machine100Daily,
      period: "daily",
      shift: "vespertino",
    },
    {
      sourceKey: "turbo-t1-weekly",
      label: "Turbo — máquina 100% / semana (Turno 1)",
      targetValue: t1.machine100Daily * t1.daysPerWeek,
      period: "weekly",
      shift: "matutino",
    },
    {
      sourceKey: "turbo-t2-weekly",
      label: "Turbo — máquina 100% / semana (Turno 2)",
      targetValue: t2.machine100Daily * t2.daysPerWeek,
      period: "weekly",
      shift: "vespertino",
    },
    {
      sourceKey: "turbo-t1-monthly",
      label: "Turbo — máquina 100% / mes (Turno 1)",
      targetValue: t1.machine100Daily * t1.daysPerWeek * t1.weeksPerMonth,
      period: "monthly",
      shift: "matutino",
    },
    {
      sourceKey: "turbo-t2-monthly",
      label: "Turbo — máquina 100% / mes (Turno 2)",
      targetValue: t2.machine100Daily * t2.daysPerWeek * t2.weeksPerMonth,
      period: "monthly",
      shift: "vespertino",
    },
    {
      sourceKey: "tail-t1-daily",
      label: "Tail — meta diaria reporte (Turno 1)",
      targetValue: config.shiftReportMeta.shift1.tailDailyMeta,
      period: "daily",
      shift: "matutino",
    },
    {
      sourceKey: "tail-t2-daily",
      label: "Tail — meta diaria reporte (Turno 2)",
      targetValue: config.shiftReportMeta.shift2.tailDailyMeta,
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
    {
      sourceKey: "bending-t1-daily",
      label: "Bending — cajas / día con 2 máquinas (Turno 1)",
      targetValue: config.bending.shift1.twoMachinesDailyBoxes,
      period: "daily",
      shift: "matutino",
    },
    {
      sourceKey: "bending-t2-daily",
      label: "Bending — cajas / día con 2 máquinas (Turno 2)",
      targetValue: config.bending.shift2.twoMachinesDailyBoxes,
      period: "daily",
      shift: "vespertino",
    },
  ]
}

export function goalMatchesBonusDefinition(
  goal: {
    metricId: string
    period: ApiGoalPeriod
    shift?: ApiGoalShift | null
    startDate: string
    endDate: string
    targetValue: number
  },
  def: BonusGoalDefinition,
  productionMetricId: string,
  monthBounds: { startDate: string; endDate: string },
): boolean {
  if (goal.metricId !== productionMetricId) return false
  if (goal.sku?.trim()) return false
  if (goal.period !== def.period) return false
  if ((goal.shift ?? null) !== def.shift) return false
  const monthPrefix = monthBounds.startDate.slice(0, 7)
  if (!goal.startDate.startsWith(monthPrefix)) return false
  return true
}

export function buildGoalPayloadFromDefinition(
  def: BonusGoalDefinition,
  productionMetricId: string,
  monthBounds: { startDate: string; endDate: string },
): CreateGoalPayload {
  return {
    metricId: productionMetricId,
    targetValue: def.targetValue,
    period: def.period,
    shift: def.shift,
    startDate: monthBounds.startDate,
    endDate: monthBounds.endDate,
  }
}
