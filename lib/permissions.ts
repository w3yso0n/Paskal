import type { UserRole, RequestUser } from "./api"
import {
  EMPLOYEE_MODULES,
  EMPLEADOS_TAB_MODULES,
  METRICAS_TAB_MODULES,
  MODULE_ACCESS,
  REGLAS_MODULES,
  REGLAS_TAB_MODULES,
  ROLE_LABELS,
  USER_ROLES,
} from "./platform-permissions"
import type { PlatformModule } from "./platform-permissions"
export type { PlatformModule } from "./platform-permissions"

/**
 * Permisos granulares derivados de los módulos de plataforma.
 * El backend aplica ModuleAccessGuard; esta capa controla la UX.
 */
export type Permission =
  | "users.list"
  | "users.create"
  | "users.update"
  | "users.delete"
  | "alerts.dismiss"
  | "alerts.clear"
  | "production.edit-threshold"
  | "production.esp-idle-config"
  | "employees.manage"
  | "data-capture.manage"
  | "bonus-config.manage"
  | "business-rules.manage"
  | "data.browse"

const MODULE_TO_PERMISSIONS: Partial<Record<PlatformModule, readonly Permission[]>> = {
  gestion_usuarios: ["users.list", "users.create", "users.update", "users.delete"],
  alertas: ["alerts.dismiss", "alerts.clear"],
  reglas_umbrales: [
    "production.edit-threshold",
    "production.esp-idle-config",
  ],
  empleados_gestionar: ["employees.manage"],
  skus: ["business-rules.manage"],
  reglas_dias_festivos: ["business-rules.manage"],
  reglas_fallos_electricos: ["business-rules.manage"],
  captura_historico: ["data-capture.manage"],
  captura_produccion: ["data-capture.manage"],
  datos: ["data.browse"],
  metricas_asistencia_rotacion_bono: ["bonus-config.manage"],
}

function permissionsForRole(role: UserRole): Permission[] {
  const perms = new Set<Permission>()
  for (const [module, roles] of Object.entries(MODULE_ACCESS) as [
    PlatformModule,
    readonly UserRole[],
  ][]) {
    if (!roles.includes(role)) continue
    for (const p of MODULE_TO_PERMISSIONS[module] ?? []) {
      perms.add(p)
    }
  }
  return [...perms]
}

const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  supervisor: permissionsForRole("supervisor"),
  jefe_produccion: permissionsForRole("jefe_produccion"),
  gerente_operaciones: permissionsForRole("gerente_operaciones"),
  director: permissionsForRole("director"),
  rh: permissionsForRole("rh"),
  droven: permissionsForRole("droven"),
}

export function hasModuleAccess(
  user: RequestUser | null | undefined,
  module: PlatformModule,
): boolean {
  if (!user) return false
  if (user.isPlatformAdmin || user.role === "droven") return true
  return MODULE_ACCESS[module]?.includes(user.role) ?? false
}

export function hasAnyModuleAccess(
  user: RequestUser | null | undefined,
  modules: readonly PlatformModule[],
): boolean {
  return modules.some((module) => hasModuleAccess(user, module))
}

export function hasPermission(
  user: RequestUser | null | undefined,
  permission: Permission,
): boolean {
  if (!user) return false
  if (user.isPlatformAdmin || user.role === "droven") return true
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

export const ROUTE_MODULES: Record<string, PlatformModule[]> = {
  "/": ["inicio"],
  "/piso-produccion": ["piso_produccion"],
  "/tablero-operativo": ["tablero_operativo"],
  "/metricas": [
    "metricas_produccion",
    "metricas_incidencias",
    "metricas_mantenimiento",
    "metricas_asistencia_rotacion_bono",
  ],
  "/metas": ["metas"],
  "/alertas": ["alertas"],
  "/administracion/usuarios": ["gestion_usuarios"],
  "/empleados": [...EMPLOYEE_MODULES, "metricas_asistencia_rotacion_bono"],
  "/administracion/gestion-skus": ["skus"],
  "/gestion-skus": ["skus"],
  "/captura-datos": ["captura_produccion", "captura_historico"],
  "/reglas-negocio": [...REGLAS_MODULES, "metricas_asistencia_rotacion_bono"],
  "/configuracion-bono": ["metricas_asistencia_rotacion_bono"],
  "/datos": ["datos"],
}

/** Compatibilidad con RequirePermission existente. */
export const ROUTE_PERMISSIONS: Record<string, Permission[]> = {
  "/administracion/usuarios": ["users.list"],
  "/administracion/gestion-skus": ["business-rules.manage"],
  "/captura-datos": ["data-capture.manage"],
  "/configuracion-bono": ["bonus-config.manage"],
  "/reglas-negocio": ["business-rules.manage"],
  "/datos": ["data.browse"],
}

export function canAccessRoute(
  user: RequestUser | null | undefined,
  pathname: string,
): boolean {
  if (!user) return false
  const entry = Object.entries(ROUTE_MODULES).find(([prefix]) =>
    pathname === prefix || pathname.startsWith(prefix + "/"),
  )
  if (!entry) return true
  return hasAnyModuleAccess(user, entry[1])
}

export { ROLE_LABELS }

export function showAdminSection(user: RequestUser | null | undefined): boolean {
  return hasAnyModuleAccess(user, [
    "gestion_usuarios",
    "empleados_gestionar",
    "empleados_asignar_tarjetas",
    "empleados_transporte",
    "empleados_paros_vacaciones_rol_secundario",
    "skus",
    "captura_historico",
    "captura_produccion",
    ...REGLAS_MODULES,
    "metricas_asistencia_rotacion_bono",
  ])
}

export function showConfigSection(user: RequestUser | null | undefined): boolean {
  return !!user && USER_ROLES.includes(user.role)
}

export function showDataSection(user: RequestUser | null | undefined): boolean {
  return hasModuleAccess(user, "datos")
}

export function visibleMetricasTabs(user: RequestUser | null | undefined): string[] {
  return Object.entries(METRICAS_TAB_MODULES)
    .filter(([, module]) => hasModuleAccess(user, module))
    .map(([tab]) => tab)
}

export function visibleEmpleadosTabs(user: RequestUser | null | undefined): string[] {
  return Object.entries(EMPLEADOS_TAB_MODULES)
    .filter(([, moduleOrModules]) => {
      const modules = Array.isArray(moduleOrModules) ? moduleOrModules : [moduleOrModules]
      return hasAnyModuleAccess(user, modules)
    })
    .map(([tab]) => tab)
}

export function visibleReglasTabs(user: RequestUser | null | undefined): string[] {
  return Object.entries(REGLAS_TAB_MODULES)
    .filter(([, module]) => hasModuleAccess(user, module))
    .map(([tab]) => tab)
}
