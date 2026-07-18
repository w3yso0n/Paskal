"use client"

import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import {
  bandHourTicks,
  bandPositionPct,
  formatPlantTime,
  CRONO_CATALOG,
  type TimelineItem,
} from "@/lib/cronologia"
import { ALERT_SEVERITY_STYLES } from "@/lib/alert-ui"

interface TimelineBandProps {
  items: TimelineItem[]
  bandStart: Date
  bandEnd: Date
  /** Marca vertical de "ahora" (solo cuando el día elegido es hoy). */
  nowMs?: number | null
  onSelect: (anchorId: string) => void
}

/**
 * Banda horizontal del turno: tramos de producción como bloques, sucesos puntuales como
 * marcas y alertas como rombos — mismo lenguaje de color que el listado (CRONO_CATALOG).
 * Posicionamiento por porcentaje de tiempo con divs absolutos (sin librería de gráficos).
 */
export function TimelineBand({ items, bandStart, bandEnd, nowMs, onSelect }: TimelineBandProps) {
  const ticks = bandHourTicks(bandStart, bandEnd)
  const spans = items.filter((i) => i.endAt && (i.kind === "production_span" || i.kind === "orphan_span"))
  const points = items.filter((i) => !i.endAt && i.kind !== "alert")
  const alerts = items.filter((i) => i.kind === "alert")
  const nowPct =
    nowMs && nowMs >= bandStart.getTime() && nowMs <= bandEnd.getTime()
      ? bandPositionPct(new Date(nowMs), bandStart, bandEnd)
      : null

  const spanLabel = (item: TimelineItem) =>
    `${formatPlantTime(item.at)}–${item.endAt ? formatPlantTime(item.endAt) : ""} · ${item.title}`

  return (
    <TooltipProvider delayDuration={100}>
      <div className="overflow-x-auto">
        <div className="relative h-[88px] min-w-[560px] select-none">
          {/* Riel de fondo */}
          <div className="absolute inset-x-0 top-6 h-8 rounded-md bg-muted/60" />

          {/* Tramos de producción */}
          {spans.map((item) => {
            const left = bandPositionPct(item.at, bandStart, bandEnd)
            const right = bandPositionPct(item.endAt as Date, bandStart, bandEnd)
            const width = Math.max(right - left, 0.4)
            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={spanLabel(item)}
                    onClick={() => onSelect(item.id)}
                    className={cn(
                      "absolute top-6 h-8 rounded-sm opacity-80 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      CRONO_CATALOG[item.kind].bandClass,
                    )}
                    style={{ left: `${left}%`, width: `${width}%` }}
                  />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-64 text-xs">
                  {spanLabel(item)}
                </TooltipContent>
              </Tooltip>
            )
          })}

          {/* Sucesos puntuales */}
          {points.map((item) => (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`${formatPlantTime(item.at)} · ${item.title}`}
                  onClick={() => onSelect(item.id)}
                  className={cn(
                    "absolute top-[34px] h-3 w-3 -translate-x-1/2 rounded-full ring-2 ring-background transition-transform hover:scale-125 focus-visible:outline-none focus-visible:ring-ring",
                    CRONO_CATALOG[item.kind].bandClass,
                  )}
                  style={{ left: `${bandPositionPct(item.at, bandStart, bandEnd)}%` }}
                />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-64 text-xs">
                {formatPlantTime(item.at)} · {item.title}
              </TooltipContent>
            </Tooltip>
          ))}

          {/* Alertas (rombos arriba del riel) */}
          {alerts.map((item) => (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`${formatPlantTime(item.at)} · ${item.title}`}
                  onClick={() => onSelect(item.id)}
                  className={cn(
                    "absolute top-1.5 h-2.5 w-2.5 -translate-x-1/2 rotate-45 ring-1 ring-background transition-transform hover:scale-125 focus-visible:outline-none focus-visible:ring-ring",
                    item.severity ? ALERT_SEVERITY_STYLES[item.severity].dot : "bg-rose-500",
                  )}
                  style={{ left: `${bandPositionPct(item.at, bandStart, bandEnd)}%` }}
                />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-64 text-xs">
                {formatPlantTime(item.at)} · {item.title}
              </TooltipContent>
            </Tooltip>
          ))}

          {/* Línea de "ahora" */}
          {nowPct !== null ? (
            <div
              className="absolute top-3 bottom-6 w-px bg-red-500/80"
              style={{ left: `${nowPct}%` }}
              aria-hidden
            />
          ) : null}

          {/* Eje de horas */}
          {ticks.map((tick, i) => (
            <div
              key={tick.label + i}
              className="absolute bottom-0 -translate-x-1/2 text-center"
              style={{ left: `${tick.leftPct}%` }}
            >
              <div className="mx-auto h-1.5 w-px bg-border" />
              {/* Con muchas horas (día completo) se etiqueta cada 2 para que no se encimen. */}
              {ticks.length <= 12 || i % 2 === 0 ? (
                <span className="text-[10px] tabular-nums text-muted-foreground">{tick.label}</span>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {/* Leyenda: qué significa cada forma de la banda. */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded-sm bg-emerald-500" />
          Producción
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded-sm bg-amber-400" />
          Sin atribuir
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-500" />
          Suceso (check-in, reset, SKU…)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rotate-45 bg-rose-500" />
          Alerta
        </span>
        <span className="text-muted-foreground/70">Pasa el cursor o haz clic en cualquier marca.</span>
      </div>
    </TooltipProvider>
  )
}
