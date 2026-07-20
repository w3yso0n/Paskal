"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { AlertTriangle, Clock, Loader2, Timer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/auth-context"
import {
  getAlerts,
  getBusinessAlertThresholds,
  getDowntimeNotes,
  getMachineCheckins,
  getMachines,
  getProductionEvents,
  type ApiEmployee,
} from "@/lib/api"
import { filterFloorMachines } from "@/lib/machine-floor"
import {
  buildEmployeeDowntimeAnalytics,
  formatDurationMinutes,
  LONG_DOWNTIME_MINUTES,
  type EmployeeDowntimeIncident,
  type EmployeeDowntimeSummary,
} from "@/lib/employee-downtime-analytics"

function monthBoundsFromInput(monthValue: string) {
  const [yRaw, mRaw] = monthValue.split("-")
  const year = Number(yRaw)
  const month = Number(mRaw) - 1
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 0 || month > 11) {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth()
    const mm = String(m + 1).padStart(2, "0")
    return { start: `${y}-${mm}-01`, end: now.toISOString().slice(0, 10) }
  }
  const mm = String(month + 1).padStart(2, "0")
  const start = `${year}-${mm}-01`
  const end = new Date(year, month + 1, 0).toISOString().slice(0, 10)
  return { start, end }
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

type EmployeeDowntimeTabProps = {
  employees: ApiEmployee[]
}

export function EmployeeDowntimeTab({ employees }: EmployeeDowntimeTabProps) {
  const { getAccessToken } = useAuth()
  const [rangeMonth, setRangeMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadNonce, setReloadNonce] = useState(0)

  const [selectedSummary, setSelectedSummary] = useState<EmployeeDowntimeSummary | null>(null)

  const [analytics, setAnalytics] = useState<ReturnType<
    typeof buildEmployeeDowntimeAnalytics
  > | null>(null)

  const bounds = useMemo(() => monthBoundsFromInput(rangeMonth), [rangeMonth])

  const operatorEmployees = useMemo(
    () =>
      employees.filter((e) => (e.primaryRole ?? "operator") === "operator"),
    [employees],
  )

  const displaySummaries = useMemo(() => {
    if (!analytics) return []
    const byId = new Map(
      analytics.summaries
        .filter((s) => s.employeeId)
        .map((s) => [s.employeeId as string, s]),
    )
    const rows: EmployeeDowntimeSummary[] = operatorEmployees.map((emp) => {
      const existing = byId.get(emp.id)
      if (existing) return existing
      return {
        employeeId: emp.id,
        employeeCode: emp.employeeCode,
        employeeName: emp.fullName,
        totalIncidents: 0,
        stage1Count: 0,
        stage2Count: 0,
        totalDowntimeMinutes: 0,
        exceedsThirtyMinutes: false,
        incidents: [],
      }
    })
    const extra = analytics.summaries.filter(
      (s) => s.employeeId && !rows.some((r) => r.employeeId === s.employeeId),
    )
    return [...rows, ...extra].sort((a, b) => {
      if (b.totalDowntimeMinutes !== a.totalDowntimeMinutes) {
        return b.totalDowntimeMinutes - a.totalDowntimeMinutes
      }
      return a.employeeName.localeCompare(b.employeeName, "es")
    })
  }, [analytics, operatorEmployees])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const token = await getAccessToken()
        if (!token) {
          if (!cancelled) setAnalytics(null)
          return
        }
        const fromIso = new Date(`${bounds.start}T00:00:00`).toISOString()
        const toIso = new Date(`${bounds.end}T23:59:59.999`).toISOString()

        const [events, alerts, checkins, machines, thresholds, notes] = await Promise.all([
          getProductionEvents(token, { from: fromIso, to: toIso, limit: 50_000 }),
          getAlerts(token, { from: fromIso, to: toIso, limit: 10_000 }).catch(() => []),
          getMachineCheckins(token, { from: fromIso, to: toIso, limit: 20_000 }),
          getMachines(token),
          getBusinessAlertThresholds(token),
          getDowntimeNotes(token, { from: bounds.start, to: bounds.end }).catch(() => []),
        ])
        if (cancelled) return

        const built = buildEmployeeDowntimeAnalytics({
          events,
          alerts,
          checkins,
          employees,
          machines: filterFloorMachines(machines),
          thresholds,
          notes,
          from: bounds.start,
          to: bounds.end,
        })
        setAnalytics(built)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Error al cargar paros")
          setAnalytics(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [getAccessToken, bounds.start, bounds.end, employees, reloadNonce])

  return (
    <div className="space-y-4">
      <Card className="border-amber-200/60 bg-amber-50/40">
        <CardContent className="pt-6 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Timer className="h-5 w-5 text-amber-700" />
                Paros e inactividad por operador
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Alertas de inactividad (tipo 1 y tipo 2) atribuidas al operador en turno según
                check-in de máquina. El tiempo inactivo es la duración real del paro (desde la
                última producción/check-in hasta el cierre); si escala de tipo 1 a tipo 2 en la
                misma ventana, cuenta una sola vez. Los umbrales se configuran en{" "}
                <Link href="/reglas-negocio" className="text-primary underline-offset-2 hover:underline">
                  Reglas de negocio
                </Link>
                . Las notas de supervisión se añaden en{" "}
                <Link href="/alertas" className="text-primary underline-offset-2 hover:underline">
                  Alertas
                </Link>
                .
              </p>
            </div>
            <Input
              type="month"
              value={rangeMonth}
              onChange={(e) => setRangeMonth(e.target.value)}
              className="w-[180px] shrink-0"
            />
          </div>
          {analytics ? (
            <p className="text-xs text-muted-foreground">
              Tipo 1 = {analytics.thresholds.stage1} min sin producción · Tipo 2 ={" "}
              {analytics.thresholds.stage2} min · Paros críticos: más de {LONG_DOWNTIME_MINUTES}{" "}
              min acumulados o por evento
            </p>
          ) : null}
        </CardContent>
      </Card>

      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Cargando paros del periodo…
        </div>
      ) : analytics ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">Total alertas</p>
                <p className="text-2xl font-bold text-primary">{analytics.totals.incidents}</p>
                <p className="text-xs text-muted-foreground mt-1">{bounds.start} — {bounds.end}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  Tipo 1 ({analytics.thresholds.stage1} min)
                </p>
                <p className="text-2xl font-bold text-amber-700">{analytics.totals.stage1}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  Tipo 2 ({analytics.thresholds.stage2} min)
                </p>
                <p className="text-2xl font-bold text-orange-700">{analytics.totals.stage2}</p>
              </CardContent>
            </Card>
            <Card
              className={cn(
                analytics.totals.employeesOver30 > 0 &&
                  "border-red-600 bg-red-600 text-white shadow-lg shadow-red-600/30",
              )}
            >
              <CardContent className="pt-4 pb-4">
                <p
                  className={cn(
                    "text-xs font-medium uppercase",
                    analytics.totals.employeesOver30 > 0
                      ? "text-red-100"
                      : "text-muted-foreground",
                  )}
                >
                  Operadores &gt; {LONG_DOWNTIME_MINUTES} min
                </p>
                <p
                  className={cn(
                    "text-2xl font-bold",
                    analytics.totals.employeesOver30 > 0 ? "text-white" : "text-red-700",
                  )}
                >
                  {analytics.totals.employeesOver30}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="pt-6 space-y-4">
              <h3 className="font-semibold">Resumen por empleado ({displaySummaries.length})</h3>
              {displaySummaries.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center border border-dashed rounded-lg">
                  No hay paros atribuibles a operadores en este periodo.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Empleado</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Tipo 1</TableHead>
                        <TableHead className="text-right">Tipo 2</TableHead>
                        <TableHead className="text-right">Tiempo inactivo</TableHead>
                        <TableHead className="text-right">Detalle</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displaySummaries.map((row) => (
                        <TableRow
                          key={row.employeeId ?? row.employeeName}
                          className={cn(
                            row.exceedsThirtyMinutes &&
                              "bg-red-600 text-white hover:bg-red-600/95 [&_td]:border-red-500",
                          )}
                        >
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {row.exceedsThirtyMinutes ? (
                                <AlertTriangle className="h-4 w-4 shrink-0" />
                              ) : null}
                              <span>
                                {row.employeeName}
                                {row.employeeCode ? (
                                  <span
                                    className={cn(
                                      "ml-1 text-xs",
                                      row.exceedsThirtyMinutes
                                        ? "text-red-100"
                                        : "text-muted-foreground",
                                    )}
                                  >
                                    ({row.employeeCode})
                                  </span>
                                ) : null}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-semibold">
                            {row.totalIncidents}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{row.stage1Count}</TableCell>
                          <TableCell className="text-right tabular-nums">{row.stage2Count}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">
                            {formatDurationMinutes(row.totalDowntimeMinutes)}
                          </TableCell>
                          <TableCell className="text-right">
                            {row.totalIncidents > 0 ? (
                              <Button
                                variant={row.exceedsThirtyMinutes ? "secondary" : "outline"}
                                size="sm"
                                onClick={() => setSelectedSummary(row)}
                              >
                                Ver {row.totalIncidents}
                              </Button>
                            ) : (
                              <span
                                className={cn(
                                  "text-xs",
                                  row.exceedsThirtyMinutes ? "text-red-100" : "text-muted-foreground",
                                )}
                              >
                                —
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {analytics.unassigned.length > 0 ? (
            <Card>
              <CardContent className="pt-6 space-y-3">
                <h3 className="font-semibold text-muted-foreground">
                  Sin operador asignado ({analytics.unassigned.length})
                </h3>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Máquina</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Duración</TableHead>
                        <TableHead>Motivo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analytics.unassigned.slice(0, 15).map((inc) => (
                        <TableRow key={inc.sourceKey}>
                          <TableCell className="whitespace-nowrap text-sm">
                            {formatDateTime(inc.occurredAt)}
                          </TableCell>
                          <TableCell>{inc.machineLabel}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{inc.stageLabel}</Badge>
                          </TableCell>
                          <TableCell>{formatDurationMinutes(inc.durationMinutes)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[240px] truncate">
                            {inc.reason}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}

      <Dialog
        open={selectedSummary != null}
        onOpenChange={(open) => {
          if (!open) setSelectedSummary(null)
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Paros — {selectedSummary?.employeeName}</DialogTitle>
            <DialogDescription>
              {selectedSummary
                ? `${selectedSummary.totalIncidents} alerta(s) · ${formatDurationMinutes(selectedSummary.totalDowntimeMinutes)} acumulados`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {selectedSummary ? (
            <div className="space-y-3">
              {selectedSummary.incidents.map((inc) => (
                <div
                  key={inc.sourceKey}
                  className={cn(
                    "rounded-lg border p-3 space-y-2",
                    inc.durationMinutes > LONG_DOWNTIME_MINUTES && "border-red-500 bg-red-50",
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{formatDateTime(inc.occurredAt)}</span>
                      <Badge variant={inc.stage === 2 ? "destructive" : "secondary"}>
                        {inc.stageLabel}
                      </Badge>
                    </div>
                    <span className="text-sm font-semibold tabular-nums">
                      {formatDurationMinutes(inc.durationMinutes)}
                    </span>
                  </div>
                  <p className="text-sm">
                    <span className="text-muted-foreground">Máquina:</span> {inc.machineLabel}
                  </p>
                  <p className="text-sm text-muted-foreground">{inc.reason}</p>
                  {inc.notes ? (
                    <p className="text-sm rounded bg-muted/50 px-2 py-1.5">
                      <span className="font-medium text-foreground">Nota:</span> {inc.notes}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
