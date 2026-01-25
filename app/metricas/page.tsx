"use client"

import { useMemo, useState } from "react"
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
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
  Zap,
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
import {
  hourlyProductionData,
  eventDistributionData,
  topMachinesData,
  topSkusData,
  operators,
  employees,
  attendanceRecords,
  attendanceStats,
} from "@/lib/mock-data"
import { cn } from "@/lib/utils"

type ProductionEventType =
  | "Producción"
  | "Cambio SKU"
  | "Mantenimiento"
  | "Parada"
  | "Limpieza"
  | "Rechazo"

type ShiftType = "matutino" | "vespertino"

interface ProductionBaseRow {
  machine_id: string
  timestamp: string // ISO
  operator: string
  packer_1: string
  packer_2: string
  parameter_1: number
  parameter_2: number
  count: number
  event: ProductionEventType
  sku: string
}

const clampPercent = (value: number) => Math.max(0, Math.min(100, value))

export default function MetricsPage() {
  const [activeTab, setActiveTab] = useState("produccion")
  const [filterStartDate, setFilterStartDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 14)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, "0")
    const dd = String(d.getDate()).padStart(2, "0")
    return `${yyyy}-${mm}-${dd}`
  })
  const [filterEndDate, setFilterEndDate] = useState(() => {
    const d = new Date()
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, "0")
    const dd = String(d.getDate()).padStart(2, "0")
    return `${yyyy}-${mm}-${dd}`
  })

  const formatDate = (date: Date) => {
    const yyyy = date.getFullYear()
    const mm = String(date.getMonth() + 1).padStart(2, "0")
    const dd = String(date.getDate()).padStart(2, "0")
    return `${yyyy}-${mm}-${dd}`
  }

  const formatYearMonth = (date: Date) => {
    const yyyy = date.getFullYear()
    const mm = String(date.getMonth() + 1).padStart(2, "0")
    return `${yyyy}-${mm}`
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

  const productionBaseRows: ProductionBaseRow[] = useMemo(() => {
    const now = new Date()
    const skus = ["SKU-001", "SKU-002", "SKU-003", "SKU-004", "SKU-005"]
    const machineIds = Array.from({ length: 20 }, (_, i) => `M${i + 1}`)
    const operatorNames = operators.map((o) => o.name)
    const packerNames = employees.filter((e) => e.role === "Empacador").map((e) => e.name)

    const safePackerNames = packerNames.length ? packerNames : ["Empacador A", "Empacador B"]

    const rows: ProductionBaseRow[] = []
    const daysBack = 30

    for (let dayOffset = daysBack; dayOffset >= 0; dayOffset--) {
      const baseDate = new Date(now)
      baseDate.setDate(now.getDate() - dayOffset)
      baseDate.setHours(6, 0, 0, 0)

      for (const machine_id of machineIds) {
        const operator = operatorNames[(Number(machine_id.replace("M", "")) - 1) % operatorNames.length]
        const sku = skus[(Number(machine_id.replace("M", "")) - 1) % skus.length]

        const basePackerIndex = (Number(machine_id.replace("M", "")) - 1) % safePackerNames.length
        const packer_1 = safePackerNames[basePackerIndex]
        const packer_2 = safePackerNames[(basePackerIndex + 1) % safePackerNames.length]

        for (let hour = 6; hour <= 21; hour++) {
          const eventsPerHour = 2
          for (let e = 0; e < eventsPerHour; e++) {
            const timestamp = new Date(baseDate)
            timestamp.setHours(hour, e === 0 ? 10 : 40)

            const roll = Math.random()
            let event: ProductionEventType = "Producción"

            if (roll < 0.05) event = "Parada"
            else if (roll < 0.09) event = "Cambio SKU"
            else if (roll < 0.12) event = "Mantenimiento"
            else if (roll < 0.14) event = "Limpieza"
            else if (roll < 0.17) event = "Rechazo"

            const produced = event === "Producción" ? 8 + Math.floor(Math.random() * 18) : 0
            const rejected = event === "Rechazo" ? 1 + Math.floor(Math.random() * 5) : 0
            const count = event === "Rechazo" ? rejected : produced

            rows.push({
              machine_id,
              timestamp: timestamp.toISOString(),
              operator,
              packer_1,
              packer_2,
              parameter_1: Number((70 + Math.random() * 20).toFixed(2)),
              parameter_2: Number((15 + Math.random() * 10).toFixed(2)),
              count,
              event,
              sku,
            })
          }
        }
      }
    }

    return rows
  }, [])

  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false)
  const [reportStartDate, setReportStartDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    return formatDate(d)
  })
  const [reportEndDate, setReportEndDate] = useState(() => formatDate(new Date()))
  const [includeBothShifts, setIncludeBothShifts] = useState(true)
  const [selectedShift, setSelectedShift] = useState<ShiftType>("matutino")

  const buildProductionReportWorkbook = async (params: {
    startDate: string
    endDate: string
    includeBothShifts: boolean
    shift: ShiftType
  }) => {
    const XLSX = await import("xlsx")

    const start = new Date(`${params.startDate}T00:00:00`)
    const end = new Date(`${params.endDate}T23:59:59`)

    const filtered = productionBaseRows.filter((r) => {
      const ts = new Date(r.timestamp)
      if (ts < start || ts > end) return false

      const shift = getShift(ts)
      if (!shift) return false
      if (params.includeBothShifts) return true
      return shift === params.shift
    })

    const detailRows = filtered.map((r) => {
      const ts = new Date(r.timestamp)
      const shift = getShift(ts)
      return {
        machine_id: r.machine_id,
        timestamp: ts.toISOString().replace("T", " ").slice(0, 19),
        shift: shift ?? "",
        operator: r.operator,
        packer_1: r.packer_1,
        packer_2: r.packer_2,
        sku: r.sku,
        event: r.event,
        count: r.count,
        parameter_1: r.parameter_1,
        parameter_2: r.parameter_2,
      }
    })

    const dailyAgg = new Map<string, { produccion: number; rechazos: number; paros: number; cambios_sku: number }>()
    const monthlyAgg = new Map<string, { produccion: number; rechazos: number; paros: number; cambios_sku: number }>()

    for (const r of filtered) {
      const ts = new Date(r.timestamp)
      const dayKey = formatDate(ts)
      const monthKey = formatYearMonth(ts)

      const day = dailyAgg.get(dayKey) ?? { produccion: 0, rechazos: 0, paros: 0, cambios_sku: 0 }
      const month = monthlyAgg.get(monthKey) ?? { produccion: 0, rechazos: 0, paros: 0, cambios_sku: 0 }

      if (r.event === "Producción") {
        day.produccion += r.count
        month.produccion += r.count
      } else if (r.event === "Rechazo") {
        day.rechazos += r.count
        month.rechazos += r.count
      } else if (r.event === "Parada") {
        day.paros += 1
        month.paros += 1
      } else if (r.event === "Cambio SKU") {
        day.cambios_sku += 1
        month.cambios_sku += 1
      }

      dailyAgg.set(dayKey, day)
      monthlyAgg.set(monthKey, month)
    }

    const dailyRows = [...dailyAgg.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([fecha, v]) => ({ fecha, ...v }))

    const monthlyRows = [...monthlyAgg.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([periodo, v]) => ({ periodo, ...v }))

    const wb = XLSX.utils.book_new()
    const detailWs = XLSX.utils.json_to_sheet(detailRows)
    const dailyWs = XLSX.utils.json_to_sheet(dailyRows)
    const monthlyWs = XLSX.utils.json_to_sheet(monthlyRows)

    XLSX.utils.book_append_sheet(wb, detailWs, "Detalle")
    XLSX.utils.book_append_sheet(wb, dailyWs, "Resumen diario")
    XLSX.utils.book_append_sheet(wb, monthlyWs, "Resumen mensual")

    const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" })
    return new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
  }

  const eventBadgeVariant = (event: ProductionEventType) => {
    if (event === "Producción") return "secondary" as const
    if (event === "Rechazo") return "destructive" as const
    if (event === "Parada") return "outline" as const
    if (event === "Mantenimiento") return "outline" as const
    if (event === "Limpieza") return "outline" as const
    if (event === "Cambio SKU") return "default" as const
    return "secondary" as const
  }

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
    type RecentEvent = ProductionBaseRow & { tsLabel: string }
    type DistRow = { event: ProductionEventType; count: number; color: string }

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

    const eventOrder: ProductionEventType[] = [
      "Producción",
      "Cambio SKU",
      "Mantenimiento",
      "Parada",
      "Limpieza",
      "Rechazo",
    ]

    const eventColors: Record<ProductionEventType, string> = {
      "Producción": "#22c55e",
      "Cambio SKU": "#3b82f6",
      "Mantenimiento": "#eab308",
      "Parada": "#f97316",
      "Limpieza": "#ef4444",
      "Rechazo": "#a855f7",
    }

    const buildDist = (m: Map<ProductionEventType, number>): DistRow[] =>
      eventOrder
        .map((event) => ({
          event,
          count: m.get(event) ?? 0,
          color: eventColors[event],
        }))
        .filter((r) => r.count > 0)

    const produced14d = rows14d
      .filter((r) => r.event === "Producción")
      .reduce((acc, r) => acc + r.count, 0)
    const changeovers14d = rows14d.filter((r) => r.event === "Cambio SKU").length
    const downtimeEvents14d = rows14d.filter((r) => ["Parada", "Mantenimiento", "Limpieza"].includes(r.event)).length

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
    const operatorEventAgg = new Map<string, Map<ProductionEventType, number>>()
    const packerAgg = new Map<string, { units: number; jobs: number }>()
    const skuAgg = new Map<string, number>()
    const eventAgg = new Map<ProductionEventType, number>()
    const machineAgg = new Map<string, { produced: number; downtime: number }>()

    const shiftAgg = {
      matutino: {
        produced: 0,
        downtime: 0,
        changeovers: 0,
        events: new Map<ProductionEventType, number>(),
      },
      vespertino: {
        produced: 0,
        downtime: 0,
        changeovers: 0,
        events: new Map<ProductionEventType, number>(),
      },
    }

    for (const r of rows14d) {
      const ts = new Date(r.timestamp)
      const dayKey = formatDate(ts)
      const shift = getShift(ts)

      const day = dailyAgg.get(dayKey) ?? { produced: 0, downtime: 0 }
      if (r.event === "Producción") day.produced += r.count
      if (["Parada", "Mantenimiento", "Limpieza"].includes(r.event)) day.downtime += 1
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
        if (["Parada", "Mantenimiento", "Limpieza"].includes(r.event)) {
          if (shift === "matutino") d.matutinoDowntime += 1
          if (shift === "vespertino") d.vespertinoDowntime += 1
        }
        dailyShiftAgg.set(dayKey, d)

        const s = shiftAgg[shift]
        s.events.set(r.event, (s.events.get(r.event) ?? 0) + 1)
        if (r.event === "Producción") s.produced += r.count
        if (r.event === "Cambio SKU") s.changeovers += 1
        if (["Parada", "Mantenimiento", "Limpieza"].includes(r.event)) s.downtime += 1
      }

      eventAgg.set(r.event, (eventAgg.get(r.event) ?? 0) + 1)

      const opEvent = operatorEventAgg.get(r.operator) ?? new Map<ProductionEventType, number>()
      opEvent.set(r.event, (opEvent.get(r.event) ?? 0) + 1)
      operatorEventAgg.set(r.operator, opEvent)

      const op = operatorAgg.get(r.operator) ?? { units: 0, downtime: 0 }
      if (r.event === "Producción") op.units += r.count
      if (["Parada", "Mantenimiento", "Limpieza"].includes(r.event)) op.downtime += 1
      operatorAgg.set(r.operator, op)

      const machine = machineAgg.get(r.machine_id) ?? { produced: 0, downtime: 0 }
      if (r.event === "Producción") machine.produced += r.count
      if (["Parada", "Mantenimiento", "Limpieza"].includes(r.event)) machine.downtime += 1
      machineAgg.set(r.machine_id, machine)

      if (r.event === "Producción") {
        skuAgg.set(r.sku, (skuAgg.get(r.sku) ?? 0) + r.count)

        // Atribución simple: dividir unidades del lote entre ambos empacadores
        const half = r.count / 2
        const p1 = packerAgg.get(r.packer_1) ?? { units: 0, jobs: 0 }
        p1.units += half
        p1.jobs += 1
        packerAgg.set(r.packer_1, p1)

        const p2 = packerAgg.get(r.packer_2) ?? { units: 0, jobs: 0 }
        p2.units += half
        p2.jobs += 1
        packerAgg.set(r.packer_2, p2)
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
      .slice(0, 8)

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

    const operatorEventDistributions = [...operatorEventAgg.entries()]
      .map(([operator, map]) => {
        const dist = buildDist(map)
        const total = dist.reduce((acc, e) => acc + e.count, 0)
        return { operator, total, dist }
      })
      .sort((a, b) => b.total - a.total)

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

    const shiftEventDistributions = {
      matutino: buildDist(shiftAgg.matutino.events),
      vespertino: buildDist(shiftAgg.vespertino.events),
    }

    const eventBreakdown = (Object.keys({
      "Producción": 1,
      "Cambio SKU": 1,
      "Mantenimiento": 1,
      "Parada": 1,
      "Limpieza": 1,
      "Rechazo": 1,
    }) as ProductionEventType[]).map((event) => ({
      event,
      count: eventAgg.get(event) ?? 0,
    }))

    const machineScatter = [...machineAgg.entries()]
      .map(([machine, v]) => ({
        machine,
        produced: v.produced,
        downtimeEvents: v.downtime,
      }))
      .sort((a, b) => b.produced - a.produced)

    const recentNonProductionEvents: RecentEvent[] = [...rows14d]
      .filter((r) => r.event !== "Producción")
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 12)
      .map((r) => ({
        ...r,
        tsLabel: new Date(r.timestamp).toISOString().replace("T", " ").slice(0, 16),
      }))

    return {
      produced14d,
      changeovers14d,
      downtimeEvents14d,
      changeoversPer1k,
      dailySeries,
      shiftDailySeries,
      shiftComparisonMetrics,
      shiftEventDistributions,
      topOperators,
      topPackers,
      topSkus,
      skuDistribution,
      packerDistribution,
      operatorEventDistributions,
      eventBreakdown,
      machineScatter,
      recentNonProductionEvents,
    }
  }, [productionBaseRows, filterStartDate, filterEndDate])

  // Filter attendance records by date range
  const filteredAttendanceRecords = useMemo(() => {
    const startDate = new Date(filterStartDate)
    startDate.setHours(0, 0, 0, 0)
    const endDate = new Date(filterEndDate)
    endDate.setHours(23, 59, 59, 999)

    return attendanceRecords.filter((record) => {
      const recordDate = new Date(record.date)
      recordDate.setHours(0, 0, 0, 0)
      return recordDate >= startDate && recordDate <= endDate
    })
  }, [filterStartDate, filterEndDate])

  const handleGenerateProductionReport = async () => {
    const blob = await buildProductionReportWorkbook({
      startDate: reportStartDate,
      endDate: reportEndDate,
      includeBothShifts,
      shift: selectedShift,
    })

    const shiftsLabel = includeBothShifts ? "ambos-turnos" : selectedShift
    downloadBlob(
      `reporte-produccion-${reportStartDate}-a-${reportEndDate}-${shiftsLabel}.xlsx`,
      blob
    )
    setIsReportDialogOpen(false)
  }

  const handleDownloadBonusReportXlsx = async () => {
    const XLSX = await import("xlsx")
    const today = new Date()
    const yearMonth = formatYearMonth(today)

    const bonusRatePerUnit = 0.25
    const rows = operators.map((op) => ({
      periodo: yearMonth,
      colaborador: op.name,
      maquina: op.machine,
      sku: op.sku,
      unidades: op.units,
      avance_bono_pct: clampPercent(op.percentage),
      bono_estimado: Number((op.units * bonusRatePerUnit).toFixed(2)),
    }))

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Bonos")

    const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" })
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
    downloadBlob(`reporte-bonos-${yearMonth}.xlsx`, blob)
  }

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
        </div>

        {/* Date Range Filter */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label className="text-sm font-medium text-foreground mb-2 block">Desde</Label>
              <input
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                className={cn(
                  "w-full px-3 py-2 rounded-md border border-input bg-background text-sm",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                )}
              />
            </div>
            <div className="flex-1">
              <Label className="text-sm font-medium text-foreground mb-2 block">Hasta</Label>
              <input
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                className={cn(
                  "w-full px-3 py-2 rounded-md border border-input bg-background text-sm",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                )}
              />
            </div>
            <Button 
              onClick={() => {
                // Filtro aplicado automáticamente al cambiar las fechas
                setActiveTab(activeTab) // Trigger re-render
              }}
              className="gap-2"
            >
              <Clock className="h-4 w-4" />
              Aplicar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Rango seleccionado: <span className="font-medium">{filterStartDate}</span> a <span className="font-medium">{filterEndDate}</span>
          </p>
        </div>

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
            {/* Reportes */}
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="mb-4 flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
                <h2 className="text-lg font-semibold text-card-foreground">Reportes Descargables</h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Button variant="outline" className="justify-start" onClick={() => setIsReportDialogOpen(true)}>
                  <Download className="h-4 w-4" /> Reporte de Producción (Rango)
                </Button>
                <Button variant="outline" className="justify-start" onClick={handleDownloadBonusReportXlsx}>
                  <Download className="h-4 w-4" /> Reporte de Bonos
                </Button>
              </div>
            </div>

            {/* Report dialog */}
            <Dialog open={isReportDialogOpen} onOpenChange={setIsReportDialogOpen}>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Generar Reporte de Producción</DialogTitle>
                  <DialogDescription>
                    Selecciona rango de fechas y turnos
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Fecha inicio</label>
                      <input
                        type="date"
                        className={cn(
                          "h-10 w-full rounded-md border border-input bg-background px-3 text-sm",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        )}
                        value={reportStartDate}
                        onChange={(e) => setReportStartDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Fecha fin</label>
                      <input
                        type="date"
                        className={cn(
                          "h-10 w-full rounded-md border border-input bg-background px-3 text-sm",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        )}
                        value={reportEndDate}
                        onChange={(e) => setReportEndDate(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={includeBothShifts}
                      onCheckedChange={(v) => setIncludeBothShifts(Boolean(v))}
                    />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">Ambos turnos</p>
                      <p className="text-sm text-muted-foreground">
                        Matutino y vespertino
                      </p>
                    </div>
                  </div>

                  {!includeBothShifts && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Turno</label>
                      <Select value={selectedShift} onValueChange={(v) => setSelectedShift(v as ShiftType)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="matutino">Matutino (06:00–13:59)</SelectItem>
                          <SelectItem value="vespertino">Vespertino (14:00–21:59)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsReportDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleGenerateProductionReport}>
                    <Download className="h-4 w-4" /> Generar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* KPI Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                title="Producción Hoy"
                value="3,301"
                subtitle="Unidades"
                icon={CheckCircle}
                iconColor="text-primary"
              />
              <KpiCard
                title="Promedio/Hora"
                value="275"
                subtitle="Unidades"
                icon={Clock}
                iconColor="text-primary"
              />
              <KpiCard
                title="Hora Pico"
                value="09:00"
                subtitle="325 uds"
                icon={Zap}
                iconColor="text-yellow-500"
              />
              <KpiCard
                title="Uptime"
                value="94%"
                subtitle="Disponibilidad"
                icon={TrendingUp}
                iconColor="text-primary"
              />
            </div>

            {/* Production Charts */}
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Hourly Chart */}
              <div className="lg:col-span-2 rounded-xl border border-border bg-card p-6">
                <h3 className="font-semibold text-foreground mb-4">Producción por Hora</h3>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hourlyProductionData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                      <XAxis dataKey="hour" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} domain={[0, 400]} />
                      <Tooltip />
                      <Bar dataKey="production" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Event Distribution */}
              <div className="rounded-xl border border-border bg-card p-6">
                <h3 className="font-semibold text-foreground mb-4">Distribución de Eventos</h3>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={eventDistributionData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {eventDistributionData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
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
                        <th className="pb-3 font-medium text-right">Prom/Hr</th>
                        <th className="pb-3 font-medium text-right">Uptime</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topMachinesData.map((machine) => (
                        <tr key={machine.machine} className="border-b border-border last:border-0">
                          <td className="py-3 font-medium text-primary">{machine.machine}</td>
                          <td className="py-3 text-foreground">{machine.operator}</td>
                          <td className="py-3 text-right font-medium">{machine.avgPerHour}</td>
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

              {/* SKUs */}
              <div className="rounded-xl border border-border bg-card p-6">
                <h3 className="font-semibold text-foreground mb-4">SKUs Más Producidos</h3>
                <div className="space-y-4">
                  {topSkusData.map((sku) => (
                    <div key={sku.sku}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="font-medium">{sku.sku}</span>
                        <span className="text-muted-foreground">{sku.units.toLocaleString()} uds</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${sku.percentage * 3}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Advanced Metrics - KPIs */}
            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="font-semibold text-foreground mb-4">Métricas Avanzadas (14 días)</h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard
                  title="Cambios SKU"
                  value={analytics.changeovers14d.toLocaleString()}
                  subtitle={`${analytics.changeoversPer1k.toFixed(2)}/1k uds`}
                  icon={RefreshCw}
                  iconColor="text-primary"
                />
                <KpiCard
                  title="Producción (14d)"
                  value={analytics.produced14d.toLocaleString()}
                  subtitle="Unidades"
                  icon={TrendingUp}
                  iconColor="text-primary"
                />
                <KpiCard
                  title="Eventos Paro"
                  value={analytics.downtimeEvents14d.toLocaleString()}
                  subtitle="Parada+Mant.+Limpieza"
                  icon={AlertTriangle}
                  iconColor="text-yellow-500"
                />
                <KpiCard
                  title="Total Eventos"
                  value={analytics.eventBreakdown.reduce((acc, e) => acc + e.count, 0).toLocaleString()}
                  subtitle="14 días"
                  icon={Clock}
                  iconColor="text-primary"
                />
              </div>
            </div>

            {/* Advanced Tabs */}
            <Tabs defaultValue="prod-vs-downtime" className="space-y-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="prod-vs-downtime">Producción vs Paros</TabsTrigger>
                <TabsTrigger value="sku-eventos">SKU & Eventos</TabsTrigger>
                <TabsTrigger value="turnos">Turnos</TabsTrigger>
              </TabsList>

              {/* Producción vs Paros */}
              <TabsContent value="prod-vs-downtime" className="space-y-4">
                <div className="grid gap-6 lg:grid-cols-3">
                  <div className="lg:col-span-2 rounded-xl border border-border bg-background p-4">
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

                  <div className="rounded-xl border border-border bg-background p-4">
                    <h3 className="text-sm font-semibold text-foreground mb-3">Resumen por Evento</h3>
                    <div className="space-y-2">
                      {analytics.eventBreakdown.map((e) => (
                        <div key={e.event} className="flex items-center justify-between">
                          <Badge variant={eventBadgeVariant(e.event)}>{e.event}</Badge>
                          <span className="font-mono text-sm text-foreground">{e.count.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* SKU & Eventos */}
              <TabsContent value="sku-eventos" className="space-y-4">
                <div className="grid gap-6 lg:grid-cols-3">
                  <div className="lg:col-span-2 rounded-xl border border-border bg-background p-4">
                    <h3 className="text-sm font-semibold text-foreground mb-3">Distribución por SKU</h3>
                    <ChartContainer
                      className="h-[300px] w-full aspect-auto"
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

                  <div className="rounded-xl border border-border bg-background p-4">
                    <h3 className="text-sm font-semibold text-foreground mb-3">SKU (Top 6)</h3>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={analytics.topSkus} dataKey="units" nameKey="sku" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2}>
                            {analytics.topSkus.map((s, index) => (
                              <Cell key={s.sku} fill={skuPalette[index % skuPalette.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Turnos */}
              <TabsContent value="turnos" className="space-y-4">
                <div className="grid gap-6 lg:grid-cols-3">
                  <div className="lg:col-span-2 rounded-xl border border-border bg-background p-4">
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

                  <div className="rounded-xl border border-border bg-background p-4">
                    <h3 className="text-sm font-semibold text-foreground mb-3">Eventos por Turno</h3>
                    <div className="space-y-4">
                      <div className="h-[140px]">
                        <p className="mb-2 text-xs font-medium text-muted-foreground">Matutino</p>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={analytics.shiftEventDistributions.matutino} dataKey="count" nameKey="event" cx="50%" cy="50%" innerRadius={30} outerRadius={55} paddingAngle={2}>
                              {analytics.shiftEventDistributions.matutino.map((d) => (
                                <Cell key={d.event} fill={d.color} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="h-[140px]">
                        <p className="mb-2 text-xs font-medium text-muted-foreground">Vespertino</p>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={analytics.shiftEventDistributions.vespertino} dataKey="count" nameKey="event" cx="50%" cy="50%" innerRadius={30} outerRadius={55} paddingAngle={2}>
                              {analytics.shiftEventDistributions.vespertino.map((d) => (
                                <Cell key={d.event} fill={d.color} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
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

            {/* Distribuciones */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Distribución de Operadores */}
              <div className="rounded-xl border border-border bg-card p-6">
                <h3 className="font-semibold text-foreground mb-4">Distribución de Operadores</h3>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie 
                        data={analytics.topOperators} 
                        dataKey="units" 
                        nameKey="name" 
                        cx="50%" 
                        cy="50%" 
                        innerRadius={55} 
                        outerRadius={90} 
                        paddingAngle={2}
                      >
                        {analytics.topOperators.map((op, index) => (
                          <Cell key={op.name} fill={operatorBarPalette[index % operatorBarPalette.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Distribución de Empacadores */}
              <div className="rounded-xl border border-border bg-card p-6">
                <h3 className="font-semibold text-foreground mb-4">Distribución de Empacadores</h3>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={analytics.packerDistribution.slice(0, 8)} dataKey="units" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2}>
                        {analytics.packerDistribution.slice(0, 8).map((p, index) => (
                          <Cell key={p.name} fill={skuPalette[index % skuPalette.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Eventos por Operador */}
            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="font-semibold text-foreground mb-4">Distribución de Eventos por Operador</h3>
              <Accordion type="single" collapsible>
                {analytics.operatorEventDistributions.map((op) => (
                  <AccordionItem key={op.operator} value={op.operator}>
                    <AccordionTrigger>{op.operator}</AccordionTrigger>
                    <AccordionContent>
                      <div className="grid gap-4 lg:grid-cols-3">
                        <div className="lg:col-span-1">
                          <p className="text-sm text-muted-foreground">Total eventos</p>
                          <p className="text-2xl font-bold text-foreground">{op.total.toLocaleString()}</p>
                        </div>
                        <div className="lg:col-span-2 h-[220px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie data={op.dist} dataKey="count" nameKey="event" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2}>
                                {op.dist.map((d) => (
                                  <Cell key={d.event} fill={d.color} />
                                ))}
                              </Pie>
                              <Tooltip />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
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

            {/* Últimos Eventos Relevantes */}
            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="font-semibold text-foreground mb-4">Últimos Eventos Relevantes (No Producción)</h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Máquina</TableHead>
                      <TableHead>Evento</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Operador</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analytics.recentNonProductionEvents.map((r) => (
                      <TableRow key={`${r.machine_id}-${r.timestamp}-${r.event}`} className={cn(r.event === "Rechazo" && "bg-destructive/5")}>
                        <TableCell className="text-muted-foreground">{r.tsLabel}</TableCell>
                        <TableCell className="font-medium text-primary">{r.machine_id}</TableCell>
                        <TableCell>
                          <Badge variant={eventBadgeVariant(r.event)}>{r.event}</Badge>
                        </TableCell>
                        <TableCell>{r.sku}</TableCell>
                        <TableCell className="text-muted-foreground">{r.operator}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </TabsContent>

          {/* ========== ASISTENCIA TAB ========== */}
          <TabsContent value="asistencia" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {attendanceStats.map((stat) => (
                <div key={stat.employeeId} className="rounded-xl border border-border bg-card p-4">
                  <p className="text-sm font-medium text-muted-foreground mb-1">{stat.employeeName}</p>
                  <p className="text-2xl font-bold text-foreground mb-2">{stat.attendancePercentage}%</p>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 mb-3">
                    <div className="h-full rounded-full bg-green-500" style={{ width: `${stat.attendancePercentage}%` }} />
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div>Presente: {stat.presentDays}/{stat.totalDays}</div>
                    <div>Ausencias: {stat.absentDays}</div>
                    <div>Retardos: {stat.lateDays}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="font-semibold text-foreground mb-4">Registros Recientes</h3>
              <AttendanceTable records={filteredAttendanceRecords} onDelete={() => {}} />
            </div>
          </TabsContent>

          {/* ========== ROTACIÓN TAB ========== */}
          <TabsContent value="rotacion" className="space-y-6">
            {/* KPIs */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                title="Personal Activo"
                value={employees.length.toString()}
                subtitle="Colaboradores"
                icon={Users}
                iconColor="text-primary"
              />
              <KpiCard
                title="Ingresos"
                value="3"
                subtitle="Este mes"
                icon={UserPlus}
                iconColor="text-green-600"
              />
              <KpiCard
                title="Salidas"
                value="1"
                subtitle="Este mes"
                icon={UserMinus}
                iconColor="text-red-600"
              />
              <KpiCard
                title="Tasa Rotación"
                value="3.7%"
                subtitle="Anualizado"
                icon={RefreshCw}
                iconColor="text-yellow-600"
              />
            </div>

            {/* Historial y Resumen */}
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2 rounded-xl border border-border bg-card p-6">
                <h3 className="font-semibold text-foreground mb-4">Movimientos de Personal</h3>
                <div className="space-y-3">
                  <div className="border border-border rounded-lg p-3 flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 flex-shrink-0">
                      <UserPlus className="h-4 w-4 text-green-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">Roberto Cortés</p>
                      <p className="text-xs text-muted-foreground">Ingreso • 2026-01-20 • Operador</p>
                    </div>
                  </div>
                  <div className="border border-border rounded-lg p-3 flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 flex-shrink-0">
                      <UserPlus className="h-4 w-4 text-green-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">Patricia Díaz</p>
                      <p className="text-xs text-muted-foreground">Ingreso • 2026-01-15 • Empacadora</p>
                    </div>
                  </div>
                  <div className="border border-border rounded-lg p-3 flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 flex-shrink-0">
                      <UserMinus className="h-4 w-4 text-red-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">Luis Fernández</p>
                      <p className="text-xs text-muted-foreground">Salida • 2026-01-10 • Renuncia</p>
                    </div>
                  </div>
                  <div className="border border-border rounded-lg p-3 flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 flex-shrink-0">
                      <UserPlus className="h-4 w-4 text-green-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">Gabriel Mendez</p>
                      <p className="text-xs text-muted-foreground">Ingreso • 2026-01-05 • Operador</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-6">
                <h3 className="font-semibold text-foreground mb-4">Resumen del Mes</h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Ingresos</span>
                      <span className="font-bold text-green-600">+3</span>
                    </div>
                    <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500" style={{ width: "75%" }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Salidas</span>
                      <span className="font-bold text-red-600">-1</span>
                    </div>
                    <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-red-500" style={{ width: "25%" }} />
                    </div>
                  </div>
                  <div className="pt-2 border-t border-border">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">Neto</span>
                      <span className="text-lg font-bold text-primary">+2</span>
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
