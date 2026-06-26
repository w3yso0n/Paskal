import type { ApiEmployeeDayRecord } from "@/lib/api"

export type EmployeeVacationDaysRow = {
  employeeId: string
  employeeName: string
  employeeCode: string | null
  vacationDays: number
  lastVacationDate: string | null
  onVacationToday: boolean
}

/** Agrupa días de vacación por empleado (fechas únicas en el rango). */
export function aggregateEmployeeVacationDays(
  records: ApiEmployeeDayRecord[],
  options: { from: string; to: string; today?: string },
): EmployeeVacationDaysRow[] {
  const today = options.today ?? new Date().toISOString().slice(0, 10)
  const byEmployee = new Map<
    string,
    { name: string; code: string | null; dates: Set<string> }
  >()

  for (const r of records) {
    if (r.recordType !== "vacation") continue
    if (r.recordDate < options.from || r.recordDate > options.to) continue
    const entry = byEmployee.get(r.employeeId) ?? {
      name: r.employeeName,
      code: r.employeeCode,
      dates: new Set<string>(),
    }
    entry.dates.add(r.recordDate)
    byEmployee.set(r.employeeId, entry)
  }

  return [...byEmployee.entries()]
    .map(([employeeId, { name, code, dates }]) => {
      const sorted = [...dates].sort()
      return {
        employeeId,
        employeeName: name,
        employeeCode: code,
        vacationDays: dates.size,
        lastVacationDate: sorted.at(-1) ?? null,
        onVacationToday: dates.has(today),
      }
    })
    .sort((a, b) => {
      if (b.vacationDays !== a.vacationDays) return b.vacationDays - a.vacationDays
      return a.employeeName.localeCompare(b.employeeName, "es")
    })
}
