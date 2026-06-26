import type { ApiGoal, ApiGoalShift, ApiMachine, ApiMachineCheckin } from "@/lib/api"
import type { BonusProductionConfigData } from "@/lib/bonus-production-config"
import {
  classifyProductionTimestamp,
  dayKeyFromDate,
  SHIFT_SCHEDULE,
  timeLabel,
} from "@/lib/shift-schedule"
import { productionShiftFromMeasuredAt } from "@/lib/tablero-operator-goal"
import {
  EARLY_CHECKOUT_QUOTA_EXEMPTION_NOTE,
  shouldFlagEarlyCheckoutUnderGoal,
} from "@/lib/early-checkout-policy"

export type ShiftIncidentKind =
  | "overtime_production"
  | "early_leave_under_goal"
  | "post_cleaning_production"
  | "production_during_cleaning"

export type ShiftIncidentSeverity = "incident" | "warning" | "info"

export type ShiftIncidentRow = {
  id: string
  kind: ShiftIncidentKind
  severity: ShiftIncidentSeverity
  occurredAt: string
  day: string
  shift: ApiGoalShift
  employeeName: string
  employeeCode: string | null
  machineLabel: string
  units: number
  title: string
  detail: string
  goalTarget: number | null
  goalActual: number | null
}

export type ShiftIncidentSummary = {
  overtimeCount: number
  earlyLeaveCount: number
  postCleaningCount: number
  cleaningProductionCount: number
  total: number
}

export type ShiftIncidentsAnalytics = {
  incidents: ShiftIncidentRow[]
  summary: ShiftIncidentSummary
  scheduleNotes: string[]
}

type ProductionRow = {
  timestamp: string
  event: string
  count: number
  operator: string
  machine_id: string
  machineIdRaw: string | null
  sku?: string
  unitsPerBox?: number
}

function buildNameToCode(employees: Array<{ fullName: string; employeeCode?: string | null }>) {
  const map = new Map<string, string>()
  for (const e of employees) {
    const name = e.fullName?.trim()
    const code = e.employeeCode?.trim()
    if (name && code) {
      map.set(name, code)
      map.set(name.toLowerCase(), code)
    }
  }
  return map
}

function operatorCodesFromCheckin(ch: ApiMachineCheckin): string[] {
  const codes = [ch.operatorCode, ch.operator2Code].filter((c): c is string => Boolean(c?.trim()))
  return [...new Set(codes.map((c) => c.trim()))]
}

const KIND_META: Record<
  ShiftIncidentKind,
  { title: string; severity: ShiftIncidentSeverity }
> = {
  overtime_production: {
    title: "Producción después del turno",
    severity: "incident",
  },
  early_leave_under_goal: {
    title: "Salida anticipada sin meta",
    severity: "incident",
  },
  post_cleaning_production: {
    title: "Producción después de limpieza",
    severity: "warning",
  },
  production_during_cleaning: {
    title: "Producción en horario de limpieza",
    severity: "info",
  },
}

export function buildShiftIncidentsAnalytics(input: {
  productionRows: ProductionRow[]
  checkins: ApiMachineCheckin[]
  machines: ApiMachine[]
  goals: ApiGoal[]
  bonusConfig: BonusProductionConfigData | null
  employees: Array<{ fullName: string; employeeCode?: string | null }>
  from: string
  to: string
}): ShiftIncidentsAnalytics {
  const machineLabelById = new Map<string, string>()
  for (const m of input.machines) {
    if (m.id) machineLabelById.set(m.id, (m.code ?? m.name ?? "—").trim() || "—")
  }

  const nameToCode = buildNameToCode(input.employees)
  const codeToName = new Map<string, string>()
  for (const e of input.employees) {
    const code = e.employeeCode?.trim()
    if (code) codeToName.set(code.toLowerCase(), e.fullName)
  }

  const start = new Date(`${input.from}T00:00:00`)
  const end = new Date(`${input.to}T23:59:59.999`)

  const incidents: ShiftIncidentRow[] = []
  const seenEarlyLeave = new Set<string>()

  const quotaProductionRows = input.productionRows.map((r) => ({
    timestamp: r.timestamp,
    event: r.event,
    count: r.count,
    operator: r.operator,
    machineIdRaw: r.machineIdRaw,
    sku: r.sku ?? "—",
    unitsPerBox: r.unitsPerBox ?? 48,
  }))

  for (const r of input.productionRows) {
    if (r.event !== "Producción") continue
    const d = new Date(r.timestamp)
    if (Number.isNaN(d.getTime()) || d < start || d > end) continue

    const { shift, zone } = classifyProductionTimestamp(r.timestamp)
    if (!shift || zone === "in_shift") continue

    let kind: ShiftIncidentKind | null = null
    if (zone === "overtime") kind = "overtime_production"
    else if (zone === "post_cleaning") kind = "post_cleaning_production"
    else if (zone === "cleaning") kind = "production_during_cleaning"
    if (!kind) continue

    const opName = r.operator?.trim() && r.operator !== "—" ? r.operator : "Sin operador"
    const opCode =
      nameToCode.get(opName) ?? nameToCode.get(opName.toLowerCase()) ?? null

    const endLabel =
      shift === "matutino"
        ? timeLabel(SHIFT_SCHEDULE.matutino.productionEnd.hour)
        : timeLabel(
            SHIFT_SCHEDULE.vespertino.productionEnd.hour,
            SHIFT_SCHEDULE.vespertino.productionEnd.minute,
          )

    const detail =
      kind === "overtime_production"
        ? `Producción registrada después del fin de turno (${endLabel}).`
        : kind === "post_cleaning_production"
          ? `Producción después de la ventana de limpieza (${timeLabel(23, 30)}).`
          : `Producción durante limpieza de máquinas (${timeLabel(23, 0)}–${timeLabel(23, 30)}).`

    const meta = KIND_META[kind]
    incidents.push({
      id: `prod-${r.timestamp}-${r.machineIdRaw ?? r.machine_id}-${kind}`,
      kind,
      severity: meta.severity,
      occurredAt: r.timestamp,
      day: dayKeyFromDate(d),
      shift,
      employeeName: opName,
      employeeCode: opCode,
      machineLabel: r.machine_id || "—",
      units: Number(r.count) || 0,
      title: meta.title,
      detail,
      goalTarget: null,
      goalActual: null,
    })
  }

  for (const ch of input.checkins) {
    if (!ch.checkedOutAt) continue
    const checkout = new Date(ch.checkedOutAt)
    if (Number.isNaN(checkout.getTime()) || checkout < start || checkout > end) continue

    const shift = productionShiftFromMeasuredAt(ch.checkedInAt)
    if (!shift) continue

    for (const operatorCode of operatorCodesFromCheckin(ch)) {
      const day = dayKeyFromDate(checkout)
      const dedupeKey = `${operatorCode}|${day}|${shift}`
      if (seenEarlyLeave.has(dedupeKey)) continue

      const { flag, quota } = shouldFlagEarlyCheckoutUnderGoal({
        checkout,
        shift,
        operatorCode,
        checkin: ch,
        machines: input.machines,
        goals: input.goals,
        bonusConfig: input.bonusConfig,
        productionRows: quotaProductionRows,
        employees: input.employees,
      })
      if (!flag) continue

      seenEarlyLeave.add(dedupeKey)
      const machineLabel =
        machineLabelById.get(ch.machineId) ?? ch.machineCode ?? "—"
      const employeeName = codeToName.get(operatorCode.toLowerCase()) ?? operatorCode
      const endLabel = timeLabel(
        SHIFT_SCHEDULE[shift].productionEnd.hour,
        SHIFT_SCHEDULE[shift].productionEnd.minute,
      )
      const actual = quota.actual
      const target = quota.target

      incidents.push({
        id: `leave-${operatorCode}-${day}-${shift}`,
        kind: "early_leave_under_goal",
        severity: "incident",
        occurredAt: ch.checkedOutAt,
        day,
        shift,
        employeeName,
        employeeCode: operatorCode,
        machineLabel,
        units: actual,
        title: KIND_META.early_leave_under_goal.title,
        detail: `Check-out a las ${checkout.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })} (antes de ${endLabel}). Producción del turno: ${Math.round(actual).toLocaleString()} / meta ${Math.round(target).toLocaleString()}.`,
        goalTarget: target,
        goalActual: actual,
      })
    }
  }

  incidents.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))

  const summary: ShiftIncidentSummary = {
    overtimeCount: incidents.filter((i) => i.kind === "overtime_production").length,
    earlyLeaveCount: incidents.filter((i) => i.kind === "early_leave_under_goal").length,
    postCleaningCount: incidents.filter((i) => i.kind === "post_cleaning_production").length,
    cleaningProductionCount: incidents.filter((i) => i.kind === "production_during_cleaning").length,
    total: incidents.length,
  }

  const scheduleNotes = [
    `${SHIFT_SCHEDULE.matutino.label}: producción ${SHIFT_SCHEDULE.matutino.windowLabel}. Después de las 16:00 = incidencia.`,
    `${SHIFT_SCHEDULE.vespertino.label}: producción ${SHIFT_SCHEDULE.vespertino.windowLabel}. Después de las 23:30 = incidencia.`,
    EARLY_CHECKOUT_QUOTA_EXEMPTION_NOTE,
  ]

  return { incidents, summary, scheduleNotes }
}
