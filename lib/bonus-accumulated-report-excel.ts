import type { Worksheet } from "exceljs"
import type { ApiMachineCheckin } from "@/lib/api"
import type {
  BonusProductionConfigData,
} from "@/lib/bonus-production-config"
import {
  DEFAULT_BONUS_PRODUCTION_CONFIG,
  getShiftConfigSlice,
  getWorkingDaysForShift,
} from "@/lib/bonus-production-config"
import type { ProductionShiftReportSourceRow } from "@/lib/production-shift-report-excel"
import { getShiftBoundsForCalendarDate, getPartsInTimeZone } from "@/lib/shift-timezone"
import {
  mergeHolidayIsos,
  mexicanPublicHolidayIsosForMonth,
} from "@/lib/mexican-holidays"
import {
  computePersonBonusMetaAdjustments,
  countVacationDaysInPeriod,
} from "@/lib/bonus-vacation-meta"
import {
  buildDefaultSecondaryRoleByPerson,
  buildPrimaryRoleByPerson,
  buildTempSecondaryRoleByPersonDay,
  collectSectionPeople,
  effectiveRoleForDay,
  shouldShowNaForRoleContext,
  type BonusEmployeePrimaryRole,
  type BonusEmployeeRoleEvent,
} from "@/lib/bonus-role-context"
import type { EmployeeSecondaryRole } from "@/lib/employee-production-role"

const BORDER_COLOR = "FF94A3B8"
const HEADER_FILL = "FFE2E8F0"
const SUBHEADER_FILL = "FFF8FAFC"
const PENDING_FILL = "FFFFFF00" // amarillo intenso
const PENDING_FONT = "FFB91C1C" // rojo oscuro
const HEADER_FONT_ON_DARK = "FFFFFFFF"
const REPORT_TIMEZONE = "America/Mexico_City"

/** Colores del tema Office del archivo de referencia (tintes en % claro). */
const BONUS_HEADER_FILL = {
  /** Verde azulado oscuro, Énfasis 1, Claro 80% — semanas pares del bloque (14, 16…). */
  WEEK_A: "FFD0DFE6",
  /** Verde, Énfasis 6, Claro 80% — semanas impares del bloque (15, 17…). */
  WEEK_B: "FFDBEDD5",
  /** Naranja, Énfasis 2, Claro 80% — Acumulado Semanal. */
  ACUMULADO_SEMANAL: "FFFAE2D6",
  /** Ciruela, Énfasis 5 — Prod. Total Mensual Realizada. */
  PROD_TOTAL: "FFA02B93",
  /** Verde Énfasis 6, Claro 40% — Productividad Mensual. */
  PRODUCTIVIDAD_MENSUAL: "FF94CA81",
  /** Verde Énfasis 6, Claro 60% — Producción por día. */
  PRODUCCION_DIA: "FFB8DBAB",
  /** Verde Énfasis 3, Claro 80% — Producción Meta. */
  PRODUCCION_META: "FFD1E1D3",
  /** Verde Énfasis 6, Claro 80% — Piezas Excedentes. */
  PIEZAS_EXCEDENTES: "FFDBEDD5",
  /** Ciruela, Énfasis 5 — Cálculo de Bono Mensual. */
  BONO_MENSUAL: "FFA02B93",
  /** Rojo — Piezas Faltantes para Bono. */
  PIEZAS_FALTANTES: "FFC00000",
  /** Texto DF en días festivos. */
  HOLIDAY_DF_FONT: "FFC00000",
  /** Relleno suave para días festivos. */
  HOLIDAY_DF_FILL: "FFFAD4D4",
  /** Texto V — vacaciones. */
  VACATION_FONT: "FF006100",
  /** Relleno suave para vacaciones. */
  VACATION_FILL: "FFE2F0D9",
  /** Texto INC — incidencia. */
  INCIDENT_FONT: "FF7F6000",
  /** Relleno suave para incidencia. */
  INCIDENT_FILL: "FFFFF9E6",
  /** Incapacidad. */
  INCAPACITY_FONT: "FF7030A0",
  INCAPACITY_FILL: "FFF2E6FA",
  /** Texto n/a — puesto distinto al de la sección. */
  NA_FONT: "FFFF0000",
  /** Relleno n/a. */
  NA_FILL: "FFFFFFFF",
} as const

type SectionRole = "operator" | "packer" | "bending" | "roller"

type DayRoleTotals = Record<SectionRole, number>

type WeekBlock = {
  startCol: number
  endCol: number
}

const WEEK_BLOCKS: WeekBlock[] = [
  { startCol: 2, endCol: 6 }, // B-F
  { startCol: 7, endCol: 11 }, // G-K
  { startCol: 12, endCol: 16 }, // L-P
  { startCol: 17, endCol: 21 }, // Q-U
]

const borderThin = (): Partial<import("exceljs").Borders> => ({
  top: { style: "thin", color: { argb: BORDER_COLOR } },
  left: { style: "thin", color: { argb: BORDER_COLOR } },
  bottom: { style: "thin", color: { argb: BORDER_COLOR } },
  right: { style: "thin", color: { argb: BORDER_COLOR } },
})

function applyColoredHeaderStyle(
  cell: import("exceljs").Cell,
  fillArgb: string,
  fontColor?: string,
) {
  cell.font = {
    bold: true,
    size: 10,
    ...(fontColor ? { color: { argb: fontColor } } : {}),
  }
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillArgb } }
  cell.border = borderThin()
}

function paintHeaderBlock(
  sheet: Worksheet,
  row1: number,
  row2: number,
  col1: number,
  col2: number,
  fillArgb: string,
  fontColor?: string,
) {
  for (let r = row1; r <= row2; r++) {
    for (let c = col1; c <= col2; c++) {
      applyColoredHeaderStyle(sheet.getCell(r, c), fillArgb, fontColor)
    }
  }
}

function applyHeaderStyle(cell: import("exceljs").Cell) {
  cell.font = { bold: true, size: 10 }
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } }
  cell.border = borderThin()
}

function applySubHeaderStyle(cell: import("exceljs").Cell) {
  cell.font = { bold: true, size: 10 }
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUBHEADER_FILL } }
  cell.border = borderThin()
}

function applyPendingManualStyle(cell: import("exceljs").Cell) {
  cell.font = { bold: true, size: 10, color: { argb: PENDING_FONT } }
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PENDING_FILL } }
  cell.border = borderThin()
  cell.note = "Campo por confirmar (captura manual)"
}

function applyStyleRect(sheet: Worksheet, r1: number, c1: number, r2: number, c2: number, header = false) {
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const cell = sheet.getCell(r, c)
      if (header) applyHeaderStyle(cell)
      else applySubHeaderStyle(cell)
    }
  }
}

function mergeWrite(
  sheet: Worksheet,
  row: number,
  startCol: number,
  endCol: number,
  value: string,
  fillArgb: string = HEADER_FILL,
  fontColor?: string,
) {
  if (endCol > startCol) sheet.mergeCells(row, startCol, row, endCol)
  const cell = sheet.getCell(row, startCol)
  cell.value = value
  for (let c = startCol; c <= endCol; c++) {
    applyColoredHeaderStyle(sheet.getCell(row, c), fillArgb, fontColor)
  }
}

function autoFitColumns(
  sheet: Worksheet,
  lastCol: number,
  lastRow: number,
  minWidth = 10,
  maxWidth = 40,
) {
  for (let col = 1; col <= lastCol; col++) {
    let maxLength = minWidth
    for (let row = 1; row <= lastRow; row++) {
      const value = sheet.getCell(row, col).value
      if (value == null) continue
      const text = String(value)
      maxLength = Math.max(maxLength, Math.min(text.length + 2, maxWidth))
    }
    sheet.getColumn(col).width = maxLength
  }
}

function formatDdMmYyyy(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

function isoWeek(date: Date): number {
  const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = tmp.getUTCDay() || 7
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1))
  return Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

function businessDaysOfMonth(reportDate: string): Date[] {
  const [yRaw, mRaw] = reportDate.split("-")
  const year = Number(yRaw)
  const month = Number(mRaw) - 1
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 0 || month > 11) return []

  const out: Date[] = []
  const lastDay = new Date(year, month + 1, 0).getDate()
  for (let day = 1; day <= lastDay; day++) {
    const d = new Date(year, month, day)
    const weekday = d.getDay()
    if (weekday !== 0 && weekday !== 6) out.push(d)
  }
  return out
}

function applyHolidayDfStyle(cell: import("exceljs").Cell) {
  cell.value = "DF"
  cell.font = { bold: true, size: 10, color: { argb: BONUS_HEADER_FILL.HOLIDAY_DF_FONT } }
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: BONUS_HEADER_FILL.HOLIDAY_DF_FILL },
  }
  cell.alignment = { horizontal: "center", vertical: "middle" }
  cell.border = borderThin()
}

function applyAbsentStyle(cell: import("exceljs").Cell) {
  cell.value = "F"
  cell.font = { bold: true, size: 10, color: { argb: BONUS_HEADER_FILL.HOLIDAY_DF_FONT } }
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: BONUS_HEADER_FILL.HOLIDAY_DF_FILL },
  }
  cell.alignment = { horizontal: "center", vertical: "middle" }
  cell.border = borderThin()
}

function applyVacationStyle(cell: import("exceljs").Cell) {
  cell.value = "V"
  cell.font = { bold: true, size: 10, color: { argb: BONUS_HEADER_FILL.VACATION_FONT } }
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: BONUS_HEADER_FILL.VACATION_FILL },
  }
  cell.alignment = { horizontal: "center", vertical: "middle" }
  cell.border = borderThin()
}

function applyIncidentStyle(cell: import("exceljs").Cell) {
  cell.value = "INC"
  cell.font = { bold: true, size: 10, color: { argb: BONUS_HEADER_FILL.INCIDENT_FONT } }
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: BONUS_HEADER_FILL.INCIDENT_FILL },
  }
  cell.alignment = { horizontal: "center", vertical: "middle" }
  cell.border = borderThin()
}

function applyIncapacityStyle(cell: import("exceljs").Cell) {
  cell.value = "INCAP"
  cell.font = { bold: true, size: 10, color: { argb: BONUS_HEADER_FILL.INCAPACITY_FONT } }
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: BONUS_HEADER_FILL.INCAPACITY_FILL },
  }
  cell.alignment = { horizontal: "center", vertical: "middle" }
  cell.border = borderThin()
}

function applyPsgStyle(cell: import("exceljs").Cell) {
  cell.value = "PSG"
  cell.font = { bold: true, size: 10, color: { argb: "FF806000" } }
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFFF00" },
  }
  cell.alignment = { horizontal: "center", vertical: "middle" }
  cell.border = borderThin()
}

function applyTxtStyle(cell: import("exceljs").Cell) {
  cell.value = "TXT"
  cell.font = { bold: true, size: 10, color: { argb: "FF006100" } }
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF92D050" },
  }
  cell.alignment = { horizontal: "center", vertical: "middle" }
  cell.border = borderThin()
}

function applyNaStyle(cell: import("exceljs").Cell) {
  cell.value = "n/a"
  cell.font = { bold: true, size: 10, color: { argb: BONUS_HEADER_FILL.NA_FONT } }
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: BONUS_HEADER_FILL.NA_FILL },
  }
  cell.alignment = { horizontal: "center", vertical: "middle" }
  cell.border = borderThin()
}

function emptyDayRoleTotals(): DayRoleTotals {
  return { operator: 0, packer: 0, bending: 0, roller: 0 }
}

function totalRoleProduction(roles: DayRoleTotals): number {
  return roles.operator + roles.packer + roles.bending + roles.roller
}

function workedInOtherRoles(roles: DayRoleTotals, sectionRole: SectionRole): boolean {
  return (Object.keys(roles) as SectionRole[]).some(
    (role) => role !== sectionRole && roles[role] > 0,
  )
}

type EmployeeDayRecordType =
  | "vacation"
  | "incident"
  | "incapacity"
  | "excused_unpaid"
  | "time_exchange"

export type BonusManualCapture = {
  category: "bending" | "roller"
  sourceKey: string
  recordDate: string
  shift: string | null
  operatorCode: string | null
  productionQty: number
}

export type BonusEmployeeDayRecord = {
  employeeName: string
  recordDate: string
  shift: string | null
  recordType: EmployeeDayRecordType
}

function bonusShiftLabel(shiftNumber: 1 | 2): "matutino" | "vespertino" {
  return shiftNumber === 1 ? "matutino" : "vespertino"
}

function manualCaptureMatchesShift(captureShift: string | null, shiftNumber: 1 | 2): boolean {
  const normalized = captureShift?.trim().toLowerCase()
  if (!normalized) return true
  return normalized === bonusShiftLabel(shiftNumber)
}

function employeeDayRecordMatchesShift(shift: string | null, shiftNumber: 1 | 2): boolean {
  const normalized = shift?.trim().toLowerCase()
  if (!normalized) return true
  return normalized === bonusShiftLabel(shiftNumber)
}

function buildEmployeeDayRecordByPerson(
  records: BonusEmployeeDayRecord[],
  shiftNumber: 1 | 2,
): Map<string, Map<string, EmployeeDayRecordType>> {
  const out = new Map<string, Map<string, EmployeeDayRecordType>>()
  for (const rec of records) {
    if (!employeeDayRecordMatchesShift(rec.shift, shiftNumber)) continue
    const name = normalizeOperatorName(rec.employeeName)
    if (!name) continue
    const byDay = out.get(name) ?? new Map<string, EmployeeDayRecordType>()
    byDay.set(rec.recordDate, rec.recordType)
    out.set(name, byDay)
  }
  return out
}

function mergeManualCapturesIntoRoleProduction(
  roleProductionByPersonDay: Map<string, Map<string, DayRoleTotals>>,
  manualCaptures: BonusManualCapture[] | undefined,
  dayIsos: string[],
  shiftNumber: 1 | 2,
  resolvePersonFromCode: (code: string | null | undefined) => string,
): void {
  for (const cap of manualCaptures ?? []) {
    if (!manualCaptureMatchesShift(cap.shift, shiftNumber)) continue
    if (!dayIsos.includes(cap.recordDate)) continue
    const role: SectionRole = cap.category === "bending" ? "bending" : "roller"
    const name = normalizeOperatorName(resolvePersonFromCode(cap.operatorCode))
    if (!name) continue
    const qty = Number(cap.productionQty) || 0
    if (qty <= 0) continue

    const byDay = roleProductionByPersonDay.get(name) ?? new Map<string, DayRoleTotals>()
    const totals = byDay.get(cap.recordDate) ?? emptyDayRoleTotals()
    totals[role] += qty
    byDay.set(cap.recordDate, totals)
    roleProductionByPersonDay.set(name, byDay)
  }
}

function mergeManualIntoSectionProduction(
  sectionRole: "bending" | "roller",
  people: string[],
  productionByPersonDay: Map<string, Map<string, number>>,
  manualCaptures: BonusManualCapture[] | undefined,
  dayIsos: string[],
  shiftNumber: 1 | 2,
  resolvePersonFromCode: (code: string | null | undefined) => string,
): {
  people: string[]
  productionByPersonDay: Map<string, Map<string, number>>
} {
  const personSet = new Set(people)
  const prod = new Map(productionByPersonDay)

  for (const cap of manualCaptures ?? []) {
    if (cap.category !== sectionRole) continue
    if (!manualCaptureMatchesShift(cap.shift, shiftNumber)) continue
    if (!dayIsos.includes(cap.recordDate)) continue
    const name = normalizeOperatorName(resolvePersonFromCode(cap.operatorCode))
    if (!name) continue
    const qty = Number(cap.productionQty) || 0
    if (qty <= 0) continue

    personSet.add(name)
    const byDay = prod.get(name) ?? new Map<string, number>()
    byDay.set(cap.recordDate, (byDay.get(cap.recordDate) ?? 0) + qty)
    prod.set(name, byDay)
  }

  return {
    people: [...personSet].sort((a, b) => a.localeCompare(b, "es")),
    productionByPersonDay: prod,
  }
}

function getPersonActivityWindow(
  dayIsos: string[],
  rolesByDay: Map<string, DayRoleTotals>,
  presentDays: Set<string>,
): { first: number; last: number } | null {
  let first = -1
  let last = -1
  for (let i = 0; i < dayIsos.length; i++) {
    const day = dayIsos[i]
    const roles = rolesByDay.get(day) ?? emptyDayRoleTotals()
    const active = totalRoleProduction(roles) > 0 || presentDays.has(day)
    if (active) {
      if (first < 0) first = i
      last = i
    }
  }
  if (first < 0) return null
  return { first, last }
}

function aggregateCheckinPresenceByDay(
  checkins: ApiMachineCheckin[],
  dayShiftBounds: ShiftDayBound[],
  resolvePersonFromCode: (code: string | null | undefined) => string,
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()

  const addPresent = (person: string, dayIso: string) => {
    const normalized = normalizeOperatorName(person)
    if (!normalized) return
    const days = out.get(normalized) ?? new Set<string>()
    days.add(dayIso)
    out.set(normalized, days)
  }

  for (const ch of checkins) {
    const inMs = new Date(ch.checkedInAt).getTime()
    if (!Number.isFinite(inMs)) continue
    const outMs = ch.checkedOutAt
      ? new Date(ch.checkedOutAt).getTime()
      : Number.POSITIVE_INFINITY

    const names = [
      ch.operatorCode,
      ch.operator2Code,
      ch.packager1Code,
      ch.packager2Code,
      ch.packager3Code,
      ch.packager4Code,
    ]
      .map((code) => resolvePersonFromCode(code))
      .map((name) => normalizeOperatorName(name))
      .filter((name): name is string => Boolean(name))

    if (names.length === 0) continue

    for (const bound of dayShiftBounds) {
      if (inMs < bound.endMs && outMs > bound.startMs) {
        for (const name of names) {
          addPresent(name, bound.dayIso)
        }
      }
    }
  }

  return out
}

function aggregateRoleProductionByDay(
  rows: ProductionShiftReportSourceRow[],
  dayShiftBounds: ShiftDayBound[],
): Map<string, Map<string, DayRoleTotals>> {
  const out = new Map<string, Map<string, DayRoleTotals>>()

  const addToRole = (
    names: string[],
    dayIso: string,
    count: number,
    role: SectionRole,
  ) => {
    const valid = names
      .map((n) => normalizeOperatorName(n))
      .filter((n): n is string => Boolean(n))
    if (valid.length === 0) return
    const split = count / valid.length
    for (const person of valid) {
      const byDay = out.get(person) ?? new Map<string, DayRoleTotals>()
      const totals = byDay.get(dayIso) ?? emptyDayRoleTotals()
      totals[role] += split
      byDay.set(dayIso, totals)
      out.set(person, byDay)
    }
  }

  for (const row of rows) {
    if (row.event !== "Producción") continue
    const ts = new Date(row.timestamp).getTime()
    if (!Number.isFinite(ts)) continue
    const dayBound = dayShiftBounds.find((d) => ts >= d.startMs && ts < d.endMs)
    if (!dayBound) continue

    const count = Number.isFinite(row.count) ? row.count : 0
    if (count <= 0) continue

    const machine = row.machine_id ?? ""
    const isBending = machineIncludesAny(machine, ["bend", "bending", "doblado", "dobladora"])
    const isRoller = machineIncludesAny(machine, ["roll", "roller", "rodillo"])

    const operatorRole: SectionRole = isBending ? "bending" : isRoller ? "roller" : "operator"
    addToRole([row.operator, row.operator_2], dayBound.dayIso, count, operatorRole)
    addToRole([row.packer_1, row.packer_2], dayBound.dayIso, count, "packer")
  }

  return out
}

function dateToIsoInTimeZone(date: Date, timeZone: string): string {
  const p = getPartsInTimeZone(date, timeZone)
  const mm = String(p.month).padStart(2, "0")
  const dd = String(p.day).padStart(2, "0")
  return `${p.year}-${mm}-${dd}`
}

function normalizeOperatorName(value: string | null | undefined): string | null {
  const t = String(value ?? "").trim()
  if (!t || t === "—") return null
  return t
}

type ShiftDayBound = { dayIso: string; startMs: number; endMs: number }

function buildShiftDayBounds(dayDates: Date[], shiftNumber: 1 | 2): ShiftDayBound[] {
  const dayIsos = dayDates.map((d) => dateToIsoInTimeZone(d, REPORT_TIMEZONE))
  return dayIsos.map((dayIso) => {
    const { start, end } = getShiftBoundsForCalendarDate(dayIso, shiftNumber, REPORT_TIMEZONE)
    return { dayIso, startMs: start.getTime(), endMs: end.getTime() }
  })
}

function aggregatePeopleProductionByDay(
  rows: ProductionShiftReportSourceRow[],
  dayShiftBounds: ShiftDayBound[],
  extractPeople: (row: ProductionShiftReportSourceRow) => string[],
): {
  people: string[]
  productionByPersonDay: Map<string, Map<string, number>>
} {
  const personSet = new Set<string>()
  const productionByPersonDay = new Map<string, Map<string, number>>()

  const addProduction = (personName: string, dayIso: string, count: number) => {
    personSet.add(personName)
    const rowMap = productionByPersonDay.get(personName) ?? new Map<string, number>()
    rowMap.set(dayIso, (rowMap.get(dayIso) ?? 0) + count)
    productionByPersonDay.set(personName, rowMap)
  }

  for (const row of rows) {
    if (row.event !== "Producción") continue
    const ts = new Date(row.timestamp).getTime()
    if (!Number.isFinite(ts)) continue
    const dayBound = dayShiftBounds.find((d) => ts >= d.startMs && ts < d.endMs)
    if (!dayBound) continue

    const seen = new Set<string>()
    const people = extractPeople(row)
      .map((name) => normalizeOperatorName(name))
      .filter((name): name is string => Boolean(name))
      .filter((name) => {
        const key = name.toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

    const count = Number.isFinite(row.count) ? row.count : 0
    if (people.length === 0) continue

    const split = count / people.length
    for (const person of people) {
      addProduction(person, dayBound.dayIso, split)
    }
  }

  const people = [...personSet].sort((a, b) => a.localeCompare(b, "es"))
  return { people, productionByPersonDay }
}

function machineIncludesAny(machineId: string, keywords: string[]): boolean {
  const text = machineId.trim().toLowerCase()
  if (!text) return false
  return keywords.some((k) => text.includes(k))
}

function applyBonusSectionHeaderColors(sheet: Worksheet, row1: number, row2: number) {
  WEEK_BLOCKS.forEach((block, i) => {
    const fill = i % 2 === 0 ? BONUS_HEADER_FILL.WEEK_A : BONUS_HEADER_FILL.WEEK_B
    paintHeaderBlock(sheet, row1, row2, block.startCol, block.endCol, fill)
  })

  paintHeaderBlock(sheet, row1, row2, 22, 25, BONUS_HEADER_FILL.ACUMULADO_SEMANAL)
  paintHeaderBlock(sheet, row1, row2, 26, 26, BONUS_HEADER_FILL.PROD_TOTAL, HEADER_FONT_ON_DARK)
  paintHeaderBlock(sheet, row1, row2, 27, 28, BONUS_HEADER_FILL.PRODUCTIVIDAD_MENSUAL)
  paintHeaderBlock(sheet, row1, row2, 29, 32, BONUS_HEADER_FILL.PRODUCCION_DIA)
  paintHeaderBlock(sheet, row1, row2, 33, 34, BONUS_HEADER_FILL.PRODUCCION_META)
  paintHeaderBlock(sheet, row1, row2, 35, 36, BONUS_HEADER_FILL.PIEZAS_EXCEDENTES)
  paintHeaderBlock(sheet, row1, row2, 37, 40, BONUS_HEADER_FILL.BONO_MENSUAL, HEADER_FONT_ON_DARK)
  paintHeaderBlock(sheet, row1, row2, 41, 41, BONUS_HEADER_FILL.PIEZAS_FALTANTES, HEADER_FONT_ON_DARK)
}

function writeSectionHeaders(
  sheet: Worksheet,
  row1: number,
  row2: number,
  days: Date[],
  productionConfig: BonusProductionConfigData,
  shiftNumber: 1 | 2,
  leftLabel = "Operador",
) {
  sheet.getRow(row1).height = 34
  sheet.getRow(row2).height = 30

  WEEK_BLOCKS.forEach((block, i) => {
    const first = i * 5
    const slice = days.slice(first, first + 5)
    const weekLabel = slice[0] ? `Semana ${isoWeek(slice[0])} del año` : `Semana ${i + 1} del año`
    mergeWrite(sheet, row1, block.startCol, block.endCol, weekLabel)

    for (let offset = 0; offset < 5; offset++) {
      const col = block.startCol + offset
      const day = days[first + offset]
      const cell = sheet.getCell(row2, col)
      cell.value = day ? formatDdMmYyyy(day) : ""
    }
  })

  mergeWrite(sheet, row1, 22, 25, "Acumulado Semanal")
  sheet.mergeCells(row1, 26, row2, 26)
  mergeWrite(sheet, row1, 27, 28, "Productividad Mensual")
  mergeWrite(sheet, row1, 29, 32, "Producción por día")
  mergeWrite(sheet, row1, 33, 34, "Producción Meta")
  mergeWrite(sheet, row1, 35, 36, "Piezas Excedentes")
  mergeWrite(sheet, row1, 37, 40, "Calculo de Bono Mensual")
  sheet.mergeCells(row1, 41, row2, 41)

  sheet.getCell(row2, 1).value = leftLabel
  sheet.getCell(row1, 26).value = "Prod. Total Mensual Realizada"
  sheet.getCell(row2, 22).value = WEEK_BLOCKS[0] ? `Semana ${days[0] ? isoWeek(days[0]) : 1}` : "Semana 1"
  sheet.getCell(row2, 23).value = `Semana ${days[5] ? isoWeek(days[5]) : 2}`
  sheet.getCell(row2, 24).value = `Semana ${days[10] ? isoWeek(days[10]) : 3}`
  sheet.getCell(row2, 25).value = `Semana ${days[15] ? isoWeek(days[15]) : 4}`
  sheet.getCell(row2, 27).value = "Promedio"
  sheet.getCell(row2, 28).value = "Porcentaje"
  sheet.getCell(row2, 29).value = "Turbo"
  sheet.getCell(row2, 30).value = "Piezas"
  sheet.getCell(row2, 31).value = "Tail"
  sheet.getCell(row2, 32).value = "Piezas"
  sheet.getCell(row2, 33).value = "100%"
  sheet.getCell(row2, 34).value = "110%"
  sheet.getCell(row2, 35).value = "100%"
  sheet.getCell(row2, 36).value = "110%"
  sheet.getCell(row2, 37).value = "Monto"
  sheet.getCell(row2, 38).value =
    `Bono 100%-110%($${productionConfig.bonusRules.machineOver100Rate.toFixed(2)})`
  sheet.getCell(row2, 39).value =
    `Bono + 110%($${productionConfig.bonusRules.machineOver110Rate.toFixed(2)})`
  sheet.getCell(row2, 40).value = "Restante a pagar"
  sheet.getCell(row1, 41).value = "Piezas Faltantes para Bono"

  applySubHeaderStyle(sheet.getCell(row2, 1))
  applyBonusSectionHeaderColors(sheet, row1, row2)
}

function writeSectionDataRows(
  sheet: Worksheet,
  rowStart: number,
  names: string[],
  productionByPersonDay: Map<string, Map<string, number>>,
  roleProductionByPersonDay: Map<string, Map<string, DayRoleTotals>>,
  presenceByPersonDay: Map<string, Set<string>>,
  dayRecordsByPerson: Map<string, Map<string, EmployeeDayRecordType>>,
  dayIsos: string[],
  holidayIsos: Set<string>,
  sectionRole: SectionRole,
  shiftNumber: 1 | 2,
  productionConfig: BonusProductionConfigData,
  primaryRoleByPerson: Map<string, SectionRole>,
  defaultSecondaryByPerson: Map<string, EmployeeSecondaryRole>,
  tempSecondaryByPersonDay: Map<string, Map<string, EmployeeSecondaryRole>>,
): number {
  const rules = productionConfig.bonusRules
  const shiftSlice = getShiftConfigSlice(productionConfig, shiftNumber)
  const { reportMeta } = shiftSlice
  const workingDays =
    dayIsos.length > 0
      ? dayIsos.length
      : getWorkingDaysForShift(productionConfig, shiftNumber)
  const meta110Factor = 1.1

  names.forEach((name, idx) => {
    const row = rowStart + idx
    const byDay = productionByPersonDay.get(name) ?? new Map<string, number>()
    const rolesByDay = roleProductionByPersonDay.get(name) ?? new Map<string, DayRoleTotals>()
    const presentDays = presenceByPersonDay.get(name) ?? new Set<string>()
    const manualDays = dayRecordsByPerson.get(name) ?? new Map<string, EmployeeDayRecordType>()
    const activityWindow = getPersonActivityWindow(dayIsos, rolesByDay, presentDays)
    const vacationDays = countVacationDaysInPeriod(dayIsos, manualDays, holidayIsos)
    const personWorkingDays = Math.max(0, workingDays - vacationDays)
    const personMeta = computePersonBonusMetaAdjustments(
      workingDays,
      vacationDays,
      reportMeta.turboDailyMeta,
      reportMeta.tailDailyMeta,
      meta110Factor,
    )
    sheet.getCell(row, 1).value = name
    applySubHeaderStyle(sheet.getCell(row, 1))

    for (let i = 0; i < dayIsos.length; i++) {
      const col = 2 + i
      const cell = sheet.getCell(row, col)
      const dayIso = dayIsos[i]
      if (holidayIsos.has(dayIso)) {
        applyHolidayDfStyle(cell)
        continue
      }
      const dayRecord = manualDays.get(dayIso)
      if (dayRecord === "vacation") {
        applyVacationStyle(cell)
        continue
      }
      if (dayRecord === "incident") {
        applyIncidentStyle(cell)
        continue
      }
      if (dayRecord === "incapacity") {
        applyIncapacityStyle(cell)
        continue
      }
      if (dayRecord === "excused_unpaid") {
        applyPsgStyle(cell)
        continue
      }
      if (dayRecord === "time_exchange") {
        applyTxtStyle(cell)
        continue
      }
      const amount = byDay.get(dayIso) ?? 0
      const dayRoles = rolesByDay.get(dayIso) ?? emptyDayRoleTotals()
      const primaryRole = primaryRoleByPerson.get(name)
      const effectiveRole = effectiveRoleForDay(
        name,
        dayIso,
        primaryRoleByPerson,
        defaultSecondaryByPerson,
        tempSecondaryByPersonDay,
      )
      const roleMismatch = shouldShowNaForRoleContext(
        sectionRole,
        effectiveRole,
        primaryRole,
        amount,
        dayRoles,
      )
      if (amount > 0 && !roleMismatch) {
        cell.value = Number(amount.toFixed(2))
        cell.border = borderThin()
        cell.alignment = { horizontal: "center", vertical: "middle" }
        cell.numFmt = "#,##0.##"
      } else if (roleMismatch) {
        applyNaStyle(cell)
      } else if (
        activityWindow &&
        i >= activityWindow.first &&
        i <= activityWindow.last &&
        totalRoleProduction(dayRoles) === 0 &&
        !presentDays.has(dayIso)
      ) {
        applyAbsentStyle(cell)
      } else {
        cell.value = ""
        cell.border = borderThin()
        cell.alignment = { horizontal: "center", vertical: "middle" }
      }
    }

    sheet.getCell(row, 22).value = { formula: `SUM(B${row}:F${row})` }
    sheet.getCell(row, 23).value = { formula: `SUM(G${row}:K${row})` }
    sheet.getCell(row, 24).value = { formula: `SUM(L${row}:P${row})` }
    sheet.getCell(row, 25).value = { formula: `SUM(Q${row}:U${row})` }
    sheet.getCell(row, 26).value = { formula: `SUM(V${row}:Y${row})` }
    sheet.getCell(row, 27).value = {
      formula: personWorkingDays > 0 ? `Z${row}/${personWorkingDays}` : 0,
    }
    sheet.getCell(row, 28).value = { formula: `Z${row}/(AH${row}/${meta110Factor})/100` }
    sheet.getCell(row, 29).value = personWorkingDays
    sheet.getCell(row, 30).value = personMeta.turboMetaPieces
    sheet.getCell(row, 31).value = personWorkingDays
    sheet.getCell(row, 32).value = personMeta.tailMetaPieces
    sheet.getCell(row, 33).value = personMeta.combinedMeta100
    sheet.getCell(row, 34).value = personMeta.combinedMeta110
    sheet.getCell(row, 35).value = { formula: `Z${row}--AG${row}` }
    sheet.getCell(row, 36).value = { formula: `Z${row}-AH${row}` }
    sheet.getCell(row, 37).value = rules.baseBonus100
    sheet.getCell(row, 38).value = { formula: `AI${row}*${rules.machineOver100Rate}` }
    sheet.getCell(row, 39).value = { formula: `AJ${row}*${rules.machineOver110Rate}` }
    sheet.getCell(row, 40).value = { formula: `AK${row}+AL${row}+AM${row}` }
    sheet.getCell(row, 41).value = { formula: `Z${row}-AG${row}` }

    for (let c = 22; c <= 41; c++) {
      const cell = sheet.getCell(row, c)
      cell.border = borderThin()
      cell.alignment = { horizontal: "center", vertical: "middle" }
      if (c === 28) cell.numFmt = "0.00%"
      else if ([30, 32, 33, 34, 38, 39, 40].includes(c)) cell.numFmt = "#,##0.00"
      else if ([22, 23, 24, 25, 26, 27, 29, 31, 35, 36, 41].includes(c)) cell.numFmt = "#,##0.##"
    }
  })

  return names.length > 0 ? rowStart + names.length - 1 : rowStart
}

export type BonusAccumulatedReportOptions = {
  checkins?: ApiMachineCheckin[]
  resolvePersonFromCode?: (code: string | null | undefined) => string
  manualCaptures?: BonusManualCapture[]
  employeeDayRecords?: BonusEmployeeDayRecord[]
  employeeRoleEvents?: BonusEmployeeRoleEvent[]
  employeePrimaryRoles?: BonusEmployeePrimaryRole[]
  productionConfig?: BonusProductionConfigData
  /** Festivos adicionales en ISO YYYY-MM-DD (se suman a los oficiales). */
  extraHolidayIsos?: string[]
  /** Festivos resueltos (oficiales + personalizados); si se envía, sustituye el cálculo local. */
  resolvedHolidayIsos?: string[]
}

function configureTemplateSheet(
  sheet: Worksheet,
  reportDate: string,
  shiftNumber: 1 | 2,
  sourceRows: ProductionShiftReportSourceRow[],
  options: BonusAccumulatedReportOptions = {},
) {
  const productionConfig = options.productionConfig ?? DEFAULT_BONUS_PRODUCTION_CONFIG
  const businessDays = businessDaysOfMonth(reportDate)
  const days = businessDays.length > 20 ? businessDays.slice(-20) : businessDays
  const dayIsos = days.map((d) => dateToIsoInTimeZone(d, REPORT_TIMEZONE))
  const dayShiftBounds = buildShiftDayBounds(days, shiftNumber)
  const productionRows = sourceRows.filter((r) => r.event === "Producción")
  const [yearRaw, monthRaw] = reportDate.split("-")
  const reportYear = Number(yearRaw)
  const reportMonth = Number(monthRaw)
  const holidayIsos = options.resolvedHolidayIsos
    ? new Set(options.resolvedHolidayIsos)
    : mergeHolidayIsos(
        mexicanPublicHolidayIsosForMonth(reportYear, reportMonth),
        options.extraHolidayIsos ?? [],
      )
  const roleProductionByPersonDay = aggregateRoleProductionByDay(productionRows, dayShiftBounds)
  const resolvePersonFromCode = options.resolvePersonFromCode ?? (() => "")
  mergeManualCapturesIntoRoleProduction(
    roleProductionByPersonDay,
    options.manualCaptures,
    dayIsos,
    shiftNumber,
    resolvePersonFromCode,
  )
  const presenceByPersonDay = aggregateCheckinPresenceByDay(
    options.checkins ?? [],
    dayShiftBounds,
    resolvePersonFromCode,
  )
  const dayRecordsByPerson = buildEmployeeDayRecordByPerson(
    options.employeeDayRecords ?? [],
    shiftNumber,
  )
  const primaryRoleByPerson = buildPrimaryRoleByPerson(options.employeePrimaryRoles ?? [])
  const defaultSecondaryByPerson = buildDefaultSecondaryRoleByPerson(
    options.employeePrimaryRoles ?? [],
  )
  const tempSecondaryByPersonDay = buildTempSecondaryRoleByPersonDay(
    options.employeeRoleEvents ?? [],
    shiftNumber,
  )

  const sections = [
    {
      title: "Operadores",
      leftLabel: "Operador",
      sectionRole: "operator" as const,
      rows: productionRows,
      extractPeople: (r: ProductionShiftReportSourceRow) => [r.operator, r.operator_2],
    },
    {
      title: "Empacadores",
      leftLabel: "Empacador",
      sectionRole: "packer" as const,
      rows: productionRows,
      extractPeople: (r: ProductionShiftReportSourceRow) => [r.packer_1, r.packer_2],
    },
    {
      title: "Operador Bending",
      leftLabel: "Operador",
      sectionRole: "bending" as const,
      rows: productionRows.filter((r) =>
        machineIncludesAny(r.machine_id, ["bend", "bending", "doblado", "dobladora"]),
      ),
      extractPeople: (r: ProductionShiftReportSourceRow) => [r.operator, r.operator_2],
    },
    {
      title: "Operador Roller",
      leftLabel: "Operador",
      sectionRole: "roller" as const,
      rows: productionRows.filter((r) =>
        machineIncludesAny(r.machine_id, ["roll", "roller", "rodillo"]),
      ),
      extractPeople: (r: ProductionShiftReportSourceRow) => [r.operator, r.operator_2],
    },
  ] as const

  let cursorRow = 1
  let lastDataRow = 2
  sections.forEach((section, sectionIdx) => {
    if (sectionIdx > 0) {
      sheet.mergeCells(cursorRow, 1, cursorRow, 41)
      const titleCell = sheet.getCell(cursorRow, 1)
      titleCell.value = section.title
      titleCell.font = { bold: true, size: 11 }
      titleCell.alignment = { horizontal: "left", vertical: "middle" }
      titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } }
      titleCell.border = borderThin()
      for (let c = 2; c <= 41; c++) {
        const cell = sheet.getCell(cursorRow, c)
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } }
        cell.border = borderThin()
      }
      sheet.getRow(cursorRow).height = 22
      cursorRow += 1
    }

    const headerRow1 = cursorRow
    const headerRow2 = cursorRow + 1
    writeSectionHeaders(sheet, headerRow1, headerRow2, days, productionConfig, shiftNumber, section.leftLabel)

    let { people, productionByPersonDay } = aggregatePeopleProductionByDay(
      section.rows,
      dayShiftBounds,
      section.extractPeople,
    )
    if (section.sectionRole === "bending" || section.sectionRole === "roller") {
      const merged = mergeManualIntoSectionProduction(
        section.sectionRole,
        people,
        productionByPersonDay,
        options.manualCaptures,
        dayIsos,
        shiftNumber,
        resolvePersonFromCode,
      )
      people = merged.people
      productionByPersonDay = merged.productionByPersonDay
    }
    people = collectSectionPeople(
      people,
      section.sectionRole,
      primaryRoleByPerson,
      defaultSecondaryByPerson,
      tempSecondaryByPersonDay,
      dayIsos,
    )
    const dataStart = headerRow2 + 1
    const dataEnd = writeSectionDataRows(
      sheet,
      dataStart,
      people,
      productionByPersonDay,
      roleProductionByPersonDay,
      presenceByPersonDay,
      dayRecordsByPerson,
      dayIsos,
      holidayIsos,
      section.sectionRole,
      shiftNumber,
      productionConfig,
      primaryRoleByPerson,
      defaultSecondaryByPerson,
      tempSecondaryByPersonDay,
    )
    lastDataRow = Math.max(lastDataRow, dataEnd)
    cursorRow = Math.max(dataStart, dataEnd + 1) + 1
  })

  autoFitColumns(sheet, 41, lastDataRow, 10, 34)

  sheet.views = [{ state: "frozen", ySplit: 2, xSplit: 1, activeCell: "A3" }]
}

const INFO_SHEET = {
  TAIL: "FFF3E8FF",
  TURBO: "FFE0F2FE",
  ROLLER: "FFF1F5F9",
  BENDING: "FFE2F0D9",
  RULES: "FFFAE2D6",
  LEGEND_PSG: "FFFFFF00",
  LEGEND_TXT: "FF92D050",
} as const

function infoMergeWrite(
  sheet: Worksheet,
  row: number,
  colStart: number,
  colEnd: number,
  value: string | number | Date,
  fillArgb: string,
  opts?: { fontColor?: string; fontSize?: number; bold?: boolean; numFmt?: string },
) {
  if (colEnd > colStart) sheet.mergeCells(row, colStart, row, colEnd)
  for (let c = colStart; c <= colEnd; c++) {
    const cell = sheet.getCell(row, c)
    if (c === colStart) cell.value = value
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillArgb } }
    cell.font = {
      bold: opts?.bold ?? true,
      size: opts?.fontSize ?? 10,
      ...(opts?.fontColor ? { color: { argb: opts.fontColor } } : {}),
    }
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }
    cell.border = borderThin()
    if (opts?.numFmt) cell.numFmt = opts.numFmt
  }
}

function infoPaintBlock(
  sheet: Worksheet,
  r1: number,
  c1: number,
  r2: number,
  c2: number,
  fillArgb: string,
) {
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const cell = sheet.getCell(r, c)
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillArgb } }
      cell.border = borderThin()
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }
    }
  }
}

function infoWriteHeaderRow(
  sheet: Worksheet,
  row: number,
  headers: { col: number; text: string }[],
  fillArgb: string = SUBHEADER_FILL,
) {
  for (const { col, text } of headers) {
    const cell = sheet.getCell(row, col)
    cell.value = text
    cell.font = { bold: true, size: 9 }
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillArgb } }
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }
    cell.border = borderThin()
  }
}

function infoWriteCell(
  sheet: Worksheet,
  row: number,
  col: number,
  value: string | number | { formula: string },
  opts?: { bold?: boolean; align?: "left" | "center" | "right"; numFmt?: string; fill?: string },
) {
  const cell = sheet.getCell(row, col)
  cell.value = value
  cell.font = { size: 9, bold: opts?.bold ?? false }
  cell.alignment = {
    horizontal: opts?.align ?? "center",
    vertical: "middle",
    wrapText: true,
  }
  cell.border = borderThin()
  if (opts?.numFmt) cell.numFmt = opts.numFmt
  if (opts?.fill) {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: opts.fill } }
  }
}

function formatInfoMonth(reportDate: string): string {
  const [yRaw, mRaw] = reportDate.split("-")
  const year = Number(yRaw)
  const month = Number(mRaw) - 1
  if (!Number.isFinite(year) || !Number.isFinite(month)) return reportDate
  return new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" }).format(
    new Date(year, month, 1),
  )
}

function buildInformationSheet(
  sheet: Worksheet,
  reportName: string,
  reportDate: string,
  productionConfig: BonusProductionConfigData,
) {
  const { roller48, roller36, tail, turbo, bending, bonusRules } = productionConfig
  const t1 = tail.shift1
  const t2 = tail.shift2
  const tb1 = turbo.shift1
  const tb2 = turbo.shift2
  const b1 = bending.shift1
  const b2 = bending.shift2
  const monthLabel = formatInfoMonth(reportDate)
  const LAST_COL = 10

  sheet.properties.defaultRowHeight = 18
  sheet.views = [{ showGridLines: false, activeCell: "A3" }]

  // —— Encabezado ——
  infoMergeWrite(sheet, 1, 1, LAST_COL, "Información de bono", BONUS_HEADER_FILL.BONO_MENSUAL, {
    fontColor: HEADER_FONT_ON_DARK,
    fontSize: 13,
  })
  sheet.getRow(1).height = 28

  infoMergeWrite(sheet, 2, 1, 4, monthLabel, HEADER_FILL, { bold: true, fontSize: 10 })
  infoMergeWrite(
    sheet,
    2,
    5,
    LAST_COL,
    reportName,
    HEADER_FILL,
    { bold: false, fontSize: 9 },
  )
  sheet.getCell(2, 5).alignment = { horizontal: "right", vertical: "middle", wrapText: true }

  // —— Tail ——
  let row = 4
  infoMergeWrite(sheet, row, 1, 6, "Producción Tail", INFO_SHEET.TAIL, { fontSize: 10 })
  row++
  infoWriteHeaderRow(sheet, row, [
    { col: 1, text: "Turno" },
    { col: 2, text: "Meta" },
    { col: 3, text: "Máquina" },
    { col: 4, text: "Empaque" },
    { col: 5, text: "Tail" },
    { col: 6, text: "Turbo" },
  ])
  row++
  const tailStart = row
  infoWriteCell(sheet, row, 1, "1", { bold: true })
  infoWriteCell(sheet, row, 2, "100%")
  infoWriteCell(sheet, row, 3, t1.machine100, { numFmt: "#,##0" })
  infoWriteCell(sheet, row, 4, { formula: `C${row}*${t1.packMultiplier}` }, { numFmt: "#,##0" })
  infoWriteCell(sheet, row, 5, { formula: `C${row}*${t1.tailMultiplier100}` }, { numFmt: "#,##0" })
  infoWriteCell(sheet, row, 6, { formula: `${t1.turboDaily100}*${t1.turboPeriodFactor}` }, { numFmt: "#,##0" })
  row++
  infoWriteCell(sheet, row, 1, "1", { bold: true })
  infoWriteCell(sheet, row, 2, "110%")
  infoWriteCell(sheet, row, 3, t1.machine110, { numFmt: "#,##0" })
  infoWriteCell(sheet, row, 4, { formula: `C${row}*${t1.packMultiplier}` }, { numFmt: "#,##0" })
  infoWriteCell(sheet, row, 5, { formula: `C${row}*${t1.tailMultiplier110}` }, { numFmt: "#,##0" })
  infoWriteCell(sheet, row, 6, { formula: `${t1.turboDaily110}*${t1.turboPeriodFactor}` }, { numFmt: "#,##0" })
  row++
  infoWriteCell(sheet, row, 1, "2", { bold: true })
  infoWriteCell(sheet, row, 2, "100%")
  infoWriteCell(sheet, row, 3, t2.machine100, { numFmt: "#,##0" })
  infoWriteCell(sheet, row, 4, { formula: `C${row}*${t2.packMultiplier}` }, { numFmt: "#,##0" })
  infoWriteCell(sheet, row, 5, { formula: `C${row}*${t2.tailMultiplier100}` }, { numFmt: "#,##0" })
  infoWriteCell(sheet, row, 6, { formula: `${t2.turboDaily100}*${t2.turboPeriodFactor}` }, { numFmt: "#,##0" })
  row++
  infoWriteCell(sheet, row, 1, "2", { bold: true })
  infoWriteCell(sheet, row, 2, "110%")
  infoWriteCell(sheet, row, 3, t2.machine110, { numFmt: "#,##0" })
  infoWriteCell(sheet, row, 4, { formula: `C${row}*${t2.packMultiplier}` }, { numFmt: "#,##0" })
  infoWriteCell(sheet, row, 5, { formula: `C${row}*${t2.tailMultiplier110}` }, { numFmt: "#,##0" })
  infoWriteCell(sheet, row, 6, { formula: `${t2.turboDaily110}*${t2.turboPeriodFactor}` }, { numFmt: "#,##0" })
  infoPaintBlock(sheet, tailStart - 2, 1, row, 6, INFO_SHEET.TAIL)
  sheet.getCell(tailStart - 2, 1).font = { bold: true, size: 10 }

  // —— Turbo ——
  row += 2
  const turboTitleRow = row
  infoMergeWrite(sheet, row, 1, 6, "Producción Turbo", INFO_SHEET.TURBO, { fontSize: 10 })
  row++
  infoWriteHeaderRow(sheet, row, [
    { col: 1, text: "Turno" },
    { col: 2, text: "Período" },
    { col: 3, text: "Máq. 100%" },
    { col: 4, text: "Máq. 110%" },
    { col: 5, text: "Emp. 100%" },
    { col: 6, text: "Emp. 110%" },
  ])
  row++
  const turboStart = row

  const writeTurboBlock = (turno: string, tb: typeof tb1, startRow: number) => {
    const periods = [
      { label: "Día", m100: tb.machine100Daily, m110: tb.machine110Daily },
      { label: "Semana", m100: { formula: `C${startRow}*${tb.daysPerWeek}` }, m110: { formula: `D${startRow}*${tb.daysPerWeek}` } },
      { label: "Mes", m100: { formula: `C${startRow + 1}*${tb.weeksPerMonth}` }, m110: { formula: `D${startRow + 1}*${tb.weeksPerMonth}` } },
    ]
    periods.forEach((p, i) => {
      const r = startRow + i
      infoWriteCell(sheet, r, 1, turno, { bold: i === 0 })
      infoWriteCell(sheet, r, 2, p.label, { align: "left" })
      infoWriteCell(sheet, r, 3, p.m100, { numFmt: "#,##0" })
      infoWriteCell(sheet, r, 4, p.m110, { numFmt: "#,##0" })
      infoWriteCell(sheet, r, 5, { formula: `C${r}*${tb.packMultiplier}` }, { numFmt: "#,##0" })
      infoWriteCell(sheet, r, 6, { formula: `D${r}*${tb.packMultiplier}` }, { numFmt: "#,##0" })
    })
    return startRow + 2
  }

  const turboT2Start = writeTurboBlock("1", tb1, row) + 1
  writeTurboBlock("2", tb2, turboT2Start)
  infoPaintBlock(sheet, turboTitleRow, 1, turboT2Start + 2, 6, INFO_SHEET.TURBO)
  sheet.getCell(turboTitleRow, 1).font = { bold: true, size: 10 }

  // —— Roller (dos bloques lado a lado) ——
  row = turboT2Start + 4
  const rollerTitleRow = row
  infoMergeWrite(sheet, row, 1, 5, "Roller 48 m", INFO_SHEET.ROLLER, { fontSize: 10 })
  infoMergeWrite(sheet, row, 6, LAST_COL, "Roller 36 m", INFO_SHEET.ROLLER, { fontSize: 10 })
  row++
  infoWriteHeaderRow(sheet, row, [
    { col: 1, text: "Turno" },
    { col: 2, text: "Meta/día" },
    { col: 3, text: "Meta/mes" },
    { col: 4, text: "+100% / caja" },
    { col: 5, text: "" },
    { col: 6, text: "Turno" },
    { col: 7, text: "Meta/día" },
    { col: 8, text: "Meta/mes" },
    { col: 9, text: "+100% / caja" },
  ])
  row++
  const rollerDataRow = row
  infoWriteCell(sheet, row, 1, "T1")
  infoWriteCell(sheet, row, 2, `${roller48.shift1.dailyBoxes} cajas`)
  infoWriteCell(sheet, row, 3, roller48.shift1.monthlyBoxes, { numFmt: "#,##0" })
  infoWriteCell(sheet, row, 4, roller48.shift1.over100PerBox, { numFmt: "$#,##0.00" })
  infoWriteCell(sheet, row, 6, "T1")
  infoWriteCell(sheet, row, 7, `${roller36.shift1.dailyBoxes} cajas`)
  infoWriteCell(sheet, row, 8, roller36.shift1.monthlyBoxes, { numFmt: "#,##0" })
  infoWriteCell(sheet, row, 9, roller36.shift1.over100PerBox, { numFmt: "$#,##0.00" })
  row++
  infoWriteCell(sheet, row, 1, "T2")
  infoWriteCell(sheet, row, 2, `${roller48.shift2.dailyBoxes} cajas`)
  infoWriteCell(sheet, row, 3, roller48.shift2.monthlyBoxes, { numFmt: "#,##0" })
  infoWriteCell(sheet, row, 4, roller48.shift2.over100PerBox, { numFmt: "$#,##0.00" })
  infoWriteCell(sheet, row, 6, "T2")
  infoWriteCell(sheet, row, 7, `${roller36.shift2.dailyBoxes} cajas`)
  infoWriteCell(sheet, row, 8, roller36.shift2.monthlyBoxes, { numFmt: "#,##0" })
  infoWriteCell(sheet, row, 9, roller36.shift2.over100PerBox, { numFmt: "$#,##0.00" })
  row++
  infoMergeWrite(
    sheet,
    row,
    1,
    5,
    `${roller48.workingDays} días · Bono $${roller48.baseBonus.toLocaleString("es-MX")}`,
    INFO_SHEET.ROLLER,
    { bold: false, fontSize: 9 },
  )
  infoMergeWrite(
    sheet,
    row,
    6,
    LAST_COL,
    `${roller36.workingDays} días · Bono $${roller36.baseBonus.toLocaleString("es-MX")}`,
    INFO_SHEET.ROLLER,
    { bold: false, fontSize: 9 },
  )
  infoPaintBlock(sheet, rollerTitleRow, 1, row, 5, INFO_SHEET.ROLLER)
  infoPaintBlock(sheet, rollerTitleRow, 6, row, LAST_COL, INFO_SHEET.ROLLER)
  sheet.getCell(rollerTitleRow, 1).font = { bold: true, size: 10 }
  sheet.getCell(rollerTitleRow, 6).font = { bold: true, size: 10 }

  // —— Bending ——
  row += 2
  const bendTitleRow = row
  infoMergeWrite(sheet, row, 1, 5, "Bending — Turno 1", INFO_SHEET.BENDING, { fontSize: 10 })
  infoMergeWrite(sheet, row, 6, LAST_COL, "Bending — Turno 2", INFO_SHEET.BENDING, { fontSize: 10 })
  row++
  const bendDataStart = row
  const bendRows = [
    [`1.5 máquinas`, `${b1.oneHalfMachinesDailyBoxes} cajas/día`, `${b2.oneHalfMachinesDailyBoxes} cajas/día`],
    [`2 máquinas`, `${b1.twoMachinesDailyBoxes} cajas/día`, `${b2.twoMachinesDailyBoxes} cajas/día`],
    [`Por máquina`, `${b1.boxesPerMachine} cajas`, `${b2.boxesPerMachine} cajas`],
  ]
  for (const [label, t1Val, t2Val] of bendRows) {
    infoWriteCell(sheet, row, 1, label, { align: "left", bold: true })
    infoMergeWrite(sheet, row, 2, 5, t1Val, INFO_SHEET.BENDING, { bold: false, fontSize: 9 })
    infoWriteCell(sheet, row, 6, label, { align: "left", bold: true })
    infoMergeWrite(sheet, row, 7, LAST_COL, t2Val, INFO_SHEET.BENDING, { bold: false, fontSize: 9 })
    row++
  }
  infoPaintBlock(sheet, bendTitleRow, 1, row - 1, 5, INFO_SHEET.BENDING)
  infoPaintBlock(sheet, bendTitleRow, 6, row - 1, LAST_COL, INFO_SHEET.BENDING)
  sheet.getCell(bendTitleRow, 1).font = { bold: true, size: 10 }
  sheet.getCell(bendTitleRow, 6).font = { bold: true, size: 10 }
  for (let r = bendDataStart; r < row; r++) {
    sheet.getCell(r, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUBHEADER_FILL } }
    sheet.getCell(r, 6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUBHEADER_FILL } }
  }

  // —— Reglas de bono ——
  row += 2
  const rulesTitleRow = row
  infoMergeWrite(sheet, row, 1, LAST_COL, "Reglas de pago", INFO_SHEET.RULES, { fontSize: 10 })
  row++
  infoWriteHeaderRow(sheet, row, [
    { col: 1, text: "Concepto" },
    { col: 2, text: "Valor" },
  ])
  sheet.mergeCells(row, 2, row, LAST_COL)
  row++
  const rulesStart = row
  const rulesData: [string, string | number][] = [
    ["Bono base al 100%", bonusRules.baseBonus100],
    ["Máquina — piezas sobre 100%", bonusRules.machineOver100Rate],
    ["Máquina — piezas sobre 110%", bonusRules.machineOver110Rate],
    ["Empaque — piezas sobre 100%", bonusRules.packOver100Rate],
    ["Empaque — piezas sobre 110%", bonusRules.packOver110Rate],
  ]
  for (const [label, val] of rulesData) {
    infoWriteCell(sheet, row, 1, label, { align: "left" })
    const isMoney = typeof val === "number" && label.includes("Bono")
    const isRate = typeof val === "number" && label.includes("piezas")
    infoMergeWrite(
      sheet,
      row,
      2,
      LAST_COL,
      isRate ? `$${val.toFixed(2)} / pieza` : val,
      "FFFFFFFF",
      { bold: false, fontSize: 9, numFmt: isMoney ? "$#,##0.00" : undefined },
    )
    sheet.getCell(row, 2).alignment = { horizontal: "right", vertical: "middle" }
    row++
  }
  infoPaintBlock(sheet, rulesTitleRow, 1, row - 1, LAST_COL, INFO_SHEET.RULES)
  sheet.getCell(rulesTitleRow, 1).font = { bold: true, size: 10 }
  for (let r = rulesStart; r < row; r++) {
    sheet.getCell(r, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } }
  }

  // —— Leyenda de códigos (fila horizontal) ——
  row += 2
  const legendTitleRow = row
  infoMergeWrite(sheet, row, 1, LAST_COL, "Códigos en celdas diarias", HEADER_FILL, { fontSize: 10 })
  row++
  const legendRow1 = row
  const legendRow2 = row + 1
  const legendGroups: { code: string; label: string; fill: string; font?: string }[][] = [
    [
      { code: "V", label: "Vacaciones", fill: BONUS_HEADER_FILL.VACATION_FILL, font: BONUS_HEADER_FILL.VACATION_FONT },
      { code: "F", label: "Falta", fill: BONUS_HEADER_FILL.HOLIDAY_DF_FILL, font: BONUS_HEADER_FILL.HOLIDAY_DF_FONT },
      { code: "INC", label: "Incidencia", fill: BONUS_HEADER_FILL.INCIDENT_FILL, font: BONUS_HEADER_FILL.INCIDENT_FONT },
      { code: "INCAP", label: "Incapacidad", fill: BONUS_HEADER_FILL.INCAPACITY_FILL, font: BONUS_HEADER_FILL.INCAPACITY_FONT },
    ],
    [
      { code: "PSG", label: "Permiso s/goce", fill: INFO_SHEET.LEGEND_PSG },
      { code: "TXT", label: "Tiempo x tiempo", fill: INFO_SHEET.LEGEND_TXT },
      { code: "DF", label: "Día festivo", fill: BONUS_HEADER_FILL.HOLIDAY_DF_FILL, font: BONUS_HEADER_FILL.HOLIDAY_DF_FONT },
    ],
  ]
  for (let gi = 0; gi < legendGroups.length; gi++) {
    const legendRow = gi === 0 ? legendRow1 : legendRow2
    let legendCol = 1
    for (const leg of legendGroups[gi]) {
      const codeCell = sheet.getCell(legendRow, legendCol)
      codeCell.value = leg.code
      codeCell.font = { bold: true, size: 9, ...(leg.font ? { color: { argb: leg.font } } : {}) }
      codeCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: leg.fill } }
      codeCell.alignment = { horizontal: "center", vertical: "middle" }
      codeCell.border = borderThin()

      sheet.mergeCells(legendRow, legendCol + 1, legendRow, legendCol + 2)
      const labelCell = sheet.getCell(legendRow, legendCol + 1)
      labelCell.value = leg.label
      labelCell.font = { size: 9 }
      labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: leg.fill } }
      labelCell.alignment = { horizontal: "left", vertical: "middle" }
      labelCell.border = borderThin()
      sheet.getCell(legendRow, legendCol + 2).border = borderThin()

      legendCol += 3
    }
  }

  row = legendRow2 + 1
  infoMergeWrite(sheet, row, 1, 2, "n/a", BONUS_HEADER_FILL.NA_FILL, {
    bold: true,
    fontSize: 9,
    fontColor: BONUS_HEADER_FILL.NA_FONT,
  })
  infoMergeWrite(sheet, row, 3, LAST_COL, "Puesto distinto o cambio temporal de rol", BONUS_HEADER_FILL.NA_FILL, {
    bold: false,
    fontSize: 9,
    fontColor: BONUS_HEADER_FILL.NA_FONT,
  })
  sheet.getCell(row, 1).font = { bold: true, size: 9, color: { argb: BONUS_HEADER_FILL.NA_FONT } }

  // —— Nota al pie ——
  row += 2
  infoMergeWrite(
    sheet,
    row,
    1,
    LAST_COL,
    "Metas y reglas según Reglas de negocio → Configuración de bono.",
    SUBHEADER_FILL,
    { bold: false, fontSize: 8 },
  )
  sheet.getCell(row, 1).alignment = { horizontal: "center", vertical: "middle" }
  sheet.getCell(row, 1).font = { italic: true, size: 8, color: { argb: "FF64748B" } }

  const lastRow = row
  sheet.pageSetup = {
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    orientation: "portrait",
    printArea: `A1:J${lastRow}`,
  }

  const colWidths: Record<number, number> = {
    1: 14,
    2: 11,
    3: 11,
    4: 11,
    5: 11,
    6: 11,
    7: 11,
    8: 11,
    9: 11,
    10: 11,
  }
  for (const [col, width] of Object.entries(colWidths)) {
    sheet.getColumn(Number(col)).width = width
  }

  for (let r = 1; r <= lastRow; r++) {
    sheet.getRow(r).height = r === 1 ? 28 : r === legendTitleRow || r === legendRow1 || r === legendRow2 ? 20 : 18
  }
}

export function bonusAccumulatedReportFilename(reportDate: string): string {
  const [yRaw, mRaw] = reportDate.split("-")
  const year = Number(yRaw)
  const month = Number(mRaw) - 1
  const monthName = new Intl.DateTimeFormat("es-MX", { month: "long" })
    .format(new Date(year, month, 1))
    .toLowerCase()
  return `Acumulado de bono ${monthName} ${year}.xlsx`
}

export async function buildBonusAccumulatedReportBlob(
  reportDate: string,
  rows: ProductionShiftReportSourceRow[],
  options: BonusAccumulatedReportOptions = {},
): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "Paskal Métricas"
  workbook.created = new Date()

  const filename = bonusAccumulatedReportFilename(reportDate).replace(/\.xlsx$/i, "")

  const productionConfig = options.productionConfig ?? DEFAULT_BONUS_PRODUCTION_CONFIG

  const shift1 = workbook.addWorksheet("Turno 1")
  configureTemplateSheet(shift1, reportDate, 1, rows, options)

  const shift2 = workbook.addWorksheet("Turno 2")
  configureTemplateSheet(shift2, reportDate, 2, rows, options)

  const info = workbook.addWorksheet("Informacion de bono")
  buildInformationSheet(info, filename, reportDate, productionConfig)

  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
}
