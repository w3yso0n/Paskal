"use client"

import { useState } from "react"
import { Home, GitCompare, TrendingUp, TrendingDown, Minus, ArrowUpRight, ArrowDownRight } from "lucide-react"
import Link from "next/link"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts"
import { machinePerformanceData, weeklyComparisonData, monthlyTrendData, machines } from "@/lib/mock-data"

const machineColors: Record<string, string> = {
  M1: "#22c55e",
  M2: "#3b82f6",
  M3: "#f59e0b",
  M4: "#8b5cf6",
  M5: "#ec4899",
  M6: "#06b6d4",
  M7: "#f97316",
  M8: "#6366f1",
}

export default function ComparativaPage() {
  const [selectedMachines, setSelectedMachines] = useState<string[]>(["M1", "M2", "M3"])
  const [comparisonPeriod, setComparisonPeriod] = useState("week")

  const toggleMachine = (machine: string) => {
    setSelectedMachines((prev) =>
      prev.includes(machine)
        ? prev.filter((m) => m !== machine)
        : prev.length < 5
          ? [...prev, machine]
          : prev
    )
  }

  const radarData = [
    { metric: "Eficiencia", ...Object.fromEntries(machinePerformanceData.map((m) => [m.machineName, m.efficiency])) },
    { metric: "Calidad", ...Object.fromEntries(machinePerformanceData.map((m) => [m.machineName, m.quality])) },
    { metric: "OEE", ...Object.fromEntries(machinePerformanceData.map((m) => [m.machineName, m.oee])) },
    {
      metric: "Disponibilidad",
      ...Object.fromEntries(machinePerformanceData.map((m) => [m.machineName, 100 - m.downtime * 10])),
    },
  ]

  const getPerformanceBadge = (value: number, threshold: number) => {
    if (value >= threshold + 5) {
      return (
        <Badge className="bg-green-100 text-green-700 gap-1">
          <TrendingUp className="h-3 w-3" /> Excelente
        </Badge>
      )
    }
    if (value >= threshold) {
      return (
        <Badge className="bg-blue-100 text-blue-700 gap-1">
          <Minus className="h-3 w-3" /> En meta
        </Badge>
      )
    }
    return (
      <Badge className="bg-amber-100 text-amber-700 gap-1">
        <TrendingDown className="h-3 w-3" /> Bajo meta
      </Badge>
    )
  }

  const bestMachine = machinePerformanceData.reduce((best, current) =>
    current.oee > best.oee ? current : best
  )

  const worstMachine = machinePerformanceData.reduce((worst, current) =>
    current.oee < worst.oee ? current : worst
  )

  const avgOee = machinePerformanceData.reduce((sum, m) => sum + m.oee, 0) / machinePerformanceData.length

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/" className="flex items-center gap-1 hover:text-foreground">
            <Home className="h-4 w-4" />
          </Link>
          <span>/</span>
          <span className="flex items-center gap-1">
            <GitCompare className="h-4 w-4" />
            Comparativa
          </span>
        </nav>

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Comparativa de Rendimiento</h1>
            <p className="text-muted-foreground">Analiza y compara el rendimiento entre maquinas y periodos</p>
          </div>
          <Select value={comparisonPeriod} onValueChange={setComparisonPeriod}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Periodo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Hoy</SelectItem>
              <SelectItem value="week">Esta semana</SelectItem>
              <SelectItem value="month">Este mes</SelectItem>
              <SelectItem value="quarter">Este trimestre</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">Mejor Maquina</p>
                  <p className="mt-1 text-2xl font-bold text-green-600">{bestMachine.machineName}</p>
                  <p className="text-sm text-muted-foreground">OEE: {bestMachine.oee}%</p>
                </div>
                <div className="rounded-full bg-green-100 p-3">
                  <ArrowUpRight className="h-6 w-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">Requiere Atencion</p>
                  <p className="mt-1 text-2xl font-bold text-amber-600">{worstMachine.machineName}</p>
                  <p className="text-sm text-muted-foreground">OEE: {worstMachine.oee}%</p>
                </div>
                <div className="rounded-full bg-amber-100 p-3">
                  <ArrowDownRight className="h-6 w-6 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">OEE Promedio</p>
                  <p className="mt-1 text-2xl font-bold text-foreground">{avgOee.toFixed(1)}%</p>
                  <p className="text-sm text-muted-foreground">Meta: 85%</p>
                </div>
                <div className="rounded-full bg-primary/10 p-3">
                  <GitCompare className="h-6 w-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">Maquinas Analizadas</p>
                  <p className="mt-1 text-2xl font-bold text-foreground">{machinePerformanceData.length}</p>
                  <p className="text-sm text-muted-foreground">de {machines.length} totales</p>
                </div>
                <div className="rounded-full bg-blue-100 p-3">
                  <TrendingUp className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Machine Selector */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Selecciona Maquinas para Comparar (max. 5)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {machinePerformanceData.map((machine) => (
                <button
                  key={machine.machineId}
                  onClick={() => toggleMachine(machine.machineName)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    selectedMachines.includes(machine.machineName)
                      ? "text-white"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                  style={{
                    backgroundColor: selectedMachines.includes(machine.machineName)
                      ? machineColors[machine.machineName]
                      : undefined,
                  }}
                >
                  {machine.machineName}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="performance" className="space-y-4">
          <TabsList>
            <TabsTrigger value="performance">Rendimiento</TabsTrigger>
            <TabsTrigger value="production">Produccion</TabsTrigger>
            <TabsTrigger value="trends">Tendencias</TabsTrigger>
            <TabsTrigger value="radar">Analisis Radar</TabsTrigger>
          </TabsList>

          {/* Performance Tab */}
          <TabsContent value="performance" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Metricas de Rendimiento por Maquina</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b text-left text-sm text-muted-foreground">
                        <th className="pb-3 font-medium">Maquina</th>
                        <th className="pb-3 font-medium">Eficiencia</th>
                        <th className="pb-3 font-medium">Produccion</th>
                        <th className="pb-3 font-medium">Tiempo Muerto</th>
                        <th className="pb-3 font-medium">Calidad</th>
                        <th className="pb-3 font-medium">OEE</th>
                        <th className="pb-3 font-medium">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {machinePerformanceData
                        .filter((m) => selectedMachines.includes(m.machineName))
                        .sort((a, b) => b.oee - a.oee)
                        .map((machine, index) => (
                          <tr key={machine.machineId} className="text-sm">
                            <td className="py-4">
                              <div className="flex items-center gap-2">
                                <div
                                  className="h-3 w-3 rounded-full"
                                  style={{ backgroundColor: machineColors[machine.machineName] }}
                                />
                                <span className="font-medium">{machine.machineName}</span>
                                {index === 0 && (
                                  <Badge className="bg-yellow-100 text-yellow-700 text-xs">Top</Badge>
                                )}
                              </div>
                            </td>
                            <td className="py-4">{machine.efficiency}%</td>
                            <td className="py-4">{machine.production.toLocaleString()} uds</td>
                            <td className="py-4">{machine.downtime} hrs</td>
                            <td className="py-4">{machine.quality}%</td>
                            <td className="py-4 font-semibold">{machine.oee}%</td>
                            <td className="py-4">{getPerformanceBadge(machine.oee, 85)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Comparacion de OEE</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={machinePerformanceData.filter((m) => selectedMachines.includes(m.machineName))}
                      layout="vertical"
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                      <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                      <YAxis type="category" dataKey="machineName" width={50} />
                      <Tooltip formatter={(value: number) => [`${value}%`, "OEE"]} />
                      <Bar
                        dataKey="oee"
                        radius={[0, 4, 4, 0]}
                        fill="#22c55e"
                        label={{ position: "right", formatter: (v: number) => `${v}%` }}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Production Tab */}
          <TabsContent value="production" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Produccion Semanal Comparativa</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weeklyComparisonData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="day" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      {selectedMachines.map((machine) => (
                        <Bar
                          key={machine}
                          dataKey={machine}
                          fill={machineColors[machine]}
                          radius={[4, 4, 0, 0]}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Trends Tab */}
          <TabsContent value="trends" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Tendencia Mensual: Real vs Meta</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={monthlyTrendData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="month" />
                      <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(value: number) => [value.toLocaleString(), ""]} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="actual"
                        name="Produccion Real"
                        stroke="#22c55e"
                        strokeWidth={2}
                        dot={{ fill: "#22c55e", strokeWidth: 2 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="target"
                        name="Meta"
                        stroke="#94a3b8"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={{ fill: "#94a3b8", strokeWidth: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Meses Sobre Meta</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {monthlyTrendData
                      .filter((m) => m.actual >= m.target)
                      .map((month) => (
                        <div key={month.month} className="flex items-center justify-between">
                          <span className="font-medium">{month.month}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-green-600">+{((m) => ((m.actual - m.target) / m.target) * 100)(month).toFixed(1)}%</span>
                            <ArrowUpRight className="h-4 w-4 text-green-600" />
                          </div>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Meses Bajo Meta</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {monthlyTrendData
                      .filter((m) => m.actual < m.target)
                      .map((month) => (
                        <div key={month.month} className="flex items-center justify-between">
                          <span className="font-medium">{month.month}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-amber-600">{((m) => ((m.actual - m.target) / m.target) * 100)(month).toFixed(1)}%</span>
                            <ArrowDownRight className="h-4 w-4 text-amber-600" />
                          </div>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Radar Tab */}
          <TabsContent value="radar" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Analisis Multidimensional</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[450px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData}>
                      <PolarGrid />
                      <PolarAngleAxis dataKey="metric" />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} />
                      {selectedMachines.map((machine) => (
                        <Radar
                          key={machine}
                          name={machine}
                          dataKey={machine}
                          stroke={machineColors[machine]}
                          fill={machineColors[machine]}
                          fillOpacity={0.2}
                        />
                      ))}
                      <Legend />
                      <Tooltip />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  )
}
