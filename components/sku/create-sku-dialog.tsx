"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { HookSkuGeneratorPanel } from "@/components/sku/hook-sku-generator-panel"
import type { HookSkuQuantityRule } from "@/lib/hook-sku-generator"
import type { ApiProductSku } from "@/lib/api"

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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nuevo SKU Hook / Rafía</DialogTitle>
          <DialogDescription>
            Formato: [gancho][embobinado][metros][color][rafia]. Ej: 522pk18+4l-10
          </DialogDescription>
        </DialogHeader>

        <HookSkuGeneratorPanel
          quantityRules={quantityRules}
          getAccessToken={getAccessToken}
          onCreated={(sku) => {
            onCreated(sku)
            onOpenChange(false)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
