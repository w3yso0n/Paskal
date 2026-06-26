import type { ApiEmployee, ApiEmployeeDayRecord } from "@/lib/api"

/** Días mínimos de vacaciones según la Ley Federal del Trabajo (México, tabla vigente). */
export function lftVacationEntitlementDays(completedYears: number): number {
  if (completedYears < 1) return 0
  if (completedYears === 1) return 12
  if (completedYears === 2) return 14
  if (completedYears === 3) return 16
  if (completedYears === 4) return 18
  if (completedYears === 5) return 20
  if (completedYears <= 10) return 22
  if (completedYears <= 15) return 24
  if (completedYears <= 20) return 26
  if (completedYears <= 25) return 28
  if (completedYears <= 30) return 30
  return 32
}

/** Tabla resumida para mostrar en UI. */
export const LFT_VACATION_TABLE_ROWS: { yearsLabel: string; days: number }[] = [
  { yearsLabel: "1 año", days: 12 },
  { yearsLabel: "2 años", days: 14 },
  { yearsLabel: "3 años", days: 16 },
  { yearsLabel: "4 años", days: 18 },
  { yearsLabel: "5 años", days: 20 },
  { yearsLabel: "6 a 10 años", days: 22 },
  { yearsLabel: "11 a 15 años", days: 24 },
  { yearsLabel: "16 a 20 años", days: 26 },
  { yearsLabel: "21 a 25 años", days: 28 },
  { yearsLabel: "26 a 30 años", days: 30 },
  { yearsLabel: "31 años o más", days: 32 },
]

export function parseYmd(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number)
  return new Date(y, m - 1, d)
}

export function formatYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export function addCalendarYears(base: Date, years: number): Date {
  const d = new Date(base.getTime())
  d.setFullYear(d.getFullYear() + years)
  return d
}

/** Años completos de antigüedad a una fecha de referencia. */
export function completedYearsOfService(hiredAt: string, reference: Date = new Date()): number {
  const hire = parseYmd(hiredAt)
  if (reference < hire) return 0
  let years = reference.getFullYear() - hire.getFullYear()
  const monthDiff = reference.getMonth() - hire.getMonth()
  const dayDiff = reference.getDate() - hire.getDate()
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) years--
  return Math.max(0, years)
}

export type VacationPeriodInfo = {
  completedYears: number
  entitledDays: number
  /** Inicio del periodo para disfrutar el derecho vigente (aniversario). */
  periodStart: string | null
  /** Último día del periodo (12 meses después del aniversario). */
  periodEnd: string | null
  /** Próximo aniversario si aún no cumple el primer año. */
  nextVestingDate: string | null
}

/**
 * Periodo vacacional actual: 12 meses desde el aniversario laboral para hacer efectivos
 * los días que corresponden por antigüedad (LFT).
 */
export function getCurrentVacationPeriod(
  hiredAt: string,
  reference: Date = new Date(),
): VacationPeriodInfo {
  const hire = parseYmd(hiredAt)
  const years = completedYearsOfService(hiredAt, reference)

  if (years < 1) {
    return {
      completedYears: 0,
      entitledDays: 0,
      periodStart: null,
      periodEnd: null,
      nextVestingDate: formatYmd(addCalendarYears(hire, 1)),
    }
  }

  const vesting = addCalendarYears(hire, years)
  const periodEndDate = addCalendarYears(vesting, 1)
  periodEndDate.setDate(periodEndDate.getDate() - 1)

  return {
    completedYears: years,
    entitledDays: lftVacationEntitlementDays(years),
    periodStart: formatYmd(vesting),
    periodEnd: formatYmd(periodEndDate),
    nextVestingDate: formatYmd(addCalendarYears(hire, years + 1)),
  }
}

function daysBetweenInclusive(from: string, to: string): number {
  const a = parseYmd(from).getTime()
  const b = parseYmd(to).getTime()
  if (b < a) return 0
  return Math.round((b - a) / 86_400_000) + 1
}

export type EmployeeVacationBalanceStatus =
  | "no_hire_date"
  | "not_yet_vested"
  | "ok"
  | "expiring_soon"
  | "exceeded"
  | "unused_after_period"

export type EmployeeVacationBalance = {
  employeeId: string
  employeeName: string
  employeeCode: string | null
  hiredAt: string | null
  completedYears: number
  entitledDays: number
  usedDays: number
  remainingDays: number
  periodStart: string | null
  periodEnd: string | null
  nextVestingDate: string | null
  daysUntilPeriodEnd: number | null
  status: EmployeeVacationBalanceStatus
}

function countVacationDaysInRange(
  records: ApiEmployeeDayRecord[],
  employeeId: string,
  from: string,
  to: string,
): number {
  const dates = new Set<string>()
  for (const r of records) {
    if (r.employeeId !== employeeId || r.recordType !== "vacation") continue
    if (r.recordDate < from || r.recordDate > to) continue
    dates.add(r.recordDate)
  }
  return dates.size
}

export function buildEmployeeVacationBalance(
  employee: ApiEmployee,
  vacationRecords: ApiEmployeeDayRecord[],
  reference: Date = new Date(),
): EmployeeVacationBalance {
  const base = {
    employeeId: employee.id,
    employeeName: employee.fullName,
    employeeCode: employee.employeeCode,
    hiredAt: employee.hiredAt?.slice(0, 10) ?? null,
  }

  if (!base.hiredAt) {
    return {
      ...base,
      completedYears: 0,
      entitledDays: 0,
      usedDays: 0,
      remainingDays: 0,
      periodStart: null,
      periodEnd: null,
      nextVestingDate: null,
      daysUntilPeriodEnd: null,
      status: "no_hire_date",
    }
  }

  const period = getCurrentVacationPeriod(base.hiredAt, reference)
  const today = formatYmd(reference)

  if (period.completedYears < 1) {
    return {
      ...base,
      completedYears: 0,
      entitledDays: 0,
      usedDays: 0,
      remainingDays: 0,
      periodStart: null,
      periodEnd: null,
      nextVestingDate: period.nextVestingDate,
      daysUntilPeriodEnd: period.nextVestingDate
        ? daysBetweenInclusive(today, period.nextVestingDate) - 1
        : null,
      status: "not_yet_vested",
    }
  }

  const usedDays = countVacationDaysInRange(
    vacationRecords,
    employee.id,
    period.periodStart!,
    period.periodEnd!,
  )
  const remainingDays = Math.max(0, period.entitledDays - usedDays)
  const daysUntilPeriodEnd =
    period.periodEnd && today <= period.periodEnd
      ? daysBetweenInclusive(today, period.periodEnd)
      : 0

  let status: EmployeeVacationBalanceStatus = "ok"
  if (usedDays > period.entitledDays) status = "exceeded"
  else if (today > period.periodEnd! && remainingDays > 0) status = "unused_after_period"
  else if (remainingDays > 0 && daysUntilPeriodEnd <= 30) status = "expiring_soon"

  return {
    ...base,
    completedYears: period.completedYears,
    entitledDays: period.entitledDays,
    usedDays,
    remainingDays,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    nextVestingDate: period.nextVestingDate,
    daysUntilPeriodEnd,
    status,
  }
}

export function buildAllEmployeeVacationBalances(
  employees: ApiEmployee[],
  vacationRecords: ApiEmployeeDayRecord[],
  reference: Date = new Date(),
): EmployeeVacationBalance[] {
  return employees
    .filter((e) => e.status !== "terminated")
    .map((e) => buildEmployeeVacationBalance(e, vacationRecords, reference))
    .sort((a, b) => {
      if (a.status === "no_hire_date" && b.status !== "no_hire_date") return 1
      if (b.status === "no_hire_date" && a.status !== "no_hire_date") return -1
      if (b.remainingDays !== a.remainingDays) return b.remainingDays - a.remainingDays
      return a.employeeName.localeCompare(b.employeeName, "es")
    })
}

export const LFT_VACATION_POLICY_SUMMARY = [
  "Al cumplir 1 año de servicio continuo, el trabajador tiene derecho a un mínimo de 12 días de vacaciones; la tabla aumenta conforme la antigüedad (Ley Federal del Trabajo).",
  "Los días se deben disfrutar dentro del periodo vacacional: tienes 12 meses desde tu aniversario laboral para tomarlos antes del siguiente ciclo.",
  "La empresa debe otorgar las vacaciones dentro de los seis meses siguientes al aniversario (art. 81 LFT). Este módulo ayuda a llevar el control; consulta a RH para casos especiales.",
] as const
