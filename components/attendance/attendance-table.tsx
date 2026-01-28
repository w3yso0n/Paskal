"use client"

import { AttendanceRecord, AttendanceStatus } from "@/lib/mock-data"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Trash2, Edit2, Download } from "lucide-react"
import { cn } from "@/lib/utils"
import { exportAttendanceToExcel } from "@/lib/export-to-excel"

interface AttendanceTableProps {
  records: AttendanceRecord[]
  onDelete?: (id: string) => void
}

const statusConfig: Record<AttendanceStatus, { color: string; label: string }> = {
  "Asistente": { color: "bg-green-100 text-green-800", label: "Asistente" },
  "Ausente": { color: "bg-red-100 text-red-800", label: "Ausente" },
  "Retardo": { color: "bg-yellow-100 text-yellow-800", label: "Retardo" },
  "Permiso": { color: "bg-blue-100 text-blue-800", label: "Permiso" },
}

export function AttendanceTable({ records, onDelete }: AttendanceTableProps) {
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("es-ES", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() => exportAttendanceToExcel(records)}
          variant="outline"
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          Exportar a Excel
        </Button>
      </div>
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                Empleado
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                Fecha
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                Entrada
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                Salida
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                Horas
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                Estado
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                Notas
              </th>
              <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => {
              const config = statusConfig[record.status]
              return (
                <tr
                  key={record.id}
                  className="border-b border-border hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3 text-sm font-medium text-foreground">
                    {record.employeeName}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {formatDate(record.date)}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {record.checkInTime || "-"}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {record.checkOutTime || "-"}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-foreground">
                    {record.hoursWorked ? `${record.hoursWorked}h` : "-"}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <Badge className={cn("font-medium", config.color)}>
                      {config.label}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {record.notes || "-"}
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
                        onClick={() => onDelete?.(record.id)}
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
      {records.length === 0 && (
        <div className="px-4 py-8 text-center text-muted-foreground">
          No hay registros de asistencia
        </div>
      )}
      </div>
    </div>
  )
}
