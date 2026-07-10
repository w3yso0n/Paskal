import type { UserRole } from "./api"

/** Módulos de la plataforma Droven Paskal (convención: acceso explícito por rol). */
export type PlatformModule =
  | "inicio"
  | "piso_produccion"
  | "tablero_operativo"
  | "metricas_asistencia_rotacion_bono"
  | "metricas_produccion"
  | "metricas_incidencias"
  | "metricas_mantenimiento"
  | "metas"
  | "alertas"
  | "gestion_usuarios"
  | "empleados_gestionar"
  | "empleados_asignar_tarjetas"
  | "empleados_transporte"
  | "empleados_paros_vacaciones_rol_secundario"
  | "skus"
  | "captura_historico"
  | "captura_produccion"
  | "reglas_dias_festivos"
  | "reglas_fallos_electricos"
  | "reglas_umbrales"
  | "datos"
  | "configuracion"

export const USER_ROLES: readonly UserRole[] = [
  "supervisor",
  "jefe_produccion",
  "gerente_operaciones",
  "director",
  "rh",
  "droven",
] as const

export const ROLE_LABELS: Record<UserRole, string> = {
  supervisor: "Supervisor (por turno)",
  jefe_produccion: "Jefe de Producción",
  gerente_operaciones: "Gerente de Operaciones",
  director: "Director",
  rh: "Recursos Humanos",
  droven: "Equipo Droven",
}

export const MODULE_ACCESS: Record<PlatformModule, readonly UserRole[]> = {
  inicio: USER_ROLES,
  piso_produccion: [
    "supervisor",
    "jefe_produccion",
    "gerente_operaciones",
    "director",
    "droven",
  ],
  tablero_operativo: [
    "supervisor",
    "jefe_produccion",
    "gerente_operaciones",
    "director",
    "rh",
    "droven",
  ],
  metricas_asistencia_rotacion_bono: [
    "jefe_produccion",
    "gerente_operaciones",
    "director",
    "rh",
    "droven",
  ],
  metricas_produccion: [
    "supervisor",
    "jefe_produccion",
    "gerente_operaciones",
    "director",
    "droven",
  ],
  metricas_incidencias: [
    "jefe_produccion",
    "gerente_operaciones",
    "director",
    "rh",
    "droven",
  ],
  metricas_mantenimiento: [
    "supervisor",
    "jefe_produccion",
    "gerente_operaciones",
    "director",
    "droven",
  ],
  metas: ["jefe_produccion", "gerente_operaciones", "director", "droven"],
  alertas: [
    "supervisor",
    "jefe_produccion",
    "gerente_operaciones",
    "director",
    "droven",
  ],
  gestion_usuarios: ["droven"],
  /** Alta / consulta / edición / baja del directorio de empleados. */
  empleados_gestionar: [
    "supervisor",
    "jefe_produccion",
    "gerente_operaciones",
    "director",
    "rh",
    "droven",
  ],
  empleados_asignar_tarjetas: ["director", "rh", "droven"],
  empleados_transporte: ["director", "rh", "droven"],
  empleados_paros_vacaciones_rol_secundario: [
    "supervisor",
    "jefe_produccion",
    "gerente_operaciones",
    "director",
    "droven",
  ],
  skus: [
    "supervisor",
    "jefe_produccion",
    "gerente_operaciones",
    "director",
    "droven",
  ],
  captura_historico: ["droven"],
  captura_produccion: [
    "supervisor",
    "jefe_produccion",
    "gerente_operaciones",
    "director",
    "droven",
  ],
  reglas_dias_festivos: ["director", "rh", "droven"],
  reglas_fallos_electricos: [
    "supervisor",
    "jefe_produccion",
    "gerente_operaciones",
    "director",
    "droven",
  ],
  reglas_umbrales: ["jefe_produccion", "gerente_operaciones", "director", "droven"],
  datos: ["director", "droven"],
  configuracion: USER_ROLES,
}

export const EMPLOYEE_MODULES: readonly PlatformModule[] = [
  "empleados_gestionar",
  "empleados_asignar_tarjetas",
  "empleados_transporte",
  "empleados_paros_vacaciones_rol_secundario",
]

export const REGLAS_MODULES: readonly PlatformModule[] = [
  "reglas_dias_festivos",
  "reglas_fallos_electricos",
  "reglas_umbrales",
]

export const METRICAS_TAB_MODULES: Record<string, PlatformModule> = {
  produccion: "metricas_produccion",
  operadores: "metricas_produccion",
  paros: "metricas_produccion",
  incidencias: "metricas_incidencias",
  mantenimiento: "metricas_mantenimiento",
  asistencia: "metricas_asistencia_rotacion_bono",
  rotacion: "metricas_asistencia_rotacion_bono",
}

export const EMPLEADOS_TAB_MODULES: Record<string, PlatformModule | readonly PlatformModule[]> = {
  /** Directorio: ver / agregar / editar / eliminar empleados. */
  employees: "empleados_gestionar",
  transport: "empleados_transporte",
  attendance: "metricas_asistencia_rotacion_bono",
  roles: "empleados_paros_vacaciones_rol_secundario",
}

export const REGLAS_TAB_MODULES: Record<string, PlatformModule> = {
  holidays: "reglas_dias_festivos",
  electrical: "reglas_fallos_electricos",
  thresholds: "reglas_umbrales",
  scrap: "reglas_umbrales",
  bono: "metricas_asistencia_rotacion_bono",
}
