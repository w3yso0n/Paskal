"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import {
  Home,
  Factory,
  Monitor,
  BarChart3,
  Users,
  UserPlus,
  ChevronLeft,
  ChevronRight,
  User,
  Bell,
  Target,
  Palette,
  Shield,
  ClipboardList,
  Scale,
  Tags,
  Database,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/auth-context"
import {
  hasModuleAccess,
  showAdminSection,
  showPlatformSection,
  showDataSection,
  type PlatformModule,
} from "@/lib/permissions"

interface MenuItem {
  icon: React.ComponentType<{ className?: string }>
  label: string
  href: string
  modules: PlatformModule[]
}

const productionItems: MenuItem[] = [
  { icon: Home, label: "Inicio", href: "/", modules: ["inicio"] },
  { icon: Factory, label: "Piso de producción", href: "/piso-produccion", modules: ["piso_produccion"] },
  { icon: Monitor, label: "Tablero Operativo", href: "/tablero-operativo", modules: ["tablero_operativo"] },
  {
    icon: BarChart3,
    label: "Métricas",
    href: "/metricas",
    modules: [
      "metricas_produccion",
      "metricas_incidencias",
      "metricas_mantenimiento",
      "metricas_asistencia_rotacion_bono",
    ],
  },
  { icon: Target, label: "Metas", href: "/metas", modules: ["metas"] },
  { icon: Bell, label: "Alertas", href: "/alertas", modules: ["alertas"] },
]

const adminItems: MenuItem[] = [
  { icon: UserPlus, label: "Gestión de usuarios", href: "/administracion/usuarios", modules: ["gestion_usuarios"] },
  {
    icon: Users,
    label: "Gestión de empleados",
    href: "/empleados",
    modules: [
      "empleados_asignar_tarjetas",
      "empleados_transporte",
      "empleados_paros_vacaciones_rol_secundario",
      "metricas_asistencia_rotacion_bono",
    ],
  },
  { icon: Tags, label: "Gestión de SKUs", href: "/administracion/gestion-skus", modules: ["skus"] },
  {
    icon: ClipboardList,
    label: "Captura de datos",
    href: "/captura-datos",
    modules: ["captura_produccion", "captura_historico"],
  },
  {
    icon: Scale,
    label: "Reglas de negocio",
    href: "/reglas-negocio",
    modules: [
      "reglas_dias_festivos",
      "reglas_fallos_electricos",
      "reglas_umbrales",
      "metricas_asistencia_rotacion_bono",
    ],
  },
  {
    icon: Palette,
    label: "Configuración de la organización",
    href: "/administracion/configuracion-organizacion",
    modules: ["config_organizacion"],
  },
]

const dataItems: MenuItem[] = [
  { icon: Database, label: "Datos", href: "/datos", modules: ["datos"] },
]

function isMenuItemVisible(
  user: ReturnType<typeof useAuth>["user"],
  item: MenuItem,
): boolean {
  return item.modules.some((module) => hasModuleAccess(user, module))
}

function NavLink({
  item,
  isActive,
  collapsed,
  onClick,
}: {
  item: MenuItem
  isActive: boolean
  collapsed: boolean
  onClick?: () => void
}) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
      )}
    >
      <item.icon className="h-5 w-5 shrink-0" />
      {!collapsed && <span>{item.label}</span>}
    </Link>
  )
}

function SectionLabel({ label, collapsed }: { label: string; collapsed: boolean }) {
  if (collapsed) return null
  return (
    <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50">
      {label}
    </div>
  )
}

interface SidebarProps {
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  className?: string
}

export function Sidebar({ collapsed = false, onCollapsedChange, className }: SidebarProps) {
  const pathname = usePathname()
  const { user } = useAuth()
  const visibleProductionItems = productionItems.filter((item) =>
    isMenuItemVisible(user, item),
  )
  const visibleAdminItems = adminItems.filter((item) => isMenuItemVisible(user, item))
  const hasAdmin = showAdminSection(user)
  const hasPlatform = showPlatformSection(user)
  const hasData = showDataSection(user)

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 flex h-screen flex-col bg-sidebar text-sidebar-foreground transition-all duration-300",
        collapsed ? "w-16" : "w-56",
        className
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center border-b border-sidebar-border bg-sidebar-accent/20",
          collapsed ? "h-14" : "h-28"
        )}
      >
        <Link href="/" className="block" aria-label="Ir a Inicio">
          {collapsed ? (
            <div className="rounded-xl bg-white px-2 py-2 shadow-sm ring-1 ring-black/10">
              <Image
                src="/images/Logo_Simple.png"
                alt="Paskal"
                width={44}
                height={44}
                priority
                className="h-9 w-9 object-contain"
              />
            </div>
          ) : (
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
          )}
        </Link>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
        {visibleProductionItems.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            isActive={pathname === item.href}
            collapsed={collapsed}
          />
        ))}

        {hasAdmin && visibleAdminItems.length > 0 && (
          <>
            <SectionLabel label="Administración" collapsed={collapsed} />
            {visibleAdminItems.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                isActive={pathname === item.href || pathname.startsWith(item.href + "/")}
                collapsed={collapsed}
              />
            ))}
          </>
        )}

        {hasData && (
          <>
            <SectionLabel label="Datos" collapsed={collapsed} />
            {dataItems.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                isActive={pathname === item.href || pathname.startsWith(item.href + "/")}
                collapsed={collapsed}
              />
            ))}
          </>
        )}

        {hasPlatform && (
          <>
            <SectionLabel label="Plataforma" collapsed={collapsed} />
            <NavLink
              item={platformConfigItem}
              isActive={pathname === "/configuracion"}
              collapsed={collapsed}
            />
          </>
        )}
      </nav>

      <div className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-foreground/10">
            <User className="h-4 w-4" />
          </div>
          {!collapsed && (
            <span className="truncate text-sm text-sidebar-foreground/80">
              {user?.email ?? "Usuario"}
            </span>
          )}
        </div>
      </div>

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

export const productionMenuItems = productionItems
export const adminMenuItems = adminItems
export const dataMenuItems = dataItems
export const platformConfigItem: MenuItem = {
  icon: Shield,
  label: "Configuración",
  href: "/configuracion",
  modules: ["configuracion"],
}
