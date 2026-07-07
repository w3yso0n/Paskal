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
    <td className="px-2 py-2 text-center">
      {allowed ? (
        <Check className="mx-auto h-4 w-4 text-emerald-600" aria-label="Sí" />
      ) : (
        <X className="mx-auto h-4 w-4 text-muted-foreground/40" aria-label="No" />
      )}
    </td>
  )
}

function MatrixTable({ rows }: { rows: AccessMatrixRow[] }) {
  let lastSection = ""

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            <th className="sticky left-0 z-10 bg-muted/95 px-3 py-2 text-left font-medium">
              Área
            </th>
            {USER_ROLES.map((role) => (
              <th
                key={role}
                className="px-2 py-2 text-center text-xs font-medium text-muted-foreground"
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
                className={cn("border-b border-border/50", showSection && "border-t border-border")}
              >
                <td className="sticky left-0 z-10 bg-background px-3 py-2">
                  {showSection ? (
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {row.section}
                    </span>
                  ) : null}
                  <div className={cn(showSection ? "mt-1" : "", "text-foreground")}>{row.label}</div>
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
        <CardTitle>Qué puede ver cada rol</CardTitle>
        <CardDescription>
          Referencia derivada de <code className="text-xs">lib/platform-permissions.ts</code> (misma
          fuente que el menú lateral y las pestañas). El rol <strong>droven</strong> y los admins de
          plataforma tienen bypass total en runtime aunque aquí solo se marquen los módulos
          explícitos del mapa.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <MatrixTable rows={rows} />
        <p className="text-xs text-muted-foreground">
          Acciones extra (crear usuarios, descartar alertas, editar umbrales, etc.) se derivan en{" "}
          <code className="text-xs">lib/permissions.ts</code> a partir de estos módulos. Si cambias
          permisos, edita <code className="text-xs">MODULE_ACCESS</code> y esta tabla se actualiza
          sola.
        </p>
      </CardContent>
    </Card>
  )
}
