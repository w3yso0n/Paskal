"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
  getScrapMaterialsConfig,
  getScrapSummary,
  type ApiScrapMaterialConfig,
  type ApiScrapSummary,
} from "@/lib/api"
import { MONTH_LABELS } from "@/lib/data-capture-config"
import {
  computeScrapCostMxn,
  computeScrapNetLossForMaterial,
  computeScrapRecoveryForMaterial,
  formatScrapCostMxn,
  scrapCostPerKgMxn,
  scrapSalePricePerKgMxn,
} from "@/lib/scrap-cost"

function formatQty(v: number | null): string {
  if (v == null) return "—"
  return Number.isInteger(v) ? String(v) : v.toLocaleString("es-MX", { maximumFractionDigits: 4 })
}

function formatPct(v: number | null): string {
  if (v == null) return "—"
  return `${v.toLocaleString("es-MX", { maximumFractionDigits: 2 })}%`
}

const FAMILY_LABELS: Record<string, string> = {
  metal: "Metal",
  twine: "Twine / Rafia",
  other: "Otro",
}

type ScrapFormState = {
  recordYear: string
  recordMonth: string
  familyFilter: string
  materialKey: string
  scrapQty: string
  notes: string
}

export function ScrapCaptureSection() {
  const { getAccessToken } = useAuth()
  const currentYear = new Date().getFullYear()
  const [filterYear, setFilterYear] = useState(String(currentYear))
  const [materials, setMaterials] = useState<ApiScrapMaterialConfig[]>([])
  const [summary, setSummary] = useState<ApiScrapSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<ScrapFormState>({
    recordYear: String(currentYear),
    recordMonth: String(new Date().getMonth() + 1),
    familyFilter: "all",
    materialKey: "",
    scrapQty: "",
    notes: "",
  })

  const yearOptions = useMemo(() => {
    const years: number[] = []
    for (let y = currentYear; y >= currentYear - 15; y--) years.push(y)
    return years
  }, [currentYear])

  const activeMaterials = useMemo(
    () => materials.filter((m) => m.active),
    [materials],
  )

  const filteredMaterials = useMemo(() => {
    if (form.familyFilter === "all") return activeMaterials
    return activeMaterials.filter((m) => m.family === form.familyFilter)
  }, [activeMaterials, form.familyFilter])

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

  const loadSummary = useCallback(async () => {
    setLoading(true)
    try {
      const token = await getAccessToken()
      if (!token) {
        setSummary(null)
        return
      }
      await loadMaterials()
      const data = await getScrapSummary(token, { recordYear: Number(filterYear) })
      setSummary(data)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al cargar scrap")
      setSummary(null)
    } finally {
      setLoading(false)
    }
  }, [filterYear, getAccessToken, loadMaterials])

  useEffect(() => {
    loadSummary()
  }, [loadSummary])

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
    const year = Number(form.recordYear)
    const month = Number(form.recordMonth)
    const qty = Number(form.scrapQty)
    if (
      !Number.isFinite(year) ||
      !Number.isFinite(month) ||
      !Number.isFinite(qty) ||
      qty < 0 ||
      !form.materialKey
    ) {
      toast.error("Completa año, mes, material y cantidad de scrap válida (kg).")
      return
    }
    setSaving(true)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error("Sesión inválida")
      await createManualDataCapture(token, {
        category: "scrap",
        sourceKey: form.materialKey,
        recordYear: year,
        recordMonth: month,
        scrapQty: qty,
        notes: form.notes.trim() || null,
      })
      toast.success("Scrap mensual registrado")
      setForm((f) => ({ ...f, scrapQty: "", notes: "" }))
      setFilterYear(String(year))
      await loadSummary()
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
      await loadSummary()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo eliminar")
    }
  }

  const totals = summary?.totals

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Registro mensual de scrap</CardTitle>
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
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Registrar scrap del mes
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle>Resumen de scrap</CardTitle>
              {totals ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  Año {filterYear} · Pérdida neta:{" "}
                  <span className="font-semibold text-destructive">
                    {formatScrapCostMxn(totals.netLossMxn)}
                  </span>
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">Año {filterYear}</p>
              )}
            </div>
            <Select value={filterYear} onValueChange={setFilterYear}>
              <SelectTrigger className="w-[120px]">
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
          <CardContent className="space-y-4">
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando…
              </div>
            ) : !summary || summary.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sin registros de scrap para {filterYear}.
              </p>
            ) : (
              <>
                <div className="grid gap-2 rounded-lg border bg-muted/20 p-3 text-sm sm:grid-cols-2">
                  <div>
                    <span className="text-muted-foreground">Kg total: </span>
                    <span className="font-semibold">{formatQty(totals?.scrapQtyKg ?? 0)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Costo bruto: </span>
                    <span className="font-semibold">
                      {formatScrapCostMxn(totals?.grossCostMxn ?? 0)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Recuperación: </span>
                    <span className="font-semibold text-emerald-700">
                      {formatScrapCostMxn(totals?.recoveryMxn ?? 0)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Pérdida neta: </span>
                    <span className="font-semibold text-destructive">
                      {formatScrapCostMxn(totals?.netLossMxn ?? 0)}
                    </span>
                  </div>
                </div>

                {summary.byFamily.length > 0 && (
                  <div className="space-y-1 text-sm">
                    <p className="font-medium">Por familia</p>
                    {summary.byFamily.map((f) => (
                      <div
                        key={f.family}
                        className="flex flex-wrap justify-between gap-2 rounded border px-2 py-1"
                      >
                        <span>{FAMILY_LABELS[f.family] ?? f.family}</span>
                        <span className="text-muted-foreground">
                          {formatQty(f.scrapQtyKg)} kg · pérdida{" "}
                          {formatScrapCostMxn(f.netLossMxn)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="max-h-[360px] overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Mes</TableHead>
                        <TableHead>Material</TableHead>
                        <TableHead className="text-right">Kg</TableHead>
                        <TableHead className="text-right">Bruto</TableHead>
                        <TableHead className="text-right">Recup.</TableHead>
                        <TableHead className="text-right">Pérdida</TableHead>
                        <TableHead className="text-right">%</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.rows.map((r) => {
                        const monthLabel =
                          MONTH_LABELS[r.recordMonth - 1] ?? r.recordMonth
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="whitespace-nowrap">{monthLabel}</TableCell>
                            <TableCell>{r.materialName}</TableCell>
                            <TableCell className="text-right">{formatQty(r.scrapQtyKg)}</TableCell>
                            <TableCell className="text-right">
                              {r.costConfigured ? formatScrapCostMxn(r.grossCostMxn) : "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              {r.recoveryMxn > 0 ? formatScrapCostMxn(r.recoveryMxn) : "—"}
                            </TableCell>
                            <TableCell className="text-right font-medium text-destructive">
                              {r.costConfigured ? formatScrapCostMxn(r.netLossMxn) : "—"}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {formatPct(r.participationPercent)}
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
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>

                {(summary.topByKg.length > 0 || summary.topByNetLoss.length > 0) && (
                  <div className="grid gap-4 sm:grid-cols-2 text-sm">
                    <div>
                      <p className="mb-1 font-medium">Top por kg</p>
                      {summary.topByKg.map((t) => (
                        <div key={t.sourceKey} className="flex justify-between gap-2">
                          <span className="truncate">{t.materialName}</span>
                          <span>{formatQty(t.scrapQtyKg)} kg</span>
                        </div>
                      ))}
                    </div>
                    <div>
                      <p className="mb-1 font-medium">Top por pérdida neta</p>
                      {summary.topByNetLoss.map((t) => (
                        <div key={t.sourceKey} className="flex justify-between gap-2">
                          <span className="truncate">{t.materialName}</span>
                          <span className="text-destructive">
                            {formatScrapCostMxn(t.netLossMxn)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
