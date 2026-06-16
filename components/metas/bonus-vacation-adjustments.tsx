"use client"

import React, { useEffect, useMemo, useState } from "react"
import { CalendarOff, Loader2 } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/contexts/auth-context"
import {
  getEmployeeDayRecords,
  getResolvedHolidaysForMonth,
  type ApiEmployeeDayRecord,
} from "@/lib/api"
import type { BonusProductionConfigData } from "@/lib/bonus-production-config"
import {
  buildEmployeeVacationBonusAdjustments,
  type EmployeeVacationBonusAdjustment,
  type VacationRecordType,
} from "@/lib/bonus-vacation-meta"
import { monthDateBounds } from "@/lib/bonus-goals-bridge"

const shiftLabels = {
  matutino: "Turno 1",
  vespertino: "Turno 2",
} as const

type Props = {
  bonusConfigMonth: string
  bonusConfig: BonusProductionConfigData
}

export function BonusVacationAdjustmentsPanel({ bonusConfigMonth, bonusConfig }: Props) {
  const { getAccessToken } = useAuth()
  const [loading, setLoading] = useState(true)
  const [adjustments, setAdjustments] = useState<EmployeeVacationBonusAdjustment[]>([])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const token = await getAccessToken()
        if (!token || cancelled) return

        const bounds = monthDateBounds(bonusConfigMonth)
        const [year, month] = bonusConfigMonth.split("-").map(Number)
        const [records, resolvedHolidays] = await Promise.all([
          getEmployeeDayRecords(token, {
            from: bounds.startDate,
            to: bounds.endDate,
            limit: 5000,
          }),
          Number.isFinite(year) && Number.isFinite(month)
            ? getResolvedHolidaysForMonth(token, year, month)
            : Promise.resolve([] as string[]),
        ])

        if (cancelled) return

        const mapped = records
          .filter((r) => r.recordType === "vacation")
          .map((r) => ({
            employeeName: r.employeeName,
            recordDate: r.recordDate,
            shift: r.shift,
            recordType: "vacation" as VacationRecordType,
          }))

        const rows = buildEmployeeVacationBonusAdjustments(
          mapped,
          bonusConfigMonth,
          bonusConfig,
          new Set(resolvedHolidays),
        )
        setAdjustments(rows)
      } catch {
        if (!cancelled) setAdjustments([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [bonusConfigMonth, bonusConfig, getAccessToken])

  const totalVacationDays = useMemo(
    () => adjustments.reduce((sum, row) => sum + row.vacationDays, 0),
    [adjustments],
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <CalendarOff className="h-5 w-5 text-primary" />
          Meta de bono ajustada por vacaciones
        </CardTitle>
        <CardDescription>
          Mes {bonusConfigMonth}. Cada día con <strong>V</strong> registrado en Gestión de empleados
          reduce los días meta (columnas AC/AE) y las piezas objetivo en el acumulado de bono.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            Calculando ajustes…
          </div>
        ) : adjustments.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No hay vacaciones registradas en este mes que afecten la meta de bono.
          </p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {adjustments.length} empleado(s) · {totalVacationDays} día(s) de vacaciones en total
            </p>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Empleado</th>
                    <th className="px-3 py-2 font-medium">Turno</th>
                    <th className="px-3 py-2 font-medium text-center">V</th>
                    <th className="px-3 py-2 font-medium text-center">Días meta</th>
                    <th className="px-3 py-2 font-medium text-center">Días efectivos</th>
                    <th className="px-3 py-2 font-medium text-right">Meta 100%</th>
                    <th className="px-3 py-2 font-medium text-right">Meta 110%</th>
                  </tr>
                </thead>
                <tbody>
                  {adjustments.map((row) => (
                    <tr key={`${row.employeeName}-${row.shift}`} className="border-b last:border-0">
                      <td className="px-3 py-2 font-medium">{row.employeeName}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline">{shiftLabels[row.shift]}</Badge>
                      </td>
                      <td className="px-3 py-2 text-center text-amber-700 font-semibold">
                        {row.vacationDays}
                      </td>
                      <td className="px-3 py-2 text-center text-muted-foreground">
                        {row.baseWorkingDays}
                      </td>
                      <td className="px-3 py-2 text-center font-medium">
                        {row.effectiveWorkingDays}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {row.meta100Pieces.toLocaleString("es-MX")}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {row.meta110Pieces.toLocaleString("es-MX", { maximumFractionDigits: 0 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
