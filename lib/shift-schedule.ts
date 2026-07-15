import type { ApiGoalShift } from "@/lib/api"
import { PLANT_TIMEZONE } from "@/lib/tablero-operator-goal"
import { getPartsInTimeZone } from "@/lib/shift-timezone"

/** Minutos desde medianoche en la zona horaria de la planta (TZ MX, no del navegador). */
export function minutesSinceMidnight(d: Date): number {
  const { hour, minute, second } = getPartsInTimeZone(d, PLANT_TIMEZONE)
  return hour * 60 + minute + second / 60
}

export function timeLabel(hour: number, minute = 0): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

/** Tolerancia ±minutos en bordes de turno (entrada y salida). */
export const SHIFT_EDGE_TOLERANCE_MINUTES = 15

// Turnos reales (TZ MX), producción de punta a punta (sin ventana de limpieza):
// T1 07:00–16:00, T2 16:00–23:30.
export const SHIFT_SCHEDULE = {
  matutino: {
    label: "Matutino",
    windowLabel: "07:00–16:00",
    productionStart: { hour: 7, minute: 0 },
    productionEnd: { hour: 16, minute: 0 },
  },
  vespertino: {
    label: "Vespertino (noche)",
    windowLabel: "16:00–23:30",
    productionStart: { hour: 16, minute: 0 },
    /** Fin del turno (11:30 p.m.). */
    productionEnd: { hour: 23, minute: 30 },
  },
} as const

export function shiftStartMinutes(shift: ApiGoalShift): number {
  const start = SHIFT_SCHEDULE[shift].productionStart
  return start.hour * 60 + start.minute
}

export function shiftEndMinutes(shift: ApiGoalShift): number {
  const end = SHIFT_SCHEDULE[shift].productionEnd
  return end.hour * 60 + end.minute
}

/** Inicio efectivo del turno con tolerancia hacia atrás. */
export function shiftStartWithToleranceMinutes(
  shift: ApiGoalShift,
  tolerance = SHIFT_EDGE_TOLERANCE_MINUTES,
): number {
  return shiftStartMinutes(shift) - tolerance
}

/** Fin efectivo del turno con tolerancia hacia adelante. */
export function shiftEndWithToleranceMinutes(
  shift: ApiGoalShift,
  tolerance = SHIFT_EDGE_TOLERANCE_MINUTES,
): number {
  return shiftEndMinutes(shift) + tolerance
}

export type ShiftProductionZone =
  | "in_shift"
  | "overtime"
  | "before_shift"
  // `cleaning`/`post_cleaning` se conservan en el tipo por compatibilidad con consumidores,
  // pero ya NO se emiten: se quitó la ventana de limpieza (el turno es producción de punta a punta).
  | "cleaning"
  | "post_cleaning"

/**
 * Clasifica un evento de producción por reloj de planta (±tolerancia).
 * T1 07:00–16:00, T2 16:00–23:30.
 * Antes de T1 (madrugada) = `before_shift` matutino (no “después” del vespertino de ayer).
 * Después de T2 = `overtime` vespertino.
 */
export function classifyProductionTimestamp(iso: string): {
  shift: ApiGoalShift | null
  zone: ShiftProductionZone
} {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    return { shift: null, zone: "in_shift" }
  }

  const m = minutesSinceMidnight(d)
  const t1Start = shiftStartWithToleranceMinutes("matutino")
  const t1End = shiftEndMinutes("matutino")
  const t2End = shiftEndWithToleranceMinutes("vespertino")
  // Handover a las 16:00: solape de tolerancia se corta en el fin nominal de T1.
  const t2Start = t1End

  if (m >= t1Start && m < t2Start) {
    return { shift: "matutino", zone: "in_shift" }
  }
  if (m >= t2Start && m < t2End) {
    return { shift: "vespertino", zone: "in_shift" }
  }
  // Tras el fin efectivo de T2 (p. ej. ≥ 23:45).
  if (m >= t2End) {
    return { shift: "vespertino", zone: "overtime" }
  }
  // Madrugada / antes del inicio efectivo de T1 → antes del matutino.
  return { shift: "matutino", zone: "before_shift" }
}

export function dayKeyFromDate(d: Date): string {
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, "0")
  const da = String(d.getDate()).padStart(2, "0")
  return `${y}-${mo}-${da}`
}
