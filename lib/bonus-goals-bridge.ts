import type { ApiGoalPeriod, ApiGoalShift, CreateGoalPayload } from "@/lib/api"
import type { BonusProductionConfigData } from "@/lib/bonus-production-config"
import {
  bendingDailyMetaFromMonthly,
  monthlyMeta100FromDaily,
} from "@/lib/bonus-production-config"

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

const DAYS_PER_WEEK = 5

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
