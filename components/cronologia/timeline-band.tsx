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
  shortPersonName,
  type LedStatus,
  type MachineAccent,
  type MarkerCluster,
  type PresenceLane,
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
  /** Modo operador: color de identidad por máquina (carriles y etiquetas). */
  machineAccents?: Map<string, MachineAccent>
  /** Modo máquina: carril de presencia por persona (espejo de los carriles por máquina). */
  presenceLanes?: PresenceLane[]
  /** Momento del cambio de turno (16:00): línea vertical punteada en la banda. */
  shiftChangeAt?: Date | null
  /** Clic en la etiqueta de un carril de máquina → cronología de esa máquina. */
  onMachineLaneClick?: (machineCode: string) => void
  /** Clic en la etiqueta de un carril de persona → cronología de esa persona. */
  onPersonLaneClick?: (personCode: string) => void
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
  machineAccents,
  presenceLanes,
  shiftChangeAt,
  onMachineLaneClick,
  onPersonLaneClick,
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

  // Carriles por máquina (modo operador): la persona pasa por varias máquinas y una sola
  // pista mezclaba estatus de máquinas distintas; con 2+ máquinas cada una tiene su carril,
  // etiquetado con su código al arranque.
  const laneCodes = useMemo(() => {
    const codes: string[] = []
    for (const s of statusSegments) {
      const c = s.machineCode
      if (c && !codes.includes(c)) codes.push(c)
    }
    return codes
  }, [statusSegments])
  const multiLane = laneCodes.length > 1
  const LANE_H = 16
  const LANE_SP = 4
  const trackH = multiLane ? laneCodes.length * (LANE_H + LANE_SP) - LANE_SP : TRACK_H

  // Carriles de PRESENCIA por persona (modo máquina, espejo de los carriles por máquina):
  // barras finas debajo de la pista de estatus — quién estaba dentro en cada momento.
  const persons = presenceLanes ?? []
  const P_LANE_H = 14
  const P_LANE_SP = 4
  const personsH = persons.length ? persons.length * (P_LANE_H + P_LANE_SP) - P_LANE_SP + 8 : 0

  const alertsH = alertPack.rows * ROW_H
  const eventsH = eventPack.rows * ROW_H
  const trackTop = alertsH + LANE_GAP
  const personsTop = trackTop + trackH + (persons.length ? 8 : 0)
  const eventsTop = trackTop + trackH + personsH + LANE_GAP
  const axisTop = eventsTop + eventsH + 4
  const totalH = axisTop + AXIS_H

  const nowPct =
    nowMs && nowMs >= bandStart.getTime() && nowMs <= bandEnd.getTime()
      ? bandPositionPct(new Date(nowMs), bandStart, bandEnd)
      : null

  const shiftPct =
    shiftChangeAt &&
    shiftChangeAt.getTime() > bandStart.getTime() &&
    shiftChangeAt.getTime() < bandEnd.getTime()
      ? bandPositionPct(shiftChangeAt, bandStart, bandEnd)
      : null

  // Canalón izquierdo FIJO con las etiquetas de los carriles: fuera del área que scrollea,
  // así se leen con cualquier zoom y nunca tapan las barras que documentan. En modo operador
  // con UNA sola máquina también: la gráfica siempre dice de qué máquina es la pista.
  const singleMachineLane = !multiLane && laneCodes.length === 1
  const hasGutter = multiLane || singleMachineLane || persons.length > 0
  const GUTTER_W = 172

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

      <div className="flex">
        {hasGutter ? (
          <div
            className="relative shrink-0 pr-2"
            style={{ width: GUTTER_W, height: totalH }}
            aria-hidden={false}
          >
            {laneCodes.map((code, li) => {
              const accent = machineAccents?.get(code)
              return (
                <button
                  key={code}
                  type="button"
                  onClick={onMachineLaneClick ? () => onMachineLaneClick(code) : undefined}
                  disabled={!onMachineLaneClick}
                  title={onMachineLaneClick ? `Ver la cronología de ${code}` : undefined}
                  className={cn(
                    "absolute right-2 flex items-center rounded-sm border px-1.5 text-[11px] font-semibold leading-none",
                    accent?.badge ?? "border-border bg-muted text-foreground",
                    onMachineLaneClick &&
                      "hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  )}
                  style={
                    multiLane
                      ? { top: trackTop + li * (LANE_H + LANE_SP), height: LANE_H }
                      : { top: trackTop + (TRACK_H - 20) / 2, height: 20 }
                  }
                >
                  {code}
                </button>
              )
            })}
            {persons.map((lane, li) => (
              <button
                key={lane.code}
                type="button"
                onClick={onPersonLaneClick ? () => onPersonLaneClick(lane.code) : undefined}
                disabled={!onPersonLaneClick}
                title={onPersonLaneClick ? `Ver la cronología de ${lane.name}` : undefined}
                className={cn(
                  "absolute left-0 right-2 flex items-center gap-1.5 rounded-sm px-1 text-left",
                  onPersonLaneClick &&
                    "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
                style={{ top: personsTop + li * (P_LANE_H + P_LANE_SP), height: P_LANE_H }}
              >
                <span className={cn("h-2 w-2 shrink-0 rounded-full", lane.accent.dot)} />
                <span className="min-w-0 truncate text-[11px] font-medium leading-none">
                  {shortPersonName(lane.name)}
                  <span className="text-muted-foreground"> · {lane.role}</span>
                </span>
              </button>
            ))}
          </div>
        ) : null}
        <div ref={scrollRef} className="min-w-0 flex-1 overflow-x-auto pb-1">
        <div className="relative" style={{ height: totalH, width, minWidth: "100%" }}>
          {/* Línea de "ahora": color neutro a propósito — el rojo es de "apagada/sin señal". */}
          {nowPct !== null ? (
            <>
              <div
                className="absolute z-0 w-px bg-foreground/50"
                style={{ left: `${nowPct}%`, top: 10, height: axisTop - 10 }}
                aria-hidden
              />
              <span
                className="absolute z-10 -translate-x-1/2 rounded bg-foreground px-1 py-px text-[9px] font-semibold leading-none text-background"
                style={{ left: `${nowPct}%`, top: 0 }}
              >
                ahora
              </span>
            </>
          ) : null}
          {/* Cambio de turno (16:00): línea punteada — el divisor del listado da el contexto. */}
          {shiftPct !== null ? (
            <div
              className="absolute z-0 w-0 border-l border-dashed border-muted-foreground/50"
              style={{ left: `${shiftPct}%`, top: trackTop - 6, height: axisTop - trackTop + 6 }}
              title="Cambio de turno (16:00)"
              aria-hidden
            />
          ) : null}

          {/* ---- Pista de estatus LED (con 2+ máquinas: un carril por máquina) ---- */}
          <div className="absolute inset-x-0" style={{ top: trackTop, height: trackH }}>
            {multiLane ? (
              laneCodes.map((code, li) => {
                const laneSegs = statusSegments.filter((s) => s.machineCode === code)
                const firstPct = laneSegs.length ? Math.min(...laneSegs.map((s) => s.startPct)) : 0
                const accent = machineAccents?.get(code)
                return (
                  <div
                    key={code}
                    className="absolute inset-x-0 overflow-hidden rounded-sm bg-muted/40 ring-1 ring-border/40"
                    style={{ top: li * (LANE_H + LANE_SP), height: LANE_H }}
                  >
                    {laneSegs.map((seg, i) => (
                      <SegmentButton key={i} seg={seg} />
                    ))}
                  </div>
                )
              })
            ) : (
              <div className="absolute inset-0 overflow-hidden rounded-md bg-muted/40 ring-1 ring-border/60">
                {statusSegments.map((seg, i) => (
                  <SegmentButton key={i} seg={seg} />
                ))}
                {statusSegments.length === 0 ? (
                  <div className="absolute inset-0 flex items-center justify-center text-[11px] text-muted-foreground">
                    Sin datos de estatus
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {/* ---- Carriles de presencia por persona (modo máquina) ---- */}
          {persons.map((lane, li) => {
            const top = personsTop + li * (P_LANE_H + P_LANE_SP)
            return (
              <div
                key={lane.code}
                className="absolute inset-x-0"
                style={{ top, height: P_LANE_H }}
              >
                {lane.intervals.map((iv, i) => {
                  const l = bandPositionPct(iv.from, bandStart, bandEnd)
                  const r = bandPositionPct(iv.to, bandStart, bandEnd)
                  const w = Math.max(r - l, 0.1)
                  return (
                    <Tooltip key={i}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label={`${formatPlantTime(iv.from)}–${formatPlantTime(iv.to)} · ${lane.name} · ${lane.role}`}
                          onClick={
                            onPersonLaneClick ? () => onPersonLaneClick(lane.code) : undefined
                          }
                          className={cn(
                            "absolute inset-y-0 rounded-sm opacity-75",
                            lane.accent.dot,
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:opacity-100",
                          )}
                          style={{ left: `${l}%`, width: `${w}%` }}
                        />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        <div className="font-semibold">
                          {formatPlantTime(iv.from)}–{formatPlantTime(iv.to)}
                        </div>
                        <div>
                          {lane.name} · {lane.role}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  )
                })}
              </div>
            )
          })}

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
                stemFrom={trackTop + trackH + personsH}
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
                stemFrom={trackTop + trackH + personsH}
                stemTo={chipTop}
                chipClass="bg-muted text-muted-foreground ring-background"
                onSelect={onSelect}
              />
            )
          })}

          {/* ---- Eje de tiempo (escala adaptiva al zoom: horas → minutos → segundos) ---- */}
          {/* En los bordes la etiqueta se alinea hacia adentro: centrada se salía del contenedor
              y el overflow la recortaba ("00" en vez de "06:00"). */}
          {ticks.map((tick, i) => (
            <div
              key={tick.label + i}
              className={cn(
                "absolute",
                tick.leftPct < 2 ? "text-left" : tick.leftPct > 98 ? "-translate-x-full text-right" : "-translate-x-1/2 text-center",
              )}
              style={{ left: `${tick.leftPct}%`, top: axisTop }}
            >
              <div className={cn("h-1.5 w-px bg-border", tick.leftPct < 2 ? "ml-0" : tick.leftPct > 98 ? "ml-auto" : "mx-auto")} />
              <span className="text-[10px] tabular-nums text-muted-foreground">{tick.label}</span>
            </div>
          ))}
        </div>
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

/** Tramo de la pista de estatus con su tooltip (rango, estatus, conteo). Compartido entre la
 * pista única (modo máquina) y los carriles por máquina (modo operador). */
function SegmentButton({ seg }: { seg: StatusSegment }) {
  const w = Math.max(seg.endPct - seg.startPct, 0)
  if (w <= 0) return null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`${formatPlantTime(seg.from)}–${formatPlantTime(seg.to)} · ${LED_STATUS_LABELS[seg.status]}`}
          className={cn(
            "absolute inset-y-0 border-r-2 border-background transition-opacity hover:opacity-90",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:z-10",
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
        {/* El conteo va SIEMPRE: aunque el tramo no produjo, ver cuánto llevaba el día en ese
            momento es parte de la historia. */}
        <div className="opacity-80">
          {seg.producedUnits > 0 ? (
            <>
              En este tramo:{" "}
              <span className="font-semibold">+{formatUnits(seg.producedUnits)} pzas</span> ·{" "}
            </>
          ) : null}
          Lleva del día:{" "}
          <span className="font-semibold">{formatUnits(seg.cumulativeValid)} pzas</span>
        </div>
      </TooltipContent>
    </Tooltip>
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
