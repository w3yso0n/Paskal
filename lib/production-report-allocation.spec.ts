import { describe, expect, it } from "vitest"
import { buildAnnualAccumulatedReportBlob } from "./annual-accumulated-report-excel"
import { aggregateRoleProductionByDay } from "./bonus-accumulated-report-excel"
import { allocateIntegerLargestRemainder } from "./production-report-allocation"
import {
  buildProductionShiftReportBlob,
  reconcileProductionReportRows,
  rowsForProductionReportShift,
  type ProductionShiftReportSourceRow,
} from "./production-shift-report-excel"

function sourceRow(
  overrides: Partial<ProductionShiftReportSourceRow> = {},
): ProductionShiftReportSourceRow {
  return {
    machine_id: "M-001",
    machineIdRaw: "machine-1",
    timestamp: "2026-07-10T16:00:00.000Z",
    operator: "Operadora T1",
    operator_2: "—",
    operatorShift: "matutino",
    operator2Shift: null,
    packer_1: "Empacadora T1",
    packer_2: "Empacadora T2",
    packer_3: "—",
    packer_4: "—",
    packersAttributed: ["Empacadora T1", "Empacadora T2"],
    packerShifts: ["matutino", "vespertino"],
    count: 100,
    event: "Producción",
    sku: "SKU-1",
    unitsPerBox: 50,
    shift: "matutino",
    ...overrides,
  }
}

describe("allocateIntegerLargestRemainder", () => {
  it("conserva 100 piezas entre tres personas de forma determinista", () => {
    const result = allocateIntegerLargestRemainder(100, ["A", "B", "C"])
    expect(result.map((row) => row.quantity)).toEqual([34, 33, 33])
    expect(result.reduce((sum, row) => sum + row.quantity, 0)).toBe(100)
  })

  it("conserva 101 piezas entre cuatro personas", () => {
    const result = allocateIntegerLargestRemainder(101, ["A", "B", "C", "D"])
    expect(result.map((row) => row.quantity)).toEqual([26, 25, 25, 25])
    expect(result.reduce((sum, row) => sum + row.quantity, 0)).toBe(101)
  })
})

describe("rowsForProductionReportShift", () => {
  it("no duplica bono cuando la misma persona opera y empaca", () => {
    const row = sourceRow({
      operator: "Persona doble rol",
      packer_1: "Persona doble rol",
      packer_2: "—",
      packersAttributed: ["Persona doble rol"],
      packerShifts: ["matutino"],
    })
    const byPerson = aggregateRoleProductionByDay(
      [row],
      [
        {
          dayIso: "2026-07-10",
          startMs: new Date("2026-07-10T00:00:00.000Z").getTime(),
          endMs: new Date("2026-07-11T00:00:00.000Z").getTime(),
        },
      ],
      "matutino",
    )
    const totals = byPerson.get("Persona doble rol")?.get("2026-07-10")
    expect(Object.values(totals ?? {}).reduce((sum, value) => sum + value, 0)).toBe(100)
  })

  it("reporta la máquina una vez y separa el crédito por turno de empacadora", () => {
    const row = sourceRow()
    const turno1 = rowsForProductionReportShift([row], "matutino")
    const turno2 = rowsForProductionReportShift([row], "vespertino")

    expect(turno1).toHaveLength(1)
    expect(turno1[0].count).toBe(100)
    expect(turno1[0].packersAttributed).toEqual(["Empacadora T1"])
    expect(turno1[0].packerAllocatedPieces).toEqual([50])

    expect(turno2).toHaveLength(1)
    expect(turno2[0].count).toBe(0)
    expect(turno2[0].isPackagerCredit).toBe(true)
    expect(turno2[0].packagingCreditPieces).toBe(50)

    const machinePieces = [...turno1, ...turno2].reduce((sum, item) => sum + item.count, 0)
    const creditedPieces = [...turno1, ...turno2].reduce(
      (sum, item) =>
        sum +
        (item.packerAllocatedPieces ?? []).reduce(
          (allocationSum, pieces) => allocationSum + pieces,
          0,
        ),
      0,
    )
    expect(machinePieces).toBe(100)
    expect(creditedPieces).toBe(100)
  })

  it("conserva producción huérfana en su turno horario sin inventar personal", () => {
    const orphan = sourceRow({
      operator: "Sin check-in",
      operatorShift: null,
      packer_1: "—",
      packer_2: "—",
      packersAttributed: [],
      packerShifts: [],
      isOrphan: true,
      shift: "vespertino",
      count: 75,
    })
    expect(rowsForProductionReportShift([orphan], "matutino")).toEqual([])
    const rows = rowsForProductionReportShift([orphan], "vespertino")
    expect(rows).toHaveLength(1)
    expect(rows[0].count).toBe(75)
    expect(rows[0].isOrphan).toBe(true)
  })

  it("separa al segundo operador por su turno sin duplicar la máquina", () => {
    const row = sourceRow({
      operator_2: "Operador T2",
      operator2Shift: "vespertino",
    })
    const turno1 = rowsForProductionReportShift([row], "matutino")
    const turno2 = rowsForProductionReportShift([row], "vespertino")

    expect(turno1[0].count).toBe(100)
    expect(turno1[0].operatorAllocatedPieces).toEqual([50])
    expect(turno2[0].count).toBe(0)
    expect(turno2[0].isOperatorCredit).toBe(true)
    expect(turno2[0].operator).toBe("Operador T2")
    expect(turno2[0].operatorCreditPieces).toBe(50)
  })

  it("concilia máquina y empaque incluyendo un ajuste sin duplicar producción", () => {
    const result = reconcileProductionReportRows([
      sourceRow({ count: 101 }),
      sourceRow({
        count: 0,
        isPackagerCredit: true,
        packagingCreditPieces: 37,
        packersAttributed: ["Empacadora T2"],
        packerShifts: ["vespertino"],
      }),
    ])

    expect(result.sourceMachinePieces).toBe(101)
    expect(result.reportedMachinePieces).toBe(101)
    expect(result.sourcePackagingPieces).toBe(138)
    expect(result.reportedPackagingPieces).toBe(138)
  })

  it("genera el anual con roster mixto y cuatro espacios de empaque", async () => {
    const blob = await buildAnnualAccumulatedReportBlob(2026, [
      sourceRow({
        count: 101,
        operator_2: "Operador T2",
        operator2Shift: "vespertino",
        packer_3: "Empacadora 3",
        packer_4: "Empacadora 4",
        packersAttributed: [
          "Empacadora T1",
          "Empacadora T2",
          "Empacadora 3",
          "Empacadora 4",
        ],
        packerShifts: ["matutino", "vespertino", "matutino", "vespertino"],
      }),
    ])

    expect(blob.size).toBeGreaterThan(0)
  })

  it("conserva en los dos Excel exactamente las piezas de fuente", async () => {
    const row = sourceRow({
      count: 101,
      operator_2: "Operador T2",
      operator2Shift: "vespertino",
      packer_3: "Empacadora 3",
      packer_4: "Empacadora 4",
      packersAttributed: [
        "Empacadora T1",
        "Empacadora T2",
        "Empacadora 3",
        "Empacadora 4",
      ],
      packerShifts: ["matutino", "vespertino", "matutino", "vespertino"],
    })
    const build = (shiftNumber: 1 | 2) =>
      buildProductionShiftReportBlob({
        reportDate: "2026-07-01",
        shiftNumber,
        supervisorName: "Supervisión",
        rows: [row],
        checkins: [],
        resolveEmployeeCode: () => "",
        resolvePersonFromCode: () => "",
        resolveFromCheckin: () => ({
          operator1: "—",
          operator2: "—",
          packer1: "—",
          packer2: "—",
          packer3: "—",
          packer4: "—",
        }),
      })
    const [turno1, turno2] = await Promise.all([build(1), build(2)])
    const ExcelJS = (await import("exceljs")).default

    const totals = async (blob: Blob) => {
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(await blob.arrayBuffer())
      let machine = 0
      let packaging = 0
      workbook.eachSheet((sheet) => {
        for (let rowNumber = 5; rowNumber <= sheet.rowCount; rowNumber++) {
          const status = String(sheet.getCell(rowNumber, 22).value ?? "")
          if (!status.includes("CRÉDITO") && status !== "ATRIBUIDA") continue
          machine += Number(sheet.getCell(rowNumber, 7).value ?? 0)
          packaging += [14, 15, 18, 21].reduce(
            (sum, column) => sum + Number(sheet.getCell(rowNumber, column).value ?? 0),
            0,
          )
        }
      })
      return { machine, packaging }
    }
    const first = await totals(turno1)
    const second = await totals(turno2)
    const annualBlob = await buildAnnualAccumulatedReportBlob(2026, [row])
    const annualWorkbook = new ExcelJS.Workbook()
    await annualWorkbook.xlsx.load(await annualBlob.arrayBuffer())
    let annualMachine = 0
    let annualPackaging = 0
    for (const name of ["Turno Matutino", "Turno Vespertino"]) {
      const sheet = annualWorkbook.getWorksheet(name)
      if (!sheet) continue
      for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
        annualMachine += Number(sheet.getCell(rowNumber, 9).value ?? 0)
        annualPackaging += [16, 17, 20, 23].reduce(
          (sum, column) => sum + Number(sheet.getCell(rowNumber, column).value ?? 0),
          0,
        )
      }
    }

    expect(first.machine + second.machine).toBe(101)
    expect(first.packaging + second.packaging).toBe(101)
    expect(annualMachine).toBe(first.machine + second.machine)
    expect(annualPackaging).toBe(first.packaging + second.packaging)
  }, 15_000)
})
