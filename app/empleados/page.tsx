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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Textarea } from "@/components/ui/textarea"
import {
  Users,
  Plus,
  Trash2,
  CalendarDays,
  Briefcase,
  Pencil,
  Search,
  Hash,
  Palmtree,
  Scale,
  AlertTriangle,
  Timer,
  ChevronDown,
  Gift,
  IdCard,
  Bus,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/auth-context"
import { RequireModule } from "@/components/auth/require-module"
import { visibleEmpleadosTabs } from "@/lib/permissions"
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
  isEmployeeProductionRole,
  PRIMARY_ROLES,
  SECONDARY_ROLES,
  type EmployeeProductionRole,
  type EmployeeSecondaryRole,
} from "@/lib/employee-production-role"
import {
  buildAllEmployeeVacationBalances,
  buildEmployeeVacationBalance,
  LFT_VACATION_POLICY_SUMMARY,
  LFT_VACATION_TABLE_ROWS,
  type EmployeeVacationBalance,
} from "@/lib/mexico-vacation-law"
import {
  buildAllEmployeeDespensaBenefits,
  DESPENSA_POLICY_SUMMARY,
  DESPENSA_VOUCHER_TABLE_ROWS,
  formatDespensaMxn,
} from "@/lib/mexico-despensa-vouchers"
import { localTodayYmdMexico } from "@/lib/employee-role-day"
import { EmployeeDowntimeTab } from "./employee-downtime-tab"
import { EmployeeTransportTab } from "./employee-transport-tab"
import {
  earliestAllowedVacationDate,
  VACATION_MIN_ADVANCE_DAYS,
  VACATION_RETROACTIVE_BLOCK_DAYS,
  validateVacationRecordDate,
  vacationDateBlockedMessage,
  expandInclusiveDateRange,
} from "@/lib/vacation-policy"
import {
  INCAPACITY_REGISTRATION_WINDOW_HOURS,
  incapacityDateBounds,
  validateIncapacityRecordDate,
  incapacityDateBlockedMessage,
} from "@/lib/incapacity-policy"

const RECORD_TYPE_LABELS: Record<ApiEmployeeDayRecordType, string> = {
  vacation: "Vacaciones (V)",
  incapacity: "Incapacidad (INCAP)",
  incident: "Incidencia (INC)",
  excused_unpaid: "Permiso sin goce (PSG)",
  time_exchange: "Tiempo por tiempo (TXT)",
}

function usesDayRecordDateRange(recordType: ApiEmployeeDayRecordType): boolean {
  return recordType === "vacation" || recordType === "incapacity"
}

const STATUS_LABELS: Record<ApiEmployeeStatus, string> = {
  active: "Activo",
  inactive: "Inactivo",
  terminated: "Baja",
}

const VACATION_STATUS_LABELS: Record<EmployeeVacationBalance["status"], string> = {
  no_hire_date: "Sin fecha de ingreso",
  not_yet_vested: "Aún no cumple 1 año",
  ok: "En periodo",
  expiring_soon: "Vence pronto",
  exceeded: "Supera el tope legal",
  unused_after_period: "Días sin tomar (periodo vencido)",
}

function vacationRecordsFetchFrom(employees: ApiEmployee[]): string {
  const now = new Date()
  let minYear = now.getFullYear() - 2
  for (const e of employees) {
    const hired = e.hiredAt?.slice(0, 10)
    if (!hired) continue
    const y = Number(hired.slice(0, 4))
    if (Number.isFinite(y) && y < minYear) minYear = y
  }
  return `${minYear}-01-01`
}

type EmployeeFormState = {
  fullName: string
  nfcCardUid: string
  rfc: string
  imss: string
  position: string
  primaryRole: EmployeeProductionRole
  secondaryRole: EmployeeSecondaryRole | ""
  /** Turno asignado: "" = sin asignar, "1" = matutino, "2" = vespertino. */
  shift: "" | "1" | "2"
  hiredAt: string
}

const EMPTY_EMPLOYEE_FORM: EmployeeFormState = {
  fullName: "",
  nfcCardUid: "",
  rfc: "",
  imss: "",
  position: "",
  primaryRole: "operator",
  secondaryRole: "",
  shift: "",
  hiredAt: "",
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
  const fromApi = employee.primaryRole
  const primaryRole: EmployeeProductionRole =
    fromApi && isEmployeeProductionRole(fromApi)
      ? fromApi
      : (inferProductionRoleFromPosition(employee.position) ?? "operator")
  return {
    fullName: employee.fullName,
    nfcCardUid: employee.nfcCardUid ?? "",
    rfc: employee.rfc ?? "",
    imss: employee.imss ?? "",
    position: employee.position ?? "",
    primaryRole,
    secondaryRole: employee.secondaryRole ?? "",
    shift: employee.shift === 1 ? "1" : employee.shift === 2 ? "2" : "",
    hiredAt: employee.hiredAt ?? "",
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
        {form.primaryRole === "maintenance" ? (
          <p className="text-xs text-muted-foreground">
            Con rol Mantenimiento, el tap en la máquina abre/cierra una sesión azul: la producción de
            prueba no cuenta para operadores ni empacadores.
          </p>
        ) : null}
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
        <p className="text-xs text-muted-foreground">
          Necesaria para calcular vacaciones LFT y vales de despensa según antigüedad.
        </p>
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
      <div className="space-y-2">
        <Label>Turno asignado</Label>
        <Select
          value={form.shift || "none"}
          onValueChange={(v) =>
            onChange({ ...form, shift: v === "none" ? "" : (v as "1" | "2") })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Sin turno asignado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sin turno asignado</SelectItem>
            <SelectItem value="1">Turno 1 (Matutino)</SelectItem>
            <SelectItem value="2">Turno 2 (Vespertino)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Turno en cuya gráfica del inicio cuenta su producción.
        </p>
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
        <Label htmlFor={`${idPrefix}-rfc`}>RFC</Label>
        <Input
          id={`${idPrefix}-rfc`}
          value={form.rfc}
          onChange={(e) => onChange({ ...form, rfc: e.target.value.toUpperCase() })}
          placeholder="Ej: PERJ800101ABC"
          maxLength={13}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-imss`}>IMSS (NSS)</Label>
        <Input
          id={`${idPrefix}-imss`}
          value={form.imss}
          onChange={(e) => onChange({ ...form, imss: e.target.value.replace(/\D/g, "").slice(0, 11) })}
          placeholder="11 dígitos"
          inputMode="numeric"
          maxLength={11}
        />
      </div>
    </div>
  )
}

export default function EmployeesPage() {
  const { user, getAccessToken } = useAuth()
  const allowedTabs = useMemo(() => visibleEmpleadosTabs(user), [user])
  const [employeeTab, setEmployeeTab] = useState("employees")

  useEffect(() => {
    if (allowedTabs.length > 0 && !allowedTabs.includes(employeeTab)) {
      setEmployeeTab(allowedTabs[0]!)
    }
  }, [allowedTabs, employeeTab])
  const [employees, setEmployees] = useState<ApiEmployee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  const [isEmployeeDialogOpen, setIsEmployeeDialogOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<ApiEmployee | null>(null)
  const [employeeForm, setEmployeeForm] = useState<EmployeeFormState>(EMPTY_EMPLOYEE_FORM)
  const [savingEmployee, setSavingEmployee] = useState(false)

  const [attendanceMonth, setAttendanceMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  })
  const [dayRecords, setDayRecords] = useState<ApiEmployeeDayRecord[]>([])
  const [vacationBalanceRecords, setVacationBalanceRecords] = useState<ApiEmployeeDayRecord[]>([])
  const [dayRecordsLoading, setDayRecordsLoading] = useState(false)
  const [dayRecordsError, setDayRecordsError] = useState<string | null>(null)
  const [isAttendanceDialogOpen, setIsAttendanceDialogOpen] = useState(false)
  const [dayRecordSaveError, setDayRecordSaveError] = useState<string | null>(null)
  const [savingDayRecords, setSavingDayRecords] = useState(false)
  const [newDayRecord, setNewDayRecord] = useState({
    employeeId: "",
    recordDate: "",
    recordDateEnd: "",
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
    const loadVacationBalances = async () => {
      try {
        const token = await getAccessToken()
        if (!token || employees.length === 0) {
          if (!cancelled) setVacationBalanceRecords([])
          return
        }
        const to = new Date().toISOString().slice(0, 10)
        const from = vacationRecordsFetchFrom(employees)
        const rows = await getEmployeeDayRecords(token, {
          from,
          to,
          limit: 10_000,
        }).catch(() => [] as ApiEmployeeDayRecord[])
        if (!cancelled) setVacationBalanceRecords(rows)
      } catch {
        if (!cancelled) setVacationBalanceRecords([])
      }
    }
    loadVacationBalances()
    return () => {
      cancelled = true
    }
  }, [getAccessToken, employees])

  const vacationBalances = useMemo(
    () => buildAllEmployeeVacationBalances(employees, vacationBalanceRecords),
    [employees, vacationBalanceRecords],
  )

  const despensaBenefits = useMemo(
    () => buildAllEmployeeDespensaBenefits(employees),
    [employees],
  )

  const selectedVacationBalance = useMemo(() => {
    if (!newDayRecord.employeeId || newDayRecord.recordType !== "vacation") return null
    const emp = employees.find((e) => e.id === newDayRecord.employeeId)
    if (!emp) return null
    return buildEmployeeVacationBalance(emp, vacationBalanceRecords)
  }, [newDayRecord.employeeId, newDayRecord.recordType, employees, vacationBalanceRecords])

  const pendingDayRecordDates = useMemo(() => {
    if (!usesDayRecordDateRange(newDayRecord.recordType)) {
      return newDayRecord.recordDate ? [newDayRecord.recordDate] : []
    }
    return expandInclusiveDateRange(newDayRecord.recordDate, newDayRecord.recordDateEnd)
  }, [newDayRecord.recordDate, newDayRecord.recordDateEnd, newDayRecord.recordType])

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
    const withShift = employees.filter((e) => e.shift === 1 || e.shift === 2).length
    return { total: employees.length, withShift }
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
      if (!q) return true
      const haystack = [
        e.fullName,
        e.nfcCardUid,
        e.position,
        e.rfc,
        e.imss,
        e.primaryRole ? EMPLOYEE_PRODUCTION_ROLE_LABELS[e.primaryRole] : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [employees, searchQuery])

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
        rfc: employeeForm.rfc.trim() || null,
        imss: employeeForm.imss.trim() || null,
        position: employeeForm.position.trim() || null,
        primaryRole: employeeForm.primaryRole,
        secondaryRole:
          employeeForm.primaryRole === "operator" && employeeForm.secondaryRole
            ? employeeForm.secondaryRole
            : null,
        shift: employeeForm.shift ? Number(employeeForm.shift) : null,
        hiredAt: employeeForm.hiredAt.trim() || null,
      }

      if (editingEmployee) {
        await updateEmployee(token, editingEmployee.id, payload)
      } else {
        await createEmployee(token, payload)
      }
      // Re-fetch de la lista: refleja la normalización del backend (NFC, employee_code interno
      // auto-derivado, etc.) y evita que las tarjetas queden con datos stale tras editar.
      const fresh = await getEmployees(token)
      setEmployees(fresh)

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

  const openDayRecordDialog = (recordType: ApiEmployeeDayRecordType) => {
    setDayRecordSaveError(null)
    const incapBounds = incapacityDateBounds()
    setNewDayRecord({
      employeeId: "",
      recordDate:
        recordType === "incapacity"
          ? incapBounds.min
          : recordType === "vacation"
            ? earliestAllowedVacationDate()
            : "",
      recordDateEnd:
        recordType === "incapacity"
          ? incapBounds.max
          : recordType === "vacation"
            ? earliestAllowedVacationDate()
            : "",
      shift: "",
      recordType,
      notes: "",
    })
    setIsAttendanceDialogOpen(true)
  }

  const mergeCreatedDayRecord = (created: ApiEmployeeDayRecord) => {
    const merge = (prev: ApiEmployeeDayRecord[]) => {
      const filtered = prev.filter(
        (r) =>
          !(
            r.employeeId === created.employeeId &&
            r.recordDate === created.recordDate &&
            (r.shift ?? null) === (created.shift ?? null)
          ),
      )
      return [created, ...filtered]
    }
    setDayRecords(merge)
    setVacationBalanceRecords(merge)
  }

  const handleAddDayRecord = async () => {
    if (!newDayRecord.employeeId) return

    const dates = usesDayRecordDateRange(newDayRecord.recordType)
      ? expandInclusiveDateRange(newDayRecord.recordDate, newDayRecord.recordDateEnd)
      : newDayRecord.recordDate
        ? [newDayRecord.recordDate]
        : []

    if (dates.length === 0) {
      setDayRecordSaveError("Indica al menos una fecha válida.")
      return
    }

    if (newDayRecord.recordType === "incident" && !newDayRecord.notes.trim()) {
      setDayRecordSaveError("La justificación de falta requiere una nota con el motivo.")
      return
    }

    if (newDayRecord.recordType === "vacation") {
      const invalid = dates.filter((d) => {
        try {
          validateVacationRecordDate(d)
          return false
        } catch {
          return true
        }
      })
      if (invalid.length > 0) {
        setDayRecordSaveError(
          invalid.length === 1
            ? vacationDateBlockedMessage(invalid[0])
            : `${invalid.length} fechas no cumplen la política de vacaciones (mín. ${VACATION_MIN_ADVANCE_DAYS} días de anticipación). Primera inválida: ${invalid[0]}.`,
        )
        return
      }
    }

    if (newDayRecord.recordType === "incapacity") {
      const invalid = dates.filter((d) => {
        try {
          validateIncapacityRecordDate(d)
          return false
        } catch {
          return true
        }
      })
      if (invalid.length > 0) {
        setDayRecordSaveError(
          invalid.length === 1
            ? incapacityDateBlockedMessage(invalid[0])
            : `${invalid.length} fechas ya no están en la ventana de ${INCAPACITY_REGISTRATION_WINDOW_HOURS} h. Primera inválida: ${invalid[0]}.`,
        )
        return
      }
    }

    const token = await getAccessToken()
    if (!token) return

    setDayRecordSaveError(null)
    setSavingDayRecords(true)
    try {
      const notes = newDayRecord.notes.trim() || null
      const shift = newDayRecord.shift || null
      let createdCount = 0

      for (const recordDate of dates) {
        const created = await createEmployeeDayRecord(token, {
          employeeId: newDayRecord.employeeId,
          recordDate,
          shift,
          recordType: newDayRecord.recordType,
          notes,
        })
        mergeCreatedDayRecord(created)
        createdCount += 1
      }

      setNewDayRecord({
        employeeId: "",
        recordDate: "",
        recordDateEnd: "",
        shift: "",
        recordType: "vacation",
        notes: "",
      })
      setIsAttendanceDialogOpen(false)
      if (createdCount > 1) {
        setDayRecordSaveError(null)
      }
    } catch (e) {
      const msg =
        e && typeof e === "object" && "message" in e
          ? String((e as { message: string }).message)
          : e instanceof Error
            ? e.message
            : "No se pudo guardar el registro"
      setDayRecordSaveError(msg)
    } finally {
      setSavingDayRecords(false)
    }
  }

  const handleDeleteDayRecord = async (id: string) => {
    const token = await getAccessToken()
    if (!token) return
    await deleteEmployeeDayRecord(token, id)
    setDayRecords((prev) => prev.filter((r) => r.id !== id))
    setVacationBalanceRecords((prev) => prev.filter((r) => r.id !== id))
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
    const todayMx = localTodayYmdMexico()
    if (created.recordDate === todayMx) {
      setEmployees((prev) =>
        prev.map((e) =>
          e.id === created.employeeId ? { ...e, secondaryRole: created.secondaryRole } : e,
        ),
      )
    }
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
    const removed = roleEvents.find((r) => r.id === id)
    await deleteEmployeeRoleEvent(token, id)
    setRoleEvents((prev) => prev.filter((r) => r.id !== id))
    if (removed?.recordDate === localTodayYmdMexico()) {
      const rows = await getEmployees(token)
      setEmployees(rows)
    }
  }

  return (
    <RequireModule
      modules={[
        "empleados_asignar_tarjetas",
        "empleados_transporte",
        "empleados_paros_vacaciones_rol_secundario",
        "metricas_asistencia_rotacion_bono",
      ]}
    >
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

        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs font-medium uppercase text-muted-foreground">Total</p>
              <p className="text-2xl font-bold text-primary">{stats.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs font-medium uppercase text-muted-foreground">Operadores</p>
              <p className="text-2xl font-bold text-foreground">{operatorEmployees.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs font-medium uppercase text-muted-foreground">Con turno asignado</p>
              <p className="text-2xl font-bold text-foreground">{stats.withShift}</p>
            </CardContent>
          </Card>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
            {error}
          </div>
        )}

        <Tabs value={employeeTab} onValueChange={setEmployeeTab} className="space-y-4">
          <TabsList className="grid w-full max-w-4xl grid-cols-2 sm:grid-cols-5">
            {allowedTabs.includes("employees") && (
            <TabsTrigger value="employees" className="gap-1.5">
              <Users className="h-4 w-4" />
              Empleados
            </TabsTrigger>
            )}
            {allowedTabs.includes("transport") && (
            <TabsTrigger value="transport" className="gap-1.5">
              <Bus className="h-4 w-4" />
              Transporte
            </TabsTrigger>
            )}
            {allowedTabs.includes("downtime") && (
            <TabsTrigger value="downtime" className="gap-1.5">
              <Timer className="h-4 w-4" />
              Paros
            </TabsTrigger>
            )}
            {allowedTabs.includes("attendance") && (
            <TabsTrigger value="attendance" className="gap-1.5">
              <CalendarDays className="h-4 w-4" />
              Vacaciones y asistencia
            </TabsTrigger>
            )}
            {allowedTabs.includes("roles") && (
            <TabsTrigger value="roles" className="gap-1.5">
              <Briefcase className="h-4 w-4" />
              Cambio rol secundario
            </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="employees" className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Buscar por nombre, NFC, puesto…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
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
                          {employee.shift === 1 || employee.shift === 2 ? (
                            <Badge variant="outline" className="font-normal shrink-0">
                              {employee.shift === 1 ? "Turno 1" : "Turno 2"}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="space-y-2 px-4 py-3 text-sm">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Hash className="h-3.5 w-3.5 shrink-0" />
                            <span className="font-mono truncate">
                              {employee.nfcCardUid ? `NFC: ${employee.nfcCardUid}` : "Sin tarjeta NFC"}
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
                          {employee.rfc ? (
                            <div className="flex items-center gap-2 text-muted-foreground truncate">
                              <IdCard className="h-3.5 w-3.5 shrink-0" />
                              <span className="font-mono truncate">RFC: {employee.rfc}</span>
                            </div>
                          ) : null}
                          {employee.imss ? (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Hash className="h-3.5 w-3.5 shrink-0" />
                              <span className="font-mono">IMSS: {employee.imss}</span>
                            </div>
                          ) : null}
                          {employee.localTransportSupport ? (
                            <Badge variant="outline" className="border-sky-200 text-sky-800 font-normal">
                              <Bus className="mr-1 h-3 w-3" />
                              Apoyo transporte (local)
                            </Badge>
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

          <TabsContent value="transport">
            <EmployeeTransportTab
              employees={employees}
              onEmployeesChange={setEmployees}
            />
          </TabsContent>

          <TabsContent value="downtime">
            <EmployeeDowntimeTab employees={employees} />
          </TabsContent>

          <TabsContent value="attendance" className="space-y-4">
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-start gap-3">
                  <Scale className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div className="space-y-2">
                    <h2 className="text-lg font-semibold text-foreground">
                      Vacaciones según la Ley Federal del Trabajo (México)
                    </h2>
                    <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
                      {LFT_VACATION_POLICY_SUMMARY.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="overflow-x-auto rounded-lg border border-border bg-background">
                  <table className="w-full min-w-[320px] text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Antigüedad</th>
                        <th className="px-3 py-2 font-medium text-right">Días mínimos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {LFT_VACATION_TABLE_ROWS.map((row) => (
                        <tr key={row.yearsLabel} className="border-b border-border last:border-0">
                          <td className="px-3 py-2">{row.yearsLabel}</td>
                          <td className="px-3 py-2 text-right font-medium tabular-nums">
                            {row.days}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground">
                  El periodo para disfrutar los días del ciclo actual es de{" "}
                  <strong>12 meses</strong> contados desde el aniversario laboral. Registra la fecha
                  de ingreso en cada empleado para calcular el saldo automáticamente.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Palmtree className="h-5 w-5 text-green-600" />
                  <h2 className="text-lg font-semibold">Saldo de vacaciones por empleado</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  Periodo vigente = 12 meses desde el último aniversario.{" "}
                  <strong>Tomados</strong> = días registrados como vacación en ese periodo.
                </p>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[880px] text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                        <th className="px-3 py-2.5 font-medium">Empleado</th>
                        <th className="px-3 py-2.5 font-medium text-right">Antigüedad</th>
                        <th className="px-3 py-2.5 font-medium text-right">Corresponden</th>
                        <th className="px-3 py-2.5 font-medium text-right">Tomados</th>
                        <th className="px-3 py-2.5 font-medium text-right">Pendientes</th>
                        <th className="px-3 py-2.5 font-medium">Periodo para tomarlas</th>
                        <th className="px-3 py-2.5 font-medium">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vacationBalances.map((row) => (
                        <tr key={row.employeeId} className="border-b border-border last:border-0">
                          <td className="px-3 py-2.5 font-medium">
                            {row.employeeName}
                            {row.employeeCode ? (
                              <span className="ml-1 text-xs text-muted-foreground">
                                ({row.employeeCode})
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                            {row.status === "not_yet_vested"
                              ? row.nextVestingDate
                                ? `Cumple 1 año el ${row.nextVestingDate}`
                                : "—"
                              : row.completedYears > 0
                                ? `${row.completedYears} año${row.completedYears === 1 ? "" : "s"}`
                                : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                            {row.entitledDays > 0 ? row.entitledDays : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {row.entitledDays > 0 ? row.usedDays : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                            {row.entitledDays > 0 ? row.remainingDays : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground text-xs">
                            {row.periodStart && row.periodEnd ? (
                              <>
                                {row.periodStart} — {row.periodEnd}
                                {row.daysUntilPeriodEnd != null && row.remainingDays > 0 ? (
                                  <span className="block text-foreground">
                                    Quedan {row.daysUntilPeriodEnd} día
                                    {row.daysUntilPeriodEnd === 1 ? "" : "s"} del periodo
                                  </span>
                                ) : null}
                              </>
                            ) : row.nextVestingDate ? (
                              <>Derecho a partir del {row.nextVestingDate}</>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <Badge
                              variant="outline"
                              className={cn(
                                "font-normal whitespace-nowrap",
                                row.status === "ok" && "border-green-200 text-green-700",
                                row.status === "expiring_soon" &&
                                  "border-amber-200 text-amber-800",
                                (row.status === "exceeded" ||
                                  row.status === "unused_after_period") &&
                                  "border-red-200 text-red-700",
                                row.status === "no_hire_date" && "border-amber-200 text-amber-800",
                                row.status === "not_yet_vested" &&
                                  "border-slate-200 text-slate-600",
                              )}
                            >
                              {row.status === "expiring_soon" && (
                                <AlertTriangle className="mr-1 inline h-3 w-3" />
                              )}
                              {VACATION_STATUS_LABELS[row.status]}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card className="border-emerald-200/60 bg-emerald-50/40">
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-start gap-3">
                  <Gift className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                  <div className="space-y-2">
                    <h2 className="text-lg font-semibold text-foreground">Vales de despensa</h2>
                    <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
                      {DESPENSA_POLICY_SUMMARY.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="overflow-x-auto rounded-lg border border-border bg-background">
                  <table className="w-full min-w-[320px] text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Antigüedad</th>
                        <th className="px-3 py-2 font-medium text-right">Vale mensual</th>
                      </tr>
                    </thead>
                    <tbody>
                      {DESPENSA_VOUCHER_TABLE_ROWS.map((row) => (
                        <tr key={row.yearsLabel} className="border-b border-border last:border-0">
                          <td className="px-3 py-2">{row.yearsLabel}</td>
                          <td className="px-3 py-2 text-right font-medium tabular-nums">
                            {row.monthlyAmountMxn > 0
                              ? formatDespensaMxn(row.monthlyAmountMxn)
                              : "No aplica"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="overflow-x-auto rounded-lg border border-border bg-background">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                        <th className="px-3 py-2.5 font-medium">Empleado</th>
                        <th className="px-3 py-2.5 font-medium text-right">Antigüedad</th>
                        <th className="px-3 py-2.5 font-medium">Rango</th>
                        <th className="px-3 py-2.5 font-medium text-right">Vale mensual</th>
                      </tr>
                    </thead>
                    <tbody>
                      {despensaBenefits.map((row) => (
                        <tr key={row.employeeId} className="border-b border-border last:border-0">
                          <td className="px-3 py-2.5 font-medium">
                            {row.employeeName}
                            {row.employeeCode ? (
                              <span className="ml-1 text-xs text-muted-foreground">
                                ({row.employeeCode})
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                            {row.status === "not_yet_vested"
                              ? "Menos de 1 año"
                              : row.status === "no_hire_date"
                                ? "—"
                                : `${row.completedYears} año${row.completedYears === 1 ? "" : "s"}`}
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground">{row.tierLabel}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-emerald-800">
                            {row.monthlyAmountMxn > 0
                              ? formatDespensaMxn(row.monthlyAmountMxn)
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Vacaciones, incapacidad y asistencia</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Registra vacaciones, incapacidad, faltas justificadas y otros permisos. Los
                      registros se reflejan en la pestaña Asistencia de Métricas. Vacaciones: mínimo{" "}
                      {VACATION_MIN_ADVANCE_DAYS} días de anticipación. Incapacidad: solo dentro de{" "}
                      {INCAPACITY_REGISTRATION_WINDOW_HOURS} horas del día de la falta.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      type="month"
                      value={attendanceMonth}
                      onChange={(e) => setAttendanceMonth(e.target.value)}
                      className="w-[180px]"
                    />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button className="gap-2">
                          <Plus className="h-4 w-4" />
                          Registrar eventualidad
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-80">
                        <DropdownMenuItem onClick={() => openDayRecordDialog("vacation")}>
                          <div className="flex flex-col gap-0.5 py-0.5">
                            <span className="font-medium">Vacaciones (V)</span>
                            <span className="text-xs text-muted-foreground">
                              Mínimo {VACATION_MIN_ADVANCE_DAYS} días de anticipación
                            </span>
                          </div>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openDayRecordDialog("incapacity")}>
                          <div className="flex flex-col gap-0.5 py-0.5">
                            <span className="font-medium">Incapacidad (INCAP)</span>
                            <span className="text-xs text-muted-foreground">
                              Solo dentro de {INCAPACITY_REGISTRATION_WINDOW_HOURS} h del día de la falta
                            </span>
                          </div>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => openDayRecordDialog("incident")}>
                          <div className="flex flex-col gap-0.5 py-0.5">
                            <span className="font-medium">Justificar falta (INC)</span>
                            <span className="text-xs text-muted-foreground">
                              Nota obligatoria con el motivo
                            </span>
                          </div>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openDayRecordDialog("excused_unpaid")}>
                          <div className="flex flex-col gap-0.5 py-0.5">
                            <span className="font-medium">Permiso sin goce (PSG)</span>
                          </div>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openDayRecordDialog("time_exchange")}>
                          <div className="flex flex-col gap-0.5 py-0.5">
                            <span className="font-medium">Tiempo por tiempo (TXT)</span>
                          </div>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
                      Al cierre del turno (23:35) el rol secundario se quita automáticamente; al día
                      siguiente hay que registrar de nuevo si aplica. En secciones que no correspondan
                      aparece <span className="font-semibold text-red-600">n/a</span>.
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
      <Dialog
        open={isAttendanceDialogOpen}
        onOpenChange={(open) => {
          setIsAttendanceDialogOpen(open)
          if (!open) setDayRecordSaveError(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle>
                {newDayRecord.recordType === "incapacity"
                  ? "Registrar incapacidad"
                  : newDayRecord.recordType === "vacation"
                    ? "Registrar vacaciones"
                    : newDayRecord.recordType === "incident"
                      ? "Justificar falta"
                      : "Registrar eventualidad"}
              </DialogTitle>
              <Badge variant="outline" className="font-normal">
                {RECORD_TYPE_LABELS[newDayRecord.recordType]}
              </Badge>
            </div>
            {newDayRecord.recordType === "vacation" ? (
              <DialogDescription>
                Indica un rango de fechas (inicio y fin). Mínimo {VACATION_MIN_ADVANCE_DAYS} días de
                anticipación en cada día del rango. La fecha más próxima permitida es{" "}
                {earliestAllowedVacationDate()}.
              </DialogDescription>
            ) : newDayRecord.recordType === "incapacity" ? (
              <DialogDescription>
                Indica el rango de días de incapacidad. Cada día debe estar dentro de las{" "}
                {INCAPACITY_REGISTRATION_WINDOW_HOURS} horas siguientes a esa fecha (hoy o ayer si
                aplica).
              </DialogDescription>
            ) : newDayRecord.recordType === "incident" ? (
              <DialogDescription>
                Marca una falta como justificada. La nota es obligatoria y aparecerá en el reporte de
                asistencia.
              </DialogDescription>
            ) : null}
          </DialogHeader>
          <div className="space-y-4 py-2">
            {dayRecordSaveError ? (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                {dayRecordSaveError}
              </div>
            ) : null}
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
              {selectedVacationBalance && newDayRecord.recordType === "vacation" ? (
                <div
                  className={cn(
                    "rounded-lg border px-3 py-2 text-xs space-y-1",
                    selectedVacationBalance.status === "exceeded" ||
                      selectedVacationBalance.status === "unused_after_period"
                      ? "border-red-200 bg-red-50 text-red-800"
                      : selectedVacationBalance.status === "expiring_soon"
                        ? "border-amber-200 bg-amber-50 text-amber-900"
                        : "border-green-200 bg-green-50 text-green-800",
                  )}
                >
                  <p className="font-medium">Saldo LFT (periodo actual)</p>
                  {selectedVacationBalance.status === "no_hire_date" ? (
                    <p>
                      Agrega la fecha de ingreso del empleado para calcular sus días legales y el
                      periodo de 12 meses.
                    </p>
                  ) : selectedVacationBalance.status === "not_yet_vested" ? (
                    <p>
                      Aún no cumple 1 año. Tendrá derecho a 12 días mínimos a partir del{" "}
                      {selectedVacationBalance.nextVestingDate ?? "—"}.
                    </p>
                  ) : (
                    <>
                      <p>
                        Le corresponden <strong>{selectedVacationBalance.entitledDays}</strong>{" "}
                        días · Tomados: <strong>{selectedVacationBalance.usedDays}</strong> ·
                        Pendientes: <strong>{selectedVacationBalance.remainingDays}</strong>
                      </p>
                      <p>
                        Debe tomarlas entre {selectedVacationBalance.periodStart} y{" "}
                        {selectedVacationBalance.periodEnd} (12 meses desde el aniversario).
                      </p>
                    </>
                  )}
                </div>
              ) : null}
            </div>
            <div className="space-y-2">
              {usesDayRecordDateRange(newDayRecord.recordType) ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Fecha inicio</Label>
                      <Input
                        type="date"
                        value={newDayRecord.recordDate}
                        min={
                          newDayRecord.recordType === "vacation"
                            ? earliestAllowedVacationDate()
                            : incapacityDateBounds().min
                        }
                        max={
                          newDayRecord.recordType === "incapacity"
                            ? incapacityDateBounds().max
                            : undefined
                        }
                        onChange={(e) =>
                          setNewDayRecord({
                            ...newDayRecord,
                            recordDate: e.target.value,
                            recordDateEnd:
                              !newDayRecord.recordDateEnd ||
                              newDayRecord.recordDateEnd < e.target.value
                                ? e.target.value
                                : newDayRecord.recordDateEnd,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Fecha fin</Label>
                      <Input
                        type="date"
                        value={newDayRecord.recordDateEnd || newDayRecord.recordDate}
                        min={
                          newDayRecord.recordDate ||
                          (newDayRecord.recordType === "vacation"
                            ? earliestAllowedVacationDate()
                            : incapacityDateBounds().min)
                        }
                        max={
                          newDayRecord.recordType === "incapacity"
                            ? incapacityDateBounds().max
                            : undefined
                        }
                        onChange={(e) =>
                          setNewDayRecord({ ...newDayRecord, recordDateEnd: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  {pendingDayRecordDates.length > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Se registrarán{" "}
                      <strong className="text-foreground">{pendingDayRecordDates.length}</strong>{" "}
                      día{pendingDayRecordDates.length === 1 ? "" : "s"} (
                      {pendingDayRecordDates[0]}
                      {pendingDayRecordDates.length > 1
                        ? ` — ${pendingDayRecordDates[pendingDayRecordDates.length - 1]}`
                        : ""}
                      ).
                    </p>
                  ) : null}
                  {newDayRecord.recordType === "vacation" ? (
                    <p className="text-xs text-muted-foreground">
                      Bloqueado: últimos {VACATION_RETROACTIVE_BLOCK_DAYS} días y fechas con menos de{" "}
                      {VACATION_MIN_ADVANCE_DAYS} días de aviso.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Ventana por día: máx. {INCAPACITY_REGISTRATION_WINDOW_HOURS} h desde el inicio de
                      cada fecha ({incapacityDateBounds().min} — {incapacityDateBounds().max}).
                    </p>
                  )}
                </>
              ) : (
                <>
                  <Label>Fecha</Label>
                  <Input
                    type="date"
                    value={newDayRecord.recordDate}
                    onChange={(e) =>
                      setNewDayRecord({ ...newDayRecord, recordDate: e.target.value })
                    }
                  />
                </>
              )}
            </div>
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
              <Label>
                Notas
                {newDayRecord.recordType === "incident" ? (
                  <span className="text-destructive"> (obligatorio)</span>
                ) : (
                  " (opcional)"
                )}
              </Label>
              {newDayRecord.recordType === "incident" ? (
                <Textarea
                  value={newDayRecord.notes}
                  onChange={(e) => setNewDayRecord({ ...newDayRecord, notes: e.target.value })}
                  placeholder="Motivo de la justificación (ej. trámite personal autorizado, cita médica…)"
                  rows={3}
                />
              ) : (
                <Input
                  value={newDayRecord.notes}
                  onChange={(e) => setNewDayRecord({ ...newDayRecord, notes: e.target.value })}
                  placeholder="Detalle breve"
                />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleAddDayRecord}
              disabled={savingDayRecords}
              className="w-full sm:w-auto"
            >
              {savingDayRecords
                ? "Guardando…"
                : pendingDayRecordDates.length > 1
                  ? `Guardar ${pendingDayRecordDates.length} días`
                  : "Guardar registro"}
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
    </RequireModule>
  )
}
