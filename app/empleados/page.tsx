"use client"

import { useEffect, useMemo, useState } from "react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Users, Plus, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/contexts/auth-context"
import {
  createEmployee,
  deleteEmployee,
  getEmployees,
  type ApiEmployee,
  type ApiEmployeeStatus,
} from "@/lib/api"

type UiEmployee = ApiEmployee

export default function EmployeesPage() {
  const { user, getAccessToken } = useAuth()
  const [employees, setEmployees] = useState<UiEmployee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [newEmployee, setNewEmployee] = useState({
    fullName: "",
    employeeCode: "",
    email: "",
    phone: "",
    position: "",
    status: "active" as ApiEmployeeStatus,
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

  const handleAddEmployee = async () => {
    const fullName = newEmployee.fullName.trim()
    if (!fullName) return
    if (!user?.orgId) return

    const token = await getAccessToken()
    if (!token) return

    const created = await createEmployee(token, {
      orgId: user.orgId,
      fullName,
      employeeCode: newEmployee.employeeCode.trim() || null,
      email: newEmployee.email.trim() || null,
      phone: newEmployee.phone.trim() || null,
      position: newEmployee.position.trim() || null,
      status: newEmployee.status,
    })

    setEmployees((prev) => [created, ...prev])
    setNewEmployee({
      fullName: "",
      employeeCode: "",
      email: "",
      phone: "",
      position: "",
      status: "active",
    })
    setIsDialogOpen(false)
  }

  const handleDeleteEmployee = async (id: string) => {
    const token = await getAccessToken()
    if (!token) return
    await deleteEmployee(token, id)
    setEmployees((prev) => prev.filter((e) => e.id !== id))
  }

  const stats = useMemo(() => {
    const active = employees.filter((e) => e.status === "active").length
    const inactive = employees.filter((e) => e.status === "inactive").length
    const terminated = employees.filter((e) => e.status === "terminated").length
    return { active, inactive, terminated }
  }, [employees])

  return (
    <DashboardLayout
      breadcrumbs={[
        { label: "Dashboard", href: "/" },
        { label: "Gestión de empleados" },
      ]}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Gestión de Empleados</h1>
              <p className="text-muted-foreground">Administra los empleados del sistema</p>
            </div>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 bg-primary hover:bg-primary/90">
                <Plus className="h-4 w-4" />
                Agregar empleado
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Agregar nuevo empleado</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Nombre completo</Label>
                  <Input
                    id="fullName"
                    value={newEmployee.fullName}
                    onChange={(e) => setNewEmployee({ ...newEmployee, fullName: e.target.value })}
                    placeholder="Ej: Juan Pérez"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="employeeCode">Código (NFC / empleado)</Label>
                  <Input
                    id="employeeCode"
                    value={newEmployee.employeeCode}
                    onChange={(e) =>
                      setNewEmployee({ ...newEmployee, employeeCode: e.target.value })
                    }
                    placeholder="Ej: NFC-006 / OP-123"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="position">Puesto</Label>
                  <Input
                    id="position"
                    value={newEmployee.position}
                    onChange={(e) => setNewEmployee({ ...newEmployee, position: e.target.value })}
                    placeholder="Ej: Operador / Empacador / Supervisor"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email (opcional)</Label>
                  <Input
                    id="email"
                    value={newEmployee.email}
                    onChange={(e) => setNewEmployee({ ...newEmployee, email: e.target.value })}
                    placeholder="correo@empresa.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Teléfono (opcional)</Label>
                  <Input
                    id="phone"
                    value={newEmployee.phone}
                    onChange={(e) => setNewEmployee({ ...newEmployee, phone: e.target.value })}
                    placeholder="+52 ..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Estado</Label>
                  <select
                    id="status"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={newEmployee.status}
                    onChange={(e) =>
                      setNewEmployee({
                        ...newEmployee,
                        status: e.target.value as ApiEmployeeStatus,
                      })
                    }
                  >
                    <option value="active">Activo</option>
                    <option value="inactive">Inactivo</option>
                    <option value="terminated">Baja</option>
                  </select>
                </div>
                <Button onClick={handleAddEmployee} className="w-full">
                  Agregar empleado
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
            {error}
          </div>
        )}
        {loading && (
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-muted-foreground">
            Cargando empleados…
          </div>
        )}

        {/* Employee Table */}
        <div className="rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-border text-left text-sm text-muted-foreground">
                <th className="px-6 py-4 font-medium">Nombre</th>
                <th className="px-6 py-4 font-medium">Puesto</th>
                <th className="px-6 py-4 font-medium">Estado</th>
                <th className="px-6 py-4 font-medium">Código</th>
                <th className="px-6 py-4 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr key={employee.id} className="border-b border-border last:border-0">
                  <td className="px-6 py-4 font-medium text-foreground">{employee.fullName}</td>
                  <td className="px-6 py-4">
                    <span
                      className={cn(
                        "inline-flex rounded-md px-2.5 py-1 text-xs font-medium",
                        employee.position
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {employee.position ?? "—"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={cn(
                        "inline-flex rounded-md px-2.5 py-1 text-xs font-medium",
                        employee.status === "active"
                          ? "bg-green-100 text-green-700"
                          : employee.status === "inactive"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-red-100 text-red-700"
                      )}
                    >
                      {employee.status === "active"
                        ? "Activo"
                        : employee.status === "inactive"
                          ? "Inactivo"
                          : "Baja"}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-mono text-sm text-muted-foreground">
                    {employee.employeeCode ?? "—"}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => handleDeleteEmployee(employee.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        </div>

        {/* Summary Footer */}
        <div className="flex items-center gap-6 text-sm text-muted-foreground">
          <span>
            Total: <strong className="text-primary">{employees.length}</strong> empleados
          </span>
          <span>•</span>
          <span>
            Activos: <strong className="text-foreground">{stats.active}</strong>
          </span>
          <span>•</span>
          <span>
            Inactivos: <strong className="text-foreground">{stats.inactive}</strong>
          </span>
          <span>•</span>
          <span>
            Bajas: <strong className="text-foreground">{stats.terminated}</strong>
          </span>
        </div>
      </div>
    </DashboardLayout>
  )
}
