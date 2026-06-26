import type { ApiEmployee } from "@/lib/api"
import { completedYearsOfService } from "@/lib/mexico-vacation-law"

/**
 * Monto mensual de vales de despensa (MXN) según antigüedad.
 * Política interna alineada a rangos de antigüedad laboral.
 */
export const DESPENSA_VOUCHER_TABLE_ROWS: { yearsLabel: string; monthlyAmountMxn: number }[] = [
  { yearsLabel: "Menos de 1 año", monthlyAmountMxn: 0 },
  { yearsLabel: "1 a 2 años", monthlyAmountMxn: 750 },
  { yearsLabel: "3 a 5 años", monthlyAmountMxn: 950 },
  { yearsLabel: "6 a 10 años", monthlyAmountMxn: 1_150 },
  { yearsLabel: "11 a 15 años", monthlyAmountMxn: 1_350 },
  { yearsLabel: "16 a 20 años", monthlyAmountMxn: 1_550 },
  { yearsLabel: "21 años o más", monthlyAmountMxn: 1_750 },
]

export const DESPENSA_POLICY_SUMMARY = [
  "Los vales de despensa se calculan con base en la antigüedad (años completos desde la fecha de ingreso).",
  "El derecho inicia al cumplir el primer año de servicio continuo.",
  "El monto mostrado es mensual y puede usarse como referencia para nómina o prestaciones.",
]

export function despensaVoucherMonthlyAmount(completedYears: number): number {
  if (completedYears < 1) return 0
  if (completedYears <= 2) return 750
  if (completedYears <= 5) return 950
  if (completedYears <= 10) return 1_150
  if (completedYears <= 15) return 1_350
  if (completedYears <= 20) return 1_550
  return 1_750
}

export function despensaTierLabel(completedYears: number): string {
  if (completedYears < 1) return DESPENSA_VOUCHER_TABLE_ROWS[0].yearsLabel
  if (completedYears <= 2) return DESPENSA_VOUCHER_TABLE_ROWS[1].yearsLabel
  if (completedYears <= 5) return DESPENSA_VOUCHER_TABLE_ROWS[2].yearsLabel
  if (completedYears <= 10) return DESPENSA_VOUCHER_TABLE_ROWS[3].yearsLabel
  if (completedYears <= 15) return DESPENSA_VOUCHER_TABLE_ROWS[4].yearsLabel
  if (completedYears <= 20) return DESPENSA_VOUCHER_TABLE_ROWS[5].yearsLabel
  return DESPENSA_VOUCHER_TABLE_ROWS[6].yearsLabel
}

export type EmployeeDespensaBenefitStatus = "no_hire_date" | "not_yet_vested" | "ok"

export type EmployeeDespensaBenefit = {
  employeeId: string
  employeeName: string
  employeeCode: string | null
  completedYears: number
  monthlyAmountMxn: number
  tierLabel: string
  status: EmployeeDespensaBenefitStatus
}

export function buildEmployeeDespensaBenefit(
  employee: ApiEmployee,
  reference: Date = new Date(),
): EmployeeDespensaBenefit {
  const hiredAt = employee.hiredAt?.trim().slice(0, 10)
  if (!hiredAt) {
    return {
      employeeId: employee.id,
      employeeName: employee.fullName,
      employeeCode: employee.employeeCode,
      completedYears: 0,
      monthlyAmountMxn: 0,
      tierLabel: "—",
      status: "no_hire_date",
    }
  }

  const completedYears = completedYearsOfService(hiredAt, reference)
  if (completedYears < 1) {
    return {
      employeeId: employee.id,
      employeeName: employee.fullName,
      employeeCode: employee.employeeCode,
      completedYears: 0,
      monthlyAmountMxn: 0,
      tierLabel: DESPENSA_VOUCHER_TABLE_ROWS[0].yearsLabel,
      status: "not_yet_vested",
    }
  }

  return {
    employeeId: employee.id,
    employeeName: employee.fullName,
    employeeCode: employee.employeeCode,
    completedYears,
    monthlyAmountMxn: despensaVoucherMonthlyAmount(completedYears),
    tierLabel: despensaTierLabel(completedYears),
    status: "ok",
  }
}

export function buildAllEmployeeDespensaBenefits(
  employees: ApiEmployee[],
  reference: Date = new Date(),
): EmployeeDespensaBenefit[] {
  return employees
    .map((e) => buildEmployeeDespensaBenefit(e, reference))
    .sort((a, b) => {
      if (b.monthlyAmountMxn !== a.monthlyAmountMxn) {
        return b.monthlyAmountMxn - a.monthlyAmountMxn
      }
      return a.employeeName.localeCompare(b.employeeName, "es")
    })
}

export function formatDespensaMxn(amount: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(amount)
}
