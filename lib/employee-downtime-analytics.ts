import type {
  ApiAlert,
  ApiDowntimeNote,
  ApiEmployee,
  ApiMachine,
  ApiMachineCheckin,
  ApiProductionEvent,
} from "@/lib/api"
import type { AlertThresholdsConfig } from "@/lib/business-rules"
import {
  formatDurationMinutes,
  resolveIdleAlertEpisode,
} from "@/lib/machine-activity-analytics"

export const LONG_DOWNTIME_MINUTES = 30

export type DowntimeAlertStage = 1 | 2

export type EmployeeDowntimeIncident = {
  sourceKey: string
  employeeId: string | null
  employeeCode: string | null
  employeeName: string
  machineId: string | null
  machineLabel: string
  occurredAt: string
  stage: DowntimeAlertStage
  durationMinutes: number
  stageLabel: string
  reason: string
  notes: string
  /** Misma ventana continua = mismo último product/check-in. */
  windowKey: string
}

export type EmployeeDowntimeSummary = {
  employeeId: string | null
  employeeCode: string | null
  employeeName: string
  totalIncidents: number
  stage1Count: number
  stage2Count: number
  totalDowntimeMinutes: number
  exceedsThirtyMinutes: boolean
  incidents: EmployeeDowntimeIncident[]
}

export type EmployeeDowntimeAnalytics = {
  thresholds: { stage1: number; stage2: number }
  totals: { incidents: number; stage1: number; stage2: number; employeesOver30: number }
  summaries: EmployeeDowntimeSummary[]
  unassigned: EmployeeDowntimeIncident[]
}

function payloadEventType(payload: Record<string, unknown>, eventType: string): string {
  const raw =
    (payload["EVENT"] as string | undefined) ??
    (payload["event"] as string | undefined) ??
    eventType
  return String(raw ?? "").trim().toUpperCase()
}

export function downtimeSourceKey(
  machineId: string | null,
  occurredAt: string,
  stage: DowntimeAlertStage,
): string {
  return `${machineId ?? "—"}|${occurredAt}|${stage}`
}

function findCheckinForTime(
  machineId: string | null,
  occurredAtMs: number,
  checkins: ApiMachineCheckin[],
): ApiMachineCheckin | null {
  const id = machineId?.trim()
  if (!id) return null
  const inWindow = (ch: ApiMachineCheckin) => {
    const start = new Date(ch.checkedInAt).getTime()
    const end = ch.checkedOutAt ? new Date(ch.checkedOutAt).getTime() : Number.POSITIVE_INFINITY
    return occurredAtMs >= start && occurredAtMs <= end
  }
  const byMachine = checkins
    .filter((ch) => ch.machineId === id)
    .sort((a, b) => new Date(b.checkedInAt).getTime() - new Date(a.checkedInAt).getTime())
  return byMachine.find(inWindow) ?? byMachine.find((c) => c.isActive) ?? null
}

function resolveOperatorFromCheckin(
  checkin: ApiMachineCheckin | null,
  codeToEmployee: Map<string, ApiEmployee>,
): { employeeId: string | null; employeeCode: string | null; employeeName: string } {
  const code = checkin?.operatorCode?.trim() || checkin?.operator2Code?.trim() || null
  if (!code) {
    return { employeeId: null, employeeCode: null, employeeName: "Sin operador asignado" }
  }
  const emp =
    codeToEmployee.get(code) ?? codeToEmployee.get(code.toLowerCase()) ?? null
  return {
    employeeId: emp?.id ?? null,
    employeeCode: code,
    // Código sin empleado asociado (tarjeta no registrada / dato viejo): no exponer el UID crudo.
    employeeName: emp?.fullName ?? "Sin nombre",
  }
}

function isParoAlertTitle(title: string): boolean {
  const t = title.trim().toLowerCase()
  return t.includes("paro") && t.includes("inactividad")
}

export function isDowntimeParoAlert(title: string): boolean {
  return isParoAlertTitle(title)
}

export function buildDowntimeNoteContextFromAlert(alert: {
  title: string
  machineId: string | null
  createdAt: string
  severity: string
}): {
  sourceKey: string
  machineId: string | null
  occurredAt: string
  alertStage: DowntimeAlertStage
} | null {
  if (!isParoAlertTitle(alert.title)) return null
  const stage: DowntimeAlertStage =
    alert.severity === "high" || alert.severity === "critical" ? 2 : 1
  return {
    sourceKey: downtimeSourceKey(alert.machineId, alert.createdAt, stage),
    machineId: alert.machineId,
    occurredAt: alert.createdAt,
    alertStage: stage,
  }
}

/**
 * Una fila por ventana continua (máquina + ancla lastProduction/check-in).
 * Si hay stage 1 y stage 2 del mismo paro, se queda el stage mayor y la duración real
 * (no suma 15+45).
 */
function dedupeIncidents(incidents: EmployeeDowntimeIncident[]): EmployeeDowntimeIncident[] {
  const byWindow = new Map<string, EmployeeDowntimeIncident>()
  for (const inc of incidents) {
    const key = inc.windowKey || `${inc.machineId ?? "—"}|${inc.occurredAt}`
    const existing = byWindow.get(key)
    if (!existing) {
      byWindow.set(key, inc)
      continue
    }
    const preferNew =
      inc.stage > existing.stage ||
      (inc.stage === existing.stage && inc.durationMinutes > existing.durationMinutes)
    if (preferNew) {
      byWindow.set(key, {
        ...inc,
        // Conservar notas del sourceKey que el supervisor pudo haber guardado.
        notes: inc.notes || existing.notes,
      })
    } else if (!existing.notes && inc.notes) {
      byWindow.set(key, { ...existing, notes: inc.notes })
    }
  }
  return [...byWindow.values()].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
}

export function buildEmployeeDowntimeAnalytics(input: {
  events: ApiProductionEvent[]
  alerts: ApiAlert[]
  checkins: ApiMachineCheckin[]
  employees: ApiEmployee[]
  machines: ApiMachine[]
  thresholds: Pick<AlertThresholdsConfig, "idleMinutesStage1" | "idleMinutesStage2">
  notes: ApiDowntimeNote[]
  from: string
  to: string
  nowMs?: number
}): EmployeeDowntimeAnalytics {
  const stage1 = Math.max(1, Number(input.thresholds.idleMinutesStage1) || 15)
  const stage2 = Math.max(stage1, Number(input.thresholds.idleMinutesStage2) || 45)
  const nowMs = input.nowMs ?? Date.now()

  const machineLabelById = new Map<string, string>()
  for (const m of input.machines) {
    const label = (m.code ?? m.name ?? "").trim() || m.name || "—"
    if (m.id) machineLabelById.set(m.id, label)
  }

  const codeToEmployee = new Map<string, ApiEmployee>()
  for (const emp of input.employees) {
    const code = emp.employeeCode?.trim()
    if (!code) continue
    codeToEmployee.set(code, emp)
    codeToEmployee.set(code.toLowerCase(), emp)
  }

  const notesByKey = new Map<string, string>()
  for (const n of input.notes) {
    if (n.notes?.trim()) notesByKey.set(n.sourceKey, n.notes.trim())
  }

  const start = new Date(`${input.from}T00:00:00`)
  const end = new Date(`${input.to}T23:59:59.999`)

  const rawIncidents: EmployeeDowntimeIncident[] = []

  const pushIncident = (opts: {
    machineId: string | null
    occurredAt: string
    stage: DowntimeAlertStage
    reason: string
    durationMinutes: number
    windowKey: string
    sourceKey?: string
  }) => {
    const at = new Date(opts.occurredAt)
    if (Number.isNaN(at.getTime()) || at < start || at > end) return

    const checkin = findCheckinForTime(opts.machineId, at.getTime(), input.checkins)
    const operator = resolveOperatorFromCheckin(checkin, codeToEmployee)
    const durationMinutes = Math.max(1, Math.round(opts.durationMinutes))
    const sourceKey =
      opts.sourceKey ?? downtimeSourceKey(opts.machineId, opts.occurredAt, opts.stage)

    rawIncidents.push({
      sourceKey,
      employeeId: operator.employeeId,
      employeeCode: operator.employeeCode,
      employeeName: operator.employeeName,
      machineId: opts.machineId,
      machineLabel: opts.machineId
        ? (machineLabelById.get(opts.machineId) ?? opts.machineId)
        : "—",
      occurredAt: opts.occurredAt,
      stage: opts.stage,
      durationMinutes,
      stageLabel: `Tipo ${opts.stage} (umbral ${opts.stage === 2 ? stage2 : stage1} min)`,
      reason: opts.reason,
      notes: notesByKey.get(sourceKey) ?? "",
      windowKey: opts.windowKey,
    })
  }

  // Preferir alertas idle del motor (duración real). Una alerta escala 15→45 en la misma fila.
  for (const a of input.alerts) {
    const isIdleType = a.type === "idle"
    if (!isIdleType && !isParoAlertTitle(a.title)) continue
    const stage: DowntimeAlertStage =
      a.severity === "high" || a.severity === "critical" ? 2 : 1
    const stageThreshold = stage === 2 ? stage2 : stage1
    const ep = resolveIdleAlertEpisode(a, nowMs, { minMinutes: stageThreshold })
    if (!ep) continue
    pushIncident({
      machineId: a.machineId,
      occurredAt: a.createdAt,
      stage,
      reason: a.message?.trim() || a.title,
      durationMinutes: ep.minutes,
      windowKey: ep.windowKey,
      sourceKey: downtimeSourceKey(a.machineId, a.createdAt, stage),
    })
  }

  // Legacy: eventos ALERT_* en production_events (solo si no hay alerta idle de la misma ventana).
  const alertWindows = new Set(rawIncidents.map((i) => i.windowKey))
  for (const e of input.events) {
    const payload = (e.payload ?? {}) as Record<string, unknown>
    const eventUp = payloadEventType(payload, e.eventType)
    let stage: DowntimeAlertStage | null = null
    let reason = ""
    let durationMinutes = stage1
    if (eventUp === "ALERT_15") {
      stage = 1
      durationMinutes = stage1
      reason = `Sin producción por más de ${stage1} min (ALERT_15)`
    } else if (eventUp === "ALERT_45") {
      stage = 2
      durationMinutes = stage2
      reason = `Sin producción por más de ${stage2} min (ALERT_45)`
    } else if (eventUp === "STOP") {
      stage = 1
      durationMinutes = stage1
      reason = `Parada registrada (STOP)`
    }
    if (!stage) continue

    const endMs = new Date(e.occurredAt).getTime()
    if (Number.isNaN(endMs)) continue
    const startMs = endMs - durationMinutes * 60_000
    const windowKey = `${e.machineId ?? "—"}|${startMs}`
    // Misma ventana que una alerta idle ya contada (±90 min de ancla).
    let already = alertWindows.has(windowKey)
    if (!already) {
      for (const key of alertWindows) {
        if (!key.startsWith(`${e.machineId ?? "—"}|`)) continue
        const anchor = Number(key.slice(key.lastIndexOf("|") + 1))
        if (Number.isFinite(anchor) && Math.abs(anchor - startMs) <= 90 * 60_000) {
          already = true
          break
        }
      }
    }
    if (already) continue

    pushIncident({
      machineId: e.machineId,
      occurredAt: e.occurredAt,
      stage,
      reason,
      durationMinutes,
      windowKey,
    })
  }

  const incidents = dedupeIncidents(rawIncidents)

  const byEmployee = new Map<string, EmployeeDowntimeSummary>()
  const unassigned: EmployeeDowntimeIncident[] = []

  for (const inc of incidents) {
    if (!inc.employeeId) {
      unassigned.push(inc)
      continue
    }
    const key = inc.employeeId
    let row = byEmployee.get(key)
    if (!row) {
      row = {
        employeeId: inc.employeeId,
        employeeCode: inc.employeeCode,
        employeeName: inc.employeeName,
        totalIncidents: 0,
        stage1Count: 0,
        stage2Count: 0,
        totalDowntimeMinutes: 0,
        exceedsThirtyMinutes: false,
        incidents: [],
      }
      byEmployee.set(key, row)
    }
    row.totalIncidents++
    if (inc.stage === 1) row.stage1Count++
    else row.stage2Count++
    row.totalDowntimeMinutes += inc.durationMinutes
    row.incidents.push(inc)
  }

  const summaries = [...byEmployee.values()]
    .map((row) => ({
      ...row,
      exceedsThirtyMinutes:
        row.totalDowntimeMinutes > LONG_DOWNTIME_MINUTES ||
        row.incidents.some((i) => i.durationMinutes > LONG_DOWNTIME_MINUTES),
      incidents: row.incidents.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
    }))
    .sort((a, b) => b.totalDowntimeMinutes - a.totalDowntimeMinutes)

  const totals = {
    incidents: incidents.length,
    stage1: incidents.filter((i) => i.stage === 1).length,
    stage2: incidents.filter((i) => i.stage === 2).length,
    employeesOver30: summaries.filter((s) => s.exceedsThirtyMinutes).length,
  }

  return {
    thresholds: { stage1, stage2 },
    totals,
    summaries,
    unassigned: unassigned.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
  }
}

export { formatDurationMinutes }
