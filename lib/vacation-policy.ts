/** Anticipación mínima para solicitar vacaciones (días naturales). */
export const VACATION_MIN_ADVANCE_DAYS = 15

/** No se puede registrar vacación retroactiva en los últimos N días. */
export const VACATION_RETROACTIVE_BLOCK_DAYS = 14

export function localTodayYmd(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const d = String(now.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

export function addDaysToYmd(ymd: string, days: number): string {
  const base = new Date(`${ymd}T12:00:00`)
  base.setDate(base.getDate() + days)
  return localTodayYmd(base)
}

/** Primera fecha permitida para registrar vacaciones (hoy + 15 días). */
export function earliestAllowedVacationDate(today = localTodayYmd()): string {
  return addDaysToYmd(today, VACATION_MIN_ADVANCE_DAYS)
}

/**
 * Vacaciones bloqueadas entre (hoy − 14) y (hoy + 14) inclusive.
 * Antes de esa ventana histórica o desde el día 15 en adelante sí se permite.
 */
export function isVacationDateAllowed(recordDate: string, today = localTodayYmd()): boolean {
  const trimmed = recordDate.trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false
  const blockedFrom = addDaysToYmd(today, -VACATION_RETROACTIVE_BLOCK_DAYS)
  const blockedThrough = addDaysToYmd(today, VACATION_MIN_ADVANCE_DAYS - 1)
  return trimmed < blockedFrom || trimmed > blockedThrough
}

export function vacationDateBlockedMessage(recordDate: string, today = localTodayYmd()): string {
  const blockedFrom = addDaysToYmd(today, -VACATION_RETROACTIVE_BLOCK_DAYS)
  const blockedThrough = addDaysToYmd(today, VACATION_MIN_ADVANCE_DAYS - 1)
  const earliest = earliestAllowedVacationDate(today)
  return (
    `Las vacaciones requieren al menos ${VACATION_MIN_ADVANCE_DAYS} días de anticipación. ` +
    `No se puede registrar entre ${blockedFrom} y ${blockedThrough}. ` +
    `La fecha más próxima permitida es ${earliest}.`
  )
}

export function validateVacationRecordDate(recordDate: string, today = localTodayYmd()): void {
  if (!isVacationDateAllowed(recordDate, today)) {
    throw new Error(vacationDateBlockedMessage(recordDate, today))
  }
}

/** Lista de fechas YYYY-MM-DD inclusive entre inicio y fin. */
export function expandInclusiveDateRange(start: string, end: string): string[] {
  const from = start.trim().slice(0, 10)
  const to = (end.trim() || from).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return []
  if (to < from) return []

  const out: string[] = []
  let cur = from
  while (cur <= to) {
    out.push(cur)
    if (out.length > 366) break
    cur = addDaysToYmd(cur, 1)
  }
  return out
}
