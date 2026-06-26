import type { ApiGoalShift } from "@/lib/api"
import { productionShiftFromMeasuredAt } from "@/lib/tablero-operator-goal"

/** Minutos desde medianoche (hora local del navegador / planta). */
export function minutesSinceMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60
}

export function timeLabel(hour: number, minute = 0): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

export const SHIFT_SCHEDULE = {
  matutino: {
    label: "Matutino",
    windowLabel: "06:00–14:00",
    productionStart: { hour: 6, minute: 0 },
    productionEnd: { hour: 14, minute: 0 },
  },
  vespertino: {
    label: "Vespertino (noche)",
    windowLabel: "14:00–23:00",
    productionStart: { hour: 14, minute: 0 },
    /** Fin de producción operativa (11:00 p.m.). */
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

  // Fuera de ventana KPI clásica (22:00): turno noche extendido hasta 23:00
  if (m >= 23 * 60 + 30) return { shift: "vespertino", zone: "post_cleaning" }
  if (m >= 23 * 60) return { shift: "vespertino", zone: "cleaning" }
  if (m >= 14 * 60 && m < 23 * 60) return { shift: "vespertino", zone: "in_shift" }
  if (m >= shiftEndMinutes("matutino")) return { shift: "matutino", zone: "overtime" }

  return { shift: null, zone: "in_shift" }
}

export function dayKeyFromDate(d: Date): string {
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, "0")
  const da = String(d.getDate()).padStart(2, "0")
  return `${y}-${mo}-${da}`
}
