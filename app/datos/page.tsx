"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { Database, Eye, Loader2, Play, RotateCcw, Search } from "lucide-react"
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
import { Textarea } from "@/components/ui/textarea"
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
import { getApiErrorMessage, runDataQuery, type DataQueryResult } from "@/lib/api"

const PAGE_SIZE = 50

interface TableDef {
  table: string
  label: string
  group: string
}

const TABLE_GROUPS = [
  "Producción y planta",
  "Personal",
  "Catálogo / SKU",
  "Métricas y metas",
  "Reglas y registros",
] as const

const TABLES: TableDef[] = [
  { table: "machines", label: "Máquinas", group: "Producción y planta" },
  { table: "production_events", label: "Eventos de producción", group: "Producción y planta" },
  { table: "production_runs", label: "Corridas de producción", group: "Producción y planta" },
  { table: "work_orders", label: "Órdenes de trabajo", group: "Producción y planta" },
  { table: "machine_checkins", label: "Check-ins", group: "Producción y planta" },
  { table: "maintenance_sessions", label: "Sesiones de mantenimiento", group: "Producción y planta" },
  { table: "alerts", label: "Alertas", group: "Producción y planta" },
  { table: "employees", label: "Empleados", group: "Personal" },
  { table: "attendance", label: "Asistencia", group: "Personal" },
  { table: "employee_day_records", label: "Registros de día", group: "Personal" },
  { table: "employee_role_events", label: "Eventos de rol", group: "Personal" },
  { table: "users", label: "Usuarios", group: "Personal" },
  { table: "product_skus", label: "SKUs", group: "Catálogo / SKU" },
  { table: "sku_component_options", label: "Opciones de componente SKU", group: "Catálogo / SKU" },
  { table: "metrics", label: "Métricas", group: "Métricas y metas" },
  { table: "metric_points", label: "Puntos de métrica", group: "Métricas y metas" },
  { table: "goals", label: "Metas", group: "Métricas y metas" },
  { table: "bonus_production_configs", label: "Configuración de bono", group: "Métricas y metas" },
  { table: "manual_data_captures", label: "Capturas manuales", group: "Reglas y registros" },
  { table: "production_incidents", label: "Incidencias de producción", group: "Reglas y registros" },
  { table: "business_holidays", label: "Días festivos", group: "Reglas y registros" },
  { table: "alert_rules", label: "Reglas de alerta (legado)", group: "Reglas y registros" },
  { table: "notification_targets", label: "Destinos de notificación", group: "Reglas y registros" },
]

const defaultSqlFor = (table: string) => `select * from ${table}`

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
  const [selectedTable, setSelectedTable] = useState<string>(TABLES[0].table)
  const [sql, setSql] = useState<string>(defaultSqlFor(TABLES[0].table))
  const [result, setResult] = useState<DataQueryResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null)

  const run = useCallback(
    async (sqlText: string) => {
      const trimmed = sqlText.trim()
      if (!trimmed) {
        setError("Escribe una consulta SQL.")
        return
      }
      setLoading(true)
      setError(null)
      try {
        const token = await getAccessToken()
        if (!token) {
          setError("Sesión no válida o expirada.")
          setResult(null)
          return
        }
        const res = await runDataQuery(token, trimmed)
        setResult(res)
        setQuery("")
        setPage(1)
      } catch (e) {
        const msg = getApiErrorMessage(e) || "No se pudo ejecutar la consulta."
        setError(msg)
        setResult(null)
        toast.error(msg)
      } finally {
        setLoading(false)
      }
    },
    [getAccessToken],
  )

  // Ejecuta la tabla inicial al montar.
  useEffect(() => {
    void run(defaultSqlFor(TABLES[0].table))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onSelectTable = (table: string) => {
    setSelectedTable(table)
    const next = defaultSqlFor(table)
    setSql(next)
    void run(next)
  }

  const columns = result?.columns ?? []

  const filtered = useMemo(() => {
    const rows = result?.rows ?? []
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) => safeStringify(row).toLowerCase().includes(q))
  }, [result, query])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  useEffect(() => {
    setPage(1)
  }, [query])

  const onSqlKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault()
      void run(sql)
    }
  }

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
                Consulta SQL de solo lectura sobre las tablas del sistema. Para validación y revisión durante el desarrollo.
              </p>
            </div>
          </div>

          <Card>
            <CardHeader className="gap-4">
              <div className="space-y-1.5">
                <CardTitle className="text-base">Consulta</CardTitle>
                <CardDescription>
                  Elige una tabla (prellena <code className="font-mono text-xs">select * from …</code>) y edita el SQL: agrega
                  <code className="font-mono text-xs"> where</code>, <code className="font-mono text-xs">order by</code>,
                  <code className="font-mono text-xs"> limit</code>, joins, etc. Solo lectura — una sentencia
                  <code className="font-mono text-xs"> SELECT</code>/<code className="font-mono text-xs">WITH</code>.
                </CardDescription>
              </div>

              <div className="flex flex-col gap-3 md:flex-row md:items-start">
                <Select value={selectedTable} onValueChange={onSelectTable}>
                  <SelectTrigger className="w-full md:w-72">
                    <SelectValue placeholder="Selecciona una tabla" />
                  </SelectTrigger>
                  <SelectContent>
                    {TABLE_GROUPS.map((group) => (
                      <SelectGroup key={group}>
                        <SelectLabel>{group}</SelectLabel>
                        {TABLES.filter((t) => t.group === group).map((t) => (
                          <SelectItem key={t.table} value={t.table}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>

                <div className="flex flex-1 flex-col gap-2">
                  <Textarea
                    value={sql}
                    onChange={(e) => setSql(e.target.value)}
                    onKeyDown={onSqlKeyDown}
                    spellCheck={false}
                    rows={3}
                    className="font-mono text-sm"
                    placeholder="select * from machines where ..."
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Ctrl/⌘ + Enter para ejecutar · tope 50,000 filas (usa LIMIT/WHERE para acotar)
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const def = defaultSqlFor(selectedTable)
                          setSql(def)
                          void run(def)
                        }}
                        disabled={loading}
                      >
                        <RotateCcw className="mr-1.5 h-4 w-4" />
                        Restablecer
                      </Button>
                      <Button size="sm" onClick={() => void run(sql)} disabled={loading}>
                        {loading ? (
                          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="mr-1.5 h-4 w-4" />
                        )}
                        Ejecutar
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-3">
              {error ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-4 text-sm text-destructive">
                  <span className="font-medium">Error: </span>
                  <span className="font-mono">{error}</span>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span>
                    <span className="font-medium text-foreground">{filtered.length}</span>
                    {query ? ` de ${result?.rowCount ?? 0}` : ""} fila{filtered.length === 1 ? "" : "s"}
                  </span>
                  <span>·</span>
                  <span>{columns.length} columnas</span>
                  {result && (
                    <>
                      <span>·</span>
                      <span>{result.elapsedMs} ms</span>
                    </>
                  )}
                  {result?.truncated && (
                    <>
                      <span>·</span>
                      <Badge variant="secondary" className="font-normal">
                        Truncado al tope — añade LIMIT/WHERE
                      </Badge>
                    </>
                  )}
                </div>
              )}

              {!error && (
                <div className="relative w-full md:w-72">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Filtrar en el resultado…"
                    className="pl-8"
                  />
                </div>
              )}

              {loading && !result ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : !error && filtered.length === 0 ? (
                <div className="rounded-md border border-dashed px-4 py-16 text-center text-sm text-muted-foreground">
                  {(result?.rows.length ?? 0) === 0
                    ? "La consulta no devolvió filas."
                    : "Ningún registro coincide con el filtro."}
                </div>
              ) : !error ? (
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
                              aria-label="Ver fila completa"
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
              ) : null}

              {totalPages > 1 && !error && (
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
              <DialogTitle>Fila</DialogTitle>
              <DialogDescription>Vista completa (solo lectura).</DialogDescription>
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
