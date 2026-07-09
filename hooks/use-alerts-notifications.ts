"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { Alert } from "@/lib/types"
import {
  deleteAlert,
  getAlerts,
  getProductionEvents,
  updateAlert,
} from "@/lib/api"
import { ALERTS_POLL_MS, mapApiAlertToUi } from "@/lib/alert-ui"
import { useAuth } from "@/contexts/auth-context"
import { hasModuleAccess } from "@/lib/permissions"

export function useAlertsNotifications() {
  const { user, getAccessToken } = useAuth()
  const enabled = hasModuleAccess(user, "alertas")
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [pulse, setPulse] = useState(false)
  const prevUnreadRef = useRef(0)

  const reload = useCallback(async () => {
    if (!enabled) {
      setAlerts([])
      setLoading(false)
      return
    }
    try {
      const token = await getAccessToken()
      if (!token) {
        setAlerts([])
        return
      }
      const [apiAlerts, events] = await Promise.all([
        getAlerts(token),
        getProductionEvents(token, { limit: 1500 }),
      ])
      const mapped = apiAlerts.map((a) => mapApiAlertToUi(a, events))
      mapped.sort((a, b) => {
        const aPri = a.actionRequired && !a.isRead ? 1 : 0
        const bPri = b.actionRequired && !b.isRead ? 1 : 0
        if (aPri !== bPri) return bPri - aPri
        if (a.isRead !== b.isRead) return a.isRead ? 1 : -1
        return b.timestamp.getTime() - a.timestamp.getTime()
      })
      setAlerts(mapped)

      const unread = mapped.filter((a) => !a.isRead).length
      if (unread > prevUnreadRef.current) {
        setPulse(true)
        window.setTimeout(() => setPulse(false), 2500)
      }
      prevUnreadRef.current = unread
    } catch {
      // Mantener lista previa si falla un poll puntual.
    } finally {
      setLoading(false)
    }
  }, [enabled, getAccessToken])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      await reload()
      if (cancelled) return
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [reload])

  useEffect(() => {
    if (!enabled) return
    const id = window.setInterval(() => {
      void reload()
    }, ALERTS_POLL_MS)
    return () => window.clearInterval(id)
  }, [enabled, reload])

  const unreadCount = alerts.filter((a) => !a.isRead).length
  const actionRequiredCount = alerts.filter((a) => a.actionRequired && !a.isRead).length

  const markAsRead = useCallback(
    async (id: string) => {
      setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, isRead: true } : a)))
      const token = await getAccessToken()
      if (!token) return
      try {
        await updateAlert(token, id, { status: "acknowledged" })
      } catch {
        void reload()
      }
    },
    [getAccessToken, reload],
  )

  const markAllAsRead = useCallback(async () => {
    const unreadIds = alerts.filter((a) => !a.isRead).map((a) => a.id)
    setAlerts((prev) => prev.map((a) => ({ ...a, isRead: true })))
    const token = await getAccessToken()
    if (!token) return
    await Promise.allSettled(
      unreadIds.map((id) => updateAlert(token, id, { status: "acknowledged" })),
    )
  }, [alerts, getAccessToken])

  const dismiss = useCallback(
    async (id: string) => {
      setAlerts((prev) => prev.filter((a) => a.id !== id))
      const token = await getAccessToken()
      if (!token) return
      try {
        await deleteAlert(token, id)
      } catch {
        void reload()
      }
    },
    [getAccessToken, reload],
  )

  return {
    enabled,
    alerts,
    loading,
    pulse,
    unreadCount,
    actionRequiredCount,
    reload,
    markAsRead,
    markAllAsRead,
    dismiss,
  }
}
