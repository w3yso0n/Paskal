"use client"

import { useState } from "react"
import Link from "next/link"
import {
  Bell,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  X,
  Factory,
  Users,
  Monitor,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { ALERT_KIND_LABELS } from "@/lib/alert-ui"
import type { Alert, AlertType, AlertCategory } from "@/lib/types"

interface AlertsDropdownProps {
  alerts: Alert[]
  loading?: boolean
  pulse?: boolean
  canDismiss?: boolean
  onMarkAsRead: (id: string) => void
  onDismiss: (id: string) => void
  onMarkAllAsRead: () => void
}

const typeIcons: Record<AlertType, typeof AlertCircle> = {
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
  success: CheckCircle2,
}

const typeColors: Record<AlertType, string> = {
  error: "text-red-500 bg-red-50",
  warning: "text-amber-500 bg-amber-50",
  info: "text-blue-500 bg-blue-50",
  success: "text-green-500 bg-green-50",
}

const categoryIcons: Record<AlertCategory, typeof Factory> = {
  machine: Factory,
  production: Monitor,
  employee: Users,
  system: Info,
}

function formatTimeAgo(date: Date): string {
  const now = new Date()
  const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))

  if (diffInMinutes < 1) return "Ahora mismo"
  if (diffInMinutes < 60) return `Hace ${diffInMinutes} min`
  if (diffInMinutes < 1440) return `Hace ${Math.floor(diffInMinutes / 60)} hrs`
  return `Hace ${Math.floor(diffInMinutes / 1440)} días`
}

export function AlertsDropdown({
  alerts,
  loading = false,
  pulse = false,
  canDismiss = false,
  onMarkAsRead,
  onDismiss,
  onMarkAllAsRead,
}: AlertsDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const unreadCount = alerts.filter((a) => !a.isRead).length
  const actionRequiredCount = alerts.filter((a) => a.actionRequired && !a.isRead).length
  const displayCount = actionRequiredCount > 0 ? actionRequiredCount : unreadCount
  const badgeTone =
    actionRequiredCount > 0
      ? "bg-amber-500"
      : unreadCount > 0
        ? "bg-red-500"
        : ""

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("relative", pulse && "animate-[wiggle_0.5s_ease-in-out_3]")}
          aria-label={
            unreadCount > 0
              ? `${unreadCount} alerta${unreadCount === 1 ? "" : "s"} sin leer`
              : "Notificaciones"
          }
        >
          <Bell className={cn("h-5 w-5", pulse && "text-amber-600")} />
          {pulse && unreadCount > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-500" />
            </span>
          ) : null}
          {displayCount > 0 && (
            <span
              className={cn(
                "absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-semibold text-white",
                badgeTone,
              )}
            >
              {displayCount > 99 ? "99+" : displayCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h3 className="font-semibold text-foreground">Alertas</h3>
            {loading ? (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Actualizando…
              </p>
            ) : actionRequiredCount > 0 ? (
              <p className="text-xs text-amber-600">
                {actionRequiredCount} requieren acción
              </p>
            ) : unreadCount > 0 ? (
              <p className="text-xs text-muted-foreground">
                {unreadCount} sin leer
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Al día</p>
            )}
          </div>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={onMarkAllAsRead} className="text-xs">
              Marcar leídas
            </Button>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {loading && alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-8 w-8 mb-2 animate-spin opacity-60" />
              <p className="text-sm">Cargando alertas…</p>
            </div>
          ) : alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Bell className="h-10 w-10 mb-2 opacity-50" />
              <p className="text-sm">No hay alertas activas</p>
            </div>
          ) : (
            alerts.slice(0, 12).map((alert) => {
              const TypeIcon = typeIcons[alert.type]
              const CategoryIcon = categoryIcons[alert.category]

              return (
                <div
                  key={alert.id}
                  className={cn(
                    "relative flex gap-3 border-b border-border px-4 py-3 transition-colors hover:bg-muted/50 cursor-pointer",
                    !alert.isRead && "bg-primary/5",
                  )}
                  onClick={() => !alert.isRead && onMarkAsRead(alert.id)}
                >
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                      typeColors[alert.type],
                    )}
                  >
                    <TypeIcon className="h-5 w-5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <p
                          className={cn(
                            "text-sm font-medium truncate",
                            !alert.isRead && "text-foreground",
                          )}
                        >
                          {alert.title}
                        </p>
                        {alert.actionRequired && !alert.isRead && (
                          <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                            Acción
                          </span>
                        )}
                      </div>
                      {canDismiss && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onDismiss(alert.id)
                          }}
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                      {alert.message}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="rounded bg-muted px-1 py-0.5 font-medium">
                        {ALERT_KIND_LABELS[alert.kind]}
                      </span>
                      <CategoryIcon className="h-3 w-3" />
                      <span>{formatTimeAgo(alert.timestamp)}</span>
                      {!alert.isRead && (
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div className="border-t border-border p-2">
          <Button variant="ghost" className="w-full text-sm" asChild>
            <Link href="/alertas" onClick={() => setIsOpen(false)}>
              Ver centro de alertas
              {unreadCount > 0 ? ` (${unreadCount})` : ""}
            </Link>
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
