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
import { countsAsOperatorProduction } from "@/lib/production-goal-events"
import { isFloorOperatorCandidate } from "@/lib/employee-production-role"
import { bonusConfigToGoalDefinitions } from "@/lib/bonus-goals-bridge"
import { DEFAULT_BONUS_PRODUCTION_CONFIG, normalizeBonusProductionConfig } from "@/lib/bonus-production-config"
import {
  productionShiftFromMeasuredAt,
  resolveTableroWindingDailyGoalProgress,
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
  goalTarget: number | null
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

/** Alineado con ingesta MQTT: solo PROD asignado cuenta (no ORPHAN_PROD ni ajustes). */
function isProductionIncrementEvent(e: ApiProductionEvent): boolean {
  return countsAsOperatorProduction(e)
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

function resolveOperatorMachineFromCheckin(
  operatorCode: string,
  checkins: ApiMachineCheckin[],
  machineById: Map<string, ApiMachine>,
): {
  machine: string
  machineId: string | null
  machineCode: string
  machineName: string
  unitsPerBox: number | null
} {
  const codeLower = operatorCode.trim().toLowerCase()
  const ch = checkins.find(
    (c) =>
      c.operatorCode?.trim().toLowerCase() === codeLower ||
      c.operator2Code?.trim().toLowerCase() === codeLower,
  )
  if (!ch?.machineId) {
    return { machine: "Sin asignar", machineId: null, machineCode: "", machineName: "", unitsPerBox: null }
  }
  const m = machineById.get(ch.machineId)
  return {
    machine: m?.code?.trim() || m?.name?.trim() || "—",
    machineId: ch.machineId,
    machineCode: m?.code?.trim() || "",
    machineName: m?.name?.trim() || "",
    unitsPerBox: m?.unitsPerBox ?? null,
  }
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

function buildOperatorRanking(
  events: ApiProductionEvent[],
  employees: ApiEmployee[],
  machines: ApiMachine[],
  checkins: ApiMachineCheckin[],
  goals: ApiGoal[],
  todayEvents: ApiProductionEvent[],
  goalDefinitions: ReturnType<typeof bonusConfigToGoalDefinitions>,
  rankingRange: RankingRange,
): UiOperator[] {
  const codeToName = buildEmployeeCodeToNameMap(employees)
  const floorMachines = filterFloorMachines(machines)
  const machineIdx = buildMachineOperatorCodeIndex(floorMachines, checkins)
  const machinesById = buildMachinesByIdMap(floorMachines)
  const { skuById, upbById } = buildMachineMaps(floorMachines)
  const today = todayDateKeyInTimeZone(TABLERO_TIMEZONE)
  const shift =
    productionShiftFromMeasuredAt(new Date().toISOString()) ??
    (todayEvents.length > 0
      ? productionShiftFromMeasuredAt(todayEvents[todayEvents.length - 1].occurredAt)
      : null)

  const productionByCode = new Map<
    string,
    {
      units: number
      machine: string
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
    if (!opCode.trim() || opCode === "SIN_OPERADOR") continue

    const eventMid = getEventMachineId(e)
    const machineRaw = String(
      (payload["MACHINE_ID"] as string | undefined) ??
        (payload["machine"] as string | undefined) ??
        eventMid ??
        "",
    ).trim()
    const machine = tableroResolveMachineLabel(
      machineRaw,
      eventMid,
      machinesById,
      machineIdx.machineByCodeLower,
      employees,
      checkins,
    )
    const catalogMachineId = tableroCatalogMachineIdForEvent(
      machineRaw,
      eventMid,
      machinesById,
      machineIdx.machineByCodeLower,
      employees,
      checkins,
    )
    const machineEntity = catalogMachineId ? machinesById.get(catalogMachineId) : undefined
    const machineCode = machineEntity?.code?.trim() || machine
    const machineName = machineEntity?.name?.trim() || ""
    const unitsPerBox = machineEntity?.unitsPerBox ?? null

    const current = productionByCode.get(opCode) ?? {
      units: 0,
      machine,
      machineId: catalogMachineId,
      machineCode,
      machineName,
      unitsPerBox,
    }
    const nextMachineId = catalogMachineId ?? current.machineId
    const nextMachine = machinesById.get(nextMachineId ?? "")
    productionByCode.set(opCode, {
      units: current.units + count,
      machine: pickMoreReadableMachineLabel(current.machine, machine),
      machineId: nextMachineId,
      machineCode: nextMachine?.code?.trim() || current.machineCode || machineCode,
      machineName: nextMachine?.name?.trim() || current.machineName || machineName,
      unitsPerBox: nextMachine?.unitsPerBox ?? current.unitsPerBox ?? unitsPerBox,
    })
  }

  const operatorCodes = new Set<string>()
  for (const emp of employees) {
    if (!isFloorOperatorCandidate(emp)) continue
    const code = emp.employeeCode?.trim()
    if (code) operatorCodes.add(code)
  }
  for (const code of productionByCode.keys()) {
    operatorCodes.add(code)
  }

  const resolveOperatorCode = (e: ApiProductionEvent) =>
    getOperatorCodeForProductionEvent(e, machineIdx).code

  const rows: Omit<UiOperator, "id">[] = []
  for (const opCode of operatorCodes) {
    const prod = productionByCode.get(opCode)
    const fromCheckin = resolveOperatorMachineFromCheckin(opCode, checkins, machinesById)
    const displayName = resolveOperatorDisplayName(opCode, codeToName)
    const machine = prod?.machine && prod.machine !== "—" ? prod.machine : fromCheckin.machine
    const machineId = prod?.machineId ?? fromCheckin.machineId
    const machineCode = prod?.machineCode || fromCheckin.machineCode
    const machineName = prod?.machineName || fromCheckin.machineName
    const unitsPerBox = prod?.unitsPerBox ?? fromCheckin.unitsPerBox

    const goalProgress =
      rankingRange === "day"
        ? resolveTableroWindingDailyGoalProgress(
            goals,
            goalDefinitions,
            todayEvents,
            opCode,
            shift,
            today,
            skuById,
            upbById,
            resolveOperatorCode,
          )
        : { percentage: 0, goalRemaining: null, goalTarget: null }

    rows.push({
      opCode,
      initials: initialsFromName(displayName),
      name: displayName,
      machine,
      sku: "",
      units: Math.round(prod?.units ?? 0),
      percentage: goalProgress.percentage,
      goalRemaining: goalProgress.goalRemaining,
      goalTarget: goalProgress.goalTarget,
      machineId,
      machineCode,
      machineName,
      unitsPerBox,
    })
  }

  return rows
    .sort((a, b) => {
      if (b.units !== a.units) return b.units - a.units
      return a.name.localeCompare(b.name, "es")
    })
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
  const [dailyGoalTarget, setDailyGoalTarget] = useState<number | null>(null)
  const [currentShiftLabel, setCurrentShiftLabel] = useState<string | null>(null)

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
          goalDefinitions = bonusConfigToGoalDefinitions(normalizeBonusProductionConfig(cfg.config))
        } catch {
          // Usa valores por defecto si no hay config de bono del mes.
        }

        const rows = buildOperatorRanking(
          events,
          employees,
          machines,
          checkins,
          goals,
          todayEvents,
          goalDefinitions,
          rankingRange,
        )
        const shiftNow = productionShiftFromMeasuredAt(new Date().toISOString())
        const windingKey =
          shiftNow === "matutino"
            ? "winding-t1-daily"
            : shiftNow === "vespertino"
              ? "winding-t2-daily"
              : null
        const windingDef = windingKey
          ? goalDefinitions.find((d) => d.sourceKey === windingKey)
          : null
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
          console.info("[TableroOperativo] ranking por unidades totales", {
            range: rankingRange,
            events: events.length,
            top: rows[0] ?? null,
          })
        }

        setOperators(rows)
        setDailyGoalTarget(windingDef?.targetValue ?? rows.find((r) => r.goalTarget)?.goalTarget ?? null)
        setCurrentShiftLabel(
          shiftNow === "matutino" ? "Turno 1" : shiftNow === "vespertino" ? "Turno 2" : null,
        )
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
    () => [...operators].sort((a, b) => b.units - a.units || a.name.localeCompare(b.name, "es")),
    [operators],
  )
  const topThree = useMemo(() => sortedOperators.slice(0, 3), [sortedOperators])
  const restOperators = useMemo(() => sortedOperators.slice(3), [sortedOperators])
  const hasOperators = operators.length > 0
  const rankingRangeLabel =
    rankingRange === "day" ? "Hoy" : rankingRange === "month" ? "Mes actual" : "Semestre"
  const unitsLabel = rankingRange === "day" ? "piezas hoy" : "unidades totales"
  const progressTitle = rankingRange === "day" ? "Meta diaria" : "Avance relativo"

  return (
    <DashboardLayout 
      breadcrumbs={[
        { label: "Inicio", href: "/" },
        { label: "Tablero Operativo" }
      ]}
    >
      <div ref={containerRef} className={`space-y-4 ${isFullscreen ? "fixed inset-0 z-50 overflow-auto bg-background p-6 sm:p-8" : ""}`}>
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 shrink-0 text-yellow-500" />
            <div>
              <h1 className="text-xl font-bold text-foreground sm:text-2xl">Tablero Operativo en Vivo</h1>
              {!loading && hasOperators && (
                <p className="text-xs text-muted-foreground sm:text-sm">
                  {operators.length} operador{operators.length === 1 ? "" : "es"}
                  {currentShiftLabel ? ` · ${currentShiftLabel}` : ""}
                  {dailyGoalTarget != null && rankingRange === "day"
                    ? ` · Meta Winding: ${dailyGoalTarget.toLocaleString("es-MX")} piezas`
                    : ""}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
        </div>

        {/* Top 3 Podium */}
        {loading ? (
          <div className="flex min-h-[240px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-muted-foreground">
            Cargando tablero…
          </div>
        ) : hasOperators ? (
          <>
            {topThree.length > 0 && (
              <div className="flex items-end justify-center gap-3 px-2">
                {topThree[1] && (
                  <div className="w-full max-w-[240px] translate-y-3 sm:max-w-[280px]">
                    <OperatorCard
                      operator={topThree[1]}
                      rank={2}
                      density="compact"
                      unitsLabel={unitsLabel}
                      progressTitle={progressTitle}
                      showSku={false}
                      showGoalTarget={rankingRange === "day"}
                    />
                  </div>
                )}
                {topThree[0] && (
                  <div className="w-full max-w-[260px] sm:max-w-[300px]">
                    <OperatorCard
                      operator={topThree[0]}
                      rank={1}
                      density="compact"
                      unitsLabel={unitsLabel}
                      progressTitle={progressTitle}
                      showSku={false}
                      showGoalTarget={rankingRange === "day"}
                    />
                  </div>
                )}
                {topThree[2] && (
                  <div className="w-full max-w-[240px] translate-y-3 sm:max-w-[280px]">
                    <OperatorCard
                      operator={topThree[2]}
                      rank={3}
                      density="compact"
                      unitsLabel={unitsLabel}
                      progressTitle={progressTitle}
                      showSku={false}
                      showGoalTarget={rankingRange === "day"}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Resto de operadores */}
            {restOperators.length > 0 && (
              <div className="rounded-xl border border-border bg-card">
                <div className="hidden border-b border-border px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:grid sm:grid-cols-[2rem_2.25rem_minmax(0,1fr)_5rem_minmax(7rem,10rem)] sm:items-center sm:gap-3">
                  <span>#</span>
                  <span />
                  <span>Operador / máquina</span>
                  <span className="text-right">Producción</span>
                  <span>Meta diaria</span>
                </div>
                <div className="divide-y divide-border/60 p-1 sm:p-2">
                  {restOperators.map((operator, index) => (
                    <OperatorRow
                      key={operator.opCode}
                      operator={operator}
                      rank={4 + index}
                      density="compact"
                      unitsLabel={unitsLabel}
                      progressTitle={progressTitle}
                      showSku={false}
                      showGoalTarget={rankingRange === "day"}
                    />
                  ))}
                </div>
              </div>
            )}

            {restOperators.length === 0 && topThree.length > 0 && topThree.length < 4 && (
              <p className="text-center text-sm text-muted-foreground">
                Todos los operadores activos están en el podio.
              </p>
            )}
          </>
        ) : (
          <div className="flex min-h-[240px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-muted-foreground">
            No hay operadores activos registrados.
          </div>
        )}

        {/* Footer info */}
        <div className="text-center text-xs text-muted-foreground">
          {`Actualización automática • Ranking por producción (${rankingRangeLabel})`}
          {rankingRange === "day" ? " • Meta única Winding desde reglas de negocio" : ""}
        </div>
      </div>
    </DashboardLayout>
  )
}
