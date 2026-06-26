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

// Turnos reales (TZ MX): T1 07:00–16:00, T2 16:00–23:30. La producción operativa del
// vespertino va hasta las 23:00 y los últimos 30 min (23:00–23:30) son limpieza.
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
    /** Fin de producción operativa (11:00 p.m.); 23:00–23:30 = limpieza. */
    productionEnd: { hour: 23, minute: 0 },
    cleaningStart: { hour: 23, minute: 0 },
    cleaningEnd: { hour: 23, minute: 30 },
  },
} as const

export function shiftEndMinutes(shift: ApiGoalShift): number {
  const end = SHIFT_SCHEDULE[shift].productionEnd
  return end.hour * 60 + end.minute
}

export function isInVespertinoCleaningWindow(d: Date): boolean {
  const m = minutesSinceMidnight(d)
  const start = SHIFT_SCHEDULE.vespertino.cleaningStart.hour * 60
  const end = SHIFT_SCHEDULE.vespertino.cleaningEnd.hour * 60 + SHIFT_SCHEDULE.vespertino.cleaningEnd.minute
  return m >= start && m < end
}

export function isAfterVespertinoCleaningCutoff(d: Date): boolean {
  const m = minutesSinceMidnight(d)
  const cutoff =
    SHIFT_SCHEDULE.vespertino.cleaningEnd.hour * 60 + SHIFT_SCHEDULE.vespertino.cleaningEnd.minute
  return m >= cutoff
}

export type ShiftProductionZone =
  | "in_shift"
  | "overtime"
  | "cleaning"
  | "post_cleaning"

/** Clasifica un evento de producción vespertino / matutino. */
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
    const end = shiftEndMinutes("matutino")
    return { shift, zone: m >= end ? "overtime" : "in_shift" }
  }

  if (shift === "vespertino") {
    if (isAfterVespertinoCleaningCutoff(d)) return { shift, zone: "post_cleaning" }
    if (isInVespertinoCleaningWindow(d)) return { shift, zone: "cleaning" }
    const end = shiftEndMinutes("vespertino")
    if (m >= end) return { shift, zone: "overtime" }
    return { shift, zone: "in_shift" }
  }

  // Fallback (productionShiftFromMeasuredAt devolvió null): clasifica por minutos en TZ planta.
  if (m >= 23 * 60 + 30) return { shift: "vespertino", zone: "post_cleaning" }
  if (m >= 23 * 60) return { shift: "vespertino", zone: "cleaning" }
  if (m >= 16 * 60 && m < 23 * 60) return { shift: "vespertino", zone: "in_shift" }
  if (m >= shiftEndMinutes("matutino")) return { shift: "matutino", zone: "overtime" }

  return { shift: null, zone: "in_shift" }
}

export function dayKeyFromDate(d: Date): string {
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, "0")
  const da = String(d.getDate()).padStart(2, "0")
  return `${y}-${mo}-${da}`
}
