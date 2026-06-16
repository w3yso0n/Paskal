"use client"

import React, { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Home,
  Target,
  Plus,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Award,
  Edit2,
  Trash2,
} from "lucide-react"

import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/contexts/auth-context"
import { BonusVacationAdjustmentsPanel } from "@/components/metas/bonus-vacation-adjustments"
import {
  createGoal,
  deleteGoal,
  getBonusProductionConfigForMonth,
  getGoals,
  getMachines,
  getMetricPoints,
  getMetrics,
  getProductionEvents,
  updateGoal,
  type ApiGoal,
  type ApiGoalPeriod,
  type ApiGoalShift,
  type ApiMachine,
  type ApiMetric,
} from "@/lib/api"
import {
  bonusConfigToGoalDefinitions,
  goalMatchesBonusDefinition,
  monthDateBounds,
} from "@/lib/bonus-goals-bridge"
import type { BonusProductionConfigData } from "@/lib/bonus-production-config"
import { DEFAULT_BONUS_PRODUCTION_CONFIG } from "@/lib/bonus-production-config"
import {
  normalizeSku,
  productionUnitsFromEvent,
  resolveProductionEventSku,
} from "@/lib/production-goal-events"

// ─── helpers ──────────────────────────────────────────────────────────────────

const periodLabels: Record<ApiGoalPeriod, string> = {
  daily: "Diaria",
  weekly: "Semanal",
  monthly: "Mensual",
  quarterly: "Trimestral",
  yearly: "Anual",
}

/** Misma ventana que en `app/metricas`: 06:00–13:59 matutino, 14:00–21:59 vespertino (hora local del navegador). */
function productionShiftFromMeasuredAt(iso: string): ApiGoalShift | null {
  const hour = new Date(iso).getHours()
  if (hour >= 6 && hour < 14) return "matutino"
  if (hour >= 14 && hour < 22) return "vespertino"
  return null
}

const shiftLabels: Record<ApiGoalShift, string> = {
  matutino: "Matutino (06:00–13:59)",
  vespertino: "Vespertino (14:00–21:59)",
}

function toDateTimeRange(dateOnlyStart: string, dateOnlyEnd: string) {
  return {
    from: `${dateOnlyStart}T00:00:00.000Z`,
    to: `${dateOnlyEnd}T23:59:59.999Z`,
  }
}

type GoalStatus = "on-track" | "at-risk" | "behind" | "completed" | "exceeded"

function calcStatus(actual: number, target: number): GoalStatus {
  if (target <= 0) return "behind"
  const pct = (actual / target) * 100
  if (pct >= 110) return "exceeded"
  if (pct >= 100) return "completed"
  if (pct >= 90) return "on-track"
  if (pct >= 70) return "at-risk"
  return "behind"
}

const statusConfig: Record<
  GoalStatus,
  { label: string; color: string; bgColor: string; barColor: string; icon: React.ElementType }
> = {
  "on-track": {
    label: "En Progreso",
    color: "text-blue-700",
    bgColor: "bg-blue-100",
    barColor: "bg-blue-500",
    icon: TrendingUp,
  },
  "at-risk": {
    label: "En Riesgo",
    color: "text-amber-700",
    bgColor: "bg-amber-100",
    barColor: "bg-amber-500",
    icon: AlertTriangle,
  },
  behind: {
    label: "Atrasado",
    color: "text-red-700",
    bgColor: "bg-red-100",
    barColor: "bg-red-500",
    icon: TrendingDown,
  },
  completed: {
    label: "Completado",
    color: "text-green-700",
    bgColor: "bg-green-100",
    barColor: "bg-green-500",
    icon: CheckCircle2,
  },
  exceeded: {
    label: "Superado",
    color: "text-emerald-700",
    bgColor: "bg-emerald-100",
    barColor: "bg-emerald-500",
    icon: Award,
  },
}

function isProductionMetric(metric: ApiMetric | undefined): boolean {
  return metric?.name.trim().toLowerCase() === "producción"
}

function buildMachineMaps(machines: ApiMachine[]) {
  const labelById = new Map<string, string>()
  const skuById = new Map<string, string>()
  const upbById = new Map<string, number>()
  for (const m of machines) {
    labelById.set(m.id, (m.code ?? m.name).trim() || m.name)
    const sku = m.currentSku?.trim()
    if (sku) skuById.set(m.id, sku)
    const upb = m.unitsPerBox
    if (upb != null && Number.isFinite(upb) && upb > 0) upbById.set(m.id, upb)
  }
  return { labelById, skuById, upbById }
}

// ─── GoalCard ─────────────────────────────────────────────────────────────────

function GoalCard({
  goal,
  metric,
  actual,
  onEdit,
  onDelete,
  fromBonusConfig,
  machineLabel,
}: {
  goal: ApiGoal
  metric: ApiMetric | undefined
  actual: number
  onEdit: (goal: ApiGoal) => void
  onDelete: (goal: ApiGoal) => void
  fromBonusConfig?: boolean
  machineLabel?: string | null
}) {
  const target = Number(goal.targetValue)
  const pct = target > 0 ? Math.min(100, (actual / target) * 100) : 0
  const status = calcStatus(actual, target)
  const cfg = statusConfig[status]
  const StatusIcon = cfg.icon
  const remaining = target - actual

  return (
    <Card className="relative overflow-hidden">
      <div className={`absolute left-0 top-0 h-full w-1 ${cfg.barColor}`} />
      <CardContent className="pt-6">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {periodLabels[goal.period]}
              </Badge>
              {fromBonusConfig ? (
                <Badge className="bg-primary/10 text-primary text-xs">Config. bono</Badge>
              ) : null}
              {goal.sku?.trim() ? (
                <Badge variant="secondary" className="text-xs">
                  SKU: {goal.sku.trim()}
                </Badge>
              ) : null}
              {goal.shift ? (
                <Badge variant="secondary" className="text-xs">
                  {shiftLabels[goal.shift]}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs">
                  Sin turno (todo el rango)
                </Badge>
              )}
              <Badge className={`${cfg.bgColor} ${cfg.color} gap-1`}>
                <StatusIcon className="h-3 w-3" />
                {cfg.label}
              </Badge>
            </div>
            <h3 className="text-lg font-semibold text-foreground">
              {metric?.name ?? "Métrica no encontrada"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {goal.startDate} — {goal.endDate}
              {machineLabel ? ` · ${machineLabel}` : ""}
            </p>
          </div>
          <div className="flex gap-1">
            {!fromBonusConfig ? (
              <>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onEdit(goal)}
              title="Editar meta"
            >
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive"
              onClick={() => onDelete(goal)}
              title="Eliminar meta"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-primary"
                onClick={onEdit as () => void}
                title="Editar en reglas de negocio"
              >
                Editar en config.
              </Button>
            )}
          </div>
        </div>

        <div className="mb-4 space-y-2">
          <div className="flex items-end justify-between">
            <div>
              <span className="text-3xl font-bold text-foreground">
                {actual.toLocaleString()}
              </span>
              <span className="ml-1 text-muted-foreground">
                / {target.toLocaleString()}
                {metric?.unit ? ` ${metric.unit}` : ""}
              </span>
            </div>
            <span className="text-2xl font-bold text-primary">{pct.toFixed(0)}%</span>
          </div>
          <Progress value={pct} className="h-3" />
        </div>

        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>
              {goal.startDate} – {goal.endDate}
            </span>
          </div>
          {remaining > 0 && status !== "exceeded" && status !== "completed" ? (
            <span className="text-muted-foreground">
              Faltan: {remaining.toLocaleString()}
              {metric?.unit ? ` ${metric.unit}` : ""}
            </span>
          ) : (
            <span className="font-medium text-green-600">Meta alcanzada</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const ALL_PERIODS: ApiGoalPeriod[] = ["daily", "weekly", "monthly", "quarterly", "yearly"]

export default function MetasPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { getAccessToken } = useAuth()

  useEffect(() => {
    if (searchParams.get("tab") === "configuracion") {
      router.replace("/reglas-negocio?tab=bono")
    }
  }, [searchParams, router])

  const openBonusConfig = () => {
    router.push("/reglas-negocio?tab=bono")
  }

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [goals, setGoals] = useState<ApiGoal[]>([])
  const [metrics, setMetrics] = useState<ApiMetric[]>([])
  const [machines, setMachines] = useState<ApiMachine[]>([])
  const [actualByGoalId, setActualByGoalId] = useState<Record<string, number>>({})
  const [filterPeriod, setFilterPeriod] = useState<ApiGoalPeriod | "all">("all")
  const [filterShift, setFilterShift] = useState<ApiGoalShift | "all">("all")
  const [bonusConfigMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  })
  const [bonusConfig, setBonusConfig] = useState<BonusProductionConfigData>(
    DEFAULT_BONUS_PRODUCTION_CONFIG,
  )

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingGoal, setEditingGoal] = useState<ApiGoal | null>(null)
  const [formData, setFormData] = useState({
    metricId: "",
    period: "daily" as ApiGoalPeriod,
    shift: "matutino" as ApiGoalShift | "none",
    targetValue: "",
    startDate: "",
    endDate: "",
    sku: "",
    machineId: "none",
  })

  const metricById = useMemo(
    () => new Map(metrics.map((m) => [m.id, m] as const)),
    [metrics],
  )

  const machineMaps = useMemo(() => buildMachineMaps(machines), [machines])

  const productionMetricId = useMemo(() => {
    const prod =
      metrics.find((m) => m.name.toLowerCase() === "producción") ?? metrics[0]
    return prod?.id ?? null
  }, [metrics])

  const bonusMonthBounds = useMemo(
    () => monthDateBounds(bonusConfigMonth),
    [bonusConfigMonth],
  )

  const bonusDefinitions = useMemo(
    () => bonusConfigToGoalDefinitions(bonusConfig),
    [bonusConfig],
  )

  const isBonusSyncedGoal = (goal: ApiGoal) => {
    if (!productionMetricId || goal.sku?.trim()) return false
    return bonusDefinitions.some((def) =>
      goalMatchesBonusDefinition(goal, def, productionMetricId, bonusMonthBounds),
    )
  }

  const skuSuggestions = useMemo(() => {
    const set = new Set<string>()
    for (const m of machines) {
      const sku = m.currentSku?.trim()
      if (sku) set.add(sku)
    }
    return [...set].sort((a, b) => a.localeCompare(b, "es"))
  }, [machines])

  const selectedFormMetric = useMemo(
    () => metrics.find((m) => m.id === formData.metricId),
    [metrics, formData.metricId],
  )
  const showProductionSkuFields = isProductionMetric(selectedFormMetric)

  // ── derived stats ──────────────────────────────────────────────────────────
  const enriched = useMemo(
    () =>
      goals.map((g) => {
        const actual = Number(actualByGoalId[g.id] ?? 0)
        const target = Number(g.targetValue)
        return { goal: g, actual, target, status: calcStatus(actual, target) }
      }),
    [goals, actualByGoalId],
  )

  const filtered = useMemo(() => {
    let list =
      filterPeriod === "all"
        ? enriched
        : enriched.filter((e) => e.goal.period === filterPeriod)
    if (filterShift !== "all") {
      list = list.filter((e) => (e.goal.shift ?? null) === filterShift)
    }
    return list
  }, [enriched, filterPeriod, filterShift])

  const stats = useMemo(
    () => ({
      total: filtered.length,
      onTrack: filtered.filter((e) => e.status === "on-track").length,
      exceeded: filtered.filter(
        (e) => e.status === "exceeded" || e.status === "completed",
      ).length,
      atRisk: filtered.filter(
        (e) => e.status === "at-risk" || e.status === "behind",
      ).length,
    }),
    [filtered],
  )

  const overallProgress = useMemo(() => {
    if (filtered.length === 0) return 0
    const sum = filtered.reduce(
      (acc, e) => acc + (e.target > 0 ? Math.min(100, (e.actual / e.target) * 100) : 0),
      0,
    )
    return sum / filtered.length
  }, [filtered])

  // ── data fetching ──────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const token = await getAccessToken()
      if (!token) {
        setGoals([])
        setMetrics([])
        setActualByGoalId({})
        return
      }

      const [goalsData, metricsData, machinesData] = await Promise.all([
        getGoals(token),
        getMetrics(token),
        getMachines(token),
      ])
      setGoals(goalsData)
      setMetrics(metricsData)
      setMachines(machinesData)

      try {
        const cfg = await getBonusProductionConfigForMonth(token, bonusConfigMonth)
        setBonusConfig(cfg.config)
      } catch {
        setBonusConfig(DEFAULT_BONUS_PRODUCTION_CONFIG)
      }

      if (goalsData.length === 0) {
        setActualByGoalId({})
        return
      }

      const metricIds = Array.from(new Set(goalsData.map((g) => g.metricId)))
      const skuGoals = goalsData.filter((g) => normalizeSku(g.sku))
      const nonSkuGoals = goalsData.filter((g) => !normalizeSku(g.sku))

      const minStart = goalsData.reduce(
        (min, g) => (g.startDate < min ? g.startDate : min),
        goalsData[0].startDate,
      )
      const maxEnd = goalsData.reduce(
        (max, g) => (g.endDate > max ? g.endDate : max),
        goalsData[0].endDate,
      )
      const range = toDateTimeRange(minStart, maxEnd)
      const { skuById, upbById } = buildMachineMaps(machinesData)

      const [pointsByMetric, productionEvents] = await Promise.all([
        nonSkuGoals.length > 0
          ? Promise.all(
              metricIds.map((metricId) =>
                getMetricPoints(token, {
                  metricId,
                  from: range.from,
                  to: range.to,
                  limit: 5000,
                }),
              ),
            )
          : Promise.resolve([] as Awaited<ReturnType<typeof getMetricPoints>>[]),
        skuGoals.length > 0
          ? getProductionEvents(token, { from: range.from, to: range.to, limit: 10000 })
          : Promise.resolve([]),
      ])

      const points = pointsByMetric.flat()
      const actual: Record<string, number> = {}

      for (const g of nonSkuGoals) {
        const { from, to } = toDateTimeRange(g.startDate, g.endDate)
        const shift = g.shift ?? null
        const sum = points
          .filter((p) => p.metricId === g.metricId)
          .filter((p) => (g.plantId ? p.plantId === g.plantId : true))
          .filter((p) => (g.lineId ? p.lineId === g.lineId : true))
          .filter((p) => (g.machineId ? p.machineId === g.machineId : true))
          .filter((p) => p.measuredAt >= from && p.measuredAt <= to)
          .filter((p) => {
            if (!shift) return true
            const s = productionShiftFromMeasuredAt(p.measuredAt)
            return s === shift
          })
          .reduce((acc, p) => acc + Number(p.value ?? 0), 0)
        actual[g.id] = sum
      }

      for (const g of skuGoals) {
        const goalSku = normalizeSku(g.sku)?.toLowerCase()
        if (!goalSku) continue
        const { from, to } = toDateTimeRange(g.startDate, g.endDate)
        const shift = g.shift ?? null
        const sum = productionEvents
          .filter((e) => (g.machineId ? e.machineId === g.machineId : true))
          .filter((e) => e.occurredAt >= from && e.occurredAt <= to)
          .filter((e) => {
            if (!shift) return true
            return productionShiftFromMeasuredAt(e.occurredAt) === shift
          })
          .filter((e) => {
            const eventSku = resolveProductionEventSku(e, skuById)
            return eventSku?.trim().toLowerCase() === goalSku
          })
          .reduce((acc, e) => acc + productionUnitsFromEvent(e, upbById), 0)
        actual[g.id] = sum
      }
      setActualByGoalId(actual)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar metas")
      setGoals([])
      setMetrics([])
      setActualByGoalId({})
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await load()
    })()
    return () => {
      cancelled = true
    }
  }, [getAccessToken, bonusConfigMonth])

  const openCreate = () => {
    setEditingGoal(null)
    setFormData({
      metricId: metrics[0]?.id ?? "",
      period: "daily",
      shift: "matutino",
      targetValue: "",
      startDate: "",
      endDate: "",
      sku: "",
      machineId: "none",
    })
    setIsDialogOpen(true)
  }

  const openEdit = (g: ApiGoal) => {
    setEditingGoal(g)
    setFormData({
      metricId: g.metricId,
      period: g.period,
      shift: g.shift ?? "none",
      targetValue: String(g.targetValue),
      startDate: g.startDate,
      endDate: g.endDate,
      sku: g.sku?.trim() ?? "",
      machineId: g.machineId ?? "none",
    })
    setIsDialogOpen(true)
  }

  const onSave = async () => {
    const token = await getAccessToken()
    if (!token) return

    const selectedMetric = metrics.find((m) => m.id === formData.metricId)
    const skuValue = normalizeSku(formData.sku)
    const payload = {
      metricId: formData.metricId,
      period: formData.period,
      shift: formData.shift === "none" ? null : formData.shift,
      targetValue: Number(formData.targetValue),
      startDate: formData.startDate,
      endDate: formData.endDate,
      machineId: formData.machineId === "none" ? null : formData.machineId,
      sku: isProductionMetric(selectedMetric) ? skuValue : null,
    }

    if (!payload.metricId) {
      setError("Selecciona una métrica.")
      return
    }
    if (isProductionMetric(selectedMetric) && formData.sku.trim() && !skuValue) {
      setError("El SKU no puede estar vacío.")
      return
    }
    if (!payload.startDate || !payload.endDate) {
      setError("Define fecha inicio y fin.")
      return
    }
    if (!Number.isFinite(payload.targetValue)) {
      setError("La meta debe ser un número.")
      return
    }

    setError(null)
    if (editingGoal) {
      await updateGoal(token, editingGoal.id, payload)
    } else {
      await createGoal(token, payload)
    }
    setIsDialogOpen(false)
    await load()
  }

  const onDelete = async (g: ApiGoal) => {
    const token = await getAccessToken()
    if (!token) return
    setError(null)
    await deleteGoal(token, g.id)
    await load()
  }

  // ── render ─────────────────────────────────────────────────────────────────
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
            <Target className="h-4 w-4" />
            Metas
          </span>
        </nav>

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Metas</h1>
            <p className="text-muted-foreground">
              Monitorea cumplimiento de objetivos de producción
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Nueva Meta
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editingGoal ? "Editar Meta" : "Crear Nueva Meta"}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label>Métrica</Label>
                  <Select
                    value={formData.metricId}
                    onValueChange={(v) => setFormData((s) => ({ ...s, metricId: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar" />
                    </SelectTrigger>
                    <SelectContent>
                      {metrics.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {showProductionSkuFields ? (
                  <>
                    <div className="space-y-2">
                      <Label>SKU (opcional)</Label>
                      <Input
                        list="metas-sku-suggestions"
                        value={formData.sku}
                        onChange={(e) => setFormData((s) => ({ ...s, sku: e.target.value }))}
                        placeholder="Ej. SKU-001"
                      />
                      <datalist id="metas-sku-suggestions">
                        {skuSuggestions.map((sku) => (
                          <option key={sku} value={sku} />
                        ))}
                      </datalist>
                      <p className="text-xs text-muted-foreground">
                        Si defines un SKU, el cumplimiento se calcula con eventos de producción PLC
                        filtrados por ese código (unidades = cajas × piezas por caja).
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Máquina (opcional)</Label>
                      <Select
                        value={formData.machineId}
                        onValueChange={(v) => setFormData((s) => ({ ...s, machineId: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Todas las máquinas" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Todas las máquinas</SelectItem>
                          {machines.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {(m.code ?? m.name).trim() || m.name}
                              {m.currentSku?.trim() ? ` · ${m.currentSku.trim()}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                ) : null}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Periodo</Label>
                    <Select
                      value={formData.period}
                      onValueChange={(v) => setFormData((s) => ({ ...s, period: v as ApiGoalPeriod }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ALL_PERIODS.map((p) => (
                          <SelectItem key={p} value={p}>
                            {periodLabels[p]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Valor Meta</Label>
                    <Input
                      type="number"
                      value={formData.targetValue}
                      onChange={(e) => setFormData((s) => ({ ...s, targetValue: e.target.value }))}
                      placeholder="3500"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Turno (cumplimiento)</Label>
                  <Select
                    value={formData.shift}
                    onValueChange={(v) =>
                      setFormData((s) => ({ ...s, shift: v as ApiGoalShift | "none" }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="matutino">{shiftLabels.matutino}</SelectItem>
                      <SelectItem value="vespertino">{shiftLabels.vespertino}</SelectItem>
                      <SelectItem value="none">Sin turno (sumar todo el rango de fechas)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Con turno, solo cuentan puntos cuya hora local cae en esa ventana (igual que en
                    Métricas).
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Fecha Inicio</Label>
                    <Input
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => setFormData((s) => ({ ...s, startDate: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Fecha Fin</Label>
                    <Input
                      type="date"
                      value={formData.endDate}
                      onChange={(e) => setFormData((s) => ({ ...s, endDate: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={onSave}>{editingGoal ? "Guardar Cambios" : "Crear Meta"}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Las metas de Tail, Turbo, Roller y Bending provienen de{" "}
            <Link href="/reglas-negocio?tab=bono" className="font-medium text-primary underline">
              Reglas de negocio → Configuración de bono
            </Link>
            {" "}(mes vigente: {bonusConfigMonth}). Al guardar allí se sincronizan aquí y en los
            reportes Excel.
          </CardContent>
        </Card>

        <BonusVacationAdjustmentsPanel
          bonusConfigMonth={bonusConfigMonth}
          bonusConfig={bonusConfig}
        />

        {/* Error / loading */}
        {error ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-destructive">{error}</p>
            </CardContent>
          </Card>
        ) : loading ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Cargando metas…</p>
            </CardContent>
          </Card>
        ) : goals.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Sin metas configuradas.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium uppercase text-muted-foreground">
                        Total Metas
                      </p>
                      <p className="mt-1 text-3xl font-bold text-foreground">{stats.total}</p>
                    </div>
                    <div className="rounded-full bg-primary/10 p-3">
                      <Target className="h-6 w-6 text-primary" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium uppercase text-muted-foreground">
                        En Progreso
                      </p>
                      <p className="mt-1 text-3xl font-bold text-blue-600">{stats.onTrack}</p>
                    </div>
                    <div className="rounded-full bg-blue-100 p-3">
                      <TrendingUp className="h-6 w-6 text-blue-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium uppercase text-muted-foreground">
                        Completadas
                      </p>
                      <p className="mt-1 text-3xl font-bold text-green-600">{stats.exceeded}</p>
                    </div>
                    <div className="rounded-full bg-green-100 p-3">
                      <Award className="h-6 w-6 text-green-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium uppercase text-muted-foreground">
                        En Riesgo
                      </p>
                      <p className="mt-1 text-3xl font-bold text-amber-600">{stats.atRisk}</p>
                    </div>
                    <div className="rounded-full bg-amber-100 p-3">
                      <AlertTriangle className="h-6 w-6 text-amber-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Overall Progress */}
            <Card>
              <CardContent className="pt-6">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-foreground">Progreso General</h3>
                    <p className="text-sm text-muted-foreground">
                      Promedio de cumplimiento de todas las metas
                    </p>
                  </div>
                  <span className="text-3xl font-bold text-primary">
                    {overallProgress.toFixed(1)}%
                  </span>
                </div>
                <Progress value={overallProgress} className="h-4" />
              </CardContent>
            </Card>

            {/* Filtro por turno + periodo */}
            <div className="space-y-3">
              <div>
                <p className="mb-2 text-sm font-medium text-foreground">Turno</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={filterShift === "all" ? "default" : "outline"}
                    onClick={() => setFilterShift("all")}
                  >
                    Todos los turnos
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={filterShift === "matutino" ? "default" : "outline"}
                    onClick={() => setFilterShift("matutino")}
                  >
                    Matutino
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={filterShift === "vespertino" ? "default" : "outline"}
                    onClick={() => setFilterShift("vespertino")}
                  >
                    Vespertino
                  </Button>
                </div>
              </div>
            </div>

            <Tabs defaultValue="all" className="space-y-4">
              <TabsList className="h-auto min-h-10 flex-wrap">
                <TabsTrigger value="all" onClick={() => setFilterPeriod("all")}>
                  Todas
                </TabsTrigger>
                {ALL_PERIODS.map((p) => (
                  <TabsTrigger key={p} value={p} onClick={() => setFilterPeriod(p)}>
                    {periodLabels[p]}
                  </TabsTrigger>
                ))}
              </TabsList>

              {(["all", ...ALL_PERIODS] as const).map((tab) => (
                <TabsContent key={tab} value={tab} className="mt-4">
                  {filtered.length === 0 ? (
                    <Card className="py-12">
                      <CardContent className="flex flex-col items-center justify-center text-center">
                        <Target className="mb-4 h-12 w-12 text-muted-foreground" />
                        <h3 className="text-lg font-semibold text-foreground">
                          No hay metas con los filtros seleccionados
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Prueba otro turno o periodo.
                        </p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                      {filtered.map(({ goal, actual }) => (
                        <GoalCard
                          key={goal.id}
                          goal={goal}
                          metric={metricById.get(goal.metricId)}
                          actual={actual}
                          machineLabel={
                            goal.machineId
                              ? (machineMaps.labelById.get(goal.machineId) ?? null)
                              : null
                          }
                          onEdit={
                            isBonusSyncedGoal(goal)
                              ? openBonusConfig
                              : openEdit
                          }
                          onDelete={onDelete}
                          fromBonusConfig={isBonusSyncedGoal(goal)}
                        />
                      ))}
                    </div>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}