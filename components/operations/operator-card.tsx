import { cn } from "@/lib/utils"
import { Crown, Trophy } from "lucide-react"
import type { Operator } from "@/lib/mock-data"

interface OperatorCardProps {
  operator: Operator
  rank: number
  highlighted?: boolean
}

export function OperatorCard({ operator, rank, highlighted = false }: OperatorCardProps) {
  const isLeader = rank === 1
  const isTopThree = rank <= 3

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
          "group relative flex w-full max-w-[260px] flex-col items-center overflow-hidden rounded-2xl border p-5 transition-transform duration-200 hover:scale-[1.01]",
          podiumTheme.container,
          podiumTheme.glow
        )}
      >
        {/* Subtle shine */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/45 via-white/10 to-transparent" />
        
        {/* Rank badge */}
        <div
          className={cn(
            "absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold shadow-sm",
            podiumTheme.badge
          )}
        >
          {rank}
        </div>

        {/* Medal label */}
        <div className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full border border-white/60 bg-white/80 px-2 py-1 text-[11px] font-semibold text-foreground shadow-sm">
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
            "mt-8 flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold text-white shadow-sm",
            podiumTheme.avatar
          )}
        >
          {operator.initials}
        </div>

        {/* Name */}
        <span className={cn("mt-3 text-base font-semibold", podiumTheme.text)}>
          {operator.name}
        </span>
        <span className={cn("text-xs font-medium", podiumTheme.accent)}>
          #{rank} • {isLeader ? "Líder" : "Top 3"}
        </span>

        {/* Machine and SKU */}
        <div className="mt-2 flex items-center gap-2">
          <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {operator.machine}
          </span>
          <span className="rounded bg-cyan-100 px-2 py-0.5 text-xs font-medium text-cyan-700">
            {operator.sku}
          </span>
        </div>

        {/* Units */}
        <span className="mt-4 text-3xl font-bold text-card-foreground">{operator.units}</span>
        <span className="text-xs text-muted-foreground">unidades</span>

        {/* Bonus progress */}
        <div className="mt-4 w-full">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Bono</span>
            <span className="font-semibold text-foreground">{Math.min(operator.percentage, 100)}%</span>
          </div>

          {/* Progress bar */}
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/5">
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
}

export function OperatorRow({ operator, rank }: OperatorRowProps) {
  return (
    <div className="flex items-center gap-3 py-2">
      {/* Rank */}
      <span className="w-6 text-sm font-medium text-muted-foreground">{rank}</span>

      {/* Avatar */}
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600">
        {operator.initials}
      </div>

      {/* Name */}
      <span className="flex-1 text-sm font-medium text-foreground">{operator.name}</span>

      {/* Machine and SKU */}
      <div className="flex items-center gap-2">
        <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          {operator.machine}
        </span>
        <span className="rounded bg-cyan-100 px-2 py-0.5 text-xs font-medium text-cyan-700">
          {operator.sku}
        </span>
      </div>

      {/* Units */}
      <span className="w-12 text-right text-sm font-bold text-foreground">{operator.units}</span>

      {/* Progress */}
      <div className="flex w-20 items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${Math.min(operator.percentage, 100)}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground">{operator.percentage}%</span>
      </div>
    </div>
  )
}
