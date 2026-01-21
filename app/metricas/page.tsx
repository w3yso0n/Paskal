"use client"

import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { Button } from "@/components/ui/button"
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

  const csvEscape = (value: unknown) => {
    const stringValue = value === null || value === undefined ? "" : String(value)
    const needsQuotes = /[\n\r",]/.test(stringValue)
    const escaped = stringValue.replaceAll('"', '""')
    return needsQuotes ? `"${escaped}"` : escaped
  }

  const toCsv = (rows: Array<Record<string, unknown>>) => {
    if (rows.length === 0) return ""

    const headers = Object.keys(rows[0])
    const headerLine = headers.map(csvEscape).join(",")
    const bodyLines = rows.map((row) => headers.map((key) => csvEscape(row[key])).join(","))
    return [headerLine, ...bodyLines].join("\n")
  }

  const downloadTextFile = (filename: string, content: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)

    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()

    URL.revokeObjectURL(url)
  }

  const handleDownloadDailyReport = () => {
    const today = new Date()
    const dateLabel = formatDate(today)

    const totalUnits = hourlyProductionData.reduce((sum, item) => sum + item.production, 0)
    const rows = hourlyProductionData.map((item) => ({
      fecha: dateLabel,
      hora: item.hour,
      unidades: item.production,
    }))

    rows.push({
      fecha: dateLabel,
      hora: "TOTAL",
      unidades: totalUnits,
    })

    downloadTextFile(`reporte-diario-produccion-${dateLabel}.csv`, toCsv(rows), "text/csv;charset=utf-8")
  }

  const handleDownloadMonthlyReport = () => {
    const today = new Date()
    const yearMonth = formatYearMonth(today)

    const rows = monthlyTrendData.map((item) => ({
      periodo: item.month,
      produccion_real: item.actual,
      meta: item.target,
      desviacion: item.actual - item.target,
    }))

    downloadTextFile(
      `reporte-mensual-produccion-${yearMonth}.csv`,
      toCsv(rows),
      "text/csv;charset=utf-8"
    )
  }

  const handleDownloadBonusReport = () => {
    const today = new Date()
    const yearMonth = formatYearMonth(today)

    const bonusRatePerUnit = 0.25
    const rows = operators.map((op) => ({
      periodo: yearMonth,
      colaborador: op.name,
      maquina: op.machine,
      sku: op.sku,
      unidades: op.units,
      bono_estimado: Number((op.units * bonusRatePerUnit).toFixed(2)),
    }))

    downloadTextFile(`reporte-bonos-${yearMonth}.csv`, toCsv(rows), "text/csv;charset=utf-8")
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
            <Download className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold text-card-foreground">Descargar reportes</h2>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            Genera reportes en CSV con los datos actuales del tablero.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Button variant="outline" className="justify-start" onClick={handleDownloadDailyReport}>
              <Download /> Reporte Diario de producción
            </Button>
            <Button variant="outline" className="justify-start" onClick={handleDownloadMonthlyReport}>
              <Download /> Reporte Mensual de producción
            </Button>
            <Button variant="outline" className="justify-start" onClick={handleDownloadBonusReport}>
              <Download /> Reporte de Bonos
            </Button>
          </div>
        </div>

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
            <table className="w-full">
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
