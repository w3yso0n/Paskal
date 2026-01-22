"use client"

import Image from "next/image"
import { cn } from "@/lib/utils"
import type { MachineStatus } from "@/lib/mock-data"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface MachineCardProps {
  id: string
  name: string
  status: MachineStatus
  code?: string
  operator?: string
  packer?: string
  production?: number
  onClick?: () => void
  isSelected?: boolean
}

const statusColors = {
  active: "bg-green-500",
  waiting: "bg-yellow-500",
  inactive: "bg-red-500",
}

const statusLabels = {
  active: "Activa",
  waiting: "Esperando",
  inactive: "Inactiva",
}

const statusBorderColors = {
  active: "border-green-500",
  waiting: "border-yellow-500",
  inactive: "border-red-500",
}

export function MachineCard({ 
  id,
  name, 
  status, 
  code,
  operator,
  packer,
  production,
  onClick,
  isSelected 
}: MachineCardProps) {
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
            {/* Status indicator */}
            <div className={cn(
              "absolute -top-1 -right-1 z-10 h-4 w-4 rounded-full border-2 border-white shadow-md",
              statusColors[status]
            )} />
            
            {/* Machine image */}
            <div className="flex flex-col items-center">
              <div className={cn(
                "rounded-lg p-1 transition-colors",
                isSelected && statusBorderColors[status],
                isSelected && "border-2"
              )}>
                <div className="relative h-16 w-32">
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
              {/* Code badge if assigned */}
              {code && (
                <span className="mt-1 rounded bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
                  {code}
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
              <div className={cn("h-2.5 w-2.5 rounded-full", statusColors[status])} />
              <span className="font-semibold text-card-foreground">{name}</span>
              <span className={cn(
                "text-xs px-1.5 py-0.5 rounded",
                status === "active" && "bg-green-100 text-green-700",
                status === "waiting" && "bg-yellow-100 text-yellow-700",
                status === "inactive" && "bg-red-100 text-red-700"
              )}>
                {statusLabels[status]}
              </span>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <div className="flex justify-between gap-4">
                <span>ID:</span>
                <span className="font-medium text-card-foreground">{id}</span>
              </div>
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
              {production !== undefined && (
                <div className="flex justify-between gap-4">
                  <span>Producción hoy:</span>
                  <span className="font-medium text-card-foreground">{production} uds</span>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground pt-1 border-t border-border">
              Click para asignar SKU y personal
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
