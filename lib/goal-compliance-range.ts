import type { ApiGoalPeriod } from "@/lib/api"

/** Fecha fin interna para metas sin rango de bono (vigencia abierta en BD). */
export const GOAL_OPEN_END_DATE = "2099-12-31"

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

export function todayYmd(ref: Date = new Date()): string {
  // Día calendario en zona de planta (evita desfases UTC al cargar metas de madrugada).
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ref)
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
  const today = todayYmd(ref)

  // Diaria = siempre el día de referencia (aunque en BD venga el rango del mes de bono).
  if (goal.period === "daily") {
    return { startDate: today, endDate: today }
  }

  if (!isOpenEndedGoal(goal)) {
    return { startDate: goal.startDate, endDate: goal.endDate }
  }

  const y = ref.getFullYear()
  const m = ref.getMonth()

  switch (goal.period) {
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
