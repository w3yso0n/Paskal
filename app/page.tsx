"use client"

import { useEffect, useMemo, useState } from "react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { Package, Clock, Server, Target, ZoomIn, ZoomOut, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"
import { TooltipProps } from "recharts"
import { useAuth } from "@/contexts/auth-context"
import {
  getEmployees,
  getMachines,
  getProductionEvents,
  getGoals,
  getMetrics,
  type ApiEmployee,
  type ApiMachine,
  type ApiProductionEvent,
} from "@/lib/api"
import { filterFloorMachines } from "@/lib/machine-floor"
import {
  fetchActualByGoalId,
  summarizeMonthlyGoalProgress,
} from "@/lib/goal-actual-progress"

const DASHBOARD_TIMEZONE = "America/Mexico_City"

type ShiftId = "shift1" | "shift2"

function getShiftBoundsInTimeZone(now: Date, shift: ShiftId, timeZone: string): { start: Date; end: Date } {
  const p = getPartsInTimeZone(now, timeZone)

  if (shift === "shift1") {
    // Turno 1: 07:00 -> 16:00 (mismo día)
    const start = makeZonedDate(p.year, p.month, p.day, 7, 0, timeZone)
    const end = makeZonedDate(p.year, p.month, p.day, 16, 0, timeZone)
    return { start, end }
  }

  // Turno 2: 16:00 -> 23:30 (mismo día, ya no cruza medianoche)
  const start = makeZonedDate(p.year, p.month, p.day, 16, 0, timeZone)
  const end = makeZonedDate(p.year, p.month, p.day, 23, 30, timeZone)
  return { start, end }
}

function buildHourBuckets(startInclusive: Date, endExclusive: Date, timeZone: string): string[] {
  const start = new Date(startInclusive)
  // Alineamos al inicio de la hora, pero sin salirnos del rango.
  start.setMinutes(0, 0, 0)

  const labels: string[] = []
  for (let t = start.getTime(); t < endExclusive.getTime(); t += 60 * 60 * 1000) {
    const d = new Date(t)
    const label = formatHmInTimeZone(d, timeZone)
    if (labels.length === 0 || labels[labels.length - 1] !== label) labels.push(label)
  }
  return labels
}

function getPartsInTimeZone(date: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    hour12: false,
  })
  const parts = dtf.formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: (Number(get("hour")) || 0) % 24,
    minute: Number(get("minute")),
    second: Number(get("second")),
  }
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const p = getPartsInTimeZone(date, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return (asUtc - date.getTime()) / 60_000
}

function makeZonedDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  // Convert "wall time" in `timeZone` to a real UTC Date.
  // We do a small iterative refinement to handle DST transitions.
  let utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0))
  let offset = getTimeZoneOffsetMinutes(utcGuess, timeZone)
  let corrected = new Date(utcGuess.getTime() - offset * 60_000)
  offset = getTimeZoneOffsetMinutes(corrected, timeZone)
  corrected = new Date(utcGuess.getTime() - offset * 60_000)
  return corrected
}

function getMonthBoundsInTimeZone(now: Date, timeZone: string): { start: Date; end: Date } {
  const p = getPartsInTimeZone(now, timeZone)
  const start = makeZonedDate(p.year, p.month, 1, 0, 0, timeZone)
  // Para el fin del mes, avanzamos desde el día 15 unos 30 días y tomamos el día 1 de ese mes.
  const midMonth = makeZonedDate(p.year, p.month, 15, 12, 0, timeZone)
  const nextMonthMid = new Date(midMonth.getTime() + 30 * 24 * 60 * 60 * 1000)
  const np = getPartsInTimeZone(nextMonthMid, timeZone)
  const end = makeZonedDate(np.year, np.month, 1, 0, 0, timeZone)
  return { start, end }
}

function getDayBoundsInTimeZone(now: Date, timeZone: string): { start: Date; end: Date } {
  const p = getPartsInTimeZone(now, timeZone)
  const start = makeZonedDate(p.year, p.month, p.day, 0, 0, timeZone)

  // Para calcular el "siguiente día" respetando DST, usamos un punto seguro (mediodía) y le sumamos 24h.
  const noon = makeZonedDate(p.year, p.month, p.day, 12, 0, timeZone)
  const tomorrowNoon = new Date(noon.getTime() + 24 * 60 * 60 * 1000)
  const tp = getPartsInTimeZone(tomorrowNoon, timeZone)
  const end = makeZonedDate(tp.year, tp.month, tp.day, 0, 0, timeZone)
  return { start, end }
}

function formatHmInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)
}

const CustomTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
  if (active && payload && payload.length) {
    const items = payload.map((entry) => ({
      name: entry.name,
      value: entry.value,
      color: entry.color,
    }))

    const halfLength = Math.ceil(items.length / 2)
    const leftColumn = items.slice(0, halfLength)
    const rightColumn = items.slice(halfLength)

    return (
      <div className="rounded-lg border border-border bg-card p-3 shadow-lg">
        <p className="mb-2 text-xs font-semibold text-card-foreground">{label}</p>
        <div className="flex gap-4">
          <div className="space-y-1">
            {leftColumn.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-xs text-muted-foreground">
                  {item.name}: <span className="font-semibold text-foreground">{item.value}</span>
                </span>
              </div>
            ))}
          </div>
          {rightColumn.length > 0 && (
            <div className="space-y-1">
              {rightColumn.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-xs text-muted-foreground">
                    {item.name}: <span className="font-semibold text-foreground">{item.value}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return null
}

const machineColors = [
  "#22c55e", // green
  "#3b82f6", // blue
  "#eab308", // yellow
  "#ec4899", // pink
  "#f97316", // orange
  "#8b5cf6", // purple
  "#06b6d4", // cyan
  "#84cc16", // lime
  "#ef4444", // red
  "#14b8a6", // teal
  "#a855f7", // violet
  "#f59e0b", // amber
  "#0ea5e9", // sky
  "#10b981", // emerald
  "#e11d48", // rose
  "#6366f1", // indigo
  "#22d3ee", // cyan 2
  "#fb7185", // pink 2
  "#65a30d", // lime 2
  "#c026d3", // fuchsia
]

type OperatorProductionStats = {
  month: number
  today: number
  shift: number
}

function resolveOperatorKey(
  payload: Record<string, unknown>,
  employeeNameByCode: Map<string, string>,
): string {
  const rawOperators = payload["operators"]
  const fromOperatorsArray =
    Array.isArray(rawOperators) && rawOperators.length > 0 && typeof rawOperators[0] === "string"
      ? (rawOperators[0] as string).trim()
      : undefined
  const rawOperator =
    (payload["OPERATOR_1"] as string | undefined) ??
    (payload["operator_1"] as string | undefined) ??
    (payload["OPERATOR"] as string | undefined) ??
    (payload["operator"] as string | undefined) ??
    fromOperatorsArray ??
    "—"
  const opCode = String(rawOperator ?? "—").trim() || "—"
  return employeeNameByCode.get(opCode) ?? employeeNameByCode.get(opCode.toLowerCase()) ?? opCode
}

function isProductionEvent(e: ApiProductionEvent): boolean {
  const payload = e.payload ?? {}
  const rawEvent =
    (payload["EVENT"] as string | undefined) ??
    (payload["event"] as string | undefined) ??
    e.eventType
  const event = String(rawEvent ?? "").toLowerCase()
  return event.includes("produ") || event === "prod" || event.includes("prod")
}

function eventProductionCount(payload: Record<string, unknown>): number {
  const rawCount =
    (payload["COUNT"] as unknown) ??
    (payload["count"] as unknown) ??
    (payload["units"] as unknown)
  const count = typeof rawCount === "number" ? rawCount : Number(rawCount)
  return Number.isFinite(count) && count > 0 ? count : 0
}

export default function HomePage() {
  const { getAccessToken } = useAuth()
  const [loading, setLoading] = useState(true)
  const [operatorProductionData, setOperatorProductionData] = useState<Record<string, string | number>[]>([])
  const [machines, setMachines] = useState<ApiMachine[]>([])
  const [employees, setEmployees] = useState<ApiEmployee[]>([])
  const [totalProduced, setTotalProduced] = useState(0)
  const [producedToday, setProducedToday] = useState(0)
  const [monthlyGoal, setMonthlyGoal] = useState<{ actual: number; target: number; pct: number } | null>(
    null,
  )
  const [operatorStats, setOperatorStats] = useState<Record<string, OperatorProductionStats>>({})
  const [selectedShift, setSelectedShift] = useState<ShiftId>("shift1")

  useEffect(() => {
    let cancelled = false
    const load = async (silent = false) => {
      if (!silent) setLoading(true)
      try {
        const token = await getAccessToken()
        if (!token) {
          if (!cancelled) {
            setOperatorProductionData([])
            setMachines([])
            setEmployees([])
            setTotalProduced(0)
            setProducedToday(0)
            setOperatorStats({})
          }
          return
        }

        const [apiMachines, apiEmployees, events, goals, metrics] = await Promise.all([
          getMachines(token),
          getEmployees(token),
          getProductionEvents(token, { limit: 2500 }),
          getGoals(token),
          getMetrics(token),
        ])
        if (cancelled) return
        setMachines(filterFloorMachines(apiMachines))
        setEmployees(apiEmployees)

        const employeeNameByCode = new Map<string, string>()
        for (const emp of apiEmployees) {
          const c = emp.employeeCode?.trim()
          if (!c) continue
          employeeNameByCode.set(c, emp.fullName)
          employeeNameByCode.set(c.toLowerCase(), emp.fullName)
        }

        const byBucket = new Map<string, Record<string, string | number>>()
        const statsByOperator = new Map<string, OperatorProductionStats>()
        let total = 0
        let today = 0
        const now = new Date()
        const { start: startOfTodayTz, end: endOfTodayTz } = getDayBoundsInTimeZone(
          now,
          DASHBOARD_TIMEZONE,
        )
        const { start: startOfMonthTz, end: endOfMonthTz } = getMonthBoundsInTimeZone(
          now,
          DASHBOARD_TIMEZONE,
        )
        const { start: shiftStart, end: shiftEnd } = getShiftBoundsInTimeZone(
          now,
          selectedShift,
          DASHBOARD_TIMEZONE,
        )
        const bucketLabels = buildHourBuckets(shiftStart, shiftEnd, DASHBOARD_TIMEZONE)
        for (const label of bucketLabels) {
          byBucket.set(label, { time: label })
        }

        for (const e of events) {
          const payload = e.payload ?? {}
          if (!isProductionEvent(e)) continue

          const count = eventProductionCount(payload)
          if (count <= 0) continue

          const ts = new Date(e.occurredAt)
          if (Number.isNaN(ts.getTime())) continue

          const operatorKey = resolveOperatorKey(payload, employeeNameByCode)
          const opStats = statsByOperator.get(operatorKey) ?? { month: 0, today: 0, shift: 0 }

          const isThisMonth = ts >= startOfMonthTz && ts < endOfMonthTz
          if (isThisMonth) {
            total += count
            opStats.month += count
          }
          const isToday = ts >= startOfTodayTz && ts < endOfTodayTz
          if (isToday) {
            today += count
            opStats.today += count
          }
          const inShift = ts >= shiftStart && ts < shiftEnd
          if (inShift) {
            opStats.shift += count
          }
          statsByOperator.set(operatorKey, opStats)

          if (!inShift) continue

          const bucket = new Date(ts)
          bucket.setMinutes(0, 0, 0)
          const label = formatHmInTimeZone(bucket, DASHBOARD_TIMEZONE)
          if (!byBucket.has(label)) continue

          const row = byBucket.get(label) ?? { time: label }
          row[operatorKey] = (Number(row[operatorKey]) || 0) + count
          byBucket.set(label, row)
        }

        const allOperatorKeys = new Set<string>()
        for (const row of byBucket.values()) {
          for (const k of Object.keys(row)) {
            if (k !== "time") allOperatorKeys.add(k)
          }
        }
        const rows = bucketLabels.map((label) => {
          const row = byBucket.get(label) ?? { time: label }
          const next: Record<string, string | number> = { ...row }
          for (const k of allOperatorKeys) {
            if (next[k] === undefined) next[k] = 0
          }
          return next
        })
        setOperatorProductionData(rows)
        setOperatorStats(Object.fromEntries(statsByOperator))
        setTotalProduced(total)
        setProducedToday(today)

        const actualByGoalId = await fetchActualByGoalId(token, goals, apiMachines, metrics)
        if (cancelled) return
        const monthlySummary = summarizeMonthlyGoalProgress(goals, actualByGoalId, metrics)
        setMonthlyGoal(
          monthlySummary
            ? {
                actual: monthlySummary.actual,
                target: monthlySummary.target,
                pct: monthlySummary.pct,
              }
            : null,
        )
      } finally {
        if (!cancelled && !silent) setLoading(false)
      }
    }
    load(false)
    const intervalId = window.setInterval(() => load(true), 30_000)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [getAccessToken, selectedShift])

  const hasProductionData = operatorProductionData.length > 0
  const operatorKeys = useMemo(() => {
    if (!hasProductionData) return []
    const keys = new Set<string>()
    for (const row of operatorProductionData) {
      for (const k of Object.keys(row)) {
        if (k !== "time") keys.add(k)
      }
    }
    return [...keys].sort((a, b) => a.localeCompare(b))
  }, [hasProductionData, operatorProductionData])

  const [visibleMachines, setVisibleMachines] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setVisibleMachines((prev) => {
      const prevKeys = Object.keys(prev).sort().join("\0")
      const nextKeys = operatorKeys.join("\0")
      if (prevKeys === nextKeys && operatorKeys.every((k) => k in prev)) {
        return prev
      }
      const next: Record<string, boolean> = {}
      for (const key of operatorKeys) {
        next[key] = key in prev ? prev[key]! : true
      }
      return next
    })
  }, [operatorKeys])

  const toggleMachine = (name: string) => {
    setVisibleMachines((prev) => ({
      ...prev,
      [name]: !prev[name],
    }))
  }

  const toggleAllMachines = (checked: boolean) => {
    setVisibleMachines(
      Object.fromEntries(operatorKeys.map((key) => [key, checked]))
    )
  }

  const allVisible = operatorKeys.length === 0 || operatorKeys.every((key) => visibleMachines[key])

  const selectedOperators = useMemo(
    () => operatorKeys.filter((key) => visibleMachines[key]),
    [operatorKeys, visibleMachines],
  )

  const operatorFilterActive = useMemo(
    () => operatorKeys.length > 0 && selectedOperators.length < operatorKeys.length,
    [operatorKeys.length, selectedOperators.length],
  )

  const displayKpis = useMemo(() => {
    if (!operatorFilterActive || selectedOperators.length === 0) {
      return {
        month: totalProduced,
        today: producedToday,
        shift: null as number | null,
        operatorLabel: null as string | null,
      }
    }

    let month = 0
    let today = 0
    let shift = 0
    for (const op of selectedOperators) {
      const stats = operatorStats[op]
      if (!stats) continue
      month += stats.month
      today += stats.today
      shift += stats.shift
    }

    const operatorLabel =
      selectedOperators.length === 1
        ? selectedOperators[0]
        : `${selectedOperators.length} operadores seleccionados`

    return { month, today, shift, operatorLabel }
  }, [
    operatorFilterActive,
    selectedOperators,
    operatorStats,
    totalProduced,
    producedToday,
  ])

  const filteredMonthlyGoal = useMemo(() => {
    if (!monthlyGoal || !operatorFilterActive) return monthlyGoal
    return {
      actual: displayKpis.month,
      target: monthlyGoal.target,
      pct: monthlyGoal.target > 0 ? Math.round((displayKpis.month / monthlyGoal.target) * 100) : 0,
    }
  }, [monthlyGoal, operatorFilterActive, displayKpis.month])

  const machinesActive = machines.filter((m) => m.status === "green").length
  const shiftLabel = selectedShift === "shift1" ? "Turno 1" : "Turno 2"
  return (
    <DashboardLayout breadcrumbs={[{ label: "Inicio" }]}>
      <div className="space-y-6">
        {/* Welcome Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">¡Bienvenido, Paskal!</h1>
          <p className="text-muted-foreground">
            Aquí tienes una vista general de la producción y el estado de tus máquinas.
          </p>
        </div>

        {/* KPI Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title={operatorFilterActive ? "Producción del mes (operador)" : "Producción del Mes"}
            value={loading ? "—" : displayKpis.month.toLocaleString()}
            subtitle={displayKpis.operatorLabel ?? undefined}
            icon={Package}
            iconColor="text-primary"
          />
          <KpiCard
            title={operatorFilterActive ? "Producido hoy (operador)" : "Producido Hoy"}
            value={loading ? "—" : displayKpis.today.toLocaleString()}
            subtitle={displayKpis.operatorLabel ?? undefined}
            icon={Clock}
            iconColor="text-cyan-600"
          />
          <KpiCard
            title={
              operatorFilterActive
                ? `Producción en ${shiftLabel}`
                : "Máquinas Activas"
            }
            value={
              loading
                ? "—"
                : operatorFilterActive
                  ? (displayKpis.shift ?? 0).toLocaleString()
                  : String(machinesActive)
            }
            subtitle={
              operatorFilterActive
                ? displayKpis.operatorLabel ?? undefined
                : undefined
            }
            icon={operatorFilterActive ? Clock : Server}
            iconColor="text-primary"
          />
          <KpiCard
            title="Meta Mensual"
            value={
              loading || filteredMonthlyGoal == null
                ? "—"
                : `${filteredMonthlyGoal.actual.toLocaleString()} / ${filteredMonthlyGoal.target.toLocaleString()}`
            }
            subtitle={
              loading
                ? "Cargando…"
                : filteredMonthlyGoal == null
                  ? "Sin meta mensual configurada"
                  : operatorFilterActive
                    ? `${filteredMonthlyGoal.pct}% del objetivo · ${displayKpis.operatorLabel ?? "operador"}`
                    : `${filteredMonthlyGoal.pct}% del objetivo`
            }
            icon={Target}
            iconColor="text-teal-600"
          />
        </div>

        {/* Production Chart */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-card-foreground">Producción por Operador</h2>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSelectedShift((s) => (s === "shift1" ? "shift2" : "shift1"))}
              >
                {selectedShift === "shift1" ? "Turno 1 (07:00–16:00)" : "Turno 2 (16:00–23:30)"}
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="flex h-[400px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-muted-foreground">
              Cargando producción…
            </div>
          ) : !hasProductionData ? (
            <div className="flex h-[400px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-muted-foreground">
              Sin datos de producción.
            </div>
          ) : (
            <>
              {/* Machine Selection */}
              <div className="mb-6 rounded-lg border border-border bg-muted/50 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Checkbox
                    id="select-all"
                    checked={allVisible}
                    onCheckedChange={toggleAllMachines}
                  />
                  <label
                    htmlFor="select-all"
                    className="cursor-pointer text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Seleccionar/Deseleccionar todos
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {operatorKeys.map((name) => (
                    <div key={name} className="flex items-center gap-2">
                      <Checkbox
                        id={name}
                        checked={visibleMachines[name]}
                        onCheckedChange={() => toggleMachine(name)}
                      />
                      <label
                        htmlFor={name}
                        className="cursor-pointer text-xs leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        {name}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={operatorProductionData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 12 }}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      tickFormatter={(value) => {
                        const [hourStr, minuteStr] = value.split(":")
                        const hour = Number.parseInt(hourStr)
                        const suffix = hour >= 12 ? "PM" : "AM"
                        const displayHour = hour % 12 || 12
                        return `${displayHour}:${minuteStr} ${suffix}`
                      }}
                    />
                    <YAxis tick={{ fontSize: 12 }} domain={[0, 200]} />
                    <Tooltip content={<CustomTooltip />} />
                    {operatorKeys.map((key, index) =>
                      visibleMachines[key] ? (
                        <Line
                          key={key}
                          type="linear"
                          dataKey={key}
                          stroke={machineColors[index % machineColors.length]}
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4 }}
                        />
                      ) : null
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
