"use client"

import { useEffect, useMemo, useState } from "react"
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
import { TooltipProps } from "recharts"
import { useAuth } from "@/contexts/auth-context"
import { getMachines, getProductionEvents, type ApiMachine, type ApiProductionEvent } from "@/lib/api"

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
  const { user, getAccessToken } = useAuth()
  const [loading, setLoading] = useState(true)
  const [machineProductionData, setMachineProductionData] = useState<Record<string, string | number>[]>([])
  const [machines, setMachines] = useState<ApiMachine[]>([])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const token = await getAccessToken()
        if (!token || !user?.orgId) {
          if (!cancelled) {
            setMachineProductionData([])
            setMachines([])
          }
          return
        }

        const [apiMachines, events] = await Promise.all([
          getMachines(token),
          getProductionEvents(token, { orgId: user.orgId, limit: 2500 }),
        ])
        if (cancelled) return
        setMachines(apiMachines)

        const machineNameById = new Map(apiMachines.map((m) => [m.id, m.code ?? m.name]))

        const byBucket = new Map<string, Record<string, string | number>>()
        for (const e of events) {
          const payload = e.payload ?? {}
          const rawEvent =
            (payload["EVENT"] as string | undefined) ??
            (payload["event"] as string | undefined) ??
            e.eventType
          const event = String(rawEvent ?? "").toLowerCase()
          const isProduction = event.includes("produ")
          if (!isProduction) continue

          const rawCount =
            (payload["COUNT"] as unknown) ??
            (payload["count"] as unknown) ??
            (payload["units"] as unknown)
          const count = typeof rawCount === "number" ? rawCount : Number(rawCount)
          if (!Number.isFinite(count) || count <= 0) continue

          const ts = new Date(e.occurredAt)
          if (Number.isNaN(ts.getTime())) continue

          const minutes = Math.floor(ts.getMinutes() / 10) * 10
          const bucket = new Date(ts)
          bucket.setMinutes(minutes, 0, 0)
          const label = bucket.toTimeString().slice(0, 5) // HH:MM

          const machineKey = String(machineNameById.get(e.machineId ?? "") ?? payload["MACHINE_ID"] ?? "—")
          const row = byBucket.get(label) ?? { time: label }
          row[machineKey] = (Number(row[machineKey]) || 0) + count
          byBucket.set(label, row)
        }

        const rows = [...byBucket.values()].sort((a, b) =>
          String(a.time).localeCompare(String(b.time))
        )
        setMachineProductionData(rows)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    const intervalId = window.setInterval(load, 30_000)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [getAccessToken, user?.orgId])

  const hasProductionData = machineProductionData.length > 0
  const machineKeys = useMemo(
    () =>
      hasProductionData
        ? Object.keys(machineProductionData[0]).filter((key) => key !== "time")
        : [],
    [hasProductionData, machineProductionData],
  )

  const [visibleMachines, setVisibleMachines] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setVisibleMachines(Object.fromEntries(machineKeys.map((key) => [key, true])))
  }, [machineKeys])

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

  const allVisible = machineKeys.length === 0 || machineKeys.every((key) => visibleMachines[key])
  const someVisible = machineKeys.length === 0 || machineKeys.some((key) => visibleMachines[key])
  const machinesActive = machines.filter((m) => m.status === "running").length
  const producedToday = useMemo(() => {
    return machineProductionData.reduce((acc, row) => {
      for (const [k, v] of Object.entries(row)) {
        if (k === "time") continue
        acc += Number(v) || 0
      }
      return acc
    }, 0)
  }, [machineProductionData])

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
            value="—"
            subtitle="Los datos se cargan desde el PLC"
            icon={Package}
            iconColor="text-primary"
          />
          <KpiCard
            title="Producido Hoy"
            value={loading ? "—" : producedToday.toLocaleString()}
            icon={Clock}
            iconColor="text-cyan-600"
          />
          <KpiCard
            title="Máquinas Activas"
            value={loading ? "—" : String(machinesActive)}
            icon={Server}
            iconColor="text-primary"
          />
          <KpiCard
            title="Meta Anual"
            value="—"
            icon={Target}
            iconColor="text-teal-600"
          />
        </div>

        {/* Production Chart */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-card-foreground">Producción de Máquinas</h2>
          </div>

          {loading ? (
            <div className="flex h-[400px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-muted-foreground">
              Cargando producción…
            </div>
          ) : !hasProductionData ? (
            <div className="flex h-[400px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-muted-foreground">
              Sin datos de producción. Los datos se cargan desde el PLC/ESP.
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
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
