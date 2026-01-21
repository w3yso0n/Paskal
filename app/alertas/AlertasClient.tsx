"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Bell,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  Factory,
  Wrench,
  Users,
  Monitor,
  Filter,
  Check,
  X,
  Trash2,
  RefreshCw,
  Search,
} from "lucide-react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { alerts as initialAlerts, machines, type Alert, type AlertType, type AlertCategory } from "@/lib/mock-data"
import { useSearchParams } from "next/navigation"

const typeIcons: Record<AlertType, typeof AlertCircle> = {
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
  success: CheckCircle2,
}

const typeColors: Record<AlertType, { bg: string; text: string; border: string }> = {
  error: { bg: "bg-red-50", text: "text-red-600", border: "border-red-200" },
  warning: { bg: "bg-amber-50", text: "text-amber-600", border: "border-amber-200" },
  info: { bg: "bg-blue-50", text: "text-blue-600", border: "border-blue-200" },
  success: { bg: "bg-green-50", text: "text-green-600", border: "border-green-200" },
}

const categoryIcons: Record<AlertCategory, typeof Factory> = {
  machine: Factory,
  production: Monitor,
  maintenance: Wrench,
  employee: Users,
  system: Info,
}

const categoryLabels: Record<AlertCategory, string> = {
  machine: "Máquina",
  production: "Producción",
  maintenance: "Mantenimiento",
  employee: "Empleado",
  system: "Sistema",
}

const typeLabels: Record<AlertType, string> = {
  error: "Error",
  warning: "Advertencia",
  info: "Información",
  success: "Éxito",
}

function formatTimeAgo(date: Date): string {
  const now = new Date()
  const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))

  if (diffInMinutes < 1) return "Ahora mismo"
  if (diffInMinutes < 60) return `Hace ${diffInMinutes} min`
  if (diffInMinutes < 1440) return `Hace ${Math.floor(diffInMinutes / 60)} hrs`
  return `Hace ${Math.floor(diffInMinutes / 1440)} días`
}

function formatDateTime(date: Date): string {
  return date.toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}


export default function AlertasClient() {
  const searchParams = useSearchParams()

  const [view, setView] = useState<"production" | "operations">("production")

  const initialIdleThresholdMinutes = useMemo(() => {
    const fromQuery = Number(searchParams.get("idleMin"))
    return Number.isFinite(fromQuery) && fromQuery > 0 ? Math.round(fromQuery) : 10
  }, [searchParams])

  const [idleThresholdMinutes, setIdleThresholdMinutes] = useState<number>(initialIdleThresholdMinutes)
  const [alerts, setAlerts] = useState<Alert[]>(initialAlerts)
  const [machineCounters, setMachineCounters] = useState<Record<string, number>>(() => {
    return Object.fromEntries(machines.map((m) => [m.id, 0]))
  })
  const [lastIncreaseAtByMachine, setLastIncreaseAtByMachine] = useState<Record<string, number>>(() => {
    const now = Date.now()
    return Object.fromEntries(machines.map((m) => [m.id, now]))
  })

  const activeMachineIds = useMemo(() => {
    return machines.filter((m) => m.status === "active").map((m) => m.id)
  }, [])

  // Simulación: contadores de producción que a veces dejan de aumentar aun con máquina activa.
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const now = Date.now()

      const incrementsByMachine: Record<string, number> = {}
      for (const machineId of activeMachineIds) {
        const shouldIncrease = Math.random() < 0.8
        incrementsByMachine[machineId] = shouldIncrease ? 1 + Math.floor(Math.random() * 5) : 0
      }

      setMachineCounters((prev) => {
        const next = { ...prev }
        for (const machineId of activeMachineIds) {
          const increment = incrementsByMachine[machineId] ?? 0
          if (increment <= 0) continue
          next[machineId] = (next[machineId] ?? 0) + increment
        }
        return next
      })

      setLastIncreaseAtByMachine((prev) => {
        const next = { ...prev }
        for (const machineId of activeMachineIds) {
          const increment = incrementsByMachine[machineId] ?? 0
          if (increment <= 0) continue
          next[machineId] = now
        }
        return next
      })
    }, 12_000)

    return () => window.clearInterval(intervalId)
  }, [activeMachineIds])

  // Regla prioritaria: máquina activa sin incremento de producción durante X minutos.
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const now = Date.now()
      const thresholdMs = Math.max(1, idleThresholdMinutes) * 60 * 1000

      setAlerts((prev) => {
        let next = prev

        for (const machineId of activeMachineIds) {
          const lastIncreaseAt = lastIncreaseAtByMachine[machineId] ?? now
          const stagnantMs = now - lastIncreaseAt
          const isStagnant = stagnantMs >= thresholdMs
          const ruleAlertId = `rule-stagnant-production-${machineId}`
          const existingIndex = next.findIndex((a) => a.id === ruleAlertId)

          if (!isStagnant) continue

          const minutes = Math.max(0, Math.floor(stagnantMs / 60000))
          const machineLabel = machineId.toUpperCase()
          const currentCount = machineCounters[machineId] ?? 0
          const message = `La máquina ${machineLabel} está encendida pero la producción no ha incrementado en ${minutes} min (contador actual: ${currentCount} uds). Verifica operación, abastecimiento y registro.`

          if (existingIndex === -1) {
            next = [
              {
                id: ruleAlertId,
                type: "warning",
                category: "production",
                title: `Producción sin avance en ${machineLabel}`,
                message,
                timestamp: new Date(now),
                isRead: false,
                machineId,
                actionRequired: true,
              },
              ...next,
            ]
            continue
          }

          const existing = next[existingIndex]
          const shouldReopen = existing.isRead || !existing.actionRequired
          if (shouldReopen || existing.message !== message) {
            const updated: Alert = {
              ...existing,
              message,
              timestamp: new Date(now),
              isRead: false,
              actionRequired: true,
            }
            next = [...next.slice(0, existingIndex), updated, ...next.slice(existingIndex + 1)]
          }
        }

        return next
      })
    }, 3_000)

    return () => window.clearInterval(intervalId)
  }, [activeMachineIds, idleThresholdMinutes, lastIncreaseAtByMachine, machineCounters])
  const [filterType, setFilterType] = useState<string>("all")
  const [filterCategory, setFilterCategory] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [activeTab, setActiveTab] = useState("all")

  const scopedAlerts = useMemo(() => {
    return view === "production"
      ? alerts.filter((a) => a.category === "production")
      : alerts.filter((a) => a.category !== "production")
  }, [alerts, view])

  const unreadCount = scopedAlerts.filter((a) => !a.isRead).length
  const actionRequiredCount = scopedAlerts.filter((a) => a.actionRequired && !a.isRead).length
  const errorCount = scopedAlerts.filter((a) => a.type === "error" && !a.isRead).length
  const warningCount = scopedAlerts.filter((a) => a.type === "warning" && !a.isRead).length

  const filteredAlerts = scopedAlerts.filter((alert) => {
    const matchesTab =
      activeTab === "all" ||
      (activeTab === "unread" && !alert.isRead) ||
      (activeTab === "action" && alert.actionRequired && !alert.isRead)
    const matchesType = filterType === "all" || alert.type === filterType
    const matchesCategory =
      view === "production" ? true : filterCategory === "all" || alert.category === filterCategory
    const matchesSearch =
      searchQuery === "" ||
      alert.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      alert.message.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesTab && matchesType && matchesCategory && matchesSearch
  })

  const sortedAlerts = useMemo(() => {
    const severityRank: Record<AlertType, number> = {
      error: 4,
      warning: 3,
      info: 2,
      success: 1,
    }

    return [...filteredAlerts].sort((a, b) => {
      const aPriority = (a.actionRequired && !a.isRead) ? 1 : 0
      const bPriority = (b.actionRequired && !b.isRead) ? 1 : 0
      if (aPriority !== bPriority) return bPriority - aPriority

      const aUnread = !a.isRead ? 1 : 0
      const bUnread = !b.isRead ? 1 : 0
      if (aUnread !== bUnread) return bUnread - aUnread

      const aSeverity = severityRank[a.type]
      const bSeverity = severityRank[b.type]
      if (aSeverity !== bSeverity) return bSeverity - aSeverity

      return b.timestamp.getTime() - a.timestamp.getTime()
    })
  }, [filteredAlerts])

  const handleMarkAsRead = (id: string) => {
    setAlerts((prev) => prev.map((alert) => (alert.id === id ? { ...alert, isRead: true } : alert)))
  }

  const handleMarkAllAsRead = () => {
    setAlerts((prev) => prev.map((alert) => ({ ...alert, isRead: true })))
  }

  const handleDismiss = (id: string) => {
    setAlerts((prev) => prev.filter((alert) => alert.id !== id))
  }

  const handleClearAll = () => {
    setAlerts((prev) => prev.filter((alert) => !alert.isRead))
  }

  const handleResolve = (id: string) => {
    setAlerts((prev) =>
      prev.map((alert) => (alert.id === id ? { ...alert, isRead: true, actionRequired: false } : alert))
    )
  }

  return (
    <DashboardLayout breadcrumbs={[{ label: "Inicio", href: "/" }, { label: "Alertas" }]}>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Centro de Alertas</h1>
              <p className="text-sm text-muted-foreground">Monitorea todas las alertas y notificaciones del sistema</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleMarkAllAsRead} disabled={unreadCount === 0}>
              <Check className="mr-2 h-4 w-4" />
              Marcar todas como leídas
            </Button>
            <Button variant="outline" onClick={handleClearAll}>
              <Trash2 className="mr-2 h-4 w-4" />
              Limpiar leídas
            </Button>
          </div>
        </div>

        {/* View Switch */}
        <Card>
          <CardContent className="py-4">
            <Tabs value={view} onValueChange={(v) => setView(v as "production" | "operations")}>
              <TabsList>
                <TabsTrigger value="production">Monitoreo de Producción</TabsTrigger>
                <TabsTrigger value="operations">Funcionamiento</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardContent>
        </Card>

        {/* Production Monitor */}
        {view === "production" && (
          <Card>
            <CardHeader className="pb-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>Estado de producción por máquina</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Muestra el tiempo desde el último incremento. Dispara alerta al superar el umbral.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Umbral (min)</span>
                  <Input
                    type="number"
                    min={1}
                    value={idleThresholdMinutes}
                    onChange={(e) => setIdleThresholdMinutes(Math.max(1, Number(e.target.value) || 1))}
                    className="w-24"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {machines
                  .filter((m) => m.status === "active")
                  .map((m) => {
                    const lastIncreaseAt = lastIncreaseAtByMachine[m.id] ?? Date.now()
                    const minutes = Math.max(0, Math.floor((Date.now() - lastIncreaseAt) / 60000))
                    const isOverThreshold = minutes >= idleThresholdMinutes
                    const counter = machineCounters[m.id] ?? 0

                    return (
                      <div key={m.id} className="rounded-lg border border-border bg-card p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <Monitor className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium text-foreground">{m.name}</span>
                          </div>
                          <Badge variant={isOverThreshold ? "destructive" : "secondary"}>
                            {isOverThreshold ? "Sin avance" : "OK"}
                          </Badge>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">Min desde último incremento</p>
                            <p className={cn("font-semibold", isOverThreshold ? "text-destructive" : "text-foreground")}>
                              {minutes} min
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Contador</p>
                            <p className="font-semibold text-foreground">{counter} uds</p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Card className="border-red-200 bg-red-50">
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                <AlertCircle className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-red-700">Errores Críticos</p>
                <p className="text-2xl font-bold text-red-700">{errorCount}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
                <AlertTriangle className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-amber-700">Advertencias</p>
                <p className="text-2xl font-bold text-amber-700">{warningCount}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                <Bell className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-blue-700">Sin Leer</p>
                <p className="text-2xl font-bold text-blue-700">{unreadCount}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-orange-200 bg-orange-50">
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-100">
                <RefreshCw className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-orange-700">Acción Requerida</p>
                <p className="text-2xl font-bold text-orange-700">{actionRequiredCount}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Tabs */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList>
                  <TabsTrigger value="all">
                    Todas ({scopedAlerts.length})
                  </TabsTrigger>
                  <TabsTrigger value="unread">
                    Sin leer ({unreadCount})
                  </TabsTrigger>
                  <TabsTrigger value="action">
                    Acción requerida ({actionRequiredCount})
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar alertas..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 w-64"
                  />
                </div>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-40">
                    <Filter className="mr-2 h-4 w-4" />
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los tipos</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                    <SelectItem value="warning">Advertencia</SelectItem>
                    <SelectItem value="info">Información</SelectItem>
                    <SelectItem value="success">Éxito</SelectItem>
                  </SelectContent>
                </Select>
                {view === "operations" && (
                  <Select value={filterCategory} onValueChange={setFilterCategory}>
                    <SelectTrigger className="w-44">
                      <SelectValue placeholder="Categoría" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las categorías</SelectItem>
                      <SelectItem value="machine">Máquina</SelectItem>
                      <SelectItem value="maintenance">Mantenimiento</SelectItem>
                      <SelectItem value="employee">Empleado</SelectItem>
                      <SelectItem value="system">Sistema</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {sortedAlerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Bell className="mb-3 h-12 w-12 opacity-50" />
                <p className="text-sm">No hay alertas que coincidan con los filtros</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedAlerts.map((alert) => {
                  const TypeIcon = typeIcons[alert.type]
                  const CategoryIcon = categoryIcons[alert.category]
                  const colors = typeColors[alert.type]

                  return (
                    <div
                      key={alert.id}
                      className={cn(
                        "flex items-start gap-4 rounded-lg border p-4 transition-all",
                        colors.border,
                        !alert.isRead ? colors.bg : "bg-card hover:bg-muted/50"
                      )}
                    >
                      <div className={cn("flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full", colors.bg)}>
                        <TypeIcon className={cn("h-5 w-5", colors.text)} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className={cn("font-semibold", !alert.isRead ? "text-foreground" : "text-muted-foreground")}>
                                {alert.title}
                              </h3>
                              {alert.actionRequired && !alert.isRead && (
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                                  Acción requerida
                                </span>
                              )}
                              {!alert.isRead && <span className="h-2 w-2 rounded-full bg-primary" />}
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">{alert.message}</p>
                            <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <CategoryIcon className="h-3 w-3" />
                                {categoryLabels[alert.category]}
                              </span>
                              <span>{formatTimeAgo(alert.timestamp)}</span>
                              <span>{formatDateTime(alert.timestamp)}</span>
                              {alert.machineId && (
                                <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{alert.machineId.toUpperCase()}</span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            {alert.actionRequired && !alert.isRead && (
                              <Button size="sm" variant="default" onClick={() => handleResolve(alert.id)}>
                                <Check className="mr-1 h-3 w-3" />
                                Resolver
                              </Button>
                            )}
                            {!alert.isRead && (
                              <Button size="sm" variant="outline" onClick={() => handleMarkAsRead(alert.id)}>
                                Marcar leída
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => handleDismiss(alert.id)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Real-time indicator */}
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500"></span>
          </span>
          Actualizaciones en tiempo real activas
        </div>
      </div>
    </DashboardLayout>
  )
}


