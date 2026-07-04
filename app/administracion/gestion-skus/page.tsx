"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/contexts/auth-context"
import { getProductSkus, type ApiProductSku } from "@/lib/api"
import { HookSkuGeneratorPanel } from "@/components/sku/hook-sku-generator-panel"
import { SkuCatalogTable } from "@/components/sku/sku-catalog-table"
import { type HookSkuQuantityRule } from "@/lib/hook-sku-generator"
import { loadQuantityRules } from "@/lib/hook-sku-quantity-table"
import { toast } from "sonner"

export default function SkuManagementPage() {
  const { getAccessToken } = useAuth()
  const [catalog, setCatalog] = useState<ApiProductSku[]>([])
  const [quantityRules, setQuantityRules] = useState<HookSkuQuantityRule[]>([])
  const [loading, setLoading] = useState(true)

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
      const skus = await getProductSkus(token, { includeInactive: true })
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

  const commonSkus = useMemo(
    () => [...catalog].sort((a, b) => b.usageCount - a.usageCount).slice(0, 12),
    [catalog],
  )

  const handleSkuCreated = (sku: ApiProductSku) => {
    setCatalog((prev) => [sku, ...prev.filter((s) => s.id !== sku.id)])
  }

  const handleSkuUpdated = (sku: ApiProductSku) => {
    setCatalog((prev) => {
      const idx = prev.findIndex((s) => s.id === sku.id)
      if (idx < 0) return [sku, ...prev]
      const next = [...prev]
      next[idx] = sku
      return next
    })
  }

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
          </div>
        </div>

        <Tabs defaultValue="catalogo" className="space-y-4">
          <TabsList>
            <TabsTrigger value="catalogo">Catálogo</TabsTrigger>
            <TabsTrigger value="generador">Generador</TabsTrigger>
          </TabsList>

          <TabsContent value="catalogo" className="space-y-4">
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

            <SkuCatalogTable
              catalog={catalog}
              loading={loading}
              getAccessToken={getAccessToken}
              onUpdated={handleSkuUpdated}
            />
          </TabsContent>

          <TabsContent value="generador" className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
              <h2 className="mb-1 text-lg font-semibold">Generador de SKU</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                Selecciona características del producto, revisa el código generado y guárdalo en el
                catálogo.
              </p>
              <HookSkuGeneratorPanel
                quantityRules={quantityRules}
                getAccessToken={getAccessToken}
                onCreated={handleSkuCreated}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  )
}
