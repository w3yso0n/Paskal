import type { ApiMaintenanceSession } from "@/lib/api"

export type MaintenanceVisitType = "preventive" | "corrective"

export const MAINTENANCE_VISIT_TYPE_LABELS: Record<MaintenanceVisitType, string> = {
  preventive: "Preventivo",
  corrective: "Correctivo",
}

type ProductionRowForMaintenance = {
  machineIdRaw: string | null
  timestamp: string
  event: string
  count: number
}

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

function dayKeyFromDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function localDayStart(iso: string): Date {
  const d = new Date(iso)
  const start = new Date(d)
  start.setHours(0, 0, 0, 0)
  return start
}

export function formatMaintenanceDuration(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r > 0 ? `${h}h ${r}min` : `${h}h`
}

function sessionDurationMinutes(
  session: Pick<ApiMaintenanceSession, "startedAt" | "endedAt">,
  refNowMs: number,
): number | null {
  const start = new Date(session.startedAt).getTime()
  if (Number.isNaN(start)) return null
  const end = session.endedAt ? new Date(session.endedAt).getTime() : refNowMs
  if (Number.isNaN(end)) return null
  return Math.max(0, Math.round((end - start) / 60_000))
}

/**
 * Preventivo: la máquina aún no había registrado producción ese día al entrar a mantenimiento.
 * Correctivo: ya había producción ese día antes del check-in.
 */
export function classifyMaintenanceVisitType(
  session: Pick<ApiMaintenanceSession, "machineId" | "startedAt">,
  productionRows: ProductionRowForMaintenance[],
): MaintenanceVisitType {
  const started = new Date(session.startedAt)
  if (Number.isNaN(started.getTime())) return "preventive"

  const dayStart = localDayStart(session.startedAt)

  for (const row of productionRows) {
    if (row.machineIdRaw !== session.machineId) continue
    if (row.event !== "Producción") continue
    const count = Number(row.count)
    if (!Number.isFinite(count) || count <= 0) continue
    const ts = new Date(row.timestamp)
    if (Number.isNaN(ts.getTime())) continue
    if (ts < dayStart || ts >= started) continue
    return "corrective"
  }

  return "preventive"
}

export type MaintenanceVisitRow = {
  sessionId: string
  machineId: string
  machineCode: string
  employeeCode: string | null
  startedAt: string
  endedAt: string | null
  excludedUnits: number
  durationMinutes: number | null
  visitType: MaintenanceVisitType
  isActive: boolean
}

export type MaintenanceMachineRow = {
  machineCode: string
  machineId: string
  visits: number
  preventive: number
  corrective: number
  excludedUnits: number
  durationMinutes: number
}

export type MaintenanceTechnicianRow = {
  employeeCode: string
  visits: number
  preventive: number
  corrective: number
  durationMinutes: number
}

export type MaintenanceDailyRow = {
  date: string
  preventive: number
  corrective: number
  total: number
}

export type MaintenanceAnalytics = {
  total: number
  preventive: number
  corrective: number
  activeNow: number
  totalExcludedUnits: number
  totalDurationMinutes: number
  avgDurationMinutes: number | null
  uniqueMachines: number
  uniqueTechnicians: number
  preventivePct: number
  correctivePct: number
  visits: MaintenanceVisitRow[]
  byMachine: MaintenanceMachineRow[]
  byTechnician: MaintenanceTechnicianRow[]
  dailySeries: MaintenanceDailyRow[]
  typeDistribution: Array<{ type: MaintenanceVisitType; label: string; count: number }>
}

export function buildMaintenanceAnalytics(
  sessions: ApiMaintenanceSession[],
  productionRows: ProductionRowForMaintenance[],
  options?: { refNow?: Date },
): MaintenanceAnalytics {
  const refNowMs = (options?.refNow ?? new Date()).getTime()

  const visits: MaintenanceVisitRow[] = sessions.map((s) => {
    const visitType = classifyMaintenanceVisitType(s, productionRows)
    return {
      sessionId: s.id,
      machineId: s.machineId,
      machineCode: s.machineCode,
      employeeCode: s.employeeCode,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      excludedUnits: Number(s.excludedUnits ?? 0) || 0,
      durationMinutes: sessionDurationMinutes(s, refNowMs),
      visitType,
      isActive: s.endedAt == null,
    }
  })

  let preventive = 0
  let corrective = 0
  let activeNow = 0
  let totalExcludedUnits = 0
  let totalDurationMinutes = 0
  const durationSamples: number[] = []
  const machineIds = new Set<string>()
  const technicianCodes = new Set<string>()

  const machineAgg = new Map<string, MaintenanceMachineRow>()
  const techAgg = new Map<string, MaintenanceTechnicianRow>()
  const dailyAgg = new Map<string, { preventive: number; corrective: number }>()

  for (const v of visits) {
    if (v.visitType === "preventive") preventive++
    else corrective++
    if (v.isActive) activeNow++
    totalExcludedUnits += v.excludedUnits
    if (v.durationMinutes != null) {
      totalDurationMinutes += v.durationMinutes
      if (!v.isActive) durationSamples.push(v.durationMinutes)
    }

    machineIds.add(v.machineId)
    if (v.employeeCode?.trim()) technicianCodes.add(v.employeeCode.trim())

    const mRow = machineAgg.get(v.machineId) ?? {
      machineCode: v.machineCode,
      machineId: v.machineId,
      visits: 0,
      preventive: 0,
      corrective: 0,
      excludedUnits: 0,
      durationMinutes: 0,
    }
    mRow.visits++
    if (v.visitType === "preventive") mRow.preventive++
    else mRow.corrective++
    mRow.excludedUnits += v.excludedUnits
    mRow.durationMinutes += v.durationMinutes ?? 0
    machineAgg.set(v.machineId, mRow)

    const techCode = v.employeeCode?.trim() || "—"
    const tRow = techAgg.get(techCode) ?? {
      employeeCode: techCode,
      visits: 0,
      preventive: 0,
      corrective: 0,
      durationMinutes: 0,
    }
    tRow.visits++
    if (v.visitType === "preventive") tRow.preventive++
    else tRow.corrective++
    tRow.durationMinutes += v.durationMinutes ?? 0
    techAgg.set(techCode, tRow)

    const day = dayKeyFromDate(new Date(v.startedAt))
    const dRow = dailyAgg.get(day) ?? { preventive: 0, corrective: 0 }
    if (v.visitType === "preventive") dRow.preventive++
    else dRow.corrective++
    dailyAgg.set(day, dRow)
  }

  const total = visits.length
  const preventivePct = total > 0 ? Math.round((preventive / total) * 100) : 0
  const correctivePct = total > 0 ? Math.round((corrective / total) * 100) : 0
  const avgDurationMinutes =
    durationSamples.length > 0
      ? Math.round(durationSamples.reduce((a, b) => a + b, 0) / durationSamples.length)
      : null

  return {
    total,
    preventive,
    corrective,
    activeNow,
    totalExcludedUnits,
    totalDurationMinutes,
    avgDurationMinutes,
    uniqueMachines: machineIds.size,
    uniqueTechnicians: technicianCodes.size,
    preventivePct,
    correctivePct,
    visits,
    byMachine: [...machineAgg.values()].sort((a, b) => b.visits - a.visits),
    byTechnician: [...techAgg.values()].sort((a, b) => b.visits - a.visits),
    dailySeries: [...dailyAgg.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({
        date: date.slice(5),
        preventive: v.preventive,
        corrective: v.corrective,
        total: v.preventive + v.corrective,
      })),
    typeDistribution: [
      { type: "preventive" as const, label: MAINTENANCE_VISIT_TYPE_LABELS.preventive, count: preventive },
      { type: "corrective" as const, label: MAINTENANCE_VISIT_TYPE_LABELS.corrective, count: corrective },
    ],
  }
}

/** @deprecated Usar buildMaintenanceAnalytics */
export function buildMaintenanceMetrics(
  sessions: ApiMaintenanceSession[],
  productionRows: ProductionRowForMaintenance[],
): Pick<MaintenanceAnalytics, "total" | "preventive" | "corrective" | "visits"> {
  const a = buildMaintenanceAnalytics(sessions, productionRows)
  return {
    total: a.total,
    preventive: a.preventive,
    corrective: a.corrective,
    visits: a.visits,
  }
}
