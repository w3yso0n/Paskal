"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { OperatorCard, OperatorRow } from "@/components/operations/operator-card"
import { Trophy, Maximize2, Minimize2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/auth-context"
import { getProductionEvents, type ApiProductionEvent } from "@/lib/api"

type UiOperator = {
  id: number
  initials: string
  name: string
  machine: string
  sku: string
  units: number
  percentage: number
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const ini = parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join("")
  return ini || "?"
}

function isProductionIncrementEvent(e: ApiProductionEvent): boolean {
  const payload = e.payload ?? {}
  const rawEvent =
    (payload["EVENT"] as string | undefined) ??
    (payload["event"] as string | undefined) ??
    e.eventType
  const event = String(rawEvent ?? "").toLowerCase()
  if (!event) return false
  if (event.includes("produ")) return true
  return event === "producción" || event === "produccion"
}

function getEventCount(e: ApiProductionEvent): number {
  const payload = e.payload ?? {}
  const raw =
    (payload["COUNT"] as unknown) ??
    (payload["count"] as unknown) ??
    (payload["units"] as unknown)
  const n = typeof raw === "number" ? raw : Number(raw)
  return Number.isFinite(n) ? n : 0
}

export default function OperationsBoardPage() {
  const { user, getAccessToken } = useAuth()
  const [isFullscreen, setIsFullscreen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const [operators, setOperators] = useState<UiOperator[]>([])
  const [loading, setLoading] = useState(true)

  const handleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await containerRef.current?.requestFullscreen()
        setIsFullscreen(true)
      } else {
        await document.exitFullscreen()
        setIsFullscreen(false)
      }
    } catch (err) {
      console.error("Error toggling fullscreen:", err)
    }
  }
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const token = await getAccessToken()
        if (!token || !user?.orgId) {
          if (!cancelled) setOperators([])
          return
        }

        const events = await getProductionEvents(token, { orgId: user.orgId, limit: 2000 })
        if (cancelled) return

        const bonusGoal = 400
        const byOperator = new Map<
          string,
          { units: number; machine: string; sku: string }
        >()

        for (const e of events) {
          if (!isProductionIncrementEvent(e)) continue
          const count = getEventCount(e)
          if (count <= 0) continue

          const payload = e.payload ?? {}
          const op =
            String((payload["OPERATOR"] as string | undefined) ?? "").trim() || "SIN_OPERADOR"
          const machine =
            String(
              (payload["MACHINE_ID"] as string | undefined) ??
                (payload["machine"] as string | undefined) ??
                e.machineId ??
                "—",
            ).trim() || "—"
          const sku =
            String((payload["SKU"] as string | undefined) ?? "").trim() || "—"

          const current = byOperator.get(op) ?? { units: 0, machine, sku }
          byOperator.set(op, {
            units: current.units + count,
            machine: current.machine || machine,
            sku: current.sku !== "—" ? current.sku : sku,
          })
        }

        const rows: UiOperator[] = [...byOperator.entries()]
          .map(([name, v], idx) => ({
            id: idx + 1,
            initials: initialsFromName(name),
            name,
            machine: v.machine,
            sku: v.sku,
            units: v.units,
            percentage: bonusGoal > 0 ? (v.units / bonusGoal) * 100 : 0,
          }))
          .sort((a, b) => b.units - a.units)

        setOperators(rows)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    const intervalId = window.setInterval(load, 20_000)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [getAccessToken, user?.orgId])

  const sortedOperators = useMemo(
    () => [...operators].sort((a, b) => b.units - a.units),
    [operators],
  )
  const topThree = useMemo(() => sortedOperators.slice(0, 3), [sortedOperators])
  const restOperators = useMemo(() => sortedOperators.slice(3), [sortedOperators])
  const leftColumn = useMemo(() => restOperators.filter((_, i) => i % 2 === 0), [restOperators])
  const rightColumn = useMemo(() => restOperators.filter((_, i) => i % 2 === 1), [restOperators])
  const hasOperators = operators.length > 0

  return (
    <DashboardLayout 
      breadcrumbs={[
        { label: "Inicio", href: "/" },
        { label: "Tablero Operativo" }
      ]}
    >
      <div ref={containerRef} className={`space-y-3 ${isFullscreen ? 'fixed inset-0 bg-background overflow-auto p-8' : ''}`}>
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            <h1 className="text-xl font-bold text-foreground sm:text-2xl">Tablero Operativo en Vivo</h1>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={handleFullscreen}
            title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Top 3 Podium */}
        {loading ? (
          <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-muted-foreground">
            Cargando tablero…
          </div>
        ) : hasOperators ? (
          <>
            <div className="flex items-end justify-center">
              <div className="grid grid-flow-col auto-cols-max items-end gap-2">
                {topThree[1] && (
                  <div className="translate-y-4">
                    <OperatorCard operator={topThree[1]} rank={2} density="compact" />
                  </div>
                )}
                {topThree[0] && (
                  <div>
                    <OperatorCard operator={topThree[0]} rank={1} density="compact" />
                  </div>
                )}
                {topThree[2] && (
                  <div className="translate-y-4">
                    <OperatorCard operator={topThree[2]} rank={3} density="compact" />
                  </div>
                )}
              </div>
            </div>

            {/* Operator Rankings Table */}
            <div className="grid gap-0 lg:grid-cols-2">
              <div className="rounded-xl border border-border bg-card p-3">
                {leftColumn.map((operator, index) => (
                  <OperatorRow
                    key={operator.id}
                    operator={operator}
                    rank={4 + index * 2}
                    density="compact"
                  />
                ))}
              </div>
              <div className="rounded-xl border border-border bg-card p-3">
                {rightColumn.map((operator, index) => (
                  <OperatorRow
                    key={operator.id}
                    operator={operator}
                    rank={5 + index * 2}
                    density="compact"
                  />
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-muted-foreground">
            Sin datos de operadores. Los datos se cargan desde el PLC/ESP.
          </div>
        )}

        {/* Footer info */}
        <div className="text-center text-xs text-muted-foreground">
          Actualización automática • Meta bono: 400 uds
        </div>
      </div>
    </DashboardLayout>
  )
}
