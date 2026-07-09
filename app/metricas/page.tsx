"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { AttendanceTable } from "@/components/attendance/attendance-table"
import { AttendanceStatsCards } from "@/components/attendance/attendance-stats-cards"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  CheckCircle,
  Clock,
  Package,
  AlertTriangle,
  Users,
  RefreshCw,
  MoreVertical,
  Download,
  FileSpreadsheet,
  UserCheck,
  UserMinus,
  UserPlus,
  CalendarDays,
  Target,
  Palmtree,
  Wrench,
  Timer,
  Percent,
} from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  PieChart,
  Pie,
  Cell,
} from "recharts"
import { cn } from "@/lib/utils"
import { MonthPicker } from "@/components/ui/month-picker"
import { Alert, AlertDescription } from "@/components/ui/alert"
import type { AttendanceRecord } from "@/lib/types"
import { useAuth } from "@/contexts/auth-context"
import { RequireModule } from "@/components/auth/require-module"
import { visibleMetricasTabs } from "@/lib/permissions"
import {
  getEmployees,
  getMachines,
  getMachineCheckins,
  getManualDataCaptures,
  getEmployeeDayRecords,
  getEmployeeRoleEvents,
  getBonusProductionConfigForMonth,
  getResolvedHolidaysForMonth,
  getProductionEvents,
  getGoals,
  getAlerts,
  getMaintenanceSessions,
  type ApiGoal,
  type ApiMaintenanceSession,
  type ApiEmployee,
  type ApiMachine,
  type ApiMachineCheckin,
  type ApiProductionEvent,
  type ApiEmployeeDayRecord,
  type ApiAlert,
} from "@/lib/api"
import { filterFloorMachines } from "@/lib/machine-floor"
import { aggregateEmployeeVacationDays } from "@/lib/employee-vacation-days"
import { mergeAttendanceWithDayRecords } from "@/lib/attendance-day-records"
import {
  computeMonthlyTurnover,
  formatTurnoverPercent,
} from "@/lib/employee-turnover"
import {
  buildProductionShiftReportBlob,
  productionShiftReportFilename,
  type ProductionShiftManualCapture,
  type ProductionShiftReportSourceRow,
} from "@/lib/production-shift-report-excel"
import {
  buildBonusAccumulatedReportBlob,
  bonusAccumulatedReportFilename,
  type BonusEmployeeDayRecord,
  type BonusManualCapture,
} from "@/lib/bonus-accumulated-report-excel"
import type {
  BonusEmployeePrimaryRole,
  BonusEmployeeRoleEvent,
} from "@/lib/bonus-role-context"
import {
  buildAnnualAccumulatedReportBlob,
  annualAccumulatedReportFilename,
} from "@/lib/annual-accumulated-report-excel"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  EMPLOYEE_PRODUCTION_ROLE_LABELS,
  resolveEmployeeProductionRole,
} from "@/lib/employee-production-role"
import { productionShiftFromMeasuredAt } from "@/lib/tablero-operator-goal"
import {
  computeActualByGoalId,
  summarizeMonthlyGoalProgress,
} from "@/lib/goal-actual-progress"
import { buildGoalsForProgressTracking } from "@/lib/bonus-goals-bridge"
import {
  buildMaintenanceAnalytics,
  formatMaintenanceDuration,
  MAINTENANCE_VISIT_TYPE_LABELS,
} from "@/lib/maintenance-metrics"
import {
  buildDailyInactivitySeries,
  buildMachineActivitySummary,
  formatDurationMinutes,
} from "@/lib/machine-activity-analytics"
import { buildAlertRoleCounts } from "@/lib/alert-role-metrics"
import {
  buildShiftIncidentsAnalytics,
  type ShiftIncidentRow,
  type ShiftIncidentsAnalytics,
} from "@/lib/shift-incidents-analytics"
import type { BonusProductionConfigData } from "@/lib/bonus-production-config"
import { DEFAULT_BONUS_PRODUCTION_CONFIG, normalizeBonusProductionConfig } from "@/lib/bonus-production-config"

type ProductionEventType =
  | "Producción"
  | "Cambio SKU"
  | "Parada"

type ShiftType = "matutino" | "vespertino"
type ShiftFilter = "all" | ShiftType

const EMPTY_SHIFT_INCIDENTS: ShiftIncidentsAnalytics = {
  incidents: [],
  summary: {
    overtimeCount: 0,
    earlyLeaveCount: 0,
    postCleaningCount: 0,
    cleaningProductionCount: 0,
    total: 0,
  },
  scheduleNotes: [],
}

const EMPTY_PRODUCTION_ANALYTICS = {
  produced14d: 0,
  changeovers14d: 0,
  changeoversPer1k: 0,
  dailySeries: [] as { date: string; produced: number; downtime: number }[],
  topOperators: [] as { name: string; units: number; downtime: number }[],
  operatorDistributionPie: [] as { name: string; units: number; downtime: number }[],
  topPackers: [] as { name: string; units: number; jobs: number }[],
  topSkus: [] as { sku: string; units: number }[],
  skuDistribution: [] as { sku: string; units: number }[],
  personRoleComparison: [] as {
    name: string
    units: number
    operatorUnits: number
    packerUnits: number
    role: string
    sharePct: number
  }[],
  machineScatter: [] as { machine: string; produced: number; downtimeEvents: number }[],
}

function matchesShiftFilter(ts: string | Date, filter: ShiftFilter): boolean {
  if (filter === "all") return true
  const iso = typeof ts === "string" ? ts : ts.toISOString()
  return productionShiftFromMeasuredAt(iso) === filter
}

function dayRecordMatchesShiftFilter(
  shift: string | null | undefined,
  filter: ShiftFilter,
): boolean {
  if (filter === "all") return true
  const s = (shift ?? "").trim().toLowerCase()
  if (!s) return filter === "matutino"
  return s === filter
}

interface ProductionBaseRow {
  machine_id: string
  /** UUID de máquina en API (para enriquecer empacadores desde check-in). */
  machineIdRaw: string | null
  timestamp: string // ISO
  /** Tipo crudo del PLC / API (PROD, ALERT_15, …). */
  eventRaw: string
  operator: string
  operator_2: string
  packer_1: string
  packer_2: string
  unitsPerBox: number
  /** Nombres únicos de empacadores atribuidos al evento (payload + fallback check-in). */
  packersAttributed: string[]
  parameter_1: number
  parameter_2: number
  count: number
  event: ProductionEventType
  sku: string
}

type PersonProductionAgg = {
  operatorUnits: number
  packerUnits: number
}

function buildEmployeeNameToRoleLabelMap(employees: ApiEmployee[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const emp of employees) {
    const name = emp.fullName?.trim()
    if (!name) continue
    const role = resolveEmployeeProductionRole(emp.primaryRole)
    if (role) map.set(name, EMPLOYEE_PRODUCTION_ROLE_LABELS[role])
  }
  return map
}

function resolvePersonRoleLabel(
  name: string,
  agg: PersonProductionAgg,
  nameToRole: Map<string, string>,
): string {
  const fromMaster = nameToRole.get(name)
  if (fromMaster) return fromMaster
  const hasOp = agg.operatorUnits > 0
  const hasPack = agg.packerUnits > 0
  if (hasOp && hasPack) return "Operador + Empacador"
  if (hasPack) return "Empacador"
  if (hasOp) return "Operador"
  return "—"
}

const PERSON_ROLE_CHART_COLORS: Record<string, string> = {
  Operador: "#22c55e",
  Empacador: "#3b82f6",
  "Operador bending": "#a855f7",
  "Operador roller": "#f97316",
  Mantenimiento: "#64748b",
  "Operador + Empacador": "#14b8a6",
}

function personRoleBarColor(role: string): string {
  return PERSON_ROLE_CHART_COLORS[role] ?? "#6366f1"
}

function buildEmployeeCodeToNameMap(employees: ApiEmployee[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const emp of employees) {
    const code = emp.employeeCode?.trim()
    if (!code) continue
    map.set(code, emp.fullName)
    map.set(code.toLowerCase(), emp.fullName)
  }
  return map
}

/** PLC ingest persiste claves en minúsculas; el seed/demo usa mayúsculas estilo ESP. */
function payloadString(payload: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = payload[k]
    if (v == null) continue
    const s = String(v).trim()
    if (s) return s
  }
  return undefined
}

function nthStringFromArray(
  payload: Record<string, unknown>,
  key: string,
  index: number,
): string | undefined {
  const raw = payload[key]
  if (!Array.isArray(raw) || raw.length <= index) return undefined
  const el = raw[index]
  if (typeof el !== "string") return undefined
  const s = el.trim()
  return s || undefined
}

/** Igual que nthStringFromArray pero acepta números u otros tipos en el array (PLC a veces manda así). */
function nthStringFromArrayLoose(
  payload: Record<string, unknown>,
  key: string,
  index: number,
): string | undefined {
  const raw = payload[key]
  if (!Array.isArray(raw) || raw.length <= index) return undefined
  const el = raw[index]
  const s = typeof el === "string" ? el.trim() : String(el ?? "").trim()
  if (!s || s.toLowerCase() === "null" || s === "undefined") return undefined
  return s
}

function isMetricasDebugEnabled(): boolean {
  if (typeof window === "undefined") return false
  try {
    return (
      window.localStorage.getItem("METRICAS_DEBUG") === "1" ||
      process.env.NEXT_PUBLIC_METRICAS_DEBUG === "1"
    )
  } catch {
    return process.env.NEXT_PUBLIC_METRICAS_DEBUG === "1"
  }
}

/** Índice check-ins por máquina (evita O(eventos × check-ins) al mapear producción). */
function buildCheckinsByMachineId(
  checkins: ApiMachineCheckin[],
): Map<string, ApiMachineCheckin[]> {
  const map = new Map<string, ApiMachineCheckin[]>()
  for (const ch of checkins) {
    const id = ch.machineId?.trim()
    if (!id) continue
    const list = map.get(id)
    if (list) list.push(ch)
    else map.set(id, [ch])
  }
  for (const list of map.values()) {
    list.sort((a, b) => new Date(b.checkedInAt).getTime() - new Date(a.checkedInAt).getTime())
  }
  return map
}

/** Check-in NFC más plausible para una máquina y un instante (ventana o activo). */
function findBestCheckinForMachineAndTime(
  machineId: string | null | undefined,
  occurredAtMs: number,
  checkinsByMachine: Map<string, ApiMachineCheckin[]>,
): ApiMachineCheckin | null {
  const id = machineId?.trim()
  if (!id) return null
  const byMachine = checkinsByMachine.get(id) ?? []
  const inWindow = (ch: ApiMachineCheckin) => {
    const start = new Date(ch.checkedInAt).getTime()
    const end = ch.checkedOutAt ? new Date(ch.checkedOutAt).getTime() : Number.POSITIVE_INFINITY
    return occurredAtMs >= start && occurredAtMs <= end
  }
  return byMachine.find(inWindow) ?? byMachine.find((c) => c.isActive) ?? null
}

/** Nombre a mostrar del operador principal si el evento no trae OPERATOR_1 / OPERATOR en payload. */
function primaryOperatorLabelFromCheckin(
  machineId: string | null | undefined,
  occurredAtMs: number,
  checkinsByMachine: Map<string, ApiMachineCheckin[]>,
  resolvePerson: (raw: string | undefined) => string,
): string | null {
  const ch = findBestCheckinForMachineAndTime(machineId, occurredAtMs, checkinsByMachine)
  if (!ch) return null
  const oc = ch.operatorCode?.trim()
  if (!oc) return null
  const label = resolvePerson(oc)
  return label && label !== "—" ? label : null
}

function dedupeTrimmedPreserveOrder(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of values) {
    const t = v.trim()
    if (!t) continue
    const k = t.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(t)
  }
  return out
}

/** Códigos empacador en payload (PLC/seed o ingesta normalizada con `packagers[]`). */
function collectPackerCodesFromPayload(payload: Record<string, unknown>): string[] {
  const fromExplicit = [
    payloadString(payload, "PACKAGER_1", "packager_1", "PACKAGER1", "packager1"),
    payloadString(payload, "PACKAGER_2", "packager_2", "PACKAGER2", "packager2"),
    payloadString(payload, "PACKAGER_3", "packager_3", "PACKAGER3", "packager3"),
    payloadString(payload, "PACKAGER_4", "packager_4", "PACKAGER4", "packager4"),
  ].filter((x): x is string => Boolean(x?.trim()))
  if (fromExplicit.length > 0) return dedupeTrimmedPreserveOrder(fromExplicit)

  const raw = payload["packagers"]
  if (!Array.isArray(raw)) return []
  const fromArr: string[] = []
  for (const el of raw) {
    const s = typeof el === "string" ? el.trim() : String(el ?? "").trim()
    if (s && s.toLowerCase() !== "null" && s !== "undefined") fromArr.push(s)
  }
  return dedupeTrimmedPreserveOrder(fromArr)
}

function packerDisplayNamesFromCheckin(
  machineId: string | null | undefined,
  occurredAtMs: number,
  checkinsByMachine: Map<string, ApiMachineCheckin[]>,
  resolvePerson: (raw: string | undefined) => string,
): string[] {
  const ch = findBestCheckinForMachineAndTime(machineId, occurredAtMs, checkinsByMachine)
  if (!ch) return []

  const raw = [ch.packager1Code, ch.packager2Code, ch.packager3Code, ch.packager4Code]
  const names = raw
    .map((x) => resolvePerson(x == null ? undefined : x))
    .filter((p): p is string => Boolean(p && p !== "—"))
  return dedupeTrimmedPreserveOrder(names)
}

/** Mensaje típico del backend: `SKU: SKU-001, count: 12`. */
function skuFromMessage(message: string | null | undefined): string | undefined {
  if (!message?.trim()) return undefined
  const m = message.match(/SKU\s*:\s*([^,]+)/i)
  const raw = m?.[1]?.trim()
  return raw || undefined
}

function mapEventsToProductionBaseRows(
  events: ApiProductionEvent[],
  checkins: ApiMachineCheckin[],
  employees: ApiEmployee[],
  apiMachines: ApiMachine[],
): ProductionBaseRow[] {
  const machineLabelById = new Map<string, string>()
  const machineSkuById = new Map<string, string>()
  const machineUpbById = new Map<string, number>()
  for (const m of filterFloorMachines(apiMachines)) {
    if (!m.id) continue
    const label = (m.code ?? m.name ?? "").trim() || "—"
    machineLabelById.set(m.id, label)
    const curSku = m.currentSku?.trim()
    if (curSku) machineSkuById.set(m.id, curSku)
    const upb = m.unitsPerBox
    if (upb != null && Number.isFinite(upb) && upb > 0) machineUpbById.set(m.id, upb)
  }

  const codeToName = buildEmployeeCodeToNameMap(employees)
  const resolvePerson = (raw: string | undefined) => {
    const code = String(raw ?? "").trim()
    if (!code || code === "—") return "—"
    return codeToName.get(code) ?? codeToName.get(code.toLowerCase()) ?? code
  }

  const checkinsByMachine = buildCheckinsByMachineId(checkins)

  return events
    .filter((e) => !(e.payload as Record<string, unknown>)?.excludedMaintenance)
    .filter((e) => (e.eventType ?? "").toUpperCase() !== "ORPHAN_PROD")
    .filter((e) => {
      const attr = (e.payload as Record<string, unknown>)?.attributedFrom
      return attr !== "orphan" && attr !== "packager_orphan"
    })
    .map((e: ApiProductionEvent) => {
    const payload = e.payload ?? {}
    const eventRaw = String(payloadString(payload, "EVENT", "event") ?? e.eventType ?? "")
    const eventTypeUp = eventRaw.trim().toUpperCase()
    const lower = eventRaw.toLowerCase()
    const event: ProductionEventType =
      eventTypeUp === "PROD" ||
      eventTypeUp === "BOOT" ||
      eventRaw === "Producción"
        ? "Producción"
        : eventTypeUp === "SKU_CHANGE" ||
            eventRaw === "Cambio SKU" ||
            lower.includes("cambio") ||
            lower.includes("sku")
          ? "Cambio SKU"
          : eventTypeUp === "ALERT_15" ||
              eventTypeUp === "ALERT_45" ||
              eventTypeUp === "ALERT_NO_CHECKIN" ||
              eventTypeUp === "STOP" ||
              eventRaw === "Parada" ||
              lower.includes("paro") ||
              lower.includes("down") ||
              lower.includes("alert")
            ? "Parada"
            : lower === "prod" || lower.includes("produ")
              ? "Producción"
              : "Producción"

    const countRaw =
      (payload["COUNT"] as unknown) ??
      (payload["count"] as unknown) ??
      (payload["units"] as unknown)
    const count = typeof countRaw === "number" ? countRaw : Number(countRaw)

    const ts = String(
      payloadString(payload, "TIMESTAMP", "timestamp") ?? e.occurredAt ?? new Date().toISOString(),
    )

    const mid = e.machineId?.trim()
    const fromPayload = payloadString(payload, "MACHINE_ID", "machine_id") ?? ""
    const machine_id = (mid && machineLabelById.get(mid)) || fromPayload || mid || "—"

    const operatorCodeRaw =
      payloadString(payload, "OPERATOR_1", "operator_1", "OPERATOR", "operator") ??
      nthStringFromArray(payload, "operators", 0) ??
      nthStringFromArrayLoose(payload, "operators", 0)

    let operatorLabel = resolvePerson(operatorCodeRaw)
    if (operatorLabel === "—" && e.machineId?.trim()) {
      const fromChk = primaryOperatorLabelFromCheckin(
        e.machineId,
        new Date(ts).getTime(),
        checkinsByMachine,
        resolvePerson,
      )
      if (fromChk) operatorLabel = fromChk
    }

    const operator2CodeRaw =
      payloadString(payload, "OPERATOR_2", "operator_2") ??
      nthStringFromArray(payload, "operators", 1) ??
      nthStringFromArrayLoose(payload, "operators", 1)
    let operator2Label = resolvePerson(operator2CodeRaw)
    if (operator2Label === "—" && e.machineId?.trim()) {
      const ch = findBestCheckinForMachineAndTime(e.machineId, new Date(ts).getTime(), checkinsByMachine)
      const oc2 = ch?.operator2Code?.trim()
      if (oc2) operator2Label = resolvePerson(oc2)
    }

    const upbRaw =
      (payload["units_per_box"] as unknown) ??
      (payload["unitsPerBox"] as unknown) ??
      (mid ? machineUpbById.get(mid) : undefined)
    const unitsPerBox =
      typeof upbRaw === "number" && Number.isFinite(upbRaw) && upbRaw > 0
        ? upbRaw
        : Number(upbRaw) > 0
          ? Number(upbRaw)
          : mid
            ? (machineUpbById.get(mid) ?? 48)
            : 48

    const skuResolved =
      payloadString(
        payload,
        "SKU",
        "sku",
        "PRODUCT",
        "product",
        "PRODUCT_CODE",
        "product_code",
      ) ??
      (mid ? machineSkuById.get(mid) : undefined) ??
      skuFromMessage(e.message)

    const rawPackerCodes = collectPackerCodesFromPayload(payload)
    let packersAttributed = dedupeTrimmedPreserveOrder(
      rawPackerCodes.map((c) => resolvePerson(c)).filter((p) => p && p !== "—"),
    )
    if (packersAttributed.length === 0 && e.machineId?.trim()) {
      packersAttributed = packerDisplayNamesFromCheckin(
        e.machineId,
        new Date(ts).getTime(),
        checkinsByMachine,
        resolvePerson,
      )
    }
    const packer_1 = packersAttributed[0] ?? "—"
    const packer_2 = packersAttributed[1] ?? "—"

    return {
      machine_id,
      machineIdRaw: e.machineId?.trim() ?? null,
      timestamp: ts,
      eventRaw,
      operator: operatorLabel,
      operator_2: operator2Label,
      unitsPerBox,
      packer_1,
      packer_2,
      packersAttributed,
      parameter_1: Number((payload["PARAMETER_1"] as unknown) ?? 0) || 0,
      parameter_2: Number((payload["PARAMETER_2"] as unknown) ?? 0) || 0,
      count: Number.isFinite(count) ? count : 0,
      event,
      sku: skuResolved ?? "—",
    }
  })
}

/** Asistencia proxy: una fila por persona asignada en el check-in NFC (entrada/salida de máquina). */
function machineCheckinsToAttendanceRecords(
  checkins: ApiMachineCheckin[],
  employees: ApiEmployee[],
): AttendanceRecord[] {
  const codeToName = buildEmployeeCodeToNameMap(employees)
  const resolveName = (code: string) =>
    codeToName.get(code) ?? codeToName.get(code.toLowerCase()) ?? code
  const employeeIdByCode = new Map<string, string>()
  for (const e of employees) {
    const c = e.employeeCode?.trim()
    if (!c) continue
    employeeIdByCode.set(c, e.id)
    employeeIdByCode.set(c.toLowerCase(), e.id)
  }
  const timeFmt = new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })

  const out: AttendanceRecord[] = []
  for (const c of checkins) {
    const checkedIn = new Date(c.checkedInAt)
    const checkedOut = c.checkedOutAt ? new Date(c.checkedOutAt) : null
    const dayDate = new Date(checkedIn.getFullYear(), checkedIn.getMonth(), checkedIn.getDate())

    const slots: { code: string; role: string }[] = []
    const op1 = c.operatorCode?.trim()
    if (op1) slots.push({ code: op1, role: "Operador" })
    if (c.operator2Code?.trim()) slots.push({ code: c.operator2Code.trim(), role: "Operador 2" })
    const pk = [c.packager1Code, c.packager2Code, c.packager3Code, c.packager4Code]
    pk.forEach((code, idx) => {
      const t = code?.trim()
      if (t) slots.push({ code: t, role: `Empacador ${idx + 1}` })
    })

    for (const slot of slots) {
      const empId =
        employeeIdByCode.get(slot.code) ??
        employeeIdByCode.get(slot.code.toLowerCase()) ??
        `chk-${c.id}-${slot.code}`
      let hoursWorked: number | undefined
      if (checkedOut) {
        const ms = checkedOut.getTime() - checkedIn.getTime()
        if (ms > 0) hoursWorked = Math.round((ms / 3_600_000) * 10) / 10
      }
      const activeNote = c.isActive && !c.checkedOutAt ? " · check-in activo" : ""
      out.push({
        id: `${c.id}-${slot.role}-${slot.code}`,
        employeeId: empId,
        employeeName: resolveName(slot.code),
        date: dayDate,
        checkInTime: timeFmt.format(checkedIn),
        checkOutTime: checkedOut ? timeFmt.format(checkedOut) : undefined,
        status: "Asistente",
        hoursWorked,
        notes: `${c.machineCode} · ${slot.role}${activeNote}`,
      })
    }
  }
  return out.sort((a, b) => {
    const d = b.date.getTime() - a.date.getTime()
    if (d !== 0) return d
    return (b.checkInTime || "").localeCompare(a.checkInTime || "")
  })
}

type PersonnelMovementItem = {
  id: string
  kind: "ingreso" | "salida"
  employeeName: string
  subtitle: string
  at: number
}

/**
 * Movimientos para pestaña Rotación: altas (ingreso = nuevo empleado) y bajas (salida =
 * empleado dado de baja). NO usa check-ins de máquina; la rotación de plantilla se basa en
 * la fecha de ingreso (`hiredAt`/`createdAt`) y la baja (`status = terminated`, fecha `updatedAt`).
 */
function buildPersonnelMovementsFromEmployees(
  employees: ApiEmployee[],
): PersonnelMovementItem[] {
  const roleLabel = (e: ApiEmployee) => {
    const role = resolveEmployeeProductionRole(e.primaryRole)
    return role ? EMPLOYEE_PRODUCTION_ROLE_LABELS[role] : "Colaborador"
  }
  const parseYmd = (raw: string | null | undefined): Date | null => {
    const t = raw?.trim().slice(0, 10)
    if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(t)) return null
    const d = new Date(`${t}T00:00:00`)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const fmtShort = (d: Date) =>
    d.toLocaleDateString("es-MX", { year: "numeric", month: "short", day: "2-digit" })

  const out: PersonnelMovementItem[] = []
  for (const e of employees) {
    const name = e.fullName?.trim() || e.employeeCode || "—"
    const role = roleLabel(e)
    const start = parseYmd(e.hiredAt) ?? parseYmd(e.createdAt)
    if (start) {
      out.push({
        id: `emp-${e.id}-alta`,
        kind: "ingreso",
        employeeName: name,
        subtitle: `Alta • ${fmtShort(start)} • ${role}`,
        at: start.getTime(),
      })
    }
    if (e.status === "terminated") {
      const term = parseYmd(e.updatedAt)
      if (term) {
        out.push({
          id: `emp-${e.id}-baja`,
          kind: "salida",
          employeeName: name,
          subtitle: `Baja • ${fmtShort(term)} • ${role}`,
          at: term.getTime(),
        })
      }
    }
  }
  return out.sort((a, b) => b.at - a.at)
}

export default function MetricsPage() {
  const { user, getAccessToken } = useAuth()
  const allowedTabs = useMemo(() => visibleMetricasTabs(user), [user])
  const [activeTab, setActiveTab] = useState("produccion")
  // Initialise to the current calendar month
  const [filterStartDate, setFilterStartDate] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`
  })
  const [filterEndDate, setFilterEndDate] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  })
  const [shiftFilter, setShiftFilter] = useState<ShiftFilter>("all")

  // Custom date-range dialog
  const [customRangeOpen, setCustomRangeOpen] = useState(false)
  const [tempStart, setTempStart] = useState(filterStartDate)
  const [tempEnd, setTempEnd] = useState(filterEndDate)

  const formatDate = (date: Date) => {
    const yyyy = date.getFullYear()
    const mm = String(date.getMonth() + 1).padStart(2, "0")
    const dd = String(date.getDate()).padStart(2, "0")
    return `${yyyy}-${mm}-${dd}`
  }

  const getMonthDateBounds = (reportMonth: string) => {
    const [yRaw, mRaw] = reportMonth.split("-")
    const year = Number(yRaw)
    const month = Number(mRaw) - 1
    const now = new Date()
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 0 || month > 11) {
      return {
        start: formatDate(new Date(now.getFullYear(), now.getMonth(), 1)),
        end: formatDate(now),
      }
    }
    const mm = String(month + 1).padStart(2, "0")
    const start = `${year}-${mm}-01`
    const lastDay = formatDate(new Date(year, month + 1, 0))
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth()
    return { start, end: isCurrentMonth ? formatDate(now) : lastDay }
  }

  // Last 6 months + current month as quick-select pills
  const monthOptions = useMemo(() => {
    const now = new Date()
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
      const year = d.getFullYear()
      const month = d.getMonth()
      const firstDay = `${year}-${String(month + 1).padStart(2, "0")}-01`
      const lastDayDate = new Date(year, month + 1, 0)
      const lastDay = formatDate(lastDayDate)
      // For the current month use today as the end so we don't request future data
      const isCurrentMonth = year === now.getFullYear() && month === now.getMonth()
      const effectiveEnd = isCurrentMonth ? formatDate(now) : lastDay
      const label = d.toLocaleDateString("es-MX", { month: "short", year: "numeric" })
      return { key: `${year}-${month}`, firstDay, effectiveEnd, label }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const activeMonthKey = useMemo(
    () =>
      monthOptions.find(
        (m) => filterStartDate === m.firstDay && filterEndDate === m.effectiveEnd,
      )?.key ?? null,
    [filterStartDate, filterEndDate, monthOptions],
  )
  const isCustomRange = activeMonthKey === null

  const applyMonth = (m: (typeof monthOptions)[number]) => {
    setFilterStartDate(m.firstDay)
    setFilterEndDate(m.effectiveEnd)
  }

  const applyCustomRange = () => {
    if (!tempStart || !tempEnd) return
    const start = tempStart <= tempEnd ? tempStart : tempEnd
    const end = tempStart <= tempEnd ? tempEnd : tempStart
    setFilterStartDate(start)
    setFilterEndDate(end)
    setCustomRangeOpen(false)
  }

  const downloadBlob = (filename: string, blob: Blob) => {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  const [productionBaseRows, setProductionBaseRows] = useState<ProductionBaseRow[]>([])
  const [employeeRows, setEmployeeRows] = useState<ApiEmployee[]>([])
  const [goalsRows, setGoalsRows] = useState<ApiGoal[]>([])
  const [goalActualByGoalId, setGoalActualByGoalId] = useState<Record<string, number>>({})
  const [dataLoading, setDataLoading] = useState(true)
  const [dataError, setDataError] = useState<string | null>(null)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [machineCheckinsLoaded, setMachineCheckinsLoaded] = useState<ApiMachineCheckin[]>([])

  useEffect(() => {
    if (allowedTabs.length > 0 && !allowedTabs.includes(activeTab)) {
      setActiveTab(allowedTabs[0]!)
    }
  }, [allowedTabs, activeTab])
  const [employeeDayRecordsLoaded, setEmployeeDayRecordsLoaded] = useState<ApiEmployeeDayRecord[]>(
    [],
  )
  const [maintenanceSessionsLoaded, setMaintenanceSessionsLoaded] = useState<ApiMaintenanceSession[]>(
    [],
  )
  const [alertsLoaded, setAlertsLoaded] = useState<ApiAlert[]>([])
  const [bonusConfigData, setBonusConfigData] = useState<BonusProductionConfigData>(
    DEFAULT_BONUS_PRODUCTION_CONFIG,
  )
  const [machinesLoaded, setMachinesLoaded] = useState<ApiMachine[]>([])
  const attendanceStats = useMemo(() => [] as unknown[], [])

  const scopedProductionRows = useMemo(() => {
    const startDate = new Date(`${filterStartDate}T00:00:00`)
    startDate.setHours(0, 0, 0, 0)
    const endDate = new Date(`${filterEndDate}T00:00:00`)
    endDate.setHours(23, 59, 59, 999)
    return productionBaseRows.filter((r) => {
      const rowDate = new Date(r.timestamp)
      if (rowDate < startDate || rowDate > endDate) return false
      return matchesShiftFilter(r.timestamp, shiftFilter)
    })
  }, [productionBaseRows, filterStartDate, filterEndDate, shiftFilter])

  const shiftFilteredCheckins = useMemo(() => {
    if (shiftFilter === "all") return machineCheckinsLoaded
    return machineCheckinsLoaded.filter((ch) => matchesShiftFilter(ch.checkedInAt, shiftFilter))
  }, [machineCheckinsLoaded, shiftFilter])

  const shiftFilteredDayRecords = useMemo(() => {
    if (shiftFilter === "all") return employeeDayRecordsLoaded
    return employeeDayRecordsLoaded.filter((r) =>
      dayRecordMatchesShiftFilter(r.shift, shiftFilter),
    )
  }, [employeeDayRecordsLoaded, shiftFilter])

  const productionRowsForIncidents = useMemo(() => {
    const startDate = new Date(`${filterStartDate}T00:00:00`)
    startDate.setHours(0, 0, 0, 0)
    const endDate = new Date(`${filterEndDate}T00:00:00`)
    endDate.setHours(23, 59, 59, 999)
    return productionBaseRows.filter((r) => {
      const rowDate = new Date(r.timestamp)
      return rowDate >= startDate && rowDate <= endDate
    })
  }, [productionBaseRows, filterStartDate, filterEndDate])

  const checkinsForIncidents = useMemo(() => {
    const startDate = new Date(`${filterStartDate}T00:00:00`)
    startDate.setHours(0, 0, 0, 0)
    const endDate = new Date(`${filterEndDate}T00:00:00`)
    endDate.setHours(23, 59, 59, 999)
    return machineCheckinsLoaded.filter((ch) => {
      const t = new Date(ch.checkedInAt)
      return t >= startDate && t <= endDate
    })
  }, [machineCheckinsLoaded, filterStartDate, filterEndDate])

  useEffect(() => {
    let cancelled = false
    const load = async (silent = false) => {
      const token = await getAccessToken()
      if (!token) {
        if (!cancelled) {
          setProductionBaseRows([])
          setEmployeeRows([])
          setMachineCheckinsLoaded([])
          setEmployeeDayRecordsLoaded([])
          setMaintenanceSessionsLoaded([])
          setAlertsLoaded([])
          setDataLoading(false)
          setDataError(null)
        }
        return
      }

      if (!cancelled && !silent) {
        setDataLoading(true)
        setDataError(null)
      }

      try {
        const fromIso = new Date(`${filterStartDate}T00:00:00`).toISOString()
        const toIso = new Date(`${filterEndDate}T23:59:59.999`).toISOString()
        const bonusMonth = filterStartDate.slice(0, 7)

        const [events, employees, apiMachines, checkins, goals, dayRecords, maintenanceSessions, alerts, bonusCfg] =
          await Promise.all([
          getProductionEvents(token, { from: fromIso, to: toIso, limit: 50_000 }),
          getEmployees(token),
          getMachines(token),
          getMachineCheckins(token, { from: fromIso, to: toIso, limit: 20_000 }),
          getGoals(token).catch(() => [] as ApiGoal[]),
          getEmployeeDayRecords(token, {
            from: filterStartDate,
            to: filterEndDate,
            limit: 5000,
          }).catch(() => [] as ApiEmployeeDayRecord[]),
          getMaintenanceSessions(token, { from: fromIso, to: toIso, limit: 5000 }),
          getAlerts(token).catch(() => [] as ApiAlert[]),
          getBonusProductionConfigForMonth(token, bonusMonth).catch(() => null),
        ])
        if (cancelled) return

        const bonusConfig = bonusCfg
          ? normalizeBonusProductionConfig(bonusCfg.config)
          : DEFAULT_BONUS_PRODUCTION_CONFIG
        const goalsForActual = buildGoalsForProgressTracking(goals, bonusConfig, bonusMonth)
        const floorMachines = filterFloorMachines(apiMachines)

        setEmployeeRows(employees)
        setGoalsRows(goalsForActual)
        setMachineCheckinsLoaded(checkins)
        setEmployeeDayRecordsLoaded(dayRecords)
        setMaintenanceSessionsLoaded(maintenanceSessions)
        setAlertsLoaded(alerts)
        setBonusConfigData(bonusConfig)
        setMachinesLoaded(floorMachines)

        const actualByGoalId = computeActualByGoalId({
          goals: goalsForActual,
          machines: apiMachines,
          productionEvents: events,
        })
        if (cancelled) return
        setGoalActualByGoalId(actualByGoalId)

        const mapped = mapEventsToProductionBaseRows(events, checkins, employees, apiMachines)
        if (cancelled) return

        if (isMetricasDebugEnabled()) {
          const prodRows = mapped.filter((r) => r.event === "Producción")
          const byOp = new Map<string, number>()
          for (const r of prodRows) {
            byOp.set(r.operator, (byOp.get(r.operator) ?? 0) + r.count)
          }
          const sinOp = prodRows.filter((r) => r.operator === "—").length
          const conMaquina = prodRows.filter((r) => Boolean(r.machineIdRaw)).length
          const codeToName = buildEmployeeCodeToNameMap(employees)
          console.info("[Métricas] METRICAS_DEBUG=1 — producción / operadores", {
            rango: { desde: filterStartDate, hasta: filterEndDate },
            registrosApi: events.length,
            posibleCortePorLimiteApi: events.length >= 49_000,
            filasMapeadas: mapped.length,
            filasProduccion: prodRows.length,
            produccionSinOperadorResuelto: sinOp,
            produccionConMachineId: conMaquina,
            checkinsEnRango: checkins.length,
            empleadosMaestro: employees.length,
            codigosEmpleadoEnMapa: codeToName.size,
            operadoresDistintosEnAgg: byOp.size,
            topOperadoresPorUnidades: [...byOp.entries()]
              .sort((a, b) => b[1] - a[1])
              .slice(0, 20),
            hintSiPocosOperadores:
              sinOp > 0
                ? "Muchos PROD sin OPERATOR_1 en payload: ya se intenta check-in NFC por máquina/fecha. Verifica check-ins en el rango."
                : "Si operadoresDistintosEnAgg es bajo, revisa que los códigos OPERATOR_1/OPERATOR coincidan con employeeCode en maestro.",
          })
        }

        setProductionBaseRows(mapped)
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "No se pudieron cargar los datos"
          const permissionDenied =
            message.toLowerCase().includes("permiso") || message.includes("403")
          if (!permissionDenied) {
            setProductionBaseRows([])
            setMachineCheckinsLoaded([])
            setEmployeeDayRecordsLoaded([])
            setMaintenanceSessionsLoaded([])
            setAlertsLoaded([])
            setDataError(message)
          } else {
            setDataError(null)
          }
        }
      } finally {
        if (!cancelled && !silent) setDataLoading(false)
      }
    }

    load(false)
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible") return
      load(true)
    }, 300_000)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [getAccessToken, filterStartDate, filterEndDate, reloadNonce])

  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false)
  const [reportDate, setReportDate] = useState(() => formatDate(new Date()))
  const [reportShiftNumber, setReportShiftNumber] = useState<1 | 2>(1)
  const [reportBothShifts, setReportBothShifts] = useState(false)
  const [supervisorName, setSupervisorName] = useState("")
  const [reportGenerating, setReportGenerating] = useState(false)

  const [isBonusReportDialogOpen, setIsBonusReportDialogOpen] = useState(false)
  const [bonusReportDate, setBonusReportDate] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`
  })
  const [bonusRangeStart, setBonusRangeStart] = useState(filterStartDate)
  const [bonusRangeEnd, setBonusRangeEnd] = useState(filterEndDate)
  const [bonusReportGenerating, setBonusReportGenerating] = useState(false)
  const [bonusReportError, setBonusReportError] = useState<string | null>(null)

  const operatorBarPalette = [
    "#22c55e", // green
    "#3b82f6", // blue
    "#a855f7", // purple
    "#f97316", // orange
    "#eab308", // yellow
    "#ef4444", // red
    "#14b8a6", // teal
    "#6366f1", // indigo
  ]

  const skuPalette = [
    "#22c55e",
    "#3b82f6",
    "#a855f7",
    "#f97316",
    "#eab308",
    "#14b8a6",
    "#ef4444",
    "#6366f1",
  ]

  const analytics = useMemo(() => {
    if (activeTab !== "produccion" && activeTab !== "operadores") {
      return EMPTY_PRODUCTION_ANALYTICS
    }
    const rows14d = scopedProductionRows

    const produced14d = rows14d
      .filter((r) => r.event === "Producción")
      .reduce((acc, r) => acc + r.count, 0)
    const changeovers14d = rows14d.filter((r) => r.event === "Cambio SKU").length

    const changeoversPer1k = produced14d > 0 ? (changeovers14d / produced14d) * 1000 : 0

    const dailyAgg = new Map<string, { produced: number; downtime: number }>()
    const operatorAgg = new Map<string, { units: number; downtime: number }>()
    const packerAgg = new Map<string, { units: number; jobs: number }>()
    const personAgg = new Map<string, PersonProductionAgg>()
    const skuAgg = new Map<string, number>()
    const machineAgg = new Map<string, { produced: number; downtime: number }>()

    for (const r of rows14d) {
      const ts = new Date(r.timestamp)
      const dayKey = formatDate(ts)

      const day = dailyAgg.get(dayKey) ?? { produced: 0, downtime: 0 }
      if (r.event === "Producción") day.produced += r.count
      if (["Parada"].includes(r.event)) day.downtime += 1
      dailyAgg.set(dayKey, day)

      const op = operatorAgg.get(r.operator) ?? { units: 0, downtime: 0 }
      if (r.event === "Producción") op.units += r.count
      if (["Parada"].includes(r.event)) op.downtime += 1
      operatorAgg.set(r.operator, op)

      const machine = machineAgg.get(r.machine_id) ?? { produced: 0, downtime: 0 }
      if (r.event === "Producción") machine.produced += r.count
      if (["Parada"].includes(r.event)) machine.downtime += 1
      machineAgg.set(r.machine_id, machine)

      if (r.event === "Producción") {
        skuAgg.set(r.sku, (skuAgg.get(r.sku) ?? 0) + r.count)

        const operatorsList = [r.operator, r.operator_2].filter((p) => p && p !== "—")
        const nOps = operatorsList.length
        if (nOps > 0) {
          const opShare = r.count / nOps
          for (const name of operatorsList) {
            const ag = personAgg.get(name) ?? { operatorUnits: 0, packerUnits: 0 }
            ag.operatorUnits += opShare
            personAgg.set(name, ag)
          }
        }

        const packersList =
          r.packersAttributed?.filter((p) => p && p !== "—").length > 0
            ? r.packersAttributed.filter((p) => p && p !== "—")
            : [r.packer_1, r.packer_2].filter((p) => p && p !== "—")
        const nPack = packersList.length
        if (nPack > 0) {
          const share = r.count / nPack
          for (const name of packersList) {
            const ag = packerAgg.get(name) ?? { units: 0, jobs: 0 }
            ag.units += share
            ag.jobs += 1
            packerAgg.set(name, ag)

            const person = personAgg.get(name) ?? { operatorUnits: 0, packerUnits: 0 }
            person.packerUnits += share
            personAgg.set(name, person)
          }
        }
      }
    }

    const dailySeries = [...dailyAgg.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({ date: date.slice(5), produced: v.produced, downtime: v.downtime }))

    const topOperators = [...operatorAgg.entries()]
      .map(([name, v]) => ({
        name,
        units: v.units,
        downtime: v.downtime,
      }))
      .sort((a, b) => b.units - a.units)
      .slice(0, 14)

    /** Pie de distribución: todos los que tienen unidades > 0 (hasta 20), no solo el top del bar chart. */
    const operatorDistributionPie = [...operatorAgg.entries()]
      .map(([name, v]) => ({ name, units: v.units, downtime: v.downtime }))
      .filter((x) => x.units > 0)
      .sort((a, b) => b.units - a.units)
      .slice(0, 20)

    const topPackers = [...packerAgg.entries()]
      .map(([name, v]) => ({ name, units: Number(v.units.toFixed(1)), jobs: v.jobs }))
      .sort((a, b) => b.units - a.units)
      .slice(0, 10)

    const topSkus = [...skuAgg.entries()]
      .map(([sku, units]) => ({ sku, units }))
      .sort((a, b) => b.units - a.units)
      .slice(0, 6)

    const skuDistribution = [...skuAgg.entries()]
      .map(([sku, units]) => ({ sku, units }))
      .sort((a, b) => b.units - a.units)

    const nameToRole = buildEmployeeNameToRoleLabelMap(employeeRows)
    const totalPersonUnits = [...personAgg.values()].reduce(
      (sum, v) => sum + v.operatorUnits + v.packerUnits,
      0,
    )
    const personRoleComparison = [...personAgg.entries()]
      .map(([name, v]) => {
        const units = v.operatorUnits + v.packerUnits
        return {
          name,
          role: resolvePersonRoleLabel(name, v, nameToRole),
          units: Math.round(units * 10) / 10,
          operatorUnits: Math.round(v.operatorUnits * 10) / 10,
          packerUnits: Math.round(v.packerUnits * 10) / 10,
          sharePct:
            totalPersonUnits > 0 ? Math.round((units / totalPersonUnits) * 1000) / 10 : 0,
        }
      })
      .filter((x) => x.units > 0)
      .sort((a, b) => b.units - a.units)

    const machineScatter = [...machineAgg.entries()]
      .map(([machine, v]) => ({
        machine,
        produced: v.produced,
        downtimeEvents: v.downtime,
      }))
      .sort((a, b) => b.produced - a.produced)

    return {
      produced14d,
      changeovers14d,
      changeoversPer1k,
      dailySeries,
      topOperators,
      operatorDistributionPie,
      topPackers,
      topSkus,
      skuDistribution,
      personRoleComparison,
      machineScatter,
    }
  }, [activeTab, scopedProductionRows, employeeRows])

  // Último día del rango con producción o paro/inactividad.
  const lastDayWithData = useMemo(() => {
    // Último día con producción REAL (piezas > 0). Se ignoran eventos sin unidades
    // como BOOT (reconexión) o Parada, que antes hacían que el KPI mostrara 0.
    let best: string | null = null
    for (const r of scopedProductionRows) {
      if (r.event !== "Producción") continue
      if ((Number(r.count) || 0) <= 0) continue
      const ts = new Date(r.timestamp)
      if (Number.isNaN(ts.getTime())) continue
      const dayStr = formatDate(ts)
      if (!best || dayStr > best) best = dayStr
    }
    return best
  }, [scopedProductionRows])

  const activityRows = useMemo(
    () =>
      scopedProductionRows.map((r) => ({
        machine_id: r.machine_id,
        machineIdRaw: r.machineIdRaw,
        timestamp: r.timestamp,
        event: r.event,
        eventRaw: r.eventRaw,
        count: r.count,
      })),
    [scopedProductionRows],
  )

  const machineActivity = useMemo(
    () =>
      buildMachineActivitySummary(activityRows, {
        refDay: lastDayWithData ?? filterEndDate,
      }),
    [activityRows, lastDayWithData, filterEndDate],
  )

  const inactivityDailySeries = useMemo(
    () => buildDailyInactivitySeries(activityRows),
    [activityRows],
  )

  const alertRoleCounts = useMemo(
    () =>
      buildAlertRoleCounts({
        alerts: alertsLoaded,
        startDate: filterStartDate,
        endDate: filterEndDate,
        productionAlertRows: scopedProductionRows.map((r) => ({
          eventRaw: r.eventRaw,
          timestamp: r.timestamp,
        })),
      }),
    [alertsLoaded, filterStartDate, filterEndDate, scopedProductionRows],
  )

  const hourlyProductionData = useMemo(() => {
    // Use the last day with real production data in the range.
    // Falls back to filterEndDate only if no data at all (will return empty array).
    const refDay = lastDayWithData ?? filterEndDate
    const day = new Date(`${refDay}T12:00:00`)
    const start = new Date(day)
    start.setHours(0, 0, 0, 0)
    const end = new Date(day)
    end.setHours(23, 59, 59, 999)

    const byHour = new Map<string, number>()
    for (const r of scopedProductionRows) {
      if (r.event !== "Producción") continue
      const units = Number(r.count) || 0
      if (units <= 0) continue
      const ts = new Date(r.timestamp)
      if (Number.isNaN(ts.getTime())) continue
      if (ts < start || ts > end) continue
      const hour = String(ts.getHours()).padStart(2, "0")
      byHour.set(hour, (byHour.get(hour) ?? 0) + units)
    }

    return [...byHour.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([hour, production]) => ({ hour: `${hour}:00`, production }))
  }, [scopedProductionRows, lastDayWithData, filterEndDate])

  const topMachinesData = useMemo(() => {
    const start = new Date(`${filterStartDate}T00:00:00`)
    start.setHours(0, 0, 0, 0)
    const end = new Date(`${filterEndDate}T00:00:00`)
    end.setHours(23, 59, 59, 999)
    const daysInRange = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000))

    /** Operador con más unidades atribuidas en el rango (evita mostrar solo el último evento del bucle). */
    const operatorUnitsByMachine = new Map<string, Map<string, number>>()
    for (const r of scopedProductionRows) {
      if (r.event !== "Producción") continue
      const op = r.operator?.trim()
      if (!op || op === "—") continue
      const mid = r.machine_id
      const inner = operatorUnitsByMachine.get(mid) ?? new Map<string, number>()
      inner.set(op, (inner.get(op) ?? 0) + (Number(r.count) || 0))
      operatorUnitsByMachine.set(mid, inner)
    }

    const dominantOperator = (machineLabel: string): string => {
      const sub = operatorUnitsByMachine.get(machineLabel)
      if (!sub || sub.size === 0) return "—"
      let bestName = "—"
      let bestUnits = -1
      for (const [name, units] of sub.entries()) {
        if (units > bestUnits) {
          bestUnits = units
          bestName = name
        }
      }
      return bestName
    }

    return analytics.machineScatter.slice(0, 10).map((m) => {
      const produced = Number(m.produced) || 0
      const unitsPerDay = Math.round(produced / daysInRange)
      const downtimeEvents = Number(m.downtimeEvents) || 0
      const uptime = Math.max(0, Math.min(100, Math.round(100 - downtimeEvents * 2)))
      return {
        machine: m.machine,
        operator: dominantOperator(m.machine),
        unitsPerDay,
        uptime,
      }
    })
  }, [analytics.machineScatter, scopedProductionRows, filterStartDate, filterEndDate])

  const monthlyGoalSummary = useMemo(() => {
    return summarizeMonthlyGoalProgress(goalsRows, goalActualByGoalId, {
      shiftFilter,
    })
  }, [goalsRows, goalActualByGoalId, shiftFilter])

  const maintenanceMetrics = useMemo(() => {
    if (activeTab !== "mantenimiento") {
      return buildMaintenanceAnalytics([], [])
    }
    const startDate = new Date(`${filterStartDate}T00:00:00`)
    startDate.setHours(0, 0, 0, 0)
    const endDate = new Date(`${filterEndDate}T00:00:00`)
    endDate.setHours(23, 59, 59, 999)

    const sessionsInRange = maintenanceSessionsLoaded.filter((s) =>
      matchesShiftFilter(s.startedAt, shiftFilter),
    )
    const productionForClassification = productionBaseRows.filter((r) => {
      const rowDate = new Date(r.timestamp)
      return rowDate >= startDate && rowDate <= endDate
    })

    return buildMaintenanceAnalytics(sessionsInRange, productionForClassification)
  }, [
    activeTab,
    maintenanceSessionsLoaded,
    productionBaseRows,
    filterStartDate,
    filterEndDate,
    shiftFilter,
  ])

  const maintenanceVisitRowsDisplay = useMemo(() => {
    const codeToName = buildEmployeeCodeToNameMap(employeeRows)
    return maintenanceMetrics.visits
      .slice()
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .map((v) => ({
        ...v,
        technician:
          v.employeeCode
            ? codeToName.get(v.employeeCode) ??
              codeToName.get(v.employeeCode.toLowerCase()) ??
              v.employeeCode
            : "—",
      }))
  }, [maintenanceMetrics.visits, employeeRows])

  const maintenanceTechnicianRows = useMemo(() => {
    const codeToName = buildEmployeeCodeToNameMap(employeeRows)
    return maintenanceMetrics.byTechnician.map((row) => ({
      ...row,
      technician:
        row.employeeCode === "—"
          ? "—"
          : codeToName.get(row.employeeCode) ??
            codeToName.get(row.employeeCode.toLowerCase()) ??
            row.employeeCode,
    }))
  }, [maintenanceMetrics.byTechnician, employeeRows])

  const shiftIncidentsAnalytics = useMemo(() => {
    if (activeTab !== "incidencias") {
      return EMPTY_SHIFT_INCIDENTS
    }
    const built = buildShiftIncidentsAnalytics({
      productionRows: productionRowsForIncidents,
      checkins: checkinsForIncidents,
      machines: machinesLoaded,
      goals: goalsRows,
      bonusConfig: bonusConfigData,
      employees: employeeRows,
      from: filterStartDate,
      to: filterEndDate,
    })
    if (shiftFilter === "all") return built
    const incidents = built.incidents.filter((i) => i.shift === shiftFilter)
    return {
      ...built,
      incidents,
      summary: {
        overtimeCount: incidents.filter((i) => i.kind === "overtime_production").length,
        earlyLeaveCount: incidents.filter((i) => i.kind === "early_leave_under_goal").length,
        postCleaningCount: incidents.filter((i) => i.kind === "post_cleaning_production").length,
        cleaningProductionCount: incidents.filter((i) => i.kind === "production_during_cleaning")
          .length,
        total: incidents.length,
      },
    }
  }, [
    activeTab,
    productionRowsForIncidents,
    checkinsForIncidents,
    machinesLoaded,
    goalsRows,
    bonusConfigData,
    employeeRows,
    filterStartDate,
    filterEndDate,
    shiftFilter,
  ])

  function shiftIncidentRowClass(row: ShiftIncidentRow): string {
    if (row.kind === "post_cleaning_production") {
      return "bg-red-600 text-white hover:bg-red-600/95 [&_td]:border-red-500"
    }
    if (row.severity === "incident") return "bg-red-50"
    if (row.severity === "warning") return "bg-amber-50"
    return ""
  }

  const attendanceFromCheckins = useMemo(
    () =>
      mergeAttendanceWithDayRecords(
        machineCheckinsToAttendanceRecords(shiftFilteredCheckins, employeeRows),
        shiftFilteredDayRecords,
      ),
    [shiftFilteredCheckins, employeeRows, shiftFilteredDayRecords],
  )

  // Filtro por calendario (los check-ins ya vienen acotados por API, esto alinea con Desde/Hasta).
  const filteredAttendanceRecords = useMemo(() => {
    const startDate = new Date(`${filterStartDate}T00:00:00`)
    startDate.setHours(0, 0, 0, 0)
    const endDate = new Date(`${filterEndDate}T00:00:00`)
    endDate.setHours(23, 59, 59, 999)

    return attendanceFromCheckins.filter((record) => {
      const recordDate = new Date(record.date)
      recordDate.setHours(0, 0, 0, 0)
      return recordDate >= startDate && recordDate <= endDate
    })
  }, [filterStartDate, filterEndDate, attendanceFromCheckins])

  const vacationDaysByEmployee = useMemo(
    () =>
      aggregateEmployeeVacationDays(shiftFilteredDayRecords, {
        from: filterStartDate,
        to: filterEndDate,
      }),
    [shiftFilteredDayRecords, filterStartDate, filterEndDate],
  )

  const vacationSummary = useMemo(() => {
    const totalDays = vacationDaysByEmployee.reduce((acc, r) => acc + r.vacationDays, 0)
    const onVacationToday = vacationDaysByEmployee.filter((r) => r.onVacationToday).length
    return {
      employeesWithVacation: vacationDaysByEmployee.length,
      totalVacationDays: totalDays,
      onVacationToday,
    }
  }, [vacationDaysByEmployee])

  const personnelMovements = useMemo(
    () => buildPersonnelMovementsFromEmployees(employeeRows).slice(0, 40),
    [employeeRows],
  )

  const personnelMonthSummary = useMemo(() => {
    const now = new Date()
    const inCurrentMonth = (ts: number) => {
      const d = new Date(ts)
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    }
    const all = buildPersonnelMovementsFromEmployees(employeeRows)
    let ingresos = 0
    let salidas = 0
    for (const m of all) {
      if (!inCurrentMonth(m.at)) continue
      if (m.kind === "ingreso") ingresos++
      else salidas++
    }
    const net = ingresos - salidas
    const max = Math.max(ingresos, salidas, 1)
    return {
      ingresos,
      salidas,
      net,
      ingPct: Math.round((ingresos / max) * 100),
      salPct: Math.round((salidas / max) * 100),
      monthLabel: now.toLocaleDateString("es-MX", { month: "long", year: "numeric" }),
    }
  }, [employeeRows])

  const turnoverMetrics = useMemo(
    () => computeMonthlyTurnover(employeeRows),
    [employeeRows],
  )

  const handleGenerateProductionReport = async () => {
    const codeToName = buildEmployeeCodeToNameMap(employeeRows)
    const resolvePerson = (raw: string | undefined) => {
      const code = String(raw ?? "").trim()
      if (!code) return "—"
      return codeToName.get(code) ?? codeToName.get(code.toLowerCase()) ?? code
    }
    const resolvePersonFromCode = (code: string | null | undefined) => {
      const c = String(code ?? "").trim()
      if (!c) return ""
      return codeToName.get(c) ?? codeToName.get(c.toLowerCase()) ?? c
    }
    const resolveFromCheckin = (ch: ApiMachineCheckin) => ({
      operator1: resolvePerson(ch.operatorCode),
      operator2: resolvePerson(ch.operator2Code ?? undefined),
      packer1: resolvePerson(ch.packager1Code ?? undefined),
      packer2: resolvePerson(ch.packager2Code ?? undefined),
    })
    const nameToCode = new Map<string, string>()
    for (const emp of employeeRows) {
      const code = emp.employeeCode?.trim()
      const name = emp.fullName?.trim()
      if (!code || !name) continue
      nameToCode.set(name, code)
      nameToCode.set(name.toLowerCase(), code)
    }
    const resolveEmployeeCode = (displayName: string) => {
      const t = displayName.trim()
      if (!t || t === "—") return ""
      return nameToCode.get(t) ?? nameToCode.get(t.toLowerCase()) ?? ""
    }

    const sourceRows: ProductionShiftReportSourceRow[] = productionBaseRows.map((r) => ({
      machine_id: r.machine_id,
      machineIdRaw: r.machineIdRaw,
      timestamp: r.timestamp,
      operator: r.operator,
      operator_2: r.operator_2,
      packer_1: r.packer_1,
      packer_2: r.packer_2,
      count: r.count,
      event: r.event,
      sku: r.sku,
      unitsPerBox: r.unitsPerBox,
    }))

    const monthBounds = getMonthDateBounds(reportDate)
    const shifts: (1 | 2)[] = reportBothShifts ? [1, 2] : [reportShiftNumber]
    setReportGenerating(true)
    try {
      const token = await getAccessToken()
      let manualCaptures: ProductionShiftManualCapture[] = []
      let reportConfiguredSkus: string[] = []
      if (token) {
        const [windingRows, bendingRows, goals] = await Promise.all([
          getManualDataCaptures(token, {
            category: "winding",
            from: monthBounds.start,
            to: monthBounds.end,
            limit: 2000,
          }),
          getManualDataCaptures(token, {
            category: "bending",
            from: monthBounds.start,
            to: monthBounds.end,
            limit: 2000,
          }),
          getGoals(token).catch(() => [] as ApiGoal[]),
        ])
        reportConfiguredSkus = [
          ...new Set(
            goals
              .filter((g) => {
                const sku = g.sku?.trim()
                if (!sku || g.metricKind !== "production") return false
                return g.startDate <= monthBounds.end && g.endDate >= monthBounds.start
              })
              .map((g) => g.sku!.trim()),
          ),
        ]
        manualCaptures = [...windingRows, ...bendingRows]
          .filter((c) => c.recordDate && c.productionQty != null)
          .map((c) => ({
            category: c.category as "winding" | "bending",
            sourceKey: c.sourceKey,
            recordDate: c.recordDate!,
            shift: c.shift,
            sku: c.sku,
            operatorCode: c.operatorCode,
            packagerCode: c.packagerCode,
            productionQty: Number(c.productionQty),
          }))
      }

      for (const shiftNumber of shifts) {
        const blob = await buildProductionShiftReportBlob({
          reportDate,
          shiftNumber,
          supervisorName: supervisorName.trim() || "—",
          rows: sourceRows,
          checkins: machineCheckinsLoaded,
          manualCaptures,
          configuredSkus: reportConfiguredSkus,
          resolveFromCheckin,
          resolveEmployeeCode,
          resolvePersonFromCode,
        })
        downloadBlob(productionShiftReportFilename(shiftNumber, reportDate), blob)
      }
      setIsReportDialogOpen(false)
    } finally {
      setReportGenerating(false)
    }
  }

  const openBonusReportDialog = () => {
    const monthFirst = `${filterStartDate.slice(0, 7)}-01`
    setBonusReportDate(monthFirst)
    setBonusRangeStart(filterStartDate)
    setBonusRangeEnd(filterEndDate)
    setBonusReportError(null)
    setIsBonusReportDialogOpen(true)
  }

  const handleBonusMonthChange = (value: string) => {
    setBonusReportDate(value)
    const bounds = getMonthDateBounds(value)
    setBonusRangeStart(bounds.start)
    setBonusRangeEnd(bounds.end)
  }

  const handleGenerateBonusReport = async () => {
    if (!bonusRangeStart || !bonusRangeEnd) {
      setBonusReportError("Selecciona el rango de fechas.")
      return
    }
    const rangeStart = bonusRangeStart <= bonusRangeEnd ? bonusRangeStart : bonusRangeEnd
    const rangeEnd = bonusRangeStart <= bonusRangeEnd ? bonusRangeEnd : bonusRangeStart

    const codeToName = buildEmployeeCodeToNameMap(employeeRows)
    const resolvePersonFromCode = (code: string | null | undefined) => {
      const c = String(code ?? "").trim()
      if (!c) return ""
      return codeToName.get(c) ?? codeToName.get(c.toLowerCase()) ?? c
    }

    setBonusReportGenerating(true)
    setBonusReportError(null)
    try {
      const token = await getAccessToken()
      if (!token) {
        setBonusReportError("Sesión no válida.")
        return
      }

      const fromIso = new Date(`${rangeStart}T00:00:00`).toISOString()
      const toIso = new Date(`${rangeEnd}T23:59:59.999`).toISOString()

      const [events, employees, apiMachines, checkins] = await Promise.all([
        getProductionEvents(token, { from: fromIso, to: toIso, limit: 120_000 }),
        employeeRows.length > 0 ? Promise.resolve(employeeRows) : getEmployees(token),
        getMachines(token),
        getMachineCheckins(token, { from: fromIso, to: toIso, limit: 20_000 }),
      ])

      const reportRows = mapEventsToProductionBaseRows(events, checkins, employees, apiMachines)
      const sourceRows: ProductionShiftReportSourceRow[] = reportRows
        .filter((r) => {
          const day = r.timestamp.slice(0, 10)
          return day >= rangeStart && day <= rangeEnd
        })
        .map((r) => ({
          machine_id: r.machine_id,
          machineIdRaw: r.machineIdRaw,
          timestamp: r.timestamp,
          operator: r.operator,
          operator_2: r.operator_2,
          packer_1: r.packer_1,
          packer_2: r.packer_2,
          count: r.count,
          event: r.event,
          sku: r.sku,
          unitsPerBox: r.unitsPerBox,
        }))

      const monthBounds = getMonthDateBounds(bonusReportDate)
      let manualCaptures: BonusManualCapture[] = []
      let employeeDayRecords: BonusEmployeeDayRecord[] = []
      let employeeRoleEvents: BonusEmployeeRoleEvent[] = []
      let employeePrimaryRoles: BonusEmployeePrimaryRole[] = []

      if (token) {
        const [bendingRows, rollerRows, dayRecordRows, roleEventRows] = await Promise.all([
          getManualDataCaptures(token, {
            category: "bending",
            from: monthBounds.start,
            to: monthBounds.end,
            limit: 2000,
          }),
          getManualDataCaptures(token, {
            category: "roller",
            from: monthBounds.start,
            to: monthBounds.end,
            limit: 2000,
          }),
          getEmployeeDayRecords(token, {
            from: monthBounds.start,
            to: monthBounds.end,
            limit: 5000,
          }),
          getEmployeeRoleEvents(token, {
            from: monthBounds.start,
            to: monthBounds.end,
            limit: 5000,
          }),
        ])

        manualCaptures = [...bendingRows, ...rollerRows]
          .filter((c) => c.recordDate && c.productionQty != null)
          .map((c) => ({
            category: c.category as "bending" | "roller",
            sourceKey: c.sourceKey,
            recordDate: c.recordDate!,
            shift: c.shift,
            operatorCode: c.operatorCode,
            productionQty: Number(c.productionQty),
          }))

        employeeDayRecords = dayRecordRows.map((r) => ({
          employeeName: r.employeeName,
          recordDate: r.recordDate,
          shift: r.shift,
          recordType: r.recordType,
        }))

        employeeRoleEvents = roleEventRows.map((r) => ({
          employeeName: r.employeeName,
          recordDate: r.recordDate,
          shift: r.shift,
          secondaryRole: r.secondaryRole,
        }))

        employeePrimaryRoles = employees.map((e) => ({
          fullName: e.fullName,
          primaryRole: e.primaryRole,
          secondaryRole: e.secondaryRole,
        }))
      }

      let productionConfig = undefined
      let resolvedHolidayIsos: string[] | undefined
      if (token) {
        try {
          const cfg = await getBonusProductionConfigForMonth(token, bonusReportDate)
          productionConfig = normalizeBonusProductionConfig(cfg.config)
        } catch {
          // usa DEFAULT_BONUS_PRODUCTION_CONFIG en el generador
        }
        try {
          const [yRaw, mRaw] = bonusReportDate.split("-")
          const reportYear = Number(yRaw)
          const reportMonth = Number(mRaw)
          if (Number.isFinite(reportYear) && Number.isFinite(reportMonth)) {
            resolvedHolidayIsos = await getResolvedHolidaysForMonth(
              token,
              reportYear,
              reportMonth,
            )
          }
        } catch {
          // festivos oficiales locales
        }
      }

      const blob = await buildBonusAccumulatedReportBlob(bonusReportDate, sourceRows, {
        checkins,
        resolvePersonFromCode,
        manualCaptures,
        employeeDayRecords,
        employeeRoleEvents,
        employeePrimaryRoles,
        productionConfig,
        resolvedHolidayIsos,
      })
      downloadBlob(bonusAccumulatedReportFilename(bonusReportDate), blob)
      setIsBonusReportDialogOpen(false)
    } finally {
      setBonusReportGenerating(false)
    }
  }

  const handleDownloadAnnualAccumulatedReportXlsx = async () => {
    const targetDate = reportDate || filterEndDate || formatDate(new Date())
    const year = Number(targetDate.slice(0, 4)) || new Date().getFullYear()
    const sourceRows: ProductionShiftReportSourceRow[] = productionBaseRows.map((r) => ({
      machine_id: r.machine_id,
      machineIdRaw: r.machineIdRaw,
      timestamp: r.timestamp,
      operator: r.operator,
      operator_2: r.operator_2,
      packer_1: r.packer_1,
      packer_2: r.packer_2,
      count: r.count,
      event: r.event,
      sku: r.sku,
      unitsPerBox: r.unitsPerBox,
    }))
    const blob = await buildAnnualAccumulatedReportBlob(year, sourceRows)
    downloadBlob(annualAccumulatedReportFilename(year), blob)
  }

  // KPIs (sin hardcode / sin mocks). Se calculan a partir de datos existentes;
  // si no hay datos todavía, se muestran como "—".
  const hasHourlyData = hourlyProductionData.length > 0
  const productionToday = hasHourlyData
    ? hourlyProductionData.reduce((acc, r) => acc + (Number(r.production) || 0), 0)
    : null

  // Promedio/hora: piezas en el rango ÷ horas con producción real (piezas > 0).
  const avgPerHour = useMemo(() => {
    let total = 0
    const hourSlots = new Set<string>()
    for (const r of scopedProductionRows) {
      if (r.event !== "Producción") continue
      const units = Number(r.count) || 0
      if (units <= 0) continue
      const ts = new Date(r.timestamp)
      if (Number.isNaN(ts.getTime())) continue
      total += units
      const slot = `${ts.getFullYear()}-${ts.getMonth()}-${ts.getDate()}-${ts.getHours()}`
      hourSlots.add(slot)
    }
    if (hourSlots.size === 0 || total === 0) return null
    return Math.round((total / hourSlots.size) * 100) / 100
  }, [scopedProductionRows])


  const todayStr = formatDate(new Date())
  const refDayLabel = lastDayWithData ?? filterEndDate
  const productionDayLabel =
    refDayLabel === todayStr
      ? "Producción Hoy"
      : lastDayWithData
        ? `Producción ${new Date(`${lastDayWithData}T12:00:00`).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}`
        : "Producción"

  return (
    <RequireModule
      modules={[
        "metricas_produccion",
        "metricas_incidencias",
        "metricas_mantenimiento",
        "metricas_asistencia_rotacion_bono",
      ]}
    >
    <DashboardLayout
      breadcrumbs={[
        { label: "Inicio", href: "/" },
        { label: "Métricas" },
      ]}
    >
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Centro de Métricas</h1>
          {dataError ? (
            <Alert variant="destructive" className="mt-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{dataError}</AlertDescription>
            </Alert>
          ) : dataLoading ? (
            <p className="mt-3 text-sm text-muted-foreground">Cargando datos de producción y empleados…</p>
          ) : null}
        </div>

        {/* Date Range Filter */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            {monthOptions.map((m) => (
              <Button
                key={m.key}
                size="sm"
                variant={activeMonthKey === m.key ? "default" : "outline"}
                className="capitalize"
                onClick={() => applyMonth(m)}
              >
                {m.label}
              </Button>
            ))}

            <Button
              size="sm"
              variant={isCustomRange ? "default" : "outline"}
              className="gap-1.5"
              onClick={() => {
                setTempStart(filterStartDate)
                setTempEnd(filterEndDate)
                setCustomRangeOpen(true)
              }}
            >
              <CalendarDays className="h-4 w-4" />
              {isCustomRange ? `${filterStartDate} – ${filterEndDate}` : "Rango personalizado"}
            </Button>

            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-muted-foreground"
              onClick={() => setReloadNonce((n) => n + 1)}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <span className="text-xs font-medium text-muted-foreground">Turno global:</span>
            <ToggleGroup
              type="single"
              value={shiftFilter}
              onValueChange={(v) => {
                if (v === "all" || v === "matutino" || v === "vespertino") setShiftFilter(v)
              }}
              className="justify-start"
            >
              <ToggleGroupItem value="all" size="sm">
                Todos
              </ToggleGroupItem>
              <ToggleGroupItem value="matutino" size="sm">
                Matutino
              </ToggleGroupItem>
              <ToggleGroupItem value="vespertino" size="sm">
                Vespertino
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        {/* Custom date-range dialog */}
        <Dialog open={customRangeOpen} onOpenChange={setCustomRangeOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" />
                Elegir rango de fechas
              </DialogTitle>
            </DialogHeader>

            <div className="grid gap-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="custom-start">Desde</Label>
                <input
                  id="custom-start"
                  type="date"
                  value={tempStart}
                  max={tempEnd || undefined}
                  onChange={(e) => setTempStart(e.target.value)}
                  className={cn(
                    "h-10 w-full rounded-md border border-input bg-background px-3 text-sm",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="custom-end">Hasta</Label>
                <input
                  id="custom-end"
                  type="date"
                  value={tempEnd}
                  min={tempStart || undefined}
                  onChange={(e) => setTempEnd(e.target.value)}
                  className={cn(
                    "h-10 w-full rounded-md border border-input bg-background px-3 text-sm",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  )}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setCustomRangeOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={applyCustomRange} disabled={!tempStart || !tempEnd}>
                Aplicar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reportes */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="mb-4 flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold text-card-foreground">Reportes Descargables</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Button variant="outline" className="justify-start" onClick={() => setIsReportDialogOpen(true)}>
              <Download className="h-4 w-4" /> Reporte de Producción por Turno
            </Button>
            <Button variant="outline" className="justify-start" onClick={openBonusReportDialog}>
              <Download className="h-4 w-4" /> Acumulado de Bono Mensual
            </Button>
            <Button
              variant="outline"
              className="justify-start"
              onClick={handleDownloadAnnualAccumulatedReportXlsx}
            >
              <Download className="h-4 w-4" /> Acumulado Anual
            </Button>
          </div>
        </div>

        {/* Bonus report dialog */}
        <Dialog open={isBonusReportDialogOpen} onOpenChange={setIsBonusReportDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Acumulado de Bono Mensual</DialogTitle>
            </DialogHeader>

            <div className="grid gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Mes del reporte</label>
                <MonthPicker value={bonusReportDate} onChange={handleBonusMonthChange} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Rango de fechas</label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="bonus-range-start">Desde</Label>
                    <input
                      id="bonus-range-start"
                      type="date"
                      value={bonusRangeStart}
                      max={bonusRangeEnd || undefined}
                      onChange={(e) => setBonusRangeStart(e.target.value)}
                      className={cn(
                        "h-10 w-full rounded-md border border-input bg-background px-3 text-sm",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      )}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="bonus-range-end">Hasta</Label>
                    <input
                      id="bonus-range-end"
                      type="date"
                      value={bonusRangeEnd}
                      min={bonusRangeStart || undefined}
                      onChange={(e) => setBonusRangeEnd(e.target.value)}
                      className={cn(
                        "h-10 w-full rounded-md border border-input bg-background px-3 text-sm",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      )}
                    />
                  </div>
                </div>
              </div>

              {bonusReportError ? (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{bonusReportError}</AlertDescription>
                </Alert>
              ) : null}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsBonusReportDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleGenerateBonusReport}
                disabled={bonusReportGenerating || !bonusRangeStart || !bonusRangeEnd}
              >
                <Download className="h-4 w-4" />{" "}
                {bonusReportGenerating ? "Generando…" : "Descargar Excel"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            {allowedTabs.includes("produccion") && (
              <TabsTrigger value="produccion">Producción</TabsTrigger>
            )}
            {allowedTabs.includes("incidencias") && (
              <TabsTrigger value="incidencias">Incidencias</TabsTrigger>
            )}
            {allowedTabs.includes("mantenimiento") && (
              <TabsTrigger value="mantenimiento">Mantenimiento</TabsTrigger>
            )}
            {allowedTabs.includes("operadores") && (
              <TabsTrigger value="operadores">Operadores & Empacadores</TabsTrigger>
            )}
            {allowedTabs.includes("asistencia") && (
              <TabsTrigger value="asistencia">Asistencia</TabsTrigger>
            )}
            {allowedTabs.includes("rotacion") && (
              <TabsTrigger value="rotacion">Rotación</TabsTrigger>
            )}
          </TabsList>

          {/* ========== PRODUCCIÓN TAB ========== */}
          <TabsContent value="produccion" className="space-y-6">
            {/* Report dialog */}
            <Dialog open={isReportDialogOpen} onOpenChange={setIsReportDialogOpen}>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Reporte de Producción por Turno</DialogTitle>
                </DialogHeader>

                <div className="grid gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Mes del reporte</label>
                    <MonthPicker value={reportDate} onChange={setReportDate} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="supervisorName">Supervisor</Label>
                    <Input
                      id="supervisorName"
                      value={supervisorName}
                      onChange={(e) => setSupervisorName(e.target.value)}
                      placeholder="Ej. Ulises Moran"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={reportBothShifts}
                      onCheckedChange={(v) => setReportBothShifts(Boolean(v))}
                    />
                    <p className="text-sm font-medium text-foreground">Descargar ambos turnos</p>
                  </div>

                  {!reportBothShifts && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Turno</label>
                      <Select
                        value={String(reportShiftNumber)}
                        onValueChange={(v) => setReportShiftNumber(v === "2" ? 2 : 1)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Turno 1 (07:00–16:00)</SelectItem>
                          <SelectItem value="2">Turno 2 (16:00–23:30)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsReportDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleGenerateProductionReport} disabled={reportGenerating}>
                    <Download className="h-4 w-4" /> {reportGenerating ? "Generando…" : "Descargar Excel"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* KPI Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <KpiCard
                title={productionDayLabel}
                value={productionToday == null ? "—" : productionToday.toLocaleString()}
                icon={CheckCircle}
                iconColor="text-primary"
              />
              <KpiCard
                title="Promedio/Hora"
                value={avgPerHour == null ? "—" : avgPerHour.toLocaleString()}
                icon={Clock}
                iconColor="text-primary"
              />
              <KpiCard
                title="Meta Mensual"
                value={
                  monthlyGoalSummary == null
                    ? "—"
                    : `${monthlyGoalSummary.actual.toLocaleString()} / ${monthlyGoalSummary.target.toLocaleString()}`
                }
                subtitle={
                  monthlyGoalSummary == null
                    ? "Sin meta mensual configurada"
                    : `${monthlyGoalSummary.pct}% del objetivo`
                }
                icon={Target}
                iconColor="text-teal-600"
              />
            </div>

            {/* Production Charts */}
            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="font-semibold text-foreground mb-4">Producción por Hora</h3>
              <ChartContainer
                className="h-[300px] w-full aspect-auto"
                config={{ production: { label: "Producción", color: "#22c55e" } }}
              >
                <BarChart data={hourlyProductionData} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} domain={[0, "auto"]} />
                  <ChartTooltip content={<ChartTooltipContent />} cursor={false} />
                  <Bar dataKey="production" fill="var(--color-production)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </div>

            {/* Machines & SKUs */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Machines */}
              <div className="rounded-xl border border-border bg-card p-6">
                <h3 className="font-semibold text-foreground mb-4">Top Máquinas</h3>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px]">
                    <thead>
                      <tr className="border-b border-border text-left text-sm text-muted-foreground">
                        <th className="pb-3 font-medium">Máquina</th>
                        <th className="pb-3 font-medium">Operador</th>
                        <th className="pb-3 font-medium text-right">Uds/día</th>
                        <th className="pb-3 font-medium text-right">Uptime</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topMachinesData.map((machine) => (
                        <tr key={machine.machine} className="border-b border-border last:border-0">
                          <td className="py-3 font-medium text-primary">{machine.machine}</td>
                          <td className="py-3 text-foreground">{machine.operator}</td>
                          <td className="py-3 text-right font-medium">{machine.unitsPerDay}</td>
                          <td className="py-3 text-right">
                            <span
                              className={cn(
                                "font-medium",
                                machine.uptime >= 95
                                  ? "text-green-600"
                                  : machine.uptime >= 90
                                    ? "text-yellow-600"
                                    : "text-red-600"
                              )}
                            >
                              {machine.uptime}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* SKUs — solo gráfica de barras (top 10) */}
              <div className="rounded-xl border border-border bg-card p-6">
                <h3 className="font-semibold text-foreground mb-4">SKUs más producidos</h3>
                {analytics.skuDistribution.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-12 text-center">
                    Sin producción por SKU en este rango.
                  </p>
                ) : (
                  <ChartContainer
                    className="h-[300px] w-full aspect-auto"
                    config={{ units: { label: "Unidades" } }}
                  >
                    <BarChart
                      data={analytics.skuDistribution.slice(0, 10)}
                      margin={{ left: 8, right: 8 }}
                    >
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="sku" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={70} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="units" radius={[4, 4, 0, 0]}>
                        {analytics.skuDistribution.slice(0, 10).map((s, index) => (
                          <Cell key={s.sku} fill={skuPalette[index % skuPalette.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                )}
              </div>
            </div>

            {/* Advanced Metrics */}
            <div className="rounded-xl border border-border bg-card p-6 space-y-6">
              <h3 className="font-semibold text-foreground">Métricas Avanzadas</h3>
              <KpiCard
                title="Cambios SKU"
                value={analytics.changeovers14d.toLocaleString()}
                subtitle={`${analytics.changeoversPer1k.toFixed(2)}/1k uds`}
                icon={RefreshCw}
                iconColor="text-primary"
              />
              <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-3">
                  <KpiCard
                    title="Tiempo inactivo"
                    value={formatDurationMinutes(machineActivity.totalInactiveMinutes)}
                    subtitle={
                      machineActivity.refDay
                        ? `Día ${new Date(`${machineActivity.refDay}T12:00:00`).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}`
                        : undefined
                    }
                    icon={Clock}
                    iconColor="text-amber-600"
                  />
                  <KpiCard
                    title="Horas con producción"
                    value={String(machineActivity.totalActiveHours)}
                    icon={CheckCircle}
                    iconColor="text-green-600"
                  />
                  <KpiCard
                    title="Tiempo activo"
                    value={`${machineActivity.activePct}%`}
                    icon={Clock}
                    iconColor="text-teal-600"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <KpiCard
                    title="Alertas de operador"
                    value={String(alertRoleCounts.operator)}
                    icon={Users}
                    iconColor="text-blue-600"
                  />
                  <KpiCard
                    title="Alertas de empacador"
                    value={String(alertRoleCounts.packager)}
                    icon={Package}
                    iconColor="text-violet-600"
                  />
                </div>

                <div className="rounded-xl border border-border bg-background p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-3">
                    Actividad por hora
                  </h3>
                  {machineActivity.hourlyTimeline.length === 0 ? (
                    <p className="py-12 text-center text-sm text-muted-foreground">
                      Sin datos de actividad en el día seleccionado.
                    </p>
                  ) : (
                    <ChartContainer
                      className="h-[320px] w-full aspect-auto"
                      config={{
                        activeMinutes: { label: "Activo (min)", color: "#22c55e" },
                        inactiveMinutes: { label: "Inactivo (min)", color: "#f97316" },
                      }}
                    >
                      <BarChart data={machineActivity.hourlyTimeline} margin={{ left: 8, right: 8 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 12 }} domain={[0, 60]} unit=" min" />
                        <ChartTooltip
                          content={
                            <ChartTooltipContent
                              formatter={(value, name) => {
                                const v = typeof value === "number" ? value : Number(value)
                                const label =
                                  name === "activeMinutes" ? "Produciendo" : "Inactivo"
                                return (
                                  <span>
                                    {label}: {Number.isFinite(v) ? `${v} min` : "—"}
                                  </span>
                                )
                              }}
                            />
                          }
                        />
                        <Bar
                          dataKey="activeMinutes"
                          stackId="activity"
                          fill="var(--color-activeMinutes)"
                          radius={[0, 0, 0, 0]}
                        />
                        <Bar
                          dataKey="inactiveMinutes"
                          stackId="activity"
                          fill="var(--color-inactiveMinutes)"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ChartContainer>
                  )}
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="rounded-xl border border-border bg-background p-4">
                    <h3 className="text-sm font-semibold text-foreground mb-3">
                      Inactividad diaria (rango)
                    </h3>
                    <ChartContainer
                      className="h-[280px] w-full aspect-auto"
                      config={{
                        inactiveMinutes: { label: "Inactivo (min)", color: "#f97316" },
                        activeHours: { label: "Horas activas", color: "#22c55e" },
                      }}
                    >
                      <AreaChart data={inactivityDailySeries} margin={{ left: 8, right: 8 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                        <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Area
                          yAxisId="left"
                          type="monotone"
                          dataKey="inactiveMinutes"
                          stroke="var(--color-inactiveMinutes)"
                          fill="var(--color-inactiveMinutes)"
                          fillOpacity={0.2}
                          strokeWidth={2}
                        />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="activeHours"
                          stroke="var(--color-activeHours)"
                          strokeWidth={2}
                          dot={false}
                        />
                      </AreaChart>
                    </ChartContainer>
                  </div>

                  <div className="rounded-xl border border-border bg-background p-4">
                    <h3 className="text-sm font-semibold text-foreground mb-3">Por máquina</h3>
                    <div className="overflow-x-auto max-h-[280px] overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Máquina</TableHead>
                            <TableHead className="text-right">Hrs activas</TableHead>
                            <TableHead className="text-right">Inactivo</TableHead>
                            <TableHead className="text-right">Paros</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {machineActivity.byMachine.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center text-muted-foreground">
                                Sin actividad registrada.
                              </TableCell>
                            </TableRow>
                          ) : (
                            machineActivity.byMachine.map((row) => (
                              <TableRow key={row.machine}>
                                <TableCell className="font-medium">{row.machine}</TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {row.activeHours}h
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {formatDurationMinutes(row.inactiveMinutes)}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {row.inactivityEpisodes}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </div>

                {machineActivity.episodes.length > 0 && (
                  <div className="rounded-xl border border-border bg-background p-4">
                    <h3 className="text-sm font-semibold text-foreground mb-3">
                      Detalle de paros / inactividad
                    </h3>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Máquina</TableHead>
                            <TableHead>Inicio (aprox.)</TableHead>
                            <TableHead>Fin</TableHead>
                            <TableHead>Duración</TableHead>
                            <TableHead>Tipo</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {machineActivity.episodes.slice(0, 20).map((ep, idx) => (
                            <TableRow key={`${ep.machine}-${ep.endedAt}-${idx}`}>
                              <TableCell className="font-medium">{ep.machine}</TableCell>
                              <TableCell className="whitespace-nowrap text-sm">
                                {new Date(ep.startedAt).toLocaleString("es-MX", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-sm">
                                {new Date(ep.endedAt).toLocaleString("es-MX", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </TableCell>
                              <TableCell>{formatDurationMinutes(ep.minutes)}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {ep.alertTypes.join(", ")}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ========== INCIDENCIAS TAB ========== */}
          <TabsContent value="incidencias" className="space-y-6">
            <div className="rounded-xl border border-border bg-card p-6 space-y-6">
              <h3 className="font-semibold text-foreground">Incidencias de turno</h3>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard
                  title="Total incidencias"
                  value={String(shiftIncidentsAnalytics.summary.total)}
                  icon={AlertTriangle}
                  iconColor="text-red-600"
                />
                <KpiCard
                  title="Después del turno"
                  value={String(shiftIncidentsAnalytics.summary.overtimeCount)}
                  icon={Clock}
                  iconColor="text-orange-600"
                />
                <KpiCard
                  title="Salida sin meta"
                  value={String(shiftIncidentsAnalytics.summary.earlyLeaveCount)}
                  icon={Users}
                  iconColor="text-amber-600"
                />
                <KpiCard
                  title="Post-limpieza"
                  value={String(shiftIncidentsAnalytics.summary.postCleaningCount)}
                  icon={AlertTriangle}
                  iconColor="text-red-700"
                />
              </div>

              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha / hora</TableHead>
                      <TableHead>Turno</TableHead>
                      <TableHead>Empleado</TableHead>
                      <TableHead>Máquina</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Uds.</TableHead>
                      <TableHead>Detalle</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shiftIncidentsAnalytics.incidents.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                          Sin incidencias de turno en este periodo.
                        </TableCell>
                      </TableRow>
                    ) : (
                      shiftIncidentsAnalytics.incidents.map((row) => (
                        <TableRow key={row.id} className={shiftIncidentRowClass(row)}>
                          <TableCell className="whitespace-nowrap text-sm">
                            {new Date(row.occurredAt).toLocaleString("es-MX", {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-normal capitalize">
                              {row.shift}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">{row.employeeName}</TableCell>
                          <TableCell>{row.machineLabel}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                row.kind === "post_cleaning_production" ? "destructive" : "secondary"
                              }
                              className="font-normal whitespace-nowrap"
                            >
                              {row.title}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.kind === "early_leave_under_goal"
                              ? `${Math.round(row.goalActual ?? row.units).toLocaleString()} / ${Math.round(row.goalTarget ?? 0).toLocaleString()}`
                              : row.units > 0
                                ? row.units.toLocaleString()
                                : "—"}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-sm max-w-[280px]",
                              row.kind === "post_cleaning_production"
                                ? "text-red-100"
                                : "text-muted-foreground",
                            )}
                          >
                            {row.detail}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </TabsContent>

          {/* ========== MANTENIMIENTO TAB ========== */}
          <TabsContent value="mantenimiento" className="space-y-6">
            <div className="rounded-xl border border-border bg-card p-6 space-y-6">
              <h3 className="font-semibold text-foreground">Mantenimiento</h3>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard
                  title="Check-ins"
                  value={maintenanceMetrics.total.toLocaleString()}
                  icon={Wrench}
                  iconColor="text-blue-600"
                />
                <KpiCard
                  title="Preventivos"
                  value={maintenanceMetrics.preventive.toLocaleString()}
                  subtitle={`${maintenanceMetrics.preventivePct}% del total`}
                  icon={Wrench}
                  iconColor="text-teal-600"
                />
                <KpiCard
                  title="Correctivos"
                  value={maintenanceMetrics.corrective.toLocaleString()}
                  subtitle={`${maintenanceMetrics.correctivePct}% del total`}
                  icon={Wrench}
                  iconColor="text-amber-600"
                />
                <KpiCard
                  title="Sesiones activas"
                  value={maintenanceMetrics.activeNow.toLocaleString()}
                  icon={Timer}
                  iconColor="text-slate-600"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard
                  title="Tiempo en mantenimiento"
                  value={formatMaintenanceDuration(maintenanceMetrics.totalDurationMinutes)}
                  icon={Timer}
                  iconColor="text-indigo-600"
                />
                <KpiCard
                  title="Duración promedio"
                  value={
                    maintenanceMetrics.avgDurationMinutes == null
                      ? "—"
                      : formatMaintenanceDuration(maintenanceMetrics.avgDurationMinutes)
                  }
                  icon={Clock}
                  iconColor="text-indigo-600"
                />
                <KpiCard
                  title="Unidades excluidas"
                  value={maintenanceMetrics.totalExcludedUnits.toLocaleString()}
                  icon={Package}
                  iconColor="text-orange-600"
                />
                <KpiCard
                  title="Máquinas / técnicos"
                  value={`${maintenanceMetrics.uniqueMachines} / ${maintenanceMetrics.uniqueTechnicians}`}
                  icon={Users}
                  iconColor="text-primary"
                />
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-xl border border-border bg-background p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-3">
                    Check-ins por día
                  </h3>
                  {maintenanceMetrics.dailySeries.length === 0 ? (
                    <p className="py-12 text-center text-sm text-muted-foreground">
                      Sin check-ins en el rango seleccionado.
                    </p>
                  ) : (
                    <ChartContainer
                      className="h-[280px] w-full aspect-auto"
                      config={{
                        preventive: { label: "Preventivo", color: "#14b8a6" },
                        corrective: { label: "Correctivo", color: "#f59e0b" },
                      }}
                    >
                      <BarChart data={maintenanceMetrics.dailySeries} margin={{ left: 8, right: 8 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="preventive" stackId="maint" fill="var(--color-preventive)" />
                        <Bar
                          dataKey="corrective"
                          stackId="maint"
                          fill="var(--color-corrective)"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ChartContainer>
                  )}
                </div>

                <div className="rounded-xl border border-border bg-background p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-3">
                    Preventivo vs correctivo
                  </h3>
                  {maintenanceMetrics.total === 0 ? (
                    <p className="py-12 text-center text-sm text-muted-foreground">Sin datos.</p>
                  ) : (
                    <ChartContainer
                      className="h-[280px] w-full aspect-auto"
                      config={{
                        preventive: { label: "Preventivo", color: "#14b8a6" },
                        corrective: { label: "Correctivo", color: "#f59e0b" },
                      }}
                    >
                      <PieChart>
                        <Pie
                          data={maintenanceMetrics.typeDistribution.filter((d) => d.count > 0)}
                          dataKey="count"
                          nameKey="label"
                          cx="50%"
                          cy="50%"
                          outerRadius={90}
                          label={({ label, percent }) =>
                            `${label} ${(percent * 100).toFixed(0)}%`
                          }
                        >
                          {maintenanceMetrics.typeDistribution.map((entry) => (
                            <Cell
                              key={entry.type}
                              fill={
                                entry.type === "preventive"
                                  ? "var(--color-preventive)"
                                  : "var(--color-corrective)"
                              }
                            />
                          ))}
                        </Pie>
                        <ChartTooltip content={<ChartTooltipContent />} />
                      </PieChart>
                    </ChartContainer>
                  )}
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-xl border border-border bg-background p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-3">
                    Máquinas con más intervenciones
                  </h3>
                  <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Máquina</TableHead>
                          <TableHead className="text-right">Visitas</TableHead>
                          <TableHead className="text-right">Prev.</TableHead>
                          <TableHead className="text-right">Corr.</TableHead>
                          <TableHead className="text-right">Tiempo</TableHead>
                          <TableHead className="text-right">Uds excl.</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {maintenanceMetrics.byMachine.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground">
                              Sin intervenciones.
                            </TableCell>
                          </TableRow>
                        ) : (
                          maintenanceMetrics.byMachine.slice(0, 12).map((row) => (
                            <TableRow key={row.machineId}>
                              <TableCell className="font-medium">{row.machineCode}</TableCell>
                              <TableCell className="text-right tabular-nums">{row.visits}</TableCell>
                              <TableCell className="text-right tabular-nums">{row.preventive}</TableCell>
                              <TableCell className="text-right tabular-nums">{row.corrective}</TableCell>
                              <TableCell className="text-right tabular-nums text-sm">
                                {formatMaintenanceDuration(row.durationMinutes)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {row.excludedUnits.toLocaleString()}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-background p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-3">Por técnico</h3>
                  <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Técnico</TableHead>
                          <TableHead className="text-right">Visitas</TableHead>
                          <TableHead className="text-right">Prev.</TableHead>
                          <TableHead className="text-right">Corr.</TableHead>
                          <TableHead className="text-right">Tiempo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {maintenanceTechnicianRows.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground">
                              Sin técnicos registrados.
                            </TableCell>
                          </TableRow>
                        ) : (
                          maintenanceTechnicianRows.slice(0, 12).map((row) => (
                            <TableRow key={row.employeeCode}>
                              <TableCell className="font-medium">{row.technician}</TableCell>
                              <TableCell className="text-right tabular-nums">{row.visits}</TableCell>
                              <TableCell className="text-right tabular-nums">{row.preventive}</TableCell>
                              <TableCell className="text-right tabular-nums">{row.corrective}</TableCell>
                              <TableCell className="text-right tabular-nums text-sm">
                                {formatMaintenanceDuration(row.durationMinutes)}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-background p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3">
                  Detalle de sesiones
                </h3>
                {maintenanceVisitRowsDisplay.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Sin check-ins de mantenimiento en este rango.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Entrada</TableHead>
                          <TableHead>Salida</TableHead>
                          <TableHead>Máquina</TableHead>
                          <TableHead>Técnico</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead className="text-right">Duración</TableHead>
                          <TableHead className="text-right">Uds excl.</TableHead>
                          <TableHead className="text-right">Estado</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {maintenanceVisitRowsDisplay.map((row) => (
                          <TableRow key={row.sessionId}>
                            <TableCell className="whitespace-nowrap text-sm">
                              {new Date(row.startedAt).toLocaleString("es-MX", {
                                day: "2-digit",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                              {row.endedAt
                                ? new Date(row.endedAt).toLocaleString("es-MX", {
                                    day: "2-digit",
                                    month: "short",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "—"}
                            </TableCell>
                            <TableCell className="font-medium">{row.machineCode}</TableCell>
                            <TableCell>{row.technician}</TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn(
                                  row.visitType === "preventive"
                                    ? "border-teal-200 bg-teal-50 text-teal-800"
                                    : "border-amber-200 bg-amber-50 text-amber-900",
                                )}
                              >
                                {MAINTENANCE_VISIT_TYPE_LABELS[row.visitType]}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-sm">
                              {row.durationMinutes == null
                                ? "—"
                                : formatMaintenanceDuration(row.durationMinutes)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {row.excludedUnits > 0 ? row.excludedUnits.toLocaleString() : "—"}
                            </TableCell>
                            <TableCell className="text-right text-sm text-muted-foreground">
                              {row.isActive ? (
                                <Badge className="bg-blue-100 text-blue-800">Activa</Badge>
                              ) : (
                                "Cerrada"
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ========== OPERADORES & EMPACADORES TAB ========== */}
          <TabsContent value="operadores" className="space-y-6">
            {/* Comparativa por persona y rol */}
            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="font-semibold text-foreground mb-4">Comparativa por persona y rol</h3>
              {analytics.personRoleComparison.length === 0 ? (
                <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-4 text-center text-sm text-muted-foreground">
                  Sin unidades atribuidas a personas en este rango.
                </div>
              ) : (
                <div className="grid gap-6 lg:grid-cols-2">
                  <ChartContainer
                    className="h-[min(420px,50vh)] w-full aspect-auto"
                    config={{ units: { label: "Unidades", color: "#22c55e" } }}
                  >
                    <BarChart
                      layout="vertical"
                      data={analytics.personRoleComparison.slice(0, 14)}
                      margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
                    >
                      <CartesianGrid horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 12 }} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={108}
                        tick={{ fontSize: 11 }}
                        interval={0}
                      />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            formatter={(value, _name, item) => {
                              const row = item?.payload as {
                                role?: string
                                sharePct?: number
                              }
                              const u = typeof value === "number" ? value : Number(value)
                              const uTxt = Number.isFinite(u)
                                ? u.toLocaleString("es-MX", { maximumFractionDigits: 1 })
                                : String(value)
                              return (
                                <span>
                                  {uTxt} uds
                                  {row?.role ? ` · ${row.role}` : ""}
                                  {row?.sharePct != null ? ` (${row.sharePct}% del total)` : ""}
                                </span>
                              )
                            }}
                          />
                        }
                      />
                      <Bar dataKey="units" radius={[0, 4, 4, 0]}>
                        {analytics.personRoleComparison.slice(0, 14).map((entry) => (
                          <Cell key={entry.name} fill={personRoleBarColor(entry.role)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ChartContainer>

                  <div className="max-h-[min(420px,50vh)] overflow-y-auto rounded-lg border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Persona</TableHead>
                          <TableHead>Rol</TableHead>
                          <TableHead className="text-right">Unidades</TableHead>
                          <TableHead className="text-right">% total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analytics.personRoleComparison.map((row) => (
                          <TableRow key={row.name}>
                            <TableCell className="font-medium">{row.name}</TableCell>
                            <TableCell>
                              <span
                                className="inline-flex items-center gap-1.5 text-sm"
                                title={
                                  row.operatorUnits > 0 && row.packerUnits > 0
                                    ? `Operador: ${row.operatorUnits.toLocaleString("es-MX")} · Empacador: ${row.packerUnits.toLocaleString("es-MX")}`
                                    : undefined
                                }
                              >
                                <span
                                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                                  style={{ backgroundColor: personRoleBarColor(row.role) }}
                                />
                                {row.role}
                              </span>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {row.units.toLocaleString("es-MX", { maximumFractionDigits: 1 })}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {row.sharePct}%
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>

            {/* Top Operadores & Empacadores */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Top Operadores */}
              <div className="rounded-xl border border-border bg-card p-6">
                <h3 className="font-semibold text-foreground mb-4">Top Operadores por Unidades</h3>
                <ChartContainer
                  className="h-[320px] w-full aspect-auto"
                  config={{ units: { label: "Unidades", color: "#22c55e" } }}
                >
                  <BarChart data={analytics.topOperators} margin={{ left: 8, right: 8 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="units" radius={[4, 4, 0, 0]}>
                      {analytics.topOperators.map((entry, index) => (
                        <Cell key={entry.name} fill={operatorBarPalette[index % operatorBarPalette.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ChartContainer>
              </div>

              {/* Top Empacadores */}
              <div className="rounded-xl border border-border bg-card p-6">
                <h3 className="font-semibold text-foreground mb-4">Top Empacadores por Unidades</h3>
                <ChartContainer
                  className="h-[320px] w-full aspect-auto"
                  config={{ units: { label: "Unidades", color: "#3b82f6" } }}
                >
                  <BarChart data={analytics.topPackers.slice(0, 8)} margin={{ left: 8, right: 8 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="units" radius={[4, 4, 0, 0]}>
                      {analytics.topPackers.slice(0, 8).map((entry, index) => (
                        <Cell key={entry.name} fill={operatorBarPalette[index % operatorBarPalette.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ChartContainer>
              </div>
            </div>

            {/* Detalle Operadores & Empacadores */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Operadores Detalle */}
              <div className="rounded-xl border border-border bg-card p-6">
                <h3 className="font-semibold text-foreground mb-4">Operadores - Detalle</h3>
                <div className="h-[320px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Operador</TableHead>
                        <TableHead className="text-right">Unidades</TableHead>
                        <TableHead className="text-right">Paros</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analytics.topOperators.map((op) => (
                        <TableRow key={op.name}>
                          <TableCell className="font-medium">{op.name}</TableCell>
                          <TableCell className="text-right tabular-nums">{op.units.toLocaleString()}</TableCell>
                          <TableCell className="text-right tabular-nums">{op.downtime}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Empacadores Detalle */}
              <div className="rounded-xl border border-border bg-card p-6">
                <h3 className="font-semibold text-foreground mb-4">Empacadores - Detalle</h3>
                <div className="h-[320px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Empacador</TableHead>
                        <TableHead className="text-right">Unidades</TableHead>
                        <TableHead className="text-right">Lotes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analytics.topPackers.map((p) => (
                        <TableRow key={p.name}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell className="text-right tabular-nums">{p.units.toLocaleString()}</TableCell>
                          <TableCell className="text-right tabular-nums">{p.jobs.toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ========== ASISTENCIA TAB ========== */}
          <TabsContent value="asistencia" className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <KpiCard
                title="Empleados en vacaciones"
                value={String(vacationSummary.employeesWithVacation)}
                icon={Palmtree}
                iconColor="text-green-600"
              />
              <KpiCard
                title="Días de vacación"
                value={String(vacationSummary.totalVacationDays)}
                icon={CalendarDays}
                iconColor="text-emerald-600"
              />
              <KpiCard
                title="De vacaciones hoy"
                value={String(vacationSummary.onVacationToday)}
                icon={UserMinus}
                iconColor="text-amber-600"
              />
            </div>

            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="font-semibold text-foreground mb-4">Días de vacaciones por empleado</h3>
              {vacationDaysByEmployee.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Sin vacaciones registradas en este período.
                </p>
              ) : (
                <div className="max-h-[360px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Empleado</TableHead>
                        <TableHead>Código</TableHead>
                        <TableHead className="text-right">Días</TableHead>
                        <TableHead>Último día</TableHead>
                        <TableHead className="text-right">Hoy</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vacationDaysByEmployee.map((row) => (
                        <TableRow key={row.employeeId}>
                          <TableCell className="font-medium">{row.employeeName}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {row.employeeCode ?? "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-semibold">
                            {row.vacationDays}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {row.lastVacationDate ?? "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {row.onVacationToday ? (
                              <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                                En vacaciones
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="font-semibold text-foreground mb-4">Registros de asistencias</h3>
              <AttendanceTable records={filteredAttendanceRecords} onDelete={() => {}} />
            </div>
          </TabsContent>

          {/* ========== ROTACIÓN TAB ========== */}
          <TabsContent value="rotacion" className="space-y-6">
            {/* KPIs */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <KpiCard
                title="Personal Activo"
                value={employeeRows.filter((e) => e.status === "active").length.toString()}
                icon={Users}
                iconColor="text-primary"
              />
              <KpiCard
                title="Turnover"
                value={formatTurnoverPercent(turnoverMetrics.turnoverPercent)}
                icon={Percent}
                iconColor="text-violet-600"
              />
              <KpiCard
                title="Altas"
                value={String(personnelMonthSummary.ingresos)}
                icon={UserPlus}
                iconColor="text-green-600"
              />
              <KpiCard
                title="Bajas"
                value={String(personnelMonthSummary.salidas)}
                icon={UserMinus}
                iconColor="text-red-600"
              />
              <KpiCard
                title="Balance (mes)"
                value={
                  personnelMonthSummary.net > 0
                    ? `+${personnelMonthSummary.net}`
                    : String(personnelMonthSummary.net)
                }
                icon={RefreshCw}
                iconColor="text-yellow-600"
              />
            </div>

            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="font-semibold text-foreground mb-4">Turnover de personal</h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Bajas del mes</p>
                  <p className="text-2xl font-bold tabular-nums text-red-700">
                    {turnoverMetrics.terminations}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Altas del mes</p>
                  <p className="text-2xl font-bold tabular-nums text-green-700">
                    {turnoverMetrics.hires}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    Plantilla mes anterior
                  </p>
                  <p className="text-2xl font-bold tabular-nums">
                    {turnoverMetrics.totalEmployeesLastMonth}
                  </p>
                </div>
                <div className="rounded-lg border border-violet-200 bg-violet-50/50 px-4 py-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Turnover</p>
                  <p className="text-2xl font-bold tabular-nums text-violet-800">
                    {formatTurnoverPercent(turnoverMetrics.turnoverPercent)}
                  </p>
                </div>
              </div>
            </div>

            {/* Historial y Resumen (altas/bajas de empleados) */}
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2 rounded-xl border border-border bg-card p-6">
                <h3 className="font-semibold text-foreground mb-4">Movimientos de Personal</h3>
                <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                  {personnelMovements.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">
                      Sin altas ni bajas registradas.
                    </p>
                  ) : (
                    personnelMovements.map((mov) => (
                      <div
                        key={mov.id}
                        className="border border-border rounded-lg p-3 flex items-center gap-3"
                      >
                        <div
                          className={cn(
                            "flex h-8 w-8 items-center justify-center rounded-full shrink-0",
                            mov.kind === "ingreso" ? "bg-green-100" : "bg-red-100",
                          )}
                        >
                          {mov.kind === "ingreso" ? (
                            <UserPlus className="h-4 w-4 text-green-600" />
                          ) : (
                            <UserMinus className="h-4 w-4 text-red-600" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{mov.employeeName}</p>
                          <p className="text-xs text-muted-foreground wrap-break-word">{mov.subtitle}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-6">
                <h3 className="font-semibold text-foreground mb-4">Resumen del Mes</h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Altas</span>
                      <span className="font-bold text-green-600">+{personnelMonthSummary.ingresos}</span>
                    </div>
                    <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 transition-[width]"
                        style={{ width: `${personnelMonthSummary.ingPct}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Bajas</span>
                      <span className="font-bold text-red-600">-{personnelMonthSummary.salidas}</span>
                    </div>
                    <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-red-500 transition-[width]"
                        style={{ width: `${personnelMonthSummary.salPct}%` }}
                      />
                    </div>
                  </div>
                  <div className="pt-2 border-t border-border">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">Neto</span>
                      <span
                        className={cn(
                          "text-lg font-bold",
                          personnelMonthSummary.net >= 0 ? "text-primary" : "text-destructive",
                        )}
                      >
                        {personnelMonthSummary.net > 0
                          ? `+${personnelMonthSummary.net}`
                          : personnelMonthSummary.net}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
    </RequireModule>
  )
}
