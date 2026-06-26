"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { OperatorCard, OperatorRow } from "@/components/operations/operator-card"
import { Trophy, Maximize2, Minimize2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useAuth } from "@/contexts/auth-context"
import {
  getActiveMachineCheckins,
  getBonusProductionConfigForMonth,
  getEmployees,
  getGoals,
  getMachines,
  getProductionEvents,
  type ApiEmployee,
  type ApiGoal,
  type ApiMachine,
  type ApiMachineCheckin,
  type ApiProductionEvent,
} from "@/lib/api"
import { filterFloorMachines } from "@/lib/machine-floor"
import { bonusConfigToGoalDefinitions } from "@/lib/bonus-goals-bridge"
import { DEFAULT_BONUS_PRODUCTION_CONFIG } from "@/lib/bonus-production-config"
import {
  productionShiftFromMeasuredAt,
  resolveOperatorDailyGoalProgress,
  todayDateKeyInTimeZone,
} from "@/lib/tablero-operator-goal"

type RankingRange = "day" | "month" | "semester"

const TABLERO_TIMEZONE = "America/Mexico_City"

type UiOperator = {
  id: number
  initials: string
  name: string
  machine: string
  sku: string
  units: number
  percentage: number
  goalRemaining: number | null
  opCode: string
  machineId: string | null
  machineCode: string
  machineName: string
  unitsPerBox: number | null
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const ini = parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join("")
  return ini || "?"
}

/** Alineado con ingesta PLC/ESP: PROD, PRODUCCION, etc. */
function isProductionIncrementEvent(e: ApiProductionEvent): boolean {
  const payload = e.payload ?? {}
  const rawEvent =
    (payload["EVENT"] as string | undefined) ??
    (payload["event"] as string | undefined) ??
    e.eventType
  const v = String(rawEvent ?? "").trim().toLowerCase()
  if (!v) return false
  if (v === "prod") return true
  if (v.includes("produ")) return true
  return v === "producción" || v === "produccion"
}

function getEventCount(e: ApiProductionEvent): number {
  const payload = e.payload ?? {}
  const raw =
    (payload["COUNT"] as unknown) ??
    (payload["count"] as unknown) ??
    (payload["units"] as unknown)
  const n = typeof raw === "number" ? raw : Number(raw)
  return Number.isFinite(n) ? n : 0
}

/** Mapa código NFC / employee_code → nombre para mostrar en UI (PLC manda códigos). */
function buildEmployeeCodeToNameMap(employees: ApiEmployee[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const emp of employees) {
    const code = emp.employeeCode?.trim()
    const name = emp.fullName?.trim()
    if (code && name) map.set(code.toLowerCase(), name)
  }
  return map
}

function resolveOperatorDisplayName(
  operatorKey: string,
  codeToName: Map<string, string>,
): string {
  const raw = operatorKey.trim()
  if (!raw || raw === "SIN_OPERADOR") return "Sin operador"
  const byCode = codeToName.get(raw.toLowerCase())
  if (byCode) return byCode
  return raw
}

/** Código operador por máquina: prioriza check-in activo, luego configuración de máquina. */
function buildMachineOperatorCodeIndex(
  machines: ApiMachine[],
  checkins: ApiMachineCheckin[],
): {
  operatorByMachineId: Map<string, string>
  machineByCodeLower: Map<string, ApiMachine>
} {
  const machineByCodeLower = new Map<string, ApiMachine>()
  for (const m of machines) {
    const c = m.code?.trim()
    if (c) machineByCodeLower.set(c.toLowerCase(), m)
  }
  const operatorByMachineId = new Map<string, string>()
  for (const ch of checkins) {
    const oc = ch.operatorCode?.trim()
    if (oc) operatorByMachineId.set(ch.machineId, oc)
  }
  for (const m of machines) {
    const oc = m.operatorCode?.trim()
    if (oc && !operatorByMachineId.has(m.id)) operatorByMachineId.set(m.id, oc)
  }
  return { operatorByMachineId, machineByCodeLower }
}

type OperatorResolveSource = "payload" | "machineId" | "machineCode" | "sin"

/** UUID de máquina en el evento (camelCase o snake_case según serialización). */
function getEventMachineId(e: ApiProductionEvent): string | null {
  if (e.machineId?.trim()) return e.machineId.trim()
  const raw = e as unknown as Record<string, unknown>
  const sn = raw["machine_id"]
  if (typeof sn === "string" && sn.trim()) return sn.trim()
  return null
}

function isLikelyUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.trim())
}

function buildMachinesByIdMap(machines: ApiMachine[]): Map<string, ApiMachine> {
  return new Map(machines.map((m) => [m.id, m]))
}

function checkinMatchesEmployeeCode(c: ApiMachineCheckin, codeLower: string): boolean {
  const parts = [
    c.operatorCode,
    c.operator2Code,
    c.packager1Code,
    c.packager2Code,
    c.packager3Code,
    c.packager4Code,
  ]
  return parts.some((p) => p?.trim().toLowerCase() === codeLower)
}

/**
 * machineId de catálogo para el evento (UUID de máquina, código Mxx, o UUID de empleado mal puesto en MACHINE_ID).
 */
function tableroCatalogMachineIdForEvent(
  rawFromPayload: string,
  eventMachineId: string | null,
  byId: Map<string, ApiMachine>,
  byCodeLower: Map<string, ApiMachine>,
  employees: ApiEmployee[],
  checkins: ApiMachineCheckin[],
): string | null {
  const mid = eventMachineId?.trim()
  if (mid && byId.has(mid)) return mid

  const raw = rawFromPayload.trim()
  if (raw && byId.has(raw)) return raw

  if (raw) {
    const m = byCodeLower.get(raw.toLowerCase())
    if (m) return m.id
  }

  if (raw && isLikelyUuid(raw)) {
    const emp = employees.find((e) => e.id === raw)
    const ec = emp?.employeeCode?.trim().toLowerCase()
    if (ec) {
      const ch = checkins.find((c) => checkinMatchesEmployeeCode(c, ec))
      if (ch?.machineId && byId.has(ch.machineId)) return ch.machineId
    }
  }

  return null
}

/** Etiqueta para UI: código de máquina o nombre; no muestra UUIDs crudos si hay catálogo / check-in. */
function tableroResolveMachineLabel(
  rawFromPayload: string,
  eventMachineId: string | null,
  byId: Map<string, ApiMachine>,
  byCodeLower: Map<string, ApiMachine>,
  employees: ApiEmployee[],
  checkins: ApiMachineCheckin[],
): string {
  const tryKey = (key: string): string | null => {
    const t = key.trim()
    if (!t) return null
    const byUuid = byId.get(t)
    if (byUuid) return byUuid.code?.trim() || byUuid.name?.trim() || t
    const byCode = byCodeLower.get(t.toLowerCase())
    if (byCode) return byCode.code?.trim() || byCode.name?.trim() || t
    return null
  }

  const catalogId = tableroCatalogMachineIdForEvent(
    rawFromPayload,
    eventMachineId,
    byId,
    byCodeLower,
    employees,
    checkins,
  )
  if (catalogId) {
    const m = byId.get(catalogId)
    if (m) return m.code?.trim() || m.name?.trim() || m.id
  }

  const fromPayload = tryKey(rawFromPayload)
  if (fromPayload) return fromPayload
  const mid = eventMachineId?.trim()
  if (mid) {
    const fromEvent = tryKey(mid)
    if (fromEvent) return fromEvent
  }

  const tail = rawFromPayload.trim() || eventMachineId?.trim() || ""
  if (tail && !isLikelyUuid(tail)) return tail
  return "—"
}

function tableroResolveSkuFromMachine(
  rawFromPayload: string,
  eventMachineId: string | null,
  byId: Map<string, ApiMachine>,
  byCodeLower: Map<string, ApiMachine>,
  employees: ApiEmployee[],
  checkins: ApiMachineCheckin[],
): string | null {
  const skuFrom = (m: ApiMachine | undefined): string | null => {
    const s = m?.currentSku?.trim()
    return s || null
  }
  const catalogId = tableroCatalogMachineIdForEvent(
    rawFromPayload,
    eventMachineId,
    byId,
    byCodeLower,
    employees,
    checkins,
  )
  if (catalogId) {
    const s = skuFrom(byId.get(catalogId))
    if (s) return s
  }
  return null
}

function pickMoreReadableMachineLabel(prev: string, next: string): string {
  const norm = (s: string) => (s.trim() ? s.trim() : "—")
  const A = norm(prev)
  const B = norm(next)
  const rank = (s: string) => {
    if (s === "—") return 0
    if (isLikelyUuid(s)) return 1
    return 2
  }
  const rA = rank(A)
  const rB = rank(B)
  if (rB > rA) return B
  if (rA > rB) return A
  return A !== "—" ? A : B
}

/**
 * PLC puede enviar OPERATOR_1 u OPERATOR; si falta, inferimos por máquina (UUID o código M-014).
 */
function getOperatorCodeForProductionEvent(
  e: ApiProductionEvent,
  idx: ReturnType<typeof buildMachineOperatorCodeIndex>,
): { code: string; source: OperatorResolveSource } {
  const p = e.payload ?? {}
  const fromPayload =
    String((p["OPERATOR_1"] as string | undefined) ?? "").trim() ||
    String((p["operator_1"] as string | undefined) ?? "").trim() ||
    String((p["OPERATOR"] as string | undefined) ?? "").trim() ||
    String((p["operator"] as string | undefined) ?? "").trim()
  if (fromPayload) return { code: fromPayload, source: "payload" }

  const mid = getEventMachineId(e)
  if (mid) {
    const oc = idx.operatorByMachineId.get(mid)
    if (oc) return { code: oc, source: "machineId" }
  }

  const machineKey = String(
    (p["MACHINE_ID"] as string | undefined) ?? (p["machine"] as string | undefined) ?? "",
  )
    .trim()
    .toLowerCase()
  if (machineKey) {
    const m = idx.machineByCodeLower.get(machineKey)
    if (m) {
      const oc = idx.operatorByMachineId.get(m.id)
      if (oc) return { code: oc, source: "machineCode" }
    }
  }

  return { code: "SIN_OPERADOR", source: "sin" }
}

function isTableroDebugEnabled(): boolean {
  if (typeof window === "undefined") return false
  try {
    return (
      window.localStorage.getItem("TABLERO_DEBUG") === "1" ||
      process.env.NEXT_PUBLIC_TABLERO_DEBUG === "1"
    )
  } catch {
    return process.env.NEXT_PUBLIC_TABLERO_DEBUG === "1"
  }
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
  let utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0))
  let offset = getTimeZoneOffsetMinutes(utcGuess, timeZone)
  let corrected = new Date(utcGuess.getTime() - offset * 60_000)
  offset = getTimeZoneOffsetMinutes(corrected, timeZone)
  corrected = new Date(utcGuess.getTime() - offset * 60_000)
  return corrected
}

function getDayBoundsInTimeZone(now: Date, timeZone: string): { start: Date; end: Date } {
  const p = getPartsInTimeZone(now, timeZone)
  const start = makeZonedDate(p.year, p.month, p.day, 0, 0, timeZone)
  const noon = makeZonedDate(p.year, p.month, p.day, 12, 0, timeZone)
  const tomorrowNoon = new Date(noon.getTime() + 24 * 60 * 60 * 1000)
  const tp = getPartsInTimeZone(tomorrowNoon, timeZone)
  const end = makeZonedDate(tp.year, tp.month, tp.day, 0, 0, timeZone)
  return { start, end }
}

function getMonthBoundsInTimeZone(now: Date, timeZone: string): { start: Date; end: Date } {
  const p = getPartsInTimeZone(now, timeZone)
  const start = makeZonedDate(p.year, p.month, 1, 0, 0, timeZone)
  const midMonth = makeZonedDate(p.year, p.month, 15, 12, 0, timeZone)
  const nextMonthMid = new Date(midMonth.getTime() + 30 * 24 * 60 * 60 * 1000)
  const np = getPartsInTimeZone(nextMonthMid, timeZone)
  const end = makeZonedDate(np.year, np.month, 1, 0, 0, timeZone)
  return { start, end }
}

function getSemesterBoundsInTimeZone(now: Date, timeZone: string): { start: Date; end: Date } {
  const p = getPartsInTimeZone(now, timeZone)
  let year = p.year
  let month = p.month - 5
  while (month < 1) {
    month += 12
    year -= 1
  }
  const start = makeZonedDate(year, month, 1, 0, 0, timeZone)
  const { end } = getMonthBoundsInTimeZone(now, timeZone)
  return { start, end }
}

function getRankingRangeBounds(
  now: Date,
  range: RankingRange,
  timeZone: string,
): { start: Date; end: Date } {
  if (range === "day") return getDayBoundsInTimeZone(now, timeZone)
  if (range === "month") return getMonthBoundsInTimeZone(now, timeZone)
  return getSemesterBoundsInTimeZone(now, timeZone)
}

function formatMinuteKeyInTz(date: Date, timeZone: string): string {
  const p = getPartsInTimeZone(date, timeZone)
  const y = String(p.year)
  const m = String(p.month).padStart(2, "0")
  const d = String(p.day).padStart(2, "0")
  const h = String(p.hour).padStart(2, "0")
  const min = String(p.minute).padStart(2, "0")
  return `${y}-${m}-${d}T${h}:${min}`
}

function buildMachineMaps(machines: ApiMachine[]) {
  const skuById = new Map<string, string>()
  const upbById = new Map<string, number>()
  const byId = new Map<string, ApiMachine>()
  for (const m of machines) {
    byId.set(m.id, m)
    const sku = m.currentSku?.trim()
    if (sku) skuById.set(m.id, sku)
    const upb = m.unitsPerBox
    if (upb != null && Number.isFinite(upb) && upb > 0) upbById.set(m.id, upb)
  }
  return { skuById, upbById, byId }
}

function buildOperatorRankingPerMinute(
  events: ApiProductionEvent[],
  employees: ApiEmployee[],
  machines: ApiMachine[],
  checkins: ApiMachineCheckin[],
  goals: ApiGoal[],
  todayEvents: ApiProductionEvent[],
  goalDefinitions: ReturnType<typeof bonusConfigToGoalDefinitions>,
): UiOperator[] {
  const codeToName = buildEmployeeCodeToNameMap(employees)
  const floorMachines = filterFloorMachines(machines)
  const machineIdx = buildMachineOperatorCodeIndex(floorMachines, checkins)
  const machinesById = buildMachinesByIdMap(floorMachines)
  const { skuById, upbById, byId: machineById } = buildMachineMaps(floorMachines)
  const today = todayDateKeyInTimeZone(TABLERO_TIMEZONE)
  const byOperatorCode = new Map<
    string,
    {
      units: number
      minuteSlots: Set<string>
      machine: string
      sku: string
      machineId: string | null
      machineCode: string
      machineName: string
      unitsPerBox: number | null
    }
  >()

  for (const e of events) {
    if (!isProductionIncrementEvent(e)) continue
    const count = getEventCount(e)
    if (count <= 0) continue

    const payload = e.payload ?? {}
    const { code: opCode } = getOperatorCodeForProductionEvent(e, machineIdx)
    const eventMid = getEventMachineId(e)
    const machineRaw = String(
      (payload["MACHINE_ID"] as string | undefined) ??
        (payload["machine"] as string | undefined) ??
        eventMid ??
        "",
    ).trim()
    const payloadSku = String((payload["SKU"] as string | undefined) ?? "").trim()
    const machine = tableroResolveMachineLabel(
      machineRaw,
      eventMid,
      machinesById,
      machineIdx.machineByCodeLower,
      employees,
      checkins,
    )
    const skuFromPayload = payloadSku || "—"
    const skuFromMachine = tableroResolveSkuFromMachine(
      machineRaw,
      eventMid,
      machinesById,
      machineIdx.machineByCodeLower,
      employees,
      checkins,
    )
    const sku = skuFromPayload !== "—" ? skuFromPayload : skuFromMachine ?? "—"
    const catalogMachineId = tableroCatalogMachineIdForEvent(
      machineRaw,
      eventMid,
      machinesById,
      machineIdx.machineByCodeLower,
      employees,
      checkins,
    )
    const machineEntity = catalogMachineId ? machineById.get(catalogMachineId) : undefined
    const machineCode = machineEntity?.code?.trim() || machine
    const machineName = machineEntity?.name?.trim() || ""
    const unitsPerBox = machineEntity?.unitsPerBox ?? null

    const ts = new Date(e.occurredAt)
    const minuteKey = Number.isNaN(ts.getTime())
      ? ""
      : formatMinuteKeyInTz(ts, TABLERO_TIMEZONE)

    const current = byOperatorCode.get(opCode) ?? {
      units: 0,
      minuteSlots: new Set<string>(),
      machine,
      sku,
      machineId: catalogMachineId,
      machineCode,
      machineName,
      unitsPerBox,
    }
    if (minuteKey) current.minuteSlots.add(minuteKey)
    const nextMachineId = catalogMachineId ?? current.machineId
    const nextMachine = machineById.get(nextMachineId ?? "")
    byOperatorCode.set(opCode, {
      units: current.units + count,
      minuteSlots: current.minuteSlots,
      machine: pickMoreReadableMachineLabel(current.machine, machine),
      sku: current.sku !== "—" ? current.sku : sku,
      machineId: nextMachineId,
      machineCode: nextMachine?.code?.trim() || current.machineCode || machineCode,
      machineName: nextMachine?.name?.trim() || current.machineName || machineName,
      unitsPerBox: nextMachine?.unitsPerBox ?? current.unitsPerBox ?? unitsPerBox,
    })
  }

  const resolveOperatorCode = (e: ApiProductionEvent) =>
    getOperatorCodeForProductionEvent(e, machineIdx).code

  return [...byOperatorCode.entries()]
    .map(([opCode, v]) => {
      const slots = v.minuteSlots.size
      const rate = slots > 0 ? v.units / slots : 0
      const displayName = resolveOperatorDisplayName(opCode, codeToName)
      const shift =
        productionShiftFromMeasuredAt(new Date().toISOString()) ??
        (todayEvents.length > 0
          ? productionShiftFromMeasuredAt(todayEvents[todayEvents.length - 1].occurredAt)
          : null)
      const goalProgress = resolveOperatorDailyGoalProgress(
        goals,
        goalDefinitions,
        todayEvents,
        {
          operatorCode: opCode,
          machineId: v.machineId,
          machineCode: v.machineCode,
          machineName: v.machineName,
          sku: v.sku,
          unitsPerBox: v.unitsPerBox,
          shift,
          today,
        },
        skuById,
        upbById,
        resolveOperatorCode,
      )
      return {
        opCode,
        initials: initialsFromName(displayName),
        name: displayName,
        machine: v.machine,
        sku: v.sku,
        units: Math.round(rate * 100) / 100,
        percentage: goalProgress.percentage,
        goalRemaining: goalProgress.goalRemaining,
        machineId: v.machineId,
        machineCode: v.machineCode,
        machineName: v.machineName,
        unitsPerBox: v.unitsPerBox,
      }
    })
    .sort((a, b) => b.units - a.units)
    .map((row, idx) => ({ ...row, id: idx + 1 }))
}

export default function OperationsBoardPage() {
  const { getAccessToken } = useAuth()
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [rankingRange, setRankingRange] = useState<RankingRange>("day")
  const containerRef = useRef<HTMLDivElement>(null)
  const sinOperadorHintLogged = useRef(false)
  const [operators, setOperators] = useState<UiOperator[]>([])
  const [loading, setLoading] = useState(true)

  const handleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await containerRef.current?.requestFullscreen()
        setIsFullscreen(true)
      } else {
        await document.exitFullscreen()
        setIsFullscreen(false)
      }
    } catch (err) {
      console.error("Error toggling fullscreen:", err)
    }
  }
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const token = await getAccessToken()
        if (!token) {
          if (!cancelled) setOperators([])
          return
        }

        const now = new Date()
        const bounds = getRankingRangeBounds(now, rankingRange, TABLERO_TIMEZONE)
        const dayBounds = getDayBoundsInTimeZone(now, TABLERO_TIMEZONE)
        const limit =
          rankingRange === "semester"
            ? 120_000
            : rankingRange === "month"
              ? 50_000
              : 15_000
        const bonusMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`

        const [events, todayEvents, employees, machines, checkins, goals] = await Promise.all([
          getProductionEvents(token, {
            from: bounds.start.toISOString(),
            to: bounds.end.toISOString(),
            limit,
          }),
          getProductionEvents(token, {
            from: dayBounds.start.toISOString(),
            to: dayBounds.end.toISOString(),
            limit: 15_000,
          }),
          getEmployees(token),
          getMachines(token),
          getActiveMachineCheckins(token),
          getGoals(token),
        ])
        if (cancelled) return

        let goalDefinitions = bonusConfigToGoalDefinitions(DEFAULT_BONUS_PRODUCTION_CONFIG)
        try {
          const cfg = await getBonusProductionConfigForMonth(token, bonusMonth)
          goalDefinitions = bonusConfigToGoalDefinitions(cfg.config)
        } catch {
          // Usa valores por defecto si no hay config de bono del mes.
        }

        const rows = buildOperatorRankingPerMinute(
          events,
          employees,
          machines,
          checkins,
          goals,
          todayEvents,
          goalDefinitions,
        )
        const debug = isTableroDebugEnabled()

        if (
          !debug &&
          !sinOperadorHintLogged.current &&
          rows[0]?.name === "Sin operador"
        ) {
          sinOperadorHintLogged.current = true
          console.info(
            '[TableroOperativo] El #1 sale como "Sin operador". Para ver diagnóstico: localStorage.setItem("TABLERO_DEBUG","1") y recarga (F5).',
          )
        }

        if (debug) {
          console.info("[TableroOperativo] ranking por minuto", {
            range: rankingRange,
            events: events.length,
            top: rows[0] ?? null,
          })
        }

        setOperators(rows)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    const intervalMs = rankingRange === "day" ? 20_000 : 60_000
    const intervalId = window.setInterval(load, intervalMs)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [getAccessToken, rankingRange])

  const sortedOperators = useMemo(
    () => [...operators].sort((a, b) => b.units - a.units),
    [operators],
  )
  const topThree = useMemo(() => sortedOperators.slice(0, 3), [sortedOperators])
  const restOperators = useMemo(() => sortedOperators.slice(3), [sortedOperators])
  const leftColumn = useMemo(() => restOperators.filter((_, i) => i % 2 === 0), [restOperators])
  const rightColumn = useMemo(() => restOperators.filter((_, i) => i % 2 === 1), [restOperators])
  const hasOperators = operators.length > 0
  const rankingRangeLabel =
    rankingRange === "day" ? "Hoy" : rankingRange === "month" ? "Mes actual" : "Semestre"

  return (
    <DashboardLayout 
      breadcrumbs={[
        { label: "Inicio", href: "/" },
        { label: "Tablero Operativo" }
      ]}
    >
      <div ref={containerRef} className={`space-y-3 ${isFullscreen ? 'fixed inset-0 bg-background overflow-auto p-8' : ''}`}>
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            <h1 className="text-xl font-bold text-foreground sm:text-2xl">Tablero Operativo en Vivo</h1>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={handleFullscreen}
            title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </Button>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          <ToggleGroup
            type="single"
            value={rankingRange}
            onValueChange={(v) => {
              if (v === "day" || v === "month" || v === "semester") setRankingRange(v)
            }}
            className="justify-start"
          >
            <ToggleGroupItem value="day">Día</ToggleGroupItem>
            <ToggleGroupItem value="month">Mes</ToggleGroupItem>
            <ToggleGroupItem value="semester">Semestre</ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* Top 3 Podium */}
        {loading ? (
          <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-muted-foreground">
            Cargando tablero…
          </div>
        ) : hasOperators ? (
          <>
            <div className="flex items-end justify-center">
              <div className="grid grid-flow-col auto-cols-max items-end gap-2">
                {topThree[1] && (
                  <div className="translate-y-4">
                    <OperatorCard
                      operator={topThree[1]}
                      rank={2}
                      density="compact"
                      unitsLabel="uds/min"
                      progressTitle="Meta diaria"
                    />
                  </div>
                )}
                {topThree[0] && (
                  <div>
                    <OperatorCard
                      operator={topThree[0]}
                      rank={1}
                      density="compact"
                      unitsLabel="uds/min"
                      progressTitle="Meta diaria"
                    />
                  </div>
                )}
                {topThree[2] && (
                  <div className="translate-y-4">
                    <OperatorCard
                      operator={topThree[2]}
                      rank={3}
                      density="compact"
                      unitsLabel="uds/min"
                      progressTitle="Meta diaria"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Operator Rankings Table */}
            <div className="grid gap-0 lg:grid-cols-2">
              <div className="rounded-xl border border-border bg-card p-3">
                {leftColumn.map((operator, index) => (
                  <OperatorRow
                    key={operator.id}
                    operator={operator}
                    rank={4 + index * 2}
                    density="compact"
                    unitsLabel="uds/min"
                    progressTitle="Relativo"
                  />
                ))}
              </div>
              <div className="rounded-xl border border-border bg-card p-3">
                {rightColumn.map((operator, index) => (
                  <OperatorRow
                    key={operator.id}
                    operator={operator}
                    rank={5 + index * 2}
                    density="compact"
                    unitsLabel="uds/min"
                    progressTitle="Relativo"
                  />
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-muted-foreground">
            Sin datos de operadores.
          </div>
        )}

        {/* Footer info */}
        <div className="text-center text-xs text-muted-foreground">
          {`Actualización automática • Ranking por minuto (${rankingRangeLabel})`}
        </div>
      </div>
    </DashboardLayout>
  )
}
