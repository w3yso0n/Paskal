import type { UserRole } from "./api"
import {
  EMPLEADOS_TAB_MODULES,
  METRICAS_TAB_MODULES,
  MODULE_ACCESS,
  REGLAS_TAB_MODULES,
  ROLE_LABELS,
  USER_ROLES,
  type PlatformModule,
} from "./platform-permissions"

export type AccessMatrixRow = {
  id: string
  section: string
  label: string
  roles: Record<UserRole, boolean>
}

const MODULE_LABELS: Record<PlatformModule, string> = {
  inicio: "Inicio",
  piso_produccion: "Piso de producción",
  tablero_operativo: "Tablero operativo",
  metricas_produccion: "Métricas (módulo producción)",
  metricas_incidencias: "Métricas (módulo incidencias)",
  metricas_mantenimiento: "Métricas (módulo mantenimiento)",
  metricas_asistencia_rotacion_bono: "Métricas (asistencia / rotación / bono)",
  metas: "Metas",
  alertas: "Alertas",
  gestion_usuarios: "Gestión de usuarios",
  empleados_asignar_tarjetas: "Empleados — tarjetas NFC",
  empleados_transporte: "Empleados — transporte",
  empleados_paros_vacaciones_rol_secundario: "Empleados — paros / vacaciones / rol secundario",
  skus: "Gestión de SKUs",
  captura_historico: "Captura de datos — histórico",
  captura_produccion: "Captura de datos — producción",
  reglas_dias_festivos: "Reglas — días festivos",
  reglas_fallos_electricos: "Reglas — fallos eléctricos",
  reglas_umbrales: "Reglas — umbrales y scrap",
  datos: "Datos (tablas SQL)",
  configuracion: "Configuración de cuenta",
}

const METRICAS_TAB_LABELS: Record<string, string> = {
  produccion: "Producción",
  operadores: "Operadores",
  incidencias: "Incidencias",
  mantenimiento: "Mantenimiento",
  asistencia: "Asistencia",
  rotacion: "Rotación",
}

const EMPLEADOS_TAB_LABELS: Record<string, string> = {
  employees: "Empleados",
  transport: "Transporte",
  downtime: "Paros",
  attendance: "Asistencia",
  roles: "Roles del día",
}

const REGLAS_TAB_LABELS: Record<string, string> = {
  holidays: "Días festivos",
  electrical: "Fallos eléctricos",
  thresholds: "Umbrales de alerta",
  scrap: "Scrap",
  bono: "Bono",
}

function rowForModule(section: string, module: PlatformModule, label?: string): AccessMatrixRow {
  return {
    id: `${section}:${module}`,
    section,
    label: label ?? MODULE_LABELS[module],
    roles: Object.fromEntries(
      USER_ROLES.map((role) => [role, MODULE_ACCESS[module]?.includes(role) ?? false]),
    ) as Record<UserRole, boolean>,
  }
}

/** Matriz derivada de `MODULE_ACCESS` — misma fuente que `hasModuleAccess`. */
export function buildRoleAccessMatrix(): AccessMatrixRow[] {
  const rows: AccessMatrixRow[] = []

  const mainNav: PlatformModule[] = [
    "inicio",
    "piso_produccion",
    "tablero_operativo",
    "metas",
    "alertas",
    "configuracion",
  ]
  for (const module of mainNav) {
    rows.push(rowForModule("Menú principal", module))
  }

  const adminNav: PlatformModule[] = [
    "gestion_usuarios",
    "skus",
    "captura_produccion",
    "captura_historico",
    "datos",
  ]
  for (const module of adminNav) {
    rows.push(rowForModule("Administración y datos", module))
  }

  for (const [tab, module] of Object.entries(METRICAS_TAB_MODULES)) {
    rows.push(
      rowForModule(
        "Métricas — pestañas",
        module,
        `Métricas → ${METRICAS_TAB_LABELS[tab] ?? tab}`,
      ),
    )
  }

  for (const [tab, moduleOrModules] of Object.entries(EMPLEADOS_TAB_MODULES)) {
    const modules = Array.isArray(moduleOrModules) ? moduleOrModules : [moduleOrModules]
    for (const module of modules) {
      rows.push(
        rowForModule(
          "Empleados — pestañas",
          module,
          `Empleados → ${EMPLEADOS_TAB_LABELS[tab] ?? tab}`,
        ),
      )
    }
  }

  for (const [tab, module] of Object.entries(REGLAS_TAB_MODULES)) {
    rows.push(
      rowForModule(
        "Reglas de negocio — pestañas",
        module,
        `Reglas → ${REGLAS_TAB_LABELS[tab] ?? tab}`,
      ),
    )
  }

  return rows
}

export { ROLE_LABELS, USER_ROLES }
