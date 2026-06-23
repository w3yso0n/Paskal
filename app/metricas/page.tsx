"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { AttendanceTable } from "@/components/attendance/attendance-table"
import { AttendanceStatsCards } from "@/components/attendance/attendance-stats-cards"
import { Button } from "@/components/ui/button"
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
  DialogDescription,
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
  TrendingUp,
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
  getMetrics,
  type ApiGoal,
  type ApiMetric,
  type ApiEmployee,
  type ApiMachine,
  type ApiMachineCheckin,
  type ApiProductionEvent,
} from "@/lib/api"
import { filterFloorMachines } from "@/lib/machine-floor"
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

type ProductionEventType =
  | "Producción"
  | "Cambio SKU"
  | "Parada"

type ShiftType = "matutino" | "vespertino"

interface ProductionBaseRow {
  machine_id: string
  /** UUID de máquina en API (para enriquecer empacadores desde check-in). */
  machineIdRaw: string | null
  timestamp: string // ISO
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

/** Check-in NFC más plausible para una máquina y un instante (ventana o activo). */
function findBestCheckinForMachineAndTime(
  machineId: string | null | undefined,
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

/** Nombre a mostrar del operador principal si el evento no trae OPERATOR_1 / OPERATOR en payload. */
function primaryOperatorLabelFromCheckin(
  machineId: string | null | undefined,
  occurredAtMs: number,
  checkins: ApiMachineCheckin[],
  resolvePerson: (raw: string | undefined) => string,
): string | null {
  const ch = findBestCheckinForMachineAndTime(machineId, occurredAtMs, checkins)
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
  checkins: ApiMachineCheckin[],
  resolvePerson: (raw: string | undefined) => string,
): string[] {
  const ch = findBestCheckinForMachineAndTime(machineId, occurredAtMs, checkins)
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
    const label = (m.code ?? m.name).trim() || m.name
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

  return events.map((e: ApiProductionEvent) => {
    const payload = e.payload ?? {}
    const eventRaw = String(payloadString(payload, "EVENT", "event") ?? e.eventType ?? "")
    const lower = eventRaw.toLowerCase()
    const event: ProductionEventType =
      eventRaw === "Cambio SKU" || eventRaw === "Parada" || eventRaw === "Producción"
        ? (eventRaw as ProductionEventType)
        : lower.includes("cambio") || lower.includes("sku")
          ? "Cambio SKU"
          : lower.includes("paro") || lower.includes("down")
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
        checkins,
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
      const ch = findBestCheckinForMachineAndTime(e.machineId, new Date(ts).getTime(), checkins)
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
        checkins,
        resolvePerson,
      )
    }
    const packer_1 = packersAttributed[0] ?? "—"
    const packer_2 = packersAttributed[1] ?? "—"

    return {
      machine_id,
      machineIdRaw: e.machineId?.trim() ?? null,
      timestamp: ts,
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

/** Movimientos para pestaña Rotación: ingreso/salida por persona según check-in en máquina. */
function buildPersonnelMovementsFromCheckins(
  checkins: ApiMachineCheckin[],
  employees: ApiEmployee[],
): PersonnelMovementItem[] {
  const codeToName = buildEmployeeCodeToNameMap(employees)
  const posByCode = new Map<string, string>()
  for (const e of employees) {
    const c = e.employeeCode?.trim()
    if (!c) continue
    const p = (e.position ?? "").trim() || "Colaborador"
    posByCode.set(c, p)
    posByCode.set(c.toLowerCase(), p)
  }
  const resolve = (code: string) =>
    codeToName.get(code) ?? codeToName.get(code.toLowerCase()) ?? code
  const roleLine = (code: string) =>
    posByCode.get(code) ?? posByCode.get(code.toLowerCase()) ?? "Colaborador"
  const fmtShort = (d: Date) =>
    d.toLocaleDateString("es-MX", { year: "numeric", month: "short", day: "2-digit" })

  const out: PersonnelMovementItem[] = []
  for (const c of checkins) {
    const people: { code: string }[] = []
    const op1 = c.operatorCode?.trim()
    if (op1) people.push({ code: op1 })
    if (c.operator2Code?.trim()) people.push({ code: c.operator2Code.trim() })
    const pks = [c.packager1Code, c.packager2Code, c.packager3Code, c.packager4Code]
    pks.forEach((pk) => {
      const t = pk?.trim()
      if (t) people.push({ code: t })
    })
    const checkedIn = new Date(c.checkedInAt)
    const checkedOut = c.checkedOutAt ? new Date(c.checkedOutAt) : null
    for (const p of people) {
      const name = resolve(p.code)
      const role = roleLine(p.code)
      out.push({
        id: `${c.id}-in-${p.code}`,
        kind: "ingreso",
        employeeName: name,
        subtitle: `Ingreso • ${fmtShort(checkedIn)} • ${role} · ${c.machineCode}`,
        at: checkedIn.getTime(),
      })
      if (checkedOut) {
        out.push({
          id: `${c.id}-out-${p.code}`,
          kind: "salida",
          employeeName: name,
          subtitle: `Salida • ${fmtShort(checkedOut)} · ${c.machineCode} (fin asignación)`,
          at: checkedOut.getTime(),
        })
      }
    }
  }
  return out.sort((a, b) => b.at - a.at)
}

export default function MetricsPage() {
  const { getAccessToken } = useAuth()
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

  const getShift = (date: Date): ShiftType | null => {
    const hour = date.getHours()
    if (hour >= 6 && hour < 14) return "matutino"
    if (hour >= 14 && hour < 22) return "vespertino"
    return null
  }

  const [productionBaseRows, setProductionBaseRows] = useState<ProductionBaseRow[]>([])
  const [employeeRows, setEmployeeRows] = useState<ApiEmployee[]>([])
  const [goalsRows, setGoalsRows] = useState<ApiGoal[]>([])
  const [metricsRows, setMetricsRows] = useState<ApiMetric[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [dataError, setDataError] = useState<string | null>(null)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [machineCheckinsLoaded, setMachineCheckinsLoaded] = useState<ApiMachineCheckin[]>([])
  const attendanceStats = useMemo(() => [] as unknown[], [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const token = await getAccessToken()
      if (!token) {
        if (!cancelled) {
          setProductionBaseRows([])
          setEmployeeRows([])
          setMachineCheckinsLoaded([])
          setDataLoading(false)
          setDataError(null)
        }
        return
      }

      if (!cancelled) {
        setDataLoading(true)
        setDataError(null)
      }

      try {
        const fromIso = new Date(`${filterStartDate}T00:00:00`).toISOString()
        const toIso = new Date(`${filterEndDate}T23:59:59.999`).toISOString()

        const [events, employees, apiMachines, checkins, goals, metrics] = await Promise.all([
          getProductionEvents(token, { from: fromIso, to: toIso, limit: 120_000 }),
          getEmployees(token),
          getMachines(token),
          getMachineCheckins(token, { from: fromIso, to: toIso, limit: 20_000 }),
          getGoals(token),
          getMetrics(token),
        ])
        if (cancelled) return

        setEmployeeRows(employees)
        setGoalsRows(goals)
        setMetricsRows(metrics)
        setMachineCheckinsLoaded(checkins)

        const mapped = mapEventsToProductionBaseRows(events, checkins, employees, apiMachines)

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
            posibleCortePorLimiteApi: events.length >= 119_000,
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
          setProductionBaseRows([])
          setMachineCheckinsLoaded([])
          setDataError(err instanceof Error ? err.message : "No se pudieron cargar los datos")
        }
      } finally {
        if (!cancelled) setDataLoading(false)
      }
    }

    load()
    const intervalId = window.setInterval(load, 30_000)
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
    // Parse filter dates
    const startDate = new Date(filterStartDate)
    startDate.setHours(0, 0, 0, 0)
    const endDate = new Date(filterEndDate)
    endDate.setHours(23, 59, 59, 999)

    // Filter rows by selected date range
    const rows14d = productionBaseRows.filter((r) => {
      const rowDate = new Date(r.timestamp)
      return rowDate >= startDate && rowDate <= endDate
    })

    const produced14d = rows14d
      .filter((r) => r.event === "Producción")
      .reduce((acc, r) => acc + r.count, 0)
    const changeovers14d = rows14d.filter((r) => r.event === "Cambio SKU").length

    const changeoversPer1k = produced14d > 0 ? (changeovers14d / produced14d) * 1000 : 0

    const dailyAgg = new Map<string, { produced: number; downtime: number }>()
    const dailyShiftAgg = new Map<
      string,
      {
        date: string
        matutinoProduced: number
        vespertinoProduced: number
        matutinoDowntime: number
        vespertinoDowntime: number
      }
    >()
    const operatorAgg = new Map<string, { units: number; downtime: number }>()
    const packerAgg = new Map<string, { units: number; jobs: number }>()
    const skuAgg = new Map<string, number>()
    const machineAgg = new Map<string, { produced: number; downtime: number }>()

    const shiftAgg = {
      matutino: {
        produced: 0,
        downtime: 0,
        changeovers: 0,
      },
      vespertino: {
        produced: 0,
        downtime: 0,
        changeovers: 0,
      },
    }

    for (const r of rows14d) {
      const ts = new Date(r.timestamp)
      const dayKey = formatDate(ts)
      const shift = getShift(ts)

      const day = dailyAgg.get(dayKey) ?? { produced: 0, downtime: 0 }
      if (r.event === "Producción") day.produced += r.count
      if (["Parada"].includes(r.event)) day.downtime += 1
      dailyAgg.set(dayKey, day)

      if (shift) {
        const d =
          dailyShiftAgg.get(dayKey) ??
          {
            date: dayKey.slice(5),
            matutinoProduced: 0,
            vespertinoProduced: 0,
            matutinoDowntime: 0,
            vespertinoDowntime: 0,
          }

        if (r.event === "Producción") {
          if (shift === "matutino") d.matutinoProduced += r.count
          if (shift === "vespertino") d.vespertinoProduced += r.count
        }
        if (["Parada"].includes(r.event)) {
          if (shift === "matutino") d.matutinoDowntime += 1
          if (shift === "vespertino") d.vespertinoDowntime += 1
        }
        dailyShiftAgg.set(dayKey, d)

        const s = shiftAgg[shift]
        if (r.event === "Producción") s.produced += r.count
        if (r.event === "Cambio SKU") s.changeovers += 1
        if (["Parada"].includes(r.event)) s.downtime += 1
      }

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
          }
        }
      }
    }

    const dailySeries = [...dailyAgg.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({ date: date.slice(5), produced: v.produced, downtime: v.downtime }))

    const shiftDailySeries = [...dailyShiftAgg.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, v]) => v)

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

    const packerDistribution = [...packerAgg.entries()]
      .map(([name, v]) => ({ name, units: Number(v.units.toFixed(1)), jobs: v.jobs }))
      .sort((a, b) => b.units - a.units)

    const shiftComparisonMetrics = [
      {
        metric: "Producción",
        matutino: shiftAgg.matutino.produced,
        vespertino: shiftAgg.vespertino.produced,
      },
      {
        metric: "Paros (conteo)",
        matutino: shiftAgg.matutino.downtime,
        vespertino: shiftAgg.vespertino.downtime,
      },
      {
        metric: "Cambios SKU",
        matutino: shiftAgg.matutino.changeovers,
        vespertino: shiftAgg.vespertino.changeovers,
      },
    ]

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
      shiftDailySeries,
      shiftComparisonMetrics,
      topOperators,
      operatorDistributionPie,
      topPackers,
      topSkus,
      skuDistribution,
      packerDistribution,
      machineScatter,
    }
  }, [productionBaseRows, filterStartDate, filterEndDate])

  // Último día del rango que tenga al menos un evento de producción.
  const lastDayWithData = useMemo(() => {
    let best: string | null = null
    for (const r of productionBaseRows) {
      if (r.event !== "Producción") continue
      const ts = new Date(r.timestamp)
      if (Number.isNaN(ts.getTime())) continue
      const dayStr = formatDate(ts)
      if (!best || dayStr > best) best = dayStr
    }
    return best
  }, [productionBaseRows])

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
    for (const r of productionBaseRows) {
      if (r.event !== "Producción") continue
      const ts = new Date(r.timestamp)
      if (Number.isNaN(ts.getTime())) continue
      if (ts < start || ts > end) continue
      const hour = String(ts.getHours()).padStart(2, "0")
      byHour.set(hour, (byHour.get(hour) ?? 0) + (Number(r.count) || 0))
    }

    return [...byHour.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([hour, production]) => ({ hour: `${hour}:00`, production }))
  }, [productionBaseRows, lastDayWithData, filterEndDate])

  const topMachinesData = useMemo(() => {
    const start = new Date(filterStartDate)
    start.setHours(0, 0, 0, 0)
    const end = new Date(filterEndDate)
    end.setHours(23, 59, 59, 999)
    const daysInRange = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000))

    /** Operador con más unidades atribuidas en el rango (evita mostrar solo el último evento del bucle). */
    const operatorUnitsByMachine = new Map<string, Map<string, number>>()
    for (const r of productionBaseRows) {
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
  }, [analytics.machineScatter, productionBaseRows, filterStartDate, filterEndDate])

  const productionMetricId = useMemo(
    () => metricsRows.find((m) => m.name.trim().toLowerCase() === "producción")?.id ?? null,
    [metricsRows],
  )

  const monthlyGoalSummary = useMemo(() => {
    if (!productionMetricId) return null
    const rangeStart = filterStartDate
    const rangeEnd = filterEndDate
    const monthlyGoals = goalsRows.filter((g) => {
      if (g.metricId !== productionMetricId) return false
      if (g.period !== "monthly") return false
      if (g.sku?.trim()) return false
      return g.startDate <= rangeEnd && g.endDate >= rangeStart
    })
    if (monthlyGoals.length === 0) return null
    const target = monthlyGoals.reduce((acc, g) => acc + Number(g.targetValue || 0), 0)
    if (target <= 0) return null
    const actual = analytics.produced14d
    const pct = Math.round((actual / target) * 100)
    return { target, actual, pct }
  }, [
    goalsRows,
    productionMetricId,
    filterStartDate,
    filterEndDate,
    analytics.produced14d,
  ])

  const attendanceFromCheckins = useMemo(
    () => machineCheckinsToAttendanceRecords(machineCheckinsLoaded, employeeRows),
    [machineCheckinsLoaded, employeeRows],
  )

  // Filtro por calendario (los check-ins ya vienen acotados por API, esto alinea con Desde/Hasta).
  const filteredAttendanceRecords = useMemo(() => {
    const startDate = new Date(filterStartDate)
    startDate.setHours(0, 0, 0, 0)
    const endDate = new Date(filterEndDate)
    endDate.setHours(23, 59, 59, 999)

    return attendanceFromCheckins.filter((record) => {
      const recordDate = new Date(record.date)
      recordDate.setHours(0, 0, 0, 0)
      return recordDate >= startDate && recordDate <= endDate
    })
  }, [filterStartDate, filterEndDate, attendanceFromCheckins])

  const personnelMovements = useMemo(
    () => buildPersonnelMovementsFromCheckins(machineCheckinsLoaded, employeeRows).slice(0, 40),
    [machineCheckinsLoaded, employeeRows],
  )

  const personnelMonthSummary = useMemo(() => {
    const now = new Date()
    const inCurrentMonth = (ts: number) => {
      const d = new Date(ts)
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    }
    const all = buildPersonnelMovementsFromCheckins(machineCheckinsLoaded, employeeRows)
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
  }, [machineCheckinsLoaded, employeeRows])

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
        const [windingRows, bendingRows, goals, metrics] = await Promise.all([
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
          getGoals(token),
          getMetrics(token),
        ])
        const productionMetricId =
          metrics.find((m) => m.name.trim().toLowerCase() === "producción")?.id ?? null
        reportConfiguredSkus = productionMetricId
          ? [
              ...new Set(
                goals
                  .filter((g) => {
                    const sku = g.sku?.trim()
                    if (!sku || g.metricId !== productionMetricId) return false
                    return g.startDate <= monthBounds.end && g.endDate >= monthBounds.start
                  })
                  .map((g) => g.sku!.trim()),
              ),
            ]
          : []
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
          position: e.position,
        }))
      }

      let productionConfig = undefined
      let resolvedHolidayIsos: string[] | undefined
      if (token) {
        try {
          const cfg = await getBonusProductionConfigForMonth(token, bonusReportDate)
          productionConfig = cfg.config
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

  // Promedio/minuto: unidades en el rango ÷ slots de minuto con producción.
  const avgPerMinute = useMemo(() => {
    let total = 0
    const minuteSlots = new Set<string>()
    for (const r of productionBaseRows) {
      if (r.event !== "Producción") continue
      const ts = new Date(r.timestamp)
      if (Number.isNaN(ts.getTime())) continue
      total += Number(r.count) || 0
      minuteSlots.add(ts.toISOString().slice(0, 16))
    }
    if (minuteSlots.size === 0 || total === 0) return null
    return Math.round((total / minuteSlots.size) * 100) / 100
  }, [productionBaseRows])


  const todayStr = formatDate(new Date())
  const refDayLabel = lastDayWithData ?? filterEndDate
  const productionDayLabel =
    refDayLabel === todayStr
      ? "Producción Hoy"
      : lastDayWithData
        ? `Producción ${new Date(`${lastDayWithData}T12:00:00`).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}`
        : "Producción"

  return (
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
          <p className="text-muted-foreground">
            Monitoreo integral de producción, operadores, asistencia y rotación de personal
          </p>
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

          <p className="mt-2 text-xs text-muted-foreground">
            Mostrando del{" "}
            <span className="font-medium">{filterStartDate}</span> al{" "}
            <span className="font-medium">{filterEndDate}</span>
          </p>
        </div>

        {/* Custom date-range dialog */}
        <Dialog open={customRangeOpen} onOpenChange={setCustomRangeOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" />
                Elegir rango de fechas
              </DialogTitle>
              <DialogDescription>
                Selecciona un día o un rango. Si eliges el mismo día en ambos campos verás solo ese día.
              </DialogDescription>
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
              <DialogDescription>
                Elige el mes del reporte y el rango de fechas con producción a incluir. Las metas,
                bonos y reglas se toman de{" "}
                <Link href="/reglas-negocio?tab=bono" className="text-primary underline">
                  Reglas de negocio → Configuración de bono
                </Link>
                ; vacaciones e incidencias de Gestión de empleados; bending/roller de Captura de
                datos.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Mes del reporte</label>
                <MonthPicker value={bonusReportDate} onChange={handleBonusMonthChange} />
                <p className="text-xs text-muted-foreground">
                  Define la estructura mensual del Excel (semanas y columnas del mes seleccionado).
                </p>
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
                <p className="text-xs text-muted-foreground">
                  Solo se incluyen eventos de producción entre estas fechas. Al generar, los datos
                  se cargan directamente del mes elegido (no dependen del filtro superior de
                  Métricas).
                </p>
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
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="produccion">Producción</TabsTrigger>
            <TabsTrigger value="operadores">Operadores & Empacadores</TabsTrigger>
            <TabsTrigger value="asistencia">Asistencia</TabsTrigger>
            <TabsTrigger value="rotacion">Rotación</TabsTrigger>
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
                    <p className="text-xs text-muted-foreground">
                      Se generan hojas del 01 al último día del mes seleccionado.
                    </p>
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

                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={reportBothShifts}
                      onCheckedChange={(v) => setReportBothShifts(Boolean(v))}
                    />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">Descargar ambos turnos</p>
                      <p className="text-sm text-muted-foreground">
                        Genera dos archivos (Turno 1 y Turno 2) para la misma fecha
                      </p>
                    </div>
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
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                title={productionDayLabel}
                value={productionToday == null ? "—" : productionToday.toLocaleString()}
                subtitle="Unidades"
                icon={CheckCircle}
                iconColor="text-primary"
              />
              <KpiCard
                title="Promedio/Minuto"
                value={avgPerMinute == null ? "—" : avgPerMinute.toLocaleString()}
                subtitle="Unidades"
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
                <h3 className="font-semibold text-foreground mb-1">SKUs más producidos</h3>
                <p className="text-xs text-muted-foreground mb-4">Top 10 en el rango seleccionado</p>
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

            {/* Advanced Metrics - KPIs */}
            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="font-semibold text-foreground mb-4">Métricas Avanzadas</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <KpiCard
                  title="Cambios SKU"
                  value={analytics.changeovers14d.toLocaleString()}
                  subtitle={`${analytics.changeoversPer1k.toFixed(2)}/1k uds`}
                  icon={RefreshCw}
                  iconColor="text-primary"
                />
                <KpiCard
                  title="Producción "
                  value={analytics.produced14d.toLocaleString()}
                  subtitle="Unidades"
                  icon={TrendingUp}
                  iconColor="text-primary"
                />
              </div>
            </div>

            {/* Advanced Tabs */}
            <Tabs defaultValue="prod-vs-downtime" className="space-y-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="prod-vs-downtime">Producción vs Paros</TabsTrigger>
                <TabsTrigger value="skus">SKUs</TabsTrigger>
                <TabsTrigger value="turnos">Comparación de Turnos</TabsTrigger>
              </TabsList>

              {/* Producción vs Paros */}
              <TabsContent value="prod-vs-downtime" className="space-y-4">
                <div className="rounded-xl border border-border bg-background p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-3">Producción vs Paros (Diario)</h3>
                  <ChartContainer
                    className="h-[300px] w-full aspect-auto"
                    config={{
                      produced: { label: "Producción", color: "#22c55e" },
                      downtime: { label: "Paros", color: "#f97316" },
                    }}
                  >
                    <AreaChart data={analytics.dailySeries} margin={{ left: 8, right: 8 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Area type="monotone" dataKey="produced" stroke="var(--color-produced)" fill="var(--color-produced)" fillOpacity={0.18} strokeWidth={2} />
                      <Area type="monotone" dataKey="downtime" stroke="var(--color-downtime)" fill="var(--color-downtime)" fillOpacity={0.12} strokeWidth={2} />
                    </AreaChart>
                  </ChartContainer>
                </div>
              </TabsContent>

              {/* SKUs */}
              <TabsContent value="skus" className="space-y-4">
                <div className="rounded-xl border border-border bg-background p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-3">
                    SKUs más producidos (top 10)
                  </h3>
                  <ChartContainer
                    className="h-[320px] w-full aspect-auto"
                    config={{ units: { label: "Unidades" } }}
                  >
                    <BarChart data={analytics.skuDistribution.slice(0, 10)} margin={{ left: 8, right: 8 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="sku" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="units" radius={[4, 4, 0, 0]}>
                        {analytics.skuDistribution.slice(0, 10).map((s, index) => (
                          <Cell key={s.sku} fill={skuPalette[index % skuPalette.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                </div>
              </TabsContent>

              {/* Turnos */}
              <TabsContent value="turnos" className="space-y-4">
                <div className="rounded-xl border border-border bg-background p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-3">Matutino vs Vespertino</h3>
                  <ChartContainer
                    className="h-[300px] w-full aspect-auto"
                    config={{
                      matutino: { label: "Matutino", color: "#3b82f6" },
                      vespertino: { label: "Vespertino", color: "#f97316" },
                    }}
                  >
                    <BarChart data={analytics.shiftComparisonMetrics} margin={{ left: 8, right: 8 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="metric" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="matutino" fill="var(--color-matutino)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="vespertino" fill="var(--color-vespertino)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                </div>
              </TabsContent>
            </Tabs>
          </TabsContent>

          {/* ========== OPERADORES & EMPACADORES TAB ========== */}
          <TabsContent value="operadores" className="space-y-6">
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

            {/* Distribución empacadores */}
            <div className="grid gap-6">
              <div className="rounded-xl border border-border bg-card p-6">
                <h3 className="font-semibold text-foreground mb-4">Distribución de Empacadores</h3>
                <p className="mb-2 text-xs text-muted-foreground">
                  Unidades atribuidas por registro de producción (reparto entre empacadores listados en el payload o en el check-in de la máquina).
                </p>
                <div className="h-[300px]">
                  {analytics.packerDistribution.length === 0 ? (
                    <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-4 text-center text-sm text-muted-foreground">
                      Sin unidades atribuidas a empacadores en este rango. Revisa que los registros PROD incluyan PACKAGER_1/2 o el array
                      <code className="mx-1 rounded bg-muted px-1">packagers</code>, o que exista check-in con empacadores en la máquina.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={analytics.packerDistribution.slice(0, 8)}
                          dataKey="units"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={90}
                          paddingAngle={2}
                          label={({ name, value }) => {
                            const u = typeof value === "number" ? value : Number(value)
                            if (!Number.isFinite(u) || u <= 0) return ""
                            const n = String(name ?? "")
                            const short = n.length > 14 ? `${n.slice(0, 14)}…` : n
                            const uTxt = u % 1 !== 0 ? u.toFixed(1) : String(Math.round(u))
                            return `${short}: ${uTxt}`
                          }}
                        >
                          {analytics.packerDistribution.slice(0, 8).map((p, index) => (
                            <Cell key={p.name} fill={skuPalette[index % skuPalette.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number | string) => {
                            const u = typeof value === "number" ? value : Number(value)
                            const txt = Number.isFinite(u)
                              ? `${u.toLocaleString("es-MX", { maximumFractionDigits: 1 })} uds`
                              : String(value)
                            return [txt, "Unidades atribuidas"]
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
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
                <h3 className="font-semibold text-foreground mb-4">Empacadores - Detalle (Atribución 50/50)</h3>
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
            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="font-semibold text-foreground mb-4">Registros de asistencias</h3>
              <p className="mb-4 text-sm text-muted-foreground">
                Generado a partir de <strong>check-in en máquina</strong> (entrada/salida y equipo asignado en{" "}
                <code className="text-xs">machine_checkins</code>). No sustituye un módulo de asistencia de RR.HH.
              </p>
              <AttendanceTable records={filteredAttendanceRecords} onDelete={() => {}} />
            </div>
          </TabsContent>

          {/* ========== ROTACIÓN TAB ========== */}
          <TabsContent value="rotacion" className="space-y-6">
            {/* KPIs */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                title="Personal Activo"
                value={employeeRows.length.toString()}
                subtitle="Colaboradores"
                icon={Users}
                iconColor="text-primary"
              />
              <KpiCard
                title="Ingresos"
                value={String(personnelMonthSummary.ingresos)}
                subtitle={`Check-in máquina · ${personnelMonthSummary.monthLabel}`}
                icon={UserPlus}
                iconColor="text-green-600"
              />
              <KpiCard
                title="Salidas"
                value={String(personnelMonthSummary.salidas)}
                subtitle={`Fin asignación · ${personnelMonthSummary.monthLabel}`}
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
                subtitle="Ingresos − salidas (movimientos)"
                icon={RefreshCw}
                iconColor="text-yellow-600"
              />
            </div>

            {/* Historial y Resumen (datos reales: machine_checkins) */}
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2 rounded-xl border border-border bg-card p-6">
                <h3 className="font-semibold text-foreground mb-2">Movimientos de Personal</h3>
                <p className="mb-4 text-xs text-muted-foreground">
                  Derivado de check-in / check-out en máquina (mismo origen que la pestaña Asistencia).
                </p>
                <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                  {personnelMovements.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">
                      Sin movimientos en el rango cargado. Amplía fechas o registra check-ins NFC.
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
                <h3 className="font-semibold text-foreground mb-1">Resumen del Mes</h3>
                <p className="mb-4 text-xs text-muted-foreground">
                  <span className="capitalize">{personnelMonthSummary.monthLabel}</span>
                  <span className="block mt-1 text-[11px]">
                    Cuenta movimientos del mes dentro del rango Desde/Hasta (si el rango no cubre el mes, verás 0).
                  </span>
                </p>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Ingresos</span>
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
                      <span className="text-sm text-muted-foreground">Salidas</span>
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
  )
}
