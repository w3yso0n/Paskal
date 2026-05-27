import type { Worksheet } from "exceljs"
import type { ProductionShiftReportSourceRow } from "@/lib/production-shift-report-excel"
import { getShiftBoundsForCalendarDate, getPartsInTimeZone } from "@/lib/shift-timezone"

const BORDER_COLOR = "FF94A3B8"
const HEADER_FILL = "FFE2E8F0"
const SUBHEADER_FILL = "FFF8FAFC"
const PENDING_FILL = "FFFFFF00" // amarillo intenso
const PENDING_FONT = "FFB91C1C" // rojo oscuro
const REPORT_TIMEZONE = "America/Mexico_City"

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

function mergeWrite(sheet: Worksheet, row: number, startCol: number, endCol: number, value: string) {
  if (endCol > startCol) sheet.mergeCells(row, startCol, row, endCol)
  const cell = sheet.getCell(row, startCol)
  cell.value = value
  for (let c = startCol; c <= endCol; c++) applyHeaderStyle(sheet.getCell(row, c))
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

function writeSectionHeaders(
  sheet: Worksheet,
  row1: number,
  row2: number,
  days: Date[],
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
  mergeWrite(sheet, row1, 37, 41, "Calculo de Bono Mensual")
  sheet.mergeCells(row1, 42, row2, 42)

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
  sheet.getCell(row2, 38).value = "Bono 100%-110%($0.10)"
  sheet.getCell(row2, 39).value = "Bono + 110%($0.12)"
  sheet.getCell(row2, 40).value = "Anticipo"
  sheet.getCell(row2, 41).value = "Restante a pagar"
  sheet.getCell(row1, 42).value = "Piezas Faltantes para Bono"

  applyStyleRect(sheet, row1, 2, row1, 42, true)
  applyStyleRect(sheet, row2, 1, row2, 41, false)
  applyHeaderStyle(sheet.getCell(row1, 42))
  applyHeaderStyle(sheet.getCell(row1, 26))
}

function writeSectionDataRows(
  sheet: Worksheet,
  rowStart: number,
  names: string[],
  productionByPersonDay: Map<string, Map<string, number>>,
  dayIsos: string[],
  holidayCol: number | null,
): number {
  names.forEach((name, idx) => {
    const row = rowStart + idx
    const byDay = productionByPersonDay.get(name) ?? new Map<string, number>()
    sheet.getCell(row, 1).value = name
    applySubHeaderStyle(sheet.getCell(row, 1))

    for (let i = 0; i < dayIsos.length; i++) {
      const col = 2 + i
      const cell = sheet.getCell(row, col)
      const amount = byDay.get(dayIsos[i]) ?? 0
      cell.value = amount > 0 ? Number(amount.toFixed(2)) : ""
      cell.border = borderThin()
      cell.alignment = { horizontal: "center", vertical: "middle" }
      if (amount > 0) cell.numFmt = "#,##0.##"
    }

    if (holidayCol != null) {
      const holidayCell = sheet.getCell(row, holidayCol)
      holidayCell.value = "DF"
      holidayCell.font = { bold: true, size: 10 }
      holidayCell.alignment = { horizontal: "center", vertical: "middle" }
      holidayCell.border = borderThin()
    }

    sheet.getCell(row, 22).value = { formula: `SUM(B${row}:F${row})` }
    sheet.getCell(row, 23).value = { formula: `SUM(G${row}:K${row})` }
    sheet.getCell(row, 24).value = { formula: `SUM(L${row}:P${row})` }
    sheet.getCell(row, 25).value = { formula: `SUM(Q${row}:U${row})` }
    sheet.getCell(row, 26).value = { formula: `SUM(V${row}:Y${row})` }
    sheet.getCell(row, 27).value = { formula: `Z${row}/19` }
    sheet.getCell(row, 28).value = { formula: `Z${row}/(AH${row}/110)/100` }
    sheet.getCell(row, 29).value = "Por confirmar"
    sheet.getCell(row, 30).value = { formula: `3650*AC${row}` }
    sheet.getCell(row, 31).value = "Por confirmar"
    sheet.getCell(row, 32).value = { formula: `2950*AE${row}` }
    sheet.getCell(row, 33).value = { formula: `AD${row}+AF${row}` }
    sheet.getCell(row, 34).value = { formula: `(AG${row}*0.1)+AG${row}` }
    sheet.getCell(row, 35).value = { formula: `Z${row}--AG${row}` }
    sheet.getCell(row, 36).value = { formula: `Z${row}-AH${row}` }
    sheet.getCell(row, 37).value = "Por confirmar"
    sheet.getCell(row, 38).value = { formula: `AI${row}*0.1` }
    sheet.getCell(row, 39).value = { formula: `AJ${row}*0.12` }
    sheet.getCell(row, 40).value = 0
    sheet.getCell(row, 41).value = { formula: `AK${row}+AL${row}+AM${row}+AN${row}` }
    sheet.getCell(row, 42).value = { formula: `Z${row}-AG${row}` }

    for (let c = 22; c <= 42; c++) {
      const cell = sheet.getCell(row, c)
      cell.border = borderThin()
      cell.alignment = { horizontal: "center", vertical: "middle" }
      if (c === 28) cell.numFmt = "0.00%"
      else if ([30, 32, 33, 34, 38, 39, 40, 41].includes(c)) cell.numFmt = "#,##0.00"
      else if ([22, 23, 24, 25, 26, 27, 35, 36, 42].includes(c)) cell.numFmt = "#,##0.##"
    }

    applyPendingManualStyle(sheet.getCell(row, 29)) // AC
    applyPendingManualStyle(sheet.getCell(row, 31)) // AE
    applyPendingManualStyle(sheet.getCell(row, 37)) // AK
  })

  return names.length > 0 ? rowStart + names.length - 1 : rowStart
}

function configureTemplateSheet(
  sheet: Worksheet,
  reportDate: string,
  shiftNumber: 1 | 2,
  sourceRows: ProductionShiftReportSourceRow[],
) {
  const businessDays = businessDaysOfMonth(reportDate)
  const days = businessDays.length > 20 ? businessDays.slice(-20) : businessDays
  const dayIsos = days.map((d) => dateToIsoInTimeZone(d, REPORT_TIMEZONE))
  const dayShiftBounds = buildShiftDayBounds(days, shiftNumber)
  const productionRows = sourceRows.filter((r) => r.event === "Producción")
  const holidayIso = (() => {
    const [yRaw, mRaw] = reportDate.split("-")
    const mm = String(Number(mRaw)).padStart(2, "0")
    return `${yRaw}-${mm}-03`
  })()
  const holidayColIndex = dayIsos.findIndex((iso) => iso === holidayIso)
  const holidayCol = holidayColIndex >= 0 ? 2 + holidayColIndex : null

  const sections = [
    {
      title: "Operadores",
      leftLabel: "Operador",
      rows: productionRows,
      extractPeople: (r: ProductionShiftReportSourceRow) => [r.operator, r.operator_2],
    },
    {
      title: "Empacadores",
      leftLabel: "Empacador",
      rows: productionRows,
      extractPeople: (r: ProductionShiftReportSourceRow) => [r.packer_1, r.packer_2],
    },
    {
      title: "Operador Bending",
      leftLabel: "Operador",
      rows: productionRows.filter((r) =>
        machineIncludesAny(r.machine_id, ["bend", "bending", "doblado", "dobladora"]),
      ),
      extractPeople: (r: ProductionShiftReportSourceRow) => [r.operator, r.operator_2],
    },
    {
      title: "Operador Roller",
      leftLabel: "Operador",
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
      sheet.mergeCells(cursorRow, 1, cursorRow, 42)
      const titleCell = sheet.getCell(cursorRow, 1)
      titleCell.value = section.title
      titleCell.font = { bold: true, size: 11 }
      titleCell.alignment = { horizontal: "left", vertical: "middle" }
      titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } }
      titleCell.border = borderThin()
      for (let c = 2; c <= 42; c++) {
        const cell = sheet.getCell(cursorRow, c)
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } }
        cell.border = borderThin()
      }
      sheet.getRow(cursorRow).height = 22
      cursorRow += 1
    }

    const headerRow1 = cursorRow
    const headerRow2 = cursorRow + 1
    writeSectionHeaders(sheet, headerRow1, headerRow2, days, section.leftLabel)

    const { people, productionByPersonDay } = aggregatePeopleProductionByDay(
      section.rows,
      dayShiftBounds,
      section.extractPeople,
    )
    const dataStart = headerRow2 + 1
    const dataEnd = writeSectionDataRows(
      sheet,
      dataStart,
      people,
      productionByPersonDay,
      dayIsos,
      holidayCol,
    )
    lastDataRow = Math.max(lastDataRow, dataEnd)
    cursorRow = Math.max(dataStart, dataEnd + 1) + 1
  })

  autoFitColumns(sheet, 42, lastDataRow, 10, 34)

  sheet.views = [{ state: "frozen", ySplit: 2, xSplit: 1, activeCell: "A3" }]
}

function buildInformationSheet(sheet: Worksheet, reportName: string, reportDate: string) {
  const firstDay = new Date(`${reportDate.slice(0, 7)}-01T00:00:00`)
  sheet.getCell("A2").value = firstDay
  sheet.getCell("A2").numFmt = "mmm-yy"

  sheet.getCell("I2").value = "Roller 48 mts"
  sheet.getCell("L2").value = "20 dias"
  sheet.getCell("L3").value = "bono: $1,650"
  sheet.getCell("I4").value = "meta por dia:"
  sheet.getCell("I5").value = "1er turno"
  sheet.getCell("J5").value = 6
  sheet.getCell("K5").value = "cajas"
  sheet.getCell("L5").value = 120
  sheet.getCell("M5").value = "$13.75"
  sheet.getCell("N5").value = "por caja arriba del 100%"
  sheet.getCell("I6").value = "2do turno"
  sheet.getCell("J6").value = 5
  sheet.getCell("K6").value = "cajas"
  sheet.getCell("L6").value = 100
  sheet.getCell("M6").value = "$16.50"
  sheet.getCell("N6").value = "por caja arriba del 100%"

  sheet.getCell("I9").value = "Roller 36 mts"
  sheet.getCell("L9").value = "20 dias"
  sheet.getCell("L10").value = "bono: $1,650"
  sheet.getCell("I11").value = "meta por dia:"
  sheet.getCell("I12").value = "1er turno"
  sheet.getCell("J12").value = 7
  sheet.getCell("K12").value = "cajas"
  sheet.getCell("L12").value = 140
  sheet.getCell("M12").value = "$11.8"
  sheet.getCell("N12").value = "por caja arriba del 100%"
  sheet.getCell("I13").value = "2do turno"
  sheet.getCell("J13").value = 6
  sheet.getCell("K13").value = "cajas"
  sheet.getCell("L13").value = 120
  sheet.getCell("M13").value = "$13.75"
  sheet.getCell("N13").value = "por caja arriba del 100%"

  sheet.mergeCells("A3:C3")
  sheet.getCell("A3").value = "Producción de Tail"
  sheet.getCell("A3").font = { bold: true }

  sheet.getCell("A4").value = "Turno 1"
  sheet.getCell("B4").value = "Maquina"
  sheet.getCell("C4").value = "Empaque"
  sheet.getCell("E4").value = "Tail"
  sheet.getCell("F4").value = "Turbo"
  sheet.getCell("A5").value = 1
  sheet.getCell("B5").value = 2950
  sheet.getCell("C5").value = { formula: "B5*2" }
  sheet.getCell("E5").value = { formula: "B5*5" }
  sheet.getCell("F5").value = { formula: "3650*5" }
  sheet.getCell("A6").value = 1.1
  sheet.getCell("B6").value = 3245
  sheet.getCell("C6").value = { formula: "B6*2" }
  sheet.getCell("E6").value = { formula: "B6*5" }
  sheet.getCell("F6").value = { formula: "7300*5" }
  sheet.getCell("A7").value = "Turno 2"
  sheet.getCell("E7").value = "Tail"
  sheet.getCell("F7").value = "Turbo"
  sheet.getCell("A8").value = 1
  sheet.getCell("B8").value = 2400
  sheet.getCell("C8").value = { formula: "B8*2" }
  sheet.getCell("E8").value = { formula: "B8*1" }
  sheet.getCell("F8").value = { formula: "3000*4" }
  sheet.getCell("A9").value = 1.1
  sheet.getCell("B9").value = 2700
  sheet.getCell("C9").value = { formula: "B9*2" }
  sheet.getCell("E9").value = { formula: "B9*1" }
  sheet.getCell("F9").value = { formula: "6000*4" }

  sheet.mergeCells("A14:F14")
  sheet.getCell("A14").value = "Producción turbo"
  sheet.getCell("A14").font = { bold: true }

  sheet.getCell("A15").value = "Turno 1"
  sheet.getCell("B15").value = "Maquina 100%"
  sheet.getCell("C15").value = "Maquina 110%"
  sheet.getCell("E15").value = "Empaque 100%"
  sheet.getCell("F15").value = "Empaque 110%"
  sheet.getCell("A16").value = "Piezas por día"
  sheet.getCell("B16").value = 3650
  sheet.getCell("C16").value = 4015
  sheet.getCell("E16").value = { formula: "B16*2" }
  sheet.getCell("F16").value = { formula: "C16*2" }
  sheet.getCell("A17").value = "Piezas por semana"
  sheet.getCell("B17").value = { formula: "B16*5" }
  sheet.getCell("C17").value = { formula: "C16*5" }
  sheet.getCell("E17").value = { formula: "E16*5" }
  sheet.getCell("F17").value = { formula: "F16*5" }
  sheet.getCell("A18").value = "Piezas por mes"
  sheet.getCell("B18").value = { formula: "B17*4" }
  sheet.getCell("C18").value = { formula: "C17*4" }
  sheet.getCell("E18").value = { formula: "E17*4" }
  sheet.getCell("F18").value = { formula: "F17*4" }

  sheet.getCell("H15").value = "Bending 100% Turno 1"
  sheet.getCell("H16").value = "58 cajas por día con maquina y media"
  sheet.getCell("H17").value = "77 cajas por día con 2 maquinas"
  sheet.getCell("L15").value = "Producción de la maquina"
  sheet.getCell("L16").value = "38.4 cajas por maquina"

  sheet.getCell("A21").value = "Turno 2"
  sheet.getCell("B21").value = "Maquina 100%"
  sheet.getCell("C21").value = "Maquina 110%"
  sheet.getCell("E21").value = "Empaque 100%"
  sheet.getCell("F21").value = "Empaque 110%"
  sheet.getCell("A22").value = "Piezas por día"
  sheet.getCell("B22").value = 3000
  sheet.getCell("C22").value = 3300
  sheet.getCell("E22").value = { formula: "B22*2" }
  sheet.getCell("F22").value = { formula: "C22*2" }
  sheet.getCell("A23").value = "Piezas por semana"
  sheet.getCell("B23").value = { formula: "B22*5" }
  sheet.getCell("C23").value = { formula: "C22*5" }
  sheet.getCell("E23").value = { formula: "E22*5" }
  sheet.getCell("F23").value = { formula: "F22*5" }
  sheet.getCell("A24").value = "Piezas por mes"
  sheet.getCell("B24").value = { formula: "B23*4" }
  sheet.getCell("C24").value = { formula: "C23*4" }
  sheet.getCell("E24").value = { formula: "E23*4" }
  sheet.getCell("F24").value = { formula: "F23*4" }

  sheet.getCell("H21").value = "Bending 100% Turno 2"
  sheet.getCell("H22").value = "46 cajas por día con maquina y media"
  sheet.getCell("H23").value = "61 cajas por día con 2 maquinas"
  sheet.getCell("L21").value = "Producción de la maquina"
  sheet.getCell("L22").value = "31.2 cajas por maquina"

  sheet.mergeCells("A27:J29")
  sheet.getCell("A27").value =
    "El monto a pagar para el bono del 100% es de $1,650 pesos. En el caso del personal de maquina, piezas realizadas despues del 100% se pagan a (0.10) centavos, piezas realizadas despues del 110% se pagan a (0.12). En el caso del personal de empaque, piezas realizadas depues del 100% se pagan a (0.05) y piezas realizadas despues del 110% se pagan a (0.06)."
  sheet.getCell("A27").alignment = { wrapText: true, horizontal: "center", vertical: "middle" }

  sheet.mergeCells("A31:J33")
  sheet.getCell("A31").value =
    "Se otorgara un anticipo de bono por la cantidad de $200 pesos al personal que cumpla con la producción meta de la semana."
  sheet.getCell("A31").alignment = { wrapText: true, horizontal: "center", vertical: "middle" }

  sheet.getCell("A35").value = "V"
  sheet.getCell("B35").value = "Vacaciones"
  sheet.getCell("A36").value = "F"
  sheet.getCell("B36").value = "Falta"
  sheet.getCell("A37").value = "PSG"
  sheet.getCell("B37").value = "Permiso sin goce"
  sheet.getCell("A38").value = "TXT"
  sheet.getCell("B38").value = "Tiempo por tiempo"

  const purple = "FFEAD1EA"
  const blue = "FFD6EEF8"
  const green = "FFCFEFCA"
  const red = "FFFF0000"
  const yellow = "FFFFFF00"
  const lightGreen = "FF92D050"
  const lightBlue = "FF9FD8F2"

  const paint = (r1: number, c1: number, r2: number, c2: number, color: string) => {
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const cell = sheet.getCell(r, c)
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } }
      }
    }
  }
  paint(3, 1, 9, 6, purple)
  paint(14, 1, 24, 6, blue)
  paint(15, 8, 17, 11, green)
  paint(21, 8, 23, 11, green)
  paint(35, 1, 35, 1, lightBlue)
  paint(36, 1, 36, 1, red)
  paint(37, 1, 37, 1, yellow)
  paint(38, 1, 38, 1, lightGreen)

  for (let r = 3; r <= 24; r++) {
    for (let c = 1; c <= 6; c++) {
      const cell = sheet.getCell(r, c)
      cell.border = borderThin()
      cell.alignment = { horizontal: "center", vertical: "middle" }
      if (typeof cell.value === "number" || (cell.value && typeof cell.value === "object" && "formula" in cell.value)) {
        cell.numFmt = "#,##0.##"
      }
    }
  }
  for (const ref of ["H15", "H16", "H17", "H21", "H22", "H23", "L15", "L16", "L21", "L22"]) {
    const cell = sheet.getCell(ref)
    cell.border = borderThin()
    cell.alignment = { vertical: "middle", wrapText: true }
  }
  for (let r = 2; r <= 13; r++) {
    for (let c = 9; c <= 14; c++) {
      const cell = sheet.getCell(r, c)
      if (cell.value == null || cell.value === "") continue
      cell.border = borderThin()
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }
      if (typeof cell.value === "string" && (cell.value.includes("$") || cell.value.includes("11.8"))) {
        cell.alignment = { horizontal: "right", vertical: "middle", wrapText: true }
      }
    }
  }
  for (const ref of ["A35", "A36", "A37", "A38", "B35", "B36", "B37", "B38"]) {
    const cell = sheet.getCell(ref)
    cell.border = borderThin()
    cell.alignment = { horizontal: "center", vertical: "middle" }
  }

  sheet.getCell("N2").value = reportName
  sheet.getCell("N3").value = "Amarillo intenso = campo por confirmar (captura manual)"
  sheet.getCell("N3").alignment = { wrapText: true }

  // En esta hoja hay textos largos en celdas combinadas; limitamos el ancho máximo
  // para evitar columnas exageradamente anchas y mantener una vista compacta.
  autoFitColumns(sheet, 14, 38, 8, 24)
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
): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "Paskal Métricas"
  workbook.created = new Date()

  const filename = bonusAccumulatedReportFilename(reportDate).replace(/\.xlsx$/i, "")

  const shift1 = workbook.addWorksheet("Turno 1")
  configureTemplateSheet(shift1, reportDate, 1, rows)

  const shift2 = workbook.addWorksheet("Turno 2")
  configureTemplateSheet(shift2, reportDate, 2, rows)

  const info = workbook.addWorksheet("Informacion de bono")
  buildInformationSheet(info, filename, reportDate)

  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
}
