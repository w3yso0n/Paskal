/** Rol primordial en piso — alineado con secciones del acumulado de bono (+ mantenimiento NFC). */
export type EmployeeProductionRole = "operator" | "packer" | "bending" | "roller" | "maintenance"

/** Rol secundario (desde operador: empaque, roller, bending o auxiliar). */
export type EmployeeSecondaryRole = "packer" | "roller" | "bending" | "auxiliary"

export const EMPLOYEE_PRODUCTION_ROLE_LABELS: Record<EmployeeProductionRole, string> = {
  operator: "Operador",
  packer: "Empacador",
  bending: "Operador bending",
  roller: "Operador roller",
  maintenance: "Mantenimiento",
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
  "maintenance",
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
    value === "roller" ||
    value === "maintenance"
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

export function resolveEmployeeProductionRole(
  primaryRole: EmployeeProductionRole | null | undefined,
): EmployeeProductionRole | null {
  if (primaryRole && isEmployeeProductionRole(primaryRole)) return primaryRole
  return null
}

/**
 * ¿El empleado se puede asignar como **operador**? Solo cuenta su rol primordial:
 * un operador es quien tiene `primaryRole = operator`.
 */
export function isOperatorRole(
  primaryRole: EmployeeProductionRole | null | undefined,
): boolean {
  return primaryRole === "operator"
}

/**
 * ¿El empleado se puede asignar como **empacador**? Aplica a empacadores de base
 * (`primaryRole = packer`) y a operadores que cubren empaque (`secondaryRole = packer`).
 */
export function isPackerRole(
  primaryRole: EmployeeProductionRole | null | undefined,
  secondaryRole: EmployeeSecondaryRole | null | undefined,
): boolean {
  if (primaryRole === "packer") return true
  return primaryRole === "operator" && secondaryRole === "packer"
}

/** Empleado activo que puede asignarse como operador en piso de producción. */
export function isFloorOperatorCandidate(
  emp: { status?: string; primaryRole: EmployeeProductionRole | null | undefined },
): boolean {
  return emp.status === "active" && isOperatorRole(emp.primaryRole)
}

/** Empleado activo que puede asignarse como empacador en piso de producción. */
export function isFloorPackerCandidate(
  emp: {
    status?: string
    primaryRole: EmployeeProductionRole | null | undefined
    secondaryRole: EmployeeSecondaryRole | null | undefined
  },
): boolean {
  return emp.status === "active" && isPackerRole(emp.primaryRole, emp.secondaryRole)
}

export function nfcRoleFromProductionRole(
  role: EmployeeProductionRole | null,
): "OPERATOR" | "PACKAGER" | "MAINTENANCE" {
  if (role === "packer") return "PACKAGER"
  if (role === "maintenance") return "MAINTENANCE"
  return "OPERATOR"
}

/** Rol efectivo en reporte de bono para un día (primordial + secundario). */
export type BonusEffectiveRole = EmployeeProductionRole | "auxiliary"

export function resolveEffectiveBonusRole(
  primaryRole: EmployeeProductionRole | null | undefined,
  secondaryRole: EmployeeSecondaryRole | null | undefined,
): BonusEffectiveRole | null {
  if (primaryRole === "maintenance") return null
  const primary = resolveEmployeeProductionRole(primaryRole)
  if (!primary) return null
  if (primary === "operator" && secondaryRole) {
    return secondaryRole === "auxiliary" ? "auxiliary" : secondaryRole
  }
  return primary
}
