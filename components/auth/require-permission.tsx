"use client"

import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { hasAnyPermission, type Permission } from "@/lib/permissions"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ShieldX, Loader2 } from "lucide-react"

interface RequirePermissionProps {
  /** Un permiso o lista; basta con cumplir uno (OR). */
  permissions?: Permission[]
  permission?: Permission
  children: React.ReactNode
  /** If true, show a "no permission" card instead of redirecting. Default: true */
  showFallback?: boolean
}

export function RequirePermission({
  permissions,
  permission,
  children,
  showFallback = true,
}: RequirePermissionProps) {
  const { user, loading } = useAuth()
  const router = useRouter()

  const required = permissions ?? (permission ? [permission] : [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!user) {
    router.replace("/login")
    return null
  }

  if (!hasAnyPermission(user, required)) {
    if (!showFallback) {
      router.replace("/")
      return null
    }

    return (
      <Card className="mx-auto mt-12 max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <ShieldX className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle>Acceso restringido</CardTitle>
          <CardDescription>
            No tienes permisos para acceder a esta sección.
            Contacta al administrador si necesitas acceso.
          </CardDescription>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => router.push("/")}
          >
            Volver al inicio
          </Button>
        </CardHeader>
      </Card>
    )
  }

  return <>{children}</>
}
