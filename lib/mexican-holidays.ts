export type CatalogHoliday = {
  date: string
  name: string
  source: "official"
}

function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function nthMondayOfMonth(year: number, month: number, n: number): number {
  let count = 0
  const daysInMonth = new Date(year, month, 0).getDate()
  for (let day = 1; day <= daysInMonth; day++) {
    if (new Date(year, month - 1, day).getDay() === 1) {
      count++
      if (count === n) return day
    }
  }
  return 1
}

function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return { month, day }
}

function addCalendarDays(year: number, month: number, day: number, delta: number) {
  const d = new Date(year, month - 1, day)
  d.setDate(d.getDate() + delta)
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() }
}

const OFFICIAL_HOLIDAY_NAMES: Record<string, string> = {
  "01-01": "Año Nuevo",
  "02-05": "Día de la Constitución (puente)",
  "03-21": "Natalicio de Benito Juárez (puente)",
  "05-01": "Día del Trabajo",
  "09-16": "Día de la Independencia",
  "11-17": "Revolución Mexicana (puente)",
  "12-25": "Navidad",
}

function holidayNameForDate(iso: string, easterYear: number): string {
  const mmdd = iso.slice(5)
  if (OFFICIAL_HOLIDAY_NAMES[mmdd]) return OFFICIAL_HOLIDAY_NAMES[mmdd]

  const easter = easterSunday(easterYear)
  const jueves = addCalendarDays(easterYear, easter.month, easter.day, -3)
  const viernes = addCalendarDays(easterYear, easter.month, easter.day, -2)
  const juevesIso = toIsoDate(jueves.year, jueves.month, jueves.day)
  const viernesIso = toIsoDate(viernes.year, viernes.month, viernes.day)
  if (iso === juevesIso) return "Jueves Santo"
  if (iso === viernesIso) return "Viernes Santo"

  return "Día festivo oficial"
}

export function mexicanPublicHolidaysForYear(year: number): CatalogHoliday[] {
  const isos = new Set<string>()

  for (const month of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
    const fixedByMonth: Record<number, number[]> = {
      1: [1],
      5: [1],
      9: [16],
      12: [25],
    }
    for (const day of fixedByMonth[month] ?? []) {
      isos.add(toIsoDate(year, month, day))
    }
    if (month === 2) isos.add(toIsoDate(year, 2, nthMondayOfMonth(year, 2, 1)))
    if (month === 3) isos.add(toIsoDate(year, 3, nthMondayOfMonth(year, 3, 3)))
    if (month === 11) isos.add(toIsoDate(year, 11, nthMondayOfMonth(year, 11, 3)))

    const easter = easterSunday(year)
    for (const delta of [-3, -2]) {
      const holy = addCalendarDays(year, easter.month, easter.day, delta)
      isos.add(toIsoDate(holy.year, holy.month, holy.day))
    }
  }

  return [...isos]
    .sort()
    .map((date) => ({
      date,
      name: holidayNameForDate(date, year),
      source: "official" as const,
    }))
}

export function mexicanPublicHolidayIsosForMonth(year: number, month: number): Set<string> {
  const prefix = `${year}-${String(month).padStart(2, "0")}-`
  return new Set(
    mexicanPublicHolidaysForYear(year)
      .filter((h) => h.date.startsWith(prefix))
      .map((h) => h.date),
  )
}

export function resolveCustomHolidayIso(
  holidayDate: string,
  scope: "one_time" | "annual",
  year: number,
): string {
  if (scope === "annual") return `${year}-${holidayDate.slice(5)}`
  return holidayDate
}

export function mergeHolidayIsos(
  official: Set<string>,
  customDates: string[],
): Set<string> {
  const out = new Set(official)
  for (const d of customDates) out.add(d)
  return out
}
