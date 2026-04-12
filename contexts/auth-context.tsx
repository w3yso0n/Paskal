"use client"

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import type { FirebaseError } from "firebase/app"
import { signInWithEmailAndPassword, signOut } from "firebase/auth"
import {
  exchangeFirebaseToken,
  refreshTokens,
  logoutApi,
  fetchMe,
  getSafeLoginMessage,
  type RequestUser,
  type AuthTokens,
} from "@/lib/api"
import { getFirebaseAuth } from "@/lib/firebase"
import { toast } from "sonner"

function getLoginErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = String((error as FirebaseError).code ?? "")
    if (code.startsWith("auth/")) {
      if (code === "auth/too-many-requests") {
        return "Demasiados intentos. Espera un momento e intenta de nuevo."
      }
      return "Correo o contraseña incorrectos."
    }
  }
  return getSafeLoginMessage(error)
}

/** Para consola: Error/Firebase/ApiError no siempre se ven bien con console.error(e) solo. */
function serializeLoginError(error: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (error == null) {
    out.kind = String(error)
    return out
  }
  if (typeof error === "string") {
    out.kind = "string"
    out.message = error
    return out
  }
  if (typeof error !== "object") {
    out.kind = typeof error
    out.value = String(error)
    return out
  }
  const er = error as Record<string, unknown>
  if (error instanceof Error) {
    out.kind = "Error"
    out.name = error.name
    out.message = error.message
    if (error.stack) out.stack = error.stack
  }
  if (typeof er.code === "string") out.firebaseCode = er.code
  const sc = er.statusCode ?? er.status
  if (typeof sc === "number") out.httpStatus = sc
  if (Array.isArray(er.message)) out.bodyOrMessage = er.message
  else if (er.message != null && typeof er.message !== "object") {
    out.bodyOrMessage = er.message
  } else if (er.message != null && typeof er.message === "object") {
    try {
      out.bodyOrMessage = JSON.stringify(er.message)
    } catch {
      out.bodyOrMessage = String(er.message)
    }
  }
  if (!out.kind) out.kind = "plainObject"
  return out
}

/** Usa console.log (no console.error): Next.js muestra overlay de error en la app con console.error. */
function logLoginFailure(phase: string, error: unknown): void {
  if (typeof window === "undefined") return
  const detail = serializeLoginError(error)
  const payload = { phase, ...detail }
  try {
    console.log(`[Auth] Login failed ${JSON.stringify(payload)}`)
  } catch {
    console.log("[Auth] Login failed phase=", phase, "raw=", String(error))
  }
  if (error instanceof Error && error.cause != null) {
    try {
      console.log(
        `[Auth] Login failed (cause) ${JSON.stringify(serializeLoginError(error.cause))}`,
      )
    } catch {
      console.log("[Auth] Login failed (cause)", String(error.cause))
    }
  }
}

const STORAGE_ACCESS = "paskal_access_token"
const STORAGE_REFRESH = "paskal_refresh_token"
const TOKEN_EXPIRY_MARGIN_MS = 30_000

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]))
    if (!payload.exp) return false
    return payload.exp * 1000 < Date.now() + TOKEN_EXPIRY_MARGIN_MS
  } catch {
    return true
  }
}

interface AuthState {
  user: RequestUser | null
  loading: boolean
  error: string | null
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  clearError: () => void
  getAccessToken: () => Promise<string | null>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function loadStoredTokens(): { access: string | null; refresh: string | null } {
  if (typeof window === "undefined") return { access: null, refresh: null }
  return {
    access: localStorage.getItem(STORAGE_ACCESS),
    refresh: localStorage.getItem(STORAGE_REFRESH),
  }
}

function saveTokens(tokens: AuthTokens) {
  if (typeof window === "undefined") return
  localStorage.setItem(STORAGE_ACCESS, tokens.accessToken)
  localStorage.setItem(STORAGE_REFRESH, tokens.refreshToken)
}

function clearStoredTokens() {
  if (typeof window === "undefined") return
  localStorage.removeItem(STORAGE_ACCESS)
  localStorage.removeItem(STORAGE_REFRESH)
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  })

  const setUser = useCallback((user: RequestUser | null) => {
    setState((s) => ({ ...s, user, loading: false, error: null }))
  }, [])

  const setLoading = useCallback((loading: boolean) => {
    setState((s) => ({ ...s, loading }))
  }, [])

  const setError = useCallback((error: string | null) => {
    setState((s) => ({ ...s, error }))
  }, [])

  const clearError = useCallback(() => setError(null), [setError])

  const login = useCallback(
    async (email: string, password: string) => {
      setLoading(true)
      setError(null)
      let phase = "start"
      try {
        phase = "getFirebaseAuth"
        const auth = getFirebaseAuth()
        phase = "signInWithEmailAndPassword"
        const credential = await signInWithEmailAndPassword(auth, email, password)
        phase = "getIdToken"
        const idToken = await credential.user.getIdToken()
        phase = "exchangeFirebaseToken"
        const tokens = await exchangeFirebaseToken(idToken)
        phase = "saveTokens"
        saveTokens(tokens)
        phase = "fetchMe"
        const user = await fetchMe(tokens.accessToken)
        setUser(user)
        router.replace("/")
      } catch (e) {
        logLoginFailure(phase, e)
        const safeMessage = getLoginErrorMessage(e)
        setError(safeMessage)
        setState((s) => ({ ...s, loading: false }))
        toast.error(safeMessage, { duration: 5000 })
        throw e
      }
    },
    [router, setUser, setLoading, setError]
  )

  const logout = useCallback(async () => {
    const { refresh } = loadStoredTokens()
    if (refresh) await logoutApi(refresh)
    clearStoredTokens()
    try {
      await signOut(getFirebaseAuth())
    } catch {
      // Sin sesión Firebase, ya cerrada o Firebase no inicializado
    }
    setUser(null)
    router.replace("/login")
  }, [router, setUser])

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    const { access, refresh } = loadStoredTokens()
    if (access && !isTokenExpired(access)) {
      return access
    }
    if (refresh) {
      try {
        const tokens = await refreshTokens(refresh)
        saveTokens(tokens)
        return tokens.accessToken
      } catch {
        clearStoredTokens()
        setUser(null)
        return null
      }
    }
    return null
  }, [setUser])

  useEffect(() => {
    const init = async () => {
      const { access, refresh } = loadStoredTokens()
      if (!access && !refresh) {
        setUser(null)
        return
      }
      if (access) {
        try {
          const user = await fetchMe(access)
          setUser(user)
          return
        } catch {
          // token inválido o expirado
        }
      }
      if (refresh) {
        try {
          const tokens = await refreshTokens(refresh)
          saveTokens(tokens)
          const user = await fetchMe(tokens.accessToken)
          setUser(user)
          return
        } catch {
          clearStoredTokens()
        }
      }
      setUser(null)
    }
    init()
  }, [setUser])

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      login,
      logout,
      clearError,
      getAccessToken,
    }),
    [state, login, logout, clearError, getAccessToken]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error("useAuth debe usarse dentro de AuthProvider")
  }
  return ctx
}
