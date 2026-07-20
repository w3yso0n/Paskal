export type ActivityRow = {
  machine_id: string
  machineIdRaw: string | null
  timestamp: string
  event: string
  eventRaw: string
  count: number
  /** Resumen horario in-place (`payload.rolled_up`). */
  rolledUp?: boolean
  firstOccurredAt?: string | null
  lastOccurredAt?: string | null
  sourceEventCount?: number
}

export function normalizeActivityEventType(eventRaw: string): string {
  return eventRaw.trim().toUpperCase()
}

export function isProductionActivityEvent(eventRaw: string): boolean {
  const v = normalizeActivityEventType(eventRaw)
  if (v === "ORPHAN_PROD") return false
  return v === "PROD" || v === "BOOT"
}

export function isInactivityActivityEvent(eventRaw: string): boolean {
  const v = normalizeActivityEventType(eventRaw)
  if (v === "ALERT_15" || v === "ALERT_45" || v === "ALERT_NO_CHECKIN" || v === "STOP") {
    return true
  }
  const lower = eventRaw.trim().toLowerCase()
  return lower.includes("paro") || lower.includes("down") || lower.includes("alert")
}

export function inactivityEpisodeMinutes(eventTypes: string[]): number {
  const types = eventTypes.map(normalizeActivityEventType)
  if (types.includes("ALERT_45")) return 45
  if (types.includes("ALERT_15")) return 15
  if (types.includes("ALERT_NO_CHECKIN")) return 15
  if (types.includes("STOP")) return 15
  return 15
}

/** Alerta idle del motor actual (tabla `alerts`), para medir paro real. */
export type IdleAlertForActivity = {
  id: string
  machineId: string | null
  /** Etiqueta de máquina alineada con `ActivityRow.machine_id` (código/nombre). */
  machineLabel: string
  createdAt: string
  closedAt: string | null
  metadata: Record<string, unknown> | null
  severity?: string | null
}

export type IdleAlertEpisode = {
  startMs: number
  endMs: number
  minutes: number
  /** Ancla de la ventana continua (mismo último product/check-in). */
  windowKey: string
}

/**
 * Duración del paro idle.
 * Prioridad: max(span lastProd/check-in→cierre, metadata.idleMinutes, vida_alerta+umbral, umbral).
 * Así no aparece "2 min" en un Tipo 1 (≥15 min) cuando el ancla de metadata quedó corta
 * (p. ej. reopen o check-in reciente).
 */
export function resolveIdleAlertEpisode(
  alert: Pick<IdleAlertForActivity, "createdAt" | "closedAt" | "metadata" | "machineId">,
  nowMs: number = Date.now(),
  opts: { minMinutes?: number } = {},
): IdleAlertEpisode | null {
  const md = alert.metadata ?? {}
  const lastProd =
    typeof md.lastProductionAt === "string" ? new Date(md.lastProductionAt).getTime() : 0
  const checkin =
    typeof md.checkedInAt === "string" ? new Date(md.checkedInAt).getTime() : 0
  const windowAnchor = Math.max(lastProd, checkin)
  const createdMs = new Date(alert.createdAt).getTime()
  const closedMs = alert.closedAt ? new Date(alert.closedAt).getTime() : Number.NaN
  const endMs = Number.isFinite(closedMs) ? closedMs : nowMs
  if (!Number.isFinite(endMs)) return null

  const idleMeta = Number(md.idleMinutes)
  const idleMetaMin =
    Number.isFinite(idleMeta) && idleMeta > 0 ? Math.round(idleMeta) : 0
  const minMinutes =
    opts.minMinutes != null && opts.minMinutes > 0 ? Math.round(opts.minMinutes) : 0

  let startMs = windowAnchor
  if (!startMs || !Number.isFinite(startMs)) {
    if (idleMetaMin > 0) {
      startMs = endMs - idleMetaMin * 60_000
    } else if (Number.isFinite(createdMs)) {
      startMs = createdMs - minMinutes * 60_000
    } else {
      return null
    }
  }

  const spanMin =
    endMs > startMs ? Math.round((endMs - startMs) / 60_000) : 0
  const openLifetimeMin =
    Number.isFinite(createdMs) && endMs > createdMs
      ? Math.round((endMs - createdMs) / 60_000)
      : 0
  // Al crearse la alerta ya se había alcanzado el umbral → vida abierta + umbral ≈ paro total.
  const fromOpenAndThreshold =
    openLifetimeMin > 0 && minMinutes > 0 ? openLifetimeMin + minMinutes : 0

  const minutes = Math.max(1, spanMin, idleMetaMin, fromOpenAndThreshold, minMinutes)

  // Si el span del ancla quedó corto, alinear el inicio con la duración reportada.
  if (spanMin + 1 < minutes) {
    startMs = endMs - minutes * 60_000
  }

  return {
    startMs,
    endMs,
    minutes,
    windowKey: `${alert.machineId ?? "—"}|${windowAnchor || startMs}`,
  }
}

function minutesOverlapDay(startMs: number, endMs: number, dayStartMs: number, dayEndMs: number): number {
  const from = Math.max(startMs, dayStartMs)
  const to = Math.min(endMs, dayEndMs)
  if (to <= from) return 0
  return (to - from) / 60_000
}

export function formatDurationMinutes(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r > 0 ? `${h}h ${r}min` : `${h}h`
}

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

function dayKeyFromDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function addMinutesToHourBuckets(
  buckets: Map<number, { activeMinutes: number; inactiveMinutes: number }>,
  startMs: number,
  minutes: number,
  kind: "active" | "inactive",
) {
  if (minutes <= 0 || !Number.isFinite(startMs)) return
  let remaining = minutes
  let t = startMs
  const maxIter = 48
  let iter = 0
  while (remaining > 0.01 && iter < maxIter) {
    iter++
    const d = new Date(t)
    const hour = d.getHours()
    const bucket = buckets.get(hour) ?? { activeMinutes: 0, inactiveMinutes: 0 }
    const hourEnd = new Date(d)
    hourEnd.setMinutes(59, 59, 999)
    const sliceMin = Math.min(remaining, (hourEnd.getTime() - t) / 60_000 + 1 / 60_000)
    if (kind === "active") bucket.activeMinutes += sliceMin
    else bucket.inactiveMinutes += sliceMin
    buckets.set(hour, bucket)
    remaining -= sliceMin
    t += sliceMin * 60_000
  }
}

export type InactivityEpisode = {
  machine: string
  machineIdRaw: string | null
  day: string
  endedAt: string
  startedAt: string
  minutes: number
  alertTypes: string[]
}

export type MachineActivityRow = {
  machine: string
  activeHours: number
  inactiveMinutes: number
  productionEvents: number
  inactivityEpisodes: number
}

export type HourlyActivityBucket = {
  hour: string
  activeMinutes: number
  inactiveMinutes: number
  producing: boolean
}

export type MachineActivitySummary = {
  refDay: string | null
  totalInactiveMinutes: number
  totalActiveHours: number
  activePct: number
  hourlyTimeline: HourlyActivityBucket[]
  byMachine: MachineActivityRow[]
  episodes: InactivityEpisode[]
}

const EPISODE_GAP_MS = 90 * 60_000

export function buildMachineActivitySummary(
  rows: ActivityRow[],
  options: { refDay?: string | null; idleAlerts?: IdleAlertForActivity[]; nowMs?: number } = {},
): MachineActivitySummary {
  const empty: MachineActivitySummary = {
    refDay: options.refDay ?? null,
    totalInactiveMinutes: 0,
    totalActiveHours: 0,
    activePct: 0,
    hourlyTimeline: [],
    byMachine: [],
    episodes: [],
  }

  const idleAlerts = options.idleAlerts ?? []
  if (rows.length === 0 && idleAlerts.length === 0) return empty

  const nowMs = options.nowMs ?? Date.now()

  let refDay = options.refDay ?? null
  if (!refDay) {
    for (const r of rows) {
      const d = new Date(r.timestamp)
      if (Number.isNaN(d.getTime())) continue
      if (isProductionActivityEvent(r.eventRaw) || isInactivityActivityEvent(r.eventRaw)) {
        const k = dayKeyFromDate(d)
        if (!refDay || k > refDay) refDay = k
      }
    }
    for (const a of idleAlerts) {
      const ep = resolveIdleAlertEpisode(a, nowMs)
      if (!ep) continue
      const k = dayKeyFromDate(new Date(ep.endMs))
      if (!refDay || k > refDay) refDay = k
    }
  }
  if (!refDay) return empty

  const dayStart = new Date(`${refDay}T00:00:00`)
  const dayEnd = new Date(`${refDay}T23:59:59.999`)
  const dayStartMs = dayStart.getTime()
  const dayEndMs = dayEnd.getTime()

  const dayRows = rows.filter((r) => {
    const d = new Date(r.timestamp)
    return !Number.isNaN(d.getTime()) && d >= dayStart && d <= dayEnd
  })

  const byMachineEvents = new Map<string, ActivityRow[]>()
  for (const r of dayRows) {
    const key = r.machine_id || "—"
    const list = byMachineEvents.get(key) ?? []
    list.push(r)
    byMachineEvents.set(key, list)
  }

  const episodes: InactivityEpisode[] = []
  const machineStats = new Map<
    string,
    { activeHours: Set<number>; inactiveMinutes: number; productionEvents: number; episodes: number }
  >()
  const hourlyBuckets = new Map<number, { activeMinutes: number; inactiveMinutes: number }>()
  /** Evita contar 2 veces el mismo episodio (alerta idle + ALERT_* legacy). */
  const countedWindows = new Set<string>()

  const ensureStats = (machine: string) => {
    let stats = machineStats.get(machine)
    if (!stats) {
      stats = {
        activeHours: new Set<number>(),
        inactiveMinutes: 0,
        productionEvents: 0,
        episodes: 0,
      }
      machineStats.set(machine, stats)
    }
    return stats
  }

  for (const [machine, events] of byMachineEvents) {
    const sorted = events
      .slice()
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

    const stats = ensureStats(machine)

    for (const r of sorted) {
      const ts = new Date(r.timestamp)
      if (Number.isNaN(ts.getTime())) continue
      if (isProductionActivityEvent(r.eventRaw) && Number(r.count) > 0) {
        const sourceCount =
          r.rolledUp && r.sourceEventCount && r.sourceEventCount > 0
            ? r.sourceEventCount
            : 1
        stats.productionEvents += sourceCount

        if (r.rolledUp && r.firstOccurredAt && r.lastOccurredAt) {
          const firstMs = new Date(r.firstOccurredAt).getTime()
          const lastMs = new Date(r.lastOccurredAt).getTime()
          if (!Number.isNaN(firstMs) && !Number.isNaN(lastMs)) {
            const startMs = Math.min(firstMs, lastMs)
            const endMs = Math.max(firstMs, lastMs)
            const spanMin = endMs > startMs ? (endMs - startMs) / 60_000 : 10
            addMinutesToHourBuckets(hourlyBuckets, startMs, spanMin, "active")
            let t = startMs
            const guard = endMs + 60_000
            while (t <= endMs && t < guard) {
              stats.activeHours.add(new Date(t).getHours())
              t += 60_000
            }
            continue
          }
        }

        stats.activeHours.add(ts.getHours())
        addMinutesToHourBuckets(hourlyBuckets, ts.getTime() - 5 * 60_000, 10, "active")
      }
    }
  }

  // Fuente actual: alertas idle (duración real). Una alerta escala 15→45 sin duplicar.
  for (const a of idleAlerts) {
    const minMinutes =
      a.severity === "high" || a.severity === "critical" ? 45 : 15
    const ep = resolveIdleAlertEpisode(a, nowMs, { minMinutes })
    if (!ep) continue
    const overlap = minutesOverlapDay(ep.startMs, ep.endMs, dayStartMs, dayEndMs)
    if (overlap < 0.5) continue
    const minutes = Math.max(1, Math.round(overlap))
    const machine = a.machineLabel || "—"
    if (countedWindows.has(ep.windowKey)) continue
    countedWindows.add(ep.windowKey)
    const stats = ensureStats(machine)
    stats.inactiveMinutes += minutes
    stats.episodes++
    const clippedStart = Math.max(ep.startMs, dayStartMs)
    addMinutesToHourBuckets(hourlyBuckets, clippedStart, minutes, "inactive")
    episodes.push({
      machine,
      machineIdRaw: a.machineId,
      day: refDay,
      endedAt: new Date(Math.min(ep.endMs, dayEndMs)).toISOString(),
      startedAt: new Date(clippedStart).toISOString(),
      minutes,
      alertTypes: [
        a.severity === "high" || a.severity === "critical" ? "Tipo 2" : "Tipo 1",
      ],
    })
  }

  // Legacy: eventos ALERT_15 / ALERT_45 en production_events (solo si no hay alerta idle del episodio).
  for (const [machine, events] of byMachineEvents) {
    const sorted = events
      .slice()
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    const stats = ensureStats(machine)

    const inactivityEvents = sorted.filter((r) => isInactivityActivityEvent(r.eventRaw))
    let cluster: ActivityRow[] = []
    let clusterEnd = 0

    const flushCluster = () => {
      if (cluster.length === 0) return
      const last = cluster[cluster.length - 1]
      const endMs = new Date(last.timestamp).getTime()
      const types = cluster.map((c) => normalizeActivityEventType(c.eventRaw))
      const minutes = inactivityEpisodeMinutes(types)
      const startMs = endMs - minutes * 60_000
      const windowKey = `${last.machineIdRaw ?? machine}|${startMs}`
      // Si ya contamos una alerta idle cercana (±90 min), no sumar el umbral legacy.
      let alreadyCounted = countedWindows.has(windowKey)
      if (!alreadyCounted) {
        for (const key of countedWindows) {
          if (!key.startsWith(`${last.machineIdRaw ?? machine}|`)) continue
          const anchor = Number(key.slice(key.lastIndexOf("|") + 1))
          if (Number.isFinite(anchor) && Math.abs(anchor - startMs) <= EPISODE_GAP_MS) {
            alreadyCounted = true
            break
          }
        }
      }
      if (alreadyCounted) {
        cluster = []
        return
      }
      countedWindows.add(windowKey)
      stats.inactiveMinutes += minutes
      stats.episodes++
      addMinutesToHourBuckets(hourlyBuckets, startMs, minutes, "inactive")
      episodes.push({
        machine,
        machineIdRaw: last.machineIdRaw,
        day: refDay,
        endedAt: last.timestamp,
        startedAt: new Date(startMs).toISOString(),
        minutes,
        alertTypes: [...new Set(types)],
      })
      cluster = []
    }

    for (const r of inactivityEvents) {
      const ts = new Date(r.timestamp).getTime()
      if (cluster.length > 0 && ts - clusterEnd > EPISODE_GAP_MS) flushCluster()
      cluster.push(r)
      clusterEnd = ts
    }
    flushCluster()
  }

  const hourlyTimeline: HourlyActivityBucket[] = []
  for (let h = 0; h < 24; h++) {
    const b = hourlyBuckets.get(h) ?? { activeMinutes: 0, inactiveMinutes: 0 }
    const activeMinutes = Math.min(60, Math.round(b.activeMinutes))
    const inactiveMinutes = Math.min(60, Math.round(b.inactiveMinutes))
    hourlyTimeline.push({
      hour: `${pad2(h)}:00`,
      activeMinutes,
      inactiveMinutes,
      producing: activeMinutes > 0,
    })
  }

  let totalInactiveMinutes = 0
  const activeHourSet = new Set<number>()
  const byMachine: MachineActivityRow[] = []

  for (const [machine, stats] of machineStats) {
    totalInactiveMinutes += stats.inactiveMinutes
    for (const h of stats.activeHours) activeHourSet.add(h)
    byMachine.push({
      machine,
      activeHours: stats.activeHours.size,
      inactiveMinutes: stats.inactiveMinutes,
      productionEvents: stats.productionEvents,
      inactivityEpisodes: stats.episodes,
    })
  }

  byMachine.sort((a, b) => b.inactiveMinutes - a.inactiveMinutes)
  episodes.sort((a, b) => b.endedAt.localeCompare(a.endedAt))

  const totalActiveHours = activeHourSet.size
  const denom = totalActiveHours * 60 + totalInactiveMinutes
  const activePct = denom > 0 ? Math.round(((totalActiveHours * 60) / denom) * 100) : 0

  return {
    refDay,
    totalInactiveMinutes,
    totalActiveHours,
    activePct,
    hourlyTimeline,
    byMachine,
    episodes,
  }
}

export function buildDailyInactivitySeries(
  rows: ActivityRow[],
  idleAlerts: IdleAlertForActivity[] = [],
  nowMs: number = Date.now(),
): Array<{ date: string; inactiveMinutes: number; activeHours: number }> {
  const byDay = new Map<string, ActivityRow[]>()
  for (const r of rows) {
    const d = new Date(r.timestamp)
    if (Number.isNaN(d.getTime())) continue
    if (!isProductionActivityEvent(r.eventRaw) && !isInactivityActivityEvent(r.eventRaw)) continue
    const key = dayKeyFromDate(d)
    const list = byDay.get(key) ?? []
    list.push(r)
    byDay.set(key, list)
  }

  for (const a of idleAlerts) {
    const ep = resolveIdleAlertEpisode(a, nowMs)
    if (!ep) continue
    // Incluir días que el episodio toca (inicio y fin).
    for (const ms of [ep.startMs, ep.endMs]) {
      const key = dayKeyFromDate(new Date(ms))
      if (!byDay.has(key)) byDay.set(key, [])
    }
  }

  return [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, dayRows]) => {
      const summary = buildMachineActivitySummary(dayRows, {
        refDay: date,
        idleAlerts,
        nowMs,
      })
      return {
        date: date.slice(5),
        inactiveMinutes: summary.totalInactiveMinutes,
        activeHours: summary.totalActiveHours,
      }
    })
}
