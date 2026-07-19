"use client"

import { Fragment, type ReactNode } from "react"
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
  type MachineAccent,
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
  /** Color de identidad por máquina (mismo que los carriles de la banda). */
  machineAccents?: Map<string, MachineAccent>
  /** Momento del cambio de turno (16:00): divisor visual en el listado. */
  shiftChangeAt?: Date | null
  /** Saltar a la cronología de esa máquina (modo operador, badge M-###). */
  onMachineClick?: (machineCode: string) => void
  /** Saltar a la cronología de esa persona (modo máquina, nombre del check-in/out). */
  onPersonClick?: (personCode: string) => void
  /** Abrir el diálogo para atribuir las piezas pendientes de este item. */
  onAttribute?: (item: TimelineItem) => void
}

const BADGE_TONE_CLASSES: Record<string, string> = {
  warning:
    "border-transparent bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  info: "border-transparent bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  neutral: "border-transparent bg-muted text-muted-foreground",
}

/** Tinte de fila por severidad, SUAVE: el fondo señala sin dominar el listado (el detalle
 * fuerte de la severidad ya lo dan el chip y el icono de la alerta). */
const ALERT_ROW_TINT: Record<string, string> = {
  critical: "bg-rose-500/[0.07] dark:bg-rose-400/[0.09]",
  high: "bg-rose-500/[0.05] dark:bg-rose-400/[0.07]",
  medium: "bg-amber-400/[0.09] dark:bg-amber-300/[0.07]",
  low: "bg-muted/40",
}

/** Espacio extra ANTES de un renglón, proporcional (sublineal) al tiempo desde el suceso
 * anterior: un hueco de horas se VE más grande que uno de segundos, sin descuadrar la lista. */
function gapSpacing(gapMinutes: number): number {
  if (gapMinutes <= 2) return 0
  return Math.min(64, Math.round(8 * Math.log2(1 + gapMinutes / 5)))
}

function formatGapLabel(gapMinutes: number): string {
  const h = Math.floor(gapMinutes / 60)
  const m = Math.round(gapMinutes % 60)
  if (h <= 0) return `${m} min`
  return m > 0 ? `${h} h ${m} min` : `${h} h`
}

/** Lista vertical narrativa: hora, icono con el color del suceso, título y detalle. */
export function TimelineList({
  items,
  totalUnits,
  orphanUnits,
  highlightId,
  showMachine = false,
  machineAccents,
  shiftChangeAt,
  onMachineClick,
  onPersonClick,
  onAttribute,
}: TimelineListProps) {
  const rows = items
  if (rows.length === 0) return null

  // Riel de producción: columna paralela a la derecha con el acumulado del día AL MOMENTO de
  // cada suceso — el listado se lee a la izquierda y el contador subiendo a la derecha. Solo
  // se resalta cuando el valor avanzó respecto a la fila anterior.
  const hasRail = rows.some((r) => (r.unitsSoFar ?? 0) > 0)

  const shiftMs = shiftChangeAt?.getTime() ?? null
  const nodes: ReactNode[] = []
  let prevEndMs: number | null = null
  let shiftDividerDone = false

  rows.forEach((item, index) => {
    const atMs = item.at.getTime()
    const gapMin = prevEndMs !== null ? Math.max(0, (atMs - prevEndMs) / 60_000) : 0
    const spacing = prevEndMs !== null ? gapSpacing(gapMin) : 0

    // Hueco grande: el espacio lleva su propia marca "N h sin sucesos" (tiempo observado
    // entre eventos reales; no estima nada).
    if (spacing > 0 && gapMin >= 45) {
      nodes.push(
        <li
          key={`gap-${item.id}`}
          aria-hidden
          className="relative flex items-center pl-8"
          style={{ height: Math.max(spacing, 28) }}
        >
          <span className="text-[11px] italic text-muted-foreground/80">
            {formatGapLabel(gapMin)} sin sucesos
          </span>
        </li>,
      )
    }

    // Divisor de cambio de turno (16:00) — solo si la historia cruza esa hora.
    if (
      !shiftDividerDone &&
      shiftMs !== null &&
      prevEndMs !== null &&
      prevEndMs < shiftMs &&
      atMs >= shiftMs
    ) {
      shiftDividerDone = true
      nodes.push(
        <li key="shift-divider" className="relative -left-px flex items-center gap-3 py-3 pl-6">
          <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            Turno vespertino · {formatPlantTime(shiftChangeAt as Date)}
          </span>
          <span className="h-px flex-1 bg-border" aria-hidden />
        </li>,
      )
    }

    const catalog = CRONO_CATALOG[item.kind]
    const Icon = item.kind === "alert" && item.alertKind ? alertIcon(item.alertKind) : catalog.icon
    const isSpan = Boolean(item.endAt && item.endAt.getTime() > item.at.getTime())
    const compact = item.kind === "production_span"
    // Sucesos puntuales con segundos para desempatar los del mismo minuto; los tramos
    // (rangos) siguen en HH:mm.
    const timeLabel = isSpan
      ? `${formatPlantTime(item.at)}–${formatPlantTime(item.endAt as Date)}`
      : formatPlantTimeSeconds(item.at)

    const accent = showMachine && item.machineCode ? machineAccents?.get(item.machineCode) : undefined
    const railChanged =
      typeof item.unitsSoFar === "number" &&
      (index === 0 ? item.unitsSoFar > 0 : item.unitsSoFar !== rows[index - 1].unitsSoFar)

    nodes.push(
      <li
        key={item.id}
        id={item.id}
        tabIndex={-1}
        className={cn(
          "relative rounded-md pl-8 pr-3 transition-shadow scroll-mt-24 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          compact ? "mb-0.5 py-1" : "mb-1 py-2.5",
          highlightId === item.id && "ring-2 ring-ring",
          item.kind === "alert" && item.severity ? ALERT_ROW_TINT[item.severity] : null,
        )}
        style={spacing > 0 && gapMin < 45 ? { marginTop: spacing } : undefined}
      >
        {/* Hora en columna fija a la izquierda de la línea, protagonista: es el eje de la
            historia. El pr-3 la separa del anillo del icono. */}
        <span
          className={cn(
            "absolute -left-[120px] w-[104px] whitespace-nowrap pr-3 text-right tabular-nums",
            compact
              ? "top-1.5 text-xs text-muted-foreground"
              : "top-3 text-[13px] font-semibold text-foreground/85",
          )}
        >
          {timeLabel}
        </span>
        {/* Riel: acumulado del día al momento del suceso, a la derecha de la línea. */}
        {hasRail && typeof item.unitsSoFar === "number" ? (
          <span
            className={cn(
              "absolute -right-[112px] w-[104px] whitespace-nowrap pl-3 text-right text-[13px] tabular-nums",
              compact ? "top-1.5" : "top-3",
              railChanged ? "font-semibold text-foreground" : "text-muted-foreground",
            )}
          >
            {formatUnits(item.unitsSoFar)}
          </span>
        ) : null}
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
          {/* Nombre clicable → cronología de esa persona (modo máquina). */}
          {item.personCode && onPersonClick ? (
            <button
              type="button"
              onClick={() => onPersonClick(item.personCode as string)}
              className={cn(
                "text-left underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none",
                compact ? "text-xs text-muted-foreground" : "text-sm font-semibold",
              )}
              title="Ver la cronología de esta persona"
            >
              {item.title}
            </button>
          ) : (
            <span className={compact ? "text-xs text-muted-foreground" : "text-sm font-semibold"}>
              {item.title}
            </span>
          )}
          {showMachine && item.machineCode ? (
            onMachineClick ? (
              <button
                type="button"
                onClick={() => onMachineClick(item.machineCode as string)}
                className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                title={`Ver la cronología de ${item.machineCode}`}
              >
                <Badge
                  variant="outline"
                  className={cn("cursor-pointer text-[10px] hover:brightness-95", accent?.badge)}
                >
                  {item.machineCode}
                </Badge>
              </button>
            ) : (
              <Badge variant="outline" className={cn("text-[10px]", accent?.badge)}>
                {item.machineCode}
              </Badge>
            )
          ) : null}
          {item.badges?.map((badge) => (
            <Badge key={badge.label} className={cn("text-[10px]", BADGE_TONE_CLASSES[badge.tone])}>
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
              resuelta ·{" "}
              {item.resolvedBy === "auto" ? "automática" : `por ${item.resolvedByName ?? "supervisor"}`}
            </Badge>
          ) : null}
        </div>
        {item.detail ? (
          <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{item.detail}</p>
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
      </li>,
    )

    prevEndMs = Math.max(prevEndMs ?? 0, (item.endAt ?? item.at).getTime())
  })

  return (
    <div className="relative">
      {hasRail ? (
        <>
          <div className="mb-1 text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Producción del día (pzas)
          </div>
          <div className="pointer-events-none absolute bottom-10 right-[96px] top-6 w-px bg-border" />
        </>
      ) : null}
      <ol className={cn("relative ml-[120px] border-l border-border", hasRail && "mr-[112px]")}>
        {nodes}
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
