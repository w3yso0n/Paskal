import type { ApiGoalShift } from "@/lib/api"
import { PLANT_TIMEZONE, productionShiftFromMeasuredAt } from "@/lib/tablero-operator-goal"
import { getPartsInTimeZone } from "@/lib/shift-timezone"

/** Minutos desde medianoche en la zona horaria de la planta (TZ MX, no del navegador). */
export function minutesSinceMidnight(d: Date): number {
  const { hour, minute, second } = getPartsInTimeZone(d, PLANT_TIMEZONE)
  return hour * 60 + minute + second / 60
}

export function timeLabel(hour: number, minute = 0): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

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

export function shiftEndMinutes(shift: ApiGoalShift): number {
  const end = SHIFT_SCHEDULE[shift].productionEnd
  return end.hour * 60 + end.minute
}

export type ShiftProductionZone =
  | "in_shift"
  | "overtime"
  // `cleaning`/`post_cleaning` se conservan en el tipo por compatibilidad con consumidores,
  // pero ya NO se emiten: se quitó la ventana de limpieza (el turno es producción de punta a punta).
  | "cleaning"
  | "post_cleaning"

/**
 * Clasifica un evento de producción. Sin ventana de limpieza: cada turno es producción
 * normal de punta a punta (T1 07:00–16:00, T2 16:00–23:30). Producción fuera de la ventana
 * del turno = `overtime`.
 */
export function classifyProductionTimestamp(iso: string): {
  shift: ApiGoalShift | null
  zone: ShiftProductionZone
} {
  const shift = productionShiftFromMeasuredAt(iso)
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    return { shift, zone: "in_shift" }
  }

  const m = minutesSinceMidnight(d)

  if (shift === "matutino") {
    return { shift, zone: m >= shiftEndMinutes("matutino") ? "overtime" : "in_shift" }
  }

  if (shift === "vespertino") {
    return { shift, zone: m >= shiftEndMinutes("vespertino") ? "overtime" : "in_shift" }
  }

  // Inalcanzable con fecha válida: productionShiftFromMeasuredAt ya nunca devuelve null.
  return { shift: null, zone: "in_shift" }
}

export function dayKeyFromDate(d: Date): string {
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, "0")
  const da = String(d.getDate()).padStart(2, "0")
  return `${y}-${mo}-${da}`
}
