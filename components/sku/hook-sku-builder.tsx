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
  const [selectedColors, setSelectedColors] = useState<Set<string>>(
    () => new Set(DEFAULT_INPUT.colors),
  )
  const [rafiaMKg, setRafiaMKg] = useState(String(DEFAULT_INPUT.rafiaMKg))
  const [genError, setGenError] = useState<string | null>(null)

  useEffect(() => {
    if (!initial) return
    if (initial.hookType) setHookType(initial.hookType)
    if (initial.windingType) setWindingType(initial.windingType)
    if (initial.mainMeters != null) setMainMeters(String(initial.mainMeters))
    if (initial.freeFallMeters != null) setFreeFallMeters(String(initial.freeFallMeters))
    if (initial.hasFreeFall != null) setHasFreeFall(initial.hasFreeFall)
    if (initial.colors) setSelectedColors(new Set(initial.colors))
    if (initial.rafiaMKg != null) setRafiaMKg(String(initial.rafiaMKg))
  }, [initial])

  const input = useMemo((): HookSkuInput | null => {
    const main = Number(mainMeters)
    const ff = Number(freeFallMeters)
    const rafia = Number(rafiaMKg)
    if (!Number.isFinite(main) || main <= 0) return null
    if (hasFreeFall && (!Number.isFinite(ff) || ff <= 0)) return null
    if (!Number.isFinite(rafia)) return null
    if (selectedColors.size === 0) return null
    return {
      hookType,
      windingType,
      mainMeters: main,
      freeFallMeters: hasFreeFall ? ff : undefined,
      hasFreeFall,
      colors: [...selectedColors],
      rafiaMKg: rafia,
    }
  }, [
    hookType,
    windingType,
    mainMeters,
    freeFallMeters,
    hasFreeFall,
    selectedColors,
    rafiaMKg,
  ])

  const result = useMemo((): HookSkuResult | null => {
    if (!input) {
      setGenError(null)
      return null
    }
    try {
      setGenError(null)
      return generateHookSku(input, quantityRules)
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Error al generar SKU")
      return null
    }
  }, [input, quantityRules])

  useEffect(() => {
    onResultChange?.(result, input)
  }, [result, input, onResultChange])

  const toggleColor = (color: string, checked: boolean) => {
    setSelectedColors((prev) => {
      const next = new Set(prev)
      if (checked) next.add(color)
      else next.delete(color)
      return next
    })
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
          <div className="flex flex-wrap gap-3 rounded-lg border border-border p-3">
            {TWINE_COLOR_OPTIONS.map((c) => (
              <label key={c.value} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={selectedColors.has(c.value)}
                  onCheckedChange={(v) => toggleColor(c.value, v === true)}
                />
                <span>
                  {c.label}{" "}
                  <span className="font-mono text-muted-foreground">({c.code})</span>
                </span>
              </label>
            ))}
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
