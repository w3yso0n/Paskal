"use client"

import { AttendanceStats } from "@/lib/mock-data"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

interface AttendanceStatsCardProps {
  stats: AttendanceStats[]
}

export function AttendanceStatsCards({ stats }: AttendanceStatsCardProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.employeeId} className="p-4">
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-foreground">{stat.employeeName}</p>
              <p className="text-xs text-muted-foreground">
                {stat.totalDays} días laborales
              </p>
            </div>

            {/* Attendance percentage */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-foreground">Asistencia</span>
                <span
                  className={cn(
                    "text-sm font-bold",
                    stat.attendancePercentage >= 90
                      ? "text-green-600"
                      : stat.attendancePercentage >= 80
                        ? "text-yellow-600"
                        : "text-red-600"
                  )}
                >
                  {stat.attendancePercentage}%
                </span>
              </div>
              <Progress
                value={stat.attendancePercentage}
                className="h-2"
              />
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded bg-green-50 p-2">
                <p className="text-green-700 font-semibold">{stat.presentDays}</p>
                <p className="text-green-600">Presentes</p>
              </div>
              <div className="rounded bg-red-50 p-2">
                <p className="text-red-700 font-semibold">{stat.absentDays}</p>
                <p className="text-red-600">Ausentes</p>
              </div>
              <div className="rounded bg-yellow-50 p-2">
                <p className="text-yellow-700 font-semibold">{stat.lateDays}</p>
                <p className="text-yellow-600">Retardos</p>
              </div>
              <div className="rounded bg-blue-50 p-2">
                <p className="text-blue-700 font-semibold">{stat.permissions}</p>
                <p className="text-blue-600">Permisos</p>
              </div>
            </div>

            {/* Average hours */}
            <div className="border-t border-border pt-2">
              <p className="text-xs text-muted-foreground">Promedio de horas</p>
              <p className="text-lg font-bold text-foreground">
                {stat.averageHoursWorked.toFixed(1)}h
              </p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}
