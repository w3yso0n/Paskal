"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Plus, RotateCcw, Trash2 } from "lucide-react"
import type { HookSkuQuantityRule } from "@/lib/hook-sku-generator"
import {
  newQuantityRuleId,
  resetQuantityRulesToDefaults,
  saveQuantityRules,
} from "@/lib/hook-sku-quantity-table"
import { toast } from "sonner"

type HookSkuQuantityEditorProps = {
  rules: HookSkuQuantityRule[]
  onChange: (rules: HookSkuQuantityRule[]) => void
}

const EMPTY_ROW: Omit<HookSkuQuantityRule, "id"> = {
  hookTypeCode: "522",
  windingTypeCode: "pk",
  twineLength: "18+4",
  twineColorCode: "l",
  rafiaCode: "-10",
  quantityPerBox: 240,
  notes: "",
}

export function HookSkuQuantityEditor({ rules, onChange }: HookSkuQuantityEditorProps) {
  const [draft, setDraft] = useState(rules)

  useEffect(() => {
    setDraft(rules)
  }, [rules])

  const sync = (next: HookSkuQuantityRule[]) => {
    setDraft(next)
    onChange(next)
    saveQuantityRules(next)
  }

  const updateRow = (id: string, patch: Partial<HookSkuQuantityRule>) => {
    sync(draft.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  const removeRow = (id: string) => {
    sync(draft.filter((r) => r.id !== id))
  }

  const addRow = () => {
    sync([...draft, { ...EMPTY_ROW, id: newQuantityRuleId() }])
  }

  const handleReset = () => {
    const defaults = resetQuantityRulesToDefaults()
    onChange(defaults)
    toast.message("Tabla restaurada a valores por defecto.")
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus className="mr-1 h-4 w-4" />
          Agregar combinación
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={handleReset}>
          <RotateCcw className="mr-1 h-4 w-4" />
          Restaurar defaults
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Gancho</TableHead>
              <TableHead>Emb.</TableHead>
              <TableHead>Metros</TableHead>
              <TableHead>Color</TableHead>
              <TableHead>Rafia</TableHead>
              <TableHead className="w-24">Pzas/caja</TableHead>
              <TableHead>Notas</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {draft.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Input
                    className="h-8 w-16 font-mono text-xs"
                    value={row.hookTypeCode}
                    onChange={(e) =>
                      updateRow(row.id, { hookTypeCode: e.target.value.trim() })
                    }
                  />
                </TableCell>
                <TableCell>
                  <Input
                    className="h-8 w-14 font-mono text-xs"
                    value={row.windingTypeCode}
                    onChange={(e) =>
                      updateRow(row.id, { windingTypeCode: e.target.value.trim() })
                    }
                  />
                </TableCell>
                <TableCell>
                  <Input
                    className="h-8 w-20 font-mono text-xs"
                    value={row.twineLength}
                    onChange={(e) => updateRow(row.id, { twineLength: e.target.value.trim() })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    className="h-8 w-20 font-mono text-xs"
                    value={row.twineColorCode}
                    onChange={(e) =>
                      updateRow(row.id, { twineColorCode: e.target.value.trim() })
                    }
                  />
                </TableCell>
                <TableCell>
                  <Input
                    className="h-8 w-14 font-mono text-xs"
                    value={row.rafiaCode}
                    onChange={(e) => updateRow(row.id, { rafiaCode: e.target.value.trim() })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    className="h-8 w-20 text-xs"
                    type="number"
                    min={1}
                    value={row.quantityPerBox}
                    onChange={(e) =>
                      updateRow(row.id, {
                        quantityPerBox: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                  />
                </TableCell>
                <TableCell>
                  <Input
                    className="h-8 min-w-[120px] text-xs"
                    value={row.notes ?? ""}
                    onChange={(e) => updateRow(row.id, { notes: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => removeRow(row.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
