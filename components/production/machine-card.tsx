"use client"

import Image from "next/image"
import { cn } from "@/lib/utils"
import type { MachineStatus } from "@/lib/types"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

/** Motivo del amarillo — espeja el LED físico: fijo = sin operadora; parpadeo = falta SKU o reset. */
export type MachineWaitingReason = "sin_operadora" | "sin_sku" | "contador"

interface MachineCardProps {
  name: string
  status: MachineStatus
  code?: string
  operator?: string
  packer?: string
  production?: number
  /** Solo cuando status === "waiting": por qué está amarilla. */
  waitingReason?: MachineWaitingReason
  onClick?: () => void
  isSelected?: boolean
}

const statusColors = {
  active: "bg-green-500",
  waiting: "bg-yellow-500",
  inactive: "bg-red-500",
  maintenance: "bg-blue-500",
}

const statusLabels = {
  active: "Activa",
  waiting: "Esperando",
  inactive: "Inactiva",
  maintenance: "Mantenimiento",
}

/** Etiquetas específicas del amarillo (mismos estados que el LED del equipo). */
const waitingLabels: Record<MachineWaitingReason, string> = {
  sin_operadora: "Sin operadora",
  sin_sku: "Falta SKU",
  contador: "Contador ≠ 0",
}

const statusBorderColors = {
  active: "border-green-500",
  waiting: "border-yellow-500",
  inactive: "border-red-500",
  maintenance: "border-blue-500",
}

export function MachineCard({
  name,
  status,
  code,
  operator,
  packer,
  production,
  waitingReason,
  onClick,
  isSelected
}: MachineCardProps) {
  // Espeja el LED físico: parpadea cuando hay operadora pero falta SKU o resetear el contador.
  const blinking =
    status === "waiting" && (waitingReason === "sin_sku" || waitingReason === "contador")
  const statusLabel =
    status === "waiting" && waitingReason ? waitingLabels[waitingReason] : statusLabels[status]
  // Como en la tira física: en producción (verde/amarillo), sin empacadora los 2 LEDs
  // centrales se apagan → aquí el foquito se muestra como dona (centro apagado).
  const inProduction = status === "active" || status === "waiting"
  const packerGap = inProduction && !packer
  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClick}
            className={cn(
              "relative flex flex-col items-center rounded-lg p-2 transition-all duration-200",
              "hover:bg-accent/50 hover:scale-105 cursor-pointer",
              "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
              isSelected && "bg-accent ring-2 ring-primary ring-offset-2"
            )}
          >
            {/* Status indicator — parpadea igual que el LED del equipo (falta SKU o reset);
                dona (centro apagado) = sin empacadora, como el hueco central de la tira */}
            <div className={cn(
              "absolute -top-1 -right-1 z-10 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white shadow-md",
              statusColors[status],
              blinking && "animate-pulse"
            )}>
              {packerGap && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
            </div>
            
            {/* Machine image */}
            <div className="flex flex-col items-center">
              <div className={cn(
                "rounded-lg transition-colors",
                isSelected && statusBorderColors[status],
                isSelected && "border-2"
              )}>
                <div className="relative h-14 w-32">
                  <Image
                    src="/images/machine.png"
                    alt={`Máquina ${name}`}
                    fill
                    sizes="128px"
                    className="object-contain"
                    priority={false}
                  />
                </div>
              </div>
              {/* Machine label */}
              <span className="mt-1 rounded bg-gray-700 px-2 py-0.5 text-xs font-medium text-white">
                {name}
              </span>

              {/* Aviso visible bajo el nombre: por qué parpadea (falta SKU o reset a 0) */}
              {blinking && waitingReason && (
                <span className="mt-0.5 max-w-full rounded bg-amber-500 px-1 py-0.5 text-center text-[10px] font-semibold leading-tight text-white">
                  {waitingLabels[waitingReason]}
                </span>
              )}

            </div>
          </button>
        </TooltipTrigger>
        <TooltipContent 
          side="right" 
          className="bg-card border border-border shadow-lg"
        >
          <div className="space-y-2 p-1">
            <div className="flex items-center gap-2">
              <div className={cn(
                "flex h-2.5 w-2.5 items-center justify-center rounded-full",
                statusColors[status],
                blinking && "animate-pulse"
              )}>
                {packerGap && <div className="h-1 w-1 rounded-full bg-card" />}
              </div>
              <span className="font-semibold text-card-foreground">{name}</span>
              <span className={cn(
                "text-xs px-1.5 py-0.5 rounded",
                status === "active" && "bg-green-100 text-green-700",
                status === "waiting" && "bg-yellow-100 text-yellow-700",
                status === "inactive" && "bg-red-100 text-red-700",
                status === "maintenance" && "bg-blue-100 text-blue-700"
              )}>
                {statusLabel}
              </span>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              {code && (
                <div className="flex justify-between gap-4">
                  <span>SKU:</span>
                  <span className="font-medium text-card-foreground">{code}</span>
                </div>
              )}
              {operator && (
                <div className="flex justify-between gap-4">
                  <span>Operador:</span>
                  <span className="font-medium text-card-foreground">{operator}</span>
                </div>
              )}
              {packer && (
                <div className="flex justify-between gap-4">
                  <span>Empacador:</span>
                  <span className="font-medium text-card-foreground">{packer}</span>
                </div>
              )}
              {packerGap && (
                <div className="flex justify-between gap-4">
                  <span>Empacador:</span>
                  <span className="font-medium text-amber-700">sin marcar (centro apagado)</span>
                </div>
              )}
              {production !== undefined && (
                <div className="flex justify-between gap-4">
                  <span>Producción hoy:</span>
                  <span className="font-medium text-card-foreground">{production} uds</span>
                </div>
              )}
            </div>
            {waitingReason === "contador" && (
              <p className="rounded bg-amber-100 px-1.5 py-1 text-xs font-medium text-amber-800">
                ⚠ El contador no está en 0 — resetéalo para pasar a verde.
              </p>
            )}
            {waitingReason === "sin_sku" && (
              <p className="rounded bg-amber-100 px-1.5 py-1 text-xs font-medium text-amber-800">
                ⚠ Operadora presente sin SKU — asígnalo para pasar a verde.
              </p>
            )}
            <p className="text-xs text-muted-foreground pt-1 border-t border-border">
              Click para asignar SKU y personal
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
