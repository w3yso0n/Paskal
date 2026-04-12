"use client"

import { useState, useEffect, useRef } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, Mail, Lock, Eye, EyeOff, AlertCircle } from "lucide-react"
import { initFirebaseAnalytics } from "@/lib/firebase"

const COVER_DURATION_MS = 700

export default function LoginPage() {
  const router = useRouter()
  const { user, loading: authLoading, error, login, clearError } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [isExiting, setIsExiting] = useState(false)
  const [mounted, setMounted] = useState(false)
  const emailInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setMounted(true)
    initFirebaseAnalytics()
  }, [])

  useEffect(() => {
    if (!authLoading && user) {
      router.replace("/")
    }
  }, [user, authLoading, router])

  useEffect(() => {
    if (!authLoading && !user && emailInputRef.current) {
      emailInputRef.current.focus()
    }
  }, [authLoading, user])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail || !password) return
    setSubmitting(true)
    try {
      await login(trimmedEmail, password)
      setIsExiting(true)
      setTimeout(() => {
        router.replace("/")
      }, COVER_DURATION_MS)
    } catch {
      setSubmitting(false)
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted/40">
        <div
          className="flex items-center justify-center rounded-2xl bg-white p-8 shadow-lg ring-1 ring-black/5"
          style={{
            animation: "login-logo-in 0.4s ease-out both",
          }}
        >
          <Loader2 className="h-10 w-10 animate-spin text-primary" aria-hidden />
        </div>
      </div>
    )
  }

  if (user && !isExiting) {
    return null
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-background via-background to-muted/40 p-4">
      {/* Exit overlay: logo + primary expand to cover screen */}
      {isExiting && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          aria-hidden
        >
          <div
            className="flex min-h-[140px] min-w-[260px] items-center justify-center rounded-2xl bg-primary px-8 py-6"
            style={{
              animation: `login-cover ${COVER_DURATION_MS}ms ease-in-out forwards`,
            }}
          >
            <div className="rounded-xl bg-white/95 px-5 py-3 shadow-lg backdrop-blur-sm">
              <Image
                src="/images/Logo.png"
                alt=""
                width={220}
                height={75}
                className="h-10 w-[160px] object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {/* Subtle grid + animated line (industrial feel) */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(to right, currentColor 1px, transparent 1px),
            linear-gradient(to bottom, currentColor 1px, transparent 1px)
          `,
          backgroundSize: "48px 48px",
        }}
      />
      <div
        className="pointer-events-none fixed left-0 top-1/2 h-px w-full opacity-20"
        style={{
          background: "linear-gradient(90deg, transparent, var(--primary), transparent)",
          animation: mounted ? "login-line-shine 3s ease-in-out infinite" : "none",
        }}
      />

      <div className="relative z-10 w-full max-w-[400px] space-y-8">
        {/* Logo: entrada con animación */}
        <div
          className="flex flex-col items-center gap-3 text-center"
          style={{
            animation: mounted ? "login-logo-in 0.6s ease-out both" : "none",
          }}
        >
          <Link
            href="/"
            className="block transition-opacity hover:opacity-90 focus:opacity-90 focus:outline-none"
            aria-label="Paskal - Ir al inicio"
          >
            <div className="rounded-2xl bg-white px-6 py-4 shadow-lg ring-1 ring-black/5 transition-shadow hover:shadow-xl">
              <Image
                src="/images/Logo.png"
                alt="Paskal"
                width={280}
                height={96}
                priority
                className="h-14 w-[200px] object-contain"
              />
            </div>
          </Link>
          <p className="text-sm font-medium text-muted-foreground">
            Sistema de Monitoreo Industrial
          </p>
        </div>

        {/* Card: entra después del logo */}
        <Card
          className="border-border/80 shadow-lg"
          style={{
            animation: mounted ? "login-card-in 0.5s ease-out 0.2s both" : "none",
          }}
        >
          <CardHeader className="space-y-1.5 pb-2">
            <CardTitle className="text-2xl tracking-tight">Iniciar sesión</CardTitle>
            <CardDescription>
              Usa las credenciales que te proporcionó tu administrador.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Correo electrónico</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    ref={emailInputRef}
                    id="email"
                    type="email"
                    placeholder="tu@empresa.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                    disabled={submitting}
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    disabled={submitting}
                    className="pr-10 pl-9"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword((p) => !p)}
                    tabIndex={-1}
                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={submitting}
                size="lg"
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Entrando…
                  </>
                ) : (
                  "Entrar"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p
          className="text-center text-xs text-muted-foreground"
          style={{
            animation: mounted ? "login-card-in 0.5s ease-out 0.35s both" : "none",
          }}
        >
          Si no tienes cuenta, solicita acceso al administrador de tu organización.
        </p>
      </div>
    </div>
  )
}
