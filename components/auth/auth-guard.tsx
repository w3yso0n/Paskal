"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { canAccessRoute } from "@/lib/permissions"
import { Loader2 } from "lucide-react"

const LOGIN_PATH = "/login"

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, loading } = useAuth()
  const isLoginPage = pathname === LOGIN_PATH

  useEffect(() => {
    if (loading) return
    if (isLoginPage) return
    if (!user) {
      router.replace(LOGIN_PATH)
      return
    }
    if (!canAccessRoute(user, pathname)) {
      router.replace("/")
    }
  }, [loading, user, isLoginPage, pathname, router])

  if (loading && !user && !isLoginPage) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
      </div>
    )
  }

  if (!isLoginPage && !user) {
    return null
  }

  if (!isLoginPage && user && !canAccessRoute(user, pathname)) {
    return null
  }

  return <>{children}</>
}
