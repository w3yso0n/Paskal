"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
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
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Plus, Search, Package } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { getProductSkus, type ApiProductSku } from "@/lib/api"
import { CreateSkuDialog } from "@/components/sku/create-sku-dialog"
import { HookSkuBuilder } from "@/components/sku/hook-sku-builder"
import { HookSkuQuantityEditor } from "@/components/sku/hook-sku-quantity-editor"
import {
  type HookSkuQuantityRule,
} from "@/lib/hook-sku-generator"
import { loadQuantityRules } from "@/lib/hook-sku-quantity-table"
import { toast } from "sonner"

export default function SkuManagementPage() {
  const { getAccessToken } = useAuth()
  const [catalog, setCatalog] = useState<ApiProductSku[]>([])
  const [quantityRules, setQuantityRules] = useState<HookSkuQuantityRule[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    setQuantityRules(loadQuantityRules())
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const token = await getAccessToken()
      if (!token) {
        setCatalog([])
        return
      }
      const skus = await getProductSkus(token)
      setCatalog(skus)
    } catch {
      toast.error("No se pudo cargar el catálogo de SKUs.")
    } finally {
      setLoading(false)
    }
  }, [getAccessToken])

  useEffect(() => {
    load()
  }, [load])

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

  const commonSkus = useMemo(
    () => [...catalog].sort((a, b) => b.usageCount - a.usageCount).slice(0, 12),
    [catalog],
  )

  return (
    <DashboardLayout
      breadcrumbs={[
        { label: "Inicio", href: "/" },
        { label: "Administración" },
        { label: "Gestión de SKUs" },
      ]}
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Gestión de SKUs Hook / Rafía</h1>
            <p className="text-muted-foreground">
              Genera códigos con formato{" "}
              <span className="font-mono text-sm">[gancho][embobinado][metros][color][rafia]</span>
              {" "}— ej. <span className="font-mono text-sm">522pk18+4l-10</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/piso-produccion">Piso de producción</Link>
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Registrar SKU
            </Button>
          </div>
        </div>

        <Tabs defaultValue="generador" className="space-y-4">
          <TabsList>
            <TabsTrigger value="generador">Generador</TabsTrigger>
            <TabsTrigger value="piezas">Piezas por caja</TabsTrigger>
            <TabsTrigger value="registrados">Registrados</TabsTrigger>
          </TabsList>

          <TabsContent value="generador" className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
              <h2 className="mb-1 text-lg font-semibold">Generador de SKU</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                Selecciona características del producto y obtén el código con desglose en tiempo real.
              </p>
              <HookSkuBuilder quantityRules={quantityRules} />
            </div>
          </TabsContent>

          <TabsContent value="piezas">
            <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
              <h2 className="mb-1 text-lg font-semibold">Tabla de piezas por caja</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                Configura la cantidad por combinación de gancho, embobinado, metros, color y rafia m/kg.
                Los cambios se guardan en este navegador.
              </p>
              <HookSkuQuantityEditor rules={quantityRules} onChange={setQuantityRules} />
            </div>
          </TabsContent>

          <TabsContent value="registrados" className="space-y-4">
            {commonSkus.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-4">
                <h2 className="mb-3 text-sm font-semibold">Más usados</h2>
                <div className="flex flex-wrap gap-2">
                  {commonSkus.map((sku) => (
                    <Badge key={sku.id} variant="secondary" className="font-mono text-xs">
                      {sku.code}
                      <span className="ml-1.5 text-muted-foreground">({sku.usageCount}×)</span>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-xl border border-border bg-card p-4">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-lg font-semibold">Catálogo en plataforma</h2>
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
                <p className="py-8 text-center text-muted-foreground">Cargando…</p>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                  <Package className="h-10 w-10 opacity-40" />
                  <p>Sin SKUs registrados.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Gancho</TableHead>
                      <TableHead>Embobinado</TableHead>
                      <TableHead>Metros</TableHead>
                      <TableHead>Color</TableHead>
                      <TableHead className="text-right">Pzas/caja</TableHead>
                      <TableHead className="text-right">Usos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((sku) => (
                      <TableRow key={sku.id}>
                        <TableCell className="font-mono font-medium">{sku.code}</TableCell>
                        <TableCell className="text-sm">{sku.hookType ?? "—"}</TableCell>
                        <TableCell className="text-sm">{sku.extra ?? "—"}</TableCell>
                        <TableCell className="font-mono text-sm">{sku.length ?? "—"}</TableCell>
                        <TableCell className="font-mono text-sm">{sku.color ?? "—"}</TableCell>
                        <TableCell className="text-right">{sku.unitsPerBox}</TableCell>
                        <TableCell className="text-right">{sku.usageCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <CreateSkuDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        quantityRules={quantityRules}
        getAccessToken={getAccessToken}
        onCreated={(sku) => {
          setCatalog((prev) => [sku, ...prev.filter((s) => s.id !== sku.id)])
          load()
        }}
      />
    </DashboardLayout>
  )
}
