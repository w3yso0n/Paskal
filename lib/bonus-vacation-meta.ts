import type { BonusProductionConfigData } from "@/lib/bonus-production-config"
import {
  META_110_FACTOR,
  getShiftConfigSlice,
  getWorkingDaysForShift,
} from "@/lib/bonus-production-config"

export type VacationRecordType = "vacation" | "incident" | "excused_unpaid" | "time_exchange"

export type EmployeeDayRecordForVacation = {
  employeeName: string
  recordDate: string
  shift: string | null
  recordType: VacationRecordType
}

/** Días hábiles del mes usados en el reporte de bono (máx. 20). */
export function businessDaysInReportMonth(reportDate: string): string[] {
  const [yRaw, mRaw] = reportDate.split("-")
  const year = Number(yRaw)
  const month = Number(mRaw) - 1
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 0 || month > 11) return []

  const out: string[] = []
  const lastDay = new Date(year, month + 1, 0).getDate()
  for (let day = 1; day <= lastDay; day++) {
    const d = new Date(year, month, day)
    const weekday = d.getDay()
    if (weekday !== 0 && weekday !== 6) {
      out.push(
        `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      )
    }
  }
  return out.length > 20 ? out.slice(-20) : out
}

export function countVacationDaysInPeriod(
  dayIsos: string[],
  recordsByDay: Map<string, VacationRecordType | string>,
  holidayIsos?: Set<string>,
): number {
  let count = 0
  for (const day of dayIsos) {
    if (holidayIsos?.has(day)) continue
    if (recordsByDay.get(day) === "vacation") count++
  }
  return count
}

export function effectiveBonusWorkingDays(
  baseWorkingDays: number,
  vacationDays: number,
): number {
  return Math.max(0, baseWorkingDays - vacationDays)
}

export type PersonBonusMetaAdjustments = {
  baseWorkingDays: number
  vacationDays: number
  effectiveWorkingDays: number
  dailyMeta100: number
  dailyMeta110: number
  combinedMeta100: number
  combinedMeta110: number
}

export function computePersonBonusMetaAdjustments(
  baseWorkingDays: number,
  vacationDays: number,
  dailyMeta100: number,
  meta110Factor = META_110_FACTOR,
): PersonBonusMetaAdjustments {
  const effectiveWorkingDays = effectiveBonusWorkingDays(baseWorkingDays, vacationDays)
  const dailyMeta110 = dailyMeta100 * meta110Factor
  const combinedMeta100 = dailyMeta100 * effectiveWorkingDays
  const combinedMeta110 = combinedMeta100 * meta110Factor
  return {
    baseWorkingDays,
    vacationDays,
    effectiveWorkingDays,
    dailyMeta100,
    dailyMeta110,
    combinedMeta100,
    combinedMeta110,
  }
}

export type EmployeeVacationBonusAdjustment = {
  employeeName: string
  shift: "matutino" | "vespertino"
  vacationDays: number
  baseWorkingDays: number
  effectiveWorkingDays: number
  meta100Pieces: number
  meta110Pieces: number
}

function normalizePersonName(name: string): string {
  return name.trim().replace(/\s+/g, " ")
}

function parseShift(shift: string | null): "matutino" | "vespertino" | null {
  const s = shift?.trim().toLowerCase()
  if (s === "matutino" || s === "vespertino") return s
  if (!s) return null
  return null
}

/** Ajustes de meta de bono por empleado con vacaciones registradas. */
export function buildEmployeeVacationBonusAdjustments(
  records: EmployeeDayRecordForVacation[],
  reportMonth: string,
  config: BonusProductionConfigData,
  holidayIsos?: Set<string>,
): EmployeeVacationBonusAdjustment[] {
  const monthKey = reportMonth.length >= 7 ? reportMonth.slice(0, 7) : reportMonth
  const dayIsos = businessDaysInReportMonth(`${monthKey}-01`)
  const baseDays = dayIsos.length

  const vacationDaysByPersonShift = new Map<string, Set<string>>()

  for (const rec of records) {
    if (rec.recordType !== "vacation") continue
    if (!dayIsos.includes(rec.recordDate)) continue
    if (holidayIsos?.has(rec.recordDate)) continue

    const shift = parseShift(rec.shift)
    const shifts: ("matutino" | "vespertino")[] = shift ? [shift] : ["matutino"]

    const person = normalizePersonName(rec.employeeName)
    if (!person) continue

    for (const s of shifts) {
      const key = `${person.toLowerCase()}|${s}`
      const days = vacationDaysByPersonShift.get(key) ?? new Set<string>()
      days.add(rec.recordDate)
      vacationDaysByPersonShift.set(key, days)
    }
  }

  const rows: EmployeeVacationBonusAdjustment[] = []

  for (const [key, days] of vacationDaysByPersonShift) {
    const [personKey, shift] = key.split("|") as [string, "matutino" | "vespertino"]
    const displayName =
      records.find(
        (r) =>
          normalizePersonName(r.employeeName).toLowerCase() === personKey &&
          (parseShift(r.shift) === shift || (!r.shift?.trim() && shift === "matutino")),
      )?.employeeName ?? personKey

    const shiftNumber = shift === "matutino" ? 1 : 2
    const { winding } = getShiftConfigSlice(config, shiftNumber)
    const baseWorkingDays =
      baseDays > 0 ? baseDays : getWorkingDaysForShift(config, shiftNumber)
    const adj = computePersonBonusMetaAdjustments(
      baseWorkingDays,
      days.size,
      winding.dailyMeta100,
    )

    rows.push({
      employeeName: normalizePersonName(displayName),
      shift,
      vacationDays: days.size,
      baseWorkingDays: adj.baseWorkingDays,
      effectiveWorkingDays: adj.effectiveWorkingDays,
      meta100Pieces: adj.combinedMeta100,
      meta110Pieces: adj.combinedMeta110,
    })
  }

  return rows.sort((a, b) => {
    const byName = a.employeeName.localeCompare(b.employeeName, "es")
    if (byName !== 0) return byName
    return a.shift.localeCompare(b.shift, "es")
  })
}
