/** Rol primordial en piso — alineado con secciones del acumulado de bono. */
export type EmployeeProductionRole = "operator" | "packer" | "bending" | "roller"

/** Rol secundario (desde operador: empaque, roller, bending o auxiliar). */
export type EmployeeSecondaryRole = "packer" | "roller" | "bending" | "auxiliary"

export const EMPLOYEE_PRODUCTION_ROLE_LABELS: Record<EmployeeProductionRole, string> = {
  operator: "Operador",
  packer: "Empacador",
  bending: "Operador bending",
  roller: "Operador roller",
}

export const EMPLOYEE_SECONDARY_ROLE_LABELS: Record<EmployeeSecondaryRole, string> = {
  packer: "Empaque",
  roller: "Roller",
  bending: "Bending",
  auxiliary: "Auxiliar",
}

export const PRIMARY_ROLES: EmployeeProductionRole[] = [
  "operator",
  "packer",
  "bending",
  "roller",
]

export const SECONDARY_ROLES: EmployeeSecondaryRole[] = [
  "packer",
  "roller",
  "bending",
  "auxiliary",
]

export function isEmployeeProductionRole(value: string): value is EmployeeProductionRole {
  return (
    value === "operator" ||
    value === "packer" ||
    value === "bending" ||
    value === "roller"
  )
}

export function isEmployeeSecondaryRole(value: string): value is EmployeeSecondaryRole {
  return (
    value === "packer" ||
    value === "roller" ||
    value === "bending" ||
    value === "auxiliary"
  )
}

/** Inferir rol primordial desde texto de puesto (legacy). */
export function inferProductionRoleFromPosition(
  position: string | null | undefined,
): EmployeeProductionRole | null {
  const p = String(position ?? "").toLowerCase()
  if (!p.trim()) return null
  if (p.includes("empac")) return "packer"
  if (p.includes("bend") || p.includes("dobl")) return "bending"
  if (p.includes("roll") || p.includes("rodill")) return "roller"
  if (p.includes("aux")) return "operator"
  if (p.includes("oper")) return "operator"
  return "operator"
}

export function resolveEmployeeProductionRole(
  primaryRole: EmployeeProductionRole | null | undefined,
  position: string | null | undefined,
): EmployeeProductionRole | null {
  if (primaryRole && isEmployeeProductionRole(primaryRole)) return primaryRole
  return inferProductionRoleFromPosition(position)
}

export function nfcRoleFromProductionRole(
  role: EmployeeProductionRole | null,
): "OPERATOR" | "PACKAGER" {
  return role === "packer" ? "PACKAGER" : "OPERATOR"
}

/** Rol efectivo en reporte de bono para un día (primordial + secundario). */
export type BonusEffectiveRole = EmployeeProductionRole | "auxiliary"

export function resolveEffectiveBonusRole(
  primaryRole: EmployeeProductionRole | null | undefined,
  secondaryRole: EmployeeSecondaryRole | null | undefined,
): BonusEffectiveRole | null {
  const primary = resolveEmployeeProductionRole(primaryRole, null)
  if (!primary) return null
  if (primary === "operator" && secondaryRole) {
    return secondaryRole === "auxiliary" ? "auxiliary" : secondaryRole
  }
  return primary
}
