"use client"

import { useMemo } from "react"
import { Check, X } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import {
  buildRoleAccessMatrix,
  ROLE_LABELS,
  USER_ROLES,
  type AccessMatrixRow,
} from "@/lib/role-access-matrix"

function AccessCell({ allowed }: { allowed: boolean }) {
  return (
    <td className="px-2 py-2.5 text-center align-middle">
      {allowed ? (
        <Check className="mx-auto h-4 w-4 text-emerald-600" aria-label="Sí" />
      ) : (
        <X className="mx-auto h-4 w-4 text-muted-foreground/35" aria-label="No" />
      )}
    </td>
  )
}

function MatrixTable({ rows }: { rows: AccessMatrixRow[] }) {
  let lastSection = ""

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[780px] text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            <th className="sticky left-0 z-10 bg-muted/95 px-3 py-2.5 text-left font-medium">
              Capacidad
            </th>
            {USER_ROLES.map((role) => (
              <th
                key={role}
                className="max-w-30 px-2 py-2.5 text-center text-xs font-medium leading-snug text-muted-foreground"
              >
                {ROLE_LABELS[role]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const showSection = row.section !== lastSection
            if (showSection) lastSection = row.section
            return (
              <tr
                key={row.id}
                className={cn(
                  "border-b border-border/50",
                  showSection && "border-t-2 border-border",
                )}
              >
                <td className="sticky left-0 z-10 bg-background px-3 py-2.5 align-top">
                  {showSection ? (
                    <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {row.section}
                    </div>
                  ) : null}
                  <div className="font-medium text-foreground">{row.label}</div>
                  {row.detail ? (
                    <div className="mt-0.5 text-xs text-muted-foreground">{row.detail}</div>
                  ) : null}
                </td>
                {USER_ROLES.map((role) => (
                  <AccessCell key={role} allowed={row.roles[role]} />
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function RolePermissionsMatrix() {
  const rows = useMemo(() => buildRoleAccessMatrix(), [])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Qué puede hacer cada rol</CardTitle>
        <CardDescription>
          Matriz derivada de los módulos de la plataforma. Incluye el directorio de empleados
          (ver / agregar / editar / eliminar) y el resto de áreas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <MatrixTable rows={rows} />
      </CardContent>
    </Card>
  )
}
