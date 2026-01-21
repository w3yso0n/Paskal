"use client"

import React from "react"

import { useState } from "react"
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
  X,
} from "lucide-react"
import Link from "next/link"
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
import { Textarea } from "@/components/ui/textarea"
import {
  productionGoals as initialGoals,
  type ProductionGoal,
  type GoalPeriod,
  type GoalStatus,
} from "@/lib/mock-data"

const statusConfig: Record<GoalStatus, { label: string; color: string; bgColor: string; icon: React.ElementType }> = {
  "on-track": { label: "En Progreso", color: "text-blue-700", bgColor: "bg-blue-100", icon: TrendingUp },
  "at-risk": { label: "En Riesgo", color: "text-amber-700", bgColor: "bg-amber-100", icon: AlertTriangle },
  behind: { label: "Atrasado", color: "text-red-700", bgColor: "bg-red-100", icon: TrendingDown },
  completed: { label: "Completado", color: "text-green-700", bgColor: "bg-green-100", icon: CheckCircle2 },
  exceeded: { label: "Superado", color: "text-emerald-700", bgColor: "bg-emerald-100", icon: Award },
}

const periodLabels: Record<GoalPeriod, string> = {
  daily: "Diaria",
  weekly: "Semanal",
  monthly: "Mensual",
  annual: "Anual",
}

function GoalCard({
  goal,
  onEdit,
  onDelete,
}: {
  goal: ProductionGoal
  onEdit: (goal: ProductionGoal) => void
  onDelete: (id: string) => void
}) {
  const progress = Math.min((goal.currentValue / goal.targetValue) * 100, 100)
  const status = statusConfig[goal.status]
  const StatusIcon = status.icon
  const isPercentageGoal = goal.unit === "%"
  const remaining = goal.targetValue - goal.currentValue

  return (
    <Card className="relative overflow-hidden">
      <div
        className={`absolute left-0 top-0 h-full w-1 ${
          goal.status === "exceeded" || goal.status === "completed"
            ? "bg-green-500"
            : goal.status === "at-risk"
              ? "bg-amber-500"
              : goal.status === "behind"
                ? "bg-red-500"
                : "bg-blue-500"
        }`}
      />
      <CardContent className="pt-6">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex-1">
            <div className="mb-1 flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {periodLabels[goal.period]}
              </Badge>
              <Badge className={`${status.bgColor} ${status.color} gap-1`}>
                <StatusIcon className="h-3 w-3" />
                {status.label}
              </Badge>
            </div>
            <h3 className="text-lg font-semibold text-foreground">{goal.name}</h3>
            <p className="text-sm text-muted-foreground">{goal.description}</p>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(goal)}>
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive"
              onClick={() => onDelete(goal.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="mb-4 space-y-2">
          <div className="flex items-end justify-between">
            <div>
              <span className="text-3xl font-bold text-foreground">
                {goal.currentValue.toLocaleString()}
              </span>
              <span className="ml-1 text-muted-foreground">
                / {goal.targetValue.toLocaleString()} {goal.unit}
              </span>
            </div>
            <span className="text-2xl font-bold text-primary">{progress.toFixed(0)}%</span>
          </div>
          <Progress value={progress} className="h-3" />
        </div>

        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>
              {goal.startDate} - {goal.endDate}
            </span>
          </div>
          {remaining > 0 && goal.status !== "exceeded" && goal.status !== "completed" && (
            <span className="text-muted-foreground">
              Faltan: {remaining.toLocaleString()} {goal.unit}
            </span>
          )}
          {(goal.status === "exceeded" || goal.status === "completed") && (
            <span className="font-medium text-green-600">Meta alcanzada</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default function MetasPage() {
  const [goals, setGoals] = useState<ProductionGoal[]>(initialGoals)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingGoal, setEditingGoal] = useState<ProductionGoal | null>(null)
  const [filterPeriod, setFilterPeriod] = useState<GoalPeriod | "all">("all")

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    period: "daily" as GoalPeriod,
    targetValue: "",
    currentValue: "",
    unit: "unidades",
    startDate: "",
    endDate: "",
  })

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      period: "daily",
      targetValue: "",
      currentValue: "",
      unit: "unidades",
      startDate: "",
      endDate: "",
    })
    setEditingGoal(null)
  }

  const handleOpenDialog = (goal?: ProductionGoal) => {
    if (goal) {
      setEditingGoal(goal)
      setFormData({
        name: goal.name,
        description: goal.description,
        period: goal.period,
        targetValue: goal.targetValue.toString(),
        currentValue: goal.currentValue.toString(),
        unit: goal.unit,
        startDate: goal.startDate,
        endDate: goal.endDate,
      })
    } else {
      resetForm()
    }
    setIsDialogOpen(true)
  }

  const calculateStatus = (current: number, target: number): GoalStatus => {
    const percentage = (current / target) * 100
    if (percentage >= 100) return "exceeded"
    if (percentage >= 90) return "on-track"
    if (percentage >= 70) return "at-risk"
    return "behind"
  }

  const handleSaveGoal = () => {
    const target = Number.parseFloat(formData.targetValue)
    const current = Number.parseFloat(formData.currentValue)

    if (editingGoal) {
      setGoals((prev) =>
        prev.map((g) =>
          g.id === editingGoal.id
            ? {
                ...g,
                ...formData,
                targetValue: target,
                currentValue: current,
                status: calculateStatus(current, target),
              }
            : g
        )
      )
    } else {
      const newGoal: ProductionGoal = {
        id: `g${Date.now()}`,
        name: formData.name,
        description: formData.description,
        period: formData.period,
        targetValue: target,
        currentValue: current,
        unit: formData.unit,
        startDate: formData.startDate,
        endDate: formData.endDate,
        status: calculateStatus(current, target),
      }
      setGoals((prev) => [...prev, newGoal])
    }

    setIsDialogOpen(false)
    resetForm()
  }

  const handleDeleteGoal = (id: string) => {
    setGoals((prev) => prev.filter((g) => g.id !== id))
  }

  const filteredGoals = filterPeriod === "all" ? goals : goals.filter((g) => g.period === filterPeriod)

  const stats = {
    total: goals.length,
    onTrack: goals.filter((g) => g.status === "on-track").length,
    exceeded: goals.filter((g) => g.status === "exceeded" || g.status === "completed").length,
    atRisk: goals.filter((g) => g.status === "at-risk" || g.status === "behind").length,
  }

  const overallProgress =
    goals.reduce((sum, g) => sum + Math.min((g.currentValue / g.targetValue) * 100, 100), 0) / goals.length

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
            <p className="text-muted-foreground">Define y monitorea objetivos de produccion</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2" onClick={() => handleOpenDialog()}>
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
                  <Label htmlFor="name">Nombre de la Meta</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ej: Meta Diaria de Produccion"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Descripcion</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Describe el objetivo..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="period">Periodo</Label>
                    <Select
                      value={formData.period}
                      onValueChange={(v) => setFormData({ ...formData, period: v as GoalPeriod })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Diaria</SelectItem>
                        <SelectItem value="weekly">Semanal</SelectItem>
                        <SelectItem value="monthly">Mensual</SelectItem>
                        <SelectItem value="annual">Anual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="unit">Unidad</Label>
                    <Select
                      value={formData.unit}
                      onValueChange={(v) => setFormData({ ...formData, unit: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unidades">Unidades</SelectItem>
                        <SelectItem value="%">Porcentaje</SelectItem>
                        <SelectItem value="horas">Horas</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="targetValue">Valor Meta</Label>
                    <Input
                      id="targetValue"
                      type="number"
                      value={formData.targetValue}
                      onChange={(e) => setFormData({ ...formData, targetValue: e.target.value })}
                      placeholder="3500"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="currentValue">Valor Actual</Label>
                    <Input
                      id="currentValue"
                      type="number"
                      value={formData.currentValue}
                      onChange={(e) => setFormData({ ...formData, currentValue: e.target.value })}
                      placeholder="2800"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="startDate">Fecha Inicio</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="endDate">Fecha Fin</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={formData.endDate}
                      onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSaveGoal}>{editingGoal ? "Guardar Cambios" : "Crear Meta"}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">Total Metas</p>
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
                  <p className="text-xs font-medium uppercase text-muted-foreground">En Progreso</p>
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
                  <p className="text-xs font-medium uppercase text-muted-foreground">Completadas</p>
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
                  <p className="text-xs font-medium uppercase text-muted-foreground">En Riesgo</p>
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
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold text-foreground">Progreso General</h3>
                <p className="text-sm text-muted-foreground">Promedio de cumplimiento de todas las metas</p>
              </div>
              <span className="text-3xl font-bold text-primary">{overallProgress.toFixed(1)}%</span>
            </div>
            <Progress value={overallProgress} className="h-4" />
          </CardContent>
        </Card>

        {/* Filters */}
        <Tabs defaultValue="all" className="space-y-4">
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="all" onClick={() => setFilterPeriod("all")}>
                Todas
              </TabsTrigger>
              <TabsTrigger value="daily" onClick={() => setFilterPeriod("daily")}>
                Diarias
              </TabsTrigger>
              <TabsTrigger value="weekly" onClick={() => setFilterPeriod("weekly")}>
                Semanales
              </TabsTrigger>
              <TabsTrigger value="monthly" onClick={() => setFilterPeriod("monthly")}>
                Mensuales
              </TabsTrigger>
              <TabsTrigger value="annual" onClick={() => setFilterPeriod("annual")}>
                Anuales
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="all" className="mt-4">
            <div className="grid gap-4 md:grid-cols-2">
              {filteredGoals.map((goal) => (
                <GoalCard key={goal.id} goal={goal} onEdit={handleOpenDialog} onDelete={handleDeleteGoal} />
              ))}
            </div>
          </TabsContent>
          <TabsContent value="daily" className="mt-4">
            <div className="grid gap-4 md:grid-cols-2">
              {filteredGoals.map((goal) => (
                <GoalCard key={goal.id} goal={goal} onEdit={handleOpenDialog} onDelete={handleDeleteGoal} />
              ))}
            </div>
          </TabsContent>
          <TabsContent value="weekly" className="mt-4">
            <div className="grid gap-4 md:grid-cols-2">
              {filteredGoals.map((goal) => (
                <GoalCard key={goal.id} goal={goal} onEdit={handleOpenDialog} onDelete={handleDeleteGoal} />
              ))}
            </div>
          </TabsContent>
          <TabsContent value="monthly" className="mt-4">
            <div className="grid gap-4 md:grid-cols-2">
              {filteredGoals.map((goal) => (
                <GoalCard key={goal.id} goal={goal} onEdit={handleOpenDialog} onDelete={handleDeleteGoal} />
              ))}
            </div>
          </TabsContent>
          <TabsContent value="annual" className="mt-4">
            <div className="grid gap-4 md:grid-cols-2">
              {filteredGoals.map((goal) => (
                <GoalCard key={goal.id} goal={goal} onEdit={handleOpenDialog} onDelete={handleDeleteGoal} />
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {filteredGoals.length === 0 && (
          <Card className="py-12">
            <CardContent className="flex flex-col items-center justify-center text-center">
              <Target className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold text-foreground">No hay metas en este periodo</h3>
              <p className="text-muted-foreground mb-4">
                Crea una nueva meta para comenzar a monitorear tu progreso
              </p>
              <Button onClick={() => handleOpenDialog()}>
                <Plus className="mr-2 h-4 w-4" />
                Crear Meta
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  )
}
