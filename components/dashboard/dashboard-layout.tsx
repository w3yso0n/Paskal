"use client"

import React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { Sidebar, menuItems } from "./sidebar"
import { Header } from "./header"

interface DashboardLayoutProps {
  children: React.ReactNode
  breadcrumbs?: { label: string; href?: string }[]
}

export function DashboardLayout({ children, breadcrumbs }: DashboardLayoutProps) {
  const pathname = usePathname()
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false)

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        className="hidden md:flex"
      />

      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <div className="flex h-24 items-center justify-center border-b border-border bg-muted/20">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-foreground/10">
                <svg viewBox="0 0 24 24" className="h-6 w-6 text-foreground" fill="currentColor">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <span className="text-xl font-bold text-foreground">Paskal</span>
            </div>
          </div>

          <nav className="space-y-1 px-2 py-4">
            {menuItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-foreground/80 hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </nav>

          <div className="mt-auto border-t border-border p-4">
            <p className="text-sm text-muted-foreground">admin@paskal.com</p>
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
