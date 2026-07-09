"use client"

import { useRef } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { AttendanceRecord, AttendanceStatus } from "@/lib/types"
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
  Asistente: { color: "bg-green-100 text-green-800", label: "Asistente" },
  Ausente: { color: "bg-red-100 text-red-800", label: "Ausente" },
  Retardo: { color: "bg-yellow-100 text-yellow-800", label: "Retardo" },
  Permiso: { color: "bg-blue-100 text-blue-800", label: "Permiso" },
  Vacaciones: { color: "bg-emerald-100 text-emerald-800", label: "Vacaciones" },
  Incapacidad: { color: "bg-purple-100 text-purple-800", label: "Incapacidad" },
  "Falta justificada": { color: "bg-amber-100 text-amber-900", label: "Falta justificada" },
  "Permiso sin goce": { color: "bg-slate-100 text-slate-800", label: "Permiso sin goce" },
  "Tiempo por tiempo": { color: "bg-cyan-100 text-cyan-900", label: "Tiempo por tiempo" },
}

const ROW_HEIGHT = 48

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("es-ES", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

export function AttendanceTable({ records, onDelete }: AttendanceTableProps) {
  const parentRef = useRef<HTMLDivElement>(null)

  const rowVirtualizer = useVirtualizer({
    count: records.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  })

  const totalSize = rowVirtualizer.getTotalSize()
  const virtualItems = rowVirtualizer.getVirtualItems()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {records.length.toLocaleString("es-MX")} registros
        </p>
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
        {/* Header fijo */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left text-sm font-semibold text-foreground min-w-[160px]">Empleado</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-foreground min-w-[140px]">Fecha</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-foreground min-w-[80px]">Entrada</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-foreground min-w-[80px]">Salida</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-foreground min-w-[60px]">Horas</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-foreground min-w-[130px]">Estado</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-foreground min-w-[160px]">Notas</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-foreground min-w-[80px]">Acciones</th>
              </tr>
            </thead>
          </table>
        </div>

        {records.length === 0 ? (
          <div className="px-4 py-8 text-center text-muted-foreground">
            No hay registros de asistencia
          </div>
        ) : (
          /* Contenedor virtualizado */
          <div
            ref={parentRef}
            className="overflow-x-auto overflow-y-auto"
            style={{ maxHeight: 520 }}
          >
            <div style={{ height: totalSize, position: "relative" }}>
              <table className="w-full">
                <tbody>
                  {/* Spacer superior */}
                  {virtualItems.length > 0 && virtualItems[0]!.start > 0 && (
                    <tr style={{ height: virtualItems[0]!.start }} />
                  )}
                  {virtualItems.map((virtualRow) => {
                    const record = records[virtualRow.index]!
                    const config = statusConfig[record.status] ?? statusConfig.Asistente
                    return (
                      <tr
                        key={record.id}
                        style={{ height: ROW_HEIGHT }}
                        className="border-b border-border hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-4 py-3 text-sm font-medium text-foreground min-w-[160px]">
                          {record.employeeName}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground min-w-[140px]">
                          {formatDate(record.date)}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground min-w-[80px]">
                          {record.checkInTime || "-"}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground min-w-[80px]">
                          {record.checkOutTime || "-"}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-foreground min-w-[60px]">
                          {record.hoursWorked ? `${record.hoursWorked}h` : "-"}
                        </td>
                        <td className="px-4 py-3 text-sm min-w-[130px]">
                          <Badge className={cn("font-medium", config.color)}>
                            {config.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground min-w-[160px] max-w-[240px] truncate">
                          {record.notes || "-"}
                        </td>
                        <td className="px-4 py-3 text-center min-w-[80px]">
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
                  {/* Spacer inferior */}
                  {virtualItems.length > 0 && (() => {
                    const last = virtualItems[virtualItems.length - 1]!
                    const bottomSpace = totalSize - (last.start + last.size)
                    return bottomSpace > 0 ? <tr style={{ height: bottomSpace }} /> : null
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
