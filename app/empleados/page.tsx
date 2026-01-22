"use client"

import { useState } from "react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Users, Plus, Trash2 } from "lucide-react"
import { employees as initialEmployees, type Employee } from "@/lib/mock-data"
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

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>(initialEmployees)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [newEmployee, setNewEmployee] = useState({
    name: "",
    role: "Operador" as "Operador" | "Empacador",
    nfcId: "",
  })

  const handleAddEmployee = () => {
    if (newEmployee.name && newEmployee.nfcId) {
      setEmployees([
        ...employees,
        {
          id: String(employees.length + 1),
          ...newEmployee,
        },
      ])
      setNewEmployee({ name: "", role: "Operador", nfcId: "" })
      setIsDialogOpen(false)
    }
  }

  const handleDeleteEmployee = (id: string) => {
    setEmployees(employees.filter((e) => e.id !== id))
  }

  const operadoresCount = employees.filter((e) => e.role === "Operador").length
  const empacadoresCount = employees.filter((e) => e.role === "Empacador").length

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
                  <Label htmlFor="name">Nombre completo</Label>
                  <Input
                    id="name"
                    value={newEmployee.name}
                    onChange={(e) => setNewEmployee({ ...newEmployee, name: e.target.value })}
                    placeholder="Ej: Juan Pérez"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Rol</Label>
                  <select
                    id="role"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={newEmployee.role}
                    onChange={(e) =>
                      setNewEmployee({
                        ...newEmployee,
                        role: e.target.value as "Operador" | "Empacador",
                      })
                    }
                  >
                    <option value="Operador">Operador</option>
                    <option value="Empacador">Empacador</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nfcId">NFC ID</Label>
                  <Input
                    id="nfcId"
                    value={newEmployee.nfcId}
                    onChange={(e) => setNewEmployee({ ...newEmployee, nfcId: e.target.value })}
                    placeholder="Ej: NFC-006"
                  />
                </div>
                <Button onClick={handleAddEmployee} className="w-full">
                  Agregar empleado
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Employee Table */}
        <div className="rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-border text-left text-sm text-muted-foreground">
                <th className="px-6 py-4 font-medium">Nombre</th>
                <th className="px-6 py-4 font-medium">Rol</th>
                <th className="px-6 py-4 font-medium">NFC ID</th>
                <th className="px-6 py-4 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr key={employee.id} className="border-b border-border last:border-0">
                  <td className="px-6 py-4 font-medium text-foreground">{employee.name}</td>
                  <td className="px-6 py-4">
                    <span
                      className={cn(
                        "inline-flex rounded-md px-2.5 py-1 text-xs font-medium",
                        employee.role === "Operador"
                          ? "bg-primary/10 text-primary"
                          : "bg-cyan-100 text-cyan-700"
                      )}
                    >
                      {employee.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-mono text-sm text-muted-foreground">
                    {employee.nfcId}
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
            Operadores: <strong className="text-foreground">{operadoresCount}</strong>
          </span>
          <span>•</span>
          <span>
            Empacadores: <strong className="text-foreground">{empacadoresCount}</strong>
          </span>
        </div>
      </div>
    </DashboardLayout>
  )
}
