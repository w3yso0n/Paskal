import { describe, expect, it } from "vitest"
import {
  anonymizeResponse,
  buildDemoRegistry,
  deanonymizePath,
  findLeaks,
} from "./demo-anonymizer"

const employees = [
  {
    id: "e1",
    fullName: "María José Hernández López",
    employeeCode: "OP-1042",
    nfcCardUid: "04a1b2c3d4e5f6",
    createdAt: "2025-01-01T00:00:00Z",
    rfc: "HELM900101AB1",
    imss: "12345678901",
    hiredAt: "2023-03-15",
  },
  {
    id: "e2",
    fullName: "Juan Pérez Soto",
    employeeCode: "EMP9001",
    nfcCardUid: "EMP9001",
    createdAt: "2025-02-01T00:00:00Z",
    rfc: null,
    imss: null,
    hiredAt: null,
  },
]
const users = [
  { id: "u1", email: "director@paskal.mx", fullName: "Roberto Díaz", createdAt: "2024-01-01T00:00:00Z" },
]

const reg = buildDemoRegistry(employees, users, 12345)

const realValues = [
  "María José Hernández López",
  "María Hernández",
  "Maria Hernandez",
  "Juan Pérez Soto",
  "Juan Pérez",
  "OP-1042",
  "04a1b2c3d4e5f6",
  "EMP9001",
  "HELM900101AB1",
  "12345678901",
  "director@paskal.mx",
  "Roberto Díaz",
]

function assertNoLeaks(out: unknown) {
  const json = JSON.stringify(out)
  for (const v of realValues) expect(json.toLowerCase()).not.toContain(v.toLowerCase())
}

describe("demo-anonymizer", () => {
  it("reemplaza empleados y datos personales de forma estable", () => {
    const out = anonymizeResponse(employees, reg) as typeof employees
    assertNoLeaks(out)
    expect(out[0].fullName).toBe("Empleado 1")
    expect(out[1].fullName).toBe("Empleado 2")
    expect(out[0].employeeCode).toBe("EMP-001")
    expect(out[0].rfc).toBe("XAXX010101000")
    expect(out[0].imss).toBe("00000000000")
    expect(out[0].hiredAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // legacy: código = NFC → mismo valor ficticio
    expect(out[1].nfcCardUid).toBe(out[1].employeeCode)
    expect(anonymizeResponse(employees, reg)).toEqual(out)
  })

  it("mantiene los joins por código entre endpoints", () => {
    const checkin = anonymizeResponse({ operatorCode: "op-1042", packager1Code: "EMP9001" }, reg) as Record<
      string,
      string
    >
    const emps = anonymizeResponse(employees, reg) as typeof employees
    expect(checkin.operatorCode).toBe(emps[0].employeeCode)
    expect(checkin.packager1Code).toBe(emps[1].employeeCode)
  })

  it("limpia texto libre de alertas (nombres, códigos, emails, piezas)", () => {
    const alert = {
      title: "Producción sin empacador — M-12",
      message: "OP-1042 — María José Hernández López dejó 120 piezas. Avisó director@paskal.mx",
      metadata: {
        rejectedName: "Juan Pérez",
        violators: [{ name: "Maria Hernandez", code: "OP-1042", workedMinutes: 600 }],
        countAtCheckin: 57,
      },
    }
    const out = anonymizeResponse(alert, reg) as typeof alert
    assertNoLeaks(out)
    expect(out.title).toBe(alert.title)
    expect(out.message).toContain("Empleado 1")
    expect(out.message).not.toContain("120 piezas")
    expect(out.metadata.violators[0].workedMinutes).toBe(600)
    expect(out.metadata.countAtCheckin).not.toBe(57)
  })

  it("escala unidades de PROD a enteros y cambia el % de meta", () => {
    const events = Array.from({ length: 200 }, (_, i) => ({
      id: `ev${i}`,
      machineId: "m1",
      eventType: "PROD",
      occurredAt: "2026-07-10T16:00:00Z",
      message: null,
      payload: { units: 48, operators: [i % 2 ? "OP-1042" : "EMP9001"], sku: "SKU-1" },
    }))
    const out = anonymizeResponse(events, reg) as typeof events
    let real = 0
    let fake = 0
    for (let i = 0; i < events.length; i++) {
      real += events[i].payload.units
      fake += out[i].payload.units
      expect(Number.isInteger(out[i].payload.units)).toBe(true)
      expect(out[i].payload.sku).toBe("SKU-1")
    }
    expect(fake).not.toBe(real)
    assertNoLeaks(out)

    const goal = anonymizeResponse({ targetValue: 9600 }, reg) as { targetValue: number }
    expect(goal.targetValue).not.toBe(9600)
    expect(fake / goal.targetValue).not.toBeCloseTo(real / 9600, 2)
  })

  it("escala dinero y filas SQL de /datos en snake_case", () => {
    const rows = {
      columns: ["full_name", "employee_code", "nfc_card_uid", "base_bonus_100", "production_qty"],
      rows: [
        {
          full_name: "Juan Pérez Soto",
          employee_code: "EMP9001",
          nfc_card_uid: "04a1b2c3d4e5f6",
          base_bonus_100: 1650,
          production_qty: 3650,
        },
      ],
    }
    const out = anonymizeResponse(rows, reg) as typeof rows
    assertNoLeaks(out)
    expect(out.columns).toEqual(rows.columns)
    expect(out.rows[0].base_bonus_100).not.toBe(1650)
    expect(out.rows[0].production_qty).not.toBe(3650)
  })

  it("traduce códigos ficticios en query params de vuelta a los reales", () => {
    expect(deanonymizePath("/employee-day-record?employeeCode=EMP-001", reg)).toBe(
      "/employee-day-record?employeeCode=OP-1042",
    )
    expect(deanonymizePath("/machine", reg)).toBe("/machine")
  })

  it("el leak-check detecta valores reales visibles", () => {
    expect(findLeaks("Operadora: María José Hernández López", reg).length).toBeGreaterThan(0)
    expect(findLeaks("Operadora: Empleado 1 · EMP-001", reg)).toEqual([])
  })
})
