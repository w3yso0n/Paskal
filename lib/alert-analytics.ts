import type { ApiAlert, ApiAlertKind } from "@/lib/api"
import { ALERT_KIND_LABELS, resolveAlertKind } from "@/lib/alert-ui"
import {
  ALERT_KIND_PREFERRED_ORDER,
  dayKeyFromDate,
  filterAlertsInDateRange,
} from "@/lib/alert-role-metrics"
import { getPartsInTimeZone } from "@/lib/shift-timezone"
import { PLANT_TIMEZONE } from "@/lib/tablero-operator-goal"

function kindsPresent(counted: Map<ApiAlertKind, number>): ApiAlertKind[] {
  return (Object.keys(ALERT_KIND_LABELS) as ApiAlertKind[])
    .filter((k) => (counted.get(k) ?? 0) > 0)
    .sort((a, b) => ALERT_KIND_PREFERRED_ORDER.indexOf(a) - ALERT_KIND_PREFERRED_ORDER.indexOf(b))
}

// --- P-F1: resumen del rango (KPIs) ---------------------------------------

export type AlertRangeSummary = {
  total: number
  closedCount: number
  medianResolutionMinutes: number | null
  activeBacklogCount: number
  oldestBacklogAgeMinutes: number | null
}

/**
 * KPIs del rango: total, mediana de tiempo a resolución (solo cerradas con `closedAt`) y
 * backlog activo AHORA MISMO (no acotado al rango — es "qué sigue pendiente hoy", incluida su
 * más vieja). No hay forma de distinguir cierre automático de manual con los datos actuales
 * (no hay `closedBy`/`closeReason`), así que ese desglose queda fuera hasta que exista.
 */
export function buildAlertRangeSummary(
  alerts: ApiAlert[],
  startDate: string,
  endDate: string,
  now: Date = new Date(),
): AlertRangeSummary {
  const scoped = filterAlertsInDateRange(alerts, startDate, endDate)

  const resolutionMinutes: number[] = []
  for (const a of scoped) {
    if (a.status !== "closed" || !a.closedAt) continue
    const created = new Date(a.createdAt).getTime()
    const closed = new Date(a.closedAt).getTime()
    if (!Number.isFinite(created) || !Number.isFinite(closed)) continue
    const minutes = (closed - created) / 60_000
    if (minutes >= 0) resolutionMinutes.push(minutes)
  }
  resolutionMinutes.sort((a, b) => a - b)
  const medianResolutionMinutes =
    resolutionMinutes.length > 0
      ? resolutionMinutes[Math.floor(resolutionMinutes.length / 2)]
      : null

  let oldestActiveMs: number | null = null
  let activeBacklogCount = 0
  for (const a of alerts) {
    if (a.status !== "open" && a.status !== "acknowledged") continue
    activeBacklogCount++
    const created = new Date(a.createdAt).getTime()
    if (!Number.isFinite(created)) continue
    if (oldestActiveMs === null || created < oldestActiveMs) oldestActiveMs = created
  }
  const oldestBacklogAgeMinutes =
    oldestActiveMs !== null ? (now.getTime() - oldestActiveMs) / 60_000 : null

  return {
    total: scoped.length,
    closedCount: resolutionMinutes.length,
    medianResolutionMinutes,
    activeBacklogCount,
    oldestBacklogAgeMinutes,
  }
}

export function formatMinutesShort(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`
  const hours = minutes / 60
  if (hours < 24) return `${hours.toFixed(hours < 10 ? 1 : 0)} h`
  return `${(hours / 24).toFixed(1)} d`
}

// --- P-F2: Pareto de máquinas ----------------------------------------------

export type MachineParetoRow = {
  machineCode: string
  total: number
} & Partial<Record<ApiAlertKind, number>>

export type MachineParetoResult = {
  rows: MachineParetoRow[]
  kindsInRange: ApiAlertKind[]
}

/** Top-N máquinas por cantidad de alertas en el rango, apiladas por causa (mismo color que
 * el resto del panel). `plant_outage` no tiene máquina y queda fuera — es de toda la planta. */
export function buildMachineAlertPareto(
  alerts: ApiAlert[],
  startDate: string,
  endDate: string,
  machineCodeById: Map<string, string>,
  topN = 8,
): MachineParetoResult {
  const scoped = filterAlertsInDateRange(alerts, startDate, endDate)
  const byMachine = new Map<string, Partial<Record<ApiAlertKind, number>>>()
  const totalsByMachine = new Map<string, number>()
  const kindTotals = new Map<ApiAlertKind, number>()

  for (const a of scoped) {
    if (!a.machineId) continue
    const kind = resolveAlertKind(a)
    const code = machineCodeById.get(a.machineId) ?? a.machineId
    const row = byMachine.get(code) ?? {}
    row[kind] = (row[kind] ?? 0) + 1
    byMachine.set(code, row)
    totalsByMachine.set(code, (totalsByMachine.get(code) ?? 0) + 1)
    kindTotals.set(kind, (kindTotals.get(kind) ?? 0) + 1)
  }

  const kindsInRange = kindsPresent(kindTotals)
  const rows: MachineParetoRow[] = [...totalsByMachine.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([machineCode, total]) => {
      const counts = byMachine.get(machineCode) ?? {}
      const row: MachineParetoRow = { machineCode, total }
      for (const kind of kindsInRange) row[kind] = counts[kind] ?? 0
      return row
    })

  return { rows, kindsInRange }
}

// --- P-F3: heatmap hora × causa --------------------------------------------

export type HourKindHeatmap = {
  /** `counts[hour][kind]`, hour 0-23 en TZ de planta. */
  counts: Record<number, Partial<Record<ApiAlertKind, number>>>
  kindsInRange: ApiAlertKind[]
  maxCount: number
}

export function buildHourKindHeatmap(
  alerts: ApiAlert[],
  startDate: string,
  endDate: string,
): HourKindHeatmap {
  const scoped = filterAlertsInDateRange(alerts, startDate, endDate)
  const counts: Record<number, Partial<Record<ApiAlertKind, number>>> = {}
  const kindTotals = new Map<ApiAlertKind, number>()
  let maxCount = 0

  for (const a of scoped) {
    const created = new Date(a.createdAt)
    if (Number.isNaN(created.getTime())) continue
    const { hour } = getPartsInTimeZone(created, PLANT_TIMEZONE)
    const kind = resolveAlertKind(a)
    const row = counts[hour] ?? {}
    const n = (row[kind] ?? 0) + 1
    row[kind] = n
    counts[hour] = row
    kindTotals.set(kind, (kindTotals.get(kind) ?? 0) + 1)
    if (n > maxCount) maxCount = n
  }

  return { counts, kindsInRange: kindsPresent(kindTotals), maxCount }
}

// --- P-F4: minutos de paro por día -----------------------------------------

export type IdleMinutesDailyRow = { date: string; minutes: number }

/** Minutos totales de `idle` CERRADA por día — mide impacto real (tiempo perdido), no solo
 * cuántas alertas hubo. Solo cerradas: una `idle` todavía abierta no tiene duración final. */
export function buildIdleMinutesByDay(
  alerts: ApiAlert[],
  startDate: string,
  endDate: string,
): IdleMinutesDailyRow[] {
  const scoped = filterAlertsInDateRange(alerts, startDate, endDate)
  const byDay = new Map<string, number>()

  for (const a of scoped) {
    if (resolveAlertKind(a) !== "idle") continue
    if (a.status !== "closed" || !a.closedAt) continue
    const created = new Date(a.createdAt)
    const closed = new Date(a.closedAt)
    if (Number.isNaN(created.getTime()) || Number.isNaN(closed.getTime())) continue
    const minutes = (closed.getTime() - created.getTime()) / 60_000
    if (!(minutes > 0)) continue
    const day = dayKeyFromDate(created)
    byDay.set(day, (byDay.get(day) ?? 0) + minutes)
  }

  return [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, minutes]) => ({ date: date.slice(5), minutes: Math.round(minutes) }))
}
