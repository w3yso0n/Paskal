import { cn } from "@/lib/utils"
import { Crown } from "lucide-react"
import type { Operator } from "@/lib/mock-data"

interface OperatorCardProps {
  operator: Operator
  rank: number
  highlighted?: boolean
}

export function OperatorCard({ operator, rank, highlighted = false }: OperatorCardProps) {
  const isLeader = operator.isLeader
  const isTopThree = rank <= 3

  if (isTopThree) {
    return (
      <div
        className={cn(
          "relative flex flex-col items-center rounded-xl border p-4",
          isLeader
            ? "border-orange-200 bg-orange-50"
            : "border-border bg-card"
        )}
      >
        {/* Crown for leader */}
        {isLeader && (
          <Crown className="absolute -top-3 left-1/2 h-6 w-6 -translate-x-1/2 text-orange-500 fill-orange-500" />
        )}
        
        {/* Rank badge */}
        <div
          className={cn(
            "absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
            rank === 1 ? "bg-orange-500 text-white" : "bg-primary text-primary-foreground"
          )}
        >
          {rank}
        </div>

        {/* Avatar */}
        <div
          className={cn(
            "flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold text-white",
            isLeader ? "bg-orange-500" : "bg-primary"
          )}
        >
          {operator.initials}
        </div>

        {/* Name */}
        <span className={cn("mt-2 font-semibold text-card-foreground", isLeader && "text-orange-700")}>
          {operator.name}
        </span>
        {isLeader && (
          <span className="text-xs text-orange-600 font-medium">Líder</span>
        )}

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
        <span className="mt-3 text-2xl font-bold text-card-foreground">{operator.units}</span>

        {/* Progress bar */}
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className={cn("h-full rounded-full", isLeader ? "bg-orange-500" : "bg-primary")}
            style={{ width: `${Math.min(operator.percentage, 100)}%` }}
          />
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
