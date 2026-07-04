"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Loader2, Package, Save, Search } from "lucide-react"
import type { ApiProductSku } from "@/lib/api"
import { updateProductSku } from "@/lib/api"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

type SkuDraft = {
  hookType: string
  extra: string
  length: string
  color: string
  unitsPerBox: string
  isActive: boolean
}

function toDraft(sku: ApiProductSku): SkuDraft {
  return {
    hookType: sku.hookType ?? "",
    extra: sku.extra ?? "",
    length: sku.length ?? "",
    color: sku.color ?? "",
    unitsPerBox: String(sku.unitsPerBox),
    isActive: sku.isActive,
  }
}

function draftChanged(sku: ApiProductSku, draft: SkuDraft): boolean {
  return (
    draft.hookType !== (sku.hookType ?? "") ||
    draft.extra !== (sku.extra ?? "") ||
    draft.length !== (sku.length ?? "") ||
    draft.color !== (sku.color ?? "") ||
    draft.unitsPerBox !== String(sku.unitsPerBox) ||
    draft.isActive !== sku.isActive
  )
}

type SkuCatalogTableProps = {
  catalog: ApiProductSku[]
  loading: boolean
  getAccessToken: () => Promise<string | null>
  onUpdated: (sku: ApiProductSku) => void
}

export function SkuCatalogTable({
  catalog,
  loading,
  getAccessToken,
  onUpdated,
}: SkuCatalogTableProps) {
  const [search, setSearch] = useState("")
  const [drafts, setDrafts] = useState<Record<string, SkuDraft>>({})
  const [savingId, setSavingId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return catalog
    return catalog.filter(
      (s) =>
        s.code.includes(q) ||
        (s.hookType ?? "").toLowerCase().includes(q) ||
        (s.color ?? "").toLowerCase().includes(q) ||
        (s.length ?? "").toLowerCase().includes(q) ||
        (s.extra ?? "").toLowerCase().includes(q),
    )
  }, [catalog, search])

  const getDraft = (sku: ApiProductSku): SkuDraft =>
    drafts[sku.id] ?? toDraft(sku)

  const patchDraft = (id: string, sku: ApiProductSku, patch: Partial<SkuDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...getDraft(sku), ...patch },
    }))
  }

  const handleSave = async (sku: ApiProductSku) => {
    const draft = getDraft(sku)
    const units = Number(draft.unitsPerBox)
    if (!Number.isFinite(units) || units < 1) {
      toast.error("Piezas por caja debe ser un número mayor a 0.")
      return
    }
    if (!draft.hookType.trim() || !draft.color.trim() || !draft.length.trim()) {
      toast.error("Gancho, color y metros son obligatorios.")
      return
    }

    setSavingId(sku.id)
    try {
      const token = await getAccessToken()
      if (!token) {
        toast.error("Sesión inválida.")
        return
      }
      const updated = await updateProductSku(token, sku.id, {
        hookType: draft.hookType.trim(),
        extra: draft.extra.trim() || undefined,
        length: draft.length.trim(),
        color: draft.color.trim(),
        unitsPerBox: Math.round(units),
        isActive: draft.isActive,
      })
      toast.success(`SKU ${updated.code} actualizado.`)
      setDrafts((prev) => {
        const next = { ...prev }
        delete next[sku.id]
        return next
      })
      onUpdated(updated)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el SKU.")
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Catálogo de SKUs</h2>
          <p className="text-sm text-muted-foreground">
            Todos los SKUs registrados en plataforma. Edita piezas por caja y componentes; el
            código se recalcula al guardar.
          </p>
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Buscar código…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <p className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Cargando catálogo…
        </p>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
          <Package className="h-10 w-10 opacity-40" />
          <p>{catalog.length === 0 ? "Sin SKUs registrados." : "Sin coincidencias."}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[140px]">Código</TableHead>
                <TableHead className="min-w-[72px]">Gancho</TableHead>
                <TableHead className="min-w-[72px]">Embob.</TableHead>
                <TableHead className="min-w-[80px]">Metros</TableHead>
                <TableHead className="min-w-[64px]">Color</TableHead>
                <TableHead className="min-w-[88px] text-right">Pzas/caja</TableHead>
                <TableHead className="min-w-[64px] text-right">Usos</TableHead>
                <TableHead className="min-w-[72px] text-center">Activo</TableHead>
                <TableHead className="w-[88px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((sku) => {
                const draft = getDraft(sku)
                const dirty = draftChanged(sku, draft)
                const saving = savingId === sku.id
                return (
                  <TableRow
                    key={sku.id}
                    className={cn(!draft.isActive && "opacity-60 bg-muted/20")}
                  >
                    <TableCell className="font-mono text-sm font-medium">
                      {sku.code}
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8 font-mono text-xs"
                        value={draft.hookType}
                        onChange={(e) =>
                          patchDraft(sku.id, sku, { hookType: e.target.value })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8 font-mono text-xs"
                        value={draft.extra}
                        onChange={(e) => patchDraft(sku.id, sku, { extra: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8 font-mono text-xs"
                        value={draft.length}
                        onChange={(e) => patchDraft(sku.id, sku, { length: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8 font-mono text-xs"
                        value={draft.color}
                        onChange={(e) => patchDraft(sku.id, sku, { color: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8 text-right text-xs tabular-nums"
                        type="number"
                        min={1}
                        max={65535}
                        value={draft.unitsPerBox}
                        onChange={(e) =>
                          patchDraft(sku.id, sku, { unitsPerBox: e.target.value })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {sku.usageCount}
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={draft.isActive}
                        onCheckedChange={(checked) =>
                          patchDraft(sku.id, sku, { isActive: checked })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant={dirty ? "default" : "ghost"}
                        size="sm"
                        className="h-8 gap-1"
                        disabled={!dirty || saving}
                        onClick={() => handleSave(sku)}
                      >
                        {saving ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Save className="h-3.5 w-3.5" />
                        )}
                        Guardar
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        {catalog.length} SKU{catalog.length === 1 ? "" : "s"} en catálogo
        {catalog.filter((s) => !s.isActive).length > 0
          ? ` · ${catalog.filter((s) => !s.isActive).length} inactivo(s)`
          : ""}
      </p>
    </div>
  )
}
