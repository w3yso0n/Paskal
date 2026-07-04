"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { HookSkuBuilder } from "@/components/sku/hook-sku-builder"
import type { HookSkuInput, HookSkuQuantityRule, HookSkuResult } from "@/lib/hook-sku-generator"
import type { ApiProductSku } from "@/lib/api"
import { createProductSku } from "@/lib/api"
import { toast } from "sonner"
import { Loader2, Save } from "lucide-react"

type HookSkuGeneratorPanelProps = {
  quantityRules: HookSkuQuantityRule[]
  getAccessToken: () => Promise<string | null>
  onCreated: (sku: ApiProductSku) => void
}

export function HookSkuGeneratorPanel({
  quantityRules,
  getAccessToken,
  onCreated,
}: HookSkuGeneratorPanelProps) {
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
      toast.error("Indica piezas por caja antes de guardar.")
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
      setUnitsOverride("")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear el SKU.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
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

      <div className="space-y-4 border-t border-border pt-4">
        <div className="space-y-2 sm:max-w-xs">
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
          {result?.quantityPerBox == null && result && (
            <p className="text-xs text-muted-foreground">
              Sin regla automática para esta combinación: ingresa la cantidad manualmente.
            </p>
          )}
        </div>

        <Button
          type="button"
          size="lg"
          className="gap-2"
          onClick={handleSave}
          disabled={saving || !result}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saving ? "Guardando…" : "Guardar SKU"}
        </Button>
      </div>
    </div>
  )
}
