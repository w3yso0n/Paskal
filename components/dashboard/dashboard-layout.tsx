"use client"

import React from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/auth-context"

import {
  Sidebar,
  productionMenuItems,
  adminMenuItems,
  platformConfigItem,
} from "./sidebar"
import { Header } from "./header"
import {
  hasPermission,
  showAdminSection,
  showPlatformSection,
} from "@/lib/permissions"

interface DashboardLayoutProps {
  children: React.ReactNode
  breadcrumbs?: { label: string; href?: string }[]
}

function MobileNavLink({
  href,
  label,
  icon: Icon,
  isActive,
  onClick,
}: {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  isActive: boolean
  onClick: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
        isActive ? "bg-primary/10 text-primary" : "text-foreground/80 hover:bg-muted hover:text-foreground"
      )}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span>{label}</span>
    </Link>
  )
}

function MobileSectionLabel({ label }: { label: string }) {
  return (
    <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {label}
    </div>
  )
}

export function DashboardLayout({ children, breadcrumbs }: DashboardLayoutProps) {
  const pathname = usePathname()
  const { user } = useAuth()
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false)
  const hasAdmin = showAdminSection(user)
  const hasPlatform = showPlatformSection(user)
  const visibleAdminItems = adminMenuItems.filter(
    (item) => !item.permission || hasPermission(user, item.permission),
  )

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        className="hidden md:flex"
      />

      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <div className="flex h-28 items-center justify-center border-b border-border bg-muted/20">
            <Link
              href="/"
              onClick={() => setMobileMenuOpen(false)}
              className="block"
              aria-label="Ir a Inicio"
            >
              <div className="rounded-xl bg-white/80 px-4 py-3 shadow-sm ring-1 ring-black/5">
                <Image
                  src="/images/Logo.png"
                  alt="Paskal"
                  width={340}
                  height={120}
                  priority
                  className="h-16 w-[220px] object-contain"
                />
              </div>
            </Link>
          </div>

          <nav className="space-y-1 px-2 py-4">
            {productionMenuItems.map((item) => (
              <MobileNavLink
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                isActive={pathname === item.href}
                onClick={() => setMobileMenuOpen(false)}
              />
            ))}
            {hasAdmin && visibleAdminItems.length > 0 && (
              <>
                <MobileSectionLabel label="Administración" />
                {visibleAdminItems.map((item) => (
                  <MobileNavLink
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    icon={item.icon}
                    isActive={pathname === item.href}
                    onClick={() => setMobileMenuOpen(false)}
                  />
                ))}
              </>
            )}
            {hasPlatform && (
              <>
                <MobileSectionLabel label="Plataforma" />
                <MobileNavLink
                  href={platformConfigItem.href}
                  label={platformConfigItem.label}
                  icon={platformConfigItem.icon}
                  isActive={pathname === platformConfigItem.href}
                  onClick={() => setMobileMenuOpen(false)}
                />
              </>
            )}
          </nav>

          <div className="mt-auto border-t border-border p-4">
            <p className="truncate text-sm text-muted-foreground">{user?.email ?? "Usuario"}</p>
          </div>
        </SheetContent>
      </Sheet>

      <div
        className={cn(
          "transition-all duration-300",
          sidebarCollapsed ? "md:pl-16" : "md:pl-56"
        )}
      >
        <Header breadcrumbs={breadcrumbs} onOpenMobileMenu={() => setMobileMenuOpen(true)} />
        <main className="p-4 sm:p-6">
          <div className="min-w-0">{children}</div>
        </main>
      </div>
    </div>
  )
}
