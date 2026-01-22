"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { Home, Factory, Monitor, BarChart3, Users, ChevronLeft, ChevronRight, User, Bell, Target } from "lucide-react"
import { cn } from "@/lib/utils"

export const menuItems = [
  { icon: Home, label: "Inicio", href: "/" },
  { icon: Factory, label: "Piso de producción", href: "/piso-produccion" },
  { icon: Monitor, label: "Tablero Operativo", href: "/tablero-operativo" },
  { icon: BarChart3, label: "Métricas", href: "/metricas" },
  { icon: Target, label: "Metas", href: "/metas" },
  { icon: Users, label: "Gestión de empleados", href: "/empleados" },
  { icon: Bell, label: "Alertas", href: "/alertas" },
]

interface SidebarProps {
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  className?: string
}

export function Sidebar({ collapsed = false, onCollapsedChange, className }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen bg-sidebar text-sidebar-foreground transition-all duration-300 flex flex-col",
        collapsed ? "w-16" : "w-56",
        className
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          "border-b border-sidebar-border bg-sidebar-accent/20",
          collapsed ? "h-14" : "h-28",
          !collapsed && "flex items-center justify-center"
        )}
      >
        {!collapsed && (
          <Link href="/" className="block" aria-label="Ir a Inicio">
            <div className="rounded-xl bg-white/90 px-4 py-3 shadow-sm ring-1 ring-black/5">
              <Image
                src="/images/Logo.png"
                alt="Paskal"
                width={320}
                height={110}
                priority
                className="h-16 w-[200px] object-contain"
              />
            </div>
          </Link>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-2 py-4">
        {menuItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* User Info */}
      <div className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-foreground/10">
            <User className="h-4 w-4" />
          </div>
          {!collapsed && (
            <span className="text-sm text-sidebar-foreground/80">admin@paskal.com</span>
          )}
        </div>
      </div>

      {/* Collapse Button */}
      {onCollapsedChange && (
        <button
          onClick={() => onCollapsedChange(!collapsed)}
          className="absolute -right-3 top-28 hidden h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm hover:bg-muted md:flex"
          aria-label={collapsed ? "Expandir sidebar" : "Colapsar sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      )}
    </aside>
  )
}
