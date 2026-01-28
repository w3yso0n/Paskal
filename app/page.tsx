"use client"

import { useState } from "react"
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
import { machineProductionData } from "@/lib/mock-data"
import { TooltipProps } from "recharts"

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

export default function HomePage() {
  // Initialize all machines as visible
  const machineKeys = Object.keys(machineProductionData[0]).filter((key) => key !== "time")
  const [visibleMachines, setVisibleMachines] = useState<Record<string, boolean>>(
    Object.fromEntries(machineKeys.map((key) => [key, true]))
  )

  const toggleMachine = (machineName: string) => {
    setVisibleMachines((prev) => ({
      ...prev,
      [machineName]: !prev[machineName],
    }))
  }

  const toggleAllMachines = (checked: boolean) => {
    setVisibleMachines(
      Object.fromEntries(machineKeys.map((key) => [key, checked]))
    )
  }

  const allVisible = machineKeys.every((key) => visibleMachines[key])
  const someVisible = machineKeys.some((key) => visibleMachines[key])

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
          </div>

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
                Seleccionar/Deseleccionar todas
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {machineKeys.map((machineName) => (
                <div key={machineName} className="flex items-center gap-2">
                  <Checkbox
                    id={machineName}
                    checked={visibleMachines[machineName]}
                    onCheckedChange={() => toggleMachine(machineName)}
                  />
                  <label
                    htmlFor={machineName}
                    className="cursor-pointer text-xs leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {machineName}
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={machineProductionData}>
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
                <YAxis tick={{ fontSize: 12 }} domain={[0, 600]} />
                <Tooltip content={<CustomTooltip />} />
                {machineKeys.map((key, index) =>
                  visibleMachines[key] ? (
                    <Line
                      key={key}
                      type="monotone"
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

        </div>
      </div>
    </DashboardLayout>
  )
}
