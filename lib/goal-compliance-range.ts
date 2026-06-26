import type { ApiGoalPeriod } from "@/lib/api"

/** Fecha fin interna para metas sin rango de bono (vigencia abierta en BD). */
export const GOAL_OPEN_END_DATE = "2099-12-31"

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

export function todayYmd(ref: Date = new Date()): string {
  return `${ref.getFullYear()}-${pad2(ref.getMonth() + 1)}-${pad2(ref.getDate())}`
}

export function isOpenEndedGoal(goal: { endDate: string }): boolean {
  return goal.endDate >= GOAL_OPEN_END_DATE
}

/**
 * Ventana de cumplimiento según el periodo de la meta (diaria, semanal, etc.).
 * Las metas de bono conservan start/end del mes en BD.
 */
export function goalComplianceDateRange(
  goal: { period: ApiGoalPeriod; startDate: string; endDate: string },
  ref: Date = new Date(),
): { startDate: string; endDate: string } {
  if (!isOpenEndedGoal(goal)) {
    return { startDate: goal.startDate, endDate: goal.endDate }
  }

  const y = ref.getFullYear()
  const m = ref.getMonth()
  const today = todayYmd(ref)

  switch (goal.period) {
    case "daily":
      return { startDate: today, endDate: today }
    case "weekly": {
      const day = ref.getDay()
      const diffToMon = day === 0 ? -6 : 1 - day
      const mon = new Date(ref)
      mon.setDate(ref.getDate() + diffToMon)
      const sun = new Date(mon)
      sun.setDate(mon.getDate() + 6)
      return { startDate: todayYmd(mon), endDate: todayYmd(sun) }
    }
    case "monthly":
      return { startDate: `${y}-${pad2(m + 1)}-01`, endDate: today }
    case "quarterly": {
      const qStart = Math.floor(m / 3) * 3
      return { startDate: `${y}-${pad2(qStart + 1)}-01`, endDate: today }
    }
    case "yearly":
      return { startDate: `${y}-01-01`, endDate: today }
    default:
      return { startDate: today, endDate: today }
  }
}

export function isGoalActive(goal: { active?: boolean }): boolean {
  return goal.active !== false
}
