"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { HookSkuBuilder } from "@/components/sku/hook-sku-builder"
import type { HookSkuInput, HookSkuQuantityRule, HookSkuResult } from "@/lib/hook-sku-generator"
import type { ApiProductSku } from "@/lib/api"
import { createProductSku } from "@/lib/api"
import { toast } from "sonner"

type CreateSkuDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  quantityRules: HookSkuQuantityRule[]
  getAccessToken: () => Promise<string | null>
  onCreated: (sku: ApiProductSku) => void
}

export function CreateSkuDialog({
  open,
  onOpenChange,
  quantityRules,
  getAccessToken,
  onCreated,
}: CreateSkuDialogProps) {
  const [result, setResult] = useState<HookSkuResult | null>(null)
  const [input, setInput] = useState<HookSkuInput | null>(null)
  const [unitsOverride, setUnitsOverride] = useState("")
  const [saving, setSaving] = useState(false)

  const effectiveUnits =
    unitsOverride.trim() !== ""
      ? Number(unitsOverride)
      : result?.quantityPerBox ?? null

  const handleSave = async () => {
    if (!result || !input) {
      toast.error("Completa los datos para generar el SKU.")
      return
    }
    if (effectiveUnits == null || !Number.isFinite(effectiveUnits) || effectiveUnits < 1) {
      toast.error("Indica piezas por caja (manual o en tabla de combinaciones).")
      return
    }
    setSaving(true)
    try {
      const token = await getAccessToken()
      if (!token) {
        toast.error("Sesión inválida.")
        return
      }
      const created = await createProductSku(token, {
        code: result.sku,
        hookType: input.hookType,
        color: result.colorCode,
        length: result.metersCode,
        extra: input.windingType,
        unitsPerBox: Math.round(effectiveUnits),
      })
      toast.success(`SKU ${created.code} registrado.`)
      onCreated(created)
      onOpenChange(false)
      setUnitsOverride("")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear el SKU.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nuevo SKU Hook / Rafía</DialogTitle>
          <DialogDescription>
            Formato: [gancho][embobinado][metros][color][rafia]. Ej: 522pk18+4l-10
          </DialogDescription>
        </DialogHeader>

        <HookSkuBuilder
          quantityRules={quantityRules}
          onResultChange={(r, i) => {
            setResult(r)
            setInput(i)
            if (r?.quantityPerBox != null) {
              setUnitsOverride(String(r.quantityPerBox))
            }
          }}
        />

        <div className="space-y-2">
          <Label htmlFor="units-override">Piezas por caja</Label>
          <Input
            id="units-override"
            type="number"
            min={1}
            max={65535}
            value={unitsOverride}
            onChange={(e) => setUnitsOverride(e.target.value)}
            placeholder={result?.quantityPerBox != null ? String(result.quantityPerBox) : "240"}
          />
          {result?.quantityPerBox == null && (
            <p className="text-xs text-amber-700">
              Sin regla en tabla: ingresa la cantidad manualmente antes de guardar.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !result}>
            {saving ? "Guardando…" : "Registrar SKU"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
