"use client"

import React, { useEffect, useMemo, useState } from "react"
import Link from "next/link"
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
import {
  createGoal,
  deleteGoal,
  getGoals,
  getMetricPoints,
  getMetrics,
  updateGoal,
  type ApiGoal,
  type ApiGoalPeriod,
  type ApiMetric,
} from "@/lib/api"

// ─── helpers ──────────────────────────────────────────────────────────────────

const periodLabels: Record<ApiGoalPeriod, string> = {
  daily: "Diaria",
  weekly: "Semanal",
  monthly: "Mensual",
  quarterly: "Trimestral",
  yearly: "Anual",
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

// ─── GoalCard ─────────────────────────────────────────────────────────────────

function GoalCard({
  goal,
  metric,
  actual,
  onEdit,
  onDelete,
}: {
  goal: ApiGoal
  metric: ApiMetric | undefined
  actual: number
  onEdit: (goal: ApiGoal) => void
  onDelete: (goal: ApiGoal) => void
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
            <div className="mb-1 flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {periodLabels[goal.period]}
              </Badge>
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
            </p>
          </div>
          <div className="flex gap-1">
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
  const { getAccessToken } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [goals, setGoals] = useState<ApiGoal[]>([])
  const [metrics, setMetrics] = useState<ApiMetric[]>([])
  const [actualByGoalId, setActualByGoalId] = useState<Record<string, number>>({})
  const [filterPeriod, setFilterPeriod] = useState<ApiGoalPeriod | "all">("all")

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingGoal, setEditingGoal] = useState<ApiGoal | null>(null)
  const [formData, setFormData] = useState({
    metricId: "",
    period: "daily" as ApiGoalPeriod,
    targetValue: "",
    startDate: "",
    endDate: "",
  })

  const metricById = useMemo(
    () => new Map(metrics.map((m) => [m.id, m] as const)),
    [metrics],
  )

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

  const filtered = useMemo(
    () =>
      filterPeriod === "all"
        ? enriched
        : enriched.filter((e) => e.goal.period === filterPeriod),
    [enriched, filterPeriod],
  )

  const stats = useMemo(
    () => ({
      total: enriched.length,
      onTrack: enriched.filter((e) => e.status === "on-track").length,
      exceeded: enriched.filter(
        (e) => e.status === "exceeded" || e.status === "completed",
      ).length,
      atRisk: enriched.filter(
        (e) => e.status === "at-risk" || e.status === "behind",
      ).length,
    }),
    [enriched],
  )

  const overallProgress = useMemo(() => {
    if (enriched.length === 0) return 0
    const sum = enriched.reduce(
      (acc, e) => acc + (e.target > 0 ? Math.min(100, (e.actual / e.target) * 100) : 0),
      0,
    )
    return sum / enriched.length
  }, [enriched])

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

      const [goalsData, metricsData] = await Promise.all([getGoals(token), getMetrics(token)])
      setGoals(goalsData)
      setMetrics(metricsData)

      if (goalsData.length === 0) {
        setActualByGoalId({})
        return
      }

      const metricIds = Array.from(new Set(goalsData.map((g) => g.metricId)))

      const minStart = goalsData.reduce(
        (min, g) => (g.startDate < min ? g.startDate : min),
        goalsData[0].startDate,
      )
      const maxEnd = goalsData.reduce(
        (max, g) => (g.endDate > max ? g.endDate : max),
        goalsData[0].endDate,
      )
      const range = toDateTimeRange(minStart, maxEnd)

      const pointsByMetric = await Promise.all(
        metricIds.map((metricId) =>
          getMetricPoints(token, {
            metricId,
            from: range.from,
            to: range.to,
            limit: 5000,
          }),
        ),
      )

      const points = pointsByMetric.flat()
      const actual: Record<string, number> = {}
      for (const g of goalsData) {
        const { from, to } = toDateTimeRange(g.startDate, g.endDate)
        const sum = points
          .filter((p) => p.metricId === g.metricId)
          .filter((p) => (g.plantId ? p.plantId === g.plantId : true))
          .filter((p) => (g.lineId ? p.lineId === g.lineId : true))
          .filter((p) => (g.machineId ? p.machineId === g.machineId : true))
          .filter((p) => p.measuredAt >= from && p.measuredAt <= to)
          .reduce((acc, p) => acc + Number(p.value ?? 0), 0)
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
  }, [getAccessToken])

  const openCreate = () => {
    setEditingGoal(null)
    setFormData({
      metricId: metrics[0]?.id ?? "",
      period: "daily",
      targetValue: "",
      startDate: "",
      endDate: "",
    })
    setIsDialogOpen(true)
  }

  const openEdit = (g: ApiGoal) => {
    setEditingGoal(g)
    setFormData({
      metricId: g.metricId,
      period: g.period,
      targetValue: String(g.targetValue),
      startDate: g.startDate,
      endDate: g.endDate,
    })
    setIsDialogOpen(true)
  }

  const onSave = async () => {
    const token = await getAccessToken()
    if (!token) return

    const payload = {
      metricId: formData.metricId,
      period: formData.period,
      targetValue: Number(formData.targetValue),
      startDate: formData.startDate,
      endDate: formData.endDate,
    }

    if (!payload.metricId) {
      setError("Selecciona una métrica.")
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
            <h1 className="text-2xl font-bold text-foreground">Sistema de Metas</h1>
            <p className="text-muted-foreground">Define y monitorea objetivos de producción</p>
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

            {/* Tabs + Grid */}
            <Tabs defaultValue="all" className="space-y-4">
              <TabsList>
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
                          No hay metas en este periodo
                        </h3>
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
                          onEdit={openEdit}
                          onDelete={onDelete}
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