"use client"

import { useEffect, useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertTriangle, Info } from "lucide-react"
import {
  generateHookSku,
  HOOK_TYPE_OPTIONS,
  RAFIA_M_KG_OPTIONS,
  TWINE_COLOR_OPTIONS,
  WINDING_TYPE_OPTIONS,
  type HookSkuInput,
  type HookSkuQuantityRule,
  type HookSkuResult,
} from "@/lib/hook-sku-generator"
import { cn } from "@/lib/utils"

type HookSkuBuilderProps = {
  quantityRules: HookSkuQuantityRule[]
  className?: string
  onResultChange?: (result: HookSkuResult | null, input: HookSkuInput | null) => void
  initial?: Partial<HookSkuInput>
}

const DEFAULT_INPUT: HookSkuInput = {
  hookType: "metal hook 22 cm",
  windingType: "Turbo Hook",
  mainMeters: 18,
  freeFallMeters: 4,
  hasFreeFall: true,
  colors: ["blue"],
  rafiaMKg: 1000,
}

export function HookSkuBuilder({
  quantityRules,
  className,
  onResultChange,
  initial,
}: HookSkuBuilderProps) {
  const [hookType, setHookType] = useState(DEFAULT_INPUT.hookType)
  const [windingType, setWindingType] = useState(DEFAULT_INPUT.windingType)
  const [mainMeters, setMainMeters] = useState(String(DEFAULT_INPUT.mainMeters))
  const [freeFallMeters, setFreeFallMeters] = useState(String(DEFAULT_INPUT.freeFallMeters ?? 4))
  const [hasFreeFall, setHasFreeFall] = useState(DEFAULT_INPUT.hasFreeFall)
  /** Orden de selección = orden en el código (p.ej. w luego l → w4l4). */
  const [selectedColors, setSelectedColors] = useState<string[]>(() => [...DEFAULT_INPUT.colors])
  const [colorMeters, setColorMeters] = useState<Record<string, string>>({})
  const [rafiaMKg, setRafiaMKg] = useState(String(DEFAULT_INPUT.rafiaMKg))
  const [genError, setGenError] = useState<string | null>(null)

  useEffect(() => {
    if (!initial) return
    if (initial.hookType) setHookType(initial.hookType)
    if (initial.windingType) setWindingType(initial.windingType)
    if (initial.mainMeters != null) setMainMeters(String(initial.mainMeters))
    if (initial.freeFallMeters != null) setFreeFallMeters(String(initial.freeFallMeters))
    if (initial.hasFreeFall != null) setHasFreeFall(initial.hasFreeFall)
    if (initial.colors) setSelectedColors([...initial.colors])
    if (initial.colorMeters) {
      const next: Record<string, string> = {}
      for (const [k, v] of Object.entries(initial.colorMeters)) {
        next[k] = String(v)
      }
      setColorMeters(next)
    }
    if (initial.rafiaMKg != null) setRafiaMKg(String(initial.rafiaMKg))
  }, [initial])

  const multiColor = selectedColors.length >= 2

  const input = useMemo((): HookSkuInput | null => {
    const main = Number(mainMeters)
    const ff = Number(freeFallMeters)
    const rafia = Number(rafiaMKg)
    if (!Number.isFinite(main) || main <= 0) return null
    if (hasFreeFall && (!Number.isFinite(ff) || ff <= 0)) return null
    if (!Number.isFinite(rafia)) return null
    if (selectedColors.length === 0) return null

    let metersMap: Record<string, number> | undefined
    if (multiColor) {
      metersMap = {}
      for (const color of selectedColors) {
        const n = Number(colorMeters[color])
        if (!Number.isFinite(n) || n <= 0) return null
        metersMap[color] = n
      }
    }

    return {
      hookType,
      windingType,
      mainMeters: main,
      freeFallMeters: hasFreeFall ? ff : undefined,
      hasFreeFall,
      colors: selectedColors,
      colorMeters: metersMap,
      rafiaMKg: rafia,
    }
  }, [
    hookType,
    windingType,
    mainMeters,
    freeFallMeters,
    hasFreeFall,
    selectedColors,
    colorMeters,
    multiColor,
    rafiaMKg,
  ])

  const result = useMemo((): HookSkuResult | null => {
    if (!input) {
      setGenError(
        multiColor && selectedColors.some((c) => !colorMeters[c] || Number(colorMeters[c]) <= 0)
          ? "Indica metros de rafia para cada color seleccionado."
          : null,
      )
      return null
    }
    try {
      setGenError(null)
      return generateHookSku(input, quantityRules)
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Error al generar SKU")
      return null
    }
  }, [input, quantityRules, multiColor, selectedColors, colorMeters])

  useEffect(() => {
    onResultChange?.(result, input)
  }, [result, input, onResultChange])

  const toggleColor = (color: string, checked: boolean) => {
    setSelectedColors((prev) => {
      if (checked) {
        if (prev.includes(color)) return prev
        return [...prev, color]
      }
      return prev.filter((c) => c !== color)
    })
    if (!checked) {
      setColorMeters((prev) => {
        const next = { ...prev }
        delete next[color]
        return next
      })
    }
  }

  const setColorMeter = (color: string, value: string) => {
    setColorMeters((prev) => ({ ...prev, [color]: value }))
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Tipo de gancho</Label>
          <Select value={hookType} onValueChange={setHookType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HOOK_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label} ({opt.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Tipo de embobinado</Label>
          <Select value={windingType} onValueChange={setWindingType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WINDING_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label} ({opt.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Metros vuelta principal</Label>
          <Input
            type="number"
            min={0.1}
            step={0.1}
            value={mainMeters}
            onChange={(e) => setMainMeters(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id="has-free-fall"
              checked={hasFreeFall}
              onCheckedChange={(v) => setHasFreeFall(v === true)}
            />
            <Label htmlFor="has-free-fall" className="font-normal">
              Con caída libre (free fall)
            </Label>
          </div>
          {hasFreeFall && (
            <Input
              type="number"
              min={0.1}
              step={0.1}
              value={freeFallMeters}
              onChange={(e) => setFreeFallMeters(e.target.value)}
              placeholder="Metros caída libre"
            />
          )}
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label>Color(es) de rafia</Label>
          <div className="space-y-3 rounded-lg border border-border p-3">
            <div className="flex flex-wrap gap-3">
              {TWINE_COLOR_OPTIONS.map((c) => (
                <label key={c.value} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selectedColors.includes(c.value)}
                    onCheckedChange={(v) => toggleColor(c.value, v === true)}
                  />
                  <span>
                    {c.label}{" "}
                    <span className="font-mono text-muted-foreground">({c.code})</span>
                  </span>
                </label>
              ))}
            </div>

            {multiColor && (
              <div className="space-y-2 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground">
                  Bicolor / multicolor: indica metros de cada color (orden de selección). Ej: white 4 +
                  blue 4 → <span className="font-mono">w4l4</span>
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {selectedColors.map((color) => {
                    const opt = TWINE_COLOR_OPTIONS.find((c) => c.value === color)
                    return (
                      <div key={color} className="flex items-center gap-2">
                        <Label className="w-28 shrink-0 font-normal">
                          {opt?.label ?? color}{" "}
                          <span className="font-mono text-muted-foreground">({opt?.code})</span>
                        </Label>
                        <Input
                          type="number"
                          min={0.1}
                          step={0.1}
                          value={colorMeters[color] ?? ""}
                          onChange={(e) => setColorMeter(color, e.target.value)}
                          placeholder="Metros"
                          className="max-w-32"
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Rafia m/kg</Label>
          <Select value={rafiaMKg} onValueChange={setRafiaMKg}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RAFIA_M_KG_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={String(opt.value)}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {genError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{genError}</AlertDescription>
        </Alert>
      )}

      {result && (
        <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">SKU generado</p>
            <p className="font-mono text-2xl font-bold tracking-tight">{result.sku}</p>
          </div>

          <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <span className="text-muted-foreground">Gancho: </span>
              <span className="font-mono">{result.hookTypeCode}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Embobinado: </span>
              <span className="font-mono">{result.windingTypeCode}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Metros: </span>
              <span className="font-mono">{result.metersCode}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Color: </span>
              <span className="font-mono">{result.colorCode}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Rafia: </span>
              <span className="font-mono">{result.rafiaCode}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Metros totales: </span>
              <span className="font-mono">{result.totalMeters}</span>
            </div>
          </div>

          {result.quantityPerBox != null ? (
            <p className="text-sm">
              <span className="text-muted-foreground">Piezas por caja: </span>
              <span className="font-semibold">{result.quantityPerBox}</span>
            </p>
          ) : (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                {result.quantityError} Indica piezas por caja abajo antes de guardar.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </div>
  )
}
