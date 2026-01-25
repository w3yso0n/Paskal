"use client"

import { ShiftRotation, ShiftType } from "@/lib/mock-data"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Trash2, Edit2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface ShiftRotationTableProps {
  rotations: ShiftRotation[]
  onDelete?: (id: string) => void
}

const shiftConfig: Record<ShiftType, { color: string; bg: string }> = {
  "Mañana": { color: "text-orange-700", bg: "bg-orange-100" },
  "Tarde": { color: "text-blue-700", bg: "bg-blue-100" },
  "Noche": { color: "text-purple-700", bg: "bg-purple-100" },
}

const statusConfig = {
  "Programado": "bg-blue-100 text-blue-800",
  "Completado": "bg-green-100 text-green-800",
  "Cancelado": "bg-red-100 text-red-800",
}

export function ShiftRotationTable({ rotations, onDelete }: ShiftRotationTableProps) {
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("es-ES", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                Empleado
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                Máquina
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                Turno
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                Fecha
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                Horario
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                Estado
              </th>
              <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody>
            {rotations.map((rotation) => {
              const shift = shiftConfig[rotation.shift]
              const status = statusConfig[rotation.status as keyof typeof statusConfig]
              return (
                <tr
                  key={rotation.id}
                  className="border-b border-border hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3 text-sm font-medium text-foreground">
                    {rotation.employeeName}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-cyan-600">
                    {rotation.machine}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <Badge className={cn("font-medium", shift.bg, shift.color)}>
                      {rotation.shift}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {formatDate(rotation.date)}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {rotation.startTime} - {rotation.endTime}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <Badge className={cn("font-medium", status)}>
                      {rotation.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex justify-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        title="Editar"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        onClick={() => onDelete?.(rotation.id)}
                        title="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {rotations.length === 0 && (
        <div className="px-4 py-8 text-center text-muted-foreground">
          No hay rotaciones programadas
        </div>
      )}
    </div>
  )
}
