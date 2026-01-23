import { cn } from "@/lib/utils"
import { Crown, Trophy } from "lucide-react"
import type { Operator } from "@/lib/mock-data"

interface OperatorCardProps {
  operator: Operator
  rank: number
  highlighted?: boolean
  density?: "normal" | "compact"
}

export function OperatorCard({ operator, rank, highlighted = false, density = "normal" }: OperatorCardProps) {
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

        {/* Machine and SKU */}
        <div className={cn(compact ? " flex items-center gap-1.5" : " flex items-center gap-2")}>
          <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {operator.machine}
          </span>
          <span className="rounded bg-cyan-100 px-2  text-xs font-medium text-cyan-700">
            {operator.sku}
          </span>
        </div>

        {/* Units */}
        <span className={cn(compact ? "text-2m font-bold text-card-foreground" : "mt-4 text-3xl font-bold text-card-foreground")}>
          {operator.units}
        </span>
        <span className="text-xs text-muted-foreground">unidades</span>

        {/* Bonus progress */}
        <div className={cn(compact ? " w-full" : "mt-4 w-full")}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Bono</span>
            <span className="font-semibold text-foreground">{Math.min(operator.percentage, 100)}%</span>
          </div>

          {/* Progress bar */}
          <div className={cn(compact ? "h-2 w-full overflow-hidden rounded-full bg-black/5" : "h-2.5 w-full overflow-hidden rounded-full bg-black/5")}>
            <div
              className={cn("h-full rounded-full", podiumTheme.bar)}
              style={{ width: `${Math.min(operator.percentage, 100)}%` }}
            />
          </div>
        </div>
      </div>
    )
  }

  return null
}

interface OperatorRowProps {
  operator: Operator
  rank: number
  density?: "normal" | "compact"
}

export function OperatorRow({ operator, rank, density = "normal" }: OperatorRowProps) {
  const compact = density === "compact"
  return (
    <div className={cn("flex items-center", compact ? "gap-2 py-1" : "gap-3 py-2")}>
      {/* Rank */}
      <span className={cn(compact ? "w-5 text-[11px] font-medium text-muted-foreground" : "w-6 text-sm font-medium text-muted-foreground")}>
        {rank}
      </span>

      {/* Avatar */}
      <div
        className={cn(
          "flex items-center justify-center rounded-full bg-gray-200 font-bold text-gray-600",
          compact ? "h-7 w-7 text-[11px]" : "h-8 w-8 text-xs"
        )}
      >
        {operator.initials}
      </div>

      {/* Name */}
      <span className={cn("flex-1 font-medium text-foreground", compact ? "text-[12px]" : "text-sm")}>
        {operator.name}
      </span>

      {/* Machine and SKU */}
      <div className="flex items-center gap-2">
        <span className={cn("rounded bg-primary/10 font-medium text-primary", compact ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-xs")}>
          {operator.machine}
        </span>
        <span className={cn("rounded bg-cyan-100 font-medium text-cyan-700", compact ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-xs")}>
          {operator.sku}
        </span>
      </div>

      {/* Units */}
      <span className={cn("text-right font-bold text-foreground", compact ? "w-10 text-[12px]" : "w-12 text-sm")}>
        {operator.units}
      </span>

      {/* Progress */}
      <div className={cn("flex items-center gap-2", compact ? "w-16" : "w-20")}>
        <div className={cn("flex-1 overflow-hidden rounded-full bg-gray-200", compact ? "h-1.5" : "h-1.5")}>
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${Math.min(operator.percentage, 100)}%` }}
          />
        </div>
        <span className={cn("text-muted-foreground", compact ? "text-[11px]" : "text-xs")}>
          {operator.percentage}%
        </span>
      </div>
    </div>
  )
}
