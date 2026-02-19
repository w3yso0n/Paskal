import { useEffect, useMemo, useState } from "react"
import { machines, type Alert } from "@/lib/mock-data"

interface ProductionMonitorOptions {
  idleThresholdMinutes: number
}

export function useProductionMonitor({ idleThresholdMinutes }: ProductionMonitorOptions) {
  const [machineCounters, setMachineCounters] = useState<Record<string, number>>(() =>
    Object.fromEntries(machines.map((m) => [m.id, 0])),
  )
  const [lastIncreaseAtByMachine, setLastIncreaseAtByMachine] = useState<Record<string, number>>(
    () => {
      const now = Date.now()
      return Object.fromEntries(machines.map((m) => [m.id, now]))
    },
  )

  const activeMachineIds = useMemo(
    () => machines.filter((m) => m.status === "active").map((m) => m.id),
    [],
  )

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const now = Date.now()
      const incrementsByMachine: Record<string, number> = {}
      for (const machineId of activeMachineIds) {
        const shouldIncrease = Math.random() < 0.8
        incrementsByMachine[machineId] = shouldIncrease ? 1 + Math.floor(Math.random() * 5) : 0
      }

      setMachineCounters((prev) => {
        const next = { ...prev }
        for (const machineId of activeMachineIds) {
          const increment = incrementsByMachine[machineId] ?? 0
          if (increment <= 0) continue
          next[machineId] = (next[machineId] ?? 0) + increment
        }
        return next
      })

      setLastIncreaseAtByMachine((prev) => {
        const next = { ...prev }
        for (const machineId of activeMachineIds) {
          const increment = incrementsByMachine[machineId] ?? 0
          if (increment <= 0) continue
          next[machineId] = now
        }
        return next
      })
    }, 12_000)

    return () => window.clearInterval(intervalId)
  }, [activeMachineIds])

  const generateStagnationAlerts = (
    prevAlerts: Alert[],
  ): Alert[] => {
    const now = Date.now()
    const thresholdMs = Math.max(1, idleThresholdMinutes) * 60 * 1000
    let next = prevAlerts

    for (const machineId of activeMachineIds) {
      const lastIncreaseAt = lastIncreaseAtByMachine[machineId] ?? now
      const stagnantMs = now - lastIncreaseAt
      const isStagnant = stagnantMs >= thresholdMs
      const ruleAlertId = `rule-stagnant-production-${machineId}`
      const existingIndex = next.findIndex((a) => a.id === ruleAlertId)

      if (!isStagnant) continue

      const minutes = Math.max(0, Math.floor(stagnantMs / 60000))
      const machineLabel = machineId.toUpperCase()
      const currentCount = machineCounters[machineId] ?? 0
      const message = `La máquina ${machineLabel} lleva ${minutes} minutos sin aumentar su producción (contador actual: ${currentCount} uds). Verifica operación, abastecimiento y registro.`

      if (existingIndex === -1) {
        next = [
          {
            id: ruleAlertId,
            type: "warning",
            category: "production",
            title: `Producción sin avance en ${machineLabel}`,
            message,
            timestamp: new Date(now),
            isRead: false,
            machineId,
            actionRequired: true,
          },
          ...next,
        ]
        continue
      }

      const existing = next[existingIndex]
      const shouldReopen = existing.isRead || !existing.actionRequired
      if (shouldReopen || existing.message !== message) {
        const updated: Alert = {
          ...existing,
          message,
          timestamp: new Date(now),
          isRead: false,
          actionRequired: true,
        }
        next = [...next.slice(0, existingIndex), updated, ...next.slice(existingIndex + 1)]
      }
    }

    return next
  }

  return {
    machineCounters,
    lastIncreaseAtByMachine,
    activeMachineIds,
    generateStagnationAlerts,
  }
}
