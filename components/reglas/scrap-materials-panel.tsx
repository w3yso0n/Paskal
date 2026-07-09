"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Save } from "lucide-react"
import { toast } from "sonner"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAuth } from "@/contexts/auth-context"
import {
  getScrapMaterialsConfig,
  updateScrapMaterialsConfig,
  type ApiScrapMaterialConfig,
  type ApiScrapFamily,
} from "@/lib/api"

const FAMILY_OPTIONS: { value: ApiScrapFamily; label: string }[] = [
  { value: "metal", label: "Metal" },
  { value: "twine", label: "Twine / Rafia" },
  { value: "other", label: "Otro" },
]

export function ScrapMaterialsPanel() {
  const { getAccessToken } = useAuth()
  const [materials, setMaterials] = useState<ApiScrapMaterialConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const token = await getAccessToken()
      if (!token) {
        setMaterials([])
        return
      }
      const cfg = await getScrapMaterialsConfig(token)
      setMaterials(cfg.materials)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al cargar materiales")
      setMaterials([])
    } finally {
      setLoading(false)
    }
  }, [getAccessToken])

  useEffect(() => {
    load()
  }, [load])

  const updateMaterial = (index: number, patch: Partial<ApiScrapMaterialConfig>) => {
    setMaterials((prev) =>
      prev.map((m, i) => (i === index ? { ...m, ...patch } : m)),
    )
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error("Sesión inválida")
      const saved = await updateScrapMaterialsConfig(token, { materials })
      setMaterials(saved.materials)
      toast.success("Configuración de scrap guardada")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="max-w-5xl">
      <CardHeader>
        <CardTitle>Costos de scrap por material</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando…
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead>Familia</TableHead>
                    <TableHead className="text-right">Costo/kg</TableHead>
                    <TableHead className="text-right">Venta scrap/kg</TableHead>
                    <TableHead className="text-right">Peso/pieza</TableHead>
                    <TableHead className="text-center">Activo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {materials.map((m, idx) => (
                    <TableRow key={m.sourceKey}>
                      <TableCell>
                        <div className="space-y-1">
                          <Input
                            value={m.name}
                            onChange={(e) => updateMaterial(idx, { name: e.target.value })}
                            className="h-8 min-w-[140px]"
                          />
                          <span className="text-[10px] text-muted-foreground">{m.sourceKey}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={m.family}
                          onValueChange={(v) =>
                            updateMaterial(idx, { family: v as ApiScrapFamily })
                          }
                        >
                          <SelectTrigger className="h-8 w-[120px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {FAMILY_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={m.costPerKgMxn}
                          onChange={(e) =>
                            updateMaterial(idx, {
                              costPerKgMxn: Number(e.target.value) || 0,
                            })
                          }
                          className="h-8 w-24 text-right"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={m.scrapSalePricePerKgMxn ?? ""}
                          onChange={(e) =>
                            updateMaterial(idx, {
                              scrapSalePricePerKgMxn:
                                e.target.value === "" ? undefined : Number(e.target.value),
                            })
                          }
                          className="h-8 w-24 text-right"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          step="0.0001"
                          placeholder="—"
                          value={m.weightPerPieceKg ?? ""}
                          onChange={(e) =>
                            updateMaterial(idx, {
                              weightPerPieceKg:
                                e.target.value === "" ? undefined : Number(e.target.value),
                            })
                          }
                          className="h-8 w-24 text-right"
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={m.active}
                          onCheckedChange={(checked) => updateMaterial(idx, { active: checked })}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Guardar materiales de scrap
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
