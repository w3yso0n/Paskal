import type { UserRole } from "./api"
import {
  MODULE_ACCESS,
  ROLE_LABELS,
  USER_ROLES,
  type PlatformModule,
} from "./platform-permissions"

export type AccessMatrixRow = {
  id: string
  section: string
  label: string
  /** Texto corto opcional bajo la etiqueta (qué implica el permiso). */
  detail?: string
  roles: Record<UserRole, boolean>
}

type CapabilityDef = {
  id: string
  section: string
  label: string
  detail?: string
  /** Acceso si el rol tiene cualquiera de estos módulos. */
  modules: readonly PlatformModule[]
}

/**
 * Capacidades visibles en la matriz. Se derivan de `MODULE_ACCESS`
 * (misma fuente que `hasModuleAccess`), con etiquetas orientadas a acciones.
 */
const CAPABILITIES: readonly CapabilityDef[] = [
  // —— Menú principal ——
  {
    id: "nav:inicio",
    section: "Menú principal",
    label: "Ver Inicio (dashboard)",
    modules: ["inicio"],
  },
  {
    id: "nav:piso",
    section: "Menú principal",
    label: "Usar piso de producción",
    detail: "Asignar operadores/empacadores y ver máquinas",
    modules: ["piso_produccion"],
  },
  {
    id: "nav:tablero",
    section: "Menú principal",
    label: "Ver tablero operativo",
    modules: ["tablero_operativo"],
  },
  {
    id: "nav:metas",
    section: "Menú principal",
    label: "Ver y gestionar metas",
    modules: ["metas"],
  },
  {
    id: "nav:alertas",
    section: "Menú principal",
    label: "Ver y gestionar alertas",
    modules: ["alertas"],
  },
  {
    id: "nav:config",
    section: "Menú principal",
    label: "Configurar su cuenta",
    modules: ["configuracion"],
  },

  // —— Empleados ——
  {
    id: "emp:crud",
    section: "Empleados",
    label: "Ver, agregar, editar y eliminar empleados",
    detail: "Directorio completo (CRUD)",
    modules: ["empleados_gestionar"],
  },
  {
    id: "emp:nfc",
    section: "Empleados",
    label: "Asignar o cambiar tarjetas NFC",
    modules: ["empleados_asignar_tarjetas"],
  },
  {
    id: "emp:transporte",
    section: "Empleados",
    label: "Gestionar apoyo de transporte",
    modules: ["empleados_transporte"],
  },
  {
    id: "emp:paros",
    section: "Empleados",
    label: "Registrar vacaciones, paros e incidencias",
    detail: "Ausencias y registros diarios",
    modules: ["empleados_paros_vacaciones_rol_secundario"],
  },
  {
    id: "emp:roles",
    section: "Empleados",
    label: "Cambiar rol secundario del día",
    modules: ["empleados_paros_vacaciones_rol_secundario"],
  },
  {
    id: "emp:asistencia",
    section: "Empleados",
    label: "Ver asistencia en empleados",
    modules: ["metricas_asistencia_rotacion_bono"],
  },

  // —— Métricas ——
  {
    id: "met:prod",
    section: "Métricas",
    label: "Ver producción, operadores y paros",
    modules: ["metricas_produccion"],
  },
  {
    id: "met:inc",
    section: "Métricas",
    label: "Ver incidencias",
    modules: ["metricas_incidencias"],
  },
  {
    id: "met:mant",
    section: "Métricas",
    label: "Ver mantenimiento",
    modules: ["metricas_mantenimiento"],
  },
  {
    id: "met:asist",
    section: "Métricas",
    label: "Ver asistencia, rotación y bono",
    modules: ["metricas_asistencia_rotacion_bono"],
  },

  // —— Reglas de negocio ——
  {
    id: "reg:festivos",
    section: "Reglas de negocio",
    label: "Gestionar días festivos",
    modules: ["reglas_dias_festivos"],
  },
  {
    id: "reg:electricos",
    section: "Reglas de negocio",
    label: "Gestionar fallos eléctricos",
    modules: ["reglas_fallos_electricos"],
  },
  {
    id: "reg:umbrales",
    section: "Reglas de negocio",
    label: "Editar umbrales de alerta y scrap",
    modules: ["reglas_umbrales"],
  },
  {
    id: "reg:bono",
    section: "Reglas de negocio",
    label: "Configurar bono",
    modules: ["metricas_asistencia_rotacion_bono"],
  },

  // —— Administración ——
  {
    id: "adm:usuarios",
    section: "Administración",
    label: "Gestionar usuarios de la plataforma",
    detail: "Crear, editar y eliminar cuentas",
    modules: ["gestion_usuarios"],
  },
  {
    id: "adm:skus",
    section: "Administración",
    label: "Gestionar catálogo de SKUs",
    modules: ["skus"],
  },
  {
    id: "adm:captura",
    section: "Administración",
    label: "Capturar datos de producción",
    modules: ["captura_produccion"],
  },
  {
    id: "adm:historico",
    section: "Administración",
    label: "Capturar / corregir histórico",
    modules: ["captura_historico"],
  },
  {
    id: "adm:datos",
    section: "Administración",
    label: "Consultar tablas SQL (Datos)",
    modules: ["datos"],
  },
]

function roleHasAnyModule(role: UserRole, modules: readonly PlatformModule[]): boolean {
  return modules.some((module) => MODULE_ACCESS[module]?.includes(role) ?? false)
}

function rowForCapability(cap: CapabilityDef): AccessMatrixRow {
  return {
    id: cap.id,
    section: cap.section,
    label: cap.label,
    detail: cap.detail,
    roles: Object.fromEntries(
      USER_ROLES.map((role) => [role, roleHasAnyModule(role, cap.modules)]),
    ) as Record<UserRole, boolean>,
  }
}

/** Matriz derivada de `MODULE_ACCESS` — misma fuente que `hasModuleAccess`. */
export function buildRoleAccessMatrix(): AccessMatrixRow[] {
  return CAPABILITIES.map(rowForCapability)
}

export { ROLE_LABELS, USER_ROLES }
