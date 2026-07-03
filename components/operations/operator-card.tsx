import { cn } from "@/lib/utils"
import { Crown, Trophy } from "lucide-react"
import type { Operator } from "@/lib/mock-data"

interface OperatorCardProps {
  operator: Operator
  rank: number
  highlighted?: boolean
  density?: "normal" | "compact"
  unitsLabel?: string
  progressTitle?: string
  showSku?: boolean
  showGoalTarget?: boolean
}

export function OperatorCard({
  operator,
  rank,
  highlighted = false,
  density = "normal",
  unitsLabel = "unidades",
  progressTitle = "Bono",
  showSku = true,
  showGoalTarget = false,
}: OperatorCardProps) {
  const isLeader = rank === 1
  const isTopThree = rank <= 3
  const compact = density === "compact"

  const podiumTheme =
    rank === 1
      ? {
          container: "border-amber-300 bg-gradient-to-b from-amber-50 to-white",
          glow: "shadow-md shadow-amber-200/50",
          badge: "bg-amber-500 text-white",
          avatar: "bg-amber-500",
          text: "text-amber-900",
          accent: "text-amber-800",
          bar: "bg-amber-500",
          crown: "text-amber-500 fill-amber-500",
          label: "Oro",
        }
      : rank === 2
        ? {
            container: "border-slate-300 bg-gradient-to-b from-slate-50 to-white",
            glow: "shadow-md shadow-slate-200/60",
            badge: "bg-slate-500 text-white",
            avatar: "bg-slate-500",
            text: "text-slate-900",
            accent: "text-slate-800",
            bar: "bg-slate-500",
            crown: "text-slate-500 fill-slate-500",
            label: "Plata",
          }
        : {
            container: "border-orange-300 bg-gradient-to-b from-orange-50 to-white",
            glow: "shadow-md shadow-orange-200/55",
            badge: "bg-orange-600 text-white",
            avatar: "bg-orange-600",
            text: "text-orange-900",
            accent: "text-orange-800",
            bar: "bg-orange-600",
            crown: "text-orange-600 fill-orange-600",
            label: "Bronce",
          }

  if (isTopThree) {
    return (
      <div
        className={cn(
          "group relative flex w-full flex-col items-center overflow-hidden border",
          compact
            ? "max-w-[250px] rounded-xl p-3"
            : "max-w-[270px] rounded-2xl p-5 transition-transform duration-200 hover:scale-[1.01]",
          podiumTheme.container,
          podiumTheme.glow
        )}
      >
        {/* Subtle shine */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/45 via-white/10 to-transparent" />
        
        {/* Rank badge */}
        <div
          className={cn(
            "absolute flex items-center justify-center rounded-full text-xs font-bold shadow-sm",
            compact ? "right-2 top-2 h-6 w-6" : "right-3 top-3 h-7 w-7",
            podiumTheme.badge
          )}
        >
          {rank}
        </div>

        {/* Medal label */}
        <div
          className={cn(
            "absolute left-3 top-3 inline-flex items-center gap-1 rounded-full border border-white/60 bg-white/80 text-[11px] font-semibold text-foreground shadow-sm",
            compact ? "left-2 top-2 px-1.5 py-0.5" : "px-2 py-1"
          )}
        >
          {isLeader ? (
            <Trophy className={cn("h-3.5 w-3.5", "motion-safe:animate-pulse", podiumTheme.crown)} />
          ) : (
            <Crown className={cn("h-3.5 w-3.5", podiumTheme.crown)} />
          )}
          <span>{podiumTheme.label}</span>
        </div>

        {/* Avatar */}
        <div
          className={cn(
            "flex items-center justify-center rounded-full font-bold text-white shadow-sm",
            compact ? "mt-5 h-11 w-11 text-base" : "mt-8 h-14 w-14 text-lg",
            podiumTheme.avatar
          )}
        >
          {operator.initials}
        </div>

        {/* Name */}
        <span className={cn(compact ? " text-sm font-semibold" : "mt-3 text-base font-semibold", podiumTheme.text)}>
          {operator.name}
        </span>
        <span className={cn("text-xs font-medium", podiumTheme.accent)}>
          #{rank} • {isLeader ? "Líder" : "Top 3"}
        </span>

        {/* Machine (y SKU opcional) */}
        <div className={cn(compact ? "mt-1 flex flex-wrap items-center justify-center gap-1.5" : "mt-2 flex flex-wrap items-center justify-center gap-2")}>
          <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {operator.machine}
          </span>
          {showSku && (
            <span className="rounded bg-cyan-100 px-2 text-xs font-medium text-cyan-700">
              {operator.sku}
            </span>
          )}
        </div>

        {/* Units */}
        <span className={cn(compact ? "mt-2 text-2xl font-bold text-card-foreground" : "mt-4 text-3xl font-bold text-card-foreground")}>
          {operator.units.toLocaleString("es-MX")}
        </span>
        <span className="text-xs text-muted-foreground">{unitsLabel}</span>

        {/* Meta diaria */}
        {(operator.goalRemaining != null || (showGoalTarget && operator.goalTarget != null)) && (
        <div className={cn(compact ? "mt-2 w-full" : "mt-4 w-full")}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{progressTitle}</span>
            <span className="font-semibold text-foreground">
              {operator.goalRemaining == null
                ? "Sin meta"
                : operator.goalRemaining > 0
                  ? `Faltan ${operator.goalRemaining.toLocaleString("es-MX")}`
                  : "Meta alcanzada"}
            </span>
          </div>
          {showGoalTarget && operator.goalTarget != null && operator.goalTarget > 0 && (
            <div className="mb-1 text-center text-[11px] text-muted-foreground">
              {operator.percentage}% de {operator.goalTarget.toLocaleString("es-MX")} piezas
            </div>
          )}

          {/* Progress bar */}
          <div className={cn(compact ? "h-2 w-full overflow-hidden rounded-full bg-black/5" : "h-2.5 w-full overflow-hidden rounded-full bg-black/5")}>
            <div
              className={cn("h-full rounded-full", podiumTheme.bar)}
              style={{ width: `${Math.min(operator.percentage, 100)}%` }}
            />
          </div>
        </div>
        )}
      </div>
    )
  }

  return null
}

interface OperatorRowProps {
  operator: Operator
  rank: number
  density?: "normal" | "compact"
  unitsLabel?: string
  progressTitle?: string
  showSku?: boolean
  showGoalTarget?: boolean
}

export function OperatorRow({
  operator,
  rank,
  density = "normal",
  unitsLabel = "unidades",
  progressTitle = "Bono",
  showSku = true,
  showGoalTarget = false,
}: OperatorRowProps) {
  const compact = density === "compact"
  const hasGoal = operator.goalRemaining != null
  return (
    <div
      className={cn(
        "flex items-center rounded-lg transition-colors hover:bg-muted/40",
        compact ? "gap-3 px-2 py-2" : "gap-3 px-3 py-2.5",
      )}
    >
      {/* Rank */}
      <span
        className={cn(
          "shrink-0 text-center font-semibold text-muted-foreground",
          compact ? "w-6 text-xs" : "w-7 text-sm",
        )}
      >
        {rank}
      </span>

      {/* Avatar */}
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full bg-primary/15 font-bold text-primary",
          compact ? "h-8 w-8 text-xs" : "h-9 w-9 text-sm",
        )}
      >
        {operator.initials}
      </div>

      {/* Name + machine */}
      <div className="min-w-0 flex-1">
        <span className={cn("block truncate font-medium text-foreground", compact ? "text-sm" : "text-base")}>
          {operator.name}
        </span>
        <span
          className={cn(
            "mt-0.5 inline-block truncate rounded bg-primary/10 font-medium text-primary",
            compact ? "max-w-full px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-xs",
          )}
          title={operator.machine}
        >
          {operator.machine}
        </span>
        {showSku && (
          <span className="ml-1.5 inline-block rounded bg-cyan-100 px-1.5 py-0.5 text-[11px] font-medium text-cyan-700">
            {operator.sku}
          </span>
        )}
      </div>

      {/* Units */}
      <div className={cn("shrink-0 text-right", compact ? "w-20" : "w-24")}>
        <span className={cn("block font-bold tabular-nums text-foreground", compact ? "text-sm" : "text-base")}>
          {operator.units.toLocaleString("es-MX")}
        </span>
        <span className="text-[10px] text-muted-foreground">{unitsLabel}</span>
      </div>

      {/* Progress */}
      {(operator.goalRemaining != null || (showGoalTarget && operator.goalTarget != null)) && (
      <div className={cn("shrink-0", compact ? "w-28 sm:w-36" : "w-32 sm:w-40")}>
        <div className="mb-0.5 flex items-center justify-between text-[10px] text-muted-foreground">
          <span className="truncate" title={progressTitle}>
            {progressTitle}
          </span>
          {hasGoal && (
            <span className="font-semibold tabular-nums text-foreground">{operator.percentage}%</span>
          )}
        </div>
        <div className={cn("overflow-hidden rounded-full bg-muted", compact ? "h-2" : "h-2.5")}>
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${Math.min(operator.percentage, 100)}%` }}
          />
        </div>
        {showGoalTarget && operator.goalTarget != null && operator.goalTarget > 0 ? (
          <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
            {hasGoal && operator.goalRemaining != null && operator.goalRemaining > 0
              ? `Faltan ${operator.goalRemaining.toLocaleString("es-MX")}`
              : hasGoal
                ? "Meta alcanzada"
                : "—"}
            {" · "}
            meta {operator.goalTarget.toLocaleString("es-MX")}
          </div>
        ) : (
          <div className="mt-0.5 text-[10px] text-muted-foreground">
            {operator.goalRemaining == null
              ? "—"
              : operator.goalRemaining > 0
                ? `Faltan ${operator.goalRemaining.toLocaleString("es-MX")}`
                : "✓ Meta"}
          </div>
        )}
      </div>
      )}
    </div>
  )
}
