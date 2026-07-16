"use client"

import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import {
  Bell,
  AlertTriangle,
  Info,
  Users,
  Monitor,
  Filter,
  Check,
  X,
  Trash2,
  RefreshCw,
  Search,
  Loader2,
  Save,
  StickyNote,
  MoreHorizontal,
  CalendarDays,
  Timer,
  ListOrdered,
  Gauge,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { type Alert } from "@/lib/types"
import { useAuth } from "@/contexts/auth-context"
import { hasPermission } from "@/lib/permissions"
import {
  attributeOrphanProduction,
  deleteAlert,
  getAlerts,
  getDowntimeNotes,
  getEmployees,
  getMachines,
  getProductionEvents,
  getProductSkus,
  updateAlert,
  upsertDowntimeNote,
  type ApiAlert,
  type ApiEmployee,
  type ApiMachine,
  type ApiProductionEvent,
  type ApiProductSku,
} from "@/lib/api"
import { toast } from "sonner"
import {
  parsePendingUnitsFromAlertMessage,
  sumOrphanPendingForAlert,
} from "@/lib/production-goal-events"
import {
  mapApiAlertToUi,
  ALERTS_POLL_MS,
  ALERT_KIND_LABELS,
  ALERT_KIND_FILTER_ORDER,
  ALERT_KIND_ICONS,
  ALERT_KIND_EXPLAINERS,
  ALERT_SEVERITY_STYLES,
  ALERT_SEVERITY_RANK,
  isOperatorOrphanAlertKind,
  isPackagerOrphanAlertKind,
} from "@/lib/alert-ui"
import {
  addPlantDays,
  ALERT_KIND_CHART_COLORS,
  buildAlertsByKindChartConfig,
  buildDailyAlertsByKindSeries,
} from "@/lib/alert-role-metrics"
import {
  buildAlertRangeSummary,
  buildHourKindHeatmap,
  buildIdleMinutesByDay,
  buildMachineAlertPareto,
  formatMinutesShort,
  type HourKindHeatmap,
} from "@/lib/alert-analytics"
import {
  isFloorOperatorCandidate,
  isFloorPackerCandidate,
} from "@/lib/employee-production-role"
import {
  buildDowntimeNoteContextFromAlert,
  isDowntimeParoAlert,
} from "@/lib/employee-downtime-analytics"
import { filterFloorMachines } from "@/lib/machine-floor"
import { getPartsInTimeZone } from "@/lib/shift-timezone"
import {
  PLANT_TIMEZONE,
  productionShiftFromMeasuredAt,
} from "@/lib/tablero-operator-goal"

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

function formatTimeOnly(date: Date): string {
  return date.toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: PLANT_TIMEZONE,
  })
}

function plantDayKey(date: Date): string {
  const p = getPartsInTimeZone(date, PLANT_TIMEZONE)
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`
}

function todayPlantDayKey(): string {
  return plantDayKey(new Date())
}

const SHIFT_LABELS = {
  matutino: "Matutino",
  vespertino: "Vespertino",
} as const

type ShiftFilter = "all" | "matutino" | "vespertino"

function isOperatorOrphanProductionAlert(a: Alert): boolean {
  return isOperatorOrphanAlertKind(a.kind)
}

function isPackagerOrphanProductionAlert(a: Alert): boolean {
  return isPackagerOrphanAlertKind(a.kind)
}

function isAttributableOrphanAlert(a: Alert): boolean {
  return isOperatorOrphanProductionAlert(a) || isPackagerOrphanProductionAlert(a)
}

const HEATMAP_HOURS = Array.from({ length: 24 }, (_, i) => i)

/** Un solo tono (azul, ya usado en el panel para "Sin leer"), más opaco = más alertas —
 * escala secuencial, nunca arcoíris. La causa va en la etiqueta de fila, no en el color. */
function heatCellBackground(count: number, maxCount: number): string {
  if (count === 0) return "transparent"
  const intensity = maxCount > 0 ? count / maxCount : 0
  const alpha = 0.12 + intensity * 0.78
  return `rgba(37, 99, 235, ${alpha.toFixed(2)})`
}

/** Heatmap hora (TZ planta) × causa. Grid simple en vez de un componente de gráficas — no hay
 * un tipo "heatmap" nativo en recharts y esto es más liviano que forzarlo con un scatter. */
function AlertHourHeatmap({ heatmap }: { heatmap: HourKindHeatmap }) {
  return (
    <div className="overflow-x-auto">
      <div
        className="grid min-w-[680px] gap-[2px]"
        style={{ gridTemplateColumns: "104px repeat(24, minmax(22px, 1fr))" }}
      >
        <div />
        {HEATMAP_HOURS.map((h) => (
          <div key={h} className="pb-1 text-center text-[9px] text-muted-foreground">
            {h % 3 === 0 ? `${h}h` : ""}
          </div>
        ))}
        {heatmap.kindsInRange.map((kind) => (
          <Fragment key={kind}>
            <div className="flex items-center truncate pr-2 text-xs text-muted-foreground">
              {ALERT_KIND_LABELS[kind]}
            </div>
            {HEATMAP_HOURS.map((h) => {
              const count = heatmap.counts[h]?.[kind] ?? 0
              return (
                <div
                  key={h}
                  title={`${ALERT_KIND_LABELS[kind]} · ${h}:00–${h}:59 (TZ planta) · ${count}`}
                  className="aspect-square rounded-sm"
                  style={{ backgroundColor: heatCellBackground(count, heatmap.maxCount) }}
                />
              )
            })}
          </Fragment>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        Hora del día en zona de planta · más oscuro = más alertas (pasa el cursor por una celda
        para ver el número exacto; máximo {heatmap.maxCount} en una sola celda)
      </p>
    </div>
  )
}

// --- Component ---

export default function AlertasClient() {
  const { user, getAccessToken } = useAuth()

  const canDismissAlerts = hasPermission(user, "alerts.dismiss")
  const canDeleteAllAlerts = hasPermission(user, "alerts.clear")

  const [filterKind, setFilterKind] = useState("all")
  const [filterMachine, setFilterMachine] = useState("all")
  const [filterDay, setFilterDay] = useState(() => todayPlantDayKey())
  const [filterShift, setFilterShift] = useState<ShiftFilter>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [activeTab, setActiveTab] = useState("all")
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  // Rango del análisis (gráfica + KPIs + Pareto + heatmap + minutos de paro): independiente
  // del filtro de día de la tabla (ese es para operar hoy; esto es para ver tendencia).
  const [chartRangeDays, setChartRangeDays] = useState(14)
  const [analysisView, setAnalysisView] = useState("daily")

  const [alerts, setAlerts] = useState<Alert[]>([])
  const [apiAlertsById, setApiAlertsById] = useState<Map<string, ApiAlert>>(new Map())
  const [notesBySourceKey, setNotesBySourceKey] = useState<Map<string, string>>(new Map())
  const [alertsLoading, setAlertsLoading] = useState(true)
  const [machineRows, setMachineRows] = useState<ApiMachine[]>([])
  const [productionEvents, setProductionEvents] = useState<ApiProductionEvent[]>([])
  const [employees, setEmployees] = useState<ApiEmployee[]>([])
  const [skus, setSkus] = useState<ApiProductSku[]>([])
  const [assignAlert, setAssignAlert] = useState<Alert | null>(null)
  const [assignOperator, setAssignOperator] = useState<string>("")
  const [assignPackager, setAssignPackager] = useState<string>("")
  const [assignSku, setAssignSku] = useState<string>("")
  const [assigning, setAssigning] = useState(false)
  const [noteAlertId, setNoteAlertId] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState("")
  const [savingNote, setSavingNote] = useState(false)

  const loadDowntimeNotes = useCallback(async () => {
    try {
      const token = await getAccessToken()
      if (!token) return
      const notes = await getDowntimeNotes(token)
      const map = new Map<string, string>()
      for (const n of notes) {
        if (n.notes?.trim()) map.set(n.sourceKey, n.notes.trim())
      }
      setNotesBySourceKey(map)
    } catch {
      setNotesBySourceKey(new Map())
    }
  }, [getAccessToken])

  const reloadAlerts = useCallback(
    async (opts?: { showSpinner?: boolean }) => {
      const showSpinner = opts?.showSpinner ?? false
      if (showSpinner) setAlertsLoading(true)
      try {
        const token = await getAccessToken()
        if (!token) {
          setAlerts([])
          setApiAlertsById(new Map())
          return
        }
        const [apiAlerts, events] = await Promise.all([
          getAlerts(token),
          getProductionEvents(token, { limit: 1500 }),
        ])
        setProductionEvents(events)
        setApiAlertsById(new Map(apiAlerts.map((a) => [a.id, a])))
        setAlerts(apiAlerts.map((a) => mapApiAlertToUi(a, events)))
      } finally {
        if (showSpinner) setAlertsLoading(false)
      }
    },
    [getAccessToken],
  )

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setAlertsLoading(true)
      try {
        const token = await getAccessToken()
        if (!token) {
          if (!cancelled) {
            setAlerts([])
            setApiAlertsById(new Map())
          }
          return
        }
        const [apiAlerts, apiMachines, apiEmployees, apiSkus, events] = await Promise.all([
          getAlerts(token),
          getMachines(token),
          getEmployees(token),
          getProductSkus(token),
          getProductionEvents(token, { limit: 1500 }),
        ])
        if (cancelled) return
        setMachineRows(apiMachines)
        setEmployees(apiEmployees)
        setSkus(apiSkus)
        setProductionEvents(events)
        setApiAlertsById(new Map(apiAlerts.map((a) => [a.id, a])))
        setAlerts(apiAlerts.map((a) => mapApiAlertToUi(a, events)))
      } finally {
        if (!cancelled) setAlertsLoading(false)
      }
    }
    load()
    void loadDowntimeNotes()
    return () => {
      cancelled = true
    }
  }, [getAccessToken, loadDowntimeNotes])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void reloadAlerts()
    }, ALERTS_POLL_MS)
    return () => window.clearInterval(intervalId)
  }, [reloadAlerts])

  const machineCodeById = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of machineRows) {
      if (m.id) map.set(m.id, (m.code ?? m.name ?? m.id).trim() || m.id)
    }
    return map
  }, [machineRows])

  const machineFilterOptions = useMemo(() => {
    const floor = filterFloorMachines(machineRows)
    const byId = new Map<string, string>()
    for (const m of floor) {
      byId.set(m.id, (m.code ?? m.name ?? m.id).trim() || m.id)
    }
    for (const a of alerts) {
      if (!a.machineId) continue
      if (!byId.has(a.machineId)) {
        byId.set(a.machineId, machineCodeById.get(a.machineId) ?? a.machineId)
      }
    }
    return [...byId.entries()]
      .map(([id, code]) => ({ id, code }))
      .sort((a, b) => a.code.localeCompare(b.code, "es"))
  }, [machineRows, alerts, machineCodeById])

  // Array crudo (no el modelo UI mapeado) para la gráfica: ya está cargado por reloadAlerts,
  // sin fetch adicional — con el poll de 30 s queda casi en vivo.
  const apiAlerts = useMemo(() => [...apiAlertsById.values()], [apiAlertsById])

  // Un solo rango para TODO el análisis (gráfica diaria + KPIs + Pareto + heatmap + minutos de
  // paro): un solo control arriba, todas las vistas contra el mismo corte de fechas.
  const analysisRange = useMemo(() => {
    const endDay = todayPlantDayKey()
    return { startDay: addPlantDays(endDay, -(chartRangeDays - 1)), endDay }
  }, [chartRangeDays])

  const alertsByKindDaily = useMemo(
    () => buildDailyAlertsByKindSeries(apiAlerts, analysisRange.startDay, analysisRange.endDay),
    [apiAlerts, analysisRange],
  )

  const alertsByKindChartConfig = useMemo(
    () => buildAlertsByKindChartConfig(alertsByKindDaily.kindsInRange),
    [alertsByKindDaily.kindsInRange],
  )

  const rangeSummary = useMemo(
    () => buildAlertRangeSummary(apiAlerts, analysisRange.startDay, analysisRange.endDay),
    [apiAlerts, analysisRange],
  )

  const machinePareto = useMemo(
    () =>
      buildMachineAlertPareto(
        apiAlerts,
        analysisRange.startDay,
        analysisRange.endDay,
        machineCodeById,
      ),
    [apiAlerts, analysisRange, machineCodeById],
  )
  const machineParetoConfig = useMemo(
    () => buildAlertsByKindChartConfig(machinePareto.kindsInRange),
    [machinePareto.kindsInRange],
  )

  const hourHeatmap = useMemo(
    () => buildHourKindHeatmap(apiAlerts, analysisRange.startDay, analysisRange.endDay),
    [apiAlerts, analysisRange],
  )

  const idleMinutesDaily = useMemo(
    () => buildIdleMinutesByDay(apiAlerts, analysisRange.startDay, analysisRange.endDay),
    [apiAlerts, analysisRange],
  )

  const unreadCount = alerts.filter((a) => !a.isRead).length
  const actionRequiredCount = alerts.filter((a) => a.actionRequired && !a.isRead).length
  const paroCount = alerts.filter((a) => a.kind === "idle" && !a.isRead).length
  const orphanProductionCount = alerts.filter(
    (a) => (a.kind === "no_checkin" || a.kind === "no_packager") && !a.isRead,
  ).length

  const hasActiveContextFilters =
    filterMachine !== "all" ||
    filterDay !== "" ||
    filterShift !== "all" ||
    filterKind !== "all" ||
    searchQuery.trim() !== ""

  const clearContextFilters = () => {
    setFilterMachine("all")
    setFilterDay("")
    setFilterShift("all")
    setFilterKind("all")
    setSearchQuery("")
  }

  const filteredAlerts = useMemo(() => {
    return alerts.filter((alert) => {
      const matchesTab =
        activeTab === "all" ||
        (activeTab === "unread" && !alert.isRead) ||
        (activeTab === "action" && alert.actionRequired && !alert.isRead)
      const matchesKind = filterKind === "all" || alert.kind === filterKind
      const matchesMachine =
        filterMachine === "all" ||
        (filterMachine === "__none__"
          ? !alert.machineId
          : alert.machineId === filterMachine)
      const matchesDay =
        filterDay === "" || plantDayKey(alert.timestamp) === filterDay
      const shift = productionShiftFromMeasuredAt(alert.timestamp.toISOString())
      const matchesShift = filterShift === "all" || shift === filterShift
      const q = searchQuery.trim().toLowerCase()
      const machineLabel = alert.machineId
        ? (machineCodeById.get(alert.machineId) ?? alert.machineId).toLowerCase()
        : ""
      const matchesSearch =
        q === "" ||
        alert.title.toLowerCase().includes(q) ||
        alert.message.toLowerCase().includes(q) ||
        machineLabel.includes(q) ||
        ALERT_KIND_LABELS[alert.kind].toLowerCase().includes(q)
      return (
        matchesTab &&
        matchesKind &&
        matchesMachine &&
        matchesDay &&
        matchesShift &&
        matchesSearch
      )
    })
  }, [
    alerts,
    activeTab,
    filterKind,
    filterMachine,
    filterDay,
    filterShift,
    searchQuery,
    machineCodeById,
  ])

  const sortedAlerts = useMemo(
    () =>
      [...filteredAlerts].sort((a, b) => {
        const aPriority = a.actionRequired && !a.isRead ? 1 : 0
        const bPriority = b.actionRequired && !b.isRead ? 1 : 0
        if (aPriority !== bPriority) return bPriority - aPriority

        const aUnread = !a.isRead ? 1 : 0
        const bUnread = !b.isRead ? 1 : 0
        if (aUnread !== bUnread) return bUnread - aUnread

        // Gravedad REAL, no el bucket visual — antes un overtime_hours (siempre "critical" en
        // el backend) podía ordenar por debajo de un idle "alto" porque el bucket los agrupaba
        // distinto; con la gravedad cruda ya no pasa.
        if (ALERT_SEVERITY_RANK[a.severity] !== ALERT_SEVERITY_RANK[b.severity])
          return ALERT_SEVERITY_RANK[b.severity] - ALERT_SEVERITY_RANK[a.severity]

        return b.timestamp.getTime() - a.timestamp.getTime()
      }),
    [filteredAlerts],
  )

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

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
    const unread = alerts.filter((a) => !a.isRead).map((a) => a.id)
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
    const toDelete = alerts.filter((a) => a.isRead).map((a) => a.id)
    await Promise.allSettled(toDelete.map((id) => deleteAlert(token, id)))
  }

  const handleDeleteAllAlerts = async () => {
    if (!canDeleteAllAlerts || alerts.length === 0) return
    const ok = window.confirm(
      `¿Borrar las ${alerts.length} alerta${alerts.length === 1 ? "" : "s"}? Esta acción no se puede deshacer.`,
    )
    if (!ok) return
    const token = await getAccessToken()
    if (!token) return
    const ids = alerts.map((a) => a.id)
    setAlerts([])
    await Promise.allSettled(ids.map((id) => deleteAlert(token, id)))
    await reloadAlerts()
  }

  const handleResolve = async (id: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, isRead: true, actionRequired: false } : a)),
    )
    const token = await getAccessToken()
    if (!token) return
    await updateAlert(token, id, { status: "closed", closedAt: new Date().toISOString() })
  }

  const assignTargetsPackager = assignAlert
    ? isPackagerOrphanProductionAlert(assignAlert)
    : false

  const operatorCandidates = useMemo(
    () => employees.filter((e) => e.employeeCode && isFloorOperatorCandidate(e)),
    [employees],
  )

  const packagerCandidates = useMemo(
    () => employees.filter((e) => e.employeeCode && isFloorPackerCandidate(e)),
    [employees],
  )

  const orphanUnitsForAlert = (alert: Alert | null): number => {
    if (!alert) return 0
    if (isOperatorOrphanProductionAlert(alert)) {
      const fromEvents = sumOrphanPendingForAlert(productionEvents, alert.id)
      if (fromEvents > 0) return fromEvents
    }
    if (isPackagerOrphanProductionAlert(alert)) {
      const api = apiAlertsById.get(alert.id)
      const fromMessage = parsePendingUnitsFromAlertMessage(api?.message ?? alert.message)
      if (fromMessage > 0) return fromMessage
    }
    const api = apiAlertsById.get(alert.id)
    const msg = api?.message ?? alert.message ?? ""
    const m = msg.match(/(\d+)\s*piezas/i)
    return m ? Number(m[1]) : 0
  }

  const openAssign = (alert: Alert) => {
    setAssignOperator("")
    setAssignPackager("")
    setAssignSku("")
    setAssignAlert(alert)
  }

  const openNoteDialog = (alertId: string) => {
    const apiAlert = apiAlertsById.get(alertId)
    if (!apiAlert) return
    const ctx = buildDowntimeNoteContextFromAlert(apiAlert)
    if (!ctx) return
    setNoteDraft(notesBySourceKey.get(ctx.sourceKey) ?? "")
    setNoteAlertId(alertId)
  }

  const handleSaveNote = async () => {
    if (!noteAlertId) return
    const apiAlert = apiAlertsById.get(noteAlertId)
    if (!apiAlert) return
    const ctx = buildDowntimeNoteContextFromAlert(apiAlert)
    if (!ctx) return
    const token = await getAccessToken()
    if (!token) return
    setSavingNote(true)
    try {
      await upsertDowntimeNote(token, {
        sourceKey: ctx.sourceKey,
        machineId: ctx.machineId,
        occurredAt: ctx.occurredAt,
        alertStage: ctx.alertStage,
        notes: noteDraft.trim() || null,
      })
      toast.success("Nota guardada")
      setNoteAlertId(null)
      await loadDowntimeNotes()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar la nota")
    } finally {
      setSavingNote(false)
    }
  }

  const submitAssign = async () => {
    if (!assignAlert?.machineId) return
    if (assignTargetsPackager) {
      if (!assignPackager) return
    } else if (!assignOperator) {
      return
    }
    setAssigning(true)
    try {
      const token = await getAccessToken()
      if (!token) {
        toast.error("Sesión no válida o expirada.")
        return
      }
      const personCode = assignTargetsPackager ? assignPackager : assignOperator
      const res = await attributeOrphanProduction(token, assignAlert.machineId, {
        alertId: assignAlert.id,
        operatorCode: assignTargetsPackager ? null : assignOperator,
        packager1Code: assignTargetsPackager ? assignPackager : null,
        sku: assignSku || null,
      })
      const roleLabel = assignTargetsPackager ? "empacador" : "operador"
      if (res.assigned) {
        toast.success(
          `Se atribuyeron ${res.attributed} piezas a ${personCode} y quedó asignado a la máquina.`,
        )
      } else {
        toast.warning(
          res.assignError
            ? `Se atribuyeron ${res.attributed} piezas, pero no se pudo asignar el ${roleLabel}: ${res.assignError}`
            : `Se atribuyeron ${res.attributed} piezas a ${personCode}.`,
        )
      }
      setMachineRows((prev) => prev.map((m) => (m.id === res.machine.id ? res.machine : m)))
      setAssignAlert(null)
      await reloadAlerts()
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo atribuir la producción."
      toast.error(msg)
    } finally {
      setAssigning(false)
    }
  }

  return (
    <DashboardLayout breadcrumbs={[{ label: "Inicio", href: "/" }, { label: "Alertas" }]}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Centro de Alertas</h1>
              <p className="text-sm text-muted-foreground">
                Funcionamiento de planta: paros, conectividad y producción sin asignar
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void reloadAlerts({ showSpinner: true })}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Actualizar
            </Button>
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
            {canDeleteAllAlerts && (
              <Button
                variant="outline"
                className="border-red-300 text-red-700 hover:bg-red-50"
                onClick={() => void handleDeleteAllAlerts()}
                disabled={alerts.length === 0}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Borrar todas
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Card className="border-red-200 bg-red-50">
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-red-700">Paros / inactividad</p>
                <p className="text-2xl font-bold text-red-700">{paroCount}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
                <Monitor className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-amber-700">Producción huérfana</p>
                <p className="text-2xl font-bold text-amber-700">{orphanProductionCount}</p>
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

        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Análisis de alertas</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {alertsByKindDaily.total > 0
                    ? `${alertsByKindDaily.total} alertas en el rango`
                    : "Sin alertas en el rango seleccionado"}
                </p>
              </div>
              <Select
                value={String(chartRangeDays)}
                onValueChange={(v) => setChartRangeDays(Number(v))}
              >
                <SelectTrigger className="h-8 w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Últimos 7 días</SelectItem>
                  <SelectItem value="14">Últimos 14 días</SelectItem>
                  <SelectItem value="30">Últimos 30 días</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-border bg-background p-3">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <ListOrdered className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-medium uppercase tracking-wide">
                    En el rango
                  </span>
                </div>
                <p className="mt-1 text-xl font-semibold text-foreground">
                  {rangeSummary.total}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background p-3">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Timer className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-medium uppercase tracking-wide">
                    Mediana a resolución
                  </span>
                </div>
                <p className="mt-1 text-xl font-semibold text-foreground">
                  {rangeSummary.medianResolutionMinutes != null
                    ? formatMinutesShort(rangeSummary.medianResolutionMinutes)
                    : "—"}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {rangeSummary.closedCount} cerradas en el rango
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background p-3">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Gauge className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-medium uppercase tracking-wide">
                    Backlog activo
                  </span>
                </div>
                <p className="mt-1 text-xl font-semibold text-foreground">
                  {rangeSummary.activeBacklogCount}
                </p>
                <p className="text-[10px] text-muted-foreground">ahora mismo, no solo el rango</p>
              </div>
              <div className="rounded-lg border border-border bg-background p-3">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-medium uppercase tracking-wide">
                    Más vieja del backlog
                  </span>
                </div>
                <p className="mt-1 text-xl font-semibold text-foreground">
                  {rangeSummary.oldestBacklogAgeMinutes != null
                    ? formatMinutesShort(rangeSummary.oldestBacklogAgeMinutes)
                    : "—"}
                </p>
              </div>
            </div>

            <Tabs value={analysisView} onValueChange={setAnalysisView}>
              <TabsList>
                <TabsTrigger value="daily">Por día</TabsTrigger>
                <TabsTrigger value="machines">Por máquina</TabsTrigger>
                <TabsTrigger value="hours">Por hora</TabsTrigger>
                <TabsTrigger value="idle-minutes">Minutos de paro</TabsTrigger>
              </TabsList>

              <TabsContent value="daily" className="mt-3">
                {alertsByKindDaily.series.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Sin alertas en el rango seleccionado.
                  </p>
                ) : (
                  <ChartContainer
                    className="h-[280px] w-full aspect-auto"
                    config={alertsByKindChartConfig}
                  >
                    <BarChart data={alertsByKindDaily.series} margin={{ left: 8, right: 8 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <ChartLegend content={<ChartLegendContent />} />
                      {alertsByKindDaily.kindsInRange.map((kind, idx) => (
                        <Bar
                          key={kind}
                          dataKey={kind}
                          stackId="alerts"
                          fill={`var(--color-${kind})`}
                          radius={
                            idx === alertsByKindDaily.kindsInRange.length - 1
                              ? [4, 4, 0, 0]
                              : [0, 0, 0, 0]
                          }
                        />
                      ))}
                    </BarChart>
                  </ChartContainer>
                )}
              </TabsContent>

              <TabsContent value="machines" className="mt-3">
                {machinePareto.rows.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Sin alertas con máquina asociada en el rango seleccionado.
                  </p>
                ) : (
                  <ChartContainer
                    className="h-[280px] w-full aspect-auto"
                    config={machineParetoConfig}
                  >
                    <BarChart
                      data={machinePareto.rows}
                      layout="vertical"
                      margin={{ left: 8, right: 8 }}
                    >
                      <CartesianGrid horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                      <YAxis
                        type="category"
                        dataKey="machineCode"
                        tick={{ fontSize: 12 }}
                        width={64}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <ChartLegend content={<ChartLegendContent />} />
                      {machinePareto.kindsInRange.map((kind, idx) => (
                        <Bar
                          key={kind}
                          dataKey={kind}
                          stackId="alerts"
                          fill={`var(--color-${kind})`}
                          radius={
                            idx === machinePareto.kindsInRange.length - 1
                              ? [0, 4, 4, 0]
                              : [0, 0, 0, 0]
                          }
                        />
                      ))}
                    </BarChart>
                  </ChartContainer>
                )}
              </TabsContent>

              <TabsContent value="hours" className="mt-3">
                {hourHeatmap.kindsInRange.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Sin alertas en el rango seleccionado.
                  </p>
                ) : (
                  <AlertHourHeatmap heatmap={hourHeatmap} />
                )}
              </TabsContent>

              <TabsContent value="idle-minutes" className="mt-3">
                {idleMinutesDaily.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Sin paros (idle) cerrados en el rango seleccionado.
                  </p>
                ) : (
                  <ChartContainer
                    className="h-[240px] w-full aspect-auto"
                    config={{
                      minutes: { label: "Minutos de paro", color: ALERT_KIND_CHART_COLORS.idle },
                    }}
                  >
                    <AreaChart data={idleMinutesDaily} margin={{ left: 8, right: 8 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Area
                        type="monotone"
                        dataKey="minutes"
                        stroke="var(--color-minutes)"
                        fill="var(--color-minutes)"
                        fillOpacity={0.15}
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ChartContainer>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="gap-4 space-y-0 pb-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList>
                  <TabsTrigger value="all">Todas ({alerts.length})</TabsTrigger>
                  <TabsTrigger value="unread">Sin leer ({unreadCount})</TabsTrigger>
                  <TabsTrigger value="action">
                    Acción requerida ({actionRequiredCount})
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>
                  Mostrando{" "}
                  <span className="font-medium text-foreground">{sortedAlerts.length}</span> de{" "}
                  {alerts.length}
                  {filterDay ? ` · ${filterDay}` : ""}
                </span>
                {hasActiveContextFilters && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    onClick={clearContextFilters}
                  >
                    <X className="mr-1 h-3.5 w-3.5" />
                    Limpiar
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                <Label className="text-xs text-muted-foreground">Buscar</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Título, mensaje, máquina…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-9 pl-9"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="filter-day" className="text-xs text-muted-foreground">
                  Día
                </Label>
                <div className="flex h-9 gap-2">
                  <Input
                    id="filter-day"
                    type="date"
                    value={filterDay}
                    onChange={(e) => setFilterDay(e.target.value)}
                    className="h-9 min-w-0"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    title="Hoy"
                    onClick={() => setFilterDay(todayPlantDayKey())}
                  >
                    <CalendarDays className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Turno</Label>
                <Select
                  value={filterShift}
                  onValueChange={(v) => {
                    if (v === "all" || v === "matutino" || v === "vespertino") {
                      setFilterShift(v)
                    }
                  }}
                >
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue placeholder="Turno" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="matutino">Matutino</SelectItem>
                    <SelectItem value="vespertino">Vespertino</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Máquina</Label>
                <Select value={filterMachine} onValueChange={setFilterMachine}>
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue placeholder="Máquina" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="__none__">Sin máquina</SelectItem>
                    {machineFilterOptions.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Causa</Label>
                <Select value={filterKind} onValueChange={setFilterKind}>
                  <SelectTrigger className="h-9 w-full">
                    <Filter className="mr-2 h-3.5 w-3.5 shrink-0 opacity-60" />
                    <SelectValue placeholder="Causa" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {ALERT_KIND_FILTER_ORDER.map((kind) => (
                      <SelectItem key={kind} value={kind}>
                        {ALERT_KIND_LABELS[kind]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
              <span className="font-medium">Gravedad:</span>
              {(Object.keys(ALERT_SEVERITY_STYLES) as Array<keyof typeof ALERT_SEVERITY_STYLES>).map(
                (sev) => {
                  const style = ALERT_SEVERITY_STYLES[sev]
                  return (
                    <span
                      key={sev}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium",
                        style.chipBg,
                        style.chipText,
                      )}
                    >
                      <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} />
                      {style.label}
                    </span>
                  )
                },
              )}
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-0 sm:px-0">
            {alertsLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Cargando alertas…
              </div>
            ) : sortedAlerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-12 text-muted-foreground">
                <Bell className="mb-3 h-12 w-12 opacity-50" />
                <p className="text-sm">No hay alertas que coincidan con los filtros</p>
                {hasActiveContextFilters && (
                  <Button
                    type="button"
                    variant="link"
                    className="mt-2"
                    onClick={clearContextFilters}
                  >
                    Quitar filtros
                  </Button>
                )}
              </div>
            ) : (
              <div className="max-h-[min(70vh,720px)] overflow-auto border-t border-border">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
                    <TableRow>
                      <TableHead className="w-10 px-3" />
                      <TableHead className="w-[90px]">Hora</TableHead>
                      <TableHead className="w-[88px]">Turno</TableHead>
                      <TableHead className="w-[100px]">Máquina</TableHead>
                      <TableHead className="w-[150px]">Causa</TableHead>
                      <TableHead>Detalle</TableHead>
                      <TableHead className="w-[1%] whitespace-nowrap text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedAlerts.map((alert) => {
                      const KindIcon = ALERT_KIND_ICONS[alert.kind]
                      const sevStyle = ALERT_SEVERITY_STYLES[alert.severity]
                      const apiAlert = apiAlertsById.get(alert.id)
                      const noteCtx = apiAlert
                        ? buildDowntimeNoteContextFromAlert(apiAlert)
                        : null
                      const alertNote = noteCtx
                        ? notesBySourceKey.get(noteCtx.sourceKey)
                        : undefined
                      const canAddNote = apiAlert
                        ? isDowntimeParoAlert(apiAlert.title)
                        : false
                      const isOrphan = isAttributableOrphanAlert(alert)
                      const orphanUnits = orphanUnitsForAlert(alert)
                      const shift =
                        productionShiftFromMeasuredAt(alert.timestamp.toISOString()) ??
                        null
                      const expanded = expandedIds.has(alert.id)
                      const machineCode = alert.machineId
                        ? (machineCodeById.get(alert.machineId) ?? "—")
                        : "—"

                      return (
                        <TableRow
                          key={alert.id}
                          className={cn(
                            "align-top",
                            !alert.isRead && sevStyle.rowTint,
                          )}
                        >
                          <TableCell
                            className={cn("border-l-4 py-2 pl-2 pr-3", sevStyle.border)}
                          >
                            <div
                              className="flex h-8 w-8 items-center justify-center rounded-full bg-muted"
                              title={ALERT_KIND_LABELS[alert.kind]}
                            >
                              <KindIcon className="h-4 w-4 text-foreground/70" />
                            </div>
                          </TableCell>
                          <TableCell className="py-2 tabular-nums text-xs">
                            <div className="font-medium text-foreground">
                              {formatTimeOnly(alert.timestamp)}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {formatTimeAgo(alert.timestamp)}
                            </div>
                          </TableCell>
                          <TableCell className="py-2">
                            {shift ? (
                              <span
                                className={cn(
                                  "inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium",
                                  shift === "matutino"
                                    ? "bg-sky-100 text-sky-800"
                                    : "bg-violet-100 text-violet-800",
                                )}
                              >
                                {SHIFT_LABELS[shift]}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="py-2">
                            <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium tabular-nums">
                              {machineCode}
                            </span>
                          </TableCell>
                          <TableCell className="py-2">
                            <span className="text-xs font-medium text-foreground">
                              {ALERT_KIND_LABELS[alert.kind]}
                            </span>
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
                                  sevStyle.chipBg,
                                  sevStyle.chipText,
                                )}
                              >
                                <span className={cn("h-1.5 w-1.5 rounded-full", sevStyle.dot)} />
                                {sevStyle.label}
                              </span>
                              {alert.actionRequired && !alert.isRead && (
                                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                                  Acción
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="py-2">
                            <button
                              type="button"
                              className="w-full text-left"
                              onClick={() => toggleExpanded(alert.id)}
                            >
                              <div className="flex items-start gap-2">
                                {!alert.isRead && (
                                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                                )}
                                <div className="min-w-0 flex-1">
                                  <p
                                    className={cn(
                                      "text-sm",
                                      !alert.isRead
                                        ? "font-semibold text-foreground"
                                        : "font-medium text-muted-foreground",
                                      !expanded && "line-clamp-1",
                                    )}
                                  >
                                    {alert.title}
                                  </p>
                                  {alert.message ? (
                                    <p
                                      className={cn(
                                        "mt-0.5 text-xs text-muted-foreground",
                                        !expanded && "line-clamp-1",
                                      )}
                                    >
                                      {alert.message}
                                    </p>
                                  ) : null}
                                  {expanded && (
                                    <div className="mt-1.5 flex items-start gap-1.5 rounded bg-muted/60 px-2 py-1.5">
                                      <Info className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                                      <p className="text-xs text-muted-foreground">
                                        {ALERT_KIND_EXPLAINERS[alert.kind]}
                                      </p>
                                    </div>
                                  )}
                                  {expanded && alertNote ? (
                                    <p className="mt-1.5 rounded border border-border bg-muted/50 px-2 py-1 text-xs">
                                      <span className="font-medium text-foreground">Nota:</span>{" "}
                                      {alertNote}
                                    </p>
                                  ) : null}
                                  {expanded ? (
                                    <p className="mt-1 text-[10px] text-muted-foreground">
                                      {formatDateTime(alert.timestamp)}
                                    </p>
                                  ) : null}
                                  <p className="mt-1 flex items-center gap-0.5 text-[10px] font-medium text-primary">
                                    {expanded ? (
                                      <>
                                        <ChevronUp className="h-3 w-3" />
                                        Menos info
                                      </>
                                    ) : (
                                      <>
                                        <ChevronDown className="h-3 w-3" />
                                        Más info
                                      </>
                                    )}
                                  </p>
                                </div>
                              </div>
                            </button>
                          </TableCell>
                          <TableCell className="py-2 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {isOrphan && orphanUnits > 0 && (
                                <Button
                                  size="sm"
                                  className="h-8 gap-1.5 whitespace-nowrap"
                                  onClick={() => openAssign(alert)}
                                >
                                  <Users className="h-3.5 w-3.5" />
                                  Asignar
                                  <span className="tabular-nums opacity-90">
                                    ({orphanUnits})
                                  </span>
                                </Button>
                              )}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8"
                                    aria-label="Más acciones"
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                  {canAddNote && (
                                    <DropdownMenuItem onClick={() => openNoteDialog(alert.id)}>
                                      <StickyNote className="mr-2 h-4 w-4" />
                                      {alertNote ? "Editar nota" : "Añadir nota"}
                                    </DropdownMenuItem>
                                  )}
                                  {alert.actionRequired && !alert.isRead && (
                                    <DropdownMenuItem
                                      onClick={() => void handleResolve(alert.id)}
                                    >
                                      <Check className="mr-2 h-4 w-4" />
                                      Resolver
                                    </DropdownMenuItem>
                                  )}
                                  {!alert.isRead && (
                                    <DropdownMenuItem
                                      onClick={() => void handleMarkAsRead(alert.id)}
                                    >
                                      Marcar leída
                                    </DropdownMenuItem>
                                  )}
                                  {canDismissAlerts && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        className="text-red-700 focus:text-red-700"
                                        onClick={() => void handleDismiss(alert.id)}
                                      >
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Eliminar
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
          </span>
          Actualización automática cada {ALERTS_POLL_MS / 1000} s
        </div>
      </div>

      <Dialog open={assignAlert !== null} onOpenChange={(o) => !o && setAssignAlert(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Asignar producción huérfana</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Hay{" "}
              <span className="font-medium text-foreground">
                {orphanUnitsForAlert(assignAlert)} piezas
              </span>{" "}
              producidas sin{" "}
              {assignTargetsPackager ? "empacador asignado" : "estar en verde"}. Elige el{" "}
              {assignTargetsPackager ? "empacador" : "operador"} y SKU a quien se le acreditarán.
            </p>
            <div className="space-y-1.5">
              <Label>{assignTargetsPackager ? "Empacador" : "Operador"}</Label>
              <Select
                value={assignTargetsPackager ? assignPackager : assignOperator}
                onValueChange={assignTargetsPackager ? setAssignPackager : setAssignOperator}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      assignTargetsPackager ? "Selecciona empacador" : "Selecciona operador"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {(assignTargetsPackager ? packagerCandidates : operatorCandidates).map((e) => (
                    <SelectItem key={e.id} value={e.employeeCode as string}>
                      {e.fullName}
                      {e.nfcCardUid ? ` (NFC: ${e.nfcCardUid})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!assignTargetsPackager && (
              <div className="space-y-1.5">
                <Label>SKU (opcional — si no, el actual de la máquina)</Label>
                <Select value={assignSku} onValueChange={setAssignSku}>
                  <SelectTrigger>
                    <SelectValue placeholder="SKU" />
                  </SelectTrigger>
                  <SelectContent>
                    {skus.map((s) => (
                      <SelectItem key={s.id} value={s.code}>
                        {s.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAssignAlert(null)} disabled={assigning}>
                Cancelar
              </Button>
              <Button
                onClick={submitAssign}
                disabled={
                  assigning || (assignTargetsPackager ? !assignPackager : !assignOperator)
                }
              >
                {assigning && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Atribuir
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={noteAlertId !== null}
        onOpenChange={(open) => {
          if (!open) setNoteAlertId(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nota de supervisión</DialogTitle>
            <DialogDescription>
              {noteAlertId && apiAlertsById.get(noteAlertId)
                ? apiAlertsById.get(noteAlertId)!.title
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="alert-downtime-note">Notas</Label>
            <Textarea
              id="alert-downtime-note"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Ej. Cambio de rollo, falta de material, ajuste de máquina…"
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteAlertId(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveNote} disabled={savingNote} className="gap-1.5">
              {savingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar nota
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
