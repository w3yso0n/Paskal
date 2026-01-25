"use client"

import { useState } from "react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { AttendanceTable } from "@/components/attendance/attendance-table"
import { ShiftRotationTable } from "@/components/attendance/shift-rotation-table"
import { AttendanceStatsCards } from "@/components/attendance/attendance-stats-cards"
import { attendanceRecords, shiftRotations, attendanceStats } from "@/lib/mock-data"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Clock, Users, BarChart3, Plus, Download, Calendar } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export default function AttendanceRotationPage() {
  const [records, setRecords] = useState(attendanceRecords)
  const [rotations, setRotations] = useState(shiftRotations)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedTab, setSelectedTab] = useState("asistencias")
  const [searchTerm, setSearchTerm] = useState("")
  const [filterEmployee, setFilterEmployee] = useState("todos")
  const [filterShift, setFilterShift] = useState("todos")

  const handleDeleteRecord = (id: string) => {
    setRecords(records.filter((r) => r.id !== id))
  }

  const handleDeleteRotation = (id: string) => {
    setRotations(rotations.filter((r) => r.id !== id))
  }

  const filteredRecords = records.filter((record) => {
    const matchesSearch =
      record.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.status.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesEmployee =
      filterEmployee === "todos" || record.employeeId === filterEmployee
    return matchesSearch && matchesEmployee
  })

  const filteredRotations = rotations.filter((rotation) => {
    const matchesSearch =
      rotation.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rotation.machine.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesEmployee =
      filterEmployee === "todos" || rotation.employeeId === filterEmployee
    const matchesShift =
      filterShift === "todos" || rotation.shift === filterShift
    return matchesSearch && matchesEmployee && matchesShift
  })

  const employees = Array.from(
    new Map(
      records.map((r) => [r.employeeId, { id: r.employeeId, name: r.employeeName }])
    ).values()
  )

  return (
    <DashboardLayout
      breadcrumbs={[
        { label: "Inicio", href: "/" },
        { label: "Asistencias y Rotación" },
      ]}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  Asistencias y Rotación
                </h1>
                <p className="text-muted-foreground">
                  Gestiona la asistencia y rotación de personal
                </p>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              Exportar
            </Button>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2 bg-primary hover:bg-primary/90">
                  <Plus className="h-4 w-4" />
                  Nuevo Registro
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Agregar Registro de Asistencia</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="employee">Empleado</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona empleado" />
                      </SelectTrigger>
                      <SelectContent>
                        {employees.map((emp) => (
                          <SelectItem key={emp.id} value={emp.id}>
                            {emp.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="date">Fecha</Label>
                    <Input type="date" id="date" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="checkin">Hora de Entrada</Label>
                    <Input type="time" id="checkin" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="checkout">Hora de Salida</Label>
                    <Input type="time" id="checkout" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="status">Estado</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona estado" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Asistente">Asistente</SelectItem>
                        <SelectItem value="Retardo">Retardo</SelectItem>
                        <SelectItem value="Ausente">Ausente</SelectItem>
                        <SelectItem value="Permiso">Permiso</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button className="w-full" onClick={() => setIsDialogOpen(false)}>
                    Guardar Registro
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Stats Cards */}
        <AttendanceStatsCards stats={attendanceStats} />

        {/* Tabs */}
        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="asistencias" className="gap-2">
              <Users className="h-4 w-4" />
              Asistencias
            </TabsTrigger>
            <TabsTrigger value="rotaciones" className="gap-2">
              <Calendar className="h-4 w-4" />
              Rotaciones
            </TabsTrigger>
            <TabsTrigger value="estadisticas" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Estadísticas
            </TabsTrigger>
          </TabsList>

          {/* Asistencias Tab */}
          <TabsContent value="asistencias" className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground mb-1 block">
                  Buscar
                </Label>
                <Input
                  placeholder="Buscar por empleado, estado..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="w-full sm:w-48">
                <Label className="text-xs text-muted-foreground mb-1 block">
                  Empleado
                </Label>
                <Select value={filterEmployee} onValueChange={setFilterEmployee}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los empleados</SelectItem>
                    {employees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Table */}
            <AttendanceTable
              records={filteredRecords}
              onDelete={handleDeleteRecord}
            />
          </TabsContent>

          {/* Rotaciones Tab */}
          <TabsContent value="rotaciones" className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground mb-1 block">
                  Buscar
                </Label>
                <Input
                  placeholder="Buscar por empleado, máquina..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="w-full sm:w-48">
                <Label className="text-xs text-muted-foreground mb-1 block">
                  Empleado
                </Label>
                <Select value={filterEmployee} onValueChange={setFilterEmployee}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los empleados</SelectItem>
                    {employees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full sm:w-48">
                <Label className="text-xs text-muted-foreground mb-1 block">
                  Turno
                </Label>
                <Select value={filterShift} onValueChange={setFilterShift}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los turnos</SelectItem>
                    <SelectItem value="Mañana">Mañana</SelectItem>
                    <SelectItem value="Tarde">Tarde</SelectItem>
                    <SelectItem value="Noche">Noche</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Table */}
            <ShiftRotationTable
              rotations={filteredRotations}
              onDelete={handleDeleteRotation}
            />
          </TabsContent>

          {/* Estadísticas Tab */}
          <TabsContent value="estadisticas" className="space-y-4">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Resumen general */}
              <div className="rounded-lg border border-border bg-card p-6">
                <h3 className="font-semibold text-foreground mb-4">
                  Resumen General del Mes
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total de empleados</span>
                    <span className="font-semibold">{attendanceStats.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Asistencia promedio
                    </span>
                    <span className="font-semibold text-green-600">
                      {(
                        attendanceStats.reduce((a, b) => a + b.attendancePercentage, 0) /
                        attendanceStats.length
                      ).toFixed(1)}
                      %
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Total de ausencias
                    </span>
                    <span className="font-semibold text-red-600">
                      {attendanceStats.reduce((a, b) => a + b.absentDays, 0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Total de retardos
                    </span>
                    <span className="font-semibold text-yellow-600">
                      {attendanceStats.reduce((a, b) => a + b.lateDays, 0)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Top employees */}
              <div className="rounded-lg border border-border bg-card p-6">
                <h3 className="font-semibold text-foreground mb-4">
                  Mejores Asistencias
                </h3>
                <div className="space-y-3">
                  {attendanceStats
                    .sort((a, b) => b.attendancePercentage - a.attendancePercentage)
                    .slice(0, 4)
                    .map((stat) => (
                      <div
                        key={stat.employeeId}
                        className="flex items-center justify-between"
                      >
                        <span className="text-sm text-foreground">
                          {stat.employeeName}
                        </span>
                        <span className="text-sm font-semibold text-green-600">
                          {stat.attendancePercentage}%
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </div>

            {/* Detailed stats */}
            <div className="rounded-lg border border-border bg-card p-6">
              <h3 className="font-semibold text-foreground mb-4">
                Estadísticas Detalladas por Empleado
              </h3>
              <AttendanceStatsCards stats={attendanceStats} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  )
}
