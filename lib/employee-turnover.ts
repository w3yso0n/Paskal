import type { ApiEmployee } from "@/lib/api"

export type MonthlyTurnoverMetrics = {
  terminations: number
  hires: number
  totalEmployeesLastMonth: number
  denominator: number
  turnoverPercent: number | null
  monthLabel: string
  year: number
  month: number
}

function formatYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function monthRange(year: number, monthIndex: number): { start: string; end: string } {
  const mm = String(monthIndex + 1).padStart(2, "0")
  const lastDay = new Date(year, monthIndex + 1, 0).getDate()
  return {
    start: `${year}-${mm}-01`,
    end: `${year}-${mm}-${String(lastDay).padStart(2, "0")}`,
  }
}

function ymdInRange(ymd: string, start: string, end: string): boolean {
  const t = ymd.trim().slice(0, 10)
  return t >= start && t <= end
}

function employmentStartYmd(employee: ApiEmployee): string | null {
  const hired = employee.hiredAt?.trim().slice(0, 10)
  if (hired && /^\d{4}-\d{2}-\d{2}$/.test(hired)) return hired
  const created = employee.createdAt?.trim().slice(0, 10)
  if (created && /^\d{4}-\d{2}-\d{2}$/.test(created)) return created
  return null
}

/** Empleado activo en plantilla a una fecha de corte (usa updatedAt si está dado de baja). */
export function wasEmployedOn(employee: ApiEmployee, asOfYmd: string): boolean {
  const start = employmentStartYmd(employee)
  if (!start || start > asOfYmd) return false
  if (employee.status === "terminated") {
    const term = employee.updatedAt?.trim().slice(0, 10)
    if (term && /^\d{4}-\d{2}-\d{2}$/.test(term) && term <= asOfYmd) return false
  }
  return true
}

/**
 * Turnover mensual (%):
 * (bajas del mes / (plantilla fin mes anterior + altas del mes)) × 100
 */
export function computeMonthlyTurnover(
  employees: ApiEmployee[],
  reference: Date = new Date(),
): MonthlyTurnoverMetrics {
  const year = reference.getFullYear()
  const month = reference.getMonth()
  const current = monthRange(year, month)
  const lastDayPrevMonth = formatYmd(new Date(year, month, 0))

  let terminations = 0
  let hires = 0

  for (const e of employees) {
    const start = employmentStartYmd(e)
    if (start && ymdInRange(start, current.start, current.end)) hires++

    if (e.status === "terminated") {
      const term = e.updatedAt?.trim().slice(0, 10)
      if (term && ymdInRange(term, current.start, current.end)) terminations++
    }
  }

  const totalEmployeesLastMonth = employees.filter((e) =>
    wasEmployedOn(e, lastDayPrevMonth),
  ).length

  const denominator = totalEmployeesLastMonth + hires
  const turnoverPercent =
    denominator > 0 ? Math.round((terminations / denominator) * 1000) / 10 : null

  return {
    terminations,
    hires,
    totalEmployeesLastMonth,
    denominator,
    turnoverPercent,
    monthLabel: reference.toLocaleDateString("es-MX", { month: "long", year: "numeric" }),
    year,
    month,
  }
}

export function formatTurnoverPercent(value: number | null): string {
  if (value == null) return "—"
  return `${value.toFixed(1)}%`
}
