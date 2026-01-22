"use client"

import { useMemo, useState } from "react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
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
} from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts"
import {
  hourlyProductionData,
  eventDistributionData,
  topMachinesData,
  topSkusData,
  monthlyTrendData,
  operators,
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
  parameter_1: number
  parameter_2: number
  count: number
  event: ProductionEventType
  sku: string
}

const clampPercent = (value: number) => Math.max(0, Math.min(100, value))

export default function MetricsPage() {
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

    const rows: ProductionBaseRow[] = []
    const daysBack = 30

    for (let dayOffset = daysBack; dayOffset >= 0; dayOffset--) {
      const baseDate = new Date(now)
      baseDate.setDate(now.getDate() - dayOffset)
      baseDate.setHours(6, 0, 0, 0)

      for (const machine_id of machineIds) {
        const operator = operatorNames[(Number(machine_id.replace("M", "")) - 1) % operatorNames.length]
        const sku = skus[(Number(machine_id.replace("M", "")) - 1) % skus.length]

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

  const derivedExamples = useMemo(() => {
    const rows = productionBaseRows
    const producedRows = rows.filter((r) => r.event === "Producción")
    const rejectRows = rows.filter((r) => r.event === "Rechazo")

    const totalProduced = producedRows.reduce((sum, r) => sum + r.count, 0)
    const totalReject = rejectRows.reduce((sum, r) => sum + r.count, 0)
    const scrapRate = totalProduced > 0 ? (totalReject / totalProduced) * 100 : 0

    const unitsByShift: Record<ShiftType, number> = { matutino: 0, vespertino: 0 }
    for (const r of producedRows) {
      const shift = getShift(new Date(r.timestamp))
      if (shift) unitsByShift[shift] += r.count
    }

    const unitsBySku = new Map<string, number>()
    for (const r of producedRows) unitsBySku.set(r.sku, (unitsBySku.get(r.sku) ?? 0) + r.count)
    const topSku = [...unitsBySku.entries()].sort((a, b) => b[1] - a[1])[0]

    const stops = rows.filter((r) => r.event === "Parada").length
    const skuChanges = rows.filter((r) => r.event === "Cambio SKU").length

    const avgParam1 = producedRows.length
      ? producedRows.reduce((sum, r) => sum + r.parameter_1, 0) / producedRows.length
      : 0
    const avgParam2 = producedRows.length
      ? producedRows.reduce((sum, r) => sum + r.parameter_2, 0) / producedRows.length
      : 0

    return {
      totalProduced,
      totalReject,
      scrapRate,
      unitsByShift,
      topSku: topSku ? { sku: topSku[0], units: topSku[1] } : null,
      stops,
      skuChanges,
      avgParam1,
      avgParam2,
    }
  }, [productionBaseRows])

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
          <h1 className="text-2xl font-bold text-foreground">Métricas de Producción</h1>
          <p className="text-muted-foreground">
            Analítica basada en el monitoreo por hora de las máquinas
          </p>
        </div>

        {/* Downloads */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="mb-4 flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold text-card-foreground">Reportes descargables (XLSX)</h2>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            Genera reportes en Excel (.xlsx). El reporte de producción incluye 3 hojas: Detalle, Resumen diario y Resumen mensual.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Button variant="outline" className="justify-start" onClick={() => setIsReportDialogOpen(true)}>
              <Download /> Generar reporte de producción (rango)
            </Button>
            <Button variant="outline" className="justify-start" onClick={handleDownloadBonusReportXlsx}>
              <Download /> Reporte de Bonos (XLSX)
            </Button>
          </div>
        </div>

        {/* Derivation examples */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold text-card-foreground">Ejemplos de métricas derivadas (tabla base)</h2>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            A partir de la tabla base <span className="font-medium">machine_id, timestamp, operator, parameter_1, parameter_2, count, event, sku</span> se pueden generar métricas como:
          </p>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              title="Producción (simulada)"
              value={derivedExamples.totalProduced.toLocaleString()}
              subtitle="Unidades (últimos 30 días)"
              icon={CheckCircle}
              iconColor="text-primary"
            />
            <KpiCard
              title="Scrap (rechazo)"
              value={`${derivedExamples.scrapRate.toFixed(1)}%`}
              subtitle={`${derivedExamples.totalReject.toLocaleString()} unidades rechazadas`}
              icon={AlertTriangle}
              iconColor="text-yellow-500"
            />
            <KpiCard
              title="Paros (conteo)"
              value={derivedExamples.stops.toLocaleString()}
              subtitle="Eventos de parada"
              icon={Clock}
              iconColor="text-primary"
            />
            <KpiCard
              title="Cambios de SKU"
              value={derivedExamples.skuChanges.toLocaleString()}
              subtitle="Eventos de cambio"
              icon={RefreshCw}
              iconColor="text-primary"
            />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <div className="rounded-lg border border-border bg-background p-4">
              <p className="text-sm font-semibold text-foreground">Producción por turno</p>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Matutino</span>
                  <span className="font-medium text-foreground">
                    {derivedExamples.unitsByShift.matutino.toLocaleString()} uds
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Vespertino</span>
                  <span className="font-medium text-foreground">
                    {derivedExamples.unitsByShift.vespertino.toLocaleString()} uds
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background p-4">
              <p className="text-sm font-semibold text-foreground">Top SKU</p>
              <p className="mt-3 text-sm text-muted-foreground">
                {derivedExamples.topSku
                  ? `${derivedExamples.topSku.sku} • ${derivedExamples.topSku.units.toLocaleString()} uds`
                  : "—"}
              </p>
            </div>

            <div className="rounded-lg border border-border bg-background p-4">
              <p className="text-sm font-semibold text-foreground">Promedios de parámetros</p>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">parameter_1</span>
                  <span className="font-medium text-foreground">{derivedExamples.avgParam1.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">parameter_2</span>
                  <span className="font-medium text-foreground">{derivedExamples.avgParam2.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Report dialog */}
        <Dialog open={isReportDialogOpen} onOpenChange={setIsReportDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Generar reporte de producción (XLSX)</DialogTitle>
              <DialogDescription>
                Selecciona un rango de fechas y si se consideran ambos turnos (matutino y vespertino).
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
                  <p className="text-sm font-medium text-foreground">Considerar ambos turnos</p>
                  <p className="text-sm text-muted-foreground">
                    Si desactivas, el reporte se filtra por un turno.
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
                <Download /> Generar XLSX
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Top KPI Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="Producción Total"
            value="3,301"
            subtitle="Unidades hoy"
            icon={CheckCircle}
            iconColor="text-primary"
          />
          <KpiCard
            title="Promedio por Hora"
            value="275"
            subtitle="Unidades/hora"
            icon={Clock}
            iconColor="text-primary"
          />
          <KpiCard
            title="Hora Pico"
            value="09:00"
            subtitle="325 unidades"
            icon={Zap}
            iconColor="text-yellow-500"
          />
          <KpiCard
            title="Uptime Promedio"
            value="94%"
            subtitle="Disponibilidad"
            icon={TrendingUp}
            iconColor="text-primary"
          />
        </div>

        {/* Charts Row */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Hourly Production Bar Chart */}
          <div className="lg:col-span-2 rounded-xl border border-border bg-card p-6">
            <div className="mb-4 flex items-center gap-2">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold text-card-foreground">Producción por Hora</h2>
            </div>
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

          {/* Event Distribution Donut Chart */}
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="mb-4 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold text-card-foreground">Distribución de Eventos</h2>
            </div>
            <div className="h-[200px]">
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
            <div className="mt-4 space-y-2">
              {eventDistributionData.map((item) => (
                <div key={item.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-muted-foreground">{item.name}</span>
                  </div>
                  <span className="font-medium text-foreground">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tables Row */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Machine Performance Table */}
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="mb-4 flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold text-card-foreground">
                Rendimiento por Máquina (Top 5)
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead>
                  <tr className="border-b border-border text-left text-sm text-muted-foreground">
                    <th className="pb-3 font-medium">Máquina</th>
                    <th className="pb-3 font-medium">Operador</th>
                    <th className="pb-3 font-medium text-right">Prom/Hora</th>
                    <th className="pb-3 font-medium text-right">Uptime</th>
                  </tr>
                </thead>
                <tbody>
                  {topMachinesData.map((machine) => (
                    <tr key={machine.machine} className="border-b border-border last:border-0">
                      <td className="py-3 font-medium text-primary">{machine.machine}</td>
                      <td className="py-3 text-foreground">{machine.operator}</td>
                      <td className="py-3 text-right font-medium text-foreground">
                        {machine.avgPerHour}
                      </td>
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

          {/* Top SKUs */}
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold text-card-foreground">SKUs Más Producidos</h2>
              </div>
              <button className="text-muted-foreground hover:text-foreground">
                <MoreVertical className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              {topSkusData.map((sku) => (
                <div key={sku.sku}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground">{sku.sku}</span>
                    <span className="text-muted-foreground">
                      {sku.units.toLocaleString()} uds ({sku.percentage}%)
                    </span>
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

        {/* Bottom KPI Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CheckCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Eficiencia OEE
              </p>
              <p className="text-2xl font-bold text-card-foreground">87.5%</p>
            </div>
          </div>
          <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-100 text-yellow-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Tiempo Muerto
              </p>
              <p className="text-2xl font-bold text-card-foreground">2.3 hrs</p>
            </div>
          </div>
          <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Operadores Activos
              </p>
              <p className="text-2xl font-bold text-card-foreground">12</p>
            </div>
          </div>
          <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <RefreshCw className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Cambios SKU
              </p>
              <p className="text-2xl font-bold text-card-foreground">45</p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
