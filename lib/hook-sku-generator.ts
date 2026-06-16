/**
 * Generación de SKU para productos Hook / Rafía / Embobinado.
 *
 * Formato: [GANCHO][EMBOBINADO][MTS_RAFIA][COLOR][RAFIA_M_KG]
 * Ejemplo: 522pk18+4l-10
 */

export const HOOK_TYPE_CATALOG: Record<string, string> = {
  "metal hook 18 cm": "518",
  "metal hook 22 cm": "522",
}

export const WINDING_TYPE_CATALOG: Record<string, string> = {
  "turbo hook": "pk",
  "v hook": "nf",
  "tail hook": "tl",
  turbo: "pk",
  "sin free fall": "nf",
  tail: "tl",
}

export const TWINE_COLOR_CATALOG: Record<string, string> = {
  white: "w",
  black: "b",
  yellow: "y",
  green: "g",
  orange: "o",
  blue: "l",
}

export const RAFIA_M_KG_CATALOG: Record<number, string> = {
  1000: "-10",
  1200: "-12",
  1500: "-15",
}

export type HookSkuInput = {
  hookType: string
  windingType: string
  mainMeters: number
  freeFallMeters?: number
  hasFreeFall: boolean
  colors: string[]
  rafiaMKg: number
}

export type HookSkuCombinationKey = {
  hookTypeCode: string
  windingTypeCode: string
  twineLength: string
  twineColorCode: string
  rafiaCode: string
}

export type HookSkuQuantityRule = HookSkuCombinationKey & {
  id: string
  quantityPerBox: number
  notes?: string
}

export type HookSkuResult = {
  sku: string
  hookTypeCode: string
  windingTypeCode: string
  metersCode: string
  colorCode: string
  rafiaCode: string
  totalMeters: number
  quantityPerBox: number | null
  quantityError?: string
}

export type HookSkuGeneratorError = {
  message: string
  field?: keyof HookSkuInput | "colors" | "combination"
}

function normKey(value: string): string {
  return value.trim().toLowerCase()
}

export function roundTotalMeters(mainMeters: number, freeFallMeters = 0): number {
  const total = mainMeters + freeFallMeters
  if (!Number.isFinite(total)) return 0
  const decimal = total - Math.floor(total)
  if (decimal < 0.5) return Math.floor(total)
  return Math.ceil(total)
}

function formatMeterSegment(value: number): string {
  if (!Number.isFinite(value)) return ""
  if (Number.isInteger(value)) return String(value)
  const s = value.toFixed(2).replace(/\.?0+$/, "")
  return s
}

export function buildMetersCode(
  mainMeters: number,
  freeFallMeters: number | undefined,
  hasFreeFall: boolean,
): string {
  const main = formatMeterSegment(mainMeters)
  if (!main) throw new Error("Metros principales inválidos.")
  if (hasFreeFall) {
    const ff = freeFallMeters ?? 0
    if (ff <= 0) throw new Error("Indica metros de caída libre.")
    return `${main}+${formatMeterSegment(ff)}`
  }
  return main
}

export function resolveHookTypeCode(hookType: string): string | null {
  return HOOK_TYPE_CATALOG[normKey(hookType)] ?? null
}

export function resolveWindingTypeCode(windingType: string): string | null {
  return WINDING_TYPE_CATALOG[normKey(windingType)] ?? null
}

export function resolveTwineColorCode(color: string): string | null {
  return TWINE_COLOR_CATALOG[normKey(color)] ?? null
}

export function buildColorCode(colors: string[]): string {
  if (!colors.length) throw new Error("Selecciona al menos un color de rafia.")
  const codes = colors.map((c) => {
    const code = resolveTwineColorCode(c)
    if (!code) throw new Error(`Color de rafia no reconocido: ${c}`)
    return code
  })
  return codes.join("/")
}

export function resolveRafiaCode(rafiaMKg: number): string | null {
  return RAFIA_M_KG_CATALOG[rafiaMKg] ?? null
}

export function combinationKeyString(key: HookSkuCombinationKey): string {
  return [
    key.hookTypeCode,
    key.windingTypeCode,
    key.twineLength,
    key.twineColorCode,
    key.rafiaCode,
  ].join("|")
}

export function getQuantityByCombination(
  key: HookSkuCombinationKey,
  rules: HookSkuQuantityRule[],
): number | null {
  const target = combinationKeyString(key)
  const hit = rules.find((r) => combinationKeyString(r) === target)
  return hit?.quantityPerBox ?? null
}

export function generateHookSku(
  input: HookSkuInput,
  quantityRules: HookSkuQuantityRule[],
): HookSkuResult {
  const hookTypeCode = resolveHookTypeCode(input.hookType)
  if (!hookTypeCode) {
    throw new Error(`Tipo de gancho no reconocido: ${input.hookType}`)
  }

  const windingTypeCode = resolveWindingTypeCode(input.windingType)
  if (!windingTypeCode) {
    throw new Error(`Tipo de embobinado no reconocido: ${input.windingType}`)
  }

  const metersCode = buildMetersCode(
    input.mainMeters,
    input.freeFallMeters,
    input.hasFreeFall,
  )

  const colorCode = buildColorCode(input.colors)

  const rafiaCode = resolveRafiaCode(input.rafiaMKg)
  if (!rafiaCode) {
    throw new Error(`Rafia m/kg no reconocida: ${input.rafiaMKg}`)
  }

  const totalMeters = roundTotalMeters(
    input.mainMeters,
    input.hasFreeFall ? (input.freeFallMeters ?? 0) : 0,
  )

  const sku = `${hookTypeCode}${windingTypeCode}${metersCode}${colorCode}${rafiaCode}`

  const combination: HookSkuCombinationKey = {
    hookTypeCode,
    windingTypeCode,
    twineLength: metersCode,
    twineColorCode: colorCode,
    rafiaCode,
  }

  const quantityPerBox = getQuantityByCombination(combination, quantityRules)
  const quantityError =
    quantityPerBox == null
      ? "No hay piezas por caja configuradas para esta combinación."
      : undefined

  return {
    sku,
    hookTypeCode,
    windingTypeCode,
    metersCode,
    colorCode,
    rafiaCode,
    totalMeters,
    quantityPerBox,
    quantityError,
  }
}

/** Opciones para selects en UI */
export const HOOK_TYPE_OPTIONS = Object.entries(HOOK_TYPE_CATALOG).map(([label, code]) => ({
  label,
  value: label,
  code,
}))

export const WINDING_TYPE_OPTIONS = [
  { label: "Turbo Hook", value: "Turbo Hook", code: "pk" },
  { label: "V Hook", value: "V Hook", code: "nf" },
  { label: "Tail Hook", value: "Tail Hook", code: "tl" },
]

export const TWINE_COLOR_OPTIONS = Object.entries(TWINE_COLOR_CATALOG).map(([name, code]) => ({
  label: name.charAt(0).toUpperCase() + name.slice(1),
  value: name,
  code,
}))

export const RAFIA_M_KG_OPTIONS = Object.entries(RAFIA_M_KG_CATALOG).map(([kg, code]) => ({
  label: `${kg} m/kg (${code})`,
  value: Number(kg),
  code,
}))

export const DEFAULT_QUANTITY_RULES: HookSkuQuantityRule[] = [
  {
    id: "default-522pk18+4l-10",
    hookTypeCode: "522",
    windingTypeCode: "pk",
    twineLength: "18+4",
    twineColorCode: "l",
    rafiaCode: "-10",
    quantityPerBox: 240,
    notes: "Ejemplo referencia: metal hook 22 cm, Turbo, 18+4, blue, 1000 m/kg",
  },
]
