"use client"

import { useState } from "react"
import { Clock, Plus, Calendar, Users, Factory, Sun, Sunset, Moon, Edit2, Trash2, Check, X } from "lucide-react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  shifts,
  shiftAssignments as initialAssignments,
  employees,
  machines,
  type ShiftAssignment,
  type ShiftType,
} from "@/lib/mock-data"

const shiftIcons: Record<ShiftType, typeof Sun> = {
  morning: Sun,
  afternoon: Sunset,
  night: Moon,
}

const shiftColors: Record<ShiftType, { bg: string; text: string; border: string }> = {
  morning: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  afternoon: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  night: { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200" },
}

const statusColors: Record<string, { bg: string; text: string }> = {
  scheduled: { bg: "bg-gray-100", text: "text-gray-700" },
  "in-progress": { bg: "bg-green-100", text: "text-green-700" },
  completed: { bg: "bg-blue-100", text: "text-blue-700" },
  absent: { bg: "bg-red-100", text: "text-red-700" },
}

const statusLabels: Record<string, string> = {
  scheduled: "Programado",
  "in-progress": "En Curso",
  completed: "Completado",
  absent: "Ausente",
}

export default function TurnosPage() {
  const [assignments, setAssignments] = useState<ShiftAssignment[]>(initialAssignments)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingAssignment, setEditingAssignment] = useState<ShiftAssignment | null>(null)
  const [selectedDate, setSelectedDate] = useState("2026-01-20")
  const [formData, setFormData] = useState({
    employeeId: "",
    shiftId: "",
    machineId: "",
    date: selectedDate,
  })

  const filteredAssignments = assignments.filter((a) => a.date === selectedDate)
  const todayAssignments = assignments.filter((a) => a.date === "2026-01-20")
  const inProgressCount = todayAssignments.filter((a) => a.status === "in-progress").length
  const scheduledCount = todayAssignments.filter((a) => a.status === "scheduled").length

  const handleOpenModal = (assignment?: ShiftAssignment) => {
    if (assignment) {
      setEditingAssignment(assignment)
      setFormData({
        employeeId: assignment.employeeId,
        shiftId: assignment.shiftId,
        machineId: assignment.machineId,
        date: assignment.date,
      })
    } else {
      setEditingAssignment(null)
      setFormData({
        employeeId: "",
        shiftId: "",
        machineId: "",
        date: selectedDate,
      })
    }
    setIsModalOpen(true)
  }

  const handleSave = () => {
    const employee = employees.find((e) => e.id === formData.employeeId)
    const shift = shifts.find((s) => s.id === formData.shiftId)
    const machine = machines.find((m) => m.id === formData.machineId)

    if (!employee || !shift || !machine) return

    if (editingAssignment) {
      setAssignments((prev) =>
        prev.map((a) =>
          a.id === editingAssignment.id
            ? {
                ...a,
                employeeId: formData.employeeId,
                employeeName: employee.name,
                shiftId: formData.shiftId,
                shiftName: shift.name,
                machineId: formData.machineId,
                machineName: machine.name,
                date: formData.date,
              }
            : a
        )
      )
    } else {
      const newAssignment: ShiftAssignment = {
        id: `sa${Date.now()}`,
        employeeId: formData.employeeId,
        employeeName: employee.name,
        shiftId: formData.shiftId,
        shiftName: shift.name,
        machineId: formData.machineId,
        machineName: machine.name,
        date: formData.date,
        status: "scheduled",
      }
      setAssignments((prev) => [...prev, newAssignment])
    }
    setIsModalOpen(false)
  }

  const handleDelete = (id: string) => {
    setAssignments((prev) => prev.filter((a) => a.id !== id))
  }

  const handleStatusChange = (id: string, newStatus: ShiftAssignment["status"]) => {
    setAssignments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: newStatus } : a))
    )
  }

  return (
    <DashboardLayout breadcrumbs={[{ label: "Inicio", href: "/" }, { label: "Gestión de Turnos" }]}>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Gestión de Turnos</h1>
              <p className="text-sm text-muted-foreground">Administra y programa los turnos del personal</p>
            </div>
          </div>
          <Button onClick={() => handleOpenModal()} className="gap-2">
            <Plus className="h-4 w-4" />
            Asignar Turno
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {shifts.map((shift) => {
            const ShiftIcon = shiftIcons[shift.type]
            const colors = shiftColors[shift.type]
            const count = todayAssignments.filter((a) => a.shiftId === shift.id).length
            return (
              <Card key={shift.id} className={cn("border", colors.border, colors.bg)}>
                <CardContent className="flex items-center gap-4 p-4">
                  <div className={cn("flex h-12 w-12 items-center justify-center rounded-full", colors.bg)}>
                    <ShiftIcon className={cn("h-6 w-6", colors.text)} />
                  </div>
                  <div>
                    <p className={cn("text-sm font-medium", colors.text)}>{shift.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {shift.startTime} - {shift.endTime}
                    </p>
                    <p className={cn("text-lg font-bold", colors.text)}>{count} asignados</p>
                  </div>
                </CardContent>
              </Card>
            )
          })}
          <Card className="border-green-200 bg-green-50">
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <Users className="h-6 w-6 text-green-700" />
              </div>
              <div>
                <p className="text-sm font-medium text-green-700">En Curso Ahora</p>
                <p className="text-xs text-muted-foreground">{scheduledCount} programados</p>
                <p className="text-lg font-bold text-green-700">{inProgressCount} activos</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Calendar and Assignments */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Date Selector */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Calendar className="h-4 w-4" />
                Seleccionar Fecha
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="mb-4"
              />
              <div className="space-y-2">
                <p className="text-sm font-medium">Resumen del día</p>
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-amber-500" />
                      <span>Mañana: {filteredAssignments.filter((a) => a.shiftId === "s1").length}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-blue-500" />
                      <span>Tarde: {filteredAssignments.filter((a) => a.shiftId === "s2").length}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-indigo-500" />
                      <span>Noche: {filteredAssignments.filter((a) => a.shiftId === "s3").length}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-green-500" />
                      <span>Total: {filteredAssignments.length}</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Assignments Table */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4" />
                Asignaciones para {new Date(selectedDate).toLocaleDateString("es-MX", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {filteredAssignments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Calendar className="mb-3 h-12 w-12 opacity-50" />
                  <p className="text-sm">No hay asignaciones para esta fecha</p>
                  <Button variant="outline" className="mt-4 bg-transparent" onClick={() => handleOpenModal()}>
                    Crear primera asignación
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredAssignments.map((assignment) => {
                    const shift = shifts.find((s) => s.id === assignment.shiftId)
                    const ShiftIcon = shift ? shiftIcons[shift.type] : Sun
                    const colors = shift ? shiftColors[shift.type] : shiftColors.morning
                    const statusColor = statusColors[assignment.status]

                    return (
                      <div
                        key={assignment.id}
                        className={cn(
                          "flex items-center justify-between rounded-lg border p-4",
                          colors.border,
                          colors.bg
                        )}
                      >
                        <div className="flex items-center gap-4">
                          <div className={cn("flex h-10 w-10 items-center justify-center rounded-full", colors.bg)}>
                            <ShiftIcon className={cn("h-5 w-5", colors.text)} />
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{assignment.employeeName}</p>
                            <div className="flex items-center gap-3 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Factory className="h-3 w-3" />
                                {assignment.machineName}
                              </span>
                              <span>{assignment.shiftName}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={cn("rounded-full px-3 py-1 text-xs font-medium", statusColor.bg, statusColor.text)}>
                            {statusLabels[assignment.status]}
                          </span>
                          <Select
                            value={assignment.status}
                            onValueChange={(value) => handleStatusChange(assignment.id, value as ShiftAssignment["status"])}
                          >
                            <SelectTrigger className="h-8 w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="scheduled">Programado</SelectItem>
                              <SelectItem value="in-progress">En Curso</SelectItem>
                              <SelectItem value="completed">Completado</SelectItem>
                              <SelectItem value="absent">Ausente</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button variant="ghost" size="icon" onClick={() => handleOpenModal(assignment)}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(assignment.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Weekly Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-4 w-4" />
              Vista Semanal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <div className="grid min-w-[800px] grid-cols-8 gap-2">
                <div className="p-2 text-sm font-medium text-muted-foreground">Turno</div>
                {["Lun 20", "Mar 21", "Mié 22", "Jue 23", "Vie 24", "Sáb 25", "Dom 26"].map((day) => (
                  <div key={day} className="p-2 text-center text-sm font-medium text-muted-foreground">
                    {day}
                  </div>
                ))}
                {shifts.map((shift) => {
                  const colors = shiftColors[shift.type]
                  const ShiftIcon = shiftIcons[shift.type]
                  return (
                    <>
                      <div key={shift.id} className={cn("flex items-center gap-2 rounded p-2", colors.bg)}>
                        <ShiftIcon className={cn("h-4 w-4", colors.text)} />
                        <span className={cn("text-sm font-medium", colors.text)}>{shift.name.replace("Turno ", "")}</span>
                      </div>
                      {[20, 21, 22, 23, 24, 25, 26].map((day) => {
                        const dayAssignments = assignments.filter(
                          (a) => a.shiftId === shift.id && a.date === `2026-01-${day}`
                        )
                        return (
                          <div key={`${shift.id}-${day}`} className="rounded border border-border bg-card p-2">
                            {dayAssignments.length > 0 ? (
                              <div className="space-y-1">
                                {dayAssignments.slice(0, 2).map((a) => (
                                  <div key={a.id} className="rounded bg-primary/10 px-2 py-1 text-xs">
                                    {a.employeeName.split(" ")[0]}
                                  </div>
                                ))}
                                {dayAssignments.length > 2 && (
                                  <div className="text-xs text-muted-foreground">+{dayAssignments.length - 2} más</div>
                                )}
                              </div>
                            ) : (
                              <div className="h-8 flex items-center justify-center text-xs text-muted-foreground">-</div>
                            )}
                          </div>
                        )
                      })}
                    </>
                  )
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Assignment Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAssignment ? "Editar Asignación" : "Nueva Asignación de Turno"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Empleado</Label>
              <Select value={formData.employeeId} onValueChange={(v) => setFormData({ ...formData, employeeId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar empleado" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.name} - {emp.role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Turno</Label>
              <Select value={formData.shiftId} onValueChange={(v) => setFormData({ ...formData, shiftId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar turno" />
                </SelectTrigger>
                <SelectContent>
                  {shifts.map((shift) => (
                    <SelectItem key={shift.id} value={shift.id}>
                      {shift.name} ({shift.startTime} - {shift.endTime})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Máquina</Label>
              <Select value={formData.machineId} onValueChange={(v) => setFormData({ ...formData, machineId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar máquina" />
                </SelectTrigger>
                <SelectContent>
                  {machines.map((machine) => (
                    <SelectItem key={machine.id} value={machine.id}>
                      {machine.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fecha</Label>
              <Input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={!formData.employeeId || !formData.shiftId || !formData.machineId}>
              {editingAssignment ? "Guardar Cambios" : "Crear Asignación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
