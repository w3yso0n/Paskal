"use client"

import { useState, useRef } from "react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { OperatorCard, OperatorRow } from "@/components/operations/operator-card"
import { operators } from "@/lib/mock-data"
import { Trophy, Maximize2, Minimize2 } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function OperationsBoardPage() {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

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
  const sortedOperators = [...operators].sort((a, b) => b.units - a.units)
  const topThree = sortedOperators.slice(0, 3)
  const restOperators = sortedOperators.slice(3)
  
  // Split remaining operators into two columns
  const leftColumn = restOperators.filter((_, i) => i % 2 === 0)
  const rightColumn = restOperators.filter((_, i) => i % 2 === 1)

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
        <div className="flex items-end justify-center">
  <div className="grid grid-flow-col auto-cols-max items-end gap-2">
    <div className="translate-y-4">
      <OperatorCard operator={topThree[1]} rank={2} density="compact" />
    </div>

    <div>
      <OperatorCard operator={topThree[0]} rank={1} density="compact" />
    </div>

    <div className="translate-y-4">
      <OperatorCard operator={topThree[2]} rank={3} density="compact" />
    </div>
  </div>
</div>


        {/* Operator Rankings Table */}
        <div className="grid gap-0 lg:grid-cols-2">
          {/* Left Column */}
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

          {/* Right Column */}
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

        {/* Footer info */}
        <div className="text-center text-xs text-muted-foreground">
          Actualización automática • Meta bono: 400 uds
        </div>
      </div>
    </DashboardLayout>
  )
}
