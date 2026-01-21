"use client"

import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { Package, Clock, Server, Target, ZoomIn, ZoomOut, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
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
import { machineProductionData } from "@/lib/mock-data"

const machineColors = [
  "#22c55e", // green
  "#3b82f6", // blue
  "#eab308", // yellow
  "#ec4899", // pink
  "#f97316", // orange
  "#8b5cf6", // purple
  "#06b6d4", // cyan
  "#84cc16", // lime
]

export default function HomePage() {
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
            title="Producción Total"
            value="8,923"
            subtitle="En los últimos 30 días"
            icon={Package}
            iconColor="text-primary"
          />
          <KpiCard
            title="Producido Hoy"
            value="446"
            icon={Clock}
            iconColor="text-cyan-600"
          />
          <KpiCard
            title="Máquinas Activas"
            value="18 / 20"
            icon={Server}
            iconColor="text-primary"
          />
          <KpiCard
            title="Meta Anual"
            value="92%"
            icon={Target}
            iconColor="text-teal-600"
          />
        </div>

        {/* Production Chart */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-card-foreground">Producción de Máquinas</h2>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-8 w-8 bg-transparent">
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8 bg-transparent">
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" className="h-8 gap-1 bg-transparent">
                <RotateCcw className="h-4 w-4" />
                Reset
              </Button>
            </div>
          </div>
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={machineProductionData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => {
                    const hour = Number.parseInt(value.split(":")[0])
                    const suffix = hour >= 12 ? "PM" : "AM"
                    const displayHour = hour > 12 ? hour - 12 : hour
                    return `${displayHour} ${suffix}`
                  }}
                />
                <YAxis tick={{ fontSize: 12 }} domain={[0, 600]} />
                <Tooltip />
                <Legend />
                {Object.keys(machineProductionData[0])
                  .filter((key) => key !== "time")
                  .map((key, index) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      stroke={machineColors[index % machineColors.length]}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          {/* Pagination */}
          <div className="mt-4 flex items-center justify-end gap-2 text-sm text-muted-foreground">
            <span>1-20 de 20</span>
            <Button variant="outline" size="icon" className="h-7 w-7 bg-transparent">
              <ZoomIn className="h-3 w-3" />
            </Button>
            <Button variant="outline" size="icon" className="h-7 w-7 bg-transparent">
              <ZoomOut className="h-3 w-3" />
            </Button>
            <Button variant="outline" size="sm" className="h-7 bg-transparent">
              {"<"}
            </Button>
            <Button variant="outline" size="sm" className="h-7 bg-transparent">
              {">"}
            </Button>
            <Button variant="outline" size="sm" className="h-7 bg-transparent">
              Reset
            </Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
