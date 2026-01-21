"use client"

import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { OperatorCard, OperatorRow } from "@/components/operations/operator-card"
import { operators } from "@/lib/mock-data"
import { Trophy } from "lucide-react"

export default function OperationsBoardPage() {
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
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Trophy className="h-6 w-6 text-yellow-500" />
          <h1 className="text-2xl font-bold text-foreground">Tablero Operativo en Vivo</h1>
        </div>

        {/* Top 3 Podium */}
        <div className="flex justify-center gap-4">
          {/* 2nd place */}
          <div className="mt-8">
            <OperatorCard operator={topThree[1]} rank={2} />
          </div>
          {/* 1st place (leader) */}
          <div>
            <OperatorCard operator={topThree[0]} rank={1} />
          </div>
          {/* 3rd place */}
          <div className="mt-8">
            <OperatorCard operator={topThree[2]} rank={3} />
          </div>
        </div>

        {/* Operator Rankings Table */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left Column */}
          <div className="rounded-xl border border-border bg-card p-4">
            {leftColumn.map((operator, index) => (
              <OperatorRow
                key={operator.id}
                operator={operator}
                rank={4 + index * 2}
              />
            ))}
          </div>

          {/* Right Column */}
          <div className="rounded-xl border border-border bg-card p-4">
            {rightColumn.map((operator, index) => (
              <OperatorRow
                key={operator.id}
                operator={operator}
                rank={5 + index * 2}
              />
            ))}
          </div>
        </div>

        {/* Footer info */}
        <div className="text-center text-sm text-muted-foreground">
          Actualización automática • Meta bono: 400 uds
        </div>
      </div>
    </DashboardLayout>
  )
}
