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
  /** Configuración de temporizadores de paro hacia la ESP32 (solo rol admin en org). */
  | "production.esp-idle-config"
  | "employees.manage"
  | "data-capture.manage"
  | "bonus-config.manage"
  | "business-rules.manage"
  | "platform-config.view"
  | "platform-config.edit"
  /** Consulta de solo lectura de las tablas del sistema (sección "Datos", herramienta de validación). */
  | "data.browse"

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
    "production.esp-idle-config",
    "platform-config.view",
    "platform-config.edit",
    "employees.manage",
    "data-capture.manage",
    "bonus-config.manage",
    "business-rules.manage",
    "data.browse",
  ],
  manager: [
    "alert-rules.list",
    "alert-rules.create",
    "alert-rules.delete",
    "alerts.dismiss",
    "alerts.clear",
    "production.edit-threshold",
    "employees.manage",
    "bonus-config.manage",
    "business-rules.manage",
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
  permissions: Permission[] | undefined,
): boolean {
  if (!permissions?.length) return false
  return permissions.some((p) => hasPermission(user, p))
}

export function hasAllPermissions(
  user: RequestUser | null | undefined,
  permissions: Permission[] | undefined,
): boolean {
  if (!permissions?.length) return false
  return permissions.every((p) => hasPermission(user, p))
}

/**
 * Route-level permission requirements.
 * Maps path prefixes to the permissions needed to access them.
 */
export const ROUTE_PERMISSIONS: Record<string, Permission[]> = {
  "/administracion/usuarios": ["users.list"],
  "/administracion/configuracion-organizacion": ["platform-config.view"],
  "/administracion/gestion-skus": ["business-rules.manage"],
  "/captura-datos": ["data-capture.manage"],
  "/configuracion-bono": ["business-rules.manage"],
  "/reglas-negocio": ["business-rules.manage"],
  "/configuracion": ["platform-config.view"],
  "/datos": ["data.browse"],
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
    "data-capture.manage",
    "bonus-config.manage",
    "alert-rules.list",
  ])
}

/**
 * Whether the sidebar should show the "platform config" section.
 */
export function showPlatformSection(user: RequestUser | null | undefined): boolean {
  return hasPermission(user, "platform-config.view")
}

/**
 * Whether the sidebar should show the "Datos" (read-only table browser) section.
 */
export function showDataSection(user: RequestUser | null | undefined): boolean {
  return hasPermission(user, "data.browse")
}
