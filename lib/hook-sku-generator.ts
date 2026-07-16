/**
 * Generación de SKU para productos Hook / Rafía / Embobinado.
 *
 * Formato: [GANCHO][EMBOBINADO][MTS_RAFIA][COLOR][RAFIA_M_KG]
 * Ejemplos:
 *   522pk18+4l-10          (un color)
 *   522pk14.5+3.6w4l4-12   (bicolor con metros por color)
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

/** Regex laxo del código Hook (permite bicolor y variantes no catalogadas). */
export const LOOSE_HOOK_SKU_RE =
  /^(\d{3})([a-z]{2})(\d+(?:\.\d+)?(?:\+\d+(?:\.\d+)?)?)([a-z][a-z0-9./]*)(-\d{2})$/

export type HookSkuInput = {
  hookType: string
  windingType: string
  mainMeters: number
  freeFallMeters?: number
  hasFreeFall: boolean
  /** Colores en orden de aparición en el código */
  colors: string[]
  /**
   * Metros de cada color (clave = nombre del color).
   * Obligatorio cuando hay 2 o más colores → p.ej. w4l4.
   */
  colorMeters?: Record<string, number>
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

/**
 * Un color → solo la letra (`l`).
 * Dos o más → letra + metros por color concatenados (`w4l4`), sin `/`.
 */
export function buildColorCode(
  colors: string[],
  colorMeters?: Record<string, number>,
): string {
  if (!colors.length) throw new Error("Selecciona al menos un color de rafia.")

  const resolved = colors.map((c) => {
    const code = resolveTwineColorCode(c)
    if (!code) throw new Error(`Color de rafia no reconocido: ${c}`)
    return { color: c, code }
  })

  if (resolved.length === 1) {
    const meters = colorMeters?.[resolved[0].color]
    if (meters != null && Number.isFinite(meters) && meters > 0) {
      return `${resolved[0].code}${formatMeterSegment(meters)}`
    }
    return resolved[0].code
  }

  return resolved
    .map(({ color, code }) => {
      const meters = colorMeters?.[color]
      if (meters == null || !Number.isFinite(meters) || meters <= 0) {
        throw new Error(
          `Indica metros de rafia para cada color (falta: ${color}).`,
        )
      }
      return `${code}${formatMeterSegment(meters)}`
    })
    .join("")
}

export type LooseHookSkuParts = {
  hookTypeCode: string
  windingTypeCode: string
  metersCode: string
  colorCode: string
  rafiaCode: string
}

/** Parsea un código Hook con estructura laxa (constructor o entrada libre). */
export function parseLooseHookSku(raw: string): LooseHookSkuParts | null {
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, "")
  const m = LOOSE_HOOK_SKU_RE.exec(normalized)
  if (!m) return null
  return {
    hookTypeCode: m[1],
    windingTypeCode: m[2],
    metersCode: m[3],
    colorCode: m[4],
    rafiaCode: m[5],
  }
}

export type FreeformSkuValidation =
  | { ok: true; normalized: string; parts: LooseHookSkuParts }
  | { ok: false; normalized: string; message: string }

/**
 * Validación mínima para código libre: rechaza basura tipo "asdf" / "123456",
 * pero admite variantes no contempladas en el constructor (p.ej. bicolor w4l4).
 */
export function validateFreeformHookSku(raw: string): FreeformSkuValidation {
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, "")

  if (!normalized) {
    return { ok: false, normalized: "", message: "Escribe un código SKU." }
  }

  if (normalized.length < 8 || normalized.length > 48) {
    return {
      ok: false,
      normalized,
      message: "El código debe tener entre 8 y 48 caracteres.",
    }
  }

  if (!/^[a-z0-9.+\-/]+$/.test(normalized)) {
    return {
      ok: false,
      normalized,
      message: "Solo se permiten letras, números, +, -, . y /.",
    }
  }

  if (/^[a-z]+$/.test(normalized) || /^\d+$/.test(normalized)) {
    return {
      ok: false,
      normalized,
      message:
        "El código debe combinar gancho, embobinado, metros, color y rafia.",
    }
  }

  const parts = parseLooseHookSku(normalized)
  if (!parts) {
    return {
      ok: false,
      normalized,
      message:
        "Formato esperado: [gancho][embobinado][metros][color][rafia]. Ej: 522pk14.5+3.6w4l4-12",
    }
  }

  return { ok: true, normalized, parts }
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

  const colorCode = buildColorCode(input.colors, input.colorMeters)

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
