const STORAGE_KEY = "paskal:espIdleTimers:v1"

export type EspIdleDevicePrefs = {
  baseUrl: string
  path: string
}

function safeParse(raw: string | null): Record<string, EspIdleDevicePrefs> {
  if (!raw) return {}
  try {
    const v = JSON.parse(raw) as unknown
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, EspIdleDevicePrefs>
  } catch {
    /* ignore */
  }
  return {}
}

export function loadAllEspIdlePrefs(): Record<string, EspIdleDevicePrefs> {
  if (typeof window === "undefined") return {}
  return safeParse(window.localStorage.getItem(STORAGE_KEY))
}

export function getEspIdlePrefsForMachine(machineId: string): EspIdleDevicePrefs | null {
  const all = loadAllEspIdlePrefs()
  const p = all[machineId]
  if (!p || typeof p.baseUrl !== "string") return null
  return {
    baseUrl: p.baseUrl.trim(),
    path: typeof p.path === "string" && p.path.trim() ? p.path.trim() : "/api/idle-alert-timers",
  }
}

export function saveEspIdlePrefsForMachine(
  machineId: string,
  prefs: EspIdleDevicePrefs,
): void {
  if (typeof window === "undefined") return
  const all = { ...loadAllEspIdlePrefs(), [machineId]: prefs }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}

export function joinDeviceUrl(baseUrl: string, path: string): string {
  const b = baseUrl.trim().replace(/\/+$/, "")
  const p = path.trim().startsWith("/") ? path.trim() : `/${path.trim()}`
  return `${b}${p}`
}
