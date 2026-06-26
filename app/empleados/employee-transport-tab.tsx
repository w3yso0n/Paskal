"use client"

import { useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Bus, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/auth-context"
import { updateEmployee, type ApiEmployee } from "@/lib/api"
import {
  EMPLOYEE_PRODUCTION_ROLE_LABELS,
  inferProductionRoleFromPosition,
} from "@/lib/employee-production-role"
import {
  formatTransportMxn,
  LOCAL_TRANSPORT_POLICY_SUMMARY,
  LOCAL_TRANSPORT_SUPPORT_MONTHLY_MXN,
  summarizeLocalTransportSupport,
} from "@/lib/local-transport-support"

type EmployeeTransportTabProps = {
  employees: ApiEmployee[]
  onEmployeesChange: (employees: ApiEmployee[]) => void
}

export function EmployeeTransportTab({
  employees,
  onEmployeesChange,
}: EmployeeTransportTabProps) {
  const { getAccessToken } = useAuth()
  const [searchQuery, setSearchQuery] = useState("")
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const summary = useMemo(() => summarizeLocalTransportSupport(employees), [employees])

  const rows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return employees
      .filter((e) => e.status === "active")
      .filter((e) => {
        if (!q) return true
        const haystack = [e.fullName, e.employeeCode, e.position, e.rfc, e.imss]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        return haystack.includes(q)
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "es"))
  }, [employees, searchQuery])

  const handleToggle = async (employee: ApiEmployee, checked: boolean) => {
    setError(null)
    setSavingId(employee.id)
    try {
      const token = await getAccessToken()
      if (!token) return
      const updated = await updateEmployee(token, employee.id, {
        localTransportSupport: checked,
      })
      onEmployeesChange(
        employees.map((e) => (e.id === updated.id ? updated : e)),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar el apoyo de transporte")
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="border-sky-200/60 bg-sky-50/40">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-start gap-3">
            <Bus className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" />
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-foreground">Apoyo de transporte (locales)</h2>
              <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
                {LOCAL_TRANSPORT_POLICY_SUMMARY.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-background px-4 py-3">
              <p className="text-xs font-medium uppercase text-muted-foreground">Con apoyo</p>
              <p className="text-2xl font-bold text-sky-800 tabular-nums">{summary.selectedCount}</p>
            </div>
            <div className="rounded-lg border border-border bg-background px-4 py-3">
              <p className="text-xs font-medium uppercase text-muted-foreground">Activos</p>
              <p className="text-2xl font-bold tabular-nums">{summary.activeEligibleCount}</p>
            </div>
            <div className="rounded-lg border border-border bg-background px-4 py-3">
              <p className="text-xs font-medium uppercase text-muted-foreground">Total mensual</p>
              <p className="text-2xl font-bold text-sky-800 tabular-nums">
                {formatTransportMxn(summary.monthlyTotalMxn)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {formatTransportMxn(LOCAL_TRANSPORT_SUPPORT_MONTHLY_MXN)} × {summary.selectedCount}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Selecciona a quienes reciben el apoyo por vivir cerca de la planta.
            </p>
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar empleado…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {error ? (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center border border-dashed rounded-lg">
              No hay empleados activos que coincidan con la búsqueda.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium w-12"> </th>
                    <th className="px-4 py-2.5 font-medium">Empleado</th>
                    <th className="px-4 py-2.5 font-medium">Código</th>
                    <th className="px-4 py-2.5 font-medium">Rol</th>
                    <th className="px-4 py-2.5 font-medium text-right">Apoyo mensual</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((employee) => {
                    const role =
                      employee.primaryRole ??
                      inferProductionRoleFromPosition(employee.position) ??
                      "operator"
                    const checked = Boolean(employee.localTransportSupport)
                    const saving = savingId === employee.id
                    return (
                      <tr
                        key={employee.id}
                        className={cn(
                          "border-b border-border last:border-0",
                          checked && "bg-sky-50/60",
                          saving && "opacity-60",
                        )}
                      >
                        <td className="px-4 py-2.5">
                          <Checkbox
                            checked={checked}
                            disabled={saving}
                            onCheckedChange={(v) =>
                              handleToggle(employee, v === true)
                            }
                            aria-label={`Apoyo transporte para ${employee.fullName}`}
                          />
                        </td>
                        <td className="px-4 py-2.5 font-medium">{employee.fullName}</td>
                        <td className="px-4 py-2.5 font-mono text-muted-foreground">
                          {employee.employeeCode ?? "—"}
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge variant="secondary" className="font-normal">
                            {EMPLOYEE_PRODUCTION_ROLE_LABELS[role]}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                          {checked
                            ? formatTransportMxn(LOCAL_TRANSPORT_SUPPORT_MONTHLY_MXN)
                            : "—"}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
