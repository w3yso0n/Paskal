export const WINDING_MACHINES = [
  { key: "M-009", label: "Winding M-009" },
  { key: "M-010", label: "Winding M-010" },
  { key: "M-023", label: "Winding M-023" },
] as const

export const BENDING_MACHINES = [
  { key: "bending-1", label: "Bending 1" },
  { key: "bending-2", label: "Bending 2" },
  { key: "bending-3", label: "Bending 3" },
] as const

export const ROLLER_MACHINES = [
  { key: "roller-1", label: "Roller 1" },
  { key: "roller-2", label: "Roller 2" },
  { key: "roller-3", label: "Roller 3" },
] as const

export const SCRAP_SOURCE_KEY = "scrap-total"
export const HISTORICAL_MONTHLY_SOURCE_KEY = "company-monthly-total"

export const SHIFT_OPTIONS = [
  { value: "matutino", label: "Matutino" },
  { value: "vespertino", label: "Vespertino" },
] as const

export const MONTH_LABELS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const

export function sourceKeyLabel(key: string): string {
  const all = [...WINDING_MACHINES, ...BENDING_MACHINES, ...ROLLER_MACHINES]
  const found = all.find((m) => m.key === key)
  if (found) return found.label
  if (key === SCRAP_SOURCE_KEY) return "Scrap general"
  if (key === HISTORICAL_MONTHLY_SOURCE_KEY) return "Producción mensual total"
  return key
}
