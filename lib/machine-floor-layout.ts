/** Filas del diagrama (1 = arriba, 6 = abajo). Alineado con `machine-floor-catalog.ts` del backend. */
export const FLOOR_ROW_ORDER = [1, 2, 3, 4, 5, 6] as const

export const FLOOR_COLUMN_COUNT = 5

/** Altura reservada por celda vacía para alinear columnas con huecos (p. ej. col 1 solo M7/M8). */
export const FLOOR_MACHINE_CELL_MIN_HEIGHT = "5.75rem"
