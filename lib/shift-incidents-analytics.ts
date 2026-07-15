import type { ApiGoal, ApiGoalShift, ApiMachine, ApiMachineCheckin, ApiOperatorCheckoutEvaluation } from "@/lib/api"
import type { BonusProductionConfigData } from "@/lib/bonus-production-config"
import {
  classifyProductionTimestamp,
  dayKeyFromDate,
  minutesSinceMidnight,
  SHIFT_EDGE_TOLERANCE_MINUTES,
  SHIFT_SCHEDULE,
  shiftEndWithToleranceMinutes,
  shiftStartWithToleranceMinutes,
  timeLabel,
  type ShiftProductionZone,
} from "@/lib/shift-schedule"
import { productionShiftFromMeasuredAt } from "@/lib/tablero-operator-goal"
import {
  EARLY_CHECKOUT_QUOTA_EXEMPTION_NOTE,
  type EarlyCheckoutProductionRow,
  shouldFlagEarlyCheckoutUnderGoal,
} from "@/lib/early-checkout-policy"

/**
 * Producción fuera de horario: turno asignado ±15 min de tolerancia.
 * Distingue "antes del turno" vs "después del turno".
 * Salida anticipada / olvido de checkout vienen del backend.
 */
export const INCIDENCIAS_OUT_OF_SHIFT_ENABLED = true
/** Legacy flag: early leave ahora usa API; se mantiene true para KPIs/UI. */
export const INCIDENCIAS_EARLY_LEAVE_ENABLED = true

export type ShiftIncidentKind =
  | "overtime_production"
  | "pre_shift_production"
  | "early_leave_under_goal"
  | "forgot_checkout_under_goal"
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
  preShiftCount: number
  earlyLeaveCount: number
  forgotCheckoutCount: number
  postCleaningCount: number
  cleaningProductionCount: number
  total: number
}

export type ShiftIncidentsAnalytics = {
  incidents: ShiftIncidentRow[]
  summary: ShiftIncidentSummary
  scheduleNotes: string[]
}

const OUT_OF_SHIFT_KINDS: ReadonlySet<ShiftIncidentKind> = new Set([
  "overtime_production",
  "pre_shift_production",
  "post_cleaning_production",
  "production_during_cleaning",
])

export function isOutOfShiftIncidentKind(kind: ShiftIncidentKind): boolean {
  return OUT_OF_SHIFT_KINDS.has(kind)
}

export function summarizeShiftIncidents(incidents: ShiftIncidentRow[]): ShiftIncidentSummary {
  return {
    overtimeCount: incidents.filter((i) => i.kind === "overtime_production").length,
    preShiftCount: incidents.filter((i) => i.kind === "pre_shift_production").length,
    earlyLeaveCount: incidents.filter((i) => i.kind === "early_leave_under_goal").length,
    forgotCheckoutCount: incidents.filter((i) => i.kind === "forgot_checkout_under_goal").length,
    postCleaningCount: incidents.filter((i) => i.kind === "post_cleaning_production").length,
    cleaningProductionCount: incidents.filter((i) => i.kind === "production_during_cleaning")
      .length,
    total: incidents.length,
  }
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
  /** Turno asignado de la operadora (si existe, prioriza sobre el reloj). */
  shift?: ApiGoalShift
}

/**
 * Clasifica producción fuera de horario respecto al turno asignado (±tolerancia).
 * Antes del inicio efectivo → before_shift; después del fin efectivo → overtime.
 */
function classifyAgainstAssignedShift(
  iso: string,
  assigned: ApiGoalShift | null | undefined,
): { shift: ApiGoalShift | null; zone: ShiftProductionZone } {
  if (!assigned) return classifyProductionTimestamp(iso)

  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { shift: assigned, zone: "in_shift" }
  const m = minutesSinceMidnight(d)
  const start = shiftStartWithToleranceMinutes(assigned)
  const end = shiftEndWithToleranceMinutes(assigned)

  if (assigned === "matutino") {
    if (m >= start && m < end) return { shift: "matutino", zone: "in_shift" }
    if (m < start) return { shift: "matutino", zone: "before_shift" }
    return { shift: "matutino", zone: "overtime" }
  }

  // Vespertino: ventana efectiva (con tolerancia) no cruza medianoche.
  if (m >= start && m < end) return { shift: "vespertino", zone: "in_shift" }
  if (m >= end) return { shift: "vespertino", zone: "overtime" }
  // Antes del inicio (p. ej. madrugada / mañana) = antes del turno, no restos del día anterior.
  return { shift: "vespertino", zone: "before_shift" }
}

function zoneToIncidentKind(zone: ShiftProductionZone): ShiftIncidentKind | null {
  if (zone === "overtime") return "overtime_production"
  if (zone === "before_shift") return "pre_shift_production"
  if (zone === "post_cleaning") return "post_cleaning_production"
  if (zone === "cleaning") return "production_during_cleaning"
  return null
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
  pre_shift_production: {
    title: "Producción antes del turno",
    severity: "warning",
  },
  early_leave_under_goal: {
    title: "Salida anticipada sin meta",
    severity: "incident",
  },
  forgot_checkout_under_goal: {
    title: "Sin checkout / meta no cumplida",
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

type AggBucket = {
  kind: ShiftIncidentKind
  shift: ApiGoalShift
  day: string
  employeeName: string
  employeeCode: string | null
  machineLabel: string
  machineKey: string
  units: number
  firstAt: string
  lastAt: string
  eventCount: number
}

/**
 * Construye incidencias de turno.
 *
 * Perf (antes congelaba el navegador):
 * 1) PROD fuera de turno se agrega por máquina/día/turno/operador/tipo (no 1 fila por evento).
 * 2) Early-leave indexa producción por día → O(checkins × filas_del_día) en vez de
 *    O(checkins × todo_el_mes).
 */
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
  const machineById = new Map<string, ApiMachine>()
  for (const m of input.machines) {
    if (!m.id) continue
    machineById.set(m.id, m)
    machineLabelById.set(m.id, (m.code ?? m.name ?? "—").trim() || "—")
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

  const quotaByDay = new Map<string, EarlyCheckoutProductionRow[]>()
  const outOfShiftAgg = new Map<string, AggBucket>()

  const needOutOfShift = INCIDENCIAS_OUT_OF_SHIFT_ENABLED
  const needEarlyLeave = INCIDENCIAS_EARLY_LEAVE_ENABLED

  for (const r of input.productionRows) {
    if (r.event !== "Producción") continue
    const d = new Date(r.timestamp)
    if (Number.isNaN(d.getTime()) || d < start || d > end) continue

    const day = dayKeyFromDate(d)

    if (needEarlyLeave) {
      const quotaRow: EarlyCheckoutProductionRow = {
        timestamp: r.timestamp,
        event: r.event,
        count: r.count,
        operator: r.operator,
        machineIdRaw: r.machineIdRaw,
        sku: r.sku ?? "—",
        unitsPerBox: r.unitsPerBox ?? 48,
      }
      const dayList = quotaByDay.get(day)
      if (dayList) dayList.push(quotaRow)
      else quotaByDay.set(day, [quotaRow])
    }

    if (!needOutOfShift) continue

    const units = Number(r.count) || 0
    // Sin unidades reales no aporta: p. ej. BOOT/reconexión clasificados como Producción.
    if (units <= 0) continue

    const { shift, zone } = classifyAgainstAssignedShift(r.timestamp, r.shift)
    if (!shift || zone === "in_shift") continue

    const kind = zoneToIncidentKind(zone)
    if (!kind) continue

    const opName = r.operator?.trim() && r.operator !== "—" ? r.operator : "Sin operador"
    const opCode = nameToCode.get(opName) ?? nameToCode.get(opName.toLowerCase()) ?? null
    const machineKey = String(r.machineIdRaw ?? r.machine_id ?? "—")
    const aggKey = `${kind}|${day}|${shift}|${machineKey}|${opCode ?? opName}`
    const prev = outOfShiftAgg.get(aggKey)
    if (prev) {
      prev.units += units
      prev.eventCount += 1
      if (r.timestamp < prev.firstAt) prev.firstAt = r.timestamp
      if (r.timestamp > prev.lastAt) prev.lastAt = r.timestamp
    } else {
      outOfShiftAgg.set(aggKey, {
        kind,
        shift,
        day,
        employeeName: opName,
        employeeCode: opCode,
        machineLabel: r.machine_id || "—",
        machineKey,
        units,
        firstAt: r.timestamp,
        lastAt: r.timestamp,
        eventCount: 1,
      })
    }
  }

  if (needOutOfShift) {
    for (const [aggKey, bucket] of outOfShiftAgg) {
      if (bucket.units <= 0) continue
      const startLabel = timeLabel(
        SHIFT_SCHEDULE[bucket.shift].productionStart.hour,
        SHIFT_SCHEDULE[bucket.shift].productionStart.minute,
      )
      const endLabel = timeLabel(
        SHIFT_SCHEDULE[bucket.shift].productionEnd.hour,
        SHIFT_SCHEDULE[bucket.shift].productionEnd.minute,
      )
      const tol = SHIFT_EDGE_TOLERANCE_MINUTES

      const detailBase =
        bucket.kind === "overtime_production"
          ? `Producción registrada después del fin de turno (${endLabel}, tolerancia +${tol} min).`
          : bucket.kind === "pre_shift_production"
            ? `Producción registrada antes del inicio de turno (${startLabel}, tolerancia −${tol} min).`
            : bucket.kind === "post_cleaning_production"
              ? `Producción después de la ventana de limpieza (${timeLabel(23, 30)}).`
              : `Producción durante limpieza de máquinas (${timeLabel(23, 0)}–${timeLabel(23, 30)}).`

      const detail =
        bucket.eventCount > 1
          ? `${detailBase} ${bucket.eventCount} eventos agregados (${Math.round(bucket.units).toLocaleString()} uds).`
          : detailBase

      const meta = KIND_META[bucket.kind]
      incidents.push({
        id: `prod-${aggKey}`,
        kind: bucket.kind,
        severity: meta.severity,
        occurredAt: bucket.lastAt,
        day: bucket.day,
        shift: bucket.shift,
        employeeName: bucket.employeeName,
        employeeCode: bucket.employeeCode,
        machineLabel: bucket.machineLabel,
        units: bucket.units,
        title: meta.title,
        detail,
        goalTarget: null,
        goalActual: null,
      })
    }
  }

  if (needEarlyLeave) {
    for (const ch of input.checkins) {
      if (!ch.checkedOutAt) continue
      const checkout = new Date(ch.checkedOutAt)
      if (Number.isNaN(checkout.getTime()) || checkout < start || checkout > end) continue

      const shift = productionShiftFromMeasuredAt(ch.checkedInAt)
      if (!shift) continue

      const day = dayKeyFromDate(checkout)
      const dayRows = quotaByDay.get(day) ?? []

      for (const operatorCode of operatorCodesFromCheckin(ch)) {
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
          productionRows: dayRows,
          employees: input.employees,
          machineHint: machineById.get(ch.machineId) ?? null,
        })
        if (!flag) continue

        seenEarlyLeave.add(dedupeKey)
        const machineLabel = machineLabelById.get(ch.machineId) ?? ch.machineCode ?? "—"
        const employeeName = codeToName.get(operatorCode.toLowerCase()) ?? operatorCode
        const endLabel = timeLabel(
          SHIFT_SCHEDULE[shift].productionEnd.hour,
          SHIFT_SCHEDULE[shift].productionEnd.minute,
        )

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
          units: quota.actual,
          title: KIND_META.early_leave_under_goal.title,
          detail: `Check-out a las ${checkout.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })} (antes de ${endLabel}). Producción del turno: ${Math.round(quota.actual).toLocaleString()} / meta ${Math.round(quota.target).toLocaleString()}.`,
          goalTarget: quota.target,
          goalActual: quota.actual,
        })
      }
    }
  }

  incidents.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))

  const summary = summarizeShiftIncidents(incidents)

  const scheduleNotes = [
    `${SHIFT_SCHEDULE.matutino.label}: producción ${SHIFT_SCHEDULE.matutino.windowLabel} (±${SHIFT_EDGE_TOLERANCE_MINUTES} min).`,
    `${SHIFT_SCHEDULE.vespertino.label}: producción ${SHIFT_SCHEDULE.vespertino.windowLabel} (±${SHIFT_EDGE_TOLERANCE_MINUTES} min).`,
    "Antes del inicio = incidencia de antes de turno; después del fin = incidencia de después de turno.",
    EARLY_CHECKOUT_QUOTA_EXEMPTION_NOTE,
  ]

  return { incidents, summary, scheduleNotes }
}

/** Mapea evaluaciones precomputadas del backend a filas de Incidencias (sin scan de eventos). */
export function mapCheckoutEvaluationsToShiftIncidents(
  rows: ApiOperatorCheckoutEvaluation[],
): ShiftIncidentsAnalytics {
  const incidents: ShiftIncidentRow[] = []
  for (const r of rows) {
    const kind =
      r.incidentKind ??
      (r.isEarlyLeaveIncident
        ? "early_leave_under_goal"
        : r.isForgotCheckoutIncident
          ? "forgot_checkout_under_goal"
          : null)
    if (!kind) continue
    const meta = KIND_META[kind]
    const target = Math.round(Number(r.dailyGoalTarget) || 0)
    const actual = Math.round(Number(r.dailyGoalActual) || 0)
    incidents.push({
      id: r.id,
      kind,
      severity: meta.severity,
      occurredAt: r.checkedOutAt,
      day: r.day,
      shift: r.shift,
      employeeName: r.employeeName?.trim() || r.operatorCode,
      employeeCode: r.operatorCode,
      machineLabel: r.machineLabel || r.machineCode || "—",
      units: actual,
      title: meta.title,
      detail:
        kind === "forgot_checkout_under_goal"
          ? `Cierre automático sin checkout. Producción: ${actual.toLocaleString()} / meta ${target.toLocaleString()}.`
          : `Check-out anticipado. Producción del turno: ${actual.toLocaleString()} / meta ${target.toLocaleString()}.`,
      goalTarget: target,
      goalActual: actual,
    })
  }
  incidents.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  return {
    incidents,
    summary: summarizeShiftIncidents(incidents),
    scheduleNotes: [
      `${SHIFT_SCHEDULE.matutino.label}: producción ${SHIFT_SCHEDULE.matutino.windowLabel}.`,
      `${SHIFT_SCHEDULE.vespertino.label}: producción ${SHIFT_SCHEDULE.vespertino.windowLabel}.`,
      EARLY_CHECKOUT_QUOTA_EXEMPTION_NOTE,
    ],
  }
}
