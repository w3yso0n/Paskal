import type { Cell, Worksheet } from "exceljs"
import type { ApiMachineCheckin } from "@/lib/api"
import { BENDING_MACHINES } from "@/lib/data-capture-config"
import {
  allCalendarDaysInMonth,
  excelSheetNameForDay,
  formatDdMmYyyy,
  getPlantDayBoundsForCalendarDate,
  getShiftBoundsForCalendarDate,
  monthNameCapitalizedEs,
} from "@/lib/shift-timezone"
import {
  allocateIntegerLargestRemainder,
  dedupeReportPeople,
  reportRosterKey,
} from "@/lib/production-report-allocation"
import type { EmployeeProductionRole } from "@/lib/employee-production-role"

export const REPORT_TIMEZONE = "America/Mexico_City"

export type ProductionShiftReportSourceRow = {
  machine_id: string
  machineIdRaw: string | null
  timestamp: string
  operator: string
  operator_2: string
  operatorShift?: "matutino" | "vespertino" | null
  operator2Shift?: "matutino" | "vespertino" | null
  operatorPrimaryRoles?: Array<EmployeeProductionRole | null>
  packer_1: string
  packer_2: string
  packer_3?: string
  packer_4?: string
  /** Lista completa preferida; permite conservar rosters de hasta cuatro personas. */
  packersAttributed?: string[]
  packerShifts?: Array<"matutino" | "vespertino" | null>
  packerPrimaryRoles?: Array<EmployeeProductionRole | null>
  /** Piezas ya repartidas por persona; evita recalcular al separar turnos mixtos. */
  packerAllocatedPieces?: number[]
  operatorAllocatedPieces?: number[]
  /** Identidad estable del roster/check-in cuando la capa de integración la conoce. */
  rosterId?: string | null
  /** Producción sin atribución; se conserva y se marca en el Excel. */
  isOrphan?: boolean
  /** Ajuste que acredita empaque sin volver a sumar producción de máquina. */
  isPackagerCredit?: boolean
  packagingCreditPieces?: number
  /** Participación de operación en otro turno, sin duplicar producción de máquina. */
  isOperatorCredit?: boolean
  operatorCreditPieces?: number
  count: number
  event: string
  sku: string
  unitsPerBox: number
  /** Turno de la fila: turno ASIGNADO de la operadora del evento (fallback: reloj <16:00). */
  shift: "matutino" | "vespertino"
}

export type ProductionShiftManualCapture = {
  category: "winding" | "bending"
  sourceKey: string
  recordDate: string
  shift: string | null
  sku: string | null
  operatorCode: string | null
  packagerCode: string | null
  productionQty: number
}

export type BuildProductionShiftReportParams = {
  reportDate: string
  shiftNumber: 1 | 2
  supervisorName: string
  rows: ProductionShiftReportSourceRow[]
  checkins: ApiMachineCheckin[]
  manualCaptures?: ProductionShiftManualCapture[]
  resolveEmployeeCode: (displayName: string) => string
  resolvePersonFromCode: (code: string | null | undefined) => string
}

type MachineReportRow = {
  machine: string
  operator1: string
  operator2: string
  item: string
  boxQty: number
  piecesPerBox: number
  totalPieces: number
  packer1: string
  packer1Boxes: number
  packer2: string
  packer2Boxes: number
  packer3: string
  packer3Boxes: number
  packer4: string
  packer4Boxes: number
  totalPackerBoxes: number
  difference: number
  packer1Pieces: number
  packer2Pieces: number
  packer3Pieces: number
  packer4Pieces: number
  isOrphan: boolean
  isPackagerCredit: boolean
  isOperatorCredit: boolean
}

type MetalHooksRow = {
  codigo: string
  maquina: string
  cajas: number
  piezas: number
  total: number
  maquinaNum: number
  operadora: string
  operadoraCodigo: string
  empCajas: number
  empPiezas: number
  empTotal: number
}

type BendingReportRow = {
  maquinaNum: number
  operador: string
  codigo: string
  cajas: number | null
  piezas: number | null
  total: number
}

function rowPackerEntries(row: ProductionShiftReportSourceRow) {
  const rawNames = row.packersAttributed?.length
    ? row.packersAttributed
    : [row.packer_1, row.packer_2, row.packer_3, row.packer_4]
  const seen = new Set<string>()
  const people = rawNames
    .map((value, index) => ({
      name: String(value ?? "").trim().replace(/\s+/g, " "),
      shift: row.packerShifts?.[index] ?? row.shift,
    }))
    .filter(({ name }) => {
      const key = name.toLocaleLowerCase("es")
      if (!name || name === "—" || seen.has(key)) return false
      seen.add(key)
      return true
    })
  const names = people.map(({ name }) => name)
  const total = row.isPackagerCredit
    ? Math.round(Number(row.packagingCreditPieces ?? 0))
    : Math.round(Number(row.count) || 0)
  const allocations = row.packerAllocatedPieces?.length
    ? names.map((name, index) => ({
        recipient: name,
        quantity: Math.max(0, Math.round(row.packerAllocatedPieces?.[index] ?? 0)),
      }))
    : allocateIntegerLargestRemainder(total, names)
  return allocations.map((allocation, index) => ({
    name: allocation.recipient,
    pieces: allocation.quantity,
    shift: people[index]?.shift ?? row.shift,
  }))
}

function rowOperatorEntries(row: ProductionShiftReportSourceRow) {
  if (row.isPackagerCredit) return []
  const names = dedupeReportPeople([row.operator, row.operator_2])
  const allocations = row.operatorAllocatedPieces?.length
    ? names.map((name, index) => ({
        recipient: name,
        quantity: Math.max(0, Math.round(row.operatorAllocatedPieces?.[index] ?? 0)),
      }))
    : allocateIntegerLargestRemainder(Math.round(Number(row.count) || 0), names)
  return allocations.map((allocation, index) => ({
    name: allocation.recipient,
    pieces: allocation.quantity,
    shift:
      index === 0
        ? (row.operatorShift ?? row.shift)
        : (row.operator2Shift ?? row.shift),
  }))
}

/** Separa crédito personal por turno sin duplicar las piezas de máquina. */
export function rowsForProductionReportShift(
  rows: ProductionShiftReportSourceRow[],
  reportShift: "matutino" | "vespertino",
): ProductionShiftReportSourceRow[] {
  const out: ProductionShiftReportSourceRow[] = []
  for (const row of rows) {
    const entries = rowPackerEntries(row).filter((entry) => entry.shift === reportShift)
    const operatorEntries = rowOperatorEntries(row).filter(
      (entry) => entry.shift === reportShift,
    )
    const names = entries.map((entry) => entry.name)
    const allocated = entries.map((entry) => entry.pieces)
    const operatorNames = operatorEntries.map((entry) => entry.name)
    const operatorAllocated = operatorEntries.map((entry) => entry.pieces)
    const operator = operatorNames[0] ?? "—"
    const operator2 = operatorNames[1] ?? "—"

    if (!row.isPackagerCredit && row.shift === reportShift) {
      out.push({
        ...row,
        operator,
        operator_2: operator2,
        packer_1: names[0] ?? "—",
        packer_2: names[1] ?? "—",
        packer_3: names[2] ?? "—",
        packer_4: names[3] ?? "—",
        packersAttributed: names,
        packerShifts: names.map(() => reportShift),
        packerAllocatedPieces: allocated,
        operatorAllocatedPieces: operatorAllocated,
      })
    }

    if (
      (entries.length > 0 || operatorEntries.length > 0) &&
      (row.isPackagerCredit || row.shift !== reportShift)
    ) {
      out.push({
        ...row,
        count: 0,
        operator,
        operator_2: operator2,
        shift: reportShift,
        isPackagerCredit: entries.length > 0,
        packagingCreditPieces: allocated.reduce((sum, value) => sum + value, 0),
        isOperatorCredit: operatorEntries.length > 0,
        operatorCreditPieces: operatorAllocated.reduce((sum, value) => sum + value, 0),
        packer_1: names[0] ?? "—",
        packer_2: names[1] ?? "—",
        packer_3: names[2] ?? "—",
        packer_4: names[3] ?? "—",
        packersAttributed: names,
        packerShifts: names.map(() => reportShift),
        packerAllocatedPieces: allocated,
        operatorAllocatedPieces: operatorAllocated,
      })
    }
  }
  return out
}

export type ProductionReportReconciliation = {
  sourceMachinePieces: number
  reportedMachinePieces: number
  sourcePackagingPieces: number
  reportedPackagingPieces: number
  sourceOperatorPieces: number
  reportedOperatorPieces: number
}

/**
 * Invariante previo a crear el archivo: separar turnos no puede perder ni duplicar
 * producción de máquina ni participaciones de empaque.
 */
export function reconcileProductionReportRows(
  rows: ProductionShiftReportSourceRow[],
): ProductionReportReconciliation {
  const productionRows = rows.filter((row) => row.event === "Producción")
  const shifted = [
    ...rowsForProductionReportShift(productionRows, "matutino"),
    ...rowsForProductionReportShift(productionRows, "vespertino"),
  ]
  const sourceMachinePieces = productionRows.reduce(
    (sum, row) => sum + (row.isPackagerCredit ? 0 : Math.max(0, Number(row.count) || 0)),
    0,
  )
  const reportedMachinePieces = shifted.reduce(
    (sum, row) => sum + Math.max(0, Number(row.count) || 0),
    0,
  )
  const sourcePackagingPieces = productionRows.reduce(
    (sum, row) =>
      sum +
      rowPackerEntries(row).reduce(
        (allocationSum, allocation) => allocationSum + allocation.pieces,
        0,
      ),
    0,
  )
  const reportedPackagingPieces = shifted.reduce(
    (sum, row) =>
      sum +
      (row.packerAllocatedPieces ?? []).reduce(
        (allocationSum, pieces) => allocationSum + Math.max(0, Number(pieces) || 0),
        0,
      ),
    0,
  )
  const sourceOperatorPieces = productionRows.reduce(
    (sum, row) =>
      sum +
      rowOperatorEntries(row).reduce(
        (allocationSum, allocation) => allocationSum + allocation.pieces,
        0,
      ),
    0,
  )
  const reportedOperatorPieces = shifted.reduce(
    (sum, row) =>
      sum +
      (row.operatorAllocatedPieces ?? []).reduce(
        (allocationSum, pieces) => allocationSum + Math.max(0, Number(pieces) || 0),
        0,
      ),
    0,
  )
  const result = {
    sourceMachinePieces,
    reportedMachinePieces,
    sourcePackagingPieces,
    reportedPackagingPieces,
    sourceOperatorPieces,
    reportedOperatorPieces,
  }
  if (
    Math.abs(sourceMachinePieces - reportedMachinePieces) > 1e-9 ||
    Math.abs(sourcePackagingPieces - reportedPackagingPieces) > 1e-9 ||
    Math.abs(sourceOperatorPieces - reportedOperatorPieces) > 1e-9
  ) {
    throw new Error(
      `La conciliación de producción falló: máquina ${sourceMachinePieces}/${reportedMachinePieces}, empaque ${sourcePackagingPieces}/${reportedPackagingPieces}, operación ${sourceOperatorPieces}/${reportedOperatorPieces}`,
    )
  }
  return result
}

const BENDING_MACHINE_ORDER: Record<string, number> = Object.fromEntries(
  BENDING_MACHINES.map((m, idx) => [m.key, idx + 1]),
)

const MH_COL = {
  CODIGO: 4,
  MAQUINA: 5,
  CAJAS: 6,
  PIEZAS: 7,
  TOTAL: 8,
  MAQUINA_NUM: 9,
  OPERADORA: 10,
  CODIGO_OP: 11,
  EMP_CAJAS: 12,
  EMP_PIEZAS: 13,
  EMP_TOTAL: 14,
} as const

const BEND_COL = {
  MAQUINA: 9,
  OPERADOR: 10,
  CODIGO: 11,
  VACIO: 12,
  PIEZAS: 13,
  TOTAL: 14,
} as const

const BORDER_COLOR = "FF94A3B8"
const FILL_HEADER = "FFE2E8F0"
const FILL_BANNER = "FFCBD5E1"
const FILL_META = "FFF1F5F9"
/** Verde, Énfasis 6, Claro 60% (tema Office del reporte de referencia). */
const FILL_GREEN_EMPHASIS6_LIGHT60 = "FFB8DBAB"

const borderThin = (): Partial<import("exceljs").Borders> => ({
  top: { style: "thin", color: { argb: BORDER_COLOR } },
  left: { style: "thin", color: { argb: BORDER_COLOR } },
  bottom: { style: "thin", color: { argb: BORDER_COLOR } },
  right: { style: "thin", color: { argb: BORDER_COLOR } },
})

const borderMediumBottom = (): Partial<import("exceljs").Borders> => ({
  ...borderThin(),
  bottom: { style: "medium", color: { argb: "FF334155" } },
})

type StylePreset = {
  font?: Partial<import("exceljs").Font>
  fill?: import("exceljs").Fill
  alignment?: Partial<import("exceljs").Alignment>
  border?: Partial<import("exceljs").Borders>
  numFmt?: string
}

const ST: Record<string, StylePreset> = {
  label: { font: { bold: true, size: 11 } },
  value: { font: { size: 11 } },
  header: {
    font: { bold: true, size: 10 },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: FILL_HEADER } },
    alignment: { horizontal: "center", vertical: "middle", wrapText: true },
    border: borderThin(),
  },
  meta: {
    font: { bold: true, size: 10 },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: FILL_META } },
    border: borderThin(),
    alignment: { vertical: "middle" },
  },
  banner: {
    font: { bold: true, size: 11 },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: FILL_BANNER } },
    alignment: { horizontal: "center", vertical: "middle" },
    border: borderThin(),
  },
  bannerGreen: {
    font: { bold: true, size: 11 },
    fill: {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: FILL_GREEN_EMPHASIS6_LIGHT60 },
    },
    alignment: { horizontal: "center", vertical: "middle" },
    border: borderThin(),
  },
  headerGreen: {
    font: { bold: true, size: 10 },
    fill: {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: FILL_GREEN_EMPHASIS6_LIGHT60 },
    },
    alignment: { horizontal: "center", vertical: "middle", wrapText: true },
    border: borderThin(),
  },
  data: {
    font: { size: 10 },
    border: borderThin(),
    alignment: { vertical: "middle", wrapText: true },
  },
  number: {
    font: { size: 10 },
    border: borderThin(),
    alignment: { horizontal: "right", vertical: "middle" },
    numFmt: "#,##0.##",
  },
  total: {
    font: { bold: true, size: 10 },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: FILL_HEADER } },
    border: borderMediumBottom(),
    alignment: { horizontal: "right", vertical: "middle" },
    numFmt: "#,##0.##",
  },
  sigLine: {
    border: { bottom: { style: "medium", color: { argb: "FF334155" } } },
    alignment: { horizontal: "center", vertical: "bottom" },
  },
  sigLabel: {
    font: { bold: true, size: 10 },
    alignment: { horizontal: "center", vertical: "top" },
  },
}

function applyPreset(cell: Cell, preset: StylePreset) {
  if (preset.font) cell.font = { ...(cell.font ?? {}), ...preset.font }
  if (preset.fill) cell.fill = preset.fill
  if (preset.alignment) cell.alignment = { ...(cell.alignment ?? {}), ...preset.alignment }
  if (preset.border) cell.border = preset.border
  if (preset.numFmt) cell.numFmt = preset.numFmt
}

function writeCell(
  sheet: Worksheet,
  row: number,
  col: number,
  value: string | number | null,
  preset: keyof typeof ST = "data",
) {
  const cell = sheet.getCell(row, col)
  cell.value = value ?? ""
  applyPreset(cell, ST[preset] ?? ST.data)
}

function writeFormula(
  sheet: Worksheet,
  row: number,
  col: number,
  formula: string,
  preset: keyof typeof ST = "total",
) {
  const cell = sheet.getCell(row, col)
  cell.value = { formula }
  applyPreset(cell, ST[preset] ?? ST.total)
}

function mergeWrite(
  sheet: Worksheet,
  row: number,
  colStart: number,
  colEnd: number,
  value: string | number,
  preset: keyof typeof ST = "banner",
) {
  if (colEnd > colStart) {
    sheet.mergeCells(row, colStart, row, colEnd)
  }
  const cell = sheet.getCell(row, colStart)
  cell.value = value
  applyPreset(cell, ST[preset] ?? ST.banner)
  for (let c = colStart + 1; c <= colEnd; c++) {
    applyPreset(sheet.getCell(row, c), ST[preset] ?? ST.banner)
  }
}

function styleRect(
  sheet: Worksheet,
  r1: number,
  c1: number,
  r2: number,
  c2: number,
  preset: keyof typeof ST,
) {
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      applyPreset(sheet.getCell(r, c), ST[preset])
    }
  }
}

function autoFitColumns(sheet: Worksheet, lastCol: number, lastRow: number) {
  for (let c = 1; c <= lastCol; c++) {
    let max = 10
    for (let r = 1; r <= lastRow; r++) {
      const v = sheet.getCell(r, c).value
      let text = ""
      if (v == null) continue
      if (typeof v === "object" && v !== null && "formula" in v) {
        text = String((v as { formula?: string }).formula ?? "")
      } else if (typeof v === "object" && "richText" in (v as object)) {
        text = String(v)
      } else {
        text = String(v)
      }
      max = Math.max(max, Math.min(text.length + 2, 42))
    }
    sheet.getColumn(c).width = max
  }
}

function countDistinctPeople(names: string[]): number {
  const s = new Set<string>()
  for (const n of names) {
    const t = n?.trim()
    if (!t || t === "—") continue
    s.add(t.toLowerCase())
  }
  return s.size
}

function findCheckinForMachineInWindow(
  machineId: string | null,
  startMs: number,
  endMs: number,
  checkins: ApiMachineCheckin[],
): ApiMachineCheckin | null {
  const id = machineId?.trim()
  if (!id) return null
  const overlaps = (ch: ApiMachineCheckin) => {
    const inMs = new Date(ch.checkedInAt).getTime()
    const outMs = ch.checkedOutAt ? new Date(ch.checkedOutAt).getTime() : Number.POSITIVE_INFINITY
    return inMs < endMs && outMs > startMs
  }
  const list = checkins
    .filter((ch) => ch.machineId === id && overlaps(ch))
    .sort((a, b) => new Date(b.checkedInAt).getTime() - new Date(a.checkedInAt).getTime())
  return list[0] ?? null
}

function dominantSku(rows: ProductionShiftReportSourceRow[]): string {
  const counts = new Map<string, number>()
  for (const r of rows) {
    const sku = r.sku?.trim()
    if (!sku || sku === "—") continue
    counts.set(sku, (counts.get(sku) ?? 0) + 1)
  }
  let best = "—"
  let max = 0
  for (const [sku, n] of counts) {
    if (n > max) {
      max = n
      best = sku
    }
  }
  return best
}

function normalizeSkuKey(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase()
}

function aggregateMachineRows(
  prodRows: ProductionShiftReportSourceRow[],
  checkins: ApiMachineCheckin[],
  startMs: number,
  endMs: number,
  resolveFromCheckin: (
    ch: ApiMachineCheckin,
  ) => {
    operator1: string
    operator2: string
    packer1: string
    packer2: string
    packer3?: string
    packer4?: string
  },
): MachineReportRow[] {
  const byGroup = new Map<string, ProductionShiftReportSourceRow[]>()
  for (const r of prodRows) {
    const machine = r.machine_id?.trim() || "—"
    const sku = normalizeSkuKey(r.sku) || "—"
    const upb = r.unitsPerBox > 0 ? r.unitsPerBox : 48
    const packers = r.packersAttributed?.length
      ? r.packersAttributed
      : [r.packer_1, r.packer_2, r.packer_3, r.packer_4]
    const roster = reportRosterKey(
      [r.operator, r.operator_2],
      packers,
      r.rosterId,
    )
    const kind =
      r.isPackagerCredit || r.isOperatorCredit
        ? "participant-credit"
        : r.isOrphan
          ? "orphan"
          : "normal"
    const key = [machine, sku, String(upb), roster, kind].join("\u001f")
    const list = byGroup.get(key) ?? []
    list.push(r)
    byGroup.set(key, list)
  }

  const out: MachineReportRow[] = []
  const sortedKeys = [...byGroup.keys()].sort((a, b) => a.localeCompare(b, "es"))

  for (const key of sortedKeys) {
    const events = byGroup.get(key) ?? []
    const machine = events[0]?.machine_id?.trim() || "—"
    const machineIdRaw = events.find((e) => e.machineIdRaw)?.machineIdRaw ?? null
    const ch = findCheckinForMachineInWindow(machineIdRaw, startMs, endMs, checkins)
    const fromChk = ch ? resolveFromCheckin(ch) : null

    const operator1 =
      events.find((e) => e.operator && e.operator !== "—")?.operator ??
      fromChk?.operator1 ??
      "—"
    const operator2 =
      events.find((e) => e.operator_2 && e.operator_2 !== "—")?.operator_2 ??
      fromChk?.operator2 ??
      "—"

    const eventPackers = dedupeReportPeople(
      events.flatMap((event) =>
        event.packersAttributed?.length
          ? event.packersAttributed
          : [event.packer_1, event.packer_2, event.packer_3, event.packer_4],
      ),
    )
    const checkinPackers = dedupeReportPeople([
      fromChk?.packer1,
      fromChk?.packer2,
      fromChk?.packer3,
      fromChk?.packer4,
    ])
    const packers = (eventPackers.length > 0 ? eventPackers : checkinPackers).slice(0, 4)
    const [packer1 = "—", packer2 = "—", packer3 = "—", packer4 = "—"] = packers

    let totalPieces = 0
    let packagingCreditPieces = 0
    const piecesPerBox = events[0]?.unitsPerBox > 0 ? events[0].unitsPerBox : 48

    for (const e of events) {
      const pieces = Number.isFinite(e.count) ? e.count : 0
      totalPieces += pieces
      const credit = Number(e.packagingCreditPieces ?? 0)
      if (Number.isFinite(credit) && credit > 0) packagingCreditPieces += credit
    }

    const totalPiecesRounded = Math.round(totalPieces)
    const isPackagerCredit = events.some((event) => event.isPackagerCredit)
    const piecesToAllocate = isPackagerCredit
      ? Math.round(packagingCreditPieces)
      : totalPiecesRounded
    const hasPreallocated = events.some((event) => event.packerAllocatedPieces?.length)
    const allocatedPieces = hasPreallocated
      ? packers.map((_, index) =>
          events.reduce(
            (sum, event) => sum + Math.max(0, Math.round(event.packerAllocatedPieces?.[index] ?? 0)),
            0,
          ),
        )
      : allocateIntegerLargestRemainder(piecesToAllocate, packers).map(
          (allocation) => allocation.quantity,
        )
    const packer1Pieces = allocatedPieces[0] ?? 0
    const packer2Pieces = allocatedPieces[1] ?? 0
    const packer3Pieces = allocatedPieces[2] ?? 0
    const packer4Pieces = allocatedPieces[3] ?? 0
    const packer1Boxes = packer1Pieces / piecesPerBox
    const packer2Boxes = packer2Pieces / piecesPerBox
    const packer3Boxes = packer3Pieces / piecesPerBox
    const packer4Boxes = packer4Pieces / piecesPerBox
    const boxQty = totalPiecesRounded / piecesPerBox
    const totalPackerBoxes =
      packer1Boxes + packer2Boxes + packer3Boxes + packer4Boxes
    const difference = Math.round((boxQty - totalPackerBoxes) * 100) / 100

    out.push({
      machine,
      operator1,
      operator2,
      item: dominantSku(events),
      boxQty: Math.round(boxQty * 100) / 100,
      piecesPerBox,
      totalPieces: totalPiecesRounded,
      packer1,
      packer1Boxes: Math.round(packer1Boxes * 100) / 100,
      packer2,
      packer2Boxes: Math.round(packer2Boxes * 100) / 100,
      packer3,
      packer3Boxes: Math.round(packer3Boxes * 100) / 100,
      packer4,
      packer4Boxes: Math.round(packer4Boxes * 100) / 100,
      totalPackerBoxes: Math.round(totalPackerBoxes * 100) / 100,
      difference,
      packer1Pieces,
      packer2Pieces,
      packer3Pieces,
      packer4Pieces,
      isOrphan: events.some((event) => event.isOrphan),
      isPackagerCredit,
      isOperatorCredit: events.some((event) => event.isOperatorCredit),
    })
  }

  return out
}

function reportShiftLabel(shiftNumber: 1 | 2): "matutino" | "vespertino" {
  return shiftNumber === 1 ? "matutino" : "vespertino"
}

function manualCaptureMatchesShift(
  captureShift: string | null | undefined,
  shiftNumber: 1 | 2,
): boolean {
  const normalized = captureShift?.trim().toLowerCase()
  if (!normalized) return false
  return normalized === reportShiftLabel(shiftNumber)
}

function manualWindingToMachineRow(
  capture: ProductionShiftManualCapture,
  resolvePersonFromCode: (code: string | null | undefined) => string,
): MachineReportRow {
  const qty = Math.round(capture.productionQty * 100) / 100
  const operator = resolvePersonFromCode(capture.operatorCode) || "—"
  const packer = resolvePersonFromCode(capture.packagerCode) || "—"
  const sku = capture.sku?.trim() || "—"

  return {
    machine: capture.sourceKey,
    operator1: operator,
    operator2: "—",
    item: sku,
    boxQty: qty,
    piecesPerBox: 1,
    totalPieces: Math.round(qty),
    packer1: packer,
    packer1Boxes: qty,
    packer2: "—",
    packer2Boxes: 0,
    packer3: "—",
    packer3Boxes: 0,
    packer4: "—",
    packer4Boxes: 0,
    totalPackerBoxes: qty,
    difference: 0,
    packer1Pieces: Math.round(qty),
    packer2Pieces: 0,
    packer3Pieces: 0,
    packer4Pieces: 0,
    isOrphan: false,
    isPackagerCredit: false,
    isOperatorCredit: false,
  }
}

function manualCapturesToBendingRows(
  captures: ProductionShiftManualCapture[],
  resolvePersonFromCode: (code: string | null | undefined) => string,
): BendingReportRow[] {
  const sorted = [...captures].sort((a, b) => {
    const orderA = BENDING_MACHINE_ORDER[a.sourceKey] ?? 99
    const orderB = BENDING_MACHINE_ORDER[b.sourceKey] ?? 99
    if (orderA !== orderB) return orderA - orderB
    return a.sourceKey.localeCompare(b.sourceKey, "es")
  })

  return sorted.map((capture, idx) => ({
    maquinaNum: BENDING_MACHINE_ORDER[capture.sourceKey] ?? idx + 1,
    operador: resolvePersonFromCode(capture.operatorCode) || "",
    codigo: capture.sku?.trim() || "",
    cajas: null,
    piezas: null,
    total: Math.round(capture.productionQty),
  }))
}

function machineRowsToMetalHooks(
  machineRows: MachineReportRow[],
  resolveEmployeeCode: (displayName: string) => string,
): MetalHooksRow[] {
  return machineRows.map((row, idx) => {
    const opName = row.operator1 !== "—" ? row.operator1 : row.operator2
    const opCode = opName !== "—" ? resolveEmployeeCode(opName) : ""
    const empCajas = row.totalPackerBoxes
    const empTotal =
      row.packer1Pieces + row.packer2Pieces + row.packer3Pieces + row.packer4Pieces

    return {
      codigo: row.item !== "—" ? row.item : "",
      maquina: row.machine,
      cajas: row.boxQty,
      piezas: row.piecesPerBox,
      total: row.totalPieces,
      maquinaNum: idx + 1,
      operadora: opName !== "—" ? opName : "",
      operadoraCodigo: opCode,
      empCajas,
      empPiezas: row.piecesPerBox,
      empTotal,
    }
  })
}

function buildDayWorksheet(
  sheet: Worksheet,
  dayIso: string,
  shiftNumber: 1 | 2,
  supervisorName: string,
  machineRows: MachineReportRow[],
  bendingRows: BendingReportRow[],
  resolveEmployeeCode: (displayName: string) => string,
) {
  const dateLabel = formatDdMmYyyy(dayIso, REPORT_TIMEZONE)
  const supervisor = supervisorName.trim() || "—"

  sheet.getRow(1).height = 20
  sheet.getRow(2).height = 20

  writeCell(sheet, 1, 1, "Fecha:", "label")
  writeCell(sheet, 1, 2, dateLabel, "value")
  writeCell(sheet, 1, 3, "Supervisor:", "label")
  writeCell(sheet, 1, 4, supervisor, "value")
  writeCell(sheet, 2, 1, "Turno:", "label")
  writeCell(sheet, 2, 2, String(shiftNumber), "value")

  const mainHeaders = [
    "Máquina",
    "Operador (a) 1",
    "Operador (a) 2",
    "Item",
    "Cantidad de Cajas",
    "Piezas / Caja",
    "Piezas Totales",
    "Empacador (a) 1",
    "Cantidad en cajas",
    "Empacador (a) 2",
    "Cantidad en Cajas",
    "Total en cajas",
    "Diferencia",
    "Total en Piezas Empacadas 1",
    "Total en Piezas Empacadas 2",
    "Empacador (a) 3",
    "Cantidad en cajas 3",
    "Total en Piezas Empacadas 3",
    "Empacador (a) 4",
    "Cantidad en cajas 4",
    "Total en Piezas Empacadas 4",
    "Estado",
  ]
  const mainHeaderRow = 4
  const mainDataStart = 5
  /** Filas en blanco entre la tabla principal y el bloque Personal / Metal Hooks. */
  const gapBeforePersonalBlock = 2
  /** Filas en blanco entre totales Metal Hooks y firmas. */
  const gapBeforeSignatures = 4
  /** Fila de banner Bending (después de totales Metal Hooks). */
  const gapBeforeBending = 1

  sheet.getRow(mainHeaderRow).height = 28
  mainHeaders.forEach((h, i) => writeCell(sheet, mainHeaderRow, i + 1, h, "header"))

  const rowCount = machineRows.length
  const mainDataEnd = rowCount > 0 ? mainDataStart + rowCount - 1 : mainDataStart
  /** Totales justo debajo de la última máquina (sin filas vacías fijas hasta la 32). */
  const mainTotalsRow = rowCount > 0 ? mainDataEnd + 1 : mainDataStart + 1

  const numericMainCols = new Set([5, 6, 7, 9, 11, 12, 13, 14, 15, 17, 18, 20, 21])

  machineRows.forEach((row, idx) => {
    const r = mainDataStart + idx
    const values: (string | number)[] = [
      row.machine,
      row.operator1,
      row.operator2,
      row.item,
      row.boxQty,
      row.piecesPerBox,
      row.totalPieces,
      row.packer1,
      row.packer1Boxes,
      row.packer2,
      row.packer2Boxes,
      row.totalPackerBoxes,
      row.difference,
      row.packer1Pieces,
      row.packer2Pieces,
      row.packer3,
      row.packer3Boxes,
      row.packer3Pieces,
      row.packer4,
      row.packer4Boxes,
      row.packer4Pieces,
      row.isPackagerCredit || row.isOperatorCredit
        ? row.isPackagerCredit && row.isOperatorCredit
          ? "CRÉDITO DE OPERACIÓN Y EMPAQUE"
          : row.isOperatorCredit
            ? "CRÉDITO DE OPERACIÓN"
            : "CRÉDITO DE EMPAQUE"
        : row.isOrphan
          ? "HUÉRFANA / SIN ATRIBUIR"
          : "ATRIBUIDA",
    ]
    values.forEach((v, i) => {
      const col = i + 1
      writeCell(sheet, r, col, v, numericMainCols.has(col) ? "number" : "data")
    })
  })

  if (rowCount > 0) {
    styleRect(sheet, mainDataStart, 1, mainDataEnd, 22, "data")
    for (const col of numericMainCols) {
      styleRect(sheet, mainDataStart, col, mainDataEnd, col, "number")
    }
    writeFormula(sheet, mainTotalsRow, 5, `SUM(E${mainDataStart}:E${mainDataEnd})`)
    writeFormula(sheet, mainTotalsRow, 7, `SUM(G${mainDataStart}:G${mainDataEnd})`)
    writeFormula(sheet, mainTotalsRow, 14, `SUM(N${mainDataStart}:N${mainDataEnd})`)
    writeFormula(sheet, mainTotalsRow, 15, `SUM(O${mainDataStart}:O${mainDataEnd})`)
    writeFormula(sheet, mainTotalsRow, 18, `SUM(R${mainDataStart}:R${mainDataEnd})`)
    writeFormula(sheet, mainTotalsRow, 21, `SUM(U${mainDataStart}:U${mainDataEnd})`)
    styleRect(sheet, mainTotalsRow, 1, mainTotalsRow, 22, "total")
  }

  const metalRows = machineRowsToMetalHooks(machineRows, resolveEmployeeCode)
  const operadoras = countDistinctPeople(
    machineRows.flatMap((r) => [r.operator1, r.operator2]),
  )
  const empacadoras = countDistinctPeople(
    machineRows.flatMap((r) => [r.packer1, r.packer2, r.packer3, r.packer4]),
  )

  const bannerRow = mainTotalsRow + gapBeforePersonalBlock
  const labelRow = bannerRow + 1
  const subLabelRow = bannerRow + 2
  const mhDataStart = subLabelRow

  sheet.getRow(bannerRow).height = 24
  mergeWrite(sheet, bannerRow, 2, 3, "Personal", "banner")
  mergeWrite(sheet, bannerRow, 4, 8, "Metal Hooks", "bannerGreen")
  mergeWrite(
    sheet,
    bannerRow,
    9,
    14,
    "",
    "bannerGreen",
  )

  writeCell(sheet, labelRow, 2, "operadoras", "meta")
  writeCell(sheet, labelRow, 3, operadoras, "number")
  writeCell(sheet, subLabelRow, 2, "empacadoras", "meta")
  writeCell(sheet, subLabelRow, 3, empacadoras, "number")

  const mhHeaders = [
    "Codigo",
    "Maquina",
    "Cajas",
    "Piezas",
    "Total",
    "Maquina",
    "Operadora",
    "Codigo",
  ]
  sheet.getRow(labelRow).height = 26
  mhHeaders.forEach((h, i) =>
    writeCell(sheet, labelRow, MH_COL.CODIGO + i, h, "headerGreen"),
  )
  writeCell(sheet, labelRow, MH_COL.EMP_CAJAS, "", "headerGreen")
  writeCell(sheet, labelRow, MH_COL.EMP_PIEZAS, "", "headerGreen")
  writeCell(sheet, labelRow, MH_COL.EMP_TOTAL, "Total", "headerGreen")

  const mhNumeric = new Set<number>([
    MH_COL.CAJAS,
    MH_COL.PIEZAS,
    MH_COL.TOTAL,
    MH_COL.MAQUINA_NUM,
    MH_COL.EMP_CAJAS,
    MH_COL.EMP_PIEZAS,
    MH_COL.EMP_TOTAL,
  ])

  metalRows.forEach((row, idx) => {
    const r = mhDataStart + idx
    const pairs: [number, string | number][] = [
      [MH_COL.CODIGO, row.codigo],
      [MH_COL.MAQUINA, row.maquina],
      [MH_COL.CAJAS, row.cajas],
      [MH_COL.PIEZAS, row.piezas],
      [MH_COL.TOTAL, row.total],
      [MH_COL.MAQUINA_NUM, row.maquinaNum],
      [MH_COL.OPERADORA, row.operadora],
      [MH_COL.CODIGO_OP, row.operadoraCodigo],
      [MH_COL.EMP_CAJAS, row.empCajas],
      [MH_COL.EMP_PIEZAS, row.empPiezas],
      [MH_COL.EMP_TOTAL, row.empTotal],
    ]
    for (const [col, val] of pairs) {
      writeCell(sheet, r, col, val, mhNumeric.has(col) ? "number" : "data")
    }
  })

  const mhDataEnd =
    metalRows.length > 0 ? mhDataStart + metalRows.length - 1 : mhDataStart
  const mhTotalsRow = mhDataEnd + 1

  if (metalRows.length > 0) {
    const sumCols = [
      MH_COL.CAJAS,
      MH_COL.PIEZAS,
      MH_COL.TOTAL,
      MH_COL.EMP_CAJAS,
      MH_COL.EMP_PIEZAS,
      MH_COL.EMP_TOTAL,
    ] as const
    const colLetter = (n: number) => sheet.getColumn(n).letter
    for (const col of sumCols) {
      const letter = colLetter(col)
      writeFormula(
        sheet,
        mhTotalsRow,
        col,
        `SUM(${letter}${mhDataStart}:${letter}${mhDataEnd})`,
      )
    }
    styleRect(sheet, mhDataStart, MH_COL.CODIGO, mhDataEnd, MH_COL.EMP_TOTAL, "data")
    styleRect(sheet, mhTotalsRow, MH_COL.CODIGO, mhTotalsRow, MH_COL.EMP_TOTAL, "total")
  }

  const bendBannerRow = mhTotalsRow + gapBeforeBending
  const bendHeaderRow = bendBannerRow + 1
  sheet.getRow(bendBannerRow).height = 24
  mergeWrite(sheet, bendBannerRow, BEND_COL.MAQUINA, BEND_COL.TOTAL, "Bending", "bannerGreen")

  const bendHeaders: [number, string][] = [
    [BEND_COL.MAQUINA, "Maquina"],
    [BEND_COL.OPERADOR, "Operador"],
    [BEND_COL.CODIGO, "Codigo"],
    [BEND_COL.VACIO, ""],
    [BEND_COL.PIEZAS, "Piezas"],
    [BEND_COL.TOTAL, "Total"],
  ]
  sheet.getRow(bendHeaderRow).height = 26
  for (const [col, label] of bendHeaders) {
    writeCell(sheet, bendHeaderRow, col, label, "headerGreen")
  }

  const bendDataStart = bendHeaderRow + 1
  const bendNumeric = new Set<number>([
    BEND_COL.MAQUINA,
    BEND_COL.VACIO,
    BEND_COL.PIEZAS,
    BEND_COL.TOTAL,
  ])

  bendingRows.forEach((row, idx) => {
    const r = bendDataStart + idx
    const pairs: [number, string | number | null][] = [
      [BEND_COL.MAQUINA, row.maquinaNum],
      [BEND_COL.OPERADOR, row.operador],
      [BEND_COL.CODIGO, row.codigo],
      [BEND_COL.VACIO, row.cajas],
      [BEND_COL.PIEZAS, row.piezas],
      [BEND_COL.TOTAL, row.total],
    ]
    for (const [col, val] of pairs) {
      if (val == null || val === "") continue
      writeCell(sheet, r, col, val, bendNumeric.has(col) ? "number" : "data")
    }
  })

  const bendDataEnd =
    bendingRows.length > 0 ? bendDataStart + bendingRows.length - 1 : bendHeaderRow
  const bendTotalsRow = bendDataEnd + 1

  if (bendingRows.length > 0) {
    const colLetter = (n: number) => sheet.getColumn(n).letter
    const hasCajas = bendingRows.some((r) => r.cajas != null)
    if (hasCajas) {
      const letter = colLetter(BEND_COL.VACIO)
      writeFormula(
        sheet,
        bendTotalsRow,
        BEND_COL.VACIO,
        `SUM(${letter}${bendDataStart}:${letter}${bendDataEnd})`,
      )
    }
    const totalLetter = colLetter(BEND_COL.TOTAL)
    writeFormula(
      sheet,
      bendTotalsRow,
      BEND_COL.TOTAL,
      `SUM(${totalLetter}${bendDataStart}:${totalLetter}${bendDataEnd})`,
    )
    styleRect(sheet, bendTotalsRow, BEND_COL.MAQUINA, bendTotalsRow, BEND_COL.TOTAL, "total")
  }

  const sigLineRow =
    (bendingRows.length > 0 ? bendTotalsRow : bendHeaderRow) + gapBeforeSignatures
  const sigLabelRow = sigLineRow + 1
  sheet.getRow(sigLineRow).height = 28

  mergeWrite(sheet, sigLineRow, 3, 4, "", "sigLine")
  mergeWrite(sheet, sigLineRow, 8, 11, "", "sigLine")
  mergeWrite(sheet, sigLabelRow, 3, 4, "Firma de supervisor", "sigLabel")
  mergeWrite(sheet, sigLabelRow, 8, 11, "Firma jefe de produccion", "sigLabel")

  sheet.views = [{ state: "frozen", ySplit: 4, activeCell: "A5" }]
  autoFitColumns(sheet, 22, sigLabelRow)
}

export function productionShiftReportFilename(
  shiftNumber: 1 | 2,
  reportDate: string,
  timeZone = REPORT_TIMEZONE,
): string {
  const month = monthNameCapitalizedEs(reportDate, timeZone)
  const [y] = reportDate.split("-")
  return `Reporte de Producción Turno ${shiftNumber} ${month} ${y}.xlsx`
}

export async function buildProductionShiftReportBlob(
  params: BuildProductionShiftReportParams & {
    resolveFromCheckin: (
      ch: ApiMachineCheckin,
    ) => {
      operator1: string
      operator2: string
      packer1: string
      packer2: string
      packer3?: string
      packer4?: string
    }
  },
): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "Paskal Métricas"
  workbook.created = new Date()

  const daysInMonth = allCalendarDaysInMonth(params.reportDate)
  const usedSheetNames = new Set<string>()

  const reportShift = params.shiftNumber === 1 ? "matutino" : "vespertino"
  for (const dayIso of daysInMonth) {
    // Ventana de reloj (mitades del día) solo para resolver el check-in del turno.
    const { start, end } = getShiftBoundsForCalendarDate(
      dayIso,
      params.shiftNumber,
      REPORT_TIMEZONE,
    )
    const startMs = start.getTime()
    const endMs = end.getTime()

    // Piezas: día completo + turno por operadora (fila ya clasificada).
    const dayBounds = getPlantDayBoundsForCalendarDate(dayIso, REPORT_TIMEZONE)
    const dayStartMs = dayBounds.start.getTime()
    const dayEndMs = dayBounds.end.getTime()
    const dayRows = params.rows.filter((r) => {
      if (r.event !== "Producción") return false
      const ts = new Date(r.timestamp).getTime()
      return ts >= dayStartMs && ts < dayEndMs
    })
    const prodRows = rowsForProductionReportShift(dayRows, reportShift)

    const machineRows = aggregateMachineRows(
      prodRows,
      params.checkins,
      startMs,
      endMs,
      params.resolveFromCheckin,
    )

    const dayManual = (params.manualCaptures ?? []).filter(
      (c) => c.recordDate === dayIso && manualCaptureMatchesShift(c.shift, params.shiftNumber),
    )
    const windingManual = dayManual
      .filter((c) => c.category === "winding")
      .map((c) => manualWindingToMachineRow(c, params.resolvePersonFromCode))
    const bendingRows = manualCapturesToBendingRows(
      dayManual.filter((c) => c.category === "bending"),
      params.resolvePersonFromCode,
    )

    // El catálogo/metas puede validar el SKU, pero jamás decide si una pieza se exporta.
    const allMachineRows = [...machineRows, ...windingManual].sort((a, b) =>
      a.machine.localeCompare(b.machine, "es"),
    )

    let sheetName = excelSheetNameForDay(dayIso, REPORT_TIMEZONE)
    if (usedSheetNames.has(sheetName)) {
      let n = 2
      while (usedSheetNames.has(`${sheetName} (${n})`)) n += 1
      sheetName = `${sheetName} (${n})`.slice(0, 31)
    }
    usedSheetNames.add(sheetName)

    const sheet = workbook.addWorksheet(sheetName, {
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 },
    })
    buildDayWorksheet(
      sheet,
      dayIso,
      params.shiftNumber,
      params.supervisorName,
      allMachineRows,
      bendingRows,
      params.resolveEmployeeCode,
    )
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
}
