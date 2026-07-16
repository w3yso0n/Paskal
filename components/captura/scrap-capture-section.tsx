"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

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
  getManualDataCaptures,
  getScrapMaterialsConfig,
  type ApiManualDataCapture,
  type ApiScrapMaterialConfig,
} from "@/lib/api"
import { ALL_MACHINES, SHIFT_OPTIONS } from "@/lib/data-capture-config"
import {
  computeScrapCostMxn,
  computeScrapNetLossForMaterial,
  computeScrapRecoveryForMaterial,
  formatScrapCostMxn,
  scrapCostPerKgMxn,
  scrapSalePricePerKgMxn,
} from "@/lib/scrap-cost"

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatQty(v: number | null): string {
  if (v == null) return "—"
  return Number.isInteger(v) ? String(v) : v.toLocaleString("es-MX", { maximumFractionDigits: 2 })
}

const FAMILY_LABELS: Record<string, string> = {
  metal: "Metal",
  twine: "Twine / Rafia",
  other: "Otro",
}

type ScrapFormState = {
  recordDate: string
  shift: string
  machineCode: string
  familyFilter: string
  materialKey: string
  scrapQty: string
  notes: string
}

export function ScrapCaptureSection() {
  const { getAccessToken } = useAuth()
  const [materials, setMaterials] = useState<ApiScrapMaterialConfig[]>([])
  const [rows, setRows] = useState<ApiManualDataCapture[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<ScrapFormState>({
    recordDate: todayIso(),
    shift: "",
    machineCode: "",
    familyFilter: "all",
    materialKey: "",
    scrapQty: "",
    notes: "",
  })

  const activeMaterials = useMemo(
    () => materials.filter((m) => m.active),
    [materials],
  )

  const filteredMaterials = useMemo(() => {
    if (form.familyFilter === "all") return activeMaterials
    return activeMaterials.filter((m) => m.family === form.familyFilter)
  }, [activeMaterials, form.familyFilter])

  const machineOptions = useMemo(
    () => ALL_MACHINES.map((m) => ({ value: m.key, label: m.label })),
    [],
  )

  const loadMaterials = useCallback(async () => {
    const token = await getAccessToken()
    if (!token) {
      setMaterials([])
      return
    }
    const cfg = await getScrapMaterialsConfig(token)
    setMaterials(cfg.materials)
    setForm((f) => {
      const first = cfg.materials.find((m) => m.active)
      return {
        ...f,
        materialKey: f.materialKey || first?.sourceKey || "",
      }
    })
  }, [getAccessToken])

  const loadRecords = useCallback(async () => {
    setLoading(true)
    try {
      const token = await getAccessToken()
      if (!token) {
        setRows([])
        return
      }
      await loadMaterials()
      const data = await getManualDataCaptures(token, { category: "scrap", limit: 100 })
      setRows(data)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al cargar registros de scrap")
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [getAccessToken, loadMaterials])

  useEffect(() => {
    loadRecords()
  }, [loadRecords])

  const previewKg = Number(form.scrapQty)
  const previewCostRate = scrapCostPerKgMxn(form.materialKey, materials)
  const previewSaleRate = scrapSalePricePerKgMxn(form.materialKey, materials)
  const previewGross = computeScrapCostMxn(
    Number.isFinite(previewKg) ? previewKg : 0,
    form.materialKey,
    materials,
  )
  const previewRecovery = computeScrapRecoveryForMaterial(
    Number.isFinite(previewKg) ? previewKg : 0,
    form.materialKey,
    materials,
  )
  const previewNet = computeScrapNetLossForMaterial(
    Number.isFinite(previewKg) ? previewKg : 0,
    form.materialKey,
    materials,
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const qty = Number(form.scrapQty)
    if (!form.recordDate || !form.materialKey) {
      toast.error("Completa fecha y material de scrap.")
      return
    }
    if (!Number.isFinite(qty) || qty < 0) {
      toast.error("Ingresa una cantidad de scrap válida (kg).")
      return
    }
    setSaving(true)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error("Sesión inválida")
      
      const recordDateObj = new Date(form.recordDate)
      await createManualDataCapture(token, {
        category: "scrap",
        sourceKey: form.materialKey,
        recordDate: form.recordDate,
        recordYear: recordDateObj.getFullYear(),
        recordMonth: recordDateObj.getMonth() + 1,
        shift: form.shift || null,
        machineCode: form.machineCode || null,
        scrapQty: qty,
        notes: form.notes.trim() || null,
      })
      toast.success("Scrap registrado")
      setForm((f) => ({ ...f, scrapQty: "", notes: "" }))
      await loadRecords()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este registro de scrap?")) return
    try {
      const token = await getAccessToken()
      if (!token) throw new Error("Sesión inválida")
      await deleteManualDataCapture(token, id)
      toast.success("Registro eliminado")
      await loadRecords()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo eliminar")
    }
  }

  const materialNameByKey = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of materials) {
      map.set(m.sourceKey, m.name)
    }
    return map
  }, [materials])

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Registro de scrap diario</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="scrap-date">Fecha</Label>
                <Input
                  id="scrap-date"
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
            <div className="space-y-2">
              <Label>Máquina (opcional)</Label>
              <TextAutocomplete
                value={form.machineCode}
                onValueChange={(v) => setForm((f) => ({ ...f, machineCode: v }))}
                options={machineOptions}
                placeholder="Seleccionar máquina (opcional)…"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Familia</Label>
                <Select
                  value={form.familyFilter}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      familyFilter: v,
                      materialKey:
                        v === "all"
                          ? activeMaterials[0]?.sourceKey ?? ""
                          : activeMaterials.find((m) => m.family === v)?.sourceKey ?? "",
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="metal">Metal</SelectItem>
                    <SelectItem value="twine">Twine / Rafia</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Material</Label>
                <Select
                  value={form.materialKey}
                  onValueChange={(v) => setForm((f) => ({ ...f, materialKey: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar material" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredMaterials.map((m) => (
                      <SelectItem key={m.sourceKey} value={m.sourceKey}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="scrap-qty">Scrap (kg)</Label>
              <Input
                id="scrap-qty"
                type="number"
                min={0}
                step="any"
                value={form.scrapQty}
                onChange={(e) => setForm((f) => ({ ...f, scrapQty: e.target.value }))}
                required
              />
            </div>
            <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm space-y-1">
              <p>
                Costo por kg:{" "}
                <span className="font-medium">
                  {previewCostRate > 0 ? formatScrapCostMxn(previewCostRate) : "Sin configurar"}
                </span>
              </p>
              <p>
                Recuperación por kg:{" "}
                <span className="font-medium">
                  {previewSaleRate > 0 ? formatScrapCostMxn(previewSaleRate) : "—"}
                </span>
              </p>
              <p>
                Costo bruto estimado:{" "}
                <span className="font-semibold">
                  {previewCostRate > 0 ? formatScrapCostMxn(previewGross) : "—"}
                </span>
              </p>
              <p>
                Recuperación estimada:{" "}
                <span className="font-medium text-emerald-700">
                  {previewSaleRate > 0 ? formatScrapCostMxn(previewRecovery) : "—"}
                </span>
              </p>
              <p>
                Pérdida neta estimada:{" "}
                <span className="font-semibold text-destructive">
                  {previewCostRate > 0 ? formatScrapCostMxn(previewNet) : "—"}
                </span>
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="scrap-notes">Notas / causa</Label>
              <Textarea
                id="scrap-notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
                placeholder="Ej. defecto de laminado, recorte de borde…"
              />
            </div>
            <Button type="submit" disabled={saving} className="w-full sm:w-auto">
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Registrar scrap
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
            <p className="text-sm text-muted-foreground">Sin registros de scrap aún.</p>
          ) : (
            <div className="max-h-[560px] overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Máquina</TableHead>
                    <TableHead>Turno</TableHead>
                    <TableHead>Material</TableHead>
                    <TableHead className="text-right">Kg</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap">
                        {r.recordDate ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-[100px] truncate">
                        {r.machineCode ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-[100px] truncate">
                        {r.shift === "matutino" ? "Matutino" : r.shift === "vespertino" ? "Vespertino" : "—"}
                      </TableCell>
                      <TableCell className="max-w-[120px] truncate">
                        {materialNameByKey.get(r.sourceKey) ?? r.sourceKey}
                      </TableCell>
                      <TableCell className="text-right">{formatQty(r.scrapQty)}</TableCell>
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
