"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { Braces, Copy, Database, Eye, Loader2, Play, RotateCcw, Search } from "lucide-react"
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
import { cn } from "@/lib/utils"

const PAGE_SIZE = 50

interface TableDef {
  table: string
  label: string
  group: string
  /** Consulta inicial a medida (si no, `select * from <table>`). */
  defaultSql?: string
}

const TABLE_GROUPS = [
  "Producción y planta",
  "Personal",
  "Catálogo / SKU",
  "Métricas y metas",
  "Reglas y registros",
] as const

const TABLES: TableDef[] = [
  {
    table: "machines",
    label: "Máquinas",
    group: "Producción y planta",
    // Muestra el roster activo (operadores/empacadores) por su NFC junto a la máquina,
    // vía join al check-in activo y a employees (employee_code interno → nfc_card_uid).
    defaultSql:
      "select m.code, m.status, m.current_sku, m.units_per_box, m.orphan_units,\n" +
      "  eo.nfc_card_uid as operator_nfc, eo2.nfc_card_uid as operator_2_nfc,\n" +
      "  ep1.nfc_card_uid as packager_1_nfc, ep2.nfc_card_uid as packager_2_nfc,\n" +
      "  ep3.nfc_card_uid as packager_3_nfc, ep4.nfc_card_uid as packager_4_nfc,\n" +
      "  m.last_seen_at, m.last_abs_count, m.last_seq, m.last_production_at, m.count_at_checkout,\n" +
      "  m.floor_row, m.floor_col, m.id\n" +
      "from machines m\n" +
      "left join machine_checkins c on c.machine_id = m.id and c.is_active = true\n" +
      "left join employees eo on eo.employee_code = c.operator_code\n" +
      "left join employees eo2 on eo2.employee_code = c.operator_2_code\n" +
      "left join employees ep1 on ep1.employee_code = c.packager_1_code\n" +
      "left join employees ep2 on ep2.employee_code = c.packager_2_code\n" +
      "left join employees ep3 on ep3.employee_code = c.packager_3_code\n" +
      "left join employees ep4 on ep4.employee_code = c.packager_4_code\n" +
      "order by m.code",
  },
  {
    table: "production_events",
    label: "Eventos de producción",
    group: "Producción y planta",
    // Muestra el código de máquina (no el uuid).
    defaultSql:
      "select e.occurred_at, m.code as machine_code, e.event_type, e.message, e.payload, e.id\n" +
      "from production_events e\n" +
      "left join machines m on m.id = e.machine_id\n" +
      "order by e.occurred_at desc",
  },
  { table: "machine_checkins", label: "Check-ins", group: "Producción y planta" },
  { table: "maintenance_sessions", label: "Sesiones de mantenimiento", group: "Producción y planta" },
  { table: "alerts", label: "Alertas", group: "Producción y planta" },
  { table: "employees", label: "Empleados", group: "Personal" },
  { table: "employee_day_records", label: "Registros de día", group: "Personal" },
  { table: "employee_role_events", label: "Eventos de rol", group: "Personal" },
  { table: "users", label: "Usuarios", group: "Personal" },
  { table: "product_skus", label: "SKUs", group: "Catálogo / SKU" },
  { table: "sku_component_options", label: "Opciones de componente SKU", group: "Catálogo / SKU" },
  { table: "goals", label: "Metas", group: "Métricas y metas" },
  { table: "bonus_production_configs", label: "Configuración de bono", group: "Métricas y metas" },
  { table: "manual_data_captures", label: "Capturas manuales", group: "Reglas y registros" },
  { table: "production_incidents", label: "Incidencias de producción", group: "Reglas y registros" },
  { table: "business_holidays", label: "Días festivos", group: "Reglas y registros" },
  { table: "downtime_notes", label: "Notas de paro", group: "Reglas y registros" },
  { table: "user_sessions", label: "Sesiones de usuario", group: "Personal" },
  { table: "app_config", label: "Configuración de la app", group: "Reglas y registros" },
]

const defaultSqlFor = (table: string) =>
  TABLES.find((t) => t.table === table)?.defaultSql ?? `select * from ${table}`

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

/** Texto plano de un valor para el atributo `title` (tooltip nativo al pasar el cursor). */
function cellTitle(value: unknown): string | undefined {
  if (value === null || value === undefined || value === "") return undefined
  if (typeof value === "string") {
    return ISO_DATETIME_RE.test(value) ? formatDateTime(value) : value
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return safeStringify(value)
}

/**
 * Ancho de columna por heurística de nombre. Las columnas con contenido corto
 * (códigos, contadores, banderas) se mantienen angostas; las de texto libre / json
 * se acotan con un máximo y truncado para que nunca se encimen con la vecina.
 */
function columnWidthClass(col: string): string {
  const c = col.toLowerCase()
  if (c === "id" || c.endsWith("_id")) return "w-[90px] max-w-[90px]"
  if (c.includes("payload") || c.includes("metadata") || c.includes("config")) {
    return "w-[120px] max-w-[120px]"
  }
  if (c.includes("message") || c.includes("notes") || c.includes("description") || c.includes("sql")) {
    return "min-w-[220px] max-w-[340px]"
  }
  if (c.includes("_at") || c.includes("date") || c.includes("occurred") || c.includes("timestamp")) {
    return "w-[170px] max-w-[170px]"
  }
  if (c.includes("nfc") || c.includes("uid")) return "w-[150px] max-w-[150px]"
  if (c.includes("email")) return "min-w-[200px] max-w-[260px]"
  if (c.includes("name") || c.includes("full_name") || c.includes("label") || c.includes("title")) {
    return "min-w-[160px] max-w-[240px]"
  }
  if (c.includes("sku") || c.includes("code")) return "w-[140px] max-w-[160px]"
  if (
    c.includes("status") ||
    c.includes("type") ||
    c.includes("role") ||
    c.includes("shift") ||
    c === "is_active"
  ) {
    return "w-[120px] max-w-[130px]"
  }
  if (
    c.includes("count") ||
    c.includes("units") ||
    c.includes("seq") ||
    c.includes("row") ||
    c.includes("col") ||
    c.includes("orphan") ||
    c.includes("qty") ||
    c.includes("total")
  ) {
    return "w-[110px] max-w-[120px]"
  }
  return "min-w-[130px] max-w-[200px]"
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

  const copyDetail = () => {
    if (!detail) return
    navigator.clipboard
      .writeText(JSON.stringify(detail, null, 2))
      .then(() => toast.success("Copiado al portapapeles"))
      .catch(() => toast.error("No se pudo copiar"))
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
                        <TableHead className="w-10 min-w-10" />
                        {columns.map((col) => (
                          <TableHead
                            key={col}
                            className={cn("whitespace-nowrap", columnWidthClass(col))}
                            title={col}
                          >
                            <span className="block truncate">{col}</span>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((row, idx) => (
                        <TableRow key={(row.id as string) ?? idx}>
                          <TableCell className="w-10 min-w-10">
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
                          {columns.map((col) => {
                            const value = row[col]
                            const isObject = value !== null && typeof value === "object"
                            return (
                              <TableCell
                                key={col}
                                className={cn("align-top text-sm", columnWidthClass(col))}
                                title={isObject ? undefined : cellTitle(value)}
                              >
                                {isObject ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 gap-1 px-1.5 font-mono text-xs text-muted-foreground"
                                    onClick={() => setDetail(row)}
                                    aria-label={`Ver ${col}`}
                                  >
                                    <Braces className="h-3 w-3" />
                                    {Array.isArray(value) ? `[${value.length}]` : "{…}"}
                                  </Button>
                                ) : (
                                  <div className="truncate">{renderCell(value)}</div>
                                )}
                              </TableCell>
                            )
                          })}
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
              <div className="flex items-center justify-between gap-3 pr-6">
                <DialogTitle>Registro</DialogTitle>
                <Button variant="outline" size="sm" onClick={copyDetail}>
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  Copiar
                </Button>
              </div>
              <DialogDescription>Vista completa, incluido el payload (solo lectura).</DialogDescription>
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
