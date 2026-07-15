import type { CellValue, Worksheet } from "exceljs"
import type { ProductionShiftReportSourceRow } from "@/lib/production-shift-report-excel"
import { getPartsInTimeZone } from "@/lib/shift-timezone"

const TZ = "America/Mexico_City"
const BORDER = "FF94A3B8"
const HEADER = "FFE2E8F0"
const MANUAL_FILL = "FFFFC000"
const MANUAL_FONT = "FF7C2D12"

type ShiftKind = "matutino" | "vespertino"

type ShiftRow = {
  date: Date
  month: number
  machine: string
  operator1: string
  operator2: string
  item: string
  boxCount: number
  unitsPerBox: number
  totalPieces: number
  packer1: string
  packer1Boxes: number
  packer2: string
  packer2Boxes: number
  totalBoxes: number
  difference: number
  packedPieces1: number
  packedPieces2: number
  bending?: {
    boxCount: number
    unitsPerBox: number
    totalPieces: number
  }
  roller?: {
    boxCount: number
    unitsPerBox: number
    totalPieces: number
  }
}

const borderThin = () => ({
  top: { style: "thin" as const, color: { argb: BORDER } },
  left: { style: "thin" as const, color: { argb: BORDER } },
  bottom: { style: "thin" as const, color: { argb: BORDER } },
  right: { style: "thin" as const, color: { argb: BORDER } },
})

function styleHeader(cell: import("exceljs").Cell) {
  cell.font = { bold: true, size: 10 }
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER } }
  cell.border = borderThin()
}

function styleData(cell: import("exceljs").Cell) {
  cell.font = { size: 10 }
  cell.alignment = { vertical: "middle", wrapText: true }
  cell.border = borderThin()
}

function styleNumber(cell: import("exceljs").Cell) {
  styleData(cell)
  cell.alignment = { horizontal: "right", vertical: "middle" }
  cell.numFmt = "#,##0.##"
}

function styleManual(cell: import("exceljs").Cell) {
  cell.font = { bold: true, color: { argb: MANUAL_FONT }, size: 10 }
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: MANUAL_FILL } }
  cell.border = borderThin()
  cell.note = "Dato manual por confirmar"
}

function isBendingMachine(machine: string): boolean {
  const m = machine.toLowerCase()
  return m.includes("bend") || m.includes("bending") || m.includes("doblad")
}

function isRollerMachine(machine: string): boolean {
  const m = machine.toLowerCase()
  return m.includes("roll") || m.includes("roller") || m.includes("rodillo")
}


function safeName(v: string | null | undefined): string {
  const t = String(v ?? "").trim()
  return t && t !== "—" ? t : "—"
}

function toShiftRows(sourceRows: ProductionShiftReportSourceRow[]) {
  const matutino: ShiftRow[] = []
  const vespertino: ShiftRow[] = []

  for (const row of sourceRows) {
    if (row.event !== "Producción") continue
    const ts = new Date(row.timestamp)
    if (Number.isNaN(ts.getTime())) continue
    // Turno por operadora: la fila ya viene clasificada (asignado, fallback reloj).
    const shift = row.shift

    const count = Number.isFinite(row.count) ? row.count : 0
    const upb = row.unitsPerBox > 0 ? row.unitsPerBox : 48
    const totalPieces = count * upb
    const p1 = safeName(row.packer_1)
    const p2 = safeName(row.packer_2)
    const hasP1 = p1 !== "—"
    const hasP2 = p2 !== "—"
    let p1Boxes = 0
    let p2Boxes = 0
    if (hasP1 && hasP2) {
      p1Boxes = count / 2
      p2Boxes = count / 2
    } else if (hasP1) {
      p1Boxes = count
    } else if (hasP2) {
      p2Boxes = count
    }

    const data: ShiftRow = {
      date: ts,
      month: getPartsInTimeZone(ts, TZ).month,
      machine: row.machine_id,
      operator1: safeName(row.operator),
      operator2: safeName(row.operator_2),
      item: safeName(row.sku),
      boxCount: count,
      unitsPerBox: upb,
      totalPieces,
      packer1: p1,
      packer1Boxes: p1Boxes,
      packer2: p2,
      packer2Boxes: p2Boxes,
      totalBoxes: p1Boxes + p2Boxes,
      difference: count - (p1Boxes + p2Boxes),
      packedPieces1: p1Boxes * upb,
      packedPieces2: p2Boxes * upb,
    }

    if (isBendingMachine(row.machine_id)) {
      data.bending = { boxCount: count, unitsPerBox: upb, totalPieces }
    }
    if (isRollerMachine(row.machine_id)) {
      data.roller = { boxCount: count, unitsPerBox: upb, totalPieces }
    }

    if (shift === "matutino") matutino.push(data)
    else vespertino.push(data)
  }
  return { matutino, vespertino }
}

function autoFit(sheet: Worksheet, cols: number, rows: number) {
  for (let c = 1; c <= cols; c++) {
    let max = 10
    for (let r = 1; r <= rows; r++) {
      const v = sheet.getCell(r, c).value
      if (v == null) continue
      max = Math.max(max, Math.min(String(v).length + 2, 42))
    }
    sheet.getColumn(c).width = max
  }
}

function renderShiftSheet(sheet: Worksheet, rows: ShiftRow[], english = false) {
  const headersA = english
    ? [
        "Date",
        "Month",
        "Machine",
        "Operator 1",
        "Operator 2",
        "Item",
        "Number of boxes",
        "Pieces per box",
        "Total pieces",
        "Packer",
        "Quantity in boxes 2",
        "Packer 2",
        "Quantity in boxes",
        "Total in boxes",
        "Diference",
        "Total in packed parts",
        "Total in packed parts 2",
      ]
    : [
        "Fecha",
        "Mes",
        "Máquina",
        "Operador (a) 1",
        "Operador(a)2",
        "Item",
        "Cantidad de Cajas",
        "Piezas / Caja",
        "Piezas Totales",
        "Empacador (a) 1",
        "Cantidad en cajas",
        "Empacador (a) 2",
        "Cantidad en cajas",
        "Total en cajas",
        "Diferencia",
        "Total en Piezas Empacadas 1",
        "Total en Piezas Empacadas 2",
      ]

  const headersB = english
    ? ["Date", "Month", "Machine", "Operator 1", "Item", "Number of boxes", "Pieces per box", "Total pieces"]
    : ["Fecha", "Mes", "Máquina", "Operador (a) 1", "Item", "Cantidad de Cajas", "Pieces", "Total de piezas "]
  const headersC = english
    ? ["Date", "Month", "Machine", "Operator 1", "Item", "Number of boxes", "Pieces per box", "Total pieces"]
    : ["Fecha", "Mes", "Máquina", "Operador (a) 1", "Item", "Cantidad de Cajas", "Piezas / Caja", "Total de piezas "]

  headersA.forEach((h, i) => {
    const cell = sheet.getCell(1, i + 1)
    cell.value = h
    styleHeader(cell)
  })
  headersB.forEach((h, i) => {
    const cell = sheet.getCell(1, 18 + i)
    cell.value = h
    styleHeader(cell)
  })
  headersC.forEach((h, i) => {
    const cell = sheet.getCell(1, 27 + i)
    cell.value = h
    styleHeader(cell)
  })

  rows.forEach((r, idx) => {
    const row = idx + 2
    const mainValues: CellValue[] = [
      r.date,
      r.month,
      r.machine,
      r.operator1,
      r.operator2,
      r.item,
      r.boxCount,
      r.unitsPerBox,
      r.totalPieces,
      r.packer1,
      r.packer1Boxes,
      r.packer2,
      r.packer2Boxes,
      r.totalBoxes,
      r.difference,
      r.packedPieces1,
      r.packedPieces2,
    ]
    mainValues.forEach((v, i) => {
      const c = i + 1
      const cell = sheet.getCell(row, c)
      cell.value = v
      if (c === 1) cell.numFmt = "yyyy-mm-dd"
      if ([2, 7, 8, 9, 11, 13, 14, 15, 16, 17].includes(c)) styleNumber(cell)
      else styleData(cell)
    })
    const bend = r.bending
    const bendValues: CellValue[] = bend
      ? [r.date, r.month, r.machine, r.operator1, r.item, bend.boxCount, bend.unitsPerBox, bend.totalPieces]
      : ["", "", "", "", "", "", "", ""]
    bendValues.forEach((v, i) => {
      const c = 18 + i
      const cell = sheet.getCell(row, c)
      cell.value = v
      if (c === 18 && v) cell.numFmt = "yyyy-mm-dd"
      if ([19, 23, 24, 25].includes(c)) styleNumber(cell)
      else styleData(cell)
    })
    const roll = r.roller
    const rollValues: CellValue[] = roll
      ? [r.date, r.month, r.machine, r.operator1, r.item, roll.boxCount, roll.unitsPerBox, roll.totalPieces]
      : ["", "", "", "", "", "", "", ""]
    rollValues.forEach((v, i) => {
      const c = 27 + i
      const cell = sheet.getCell(row, c)
      cell.value = v
      if (c === 27 && v) cell.numFmt = "yyyy-mm-dd"
      if ([28, 32, 33, 34].includes(c)) styleNumber(cell)
      else styleData(cell)
    })
  })

  autoFit(sheet, 34, Math.max(2, rows.length + 1))
  sheet.views = [{ state: "frozen", ySplit: 1, activeCell: "A2" }]
}

function monthNameEs(month: number): string {
  return [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ][month - 1]
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

function renderTotalProductionSheet(sheet: Worksheet, year: number) {
  sheet.mergeCells("A1:C1")
  sheet.getCell("A1").value = "Monthly metal production"
  sheet.mergeCells("E1:G1")
  sheet.getCell("E1").value = "Monthly bending production"
  sheet.mergeCells("I1:K1")
  sheet.getCell("I1").value = "Monthly roller production"
  sheet.mergeCells("M1:T1")
  sheet.getCell("M1").value = "Average monthly production/First shift"
  for (const ref of ["A1", "E1", "I1", "M1"]) styleHeader(sheet.getCell(ref))

  const row2 = [
    ["A2", "Monthly production"],
    ["B2", "1ST SHIFT"],
    ["C2", "2ND SHIFT"],
    ["E2", "Monthly production"],
    ["F2", "1ST SHIFT"],
    ["G2", "2ND SHIFT"],
    ["I2", "Monthly production"],
    ["J2", "1ST SHIFT"],
    ["K2", "2ND SHIFT"],
    ["M2", "Month"],
    ["N2", "Total op per month"],
    ["O2", "Days worked"],
    ["P2", "Average op per month"],
    ["Q2", "Prod. Month"],
  ] as const
  row2.forEach(([ref, text]) => {
    sheet.getCell(ref).value = text
    styleHeader(sheet.getCell(ref))
  })

  for (let m = 1; m <= 12; m++) {
    const r = m + 2
    sheet.getCell(`A${r}`).value = monthNameEs(m)
    sheet.getCell(`B${r}`).value = { formula: `SUMIF('Turno Matutino'!B:B,${m},'Turno Matutino'!I:I)` }
    sheet.getCell(`C${r}`).value = { formula: `SUMIF('Turno Vespertino'!B:B,${m},'Turno Vespertino'!I:I)` }
    sheet.getCell(`E${r}`).value = monthNameEs(m)
    sheet.getCell(`F${r}`).value = { formula: `SUMIF('Turno Matutino'!S:S,${m},'Turno Matutino'!Y:Y)` }
    sheet.getCell(`G${r}`).value = { formula: `SUMIF('Turno Vespertino'!S:S,${m},'Turno Vespertino'!Y:Y)` }
    sheet.getCell(`I${r}`).value = monthNameEs(m)
    sheet.getCell(`J${r}`).value = { formula: `SUMIF('Turno Matutino'!AB:AB,${m},'Turno Matutino'!AH:AH)` }
    sheet.getCell(`K${r}`).value = { formula: `SUMIF('Turno Vespertino'!AB:AB,${m},'Turno Vespertino'!AH:AH)` }
    sheet.getCell(`M${r}`).value = m
    sheet.getCell(`N${r}`).value = { formula: `COUNTIF('Turno Matutino'!B:B,M${r})` }
    sheet.getCell(`O${r}`).value = daysInMonth(year, m)
    sheet.getCell(`P${r}`).value = { formula: `IF(O${r}=0,0,N${r}/O${r})` }
    sheet.getCell(`Q${r}`).value = { formula: `IF(P${r}=0,0,B${r}/P${r})` }
    for (const col of ["A", "B", "C", "E", "F", "G", "I", "J", "K", "M", "N", "O", "P", "Q"]) {
      const c = sheet.getCell(`${col}${r}`)
      if (["A", "E", "I"].includes(col)) styleData(c)
      else styleNumber(c)
    }
  }

  sheet.mergeCells("A19:C19")
  sheet.getCell("A19").value = "Monthly packaging production"
  sheet.mergeCells("M19:T19")
  sheet.getCell("M19").value = "Average monthly production/Second shift"
  styleHeader(sheet.getCell("A19"))
  styleHeader(sheet.getCell("M19"))

  ;[
    ["A20", "Monthly production"],
    ["B20", "1ST SHIFT"],
    ["C20", "2ND SHIFT"],
    ["M20", "Month"],
    ["N20", "Total op per month"],
    ["O20", "Days worked"],
    ["P20", "Average op per month"],
    ["Q20", "Prod. Month"],
    ["R20", "Prod. Daily"],
    ["S20", "Pord. X hour"],
    ["T20", "Prod. X min"],
  ].forEach(([ref, text]) => {
    sheet.getCell(ref).value = text
    styleHeader(sheet.getCell(ref))
  })

  for (let m = 1; m <= 12; m++) {
    const r = m + 20
    sheet.getCell(`A${r}`).value = monthNameEs(m)
    sheet.getCell(`B${r}`).value = { formula: `SUMIF('Turno Matutino'!B:B,${m},'Turno Matutino'!P:P)` }
    sheet.getCell(`C${r}`).value = { formula: `SUMIF('Turno Vespertino'!B:B,${m},'Turno Vespertino'!P:P)` }
    sheet.getCell(`M${r}`).value = m
    sheet.getCell(`N${r}`).value = { formula: `COUNTIF('Turno Vespertino'!B:B,M${r})` }
    sheet.getCell(`O${r}`).value = daysInMonth(year, m)
    sheet.getCell(`P${r}`).value = { formula: `IF(O${r}=0,0,N${r}/O${r})` }
    sheet.getCell(`Q${r}`).value = { formula: `IF(P${r}=0,0,C${r}/P${r})` }
    sheet.getCell(`R${r}`).value = { formula: `IF(O${r}=0,0,Q${r}/O${r})` }
    sheet.getCell(`S${r}`).value = { formula: `R${r}/6.5` }
    sheet.getCell(`T${r}`).value = { formula: `S${r}/60` }
    for (const col of ["A", "B", "C", "M", "N", "O", "P", "Q", "R", "S", "T"]) {
      const c = sheet.getCell(`${col}${r}`)
      if (col === "A") styleData(c)
      else styleNumber(c)
    }
  }

  autoFit(sheet, 20, 35)
}

function aggregateByPerson(rows: ShiftRow[], picker: (r: ShiftRow) => string): Map<string, number> {
  const out = new Map<string, number>()
  for (const r of rows) {
    const name = picker(r)
    if (!name || name === "—") continue
    out.set(name, (out.get(name) ?? 0) + r.totalPieces)
  }
  return out
}

function aggregateByMonthPerson(
  rows: ShiftRow[],
  picker: (r: ShiftRow) => string,
): Map<number, Map<string, number>> {
  const out = new Map<number, Map<string, number>>()
  for (const r of rows) {
    const name = picker(r)
    if (!name || name === "—") continue
    const monthMap = out.get(r.month) ?? new Map<string, number>()
    monthMap.set(name, (monthMap.get(name) ?? 0) + r.totalPieces)
    out.set(r.month, monthMap)
  }
  return out
}

function monthLabel(month: number, year: number) {
  return `${monthNameEs(month)} ${year}`
}

function topFromMonthMap(monthMap: Map<string, number> | undefined, limit = 32) {
  if (!monthMap) return [] as Array<[string, number]>
  return [...monthMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit)
}

function renderTopMaquinistasSheet(sheet: Worksheet, mat: ShiftRow[], ves: ShiftRow[], year: number) {
  const byMonthAll = aggregateByMonthPerson([...mat, ...ves], (r) => r.operator1)
  const sortedMonths = [...byMonthAll.keys()].sort((a, b) => a - b)
  const months = (sortedMonths.length > 0 ? sortedMonths : [1, 2, 3, 4]).slice(0, 4)
  while (months.length < 4) months.push(months.length + 1)
  const starts = [1, 7, 13, 19]

  const writeBlockHeaders = (row: number) => {
    for (const start of starts) {
      ;[
        [start + 1, "Suma de Piezas Totales"],
        [start + 2, "Hooks / Day"],
        [start + 3, "Hooks / Hour"],
        [start + 4, "Hooks / Minute"],
      ].forEach(([col, txt]) => {
        const cell = sheet.getCell(row, col)
        cell.value = txt
        styleHeader(cell)
      })
    }
  }

  writeBlockHeaders(1)
  writeBlockHeaders(36)

  sheet.getCell("G2").value = "Turno 1"
  sheet.getCell("G3").value = "Turno 2"
  sheet.getCell("H2").value = new Date(`1970-01-01T07:00:00`)
  sheet.getCell("I2").value = new Date(`1970-01-01T16:00:00`)
  sheet.getCell("J2").value = { formula: "I2-H2" }
  sheet.getCell("K2").value = new Date(`1970-01-01T01:00:00`)
  sheet.getCell("L2").value = { formula: "J2-K2" }
  sheet.getCell("H3").value = new Date(`1970-01-01T16:00:00`)
  sheet.getCell("I3").value = new Date(`1970-01-01T23:30:00`)
  sheet.getCell("J3").value = { formula: "I3-H3" }
  sheet.getCell("K3").value = new Date(`1970-01-01T01:00:00`)
  sheet.getCell("L3").value = { formula: "J3-K3" }
  for (const ref of ["G2", "G3", "H2", "I2", "J2", "K2", "L2", "H3", "I3", "J3", "K3", "L3"]) {
    const c = sheet.getCell(ref)
    if (ref[0] === "G") styleData(c)
    else {
      styleNumber(c)
      if (["H", "I", "K"].includes(ref[0])) c.numFmt = "hh:mm:ss"
    }
  }

  const writeGroup = (startRow: number, indexRow: number, hourDiv: number, topLimit: number) => {
    months.forEach((m, idx) => {
      const start = starts[idx]
      sheet.getCell(indexRow, start).value = String(idx + 1)
      sheet.getCell(indexRow, start + 1).value = monthLabel(m, year)
      styleData(sheet.getCell(indexRow, start))
      styleData(sheet.getCell(indexRow, start + 1))
      const top = topFromMonthMap(byMonthAll.get(m), topLimit)
      top.forEach(([name, total], i) => {
        const r = startRow + i
        const nameCol = String.fromCharCode(64 + start)
        const totalCol = String.fromCharCode(64 + start + 1)
        const dayCol = String.fromCharCode(64 + start + 2)
        const hourCol = String.fromCharCode(64 + start + 3)
        sheet.getCell(r, start).value = name
        sheet.getCell(r, start + 1).value = total
        sheet.getCell(r, start + 2).value = { formula: `${totalCol}${r}/20` }
        sheet.getCell(r, start + 3).value = { formula: `${dayCol}${r}/${hourDiv}` }
        sheet.getCell(r, start + 4).value = { formula: `${hourCol}${r}/60` }
        styleData(sheet.getCell(r, start))
        for (let c = start + 1; c <= start + 4; c++) styleNumber(sheet.getCell(r, c))
        sheet.getCell(r, start).alignment = { vertical: "middle", wrapText: true }
        // marca de estructura dinámica (sin posición rígida)
        sheet.getCell(r, start).note = `Mes ${m} - ranking dinámico`
        sheet.getCell(r, start + 1).note = `Dato de plataforma: ${nameCol}${r}`
      })
    })
  }

  writeGroup(5, 4, 8, 31)
  writeGroup(38, 37, 6.5, 28)

  autoFit(sheet, 25, 68)
}

function renderPerformanceSheet(
  sheet: Worksheet,
  peopleByMonth: Map<number, Map<string, number>>,
  year: number,
  label: "Operador (a)" | "Empacador (a)",
  baseShift1: number,
  baseShift2: number,
  includeTopHint = false,
) {
  const months = [...peopleByMonth.keys()].sort((a, b) => a - b).slice(0, 4)
  while (months.length < 4) months.push(months.length + 1)
  const starts = [1, 5, 9, 13]

  months.forEach((m, idx) => {
    const start = starts[idx]
    const totalCol = String.fromCharCode(64 + start + 1)
    const ratioCol = String.fromCharCode(64 + start + 2)
    const days = daysInMonth(year, m)
    sheet.getCell(1, start + 1).value = 1
    sheet.getCell(1, start + 2).value = 0.8
    sheet.getCell(2, start + 1).value = { formula: `${days}*${baseShift1}` }
    sheet.getCell(2, start + 2).value = { formula: `${totalCol}2*2` }
    sheet.getCell(3, start + 1).value = { formula: `${days}*${baseShift2}` }
    sheet.getCell(3, start + 2).value = { formula: `${totalCol}3*2` }
    sheet.getCell(4, start).value = label
    sheet.getCell(4, start + 1).value = monthLabel(m, year)
    const top = topFromMonthMap(peopleByMonth.get(m), 55)
    top.forEach(([name, total], i) => {
      const r = i + 5
      sheet.getCell(r, start).value = name
      sheet.getCell(r, start + 1).value = total
      sheet.getCell(r, start + 2).value = { formula: `${totalCol}${r}/${days}/${baseShift1}` }
      styleData(sheet.getCell(r, start))
      styleNumber(sheet.getCell(r, start + 1))
      styleNumber(sheet.getCell(r, start + 2))
      sheet.getCell(r, start + 2).numFmt = "0.00%"
    })
    for (let r = 1; r <= 4; r++) {
      for (let c = start; c <= start + 2; c++) {
        const cell = sheet.getCell(r, c)
        if (r === 4 || (r <= 3 && c > start)) styleHeader(cell)
        else styleData(cell)
      }
    }
  })

  if (includeTopHint) {
    const topGlobal = [...peopleByMonth.values()]
      .flatMap((m) => [...m.entries()])
      .reduce((acc, [name, value]) => {
        acc.set(name, (acc.get(name) ?? 0) + value)
        return acc
      }, new Map<string, number>())
    const top4 = [...topGlobal.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
    sheet.getCell("Q5").value = "Top empacadora:"
    styleHeader(sheet.getCell("Q5"))
    for (let i = 0; i < top4.length; i++) {
      const cell = sheet.getCell(6 + i, 17)
      cell.value = top4[i][0]
      styleData(cell)
    }
  }

  autoFit(sheet, 17, 66)
}

function renderScrapSheet(sheet: Worksheet) {
  sheet.mergeCells("B1:D1")
  sheet.getCell("B1").value = "Accumulated Waste"
  styleHeader(sheet.getCell("B1"))
  ;[
    ["A2", "Month"],
    ["B2", "Scrap"],
    ["C2", "Kg"],
    ["D2", "Post-sale waste loss in MXN"],
  ].forEach(([ref, val]) => {
    sheet.getCell(ref).value = val
    styleHeader(sheet.getCell(ref))
  })

  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ]
  let row = 3
  months.forEach((m) => {
    sheet.mergeCells(`A${row}:A${row + 1}`)
    sheet.getCell(`A${row}`).value = m
    sheet.getCell(`B${row}`).value = "Metal"
    sheet.getCell(`C${row}`).value = "POR CONFIRMAR"
    sheet.getCell(`D${row}`).value = "POR CONFIRMAR"
    sheet.getCell(`B${row + 1}`).value = "Twine"
    sheet.getCell(`C${row + 1}`).value = "POR CONFIRMAR"
    sheet.getCell(`D${row + 1}`).value = "POR CONFIRMAR"
    for (const r of [row, row + 1]) {
      styleData(sheet.getCell(`A${r}`))
      styleData(sheet.getCell(`B${r}`))
      styleManual(sheet.getCell(`C${r}`))
      styleManual(sheet.getCell(`D${r}`))
    }
    row += 2
  })
  autoFit(sheet, 4, row + 1)
}

export function annualAccumulatedReportFilename(year: number): string {
  return `acumulado anual ${year}.xlsx`
}

export async function buildAnnualAccumulatedReportBlob(
  year: number,
  sourceRows: ProductionShiftReportSourceRow[],
): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default
  const wb = new ExcelJS.Workbook()
  wb.creator = "Paskal Métricas"
  wb.created = new Date()

  const { matutino, vespertino } = toShiftRows(
    sourceRows.filter((r) => getPartsInTimeZone(new Date(r.timestamp), TZ).year === year),
  )

  const shMat = wb.addWorksheet("Turno Matutino")
  renderShiftSheet(shMat, matutino, false)

  const shVes = wb.addWorksheet("Turno Vespertino")
  renderShiftSheet(shVes, vespertino, true)

  const shTotal = wb.addWorksheet("Total produccion")
  renderTotalProductionSheet(shTotal, year)

  const shTop = wb.addWorksheet("Top maquinistas")
  renderTopMaquinistasSheet(shTop, matutino, vespertino, year)

  const shOp = wb.addWorksheet("Desempeño de operadoras")
  const operatorsByMonth = aggregateByMonthPerson([...matutino, ...vespertino], (r) => r.operator1)
  renderPerformanceSheet(
    shOp,
    operatorsByMonth,
    year,
    "Operador (a)",
    3650,
    3000,
    false,
  )

  const shEmp = wb.addWorksheet("Desempeño empacadoras")
  const packersByMonth = aggregateByMonthPerson([...matutino, ...vespertino], (r) => r.packer1)
  renderPerformanceSheet(
    shEmp,
    packersByMonth,
    year,
    "Empacador (a)",
    3650 * 2,
    3000 * 2,
    true,
  )

  const shScrap = wb.addWorksheet("Scrap acumulado")
  renderScrapSheet(shScrap)

  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
}
