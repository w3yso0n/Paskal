import { cn } from "@/lib/utils"
import type { MachineStatus } from "@/lib/types"
import type { MachineWaitingReason } from "@/components/production/machine-card"

/**
 * Foquito de estado de máquina — espeja el LED físico del equipo.
 * Un solo lenguaje visual para diagrama, KPIs, leyenda y listado:
 *  - Color: verde activa · amarillo esperando · rojo apagada · azul mantenimiento.
 *  - Parpadeo (led-blink): operadora presente pero falta SKU o resetear contador a 0.
 *  - Centro apagado (negro): produciendo (verde/amarillo) sin empacadora marcada,
 *    como el hueco central de la tira de LEDs.
 */

export const MACHINE_STATUS_DOT_COLORS: Record<MachineStatus, string> = {
  active: "bg-green-500",
  waiting: "bg-yellow-500",
  inactive: "bg-red-500",
  maintenance: "bg-blue-500",
}

/** Etiqueta corta del estado (con el motivo del amarillo si aplica). */
export function machineStatusShortLabel(
  status: MachineStatus,
  waitingReason?: MachineWaitingReason,
): string {
  if (status === "waiting") {
    if (waitingReason === "sin_operadora") return "Sin operadora"
    if (waitingReason === "sin_sku") return "Falta SKU"
    if (waitingReason === "contador") return "Contador ≠ 0"
    return "Esperando"
  }
  if (status === "active") return "Activa"
  if (status === "maintenance") return "Mantenimiento"
  return "Apagada / sin señal"
}

interface MachineStatusDotProps {
  status: MachineStatus
  /** Parpadeo LED: falta SKU o resetear contador (con operadora presente). */
  blinking?: boolean
  /** Centro apagado: produciendo sin empacadora marcada. */
  packerGap?: boolean
  /** Tamaño/posición/borde extra del foquito (por defecto h-3 w-3). */
  className?: string
  /** Tamaño del centro apagado (por defecto h-1 w-1). */
  centerClassName?: string
  title?: string
}

export function MachineStatusDot({
  status,
  blinking,
  packerGap,
  className,
  centerClassName,
  title,
}: MachineStatusDotProps) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-3 w-3 shrink-0 items-center justify-center rounded-full",
        MACHINE_STATUS_DOT_COLORS[status],
        blinking && "led-blink",
        className,
      )}
    >
      {packerGap && (
        <span className={cn("h-1 w-1 rounded-full bg-black", centerClassName)} />
      )}
    </span>
  )
}
