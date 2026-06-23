"use client"

import { useEffect, useMemo, useState } from "react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Users,
  Plus,
  Trash2,
  CalendarDays,
  Briefcase,
  Pencil,
  Search,
  Mail,
  Phone,
  Hash,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/auth-context"
import {
  createEmployee,
  createEmployeeDayRecord,
  createEmployeeRoleEvent,
  deleteEmployee,
  deleteEmployeeDayRecord,
  deleteEmployeeRoleEvent,
  getEmployeeDayRecords,
  getEmployeeRoleEvents,
  getEmployees,
  updateEmployee,
  type ApiEmployee,
  type ApiEmployeeDayRecord,
  type ApiEmployeeDayRecordType,
  type ApiEmployeeRoleEvent,
  type ApiEmployeeSecondaryRole,
  type ApiEmployeeStatus,
} from "@/lib/api"
import {
  EMPLOYEE_PRODUCTION_ROLE_LABELS,
  EMPLOYEE_SECONDARY_ROLE_LABELS,
  inferProductionRoleFromPosition,
  PRIMARY_ROLES,
  SECONDARY_ROLES,
  type EmployeeProductionRole,
  type EmployeeSecondaryRole,
} from "@/lib/employee-production-role"

const RECORD_TYPE_LABELS: Record<ApiEmployeeDayRecordType, string> = {
  vacation: "Vacaciones (V)",
  incapacity: "Incapacidad (INCAP)",
  incident: "Incidencia (INC)",
  excused_unpaid: "Permiso sin goce (PSG)",
  time_exchange: "Tiempo por tiempo (TXT)",
}

const STATUS_LABELS: Record<ApiEmployeeStatus, string> = {
  active: "Activo",
  inactive: "Inactivo",
  terminated: "Baja",
}

type EmployeeFormState = {
  fullName: string
  nfcCardUid: string
  email: string
  phone: string
  position: string
  primaryRole: EmployeeProductionRole
  secondaryRole: EmployeeSecondaryRole | ""
  hiredAt: string
  status: ApiEmployeeStatus
}

const EMPTY_EMPLOYEE_FORM: EmployeeFormState = {
  fullName: "",
  nfcCardUid: "",
  email: "",
  phone: "",
  position: "",
  primaryRole: "operator",
  secondaryRole: "",
  hiredAt: "",
  status: "active",
}

function monthBoundsFromInput(monthValue: string) {
  const [yRaw, mRaw] = monthValue.split("-")
  const year = Number(yRaw)
  const month = Number(mRaw) - 1
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 0 || month > 11) {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth()
    const mm = String(m + 1).padStart(2, "0")
    const start = `${y}-${mm}-01`
    const end = new Date(y, m + 1, 0).toISOString().slice(0, 10)
    return { start, end }
  }
  const mm = String(month + 1).padStart(2, "0")
  const start = `${year}-${mm}-01`
  const end = new Date(year, month + 1, 0).toISOString().slice(0, 10)
  return { start, end }
}

function employeeToForm(employee: ApiEmployee): EmployeeFormState {
  return {
    fullName: employee.fullName,
    nfcCardUid: employee.nfcCardUid ?? "",
    email: employee.email ?? "",
    phone: employee.phone ?? "",
    position: employee.position ?? "",
    primaryRole:
      employee.primaryRole ??
      inferProductionRoleFromPosition(employee.position) ??
      "operator",
    secondaryRole: employee.secondaryRole ?? "",
    hiredAt: employee.hiredAt ?? "",
    status: employee.status,
  }
}

function statusBadgeClass(status: ApiEmployeeStatus) {
  return cn(
    "text-xs font-medium",
    status === "active"
      ? "bg-green-100 text-green-700 hover:bg-green-100"
      : status === "inactive"
        ? "bg-yellow-100 text-yellow-700 hover:bg-yellow-100"
        : "bg-red-100 text-red-700 hover:bg-red-100",
  )
}

function EmployeeFormFields({
  form,
  onChange,
  idPrefix,
}: {
  form: EmployeeFormState
  onChange: (next: EmployeeFormState) => void
  idPrefix: string
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-fullName`}>Nombre completo</Label>
        <Input
          id={`${idPrefix}-fullName`}
          value={form.fullName}
          onChange={(e) => onChange({ ...form, fullName: e.target.value })}
          placeholder="Ej: Juan Pérez"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-nfcCardUid`}>Código NFC (UID de tarjeta)</Label>
        <Input
          id={`${idPrefix}-nfcCardUid`}
          value={form.nfcCardUid}
          onChange={(e) => onChange({ ...form, nfcCardUid: e.target.value })}
          placeholder="Ej: 03110694"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-position`}>Puesto</Label>
        <Input
          id={`${idPrefix}-position`}
          value={form.position}
          onChange={(e) => onChange({ ...form, position: e.target.value })}
          placeholder="Ej: Operador"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-hiredAt`}>Fecha de ingreso</Label>
        <Input
          id={`${idPrefix}-hiredAt`}
          type="date"
          value={form.hiredAt}
          onChange={(e) => onChange({ ...form, hiredAt: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label>Rol primordial</Label>
        <Select
          value={form.primaryRole}
          onValueChange={(v) => {
            const primaryRole = v as EmployeeProductionRole
            onChange({
              ...form,
              primaryRole,
              secondaryRole: primaryRole === "operator" ? form.secondaryRole : "",
            })
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRIMARY_ROLES.map((role) => (
              <SelectItem key={role} value={role}>
                {EMPLOYEE_PRODUCTION_ROLE_LABELS[role]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {form.primaryRole === "operator" ? (
        <div className="space-y-2">
          <Label>Rol secundario (opcional)</Label>
          <Select
            value={form.secondaryRole || "none"}
            onValueChange={(v) =>
              onChange({
                ...form,
                secondaryRole: v === "none" ? "" : (v as EmployeeSecondaryRole),
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Sin rol secundario" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin rol secundario</SelectItem>
              {SECONDARY_ROLES.map((role) => (
                <SelectItem key={role} value={role}>
                  {EMPLOYEE_SECONDARY_ROLE_LABELS[role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Solo aplica si el rol primordial es operador. Los eventos del mes pueden cambiarlo
            temporalmente.
          </p>
        </div>
      ) : (
        <div className="hidden sm:block" />
      )}
      <div className="space-y-2">
        <Label>Estado</Label>
        <Select
          value={form.status}
          onValueChange={(v) => onChange({ ...form, status: v as ApiEmployeeStatus })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Activo</SelectItem>
            <SelectItem value="inactive">Inactivo</SelectItem>
            <SelectItem value="terminated">Baja</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-email`}>Email</Label>
        <Input
          id={`${idPrefix}-email`}
          type="email"
          value={form.email}
          onChange={(e) => onChange({ ...form, email: e.target.value })}
          placeholder="correo@empresa.com"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-phone`}>Teléfono</Label>
        <Input
          id={`${idPrefix}-phone`}
          value={form.phone}
          onChange={(e) => onChange({ ...form, phone: e.target.value })}
          placeholder="+52 …"
        />
      </div>
    </div>
  )
}

export default function EmployeesPage() {
  const { user, getAccessToken } = useAuth()
  const [employees, setEmployees] = useState<ApiEmployee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<ApiEmployeeStatus | "all">("all")

  const [isEmployeeDialogOpen, setIsEmployeeDialogOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<ApiEmployee | null>(null)
  const [employeeForm, setEmployeeForm] = useState<EmployeeFormState>(EMPTY_EMPLOYEE_FORM)
  const [savingEmployee, setSavingEmployee] = useState(false)

  const [attendanceMonth, setAttendanceMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  })
  const [dayRecords, setDayRecords] = useState<ApiEmployeeDayRecord[]>([])
  const [dayRecordsLoading, setDayRecordsLoading] = useState(false)
  const [dayRecordsError, setDayRecordsError] = useState<string | null>(null)
  const [isAttendanceDialogOpen, setIsAttendanceDialogOpen] = useState(false)
  const [newDayRecord, setNewDayRecord] = useState({
    employeeId: "",
    recordDate: "",
    shift: "" as "" | "matutino" | "vespertino",
    recordType: "vacation" as ApiEmployeeDayRecordType,
    notes: "",
  })

  const [roleEvents, setRoleEvents] = useState<ApiEmployeeRoleEvent[]>([])
  const [roleEventsLoading, setRoleEventsLoading] = useState(false)
  const [roleEventsError, setRoleEventsError] = useState<string | null>(null)
  const [isRoleEventDialogOpen, setIsRoleEventDialogOpen] = useState(false)
  const [newRoleEvent, setNewRoleEvent] = useState({
    employeeId: "",
    recordDate: "",
    shift: "" as "" | "matutino" | "vespertino",
    secondaryRole: "packer" as ApiEmployeeSecondaryRole,
    notes: "",
  })

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const token = await getAccessToken()
        if (!token) {
          if (!cancelled) setEmployees([])
          return
        }
        const rows = await getEmployees(token)
        if (!cancelled) setEmployees(rows)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Error al cargar empleados")
          setEmployees([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [getAccessToken])

  useEffect(() => {
    let cancelled = false
    const loadDayRecords = async () => {
      setDayRecordsLoading(true)
      setDayRecordsError(null)
      try {
        const token = await getAccessToken()
        if (!token) {
          if (!cancelled) setDayRecords([])
          return
        }
        const bounds = monthBoundsFromInput(attendanceMonth)
        const rows = await getEmployeeDayRecords(token, {
          from: bounds.start,
          to: bounds.end,
          limit: 2000,
        })
        if (!cancelled) setDayRecords(rows)
      } catch (e) {
        if (!cancelled) {
          setDayRecordsError(e instanceof Error ? e.message : "Error al cargar registros")
          setDayRecords([])
        }
      } finally {
        if (!cancelled) setDayRecordsLoading(false)
      }
    }
    loadDayRecords()
    return () => {
      cancelled = true
    }
  }, [getAccessToken, attendanceMonth])

  useEffect(() => {
    let cancelled = false
    const loadRoleEvents = async () => {
      setRoleEventsLoading(true)
      setRoleEventsError(null)
      try {
        const token = await getAccessToken()
        if (!token) {
          if (!cancelled) setRoleEvents([])
          return
        }
        const bounds = monthBoundsFromInput(attendanceMonth)
        const rows = await getEmployeeRoleEvents(token, {
          from: bounds.start,
          to: bounds.end,
          limit: 2000,
        })
        if (!cancelled) setRoleEvents(rows)
      } catch (e) {
        if (!cancelled) {
          setRoleEventsError(e instanceof Error ? e.message : "Error al cargar eventos de rol")
          setRoleEvents([])
        }
      } finally {
        if (!cancelled) setRoleEventsLoading(false)
      }
    }
    loadRoleEvents()
    return () => {
      cancelled = true
    }
  }, [getAccessToken, attendanceMonth])

  const stats = useMemo(() => {
    const active = employees.filter((e) => e.status === "active").length
    const inactive = employees.filter((e) => e.status === "inactive").length
    const terminated = employees.filter((e) => e.status === "terminated").length
    return { active, inactive, terminated, total: employees.length }
  }, [employees])

  const operatorEmployees = useMemo(
    () =>
      employees.filter(
        (e) =>
          (e.primaryRole ??
            inferProductionRoleFromPosition(e.position) ??
            "operator") === "operator",
      ),
    [employees],
  )

  const filteredEmployees = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return employees.filter((e) => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false
      if (!q) return true
      const haystack = [
        e.fullName,
        e.employeeCode,
        e.position,
        e.email,
        e.phone,
        e.primaryRole ? EMPLOYEE_PRODUCTION_ROLE_LABELS[e.primaryRole] : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [employees, searchQuery, statusFilter])

  const openCreateEmployee = () => {
    setEditingEmployee(null)
    setEmployeeForm(EMPTY_EMPLOYEE_FORM)
    setIsEmployeeDialogOpen(true)
  }

  const openEditEmployee = (employee: ApiEmployee) => {
    setEditingEmployee(employee)
    setEmployeeForm(employeeToForm(employee))
    setIsEmployeeDialogOpen(true)
  }

  const handleSaveEmployee = async () => {
    const fullName = employeeForm.fullName.trim()
    if (!fullName || !user) return

    const token = await getAccessToken()
    if (!token) return

    setSavingEmployee(true)
    try {
      const payload = {
        fullName,
        nfcCardUid: employeeForm.nfcCardUid.trim() || null,
        email: employeeForm.email.trim() || null,
        phone: employeeForm.phone.trim() || null,
        position: employeeForm.position.trim() || null,
        primaryRole: employeeForm.primaryRole,
        secondaryRole:
          employeeForm.primaryRole === "operator" && employeeForm.secondaryRole
            ? employeeForm.secondaryRole
            : null,
        hiredAt: employeeForm.hiredAt.trim() || null,
        status: employeeForm.status,
      }

      if (editingEmployee) {
        const updated = await updateEmployee(token, editingEmployee.id, payload)
        setEmployees((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
      } else {
        const created = await createEmployee(token, payload)
        setEmployees((prev) => [created, ...prev])
      }

      setIsEmployeeDialogOpen(false)
      setEditingEmployee(null)
      setEmployeeForm(EMPTY_EMPLOYEE_FORM)
    } finally {
      setSavingEmployee(false)
    }
  }

  const handleDeleteEmployee = async (employee: ApiEmployee) => {
    const ok = window.confirm(`¿Eliminar a ${employee.fullName}? Esta acción no se puede deshacer.`)
    if (!ok) return
    const token = await getAccessToken()
    if (!token) return
    await deleteEmployee(token, employee.id)
    setEmployees((prev) => prev.filter((e) => e.id !== employee.id))
  }

  const handleAddDayRecord = async () => {
    if (!newDayRecord.employeeId || !newDayRecord.recordDate) return
    const token = await getAccessToken()
    if (!token) return

    const created = await createEmployeeDayRecord(token, {
      employeeId: newDayRecord.employeeId,
      recordDate: newDayRecord.recordDate,
      shift: newDayRecord.shift || null,
      recordType: newDayRecord.recordType,
      notes: newDayRecord.notes.trim() || null,
    })

    setDayRecords((prev) => {
      const filtered = prev.filter(
        (r) =>
          !(
            r.employeeId === created.employeeId &&
            r.recordDate === created.recordDate &&
            (r.shift ?? null) === (created.shift ?? null)
          ),
      )
      return [created, ...filtered]
    })
    setNewDayRecord({
      employeeId: "",
      recordDate: "",
      shift: "",
      recordType: "vacation",
      notes: "",
    })
    setIsAttendanceDialogOpen(false)
  }

  const handleDeleteDayRecord = async (id: string) => {
    const token = await getAccessToken()
    if (!token) return
    await deleteEmployeeDayRecord(token, id)
    setDayRecords((prev) => prev.filter((r) => r.id !== id))
  }

  const handleAddRoleEvent = async () => {
    if (!newRoleEvent.employeeId || !newRoleEvent.recordDate) return
    const token = await getAccessToken()
    if (!token) return

    const created = await createEmployeeRoleEvent(token, {
      employeeId: newRoleEvent.employeeId,
      recordDate: newRoleEvent.recordDate,
      shift: newRoleEvent.shift || null,
      secondaryRole: newRoleEvent.secondaryRole,
      notes: newRoleEvent.notes.trim() || null,
    })

    setRoleEvents((prev) => {
      const filtered = prev.filter(
        (r) =>
          !(
            r.employeeId === created.employeeId &&
            r.recordDate === created.recordDate &&
            (r.shift ?? null) === (created.shift ?? null)
          ),
      )
      return [created, ...filtered]
    })
    setNewRoleEvent({
      employeeId: "",
      recordDate: "",
      shift: "",
      secondaryRole: "packer",
      notes: "",
    })
    setIsRoleEventDialogOpen(false)
  }

  const handleDeleteRoleEvent = async (id: string) => {
    const token = await getAccessToken()
    if (!token) return
    await deleteEmployeeRoleEvent(token, id)
    setRoleEvents((prev) => prev.filter((r) => r.id !== id))
  }

  return (
    <DashboardLayout
      breadcrumbs={[
        { label: "Dashboard", href: "/" },
        { label: "Gestión de empleados" },
      ]}
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Gestión de empleados</h1>
              <p className="text-sm text-muted-foreground">
                Directorio, ausencias y cambios temporales de rol
              </p>
            </div>
          </div>
          <Button className="gap-2 shrink-0" onClick={openCreateEmployee}>
            <Plus className="h-4 w-4" />
            Agregar empleado
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs font-medium uppercase text-muted-foreground">Total</p>
              <p className="text-2xl font-bold text-primary">{stats.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs font-medium uppercase text-muted-foreground">Activos</p>
              <p className="text-2xl font-bold text-green-700">{stats.active}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs font-medium uppercase text-muted-foreground">Inactivos</p>
              <p className="text-2xl font-bold text-yellow-700">{stats.inactive}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs font-medium uppercase text-muted-foreground">Bajas</p>
              <p className="text-2xl font-bold text-red-700">{stats.terminated}</p>
            </CardContent>
          </Card>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
            {error}
          </div>
        )}

        <Tabs defaultValue="employees" className="space-y-4">
          <TabsList className="grid w-full max-w-2xl grid-cols-3">
            <TabsTrigger value="employees" className="gap-1.5">
              <Users className="h-4 w-4" />
              Empleados
            </TabsTrigger>
            <TabsTrigger value="attendance" className="gap-1.5">
              <CalendarDays className="h-4 w-4" />
              Vacaciones e incapacidad
            </TabsTrigger>
            <TabsTrigger value="roles" className="gap-1.5">
              <Briefcase className="h-4 w-4" />
              Cambio rol secundario
            </TabsTrigger>
          </TabsList>

          <TabsContent value="employees" className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Buscar por nombre, código, puesto…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as ApiEmployeeStatus | "all")}
              >
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="active">Activos</SelectItem>
                  <SelectItem value="inactive">Inactivos</SelectItem>
                  <SelectItem value="terminated">Bajas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <div className="rounded-lg border border-border bg-muted/30 p-8 text-center text-muted-foreground">
                Cargando empleados…
              </div>
            ) : filteredEmployees.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-10 text-center">
                <p className="text-muted-foreground">
                  {employees.length === 0
                    ? "No hay empleados registrados."
                    : "Ningún empleado coincide con la búsqueda."}
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filteredEmployees.map((employee) => {
                  const role =
                    employee.primaryRole ??
                    inferProductionRoleFromPosition(employee.position) ??
                    "operator"
                  return (
                    <Card key={employee.id} className="overflow-hidden">
                      <CardContent className="p-0">
                        <div className="border-b border-border bg-muted/30 px-4 py-3 flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="font-semibold text-foreground truncate">
                              {employee.fullName}
                            </h3>
                            {employee.position ? (
                              <p className="text-sm text-muted-foreground truncate">
                                {employee.position}
                              </p>
                            ) : null}
                          </div>
                          <Badge className={statusBadgeClass(employee.status)}>
                            {STATUS_LABELS[employee.status]}
                          </Badge>
                        </div>
                        <div className="space-y-2 px-4 py-3 text-sm">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Hash className="h-3.5 w-3.5 shrink-0" />
                            <span className="font-mono truncate">
                              {employee.employeeCode ?? "Sin código"}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Briefcase className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <Badge variant="secondary" className="font-normal">
                              Primordial: {EMPLOYEE_PRODUCTION_ROLE_LABELS[role]}
                            </Badge>
                          </div>
                          {role === "operator" && employee.secondaryRole ? (
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="font-normal">
                                Secundario: {EMPLOYEE_SECONDARY_ROLE_LABELS[employee.secondaryRole]}
                              </Badge>
                            </div>
                          ) : null}
                          {employee.hiredAt ? (
                            <p className="text-xs text-muted-foreground">
                              Ingreso: {employee.hiredAt}
                            </p>
                          ) : null}
                          {employee.email ? (
                            <div className="flex items-center gap-2 text-muted-foreground truncate">
                              <Mail className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{employee.email}</span>
                            </div>
                          ) : null}
                          {employee.phone ? (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Phone className="h-3.5 w-3.5 shrink-0" />
                              <span>{employee.phone}</span>
                            </div>
                          ) : null}
                        </div>
                        <div className="flex border-t border-border">
                          <Button
                            variant="ghost"
                            className="flex-1 rounded-none gap-1.5 h-10"
                            onClick={() => openEditEmployee(employee)}
                          >
                            <Pencil className="h-4 w-4" />
                            Editar
                          </Button>
                          <Button
                            variant="ghost"
                            className="flex-1 rounded-none gap-1.5 h-10 text-destructive hover:text-destructive hover:bg-destructive/10 border-l border-border"
                            onClick={() => handleDeleteEmployee(employee)}
                          >
                            <Trash2 className="h-4 w-4" />
                            Eliminar
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="attendance" className="space-y-4">
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Vacaciones e incapacidad</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Registra vacaciones (V) e incapacidad (INCAP) por empleado y día. También puedes
                      registrar incidencias (INC), permisos sin goce (PSG) y tiempo por tiempo (TXT).
                      La falta (F) se calcula automáticamente en el reporte de bono.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      type="month"
                      value={attendanceMonth}
                      onChange={(e) => setAttendanceMonth(e.target.value)}
                      className="w-[180px]"
                    />
                    <Button
                      variant="outline"
                      className="gap-2"
                      onClick={() => {
                        setNewDayRecord({
                          employeeId: "",
                          recordDate: "",
                          shift: "",
                          recordType: "vacation",
                          notes: "",
                        })
                        setIsAttendanceDialogOpen(true)
                      }}
                    >
                      <Plus className="h-4 w-4" />
                      Registrar vacación
                    </Button>
                    <Button
                      variant="outline"
                      className="gap-2"
                      onClick={() => {
                        setNewDayRecord({
                          employeeId: "",
                          recordDate: "",
                          shift: "",
                          recordType: "incapacity",
                          notes: "",
                        })
                        setIsAttendanceDialogOpen(true)
                      }}
                    >
                      <Plus className="h-4 w-4" />
                      Registrar incapacidad
                    </Button>
                  </div>
                </div>

                {dayRecordsError && (
                  <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                    {dayRecordsError}
                  </div>
                )}

                {dayRecordsLoading ? (
                  <p className="text-sm text-muted-foreground py-4">Cargando registros…</p>
                ) : dayRecords.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center border border-dashed rounded-lg">
                    No hay registros para este mes.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                          <th className="px-4 py-2.5 font-medium">Fecha</th>
                          <th className="px-4 py-2.5 font-medium">Empleado</th>
                          <th className="px-4 py-2.5 font-medium">Turno</th>
                          <th className="px-4 py-2.5 font-medium">Tipo</th>
                          <th className="px-4 py-2.5 font-medium">Notas</th>
                          <th className="px-4 py-2.5 font-medium text-right"> </th>
                        </tr>
                      </thead>
                      <tbody>
                        {dayRecords.map((record) => (
                          <tr key={record.id} className="border-b border-border last:border-0">
                            <td className="px-4 py-2.5 font-mono">{record.recordDate}</td>
                            <td className="px-4 py-2.5">{record.employeeName}</td>
                            <td className="px-4 py-2.5 text-muted-foreground">
                              {record.shift === "matutino"
                                ? "Matutino"
                                : record.shift === "vespertino"
                                  ? "Vespertino"
                                  : "Ambos"}
                            </td>
                            <td className="px-4 py-2.5">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "font-normal",
                                  record.recordType === "vacation" && "border-green-200 text-green-700",
                                  record.recordType === "incapacity" && "border-purple-200 text-purple-800",
                                  record.recordType === "incident" && "border-amber-200 text-amber-800",
                                )}
                              >
                                {RECORD_TYPE_LABELS[record.recordType]}
                              </Badge>
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground max-w-[200px] truncate">
                              {record.notes ?? "—"}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                onClick={() => handleDeleteDayRecord(record.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="roles" className="space-y-4">
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Eventos de cambio de rol secundario</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Solo para operadores: registra cuando cubren empaque, roller, bending o auxiliar.
                      El rol primordial no cambia; los reportes de bono usan el rol secundario del día.
                      En secciones que no correspondan aparece{" "}
                      <span className="font-semibold text-red-600">n/a</span>.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      type="month"
                      value={attendanceMonth}
                      onChange={(e) => setAttendanceMonth(e.target.value)}
                      className="w-[180px]"
                    />
                    <Button
                      variant="outline"
                      className="gap-2"
                      onClick={() => setIsRoleEventDialogOpen(true)}
                    >
                      <Plus className="h-4 w-4" />
                      Registrar cambio
                    </Button>
                  </div>
                </div>

                {roleEventsError && (
                  <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                    {roleEventsError}
                  </div>
                )}

                {roleEventsLoading ? (
                  <p className="text-sm text-muted-foreground py-4">Cargando eventos…</p>
                ) : roleEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center border border-dashed rounded-lg">
                    No hay cambios de rol para este mes.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                          <th className="px-4 py-2.5 font-medium">Fecha</th>
                          <th className="px-4 py-2.5 font-medium">Empleado</th>
                          <th className="px-4 py-2.5 font-medium">Turno</th>
                          <th className="px-4 py-2.5 font-medium">Rol secundario</th>
                          <th className="px-4 py-2.5 font-medium">Notas</th>
                          <th className="px-4 py-2.5 font-medium text-right"> </th>
                        </tr>
                      </thead>
                      <tbody>
                        {roleEvents.map((record) => (
                          <tr key={record.id} className="border-b border-border last:border-0">
                            <td className="px-4 py-2.5 font-mono">{record.recordDate}</td>
                            <td className="px-4 py-2.5">{record.employeeName}</td>
                            <td className="px-4 py-2.5 text-muted-foreground">
                              {record.shift === "matutino"
                                ? "Matutino"
                                : record.shift === "vespertino"
                                  ? "Vespertino"
                                  : "Ambos"}
                            </td>
                            <td className="px-4 py-2.5">
                              <Badge variant="secondary" className="font-normal">
                                {EMPLOYEE_SECONDARY_ROLE_LABELS[record.secondaryRole]}
                              </Badge>
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground max-w-[200px] truncate">
                              {record.notes ?? "—"}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                onClick={() => handleDeleteRoleEvent(record.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Crear / editar empleado */}
      <Dialog
        open={isEmployeeDialogOpen}
        onOpenChange={(open) => {
          setIsEmployeeDialogOpen(open)
          if (!open) {
            setEditingEmployee(null)
            setEmployeeForm(EMPTY_EMPLOYEE_FORM)
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingEmployee ? "Editar empleado" : "Agregar empleado"}
            </DialogTitle>
            <DialogDescription>
              {editingEmployee
                ? "Actualiza los datos del empleado. Rol primordial y secundario alimentan el reporte de bono."
                : "Registra un nuevo empleado en el directorio."}
            </DialogDescription>
          </DialogHeader>
          <EmployeeFormFields
            form={employeeForm}
            onChange={setEmployeeForm}
            idPrefix={editingEmployee ? "edit" : "new"}
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsEmployeeDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveEmployee}
              disabled={savingEmployee || !employeeForm.fullName.trim()}
            >
              {savingEmployee
                ? "Guardando…"
                : editingEmployee
                  ? "Guardar cambios"
                  : "Agregar empleado"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Registrar ausencia */}
      <Dialog open={isAttendanceDialogOpen} onOpenChange={setIsAttendanceDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {newDayRecord.recordType === "incapacity"
                ? "Registrar incapacidad"
                : newDayRecord.recordType === "vacation"
                  ? "Registrar vacaciones"
                  : "Registrar ausencia o permiso"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Empleado</Label>
              <Select
                value={newDayRecord.employeeId}
                onValueChange={(v) => setNewDayRecord({ ...newDayRecord, employeeId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar…" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.fullName}
                      {emp.employeeCode ? ` (${emp.employeeCode})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fecha</Label>
              <Input
                type="date"
                value={newDayRecord.recordDate}
                onChange={(e) =>
                  setNewDayRecord({ ...newDayRecord, recordDate: e.target.value })
                }
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Turno (opcional)</Label>
                <Select
                  value={newDayRecord.shift || "both"}
                  onValueChange={(v) =>
                    setNewDayRecord({
                      ...newDayRecord,
                      shift: v === "both" ? "" : (v as "matutino" | "vespertino"),
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">Ambos turnos</SelectItem>
                    <SelectItem value="matutino">Matutino</SelectItem>
                    <SelectItem value="vespertino">Vespertino</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select
                  value={newDayRecord.recordType}
                  onValueChange={(v) =>
                    setNewDayRecord({
                      ...newDayRecord,
                      recordType: v as ApiEmployeeDayRecordType,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vacation">Vacaciones (V)</SelectItem>
                    <SelectItem value="incapacity">Incapacidad (INCAP)</SelectItem>
                    <SelectItem value="incident">Incidencia (INC)</SelectItem>
                    <SelectItem value="excused_unpaid">Permiso sin goce (PSG)</SelectItem>
                    <SelectItem value="time_exchange">Tiempo por tiempo (TXT)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notas (opcional)</Label>
              <Input
                value={newDayRecord.notes}
                onChange={(e) => setNewDayRecord({ ...newDayRecord, notes: e.target.value })}
                placeholder="Detalle breve"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleAddDayRecord} className="w-full sm:w-auto">
              Guardar registro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cambio de rol secundario */}
      <Dialog open={isRoleEventDialogOpen} onOpenChange={setIsRoleEventDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cambio de rol secundario</DialogTitle>
            <DialogDescription>
              Solo operadores. El rol primordial permanece; este evento define el rol secundario del
              día para reportes de bono.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Operador</Label>
              <Select
                value={newRoleEvent.employeeId}
                onValueChange={(v) => setNewRoleEvent({ ...newRoleEvent, employeeId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar…" />
                </SelectTrigger>
                <SelectContent>
                  {operatorEmployees.length === 0 ? (
                    <SelectItem value="__none" disabled>
                      No hay operadores registrados
                    </SelectItem>
                  ) : (
                    operatorEmployees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.fullName}
                        {emp.employeeCode ? ` (${emp.employeeCode})` : ""}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Fecha</Label>
                <Input
                  type="date"
                  value={newRoleEvent.recordDate}
                  onChange={(e) =>
                    setNewRoleEvent({ ...newRoleEvent, recordDate: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Turno</Label>
                <Select
                  value={newRoleEvent.shift || "both"}
                  onValueChange={(v) =>
                    setNewRoleEvent({
                      ...newRoleEvent,
                      shift: v === "both" ? "" : (v as "matutino" | "vespertino"),
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">Ambos turnos</SelectItem>
                    <SelectItem value="matutino">Matutino</SelectItem>
                    <SelectItem value="vespertino">Vespertino</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Rol secundario del día</Label>
              <Select
                value={newRoleEvent.secondaryRole}
                onValueChange={(v) =>
                  setNewRoleEvent({
                    ...newRoleEvent,
                    secondaryRole: v as ApiEmployeeSecondaryRole,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SECONDARY_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {EMPLOYEE_SECONDARY_ROLE_LABELS[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notas (opcional)</Label>
              <Input
                value={newRoleEvent.notes}
                onChange={(e) => setNewRoleEvent({ ...newRoleEvent, notes: e.target.value })}
                placeholder="Ej. Cubre empaque por ausencia"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleAddRoleEvent} className="w-full sm:w-auto">
              Guardar cambio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
