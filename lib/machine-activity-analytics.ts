export type ActivityRow = {
  machine_id: string
  machineIdRaw: string | null
  timestamp: string
  event: string
  eventRaw: string
  count: number
}

export function normalizeActivityEventType(eventRaw: string): string {
  return eventRaw.trim().toUpperCase()
}

export function isProductionActivityEvent(eventRaw: string): boolean {
  const v = normalizeActivityEventType(eventRaw)
  return v === "PROD" || v === "BOOT" || v.includes("PROD")
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
  options: { refDay?: string | null } = {},
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

  if (rows.length === 0) return empty

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
  }
  if (!refDay) return empty

  const dayStart = new Date(`${refDay}T00:00:00`)
  const dayEnd = new Date(`${refDay}T23:59:59.999`)

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

  for (const [machine, events] of byMachineEvents) {
    const sorted = events
      .slice()
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

    const stats = {
      activeHours: new Set<number>(),
      inactiveMinutes: 0,
      productionEvents: 0,
      episodes: 0,
    }

    for (const r of sorted) {
      const ts = new Date(r.timestamp)
      if (Number.isNaN(ts.getTime())) continue
      if (isProductionActivityEvent(r.eventRaw) && Number(r.count) > 0) {
        stats.productionEvents++
        stats.activeHours.add(ts.getHours())
        addMinutesToHourBuckets(hourlyBuckets, ts.getTime() - 5 * 60_000, 10, "active")
      }
    }

    const inactivityEvents = sorted.filter((r) => isInactivityActivityEvent(r.eventRaw))
    let cluster: ActivityRow[] = []
    let clusterEnd = 0

    const flushCluster = () => {
      if (cluster.length === 0) return
      const last = cluster[cluster.length - 1]
      const endMs = new Date(last.timestamp).getTime()
      const types = cluster.map((c) => normalizeActivityEventType(c.eventRaw))
      const minutes = inactivityEpisodeMinutes(types)
      stats.inactiveMinutes += minutes
      stats.episodes++
      const startMs = endMs - minutes * 60_000
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

    machineStats.set(machine, stats)
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

  return [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, dayRows]) => {
      const summary = buildMachineActivitySummary(dayRows, { refDay: date })
      return {
        date: date.slice(5),
        inactiveMinutes: summary.totalInactiveMinutes,
        activeHours: summary.totalActiveHours,
      }
    })
}
