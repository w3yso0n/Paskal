"use client"

import { Fragment } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { UserPlus } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  alertIcon,
  CRONO_CATALOG,
  formatPlantTime,
  formatPlantTimeSeconds,
  formatUnits,
  idleRange,
  type TimelineItem,
} from "@/lib/cronologia"
import { ALERT_SEVERITY_STYLES, buildAlertDetailRows } from "@/lib/alert-ui"

interface TimelineListProps {
  items: TimelineItem[]
  totalUnits: number
  orphanUnits: number
  /** Item resaltado tras hacer clic en la banda. */
  highlightId?: string | null
  /** Mostrar de qué máquina es cada suceso (modo operador). */
  showMachine?: boolean
  /** Abrir el diálogo para atribuir las piezas pendientes de este item. */
  onAttribute?: (item: TimelineItem) => void
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
  onAttribute,
}: TimelineListProps) {
  // Se listan todos los sucesos. La producción normal (production_span) se muestra en formato
  // compacto/tenue para no dominar sobre los sucesos; el delta/total también está en el hover
  // de la barra. La producción sin atribuir (orphan_span) queda prominente (lleva Asignar).
  const rows = items
  if (rows.length === 0) return null

  return (
    <div>
      <ol className="relative ml-[120px] border-l border-border">
        {rows.map((item) => {
          const catalog = CRONO_CATALOG[item.kind]
          const Icon =
            item.kind === "alert" && item.alertKind ? alertIcon(item.alertKind) : catalog.icon
          const isSpan = Boolean(item.endAt && item.endAt.getTime() > item.at.getTime())
          const compact = item.kind === "production_span"
          // Sucesos puntuales con segundos para desempatar los del mismo minuto; los tramos
          // (rangos) siguen en HH:mm.
          const timeLabel = isSpan
            ? `${formatPlantTime(item.at)}–${formatPlantTime(item.endAt as Date)}`
            : formatPlantTimeSeconds(item.at)
          return (
            <li
              key={item.id}
              id={item.id}
              className={cn(
                "relative rounded-md pl-8 pr-3 transition-shadow scroll-mt-24",
                compact ? "mb-0.5 py-1" : "mb-1 py-2.5",
                highlightId === item.id && "ring-2 ring-ring",
                item.kind === "alert" && item.severity
                  ? ALERT_SEVERITY_STYLES[item.severity].rowTint
                  : null,
              )}
            >
              {/* Hora en columna fija a la izquierda de la línea. El pr-3 la separa del
                  anillo del icono, que si no le tapaba el último dígito. */}
              <span
                className={cn(
                  "absolute -left-[120px] w-[104px] whitespace-nowrap pr-3 text-right text-xs tabular-nums text-muted-foreground",
                  compact ? "top-1.5" : "top-3",
                )}
              >
                {timeLabel}
              </span>
              {/* Icono sobre la línea conectora (más chico y tenue en producción) */}
              <span
                className={cn(
                  "absolute flex items-center justify-center rounded-full ring-4 ring-background",
                  compact ? "-left-[9px] top-2 h-[18px] w-[18px]" : "-left-[15px] top-2 h-[30px] w-[30px]",
                  catalog.dotClass,
                )}
              >
                <Icon className={compact ? "h-3 w-3" : "h-4 w-4"} />
              </span>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={compact ? "text-xs text-muted-foreground" : "text-sm font-medium"}>
                  {item.title}
                </span>
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
                {item.resolvedBy ? (
                  <Badge className="border-transparent bg-green-100 text-[10px] text-green-700 dark:bg-green-900/40 dark:text-green-300">
                    resuelta · {item.resolvedBy === "auto" ? "automática" : "por supervisor"}
                  </Badge>
                ) : null}
              </div>
              {item.detail ? (
                <p className="mt-0.5 text-xs text-muted-foreground">{item.detail}</p>
              ) : null}
              {item.resolvesAlertId ? (
                <p className="mt-0.5 text-xs text-emerald-600 dark:text-emerald-400">
                  Resuelve la alerta de producción sin empacador
                </p>
              ) : null}
              {item.kind === "alert" ? <AlertDetail item={item} /> : null}
              {item.attribution && onAttribute ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 h-7 gap-1.5 text-xs"
                  onClick={() => onAttribute(item)}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Asignar {item.attribution.target === "packager" ? "empacador" : "operador"}
                </Button>
              ) : null}
            </li>
          )
        })}
      </ol>
      <div className="mt-3 border-t border-border pt-3 pl-[120px] text-sm">
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

/** Detalle estructurado por causa bajo cada alerta: rango del paro (idle), hora de inicio
 * (horas excedidas), etc. Reutiliza `buildAlertDetailRows`. */
function AlertDetail({ item }: { item: TimelineItem }) {
  if (!item.alertKind) return null
  const rows = buildAlertDetailRows(item.alertKind, item.alertMetadata ?? null)
  const range = idleRange(item)
  const rangeText = range
    ? `${formatPlantTimeSeconds(range.from)} – ${range.to ? formatPlantTimeSeconds(range.to) : "en curso"}`
    : null
  if (!rangeText && rows.length === 0) return null
  return (
    <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
      {rangeText ? (
        <>
          <dt className="font-medium">Paro</dt>
          <dd className="tabular-nums">{rangeText}</dd>
        </>
      ) : null}
      {rows.map((r) => (
        <Fragment key={r.label}>
          <dt className="font-medium">{r.label}</dt>
          <dd>{r.value}</dd>
        </Fragment>
      ))}
    </dl>
  )
}
