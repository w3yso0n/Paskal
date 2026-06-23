/** Utilidades de zona horaria (misma lógica que el tablero operativo). */

export function getPartsInTimeZone(date: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    hour12: false,
  })
  const parts = dtf.formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: (Number(get("hour")) || 0) % 24,
    minute: Number(get("minute")),
    second: Number(get("second")),
  }
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const p = getPartsInTimeZone(date, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return (asUtc - date.getTime()) / 60_000
}

export function makeZonedDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0))
  let offset = getTimeZoneOffsetMinutes(utcGuess, timeZone)
  let corrected = new Date(utcGuess.getTime() - offset * 60_000)
  offset = getTimeZoneOffsetMinutes(corrected, timeZone)
  corrected = new Date(utcGuess.getTime() - offset * 60_000)
  return corrected
}

/** Turno 1: 07:00–16:00. Turno 2: 16:00–23:30 (mismo día calendario; no cruza medianoche). */
export function getShiftBoundsForCalendarDate(
  dateIso: string,
  shift: 1 | 2,
  timeZone: string,
): { start: Date; end: Date } {
  const [y, m, d] = dateIso.split("-").map((n) => Number(n))
  if (!y || !m || !d) {
    const now = new Date()
    return { start: now, end: now }
  }

  if (shift === 1) {
    return {
      start: makeZonedDate(y, m, d, 7, 0, timeZone),
      end: makeZonedDate(y, m, d, 16, 0, timeZone),
    }
  }

  // Turno 2: 16:00–23:30 del mismo día (ya no cruza medianoche).
  return {
    start: makeZonedDate(y, m, d, 16, 0, timeZone),
    end: makeZonedDate(y, m, d, 23, 30, timeZone),
  }
}

export function formatDdMmYyyy(dateIso: string, timeZone: string): string {
  const [y, m, d] = dateIso.split("-").map((n) => Number(n))
  const anchor = makeZonedDate(y, m, d, 12, 0, timeZone)
  return anchor.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone,
  })
}

export function monthNameCapitalizedEs(dateIso: string, timeZone: string): string {
  const [y, m, d] = dateIso.split("-").map((n) => Number(n))
  const anchor = makeZonedDate(y, m, d, 12, 0, timeZone)
  const raw = anchor.toLocaleDateString("es-MX", { month: "long", timeZone })
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

/** Nombre de hoja Excel: `04 MAYO 2026` */
export function excelSheetNameForDay(dateIso: string, timeZone: string): string {
  const [y, m, d] = dateIso.split("-").map((n) => Number(n))
  const anchor = makeZonedDate(y, m, d, 12, 0, timeZone)
  const day = String(d).padStart(2, "0")
  const month = anchor
    .toLocaleDateString("es-MX", { month: "long", timeZone })
    .toUpperCase()
  const name = `${day} ${month} ${y}`
  return name.replace(/[\\/?*[\]]/g, "-").slice(0, 31)
}

/** Todas las fechas `yyyy-mm-dd` del mes indicado por cualquier día del mes. */
export function allCalendarDaysInMonth(anyDayInMonthIso: string): string[] {
  const [y, m] = anyDayInMonthIso.split("-").map((n) => Number(n))
  if (!y || !m) return []
  const daysInMonth = new Date(y, m, 0).getDate()
  const mm = String(m).padStart(2, "0")
  return Array.from({ length: daysInMonth }, (_, i) => {
    const dd = String(i + 1).padStart(2, "0")
    return `${y}-${mm}-${dd}`
  })
}
