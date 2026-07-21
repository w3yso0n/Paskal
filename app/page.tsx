"use client"

import { useEffect, useMemo, useState } from "react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { Package, Clock, Server, Target } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { TooltipProps } from "recharts"
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent"
import { useAuth } from "@/contexts/auth-context"
import {
  getEmployees,
  getMachines,
  getProductionEvents,
  getGoals,
  getBonusProductionConfigForMonth,
  type ApiEmployee,
  type ApiGoal,
  type ApiMachine,
  type ApiProductionEvent,
} from "@/lib/api"
import { buildGoalsForProgressTracking, resolveWindingShiftHeadcount } from "@/lib/bonus-goals-bridge"
import {
  DEFAULT_BONUS_PRODUCTION_CONFIG,
  monthlyMeta100FromDaily,
  normalizeBonusProductionConfig,
} from "@/lib/bonus-production-config"
import { filterFloorMachines } from "@/lib/machine-floor"
import {
  fetchActualByGoalId,
  summarizeMonthlyGoalProgress,
} from "@/lib/goal-actual-progress"
import { productionUnitsFromEvent } from "@/lib/production-goal-events"

const DASHBOARD_TIMEZONE = "America/Mexico_City"

type ShiftId = "shift1" | "shift2"

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

function todayDateInputValue(timeZone: string): string {
  const p = getPartsInTimeZone(new Date(), timeZone)
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`
}

/** Límites del día calendario elegido en el input (medianoche a medianoche en zona de planta). */
function getDayBoundsFromDateInput(
  dateStr: string,
  timeZone: string,
): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim())
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
  const start = makeZonedDate(year, month, day, 0, 0, timeZone)
  const noon = makeZonedDate(year, month, day, 12, 0, timeZone)
  const tomorrowNoon = new Date(noon.getTime() + 24 * 60 * 60 * 1000)
  const tp = getPartsInTimeZone(tomorrowNoon, timeZone)
  const end = makeZonedDate(tp.year, tp.month, tp.day, 0, 0, timeZone)
  return { start, end }
}

function formatSelectedDayLabel(dateStr: string, timeZone: string): string {
  const bounds = getDayBoundsFromDateInput(dateStr, timeZone)
  if (!bounds) return dateStr
  return new Intl.DateTimeFormat("es-MX", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(bounds.start)
}

function formatHmInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)
}

type ChartTooltipItem = {
  name: string
  value: number | string
  color: string
}

function ChartItemsTooltip({
  label,
  items,
  subtitle,
}: {
  label: string
  items: ChartTooltipItem[]
  subtitle?: string
}) {
  if (items.length === 0) return null

  const halfLength = Math.ceil(items.length / 2)
  const leftColumn = items.slice(0, halfLength)
  const rightColumn = items.slice(halfLength)

  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-lg">
      <p className="mb-0.5 text-xs font-semibold text-card-foreground">{label}</p>
      {subtitle ? (
        <p className="mb-2 text-[10px] text-muted-foreground">{subtitle}</p>
      ) : (
        <div className="mb-2" />
      )}
      <div className="flex gap-4">
        <div className="space-y-1">
          {leftColumn.map((item) => (
            <div key={String(item.name)} className="flex items-center gap-2">
              <div
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-xs text-muted-foreground">
                {item.name}:{" "}
                <span className="font-semibold text-foreground">{item.value}</span>
              </span>
            </div>
          ))}
        </div>
        {rightColumn.length > 0 && (
          <div className="space-y-1">
            {rightColumn.map((item) => (
              <div key={String(item.name)} className="flex items-center gap-2">
                <div
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-xs text-muted-foreground">
                  {item.name}:{" "}
                  <span className="font-semibold text-foreground">{item.value}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** Tooltip: una persona si el cursor está sobre su línea; si no, todas en esa hora. */
function ProductionChartTooltip({
  active,
  payload,
  label,
  focusKey,
}: TooltipProps<ValueType, NameType> & { focusKey: string | null }) {
  if (!active || !payload?.length) return null

  const source = focusKey
    ? payload.filter((entry) => String(entry.dataKey ?? entry.name) === focusKey)
    : payload

  // Hay una Line visible + otra transparente para el hit-area; deduplicar por persona.
  const seen = new Set<string>()
  const items: ChartTooltipItem[] = []
  for (const entry of source) {
    const stroke = String(entry.color ?? entry.stroke ?? "")
    if (stroke === "transparent" || stroke === "none") continue
    const name = String(entry.name ?? entry.dataKey ?? "").trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    const value = typeof entry.value === "number" ? entry.value : Number(entry.value)
    items.push({
      name,
      value: Number.isFinite(value) ? value : String(entry.value ?? "—"),
      color: stroke || "#64748b",
    })
  }

  items.sort((a, b) => Number(b.value) - Number(a.value))
  if (items.length === 0) return null

  return (
    <ChartItemsTooltip
      label={String(label ?? "")}
      subtitle={focusKey ? "Operadora" : "Todas en esta hora"}
      items={items}
    />
  )
}

/**
 * Paleta de máximo contraste (tonos oscuros/medios).
 * Espaciada en el círculo de color para que líneas cercanas no se confundan.
 */
const OPERATOR_LINE_COLORS = [
  "#e41a1c", // rojo
  "#377eb8", // azul
  "#4daf4a", // verde
  "#984ea3", // púrpura
  "#ff7f00", // naranja
  "#a65628", // café
  "#f781bf", // rosa
  "#1b9e77", // verde-azulado
  "#d95f02", // naranja oscuro
  "#7570b3", // índigo
  "#e7298a", // magenta
  "#66a61e", // lima
  "#e6ab02", // oro
  "#555555", // gris
  "#01665e", // teal oscuro
  "#8c510a", // marrón
  "#762a83", // púrpura oscuro
  "#1a9850", // verde intenso
  "#d73027", // rojo intenso
  "#4575b4", // azul medio
  "#c51b7d", // fucsia
  "#35978f", // turquesa
  "#bf812d", // ocre
  "#5e4fa2", // violeta
]

function colorForOperator(name: string, orderedKeys: string[]): string {
  const index = orderedKeys.indexOf(name)
  const i = index >= 0 ? index : 0
  return OPERATOR_LINE_COLORS[i % OPERATOR_LINE_COLORS.length]!
}

function formatHourTick(value: string): string {
  const [hourStr, minuteStr] = value.split(":")
  const hour = Number.parseInt(hourStr, 10)
  if (!Number.isFinite(hour)) return value
  const suffix = hour >= 12 ? "PM" : "AM"
  const displayHour = hour % 12 || 12
  return `${displayHour}:${minuteStr ?? "00"} ${suffix}`
}

type OperatorProductionStats = {
  month: number
  day: number
  shift: number
}

/** Código crudo (employee_code) del operador 1 del evento PROD; "—" si no hay. */
function extractOperatorCode(payload: Record<string, unknown>): string {
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
  return String(rawOperator ?? "—").trim() || "—"
}

export default function HomePage() {
  const { getAccessToken, user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [operatorProductionData, setOperatorProductionData] = useState<Record<string, string | number>[]>([])
  const [machines, setMachines] = useState<ApiMachine[]>([])
  const [employees, setEmployees] = useState<ApiEmployee[]>([])
  const [totalProduced, setTotalProduced] = useState(0)
  const [producedOnSelectedDay, setProducedOnSelectedDay] = useState(0)
  const [monthlyGoal, setMonthlyGoal] = useState<{ actual: number; target: number; pct: number } | null>(
    null,
  )
  /** Meta mensual 100% por operador (diario × días hábiles del mes) del turno seleccionado. */
  const [operatorMonthlyTarget, setOperatorMonthlyTarget] = useState<number | null>(null)
  const [operatorStats, setOperatorStats] = useState<Record<string, OperatorProductionStats>>({})
  const [selectedShift, setSelectedShift] = useState<ShiftId>("shift1")
  const [selectedDate, setSelectedDate] = useState(() => todayDateInputValue(DASHBOARD_TIMEZONE))

  const isViewingToday = selectedDate === todayDateInputValue(DASHBOARD_TIMEZONE)
  const selectedDayLabel = useMemo(
    () => formatSelectedDayLabel(selectedDate, DASHBOARD_TIMEZONE),
    [selectedDate],
  )

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
            setProducedOnSelectedDay(0)
            setMonthlyGoal(null)
            setOperatorMonthlyTarget(null)
            setOperatorStats({})
          }
          return
        }

        const dayBounds = getDayBoundsFromDateInput(selectedDate, DASHBOARD_TIMEZONE)
        if (!dayBounds) {
          if (!cancelled) {
            setOperatorProductionData([])
            setProducedOnSelectedDay(0)
            setOperatorStats({})
          }
          return
        }

        const now = new Date()
        const { start: startOfMonthTz, end: endOfMonthTz } = getMonthBoundsInTimeZone(
          now,
          DASHBOARD_TIMEZONE,
        )

        const monthParts = getPartsInTimeZone(now, DASHBOARD_TIMEZONE)
        const bonusMonth = `${monthParts.year}-${String(monthParts.month).padStart(2, "0")}`

        const [apiMachines, apiEmployees, dayEvents, monthEvents, goalsResult, bonusCfg] =
          await Promise.all([
          getMachines(token),
          getEmployees(token),
          getProductionEvents(token, {
            from: dayBounds.start.toISOString(),
            to: dayBounds.end.toISOString(),
            limit: 50_000,
          }),
          getProductionEvents(token, {
            from: startOfMonthTz.toISOString(),
            to: endOfMonthTz.toISOString(),
            limit: 50_000,
          }),
          getGoals(token).catch(() => [] as ApiGoal[]),
          getBonusProductionConfigForMonth(token, bonusMonth).catch(() => null),
        ])
        if (cancelled) return
        const goals = goalsResult
        const bonusConfig = bonusCfg
          ? normalizeBonusProductionConfig(bonusCfg.config)
          : DEFAULT_BONUS_PRODUCTION_CONFIG
        const goalsForActual = buildGoalsForProgressTracking(goals, bonusConfig, bonusMonth, {
          headcount: resolveWindingShiftHeadcount(apiEmployees),
        })
        const floorMachines = filterFloorMachines(apiMachines)
        setMachines(floorMachines)
        setEmployees(apiEmployees)

        const upbById = new Map<string, number>()
        for (const m of floorMachines) {
          const upb = m.unitsPerBox
          if (upb != null && Number.isFinite(upb) && upb > 0) upbById.set(m.id, upb)
        }

        const employeeNameByCode = new Map<string, string>()
        for (const emp of apiEmployees) {
          const c = emp.employeeCode?.trim()
          if (!c) continue
          employeeNameByCode.set(c, emp.fullName)
          employeeNameByCode.set(c.toLowerCase(), emp.fullName)
        }

        // Turno ASIGNADO por operador (cruza por employee_code y por nombre).
        const selectedShiftNum = selectedShift === "shift1" ? 1 : 2
        const shiftByCode = new Map<string, number>()
        const shiftByName = new Map<string, number>()
        for (const emp of apiEmployees) {
          if (emp.shift !== 1 && emp.shift !== 2) continue
          const c = emp.employeeCode?.trim()
          if (c) {
            shiftByCode.set(c, emp.shift)
            shiftByCode.set(c.toLowerCase(), emp.shift)
          }
          const n = emp.fullName?.trim()
          if (n) {
            shiftByName.set(n, emp.shift)
            shiftByName.set(n.toLowerCase(), emp.shift)
          }
        }

        const byBucket = new Map<string, Record<string, string | number>>()
        const statsByOperator = new Map<string, OperatorProductionStats>()
        const shiftHourMs: number[] = []
        let monthTotal = 0
        let dayTotal = 0

        for (const e of monthEvents) {
          const payload = e.payload ?? {}
          const count = productionUnitsFromEvent(e, upbById)
          if (count <= 0) continue

          const ts = new Date(e.occurredAt)
          if (Number.isNaN(ts.getTime())) continue

          const opCode = extractOperatorCode(payload)
          const operatorKey =
            employeeNameByCode.get(opCode) ?? employeeNameByCode.get(opCode.toLowerCase()) ?? opCode

          const opStats = statsByOperator.get(operatorKey) ?? { month: 0, day: 0, shift: 0 }
          monthTotal += count
          opStats.month += count
          statsByOperator.set(operatorKey, opStats)
        }

        for (const e of dayEvents) {
          const payload = e.payload ?? {}
          const count = productionUnitsFromEvent(e, upbById)
          if (count <= 0) continue

          const ts = new Date(e.occurredAt)
          if (Number.isNaN(ts.getTime())) continue

          const opCode = extractOperatorCode(payload)
          const operatorKey =
            employeeNameByCode.get(opCode) ?? employeeNameByCode.get(opCode.toLowerCase()) ?? opCode
          const opShift =
            shiftByCode.get(opCode) ??
            shiftByCode.get(opCode.toLowerCase()) ??
            shiftByName.get(operatorKey) ??
            shiftByName.get(operatorKey.toLowerCase()) ??
            null

          const opStats = statsByOperator.get(operatorKey) ?? { month: 0, day: 0, shift: 0 }
          dayTotal += count
          opStats.day += count
          statsByOperator.set(operatorKey, opStats)

          if (opShift !== selectedShiftNum) continue
          opStats.shift += count
          statsByOperator.set(operatorKey, opStats)

          const bucket = new Date(ts)
          bucket.setMinutes(0, 0, 0)
          if (bucket.getTime() < ts.getTime()) {
            bucket.setHours(bucket.getHours() + 1)
          }
          shiftHourMs.push(bucket.getTime())
          const label = formatHmInTimeZone(bucket, DASHBOARD_TIMEZONE)
          const row = byBucket.get(label) ?? { time: label }
          row[operatorKey] = (Number(row[operatorKey]) || 0) + count
          byBucket.set(label, row)
        }

        const bucketLabels: string[] = []
        if (shiftHourMs.length > 0) {
          const minH = Math.min(...shiftHourMs)
          const maxH = Math.max(...shiftHourMs)
          for (let t = minH; t <= maxH; t += 60 * 60 * 1000) {
            const label = formatHmInTimeZone(new Date(t), DASHBOARD_TIMEZONE)
            if (bucketLabels[bucketLabels.length - 1] !== label) bucketLabels.push(label)
          }
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
        setTotalProduced(monthTotal)
        setProducedOnSelectedDay(dayTotal)

        const actualByGoalId = await fetchActualByGoalId(token, goalsForActual, floorMachines)
        if (cancelled) return
        const shiftFilter = selectedShift === "shift1" ? "matutino" : "vespertino"
        const windingShiftCfg =
          selectedShift === "shift1" ? bonusConfig.winding.shift1 : bonusConfig.winding.shift2
        setOperatorMonthlyTarget(
          monthlyMeta100FromDaily(
            windingShiftCfg.dailyMeta100,
            windingShiftCfg.workingDaysPerMonth,
          ),
        )
        const monthlySummary = summarizeMonthlyGoalProgress(goalsForActual, actualByGoalId, {
          shiftFilter,
        })
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
    const intervalId = isViewingToday
      ? window.setInterval(() => load(true), 30_000)
      : undefined
    return () => {
      cancelled = true
      if (intervalId != null) window.clearInterval(intervalId)
    }
  }, [getAccessToken, selectedShift, selectedDate, isViewingToday])

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
  const [hoveredLineKey, setHoveredLineKey] = useState<string | null>(null)

  const operatorColorByName = useMemo(() => {
    const map = new Map<string, string>()
    for (const key of operatorKeys) {
      map.set(key, colorForOperator(key, operatorKeys))
    }
    return map
  }, [operatorKeys])

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
        day: producedOnSelectedDay,
        operatorLabel: null as string | null,
      }
    }

    let month = 0
    let day = 0
    for (const op of selectedOperators) {
      const stats = operatorStats[op]
      if (!stats) continue
      month += stats.month
      day += stats.day
    }

    const operatorLabel =
      selectedOperators.length === 1
        ? selectedOperators[0]
        : `${selectedOperators.length} operadores seleccionados`

    return { month, day, operatorLabel }
  }, [
    operatorFilterActive,
    selectedOperators,
    operatorStats,
    totalProduced,
    producedOnSelectedDay,
  ])

  const filteredMonthlyGoal = useMemo(() => {
    if (!monthlyGoal) return null
    if (!operatorFilterActive || selectedOperators.length === 0) return monthlyGoal
    const perOperator =
      operatorMonthlyTarget != null && operatorMonthlyTarget > 0
        ? operatorMonthlyTarget
        : null
    const target =
      perOperator != null
        ? Math.round(perOperator * selectedOperators.length)
        : monthlyGoal.target
    const actual = displayKpis.month
    return {
      actual,
      target,
      pct: target > 0 ? Math.round((actual / target) * 100) : 0,
    }
  }, [
    monthlyGoal,
    operatorFilterActive,
    selectedOperators.length,
    operatorMonthlyTarget,
    displayKpis.month,
  ])

  const machineStatusCounts = useMemo(() => {
    let activas = 0
    let esperando = 0
    let mantenimiento = 0
    let inactivas = 0
    for (const m of machines) {
      if (m.status === "green") activas++
      else if (m.status === "yellow") esperando++
      else if (m.status === "blue") mantenimiento++
      else inactivas++
    }
    return { activas, esperando, mantenimiento, inactivas, total: machines.length }
  }, [machines])

  const shiftLabel = selectedShift === "shift1" ? "Turno 1" : "Turno 2"
  return (
    <DashboardLayout breadcrumbs={[{ label: "Inicio" }]}>
      <div className="space-y-6">
        {/* Welcome Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            ¡Bienvenido, {user?.fullName?.trim() || "Paskal"}!
          </h1>
          <p className="text-muted-foreground">
            Vista general de producción y estado de máquinas
            {!isViewingToday ? ` · ${selectedDayLabel}` : ""}.
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
            title={
              operatorFilterActive
                ? isViewingToday
                  ? "Producido hoy (operador)"
                  : "Producido del día (operador)"
                : isViewingToday
                  ? "Producido Hoy"
                  : "Producido del Día"
            }
            value={loading ? "—" : displayKpis.day.toLocaleString()}
            subtitle={
              displayKpis.operatorLabel ?? (isViewingToday ? undefined : selectedDayLabel)
            }
            icon={Clock}
            iconColor="text-cyan-600"
          />
          <KpiCard
            title="Estado de máquinas"
            value={loading ? "—" : machineStatusCounts.total}
            breakdown={
              loading
                ? undefined
                : [
                    {
                      label: "Activas",
                      value: machineStatusCounts.activas,
                      dotClass: "bg-green-500",
                      valueClass: "text-green-700",
                    },
                    {
                      label: "Esperando",
                      value: machineStatusCounts.esperando,
                      dotClass: "bg-yellow-500",
                      valueClass: "text-yellow-700",
                    },
                    {
                      label: "Mantenimiento",
                      value: machineStatusCounts.mantenimiento,
                      dotClass: "bg-blue-500",
                      valueClass: "text-blue-700",
                    },
                    {
                      label: "Inactivas",
                      value: machineStatusCounts.inactivas,
                      dotClass: "bg-red-500",
                      valueClass: "text-red-700",
                    },
                  ]
            }
            icon={Server}
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
                    ? `Conteo del ${shiftLabel} · ${filteredMonthlyGoal.pct}% del objetivo · ${displayKpis.operatorLabel ?? "operador"}`
                    : `Conteo del ${shiftLabel} · ${filteredMonthlyGoal.pct}% del objetivo`
            }
            icon={Target}
            iconColor="text-teal-600"
          />
        </div>

        {/* Production Chart */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-card-foreground">Producción por Operador</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {isViewingToday ? "Hoy" : selectedDayLabel} · {shiftLabel}
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="dashboard-date" className="text-xs text-muted-foreground">
                  Día
                </Label>
                <Input
                  id="dashboard-date"
                  type="date"
                  value={selectedDate}
                  max={todayDateInputValue(DASHBOARD_TIMEZONE)}
                  onChange={(e) => {
                    const v = e.target.value
                    if (v) setSelectedDate(v)
                  }}
                  className="w-[11.5rem]"
                />
              </div>
              {!isViewingToday && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSelectedDate(todayDateInputValue(DASHBOARD_TIMEZONE))}
                >
                  Hoy
                </Button>
              )}
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
              Sin datos de producción{isViewingToday ? "" : ` para ${selectedDayLabel}`}.
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
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: operatorColorByName.get(name) }}
                        aria-hidden
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
                  <LineChart
                    data={operatorProductionData}
                    onMouseLeave={() => setHoveredLineKey(null)}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 12 }}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      tickFormatter={formatHourTick}
                    />
                    <YAxis tick={{ fontSize: 12 }} domain={[0, 200]} />
                    <Tooltip
                      shared
                      content={(props) => (
                        <ProductionChartTooltip {...props} focusKey={hoveredLineKey} />
                      )}
                      cursor={{ stroke: "#94a3b8", strokeDasharray: "4 4" }}
                    />
                    {operatorKeys.map((key) =>
                      visibleMachines[key] ? (
                        <Line
                          key={`${key}-hit`}
                          type="linear"
                          dataKey={key}
                          name={`__hit__${key}`}
                          stroke="transparent"
                          strokeWidth={14}
                          dot={false}
                          activeDot={false}
                          legendType="none"
                          tooltipType="none"
                          isAnimationActive={false}
                          onMouseOver={() => setHoveredLineKey(key)}
                          onMouseOut={() => setHoveredLineKey(null)}
                        />
                      ) : null,
                    )}
                    {operatorKeys.map((key) =>
                      visibleMachines[key] ? (
                        <Line
                          key={key}
                          type="linear"
                          dataKey={key}
                          name={key}
                          stroke={operatorColorByName.get(key)}
                          strokeWidth={hoveredLineKey === key ? 3.5 : 2.25}
                          strokeOpacity={
                            hoveredLineKey && hoveredLineKey !== key ? 0.15 : 1
                          }
                          dot={false}
                          activeDot={{
                            r: 6,
                            strokeWidth: 2,
                            onMouseOver: () => setHoveredLineKey(key),
                            onMouseOut: () => setHoveredLineKey(null),
                          }}
                          onMouseOver={() => setHoveredLineKey(key)}
                          onMouseOut={() => setHoveredLineKey(null)}
                        />
                      ) : null,
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
