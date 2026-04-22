import type { UserRole, RequestUser } from "./api"

/**
 * Granular permissions for the platform.
 * Each permission maps to a specific action the UI can gate.
 * The backend enforces its own guards (OrgAdminGuard, PlatformAdminGuard),
 * so this layer provides UX-level gating + prepares for finer backend guards.
 */
export type Permission =
  | "users.list"
  | "users.create"
  | "users.delete"
  | "alert-rules.list"
  | "alert-rules.create"
  | "alert-rules.delete"
  | "alerts.dismiss"
  | "alerts.clear"
  | "production.edit-threshold"
  | "employees.manage"
  | "platform-config.view"
  | "platform-config.edit"

const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  admin: [
    "users.list",
    "users.create",
    "users.delete",
    "alert-rules.list",
    "alert-rules.create",
    "alert-rules.delete",
    "alerts.dismiss",
    "alerts.clear",
    "production.edit-threshold",
    "platform-config.view",
    "platform-config.edit",
    "employees.manage",
  ],
  manager: [
    "alert-rules.list",
    "alert-rules.create",
    "alert-rules.delete",
    "alerts.dismiss",
    "alerts.clear",
    "production.edit-threshold",
    "employees.manage",
  ],
  operator: [
    "alerts.dismiss",
  ],
  viewer: [],
}

export function hasPermission(
  user: RequestUser | null | undefined,
  permission: Permission,
): boolean {
  if (!user) return false
  if (user.isPlatformAdmin) return true
  return ROLE_PERMISSIONS[user.role]?.includes(permission) ?? false
}

export function hasAnyPermission(
  user: RequestUser | null | undefined,
  permissions: Permission[],
): boolean {
  return permissions.some((p) => hasPermission(user, p))
}

export function hasAllPermissions(
  user: RequestUser | null | undefined,
  permissions: Permission[],
): boolean {
  return permissions.every((p) => hasPermission(user, p))
}

/**
 * Route-level permission requirements.
 * Maps path prefixes to the permissions needed to access them.
 */
export const ROUTE_PERMISSIONS: Record<string, Permission[]> = {
  "/administracion/usuarios": ["users.list"],
  "/administracion/configuracion-organizacion": ["platform-config.view"],
  "/configuracion": ["platform-config.view"],
}

export function canAccessRoute(
  user: RequestUser | null | undefined,
  pathname: string,
): boolean {
  if (!user) return false
  const entry = Object.entries(ROUTE_PERMISSIONS).find(([prefix]) =>
    pathname.startsWith(prefix),
  )
  if (!entry) return true
  return hasAnyPermission(user, entry[1])
}

/**
 * Readable labels for roles.
 */
export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  manager: "Gestor",
  operator: "Operador",
  viewer: "Visualizador",
}

/**
 * Whether the sidebar should show the "administration" section.
 */
export function showAdminSection(user: RequestUser | null | undefined): boolean {
  return hasAnyPermission(user, [
    "users.list",
    "platform-config.view",
    "employees.manage",
    "alert-rules.list",
  ])
}

/**
 * Whether the sidebar should show the "platform config" section.
 */
export function showPlatformSection(user: RequestUser | null | undefined): boolean {
  return hasPermission(user, "platform-config.view")
}
