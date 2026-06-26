import { addDaysToYmd, localTodayYmd } from "@/lib/vacation-policy"

/** Ventana para registrar incapacidad después del día de la falta (horas). */
export const INCAPACITY_REGISTRATION_WINDOW_HOURS = 24

const MS_PER_HOUR = 60 * 60 * 1000

function recordDateStart(recordDate: string): Date {
  return new Date(`${recordDate.trim().slice(0, 10)}T00:00:00`)
}

/**
 * La incapacidad solo puede registrarse dentro de las 24 horas siguientes
 * al inicio del día de la falta. No aplica a fechas futuras.
 */
export function isIncapacityDateAllowed(recordDate: string, now: Date = new Date()): boolean {
  const trimmed = recordDate.trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false

  const today = localTodayYmd(now)
  if (trimmed > today) return false

  const elapsed = now.getTime() - recordDateStart(trimmed).getTime()
  return elapsed >= 0 && elapsed <= INCAPACITY_REGISTRATION_WINDOW_HOURS * MS_PER_HOUR
}

export function incapacityDateBounds(now: Date = new Date()): { min: string; max: string } {
  const today = localTodayYmd(now)
  const yesterday = addDaysToYmd(today, -1)
  const min = isIncapacityDateAllowed(yesterday, now) ? yesterday : today
  return { min, max: today }
}

export function incapacityDateBlockedMessage(recordDate: string): string {
  return (
    `La incapacidad solo puede registrarse dentro de las ${INCAPACITY_REGISTRATION_WINDOW_HOURS} horas ` +
    `siguientes al día de la falta. Ya no es posible registrar para ${recordDate.trim().slice(0, 10)}.`
  )
}

export function validateIncapacityRecordDate(recordDate: string, now: Date = new Date()): void {
  if (!isIncapacityDateAllowed(recordDate, now)) {
    throw new Error(incapacityDateBlockedMessage(recordDate))
  }
}
