"use client"

import { useState, useCallback } from "react"
import { ChevronDown, PanelLeftClose } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { AlertsDropdown } from "@/components/notifications/alerts-dropdown"
import { alerts as initialAlerts } from "@/lib/mock-data"

interface HeaderProps {
  breadcrumbs?: { label: string; href?: string }[]
}

export function Header({ breadcrumbs }: HeaderProps) {
  const [alerts, setAlerts] = useState(initialAlerts)

  const handleMarkAsRead = useCallback((id: string) => {
    setAlerts((prev) => prev.map((alert) => (alert.id === id ? { ...alert, isRead: true } : alert)))
  }, [])

  const handleDismiss = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((alert) => alert.id !== id))
  }, [])

  const handleMarkAllAsRead = useCallback(() => {
    setAlerts((prev) => prev.map((alert) => ({ ...alert, isRead: true })))
  }, [])

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background px-6">
      <div className="flex items-center gap-4">
        <button className="text-muted-foreground hover:text-foreground">
          <PanelLeftClose className="h-5 w-5" />
        </button>
        {breadcrumbs && (
          <nav className="flex items-center gap-2 text-sm">
            {breadcrumbs.map((crumb, index) => (
              <span key={index} className="flex items-center gap-2">
                {index > 0 && <span className="text-muted-foreground">/</span>}
                <span className={index === breadcrumbs.length - 1 ? "text-foreground" : "text-muted-foreground"}>
                  {crumb.label}
                </span>
              </span>
            ))}
          </nav>
        )}
      </div>
      <div className="flex items-center gap-3">
        <AlertsDropdown
          alerts={alerts}
          onMarkAsRead={handleMarkAsRead}
          onDismiss={handleDismiss}
          onMarkAllAsRead={handleMarkAllAsRead}
        />
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            admin@paskal.com
            <ChevronDown className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>Perfil</DropdownMenuItem>
            <DropdownMenuItem>Configuración</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive">Cerrar sesión</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
