"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { Database, Eye, Loader2, RefreshCw, Search } from "lucide-react"
import { toast } from "sonner"

import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { RequirePermission } from "@/components/auth/require-permission"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { useAuth } from "@/contexts/auth-context"
import {
  getActiveMachineCheckins,
  getAlertRules,
  getAlerts,
  getApiErrorMessage,
  getBonusProductionConfigs,
  getCustomBusinessHolidays,
  getEmployeeDayRecords,
  getEmployeeRoleEvents,
  getEmployees,
  getMachineCheckins,
  getMachines,
  getMaintenanceSessions,
  getManualDataCaptures,
  getMetricPoints,
  getMetrics,
  getGoals,
  getProductSkus,
  getProductionEvents,
  getProductionIncidents,
  getSkuComponentOptions,
  getUsers,
} from "@/lib/api"

type Row = Record<string, unknown>

interface EntityDef {
  key: string
  label: string
  group: string
  /** Carga read-only; el límite (cuando aplica) acota la consulta para no traer la tabla completa. */
  load: (token: string) => Promise<unknown[]>
}

/** Tope de filas por consulta para las tablas grandes (append-only). */
const ROW_LIMIT = 500
const PAGE_SIZE = 50

const ENTITY_GROUPS = [
  "Producción y planta",
  "Personal",
  "Catálogo / SKU",
  "Métricas y metas",
  "Reglas y registros",
] as const

const ENTITIES: EntityDef[] = [
  // Producción y planta
  { key: "machines", label: "Máquinas", group: "Producción y planta", load: (t) => getMachines(t) },
  { key: "production_events", label: "Eventos de producción", group: "Producción y planta", load: (t) => getProductionEvents(t, { limit: ROW_LIMIT }) },
  { key: "machine_checkins", label: "Check-ins (historial)", group: "Producción y planta", load: (t) => getMachineCheckins(t, { limit: ROW_LIMIT }) },
  { key: "active_checkins", label: "Check-ins activos", group: "Producción y planta", load: (t) => getActiveMachineCheckins(t) },
  { key: "maintenance_sessions", label: "Sesiones de mantenimiento", group: "Producción y planta", load: (t) => getMaintenanceSessions(t, { limit: ROW_LIMIT }) },
  { key: "alerts", label: "Alertas", group: "Producción y planta", load: (t) => getAlerts(t) },
  // Personal
  { key: "employees", label: "Empleados", group: "Personal", load: (t) => getEmployees(t) },
  { key: "users", label: "Usuarios", group: "Personal", load: (t) => getUsers(t) },
  { key: "employee_day_records", label: "Registros de día (empleado)", group: "Personal", load: (t) => getEmployeeDayRecords(t, { limit: ROW_LIMIT }) },
  { key: "employee_role_events", label: "Eventos de rol (empleado)", group: "Personal", load: (t) => getEmployeeRoleEvents(t, { limit: ROW_LIMIT }) },
  // Catálogo / SKU
  { key: "product_skus", label: "SKUs", group: "Catálogo / SKU", load: (t) => getProductSkus(t, { includeInactive: true }) },
  { key: "sku_component_options", label: "Opciones de componente SKU", group: "Catálogo / SKU", load: (t) => getSkuComponentOptions(t) },
  // Métricas y metas
  { key: "metrics", label: "Métricas", group: "Métricas y metas", load: (t) => getMetrics(t) },
  { key: "metric_points", label: "Puntos de métrica", group: "Métricas y metas", load: (t) => getMetricPoints(t, { limit: ROW_LIMIT }) },
  { key: "goals", label: "Metas", group: "Métricas y metas", load: (t) => getGoals(t) },
  { key: "bonus_configs", label: "Configuración de bono", group: "Métricas y metas", load: (t) => getBonusProductionConfigs(t) },
  // Reglas y registros
  { key: "manual_data_captures", label: "Capturas manuales", group: "Reglas y registros", load: (t) => getManualDataCaptures(t, { limit: ROW_LIMIT }) },
  { key: "production_incidents", label: "Incidencias de producción", group: "Reglas y registros", load: (t) => getProductionIncidents(t, { limit: ROW_LIMIT }) },
  { key: "custom_holidays", label: "Días festivos (personalizados)", group: "Reglas y registros", load: (t) => getCustomBusinessHolidays(t) },
  { key: "alert_rules", label: "Reglas de alerta (legado)", group: "Reglas y registros", load: (t) => getAlertRules(t) },
]

const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "America/Mexico_City",
  }).format(d)
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function renderCell(value: unknown): React.ReactNode {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">—</span>
  }
  if (typeof value === "boolean") {
    return (
      <Badge variant={value ? "default" : "secondary"} className="font-normal">
        {value ? "Sí" : "No"}
      </Badge>
    )
  }
  if (typeof value === "number") {
    return <span className="tabular-nums">{value}</span>
  }
  if (typeof value === "string") {
    if (ISO_DATETIME_RE.test(value)) {
      return <span className="whitespace-nowrap tabular-nums">{formatDateTime(value)}</span>
    }
    return <span>{value.length > 120 ? value.slice(0, 120) + "…" : value}</span>
  }
  const json = safeStringify(value)
  return (
    <span className="font-mono text-xs text-muted-foreground">
      {json.length > 80 ? json.slice(0, 80) + "…" : json}
    </span>
  )
}

export default function DatosPage() {
  const { getAccessToken } = useAuth()
  const [selectedKey, setSelectedKey] = useState<string>(ENTITIES[0].key)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const [detail, setDetail] = useState<Row | null>(null)

  const entity = useMemo(
    () => ENTITIES.find((e) => e.key === selectedKey) ?? ENTITIES[0],
    [selectedKey],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = await getAccessToken()
      if (!token) {
        setError("Sesión no válida o expirada.")
        setRows([])
        return
      }
      const data = await entity.load(token)
      const normalized = Array.isArray(data)
        ? data.filter((r): r is Row => r != null && typeof r === "object")
        : []
      setRows(normalized)
    } catch (e) {
      const msg = getApiErrorMessage(e) || "No se pudieron cargar los datos."
      setError(msg)
      setRows([])
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [entity, getAccessToken])

  // Recarga al cambiar de entidad; resetea búsqueda y paginación.
  useEffect(() => {
    setQuery("")
    setPage(1)
    load()
  }, [load])

  const columns = useMemo(() => {
    const seen = new Set<string>()
    const cols: string[] = []
    for (const row of rows) {
      for (const k of Object.keys(row)) {
        if (!seen.has(k)) {
          seen.add(k)
          cols.push(k)
        }
      }
    }
    return cols
  }, [rows])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) => safeStringify(row).toLowerCase().includes(q))
  }, [rows, query])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  // Si cambia el filtro y la página queda fuera de rango, vuelve a la 1.
  useEffect(() => {
    setPage(1)
  }, [query])

  const capped = rows.length >= ROW_LIMIT

  return (
    <DashboardLayout breadcrumbs={[{ label: "Datos" }]}>
      <RequirePermission permission="data.browse">
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Database className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Datos</h1>
              <p className="text-sm text-muted-foreground">
                Consulta de solo lectura de las tablas del sistema. Para validación y revisión durante el desarrollo.
              </p>
            </div>
          </div>

          <Card>
            <CardHeader className="gap-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div className="space-y-1.5">
                  <CardTitle className="text-base">Tabla</CardTitle>
                  <CardDescription>Elige una tabla para inspeccionar sus registros.</CardDescription>
                  <Select value={selectedKey} onValueChange={setSelectedKey}>
                    <SelectTrigger className="w-full md:w-80">
                      <SelectValue placeholder="Selecciona una tabla" />
                    </SelectTrigger>
                    <SelectContent>
                      {ENTITY_GROUPS.map((group) => (
                        <SelectGroup key={group}>
                          <SelectLabel>{group}</SelectLabel>
                          {ENTITIES.filter((e) => e.group === group).map((e) => (
                            <SelectItem key={e.key} value={e.key}>
                              {e.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative w-full md:w-64">
                    <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Filtrar en todas las columnas…"
                      className="pl-8"
                    />
                  </div>
                  <Button variant="outline" size="icon" onClick={load} disabled={loading} aria-label="Refrescar">
                    <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span>
                  <span className="font-medium text-foreground">{filtered.length}</span>
                  {query ? ` de ${rows.length}` : ""} registro{filtered.length === 1 ? "" : "s"}
                </span>
                <span>·</span>
                <span>{columns.length} columnas</span>
                {capped && (
                  <>
                    <span>·</span>
                    <Badge variant="secondary" className="font-normal">
                      Limitado a {ROW_LIMIT} filas más recientes
                    </Badge>
                  </>
                )}
              </div>

              {error ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-6 text-center text-sm text-destructive">
                  {error}
                </div>
              ) : loading && rows.length === 0 ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="rounded-md border border-dashed px-4 py-16 text-center text-sm text-muted-foreground">
                  {rows.length === 0 ? "Sin registros en esta tabla." : "Ningún registro coincide con el filtro."}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10" />
                        {columns.map((col) => (
                          <TableHead key={col} className="whitespace-nowrap">
                            {col}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((row, idx) => (
                        <TableRow key={(row.id as string) ?? idx}>
                          <TableCell className="w-10">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => setDetail(row)}
                              aria-label="Ver registro completo"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                          {columns.map((col) => (
                            <TableCell key={col} className="max-w-xs align-top text-sm">
                              {renderCell(row[col])}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-1">
                  <span className="text-sm text-muted-foreground">
                    Página {safePage} de {totalPages}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={safePage <= 1}
                    >
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={safePage >= totalPages}
                    >
                      Siguiente
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Dialog open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
          <DialogContent className="max-h-[80vh] max-w-2xl overflow-hidden">
            <DialogHeader>
              <DialogTitle>Registro · {entity.label}</DialogTitle>
              <DialogDescription>Vista completa del registro (solo lectura).</DialogDescription>
            </DialogHeader>
            <pre className="max-h-[60vh] overflow-auto rounded-md bg-muted p-4 text-xs leading-relaxed">
              {detail ? JSON.stringify(detail, null, 2) : ""}
            </pre>
          </DialogContent>
        </Dialog>
      </RequirePermission>
    </DashboardLayout>
  )
}
