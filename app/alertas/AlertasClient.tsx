"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Bell,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  Factory,
  Users,
  Monitor,
  Filter,
  Check,
  X,
  Trash2,
  RefreshCw,
  Search,
  Plus,
  Loader2,
} from "lucide-react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import {
  type Alert,
  type AlertType,
  type AlertCategory,
} from "@/lib/types"
import { useSearchParams } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { hasPermission } from "@/lib/permissions"
import {
  deleteAlert,
  getAlerts,
  getBusinessAlertThresholds,
  getMachines,
  getProductionEvents,
  updateAlert,
  type AlertRuleSeverity,
  type ApiAlert,
  type ApiMachine,
  type ApiProductionEvent,
} from "@/lib/api"
import { useAlertRules } from "./hooks/use-alert-rules"
import { EspIdleAlertConfigCard } from "./EspIdleAlertConfigCard"

// --- Constants ---

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
  employee: Users,
  system: Info,
}

const categoryLabels: Record<AlertCategory, string> = {
  machine: "Máquina",
  production: "Producción",
  employee: "Empleado",
  system: "Sistema",
}

const CONDITION_OPTIONS = [
  { value: "idle_minutes", label: "Minutos sin avance (producción)" },
  { value: "value_above", label: "Valor por encima de umbral" },
  { value: "value_below", label: "Valor por debajo de umbral" },
]

const SEVERITY_OPTIONS: { value: AlertRuleSeverity; label: string }[] = [
  { value: "low", label: "Baja" },
  { value: "medium", label: "Media" },
  { value: "high", label: "Alta" },
  { value: "critical", label: "Crítica" },
]

const severityRank: Record<AlertType, number> = {
  error: 4,
  warning: 3,
  info: 2,
  success: 1,
}

function mapApiAlertToUi(a: ApiAlert): Alert {
  const type: AlertType =
    a.severity === "critical"
      ? "error"
      : a.severity === "high"
        ? "warning"
        : a.severity === "low"
          ? "info"
          : "warning"

  const category: AlertCategory =
    a.machineId != null ? "machine" : a.ruleId != null ? "production" : "system"

  const timestamp = new Date(a.createdAt)
  const isRead = a.status !== "open"
  const actionRequired = a.status === "open"

  return {
    id: a.id,
    type,
    category,
    title: a.title,
    message: a.message ?? "",
    timestamp: Number.isNaN(timestamp.getTime()) ? new Date() : timestamp,
    isRead,
    machineId: a.machineId ?? undefined,
    actionRequired,
  }
}

function isProductionIncrementEvent(e: ApiProductionEvent): boolean {
  const payload = e.payload ?? {}
  const rawEvent =
    (payload["EVENT"] as string | undefined) ??
    (payload["event"] as string | undefined) ??
    e.eventType
  const event = String(rawEvent ?? "").toLowerCase()
  if (!event) return false
  if (event.includes("produ")) return true
  return event === "producción" || event === "produccion"
}

function getEventCount(e: ApiProductionEvent): number {
  const payload = e.payload ?? {}
  const raw =
    (payload["COUNT"] as unknown) ??
    (payload["count"] as unknown) ??
    (payload["units"] as unknown)
  const n = typeof raw === "number" ? raw : Number(raw)
  return Number.isFinite(n) ? n : 0
}

// --- Helpers ---

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

// --- Component ---

export default function AlertasClient() {
  const searchParams = useSearchParams()
  const { user, getAccessToken } = useAuth()

  const canManageRules = hasPermission(user, "alert-rules.create")
  const canDismissAlerts = hasPermission(user, "alerts.dismiss")
  const canEditThreshold = hasPermission(user, "production.edit-threshold")

  // --- View and filter state ---
  const [view, setView] = useState<"production" | "operations">("production")
  const [filterType, setFilterType] = useState("all")
  const [filterCategory, setFilterCategory] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [activeTab, setActiveTab] = useState("all")

  // --- Idle threshold ---
  const initialIdleThresholdMinutes = useMemo(() => {
    const fromQuery = Number(searchParams.get("idleMin"))
    return Number.isFinite(fromQuery) && fromQuery > 0 ? Math.round(fromQuery) : 10
  }, [searchParams])
  const [idleThresholdMinutes, setIdleThresholdMinutes] = useState(initialIdleThresholdMinutes)

  useEffect(() => {
    let cancelled = false
    const loadThresholds = async () => {
      try {
        const token = await getAccessToken()
        if (!token || cancelled) return
        const cfg = await getBusinessAlertThresholds(token)
        if (!cancelled && !searchParams.get("idleMin")) {
          setIdleThresholdMinutes(cfg.idleMinutesWithoutProduction)
        }
      } catch {
        // mantiene valor por defecto o query string
      }
    }
    void loadThresholds()
    return () => {
      cancelled = true
    }
  }, [getAccessToken, searchParams])

  // --- Hooks ---
  const alertRules = useAlertRules({
    enabled: canManageRules,
    getAccessToken,
  })

  // --- Alerts state ---
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [alertsLoading, setAlertsLoading] = useState(true)
  const [machineRows, setMachineRows] = useState<ApiMachine[]>([])
  const [machineCounters, setMachineCounters] = useState<Record<string, number>>({})
  const [lastIncreaseAtByMachine, setLastIncreaseAtByMachine] = useState<Record<string, number>>(
    {},
  )

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setAlertsLoading(true)
      try {
        const token = await getAccessToken()
        if (!token) {
          if (!cancelled) setAlerts([])
          return
        }
        const [apiAlerts, apiMachines] = await Promise.all([
          getAlerts(token),
          getMachines(token),
        ])
        if (cancelled) return
        setMachineRows(apiMachines)
        setAlerts(apiAlerts.map(mapApiAlertToUi))
      } finally {
        if (!cancelled) setAlertsLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [getAccessToken])

  useEffect(() => {
    if (view !== "production") return
    let cancelled = false
    const run = async () => {
      const token = await getAccessToken()
      if (!token || !user) return

      const events = await getProductionEvents(token, { limit: 1500 })
      if (cancelled) return

      const lastByMachine: Record<string, number> = {}
      const counters: Record<string, number> = {}
      for (const e of events) {
        if (!e.machineId) continue
        if (!isProductionIncrementEvent(e)) continue
        const count = getEventCount(e)
        if (count <= 0) continue
        const ts = new Date(e.occurredAt).getTime()
        if (!Number.isFinite(ts)) continue
        counters[e.machineId] = (counters[e.machineId] ?? 0) + count
        lastByMachine[e.machineId] = Math.max(lastByMachine[e.machineId] ?? 0, ts)
      }

      setMachineCounters(counters)
      setLastIncreaseAtByMachine(lastByMachine)
    }

    run()
    const intervalId = window.setInterval(run, 20_000)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [getAccessToken, view])

  // --- Derived state ---
  const scopedAlerts = useMemo(
    () =>
      view === "production"
        ? alerts.filter((a) => a.category === "production")
        : alerts.filter((a) => a.category !== "production"),
    [alerts, view],
  )

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

  const sortedAlerts = useMemo(
    () =>
      [...filteredAlerts].sort((a, b) => {
        const aPriority = a.actionRequired && !a.isRead ? 1 : 0
        const bPriority = b.actionRequired && !b.isRead ? 1 : 0
        if (aPriority !== bPriority) return bPriority - aPriority

        const aUnread = !a.isRead ? 1 : 0
        const bUnread = !b.isRead ? 1 : 0
        if (aUnread !== bUnread) return bUnread - aUnread

        if (severityRank[a.type] !== severityRank[b.type])
          return severityRank[b.type] - severityRank[a.type]

        return b.timestamp.getTime() - a.timestamp.getTime()
      }),
    [filteredAlerts],
  )

  // --- Alert actions ---
  const handleMarkAsRead = async (id: string) => {
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, isRead: true } : a)))
    const token = await getAccessToken()
    if (!token) return
    await updateAlert(token, id, { status: "acknowledged" })
  }

  const handleMarkAllAsRead = async () => {
    setAlerts((prev) => prev.map((a) => ({ ...a, isRead: true })))
    const token = await getAccessToken()
    if (!token) return
    const unread = scopedAlerts.filter((a) => !a.isRead).map((a) => a.id)
    await Promise.allSettled(unread.map((id) => updateAlert(token, id, { status: "acknowledged" })))
  }

  const handleDismiss = async (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id))
    const token = await getAccessToken()
    if (!token) return
    await deleteAlert(token, id)
  }

  const handleClearAll = async () => {
    const token = await getAccessToken()
    setAlerts((prev) => prev.filter((a) => !a.isRead))
    if (!token) return
    const toDelete = scopedAlerts.filter((a) => a.isRead).map((a) => a.id)
    await Promise.allSettled(toDelete.map((id) => deleteAlert(token, id)))
  }

  const handleResolve = async (id: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, isRead: true, actionRequired: false } : a)),
    )
    const token = await getAccessToken()
    if (!token) return
    await updateAlert(token, id, { status: "closed", closedAt: new Date().toISOString() })
  }

  return (
    <DashboardLayout breadcrumbs={[{ label: "Inicio", href: "/" }, { label: "Alertas" }]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Centro de Alertas</h1>
              <p className="text-sm text-muted-foreground">
                Monitorea todas las alertas y notificaciones del sistema
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleMarkAllAsRead} disabled={unreadCount === 0}>
              <Check className="mr-2 h-4 w-4" />
              Marcar todas como leídas
            </Button>
            {canDismissAlerts && (
              <Button variant="outline" onClick={handleClearAll}>
                <Trash2 className="mr-2 h-4 w-4" />
                Limpiar leídas
              </Button>
            )}
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

        <EspIdleAlertConfigCard
          machines={machineRows}
          canConfigure={hasPermission(user, "production.esp-idle-config")}
        />

        {/* Alert Rules (admin only) */}
        {canManageRules && (
          <Card>
            <CardHeader className="pb-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Reglas de alerta</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Crea reglas con umbrales para que el sistema dispare alertas automáticamente.
                  </p>
                </div>
                <Dialog open={alertRules.dialogOpen} onOpenChange={alertRules.setDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="gap-2">
                      <Plus className="h-4 w-4" />
                      Nueva regla
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Nueva regla de alerta</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label htmlFor="rule-name">Nombre</Label>
                        <Input
                          id="rule-name"
                          placeholder="Ej: Producción sin avance 15 min"
                          value={alertRules.form.name}
                          onChange={(e) =>
                            alertRules.setForm((f) => ({ ...f, name: e.target.value }))
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Condición</Label>
                        <Select
                          value={alertRules.form.condition}
                          onValueChange={(v) =>
                            alertRules.setForm((f) => ({ ...f, condition: v }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CONDITION_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="rule-threshold">Umbral</Label>
                        <Input
                          id="rule-threshold"
                          type="number"
                          min={1}
                          value={alertRules.form.threshold}
                          onChange={(e) =>
                            alertRules.setForm((f) => ({
                              ...f,
                              threshold: Math.max(1, Number(e.target.value) || 1),
                            }))
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          Para &quot;minutos sin avance&quot;: minutos que disparan la alerta. Para
                          valor: límite numérico.
                        </p>
                      </div>
                      <div className="grid gap-2">
                        <Label>Severidad</Label>
                        <Select
                          value={alertRules.form.severity}
                          onValueChange={(v) =>
                            alertRules.setForm((f) => ({
                              ...f,
                              severity: v as AlertRuleSeverity,
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SEVERITY_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={alertRules.form.isActive}
                          onCheckedChange={(checked) =>
                            alertRules.setForm((f) => ({ ...f, isActive: checked }))
                          }
                        />
                        <Label>Regla activa</Label>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => alertRules.setDialogOpen(false)}>
                        Cancelar
                      </Button>
                      <Button onClick={alertRules.handleCreate} disabled={alertRules.submitting}>
                        {alertRules.submitting ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Creando…
                          </>
                        ) : (
                          "Crear regla"
                        )}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {alertRules.loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : alertRules.rules.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">
                  No hay reglas de alerta. Crea una con el botón &quot;Nueva regla&quot;.
                </p>
              ) : (
                <div className="space-y-2">
                  {alertRules.rules.map((rule) => (
                    <div
                      key={rule.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">{rule.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Condición:{" "}
                          {CONDITION_OPTIONS.find((o) => o.value === rule.condition)?.label ??
                            rule.condition}{" "}
                          · Umbral: {rule.threshold ?? "—"} · Severidad: {rule.severity}
                          {!rule.isActive && " · Inactiva"}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => alertRules.handleDelete(rule.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Production Monitor */}
        {view === "production" && (
          <Card>
            <CardHeader className="pb-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>Estado de producción por máquina</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Muestra el tiempo desde el último incremento. Dispara alerta al superar el
                    umbral.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Umbral (min)</span>
                  <Input
                    type="number"
                    min={1}
                    value={idleThresholdMinutes}
                    onChange={(e) =>
                      canEditThreshold &&
                      setIdleThresholdMinutes(Math.max(1, Number(e.target.value) || 1))
                    }
                    className="w-24"
                    readOnly={!canEditThreshold}
                    disabled={!canEditThreshold}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {machineRows
                  .filter((m) => m.status === "green")
                  .map((m) => {
                    const lastIncreaseAt = lastIncreaseAtByMachine[m.id] ?? Date.now()
                    const minutes = Math.max(
                      0,
                      Math.floor((Date.now() - lastIncreaseAt) / 60000),
                    )
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
                            <p className="text-xs text-muted-foreground">
                              Min desde último incremento
                            </p>
                            <p
                              className={cn(
                                "font-semibold",
                                isOverThreshold ? "text-destructive" : "text-foreground",
                              )}
                            >
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
                  <TabsTrigger value="all">Todas ({scopedAlerts.length})</TabsTrigger>
                  <TabsTrigger value="unread">Sin leer ({unreadCount})</TabsTrigger>
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
                    className="w-64 pl-9"
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
                      <SelectItem value="system">Sistema</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {alertsLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Cargando alertas…
              </div>
            ) : sortedAlerts.length === 0 ? (
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
                        !alert.isRead ? colors.bg : "bg-card hover:bg-muted/50",
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                          colors.bg,
                        )}
                      >
                        <TypeIcon className={cn("h-5 w-5", colors.text)} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3
                                className={cn(
                                  "font-semibold",
                                  !alert.isRead
                                    ? "text-foreground"
                                    : "text-muted-foreground",
                                )}
                              >
                                {alert.title}
                              </h3>
                              {alert.actionRequired && !alert.isRead && (
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                                  Acción requerida
                                </span>
                              )}
                              {!alert.isRead && (
                                <span className="h-2 w-2 rounded-full bg-primary" />
                              )}
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
                                <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                                  {alert.machineId.toUpperCase()}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-2">
                            {alert.actionRequired && !alert.isRead && (
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => handleResolve(alert.id)}
                              >
                                <Check className="mr-1 h-3 w-3" />
                                Resolver
                              </Button>
                            )}
                            {!alert.isRead && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleMarkAsRead(alert.id)}
                              >
                                Marcar leída
                              </Button>
                            )}
                            {canDismissAlerts && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDismiss(alert.id)}
                                title="Eliminar alerta"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            )}
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
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
          </span>
          Actualizaciones en tiempo real activas
        </div>
      </div>
    </DashboardLayout>
  )
}
