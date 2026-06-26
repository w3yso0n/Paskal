const MX_TZ = "America/Mexico_City"

export function localTodayYmdMexico(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MX_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now)
}
