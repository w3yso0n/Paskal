import { cn } from "@/lib/utils"
import { Crown, Trophy } from "lucide-react"
import type { Operator } from "@/lib/mock-data"

interface OperatorCardProps {
  operator: Operator
  rank: number
  highlighted?: boolean
  density?: "normal" | "compact"
  showSku?: boolean
  showGoalTarget?: boolean
}

export function OperatorCard({
  operator,
  rank,
  density = "normal",
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

  if (!isTopThree) return null

  const showGoal =
    operator.goalRemaining != null || (showGoalTarget && operator.goalTarget != null)

  return (
    <div
      className={cn(
        "group relative flex h-full w-full flex-col items-center overflow-hidden border",
        compact ? "rounded-xl p-4" : "rounded-2xl p-5 transition-transform duration-200 hover:scale-[1.01]",
        podiumTheme.container,
        podiumTheme.glow,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/45 via-white/10 to-transparent" />

      <div
        className={cn(
          "absolute flex items-center justify-center rounded-full font-bold shadow-sm",
          compact ? "right-2 top-2 h-7 w-7 text-sm" : "right-3 top-3 h-8 w-8",
          podiumTheme.badge,
        )}
      >
        {rank}
      </div>

      <div
        className={cn(
          "absolute inline-flex items-center gap-1 rounded-full border border-white/60 bg-white/80 font-semibold text-foreground shadow-sm",
          compact ? "left-2 top-2 px-2 py-1 text-xs" : "left-3 top-3 px-2.5 py-1 text-sm",
        )}
      >
        {isLeader ? (
          <Trophy className={cn("h-3.5 w-3.5", "motion-safe:animate-pulse", podiumTheme.crown)} />
        ) : (
          <Crown className={cn("h-3.5 w-3.5", podiumTheme.crown)} />
        )}
        <span>{podiumTheme.label}</span>
      </div>

      <div
        className={cn(
          "flex items-center justify-center rounded-full font-bold text-white shadow-sm",
          compact ? "mt-8 h-12 w-12 text-lg" : "mt-10 h-14 w-14 text-xl",
          podiumTheme.avatar,
        )}
      >
        {operator.initials}
      </div>

      <span className={cn("mt-3 text-center font-semibold", compact ? "text-base" : "text-lg", podiumTheme.text)}>
        {operator.name}
      </span>
      <span className={cn("text-sm font-medium", podiumTheme.accent)}>
        #{rank} · {isLeader ? "Líder" : "Top 3"}
      </span>

      <span className="mt-1 rounded bg-primary/10 px-2 py-0.5 text-sm font-medium text-primary">
        {operator.machine}
      </span>
      {showSku && operator.sku && (
        <span className="mt-1 rounded bg-cyan-100 px-2 text-sm font-medium text-cyan-700">{operator.sku}</span>
      )}

      <span
        className={cn(
          "mt-4 font-bold tabular-nums text-card-foreground",
          compact ? "text-3xl sm:text-4xl" : "text-4xl",
        )}
      >
        {operator.units.toLocaleString("es-MX")}
      </span>

      {showGoal && (
        <div className="mt-4 w-full px-1">
          <div className="mb-1.5 flex items-center justify-end">
            <span className="text-base font-bold tabular-nums text-foreground">{operator.percentage}%</span>
          </div>
          <div className={cn("w-full overflow-hidden rounded-full bg-black/5", compact ? "h-3" : "h-3.5")}>
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

interface OperatorRowProps {
  operator: Operator
  rank: number
  density?: "normal" | "compact"
  showSku?: boolean
  showGoalTarget?: boolean
}

export function OperatorRow({
  operator,
  rank,
  density = "normal",
  showSku = true,
  showGoalTarget = false,
}: OperatorRowProps) {
  const compact = density === "compact"
  const showGoal =
    operator.goalRemaining != null || (showGoalTarget && operator.goalTarget != null)

  return (
    <div
      className={cn(
        "grid items-center rounded-lg transition-colors hover:bg-muted/40",
        compact
          ? "grid-cols-[2rem_2.5rem_minmax(0,1fr)_5.5rem_minmax(0,1fr)] gap-3 px-3 py-3"
          : "grid-cols-[2.25rem_2.75rem_minmax(0,1fr)_6rem_minmax(0,1fr)] gap-4 px-4 py-3.5",
      )}
    >
      <span className="text-center text-sm font-semibold tabular-nums text-muted-foreground">{rank}</span>

      <div
        className={cn(
          "flex items-center justify-center rounded-full bg-primary/15 font-bold text-primary",
          compact ? "h-9 w-9 text-sm" : "h-10 w-10 text-sm",
        )}
      >
        {operator.initials}
      </div>

      <div className="min-w-0">
        <span className={cn("block truncate font-medium text-foreground", compact ? "text-base" : "text-lg")}>
          {operator.name}
        </span>
        <span className="mt-0.5 block truncate text-sm font-medium text-primary" title={operator.machine}>
          {operator.machine}
        </span>
        {showSku && operator.sku && (
          <span className="mt-0.5 inline-block truncate rounded bg-cyan-100 px-1.5 text-sm font-medium text-cyan-700">
            {operator.sku}
          </span>
        )}
      </div>

      <span
        className={cn(
          "text-right font-bold tabular-nums text-foreground",
          compact ? "text-xl sm:text-2xl" : "text-2xl",
        )}
      >
        {operator.units.toLocaleString("es-MX")}
      </span>

      {showGoal ? (
        <div className="min-w-0">
          <div className="mb-1 flex justify-end">
            <span className="text-sm font-bold tabular-nums text-foreground">{operator.percentage}%</span>
          </div>
          <div className={cn("overflow-hidden rounded-full bg-muted", compact ? "h-3" : "h-3.5")}>
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.min(operator.percentage, 100)}%` }}
            />
          </div>
        </div>
      ) : (
        <div />
      )}
    </div>
  )
}
