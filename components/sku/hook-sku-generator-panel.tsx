"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { HookSkuBuilder } from "@/components/sku/hook-sku-builder"
import {
  validateFreeformHookSku,
  type HookSkuInput,
  type HookSkuQuantityRule,
  type HookSkuResult,
} from "@/lib/hook-sku-generator"
import type { ApiProductSku } from "@/lib/api"
import { createProductSku } from "@/lib/api"
import { toast } from "sonner"
import { AlertTriangle, Loader2, Save } from "lucide-react"

type HookSkuGeneratorPanelProps = {
  quantityRules: HookSkuQuantityRule[]
  getAccessToken: () => Promise<string | null>
  onCreated: (sku: ApiProductSku) => void
}

type Mode = "constructor" | "libre"

export function HookSkuGeneratorPanel({
  quantityRules,
  getAccessToken,
  onCreated,
}: HookSkuGeneratorPanelProps) {
  const [mode, setMode] = useState<Mode>("constructor")
  const [result, setResult] = useState<HookSkuResult | null>(null)
  const [input, setInput] = useState<HookSkuInput | null>(null)
  const [freeCode, setFreeCode] = useState("")
  const [unitsOverride, setUnitsOverride] = useState("")
  const [saving, setSaving] = useState(false)

  const freeValidation = useMemo(() => validateFreeformHookSku(freeCode), [freeCode])

  const effectiveUnits =
    unitsOverride.trim() !== ""
      ? Number(unitsOverride)
      : result?.quantityPerBox ?? null

  const canSaveConstructor = Boolean(result)
  const canSaveFree = freeValidation.ok
  const canSave = mode === "constructor" ? canSaveConstructor : canSaveFree

  const handleSave = async () => {
    if (effectiveUnits == null || !Number.isFinite(effectiveUnits) || effectiveUnits < 1) {
      toast.error("Indica piezas por caja antes de guardar.")
      return
    }

    if (mode === "constructor") {
      if (!result || !input) {
        toast.error("Completa los datos para generar el SKU.")
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
      return
    }

    if (!freeValidation.ok) {
      toast.error(freeValidation.message)
      return
    }

    setSaving(true)
    try {
      const token = await getAccessToken()
      if (!token) {
        toast.error("Sesión inválida.")
        return
      }
      const { parts, normalized } = freeValidation
      const created = await createProductSku(token, {
        code: normalized,
        hookType: parts.hookTypeCode,
        color: parts.colorCode,
        length: parts.metersCode,
        extra: parts.windingTypeCode,
        unitsPerBox: Math.round(effectiveUnits),
      })
      toast.success(`SKU ${created.code} registrado.`)
      onCreated(created)
      setFreeCode("")
      setUnitsOverride("")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear el SKU.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <Tabs
        value={mode}
        onValueChange={(v) => setMode(v as Mode)}
        className="space-y-4"
      >
        <TabsList>
          <TabsTrigger value="constructor">Constructor</TabsTrigger>
          <TabsTrigger value="libre">Código libre</TabsTrigger>
        </TabsList>

        <TabsContent value="constructor" className="space-y-4">
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
        </TabsContent>

        <TabsContent value="libre" className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="free-sku-code">Código SKU</Label>
            <Input
              id="free-sku-code"
              value={freeCode}
              onChange={(e) => setFreeCode(e.target.value)}
              placeholder="Ej: 522pk14.5+3.6w4l4-12"
              className="font-mono"
              autoComplete="off"
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground">
              Para códigos que el constructor aún no cubre. Formato laxo: gancho (3 dígitos) +
              embobinado (2 letras) + metros + color + rafia (-NN).
            </p>
          </div>

          {freeCode.trim() && !freeValidation.ok && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{freeValidation.message}</AlertDescription>
            </Alert>
          )}

          {freeValidation.ok && (
            <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  SKU a registrar
                </p>
                <p className="font-mono text-2xl font-bold tracking-tight">
                  {freeValidation.normalized}
                </p>
              </div>
              <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <span className="text-muted-foreground">Gancho: </span>
                  <span className="font-mono">{freeValidation.parts.hookTypeCode}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Embobinado: </span>
                  <span className="font-mono">{freeValidation.parts.windingTypeCode}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Metros: </span>
                  <span className="font-mono">{freeValidation.parts.metersCode}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Color: </span>
                  <span className="font-mono">{freeValidation.parts.colorCode}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Rafia: </span>
                  <span className="font-mono">{freeValidation.parts.rafiaCode}</span>
                </div>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

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
            placeholder={
              mode === "constructor" && result?.quantityPerBox != null
                ? String(result.quantityPerBox)
                : "240"
            }
          />
        </div>

        <Button
          type="button"
          size="lg"
          className="gap-2"
          onClick={handleSave}
          disabled={saving || !canSave}
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
