"use client"

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  loginWithPassword,
  refreshTokens,
  logoutApi,
  fetchMe,
  type RequestUser,
  type AuthTokens,
  type ApiError,
} from "@/lib/api"

const STORAGE_ACCESS = "paskal_access_token"
const STORAGE_REFRESH = "paskal_refresh_token"

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
      try {
        const tokens = await loginWithPassword(email, password)
        saveTokens(tokens)
        const user = await fetchMe(tokens.accessToken)
        setUser(user)
        router.replace("/")
      } catch (e) {
        const err = e as ApiError
        setError(err?.message ?? "Error al iniciar sesión")
        setState((s) => ({ ...s, loading: false }))
        throw e
      }
    },
    [router, setUser, setLoading, setError]
  )

  const logout = useCallback(async () => {
    const { refresh } = loadStoredTokens()
    if (refresh) await logoutApi(refresh)
    clearStoredTokens()
    setUser(null)
    router.replace("/login")
  }, [router, setUser])

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    let { access, refresh } = loadStoredTokens()
    if (access) {
      try {
        await fetchMe(access)
        return access
      } catch {
        access = null
      }
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
