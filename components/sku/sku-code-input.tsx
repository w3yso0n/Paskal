"use client"

import { useMemo } from "react"
import { AlertTriangle } from "lucide-react"
import { TextAutocomplete, type TextAutocompleteOption } from "@/components/ui/text-autocomplete"
import { normalizeSkuCode, isSkuRegistered } from "@/lib/sku-catalog"
import type { ApiProductSku } from "@/lib/api"
import { cn } from "@/lib/utils"

type SkuCodeInputProps = {
  id?: string
  value: string
  onValueChange: (value: string) => void
  catalog: ApiProductSku[]
  placeholder?: string
  disabled?: boolean
  className?: string
  inputClassName?: string
}

export function SkuCodeInput({
  id,
  value,
  onValueChange,
  catalog,
  placeholder = "Selecciona o escribe SKU…",
  disabled,
  className,
  inputClassName,
}: SkuCodeInputProps) {
  const normalized = normalizeSkuCode(value)
  const registered = isSkuRegistered(normalized, catalog)

  const options = useMemo<TextAutocompleteOption[]>(() => {
    const fromCatalog = [...catalog]
      .sort((a, b) => b.usageCount - a.usageCount || a.code.localeCompare(b.code))
      .map((sku) => {
        const code = normalizeSkuCode(sku.code)
        return {
          value: code,
          label: sku.code,
          hint: `${sku.unitsPerBox} pzas/caja · usado ${sku.usageCount}×`,
        }
      })

    if (normalized && !registered) {
      const display = value.trim() || normalized
      return [
        {
          value: normalized,
          label: display,
          hint: "Asignado · no registrado en catálogo",
        },
        ...fromCatalog,
      ]
    }
    return fromCatalog
  }, [catalog, normalized, registered, value])

  const showWarning = Boolean(normalized) && !registered

  return (
    <div className={cn("space-y-1", className)}>
      <TextAutocomplete
        id={id}
        value={normalized}
        onValueChange={(next) => onValueChange(normalizeSkuCode(next))}
        options={options}
        placeholder={placeholder}
        disabled={disabled}
        inputClassName={cn(showWarning && "border-amber-400 focus-visible:ring-amber-400", inputClassName)}
      />
      {showWarning && (
        <p className="flex items-start gap-1.5 text-xs text-amber-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Este SKU está asignado pero no está en el catálogo. Regístralo en Gestión de SKUs o cámbialo aquí.
        </p>
      )}
    </div>
  )
}

export function skuUnitsPerBox(catalog: ApiProductSku[], code: string | undefined): number | undefined {
  const normalized = normalizeSkuCode(code ?? "")
  if (!normalized) return undefined
  return catalog.find((s) => normalizeSkuCode(s.code) === normalized)?.unitsPerBox
}
