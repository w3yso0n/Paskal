/** Rol primordial en piso — alineado con secciones del acumulado de bono (+ mantenimiento NFC). */
export type EmployeeProductionRole = "operator" | "packer" | "bending" | "roller" | "maintenance"

/** Rol temporal; la meta siempre permanece ligada al rol primordial. */
export type EmployeeSecondaryRole =
  | "operator"
  | "packer"
  | "roller"
  | "bending"
  | "auxiliary"

export const EMPLOYEE_PRODUCTION_ROLE_LABELS: Record<EmployeeProductionRole, string> = {
  operator: "Operador",
  packer: "Empacador",
  bending: "Operador bending",
  roller: "Operador roller",
  maintenance: "Mantenimiento",
}

export const EMPLOYEE_SECONDARY_ROLE_LABELS: Record<EmployeeSecondaryRole, string> = {
  operator: "Operador",
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
  "operator",
  "packer",
  "roller",
  "bending",
  "auxiliary",
]

/**
 * Temporal: ocultar bending/roller en formularios de empleados mientras esas
 * líneas no se monitorean (evita asignaciones incorrectas). Quitar de estos sets para reactivar.
 */
export const TEMPORARILY_HIDDEN_PRIMARY_ROLES = new Set<EmployeeProductionRole>([
  "bending",
  "roller",
])

export const TEMPORARILY_HIDDEN_SECONDARY_ROLES = new Set<EmployeeSecondaryRole>([
  "bending",
  "roller",
])

export const SELECTABLE_PRIMARY_ROLES: EmployeeProductionRole[] = PRIMARY_ROLES.filter(
  (r) => !TEMPORARILY_HIDDEN_PRIMARY_ROLES.has(r),
)

export const SELECTABLE_SECONDARY_ROLES: EmployeeSecondaryRole[] = SECONDARY_ROLES.filter(
  (r) => !TEMPORARILY_HIDDEN_SECONDARY_ROLES.has(r),
)

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
    value === "operator" ||
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
 * Su meta diaria también sigue al rol primordial: si un día trabaja como empacadora
 * (secondaryRole), esa producción cuenta hacia la misma meta de operadora.
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
  emp: {
    status?: string
    primaryRole: EmployeeProductionRole | null | undefined
    secondaryRole?: EmployeeSecondaryRole | null
  },
): boolean {
  return (
    emp.status === "active" &&
    (isOperatorRole(emp.primaryRole) ||
      (emp.primaryRole === "packer" && emp.secondaryRole === "operator"))
  )
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
  if ((primary === "operator" || primary === "packer") && secondaryRole) {
    return secondaryRole === "auxiliary" ? "auxiliary" : secondaryRole
  }
  return primary
}
