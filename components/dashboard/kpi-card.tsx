import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

export type KpiBreakdownItem = {
  label: string
  value: number
  dotClass: string
  valueClass?: string
}

interface KpiCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: LucideIcon
  iconColor?: string
  className?: string
  breakdown?: KpiBreakdownItem[]
}

export function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor = "text-primary",
  className,
  breakdown,
}: KpiCardProps) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-5", className)}>
      <div className="flex items-start gap-4">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10", iconColor)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
          {breakdown && breakdown.length > 0 ? (
            <div
              className={cn(
                "mt-2 grid gap-2",
                breakdown.length >= 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3",
              )}
            >
              {breakdown.map((item) => (
                <div key={item.label} className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", item.dotClass)} />
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground truncate">
                      {item.label}
                    </span>
                  </div>
                  <p className={cn("mt-0.5 text-lg font-bold leading-tight", item.valueClass ?? "text-card-foreground")}>
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-2xl font-bold text-card-foreground">{value}</p>
          )}
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
    </div>
  )
}
