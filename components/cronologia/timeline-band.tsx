"use client"

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import { Minus, Plus, RotateCcw } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  bandTicks,
  bandPositionPct,
  formatPlantTime,
  formatPlantTimeSeconds,
  formatUnits,
  packMarkers,
  CRONO_CATALOG,
  LED_STATUS_LABELS,
  alertIcon,
  type LedStatus,
  type MarkerCluster,
  type StatusSegment,
  type TimelineItem,
} from "@/lib/cronologia"
import { ALERT_SEVERITY_STYLES } from "@/lib/alert-ui"
import { MACHINE_STATUS_DOT_COLORS } from "@/components/production/machine-status-dot"

const ZOOM_MIN = 1
const ZOOM_MAX = 8
const ZOOM_STEP = 1.5

interface TimelineBandProps {
  items: TimelineItem[]
  statusSegments: StatusSegment[]
  bandStart: Date
  bandEnd: Date
  /** Marca vertical de "ahora" (solo cuando el día elegido es hoy). */
  nowMs?: number | null
  onSelect: (anchorId: string) => void
}

const CHIP = 28 // diámetro del chip en px
const CHIP_GAP = 6 // separación mínima horizontal antes de bajar de fila
const ROW_H = 34 // alto de cada fila escalonada
const TRACK_H = 34 // alto de la pista de estatus
const LANE_GAP = 10 // aire entre la pista y cada carril de chips
const AXIS_H = 20
const MAX_ALERT_ROWS = 3
const MAX_EVENT_ROWS = 4

const LED_ORDER: LedStatus[] = ["active", "waiting", "maintenance", "inactive"]

/**
 * Banda del cronograma. Eje central = pista de estatus LED de la máquina (mismo código de
 * colores del piso: verde/amarillo/azul/rojo). Encima, las alertas; debajo, los sucesos —
 * ambos como chips grandes con su icono, escalonados en filas para que dos marcas cercanas en
 * el tiempo no se encimen. Hover = detalle; clic = salta al detalle en la lista.
 */
export function TimelineBand({
  items,
  statusSegments,
  bandStart,
  bandEnd,
  nowMs,
  onSelect,
}: TimelineBandProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState(960)
  const [zoom, setZoom] = useState(1)
  // Ancla pendiente para mantener bajo el cursor el mismo punto de tiempo tras un zoom con rueda.
  const pendingAnchor = useRef<{ fraction: number; cursorX: number } | null>(null)

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const update = () => setViewport(el.clientWidth || 960)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Zoom con rueda del mouse / pinch de trackpad, centrado en el cursor. Un swipe horizontal
  // (deltaX dominante) se deja pasar para hacer scroll normal.
  const handleWheel = useCallback((e: WheelEvent) => {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && !e.ctrlKey) return
    e.preventDefault()
    const el = scrollRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const cursorX = e.clientX - rect.left
    const fraction = (el.scrollLeft + cursorX) / (el.scrollWidth || 1)
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
    setZoom((z) => {
      const nz = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +(z * factor).toFixed(3)))
      if (nz !== z) pendingAnchor.current = { fraction, cursorX }
      return nz
    })
  }, [])

  // Listener nativo no-pasivo (React lo adjunta pasivo y no dejaría hacer preventDefault).
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.addEventListener("wheel", handleWheel, { passive: false })
    return () => el.removeEventListener("wheel", handleWheel)
  }, [handleWheel])

  // Tras recalcular el ancho por el zoom, reposiciona el scroll para fijar el punto bajo el cursor.
  useLayoutEffect(() => {
    const el = scrollRef.current
    const a = pendingAnchor.current
    if (el && a) {
      el.scrollLeft = a.fraction * el.scrollWidth - a.cursorX
      pendingAnchor.current = null
    }
  })

  // Ancho interno de la banda = viewport × zoom (a zoom 1 cabe justo; a más, hace scroll y los
  // sucesos cercanos en el tiempo se separan para distinguirse mejor).
  const width = Math.max(viewport * zoom, 680)

  const ticks = useMemo(() => bandTicks(bandStart, bandEnd, width), [bandStart, bandEnd, width])
  const alerts = useMemo(() => items.filter((i) => i.kind === "alert"), [items])
  // La producción normal ya la muestra la pista verde (con delta/total al pasar el mouse), así
  // que NO se repite como chip aquí; solo quedan los sucesos discretos y la huérfana sin atribuir.
  const events = useMemo(
    () => items.filter((i) => i.kind !== "alert" && i.kind !== "production_span"),
    [items],
  )

  const alertPack = useMemo(
    () => packMarkers(alerts, bandStart, bandEnd, width, CHIP, CHIP_GAP, MAX_ALERT_ROWS),
    [alerts, bandStart, bandEnd, width],
  )
  const eventPack = useMemo(
    () => packMarkers(events, bandStart, bandEnd, width, CHIP, CHIP_GAP, MAX_EVENT_ROWS),
    [events, bandStart, bandEnd, width],
  )

  const alertsH = alertPack.rows * ROW_H
  const eventsH = eventPack.rows * ROW_H
  const trackTop = alertsH + LANE_GAP
  const eventsTop = trackTop + TRACK_H + LANE_GAP
  const axisTop = eventsTop + eventsH + 4
  const totalH = axisTop + AXIS_H

  const nowPct =
    nowMs && nowMs >= bandStart.getTime() && nowMs <= bandEnd.getTime()
      ? bandPositionPct(new Date(nowMs), bandStart, bandEnd)
      : null

  return (
    <TooltipProvider delayDuration={100}>
      {/* Control de zoom */}
      <div className="mb-2 flex items-center justify-end gap-1.5">
        <span className="mr-1 text-xs text-muted-foreground">Zoom</span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={() => setZoom((z) => Math.max(ZOOM_MIN, +(z / ZOOM_STEP).toFixed(2)))}
          disabled={zoom <= ZOOM_MIN}
          aria-label="Alejar"
        >
          <Minus className="h-4 w-4" />
        </Button>
        <span className="w-10 text-center text-xs tabular-nums text-muted-foreground">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={() => setZoom((z) => Math.min(ZOOM_MAX, +(z * ZOOM_STEP).toFixed(2)))}
          disabled={zoom >= ZOOM_MAX}
          aria-label="Acercar"
        >
          <Plus className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={() => setZoom(1)}
          disabled={zoom === 1}
          aria-label="Restablecer zoom"
          title="Restablecer"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>

      <div ref={scrollRef} className="overflow-x-auto pb-1">
        <div className="relative" style={{ height: totalH, width, minWidth: "100%" }}>
          {/* Línea de "ahora" detrás de todo */}
          {nowPct !== null ? (
            <div
              className="absolute z-0 w-px bg-red-500/70"
              style={{ left: `${nowPct}%`, top: 0, height: axisTop }}
              aria-hidden
            />
          ) : null}

          {/* ---- Pista de estatus LED ---- */}
          <div
            className="absolute inset-x-0 overflow-hidden rounded-md bg-muted/40 ring-1 ring-border/60"
            style={{ top: trackTop, height: TRACK_H }}
          >
            {statusSegments.map((seg, i) => {
              const w = Math.max(seg.endPct - seg.startPct, 0)
              if (w <= 0) return null
              return (
                <Tooltip key={i}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={`${formatPlantTime(seg.from)}–${formatPlantTime(seg.to)} · ${LED_STATUS_LABELS[seg.status]}`}
                      className={cn(
                        "absolute inset-y-0 border-r-2 border-background transition-opacity hover:opacity-90 focus-visible:outline-none",
                        MACHINE_STATUS_DOT_COLORS[seg.status],
                      )}
                      style={{ left: `${seg.startPct}%`, width: `${w}%` }}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="space-y-0.5 text-xs">
                    <div className="font-semibold">
                      {formatPlantTimeSeconds(seg.from)}–{formatPlantTimeSeconds(seg.to)}
                    </div>
                    <div>
                      {LED_STATUS_LABELS[seg.status]}
                      {seg.machineCode ? ` · ${seg.machineCode}` : ""}
                    </div>
                    {seg.producedUnits > 0 ? (
                      <div className="opacity-80">
                        En este tramo:{" "}
                        <span className="font-semibold">
                          +{formatUnits(seg.producedUnits)} pzas
                        </span>{" "}
                        · Total válido:{" "}
                        <span className="font-semibold">{formatUnits(seg.cumulativeValid)}</span>
                      </div>
                    ) : null}
                  </TooltipContent>
                </Tooltip>
              )
            })}
            {statusSegments.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center text-[11px] text-muted-foreground">
                Sin datos de estatus
              </div>
            ) : null}
          </div>

          {/* ---- Alertas (encima de la pista) ---- */}
          {alertPack.packed.map(({ item, leftPct, row }) => {
            const chipTop = trackTop - LANE_GAP - (row + 1) * ROW_H + (ROW_H - CHIP) / 2
            const Icon = item.alertKind ? alertIcon(item.alertKind) : CRONO_CATALOG.alert.icon
            const sev = item.severity ? ALERT_SEVERITY_STYLES[item.severity] : null
            return (
              <BandChip
                key={item.id}
                item={item}
                leftPct={leftPct}
                chipTop={chipTop}
                stemFrom={chipTop + CHIP}
                stemTo={trackTop}
                icon={<Icon className="h-4 w-4" />}
                chipClass={cn(sev?.chipBg, sev?.chipText, "ring-background")}
                onSelect={onSelect}
              />
            )
          })}
          {alertPack.clusters.map((cluster, i) => {
            const chipTop = trackTop - LANE_GAP - (cluster.row + 1) * ROW_H + (ROW_H - CHIP) / 2
            return (
              <BandCluster
                key={`ac-${i}`}
                cluster={cluster}
                chipTop={chipTop}
                stemFrom={chipTop + CHIP}
                stemTo={trackTop}
                chipClass="bg-rose-100 text-rose-700 ring-background dark:bg-rose-900/40 dark:text-rose-300"
                onSelect={onSelect}
              />
            )
          })}

          {/* ---- Sucesos (debajo de la pista) ---- */}
          {eventPack.packed.map(({ item, leftPct, row }) => {
            const chipTop = eventsTop + row * ROW_H + (ROW_H - CHIP) / 2
            const catalog = CRONO_CATALOG[item.kind]
            const Icon = catalog.icon
            return (
              <BandChip
                key={item.id}
                item={item}
                leftPct={leftPct}
                chipTop={chipTop}
                stemFrom={trackTop + TRACK_H}
                stemTo={chipTop}
                icon={<Icon className="h-4 w-4" />}
                chipClass={cn(catalog.dotClass, "ring-background")}
                onSelect={onSelect}
              />
            )
          })}
          {eventPack.clusters.map((cluster, i) => {
            const chipTop = eventsTop + cluster.row * ROW_H + (ROW_H - CHIP) / 2
            return (
              <BandCluster
                key={`ec-${i}`}
                cluster={cluster}
                chipTop={chipTop}
                stemFrom={trackTop + TRACK_H}
                stemTo={chipTop}
                chipClass="bg-muted text-muted-foreground ring-background"
                onSelect={onSelect}
              />
            )
          })}

          {/* ---- Eje de tiempo (escala adaptiva al zoom: horas → minutos → segundos) ---- */}
          {ticks.map((tick, i) => (
            <div
              key={tick.label + i}
              className="absolute -translate-x-1/2 text-center"
              style={{ left: `${tick.leftPct}%`, top: axisTop }}
            >
              <div className="mx-auto h-1.5 w-px bg-border" />
              <span className="text-[10px] tabular-nums text-muted-foreground">{tick.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ---- Leyenda ---- */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <span className="font-medium text-muted-foreground">Estatus:</span>
        {LED_ORDER.map((s) => (
          <span key={s} className="flex items-center gap-1.5 text-muted-foreground">
            <span className={cn("inline-block h-3 w-4 rounded-sm", MACHINE_STATUS_DOT_COLORS[s])} />
            {LED_STATUS_LABELS[s]}
          </span>
        ))}
        <span className="mx-1 hidden h-4 w-px bg-border sm:inline-block" />
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
          </span>
          Suceso
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
          </span>
          Alerta
        </span>
        <span className="text-muted-foreground/70">Pasa el cursor o haz clic en cualquier marca.</span>
      </div>
    </TooltipProvider>
  )
}

function BandChip({
  item,
  leftPct,
  chipTop,
  stemFrom,
  stemTo,
  icon,
  chipClass,
  onSelect,
}: {
  item: TimelineItem
  leftPct: number
  chipTop: number
  stemFrom: number
  stemTo: number
  icon: React.ReactNode
  chipClass: string
  onSelect: (anchorId: string) => void
}) {
  const label = `${formatPlantTimeSeconds(item.at)} · ${item.title}`
  return (
    <>
      {/* Tallo hacia la pista */}
      <div
        className="absolute z-0 w-px -translate-x-1/2 bg-border"
        style={{
          left: `${leftPct}%`,
          top: Math.min(stemFrom, stemTo),
          height: Math.abs(stemTo - stemFrom),
        }}
        aria-hidden
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            onClick={() => onSelect(item.id)}
            className={cn(
              "absolute z-10 flex -translate-x-1/2 items-center justify-center rounded-full ring-2 shadow-sm transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-ring",
              chipClass,
            )}
            style={{ left: `${leftPct}%`, top: chipTop, height: CHIP, width: CHIP }}
          >
            {icon}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-64 text-xs">
          {label}
        </TooltipContent>
      </Tooltip>
    </>
  )
}

/** Chip "+N" para una ráfaga de sucesos casi simultáneos que no cupieron escalonados. */
function BandCluster({
  cluster,
  chipTop,
  stemFrom,
  stemTo,
  chipClass,
  onSelect,
}: {
  cluster: MarkerCluster
  chipTop: number
  stemFrom: number
  stemTo: number
  chipClass: string
  onSelect: (anchorId: string) => void
}) {
  const first = cluster.items[0]
  return (
    <>
      <div
        className="absolute z-0 w-px -translate-x-1/2 bg-border"
        style={{
          left: `${cluster.leftPct}%`,
          top: Math.min(stemFrom, stemTo),
          height: Math.abs(stemTo - stemFrom),
        }}
        aria-hidden
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`${cluster.items.length} sucesos más alrededor de ${formatPlantTime(first.at)}`}
            onClick={() => onSelect(first.id)}
            className={cn(
              "absolute z-10 flex -translate-x-1/2 items-center justify-center rounded-full text-[11px] font-semibold ring-2 shadow-sm transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-ring",
              chipClass,
            )}
            style={{ left: `${cluster.leftPct}%`, top: chipTop, height: CHIP, width: CHIP }}
          >
            +{cluster.items.length}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-72 text-xs">
          <div className="mb-1 font-semibold">{cluster.items.length} sucesos más aquí:</div>
          <ul className="space-y-0.5">
            {cluster.items.slice(0, 8).map((it) => (
              <li key={it.id}>
                <span className="tabular-nums opacity-70">{formatPlantTimeSeconds(it.at)}</span>{" "}
                {it.title}
              </li>
            ))}
            {cluster.items.length > 8 ? (
              <li className="opacity-70">…y {cluster.items.length - 8} más</li>
            ) : null}
          </ul>
        </TooltipContent>
      </Tooltip>
    </>
  )
}
