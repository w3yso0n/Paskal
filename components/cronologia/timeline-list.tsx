"use client"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  alertIcon,
  CRONO_CATALOG,
  formatPlantTime,
  formatUnits,
  type TimelineItem,
} from "@/lib/cronologia"
import { ALERT_SEVERITY_STYLES } from "@/lib/alert-ui"

interface TimelineListProps {
  items: TimelineItem[]
  totalUnits: number
  orphanUnits: number
  /** Item resaltado tras hacer clic en la banda. */
  highlightId?: string | null
  /** Mostrar de qué máquina es cada suceso (modo operador). */
  showMachine?: boolean
}

const BADGE_TONE_CLASSES: Record<string, string> = {
  warning:
    "border-transparent bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  info: "border-transparent bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  neutral: "border-transparent bg-muted text-muted-foreground",
}

/** Lista vertical narrativa: hora, icono con el color del suceso, título y detalle. */
export function TimelineList({
  items,
  totalUnits,
  orphanUnits,
  highlightId,
  showMachine = false,
}: TimelineListProps) {
  if (items.length === 0) return null

  return (
    <div>
      <ol className="relative ml-[104px] border-l border-border">
        {items.map((item) => {
          const catalog = CRONO_CATALOG[item.kind]
          const Icon =
            item.kind === "alert" && item.alertKind ? alertIcon(item.alertKind) : catalog.icon
          const isSpan = Boolean(item.endAt && item.endAt.getTime() > item.at.getTime())
          const timeLabel = isSpan
            ? `${formatPlantTime(item.at)}–${formatPlantTime(item.endAt as Date)}`
            : formatPlantTime(item.at)
          return (
            <li
              key={item.id}
              id={item.id}
              className={cn(
                "relative mb-1 rounded-md py-2.5 pl-8 pr-3 transition-shadow scroll-mt-24",
                highlightId === item.id && "ring-2 ring-ring",
                item.kind === "alert" && item.severity
                  ? ALERT_SEVERITY_STYLES[item.severity].rowTint
                  : null,
              )}
            >
              {/* Hora en columna fija a la izquierda de la línea */}
              <span className="absolute -left-[104px] top-3 w-[92px] text-right text-xs tabular-nums text-muted-foreground">
                {timeLabel}
              </span>
              {/* Icono sobre la línea conectora */}
              <span
                className={cn(
                  "absolute -left-[15px] top-2 flex h-[30px] w-[30px] items-center justify-center rounded-full ring-4 ring-background",
                  catalog.dotClass,
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-medium">{item.title}</span>
                {showMachine && item.machineCode ? (
                  <Badge variant="outline" className="text-[10px]">
                    {item.machineCode}
                  </Badge>
                ) : null}
                {item.badges?.map((badge) => (
                  <Badge
                    key={badge.label}
                    className={cn("text-[10px]", BADGE_TONE_CLASSES[badge.tone])}
                  >
                    {badge.label}
                  </Badge>
                ))}
                {item.kind === "alert" && item.severity ? (
                  <Badge
                    className={cn(
                      "border-transparent text-[10px]",
                      ALERT_SEVERITY_STYLES[item.severity].chipBg,
                      ALERT_SEVERITY_STYLES[item.severity].chipText,
                    )}
                  >
                    {ALERT_SEVERITY_STYLES[item.severity].label}
                  </Badge>
                ) : null}
              </div>
              {item.detail ? (
                <p className="mt-0.5 text-xs text-muted-foreground">{item.detail}</p>
              ) : null}
              {item.cumulativeUnits !== undefined ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Piezas del día hasta aquí:{" "}
                  <span className="font-medium tabular-nums text-foreground">
                    {formatUnits(item.cumulativeUnits)}
                  </span>
                </p>
              ) : null}
            </li>
          )
        })}
      </ol>
      <div className="mt-3 border-t border-border pt-3 pl-[104px] text-sm">
        Total del día:{" "}
        <span className="font-semibold tabular-nums">{formatUnits(totalUnits)} pzas</span>
        {orphanUnits > 0 ? (
          <span className="text-muted-foreground">
            {" "}
            (incluye {formatUnits(orphanUnits)} sin atribuir)
          </span>
        ) : null}
      </div>
    </div>
  )
}
