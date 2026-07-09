"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { RequirePermission } from "@/components/auth/require-permission"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { TextAutocomplete } from "@/components/ui/text-autocomplete"
import {
  Select,
  SelectContent,
  SelectItem,
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
import { useAuth } from "@/contexts/auth-context"
import {
  createManualDataCapture,
  deleteManualDataCapture,
  getEmployees,
  getManualDataCaptures,
  type ApiDataCaptureCategory,
  type ApiEmployee,
  type ApiManualDataCapture,
} from "@/lib/api"
import { ScrapCaptureSection } from "@/components/captura/scrap-capture-section"
import {
  BENDING_MACHINES,
  HISTORICAL_MONTHLY_SOURCE_KEY,
  MONTH_LABELS,
  ROLLER_MACHINES,
  SHIFT_OPTIONS,
  WINDING_MACHINES,
  sourceKeyLabel,
} from "@/lib/data-capture-config"
import { isOperatorRole, isPackerRole } from "@/lib/employee-production-role"
import { ClipboardList, Loader2, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatQty(v: number | null): string {
  if (v == null) return "—"
  return Number.isInteger(v) ? String(v) : v.toLocaleString("es-MX", { maximumFractionDigits: 2 })
}

interface DailyFormState {
  sourceKey: string
  recordDate: string
  shift: string
  sku: string
  operatorCode: string
  packagerCode: string
  productionQty: string
  notes: string
}

function useProductionStaff(employees: ApiEmployee[]) {
  const operators = useMemo(() => {
    const byRole = employees
      .filter((e) => e.status === "active" && isOperatorRole(e.primaryRole))
      .filter((e) => e.employeeCode)
    if (byRole.length > 0) return byRole
    return employees.filter((e) => e.status === "active" && e.employeeCode)
  }, [employees])

  const packers = useMemo(() => {
    const byRole = employees
      .filter((e) => e.status === "active" && isPackerRole(e.primaryRole, e.secondaryRole))
      .filter((e) => e.employeeCode)
    if (byRole.length > 0) return byRole
    return employees.filter((e) => e.status === "active" && e.employeeCode)
  }, [employees])

  const nameByCode = useMemo(() => {
    const map = new Map<string, string>()
    for (const e of employees) {
      if (e.employeeCode) map.set(e.employeeCode, e.fullName)
    }
    return map
  }, [employees])

  return { operators, packers, nameByCode }
}

interface HistoricalFormState {
  recordYear: string
  recordMonth: string
  productionQty: string
  notes: string
}

function DailyCaptureSection({
  category,
  machines,
  title,
  employees,
}: {
  category: ApiDataCaptureCategory
  machines: readonly { key: string; label: string }[]
  title: string
  employees: ApiEmployee[]
}) {
  const { operators, packers, nameByCode } = useProductionStaff(employees)

  const machineOptions = useMemo(
    () => machines.map((m) => ({ value: m.key, label: m.label })),
    [machines],
  )

  const operatorOptions = useMemo(
    () =>
      operators.map((e) => ({
        value: e.employeeCode!,
        label: e.fullName,
        hint: e.employeeCode ?? undefined,
      })),
    [operators],
  )

  const { getAccessToken } = useAuth()
  const [rows, setRows] = useState<ApiManualDataCapture[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<DailyFormState>({
    sourceKey: machines[0]?.key ?? "",
    recordDate: todayIso(),
    shift: "",
    sku: "",
    operatorCode: "",
    packagerCode: "",
    productionQty: "",
    notes: "",
  })

  const packerOptions = useMemo(
    () =>
      packers
        .filter((e) => e.employeeCode !== form.operatorCode)
        .map((e) => ({
          value: e.employeeCode!,
          label: e.fullName,
          hint: e.employeeCode ?? undefined,
        })),
    [packers, form.operatorCode],
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const token = await getAccessToken()
      if (!token) {
        setRows([])
        return
      }
      const data = await getManualDataCaptures(token, { category, limit: 100 })
      setRows(data)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al cargar registros")
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [category, getAccessToken])

  useEffect(() => {
    load()
  }, [load])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const qty = Number(form.productionQty)
    if (!form.sourceKey || !form.recordDate || !form.operatorCode || !form.packagerCode) {
      toast.error("Completa máquina, fecha, operador y empacador.")
      return
    }
    if (form.operatorCode === form.packagerCode) {
      toast.error("El operador y el empacador deben ser distintos.")
      return
    }
    if (!Number.isFinite(qty) || qty < 0) {
      toast.error("Ingresa una producción válida.")
      return
    }
    setSaving(true)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error("Sesión inválida")
      await createManualDataCapture(token, {
        category,
        sourceKey: form.sourceKey,
        recordDate: form.recordDate,
        shift: form.shift || null,
        sku: form.sku.trim() || null,
        operatorCode: form.operatorCode,
        packagerCode: form.packagerCode,
        productionQty: qty,
        notes: form.notes.trim() || null,
      })
      toast.success("Registro guardado")
      setForm((f) => ({ ...f, productionQty: "", sku: "", notes: "" }))
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este registro?")) return
    try {
      const token = await getAccessToken()
      if (!token) throw new Error("Sesión inválida")
      await deleteManualDataCapture(token, id)
      toast.success("Registro eliminado")
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo eliminar")
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Máquina</Label>
              <TextAutocomplete
                value={form.sourceKey}
                onValueChange={(v) => setForm((f) => ({ ...f, sourceKey: v }))}
                options={machineOptions}
                placeholder="Escribe máquina…"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`${category}-date`}>Fecha</Label>
                <Input
                  id={`${category}-date`}
                  type="date"
                  value={form.recordDate}
                  onChange={(e) => setForm((f) => ({ ...f, recordDate: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Turno (opcional)</Label>
                <Select
                  value={form.shift || "__none__"}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, shift: v === "__none__" ? "" : v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sin turno" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sin turno</SelectItem>
                    {SHIFT_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Operador</Label>
                <TextAutocomplete
                  value={form.operatorCode}
                  onValueChange={(code) =>
                    setForm((f) => ({
                      ...f,
                      operatorCode: code,
                      packagerCode: code && f.packagerCode === code ? "" : f.packagerCode,
                    }))
                  }
                  options={operatorOptions}
                  placeholder="Escribe nombre del operador…"
                />
              </div>
              <div className="space-y-2">
                <Label>Empacador</Label>
                <TextAutocomplete
                  value={form.packagerCode}
                  onValueChange={(code) => setForm((f) => ({ ...f, packagerCode: code }))}
                  options={packerOptions}
                  placeholder="Escribe nombre del empacador…"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${category}-sku`}>SKU / producto (opcional)</Label>
              <Input
                id={`${category}-sku`}
                value={form.sku}
                onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value.toUpperCase() }))}
                placeholder="Ej. 522pk18+4l-10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${category}-qty`}>Producción (unidades)</Label>
              <Input
                id={`${category}-qty`}
                type="number"
                min={0}
                step="any"
                value={form.productionQty}
                onChange={(e) => setForm((f) => ({ ...f, productionQty: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${category}-notes`}>Notas</Label>
              <Textarea
                id={`${category}-notes`}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
              />
            </div>
            <Button type="submit" disabled={saving} className="w-full sm:w-auto">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Guardar registro
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Registros recientes</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando…
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin registros aún.</p>
          ) : (
            <div className="max-h-[480px] overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Máquina</TableHead>
                    <TableHead>Operador</TableHead>
                    <TableHead>Empacador</TableHead>
                    <TableHead className="text-right">Prod.</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap">{r.recordDate ?? "—"}</TableCell>
                      <TableCell>{sourceKeyLabel(r.sourceKey)}</TableCell>
                      <TableCell className="max-w-[120px] truncate">
                        {r.operatorCode ? nameByCode.get(r.operatorCode) ?? r.operatorCode : "—"}
                      </TableCell>
                      <TableCell className="max-w-[120px] truncate">
                        {r.packagerCode ? nameByCode.get(r.packagerCode) ?? r.packagerCode : "—"}
                      </TableCell>
                      <TableCell className="text-right">{formatQty(r.productionQty)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(r.id)}
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function HistoricalMonthlySection() {
  const { getAccessToken } = useAuth()
  const currentYear = new Date().getFullYear()
  const [filterYear, setFilterYear] = useState(String(currentYear - 1))
  const [rows, setRows] = useState<ApiManualDataCapture[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<HistoricalFormState>({
    recordYear: String(currentYear - 1),
    recordMonth: "1",
    productionQty: "",
    notes: "",
  })

  const yearOptions = useMemo(() => {
    const years: number[] = []
    for (let y = currentYear; y >= currentYear - 15; y--) years.push(y)
    return years
  }, [currentYear])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const token = await getAccessToken()
      if (!token) {
        setRows([])
        return
      }
      const data = await getManualDataCaptures(token, {
        category: "historical_monthly",
        recordYear: Number(filterYear),
        limit: 200,
      })
      setRows(
        [...data].sort((a, b) => (a.recordMonth ?? 0) - (b.recordMonth ?? 0)),
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al cargar histórico")
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [filterYear, getAccessToken])

  useEffect(() => {
    load()
  }, [load])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const year = Number(form.recordYear)
    const month = Number(form.recordMonth)
    const qty = Number(form.productionQty)
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(qty) || qty < 0) {
      toast.error("Completa año, mes y producción válida.")
      return
    }
    setSaving(true)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error("Sesión inválida")
      await createManualDataCapture(token, {
        category: "historical_monthly",
        sourceKey: HISTORICAL_MONTHLY_SOURCE_KEY,
        recordYear: year,
        recordMonth: month,
        productionQty: qty,
        notes: form.notes.trim() || null,
      })
      toast.success("Producción histórica guardada")
      setForm((f) => ({ ...f, productionQty: "", notes: "" }))
      setFilterYear(String(year))
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este registro histórico?")) return
    try {
      const token = await getAccessToken()
      if (!token) throw new Error("Sesión inválida")
      await deleteManualDataCapture(token, id)
      toast.success("Registro eliminado")
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo eliminar")
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Producción mensual histórica</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Año</Label>
                <Select
                  value={form.recordYear}
                  onValueChange={(v) => setForm((f) => ({ ...f, recordYear: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {yearOptions.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Mes</Label>
                <Select
                  value={form.recordMonth}
                  onValueChange={(v) => setForm((f) => ({ ...f, recordMonth: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTH_LABELS.map((label, i) => (
                      <SelectItem key={label} value={String(i + 1)}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="hist-qty">Producción total del mes (unidades)</Label>
              <Input
                id="hist-qty"
                type="number"
                min={0}
                step="any"
                value={form.productionQty}
                onChange={(e) => setForm((f) => ({ ...f, productionQty: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hist-notes">Notas</Label>
              <Textarea
                id="hist-notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                placeholder="Ej. datos de archivo 2023, incluye winding…"
              />
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Guardar mes histórico
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Registros por año</CardTitle>
          </div>
          <Select value={filterYear} onValueChange={setFilterYear}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando…
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin datos para {filterYear}.</p>
          ) : (
            <div className="max-h-[480px] overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mes</TableHead>
                    <TableHead className="text-right">Producción</TableHead>
                    <TableHead>Notas</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        {r.recordMonth != null ? MONTH_LABELS[r.recordMonth - 1] : "—"}
                      </TableCell>
                      <TableCell className="text-right">{formatQty(r.productionQty)}</TableCell>
                      <TableCell className="max-w-[140px] truncate text-muted-foreground">
                        {r.notes ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(r.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function CapturaDatosPage() {
  const { getAccessToken } = useAuth()
  const [employees, setEmployees] = useState<ApiEmployee[]>([])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const token = await getAccessToken()
        if (!token) {
          if (!cancelled) setEmployees([])
          return
        }
        const rows = await getEmployees(token)
        if (!cancelled) setEmployees(rows)
      } catch {
        if (!cancelled) setEmployees([])
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [getAccessToken])

  return (
    <RequirePermission permissions={["data-capture.manage"]}>
      <DashboardLayout
        breadcrumbs={[
          { label: "Inicio", href: "/" },
          { label: "Captura de datos" },
        ]}
      >
        <div className="space-y-6">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <ClipboardList className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Captura de datos</h1>
            </div>
          </div>

          <Tabs defaultValue="winding" className="space-y-6">
            <TabsList className="flex h-auto flex-wrap gap-1">
              <TabsTrigger value="winding">Winding</TabsTrigger>
              <TabsTrigger value="bending">Bending</TabsTrigger>
              <TabsTrigger value="roller">Roller</TabsTrigger>
              <TabsTrigger value="scrap">Scrap</TabsTrigger>
              <TabsTrigger value="historical">Histórico mensual</TabsTrigger>
            </TabsList>

            <TabsContent value="winding">
              <DailyCaptureSection
                category="winding"
                machines={WINDING_MACHINES}
                employees={employees}
                title="Winding"
              />
            </TabsContent>

            <TabsContent value="bending">
              <DailyCaptureSection
                category="bending"
                machines={BENDING_MACHINES}
                employees={employees}
                title="Bending"
              />
            </TabsContent>

            <TabsContent value="roller">
              <DailyCaptureSection
                category="roller"
                machines={ROLLER_MACHINES}
                employees={employees}
                title="Roller"
              />
            </TabsContent>

            <TabsContent value="scrap">
              <ScrapCaptureSection />
            </TabsContent>

            <TabsContent value="historical">
              <HistoricalMonthlySection />
            </TabsContent>
          </Tabs>
        </div>
      </DashboardLayout>
    </RequirePermission>
  )
}
