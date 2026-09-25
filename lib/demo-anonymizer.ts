/**
 * Anonimizador del modo demo (ver `lib/demo-mode.ts`). Funciones puras: reciben el JSON crudo de
 * una respuesta del API y devuelven una copia con:
 *  - empleados → "Empleado N" (+ código, NFC, RFC, IMSS y fecha de ingreso ficticios)
 *  - usuarios de plataforma → "Usuario N" / usuarioN@empresa-demo.com
 *  - producción, metas y dinero escalados por factores estables (semilla por navegador)
 *
 * Los reemplazos son consistentes entre endpoints (el mismo código real siempre produce el mismo
 * código ficticio), así que los joins del frontend (código → nombre, check-ins, eventos) siguen
 * funcionando y todo lo que se calcula después (KPIs, gráficas, Excel) sale ya anonimizado.
 */

export interface DemoRegistryEmployee {
  id: string
  fullName: string
  employeeCode: string | null
  nfcCardUid: string | null
  createdAt?: string | null
}

export interface DemoRegistryUser {
  id: string
  email: string
  fullName: string | null
  createdAt?: string | null
}

export interface DemoRegistry {
  kProd: number
  kGoal: number
  kMoney: number
  seed: number
  /** valor real (minúsculas) → ficticio: códigos, NFC, emails y nombres exactos. */
  exact: Map<string, string>
  /** ficticio (minúsculas) → real: para traducir query params antes del fetch. */
  reverse: Map<string, string>
  /** Nombres/códigos/emails dentro de texto libre. `null` si no hay nada que buscar. */
  textPattern: RegExp | null
  textLookup: Map<string, string>
  /** Valores reales para el leak-check de desarrollo. */
  sensitiveValues: string[]
}

// --- Hash determinístico -----------------------------------------------------------------

function hashString(s: string, seed: number): number {
  // FNV-1a 32 bits mezclado con la semilla
  let h = (2166136261 ^ seed) >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  h ^= h >>> 15
  h = Math.imul(h, 2246822507) >>> 0
  h ^= h >>> 13
  return h >>> 0
}

function hash01(s: string, seed: number): number {
  return hashString(s, seed) / 4294967296
}

/** Factor en [lo, hi] estable para (clave, semilla). */
function factor(key: string, seed: number, lo: number, hi: number): number {
  return lo + (hi - lo) * hash01(key, seed)
}

// --- Normalización -----------------------------------------------------------------------

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "")
}

function norm(s: string): string {
  return stripAccents(s.trim().toLowerCase()).replace(/\s+/g, " ")
}

function normKey(key: string): string {
  return key.toLowerCase().replace(/_/g, "")
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** Variantes de un nombre que el backend/frontend pueden mostrar (completo y abreviado). */
function nameVariants(fullName: string): string[] {
  const clean = fullName.trim().replace(/\s+/g, " ")
  const parts = clean.split(" ")
  const out = new Set<string>()
  if (parts.length >= 2) out.add(clean)
  if (parts.length >= 3) {
    // shortPersonName (lib/cronologia.ts): nombre + apellido paterno
    out.add(`${parts[0]} ${parts[parts.length - 2]}`)
    out.add(`${parts[0]} ${parts[1]}`)
  }
  if (parts.length === 1 && clean.length >= 4) out.add(clean)
  return [...out]
}

/**
 * Un código se busca dentro de texto libre solo si no puede confundirse con una cantidad
 * ("101 piezas"): con letras y ≥4 caracteres, o ≥6 si es solo numérico.
 */
function isTextSafeCode(code: string): boolean {
  return /[a-z]/i.test(code) ? code.length >= 4 : code.length >= 6
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0")
}

function fakeHex(key: string, seed: number): string {
  return (
    hashString(`nfc1:${key}`, seed).toString(16).padStart(8, "0") +
    hashString(`nfc2:${key}`, seed).toString(16).padStart(6, "0").slice(0, 6)
  )
}

function byCreatedAt<T extends { id: string; createdAt?: string | null }>(a: T, b: T): number {
  const ta = a.createdAt ? Date.parse(a.createdAt) : 0
  const tb = b.createdAt ? Date.parse(b.createdAt) : 0
  if (ta !== tb) return ta - tb
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** Factor de montos en MXN (también lo usan las constantes de despensa/transporte del front). */
export function demoMoneyFactor(seed: number): number {
  return factor("kMoney", seed, 0.65, 1.35)
}

// --- Registro ----------------------------------------------------------------------------

export function buildDemoRegistry(
  employees: DemoRegistryEmployee[],
  users: DemoRegistryUser[],
  seed: number,
): DemoRegistry {
  const exact = new Map<string, string>()
  const reverse = new Map<string, string>()
  const textLookup = new Map<string, string>()
  const sensitive = new Set<string>()
  const textAlternatives = new Set<string>()

  const addExact = (real: string | null | undefined, fake: string) => {
    const r = real?.trim()
    if (!r) return
    const k = r.toLowerCase()
    if (!exact.has(k)) exact.set(k, fake)
    reverse.set(fake.toLowerCase(), r)
    sensitive.add(r)
  }
  const addText = (real: string | null | undefined, fake: string) => {
    const r = real?.trim()
    if (!r) return
    const k = norm(r)
    if (!textLookup.has(k)) textLookup.set(k, fake)
    // El regex lleva ambas grafías (con y sin acentos); el lookup normaliza a sin acentos.
    for (const v of [r, stripAccents(r)]) textAlternatives.add(v.toLowerCase().replace(/\s+/g, " "))
    sensitive.add(r)
  }

  const width = Math.max(3, String(employees.length).length)
  const sortedEmployees = [...employees].sort(byCreatedAt)
  sortedEmployees.forEach((emp, i) => {
    const n = i + 1
    const fakeName = `Empleado ${n}`
    const fakeCode = `EMP-${pad(n, width)}`
    const code = emp.employeeCode?.trim() || null
    const nfc = emp.nfcCardUid?.trim() || null
    addExact(emp.fullName, fakeName)
    for (const v of nameVariants(emp.fullName)) addText(v, fakeName)
    addExact(code, fakeCode)
    if (code && isTextSafeCode(code)) addText(code, fakeCode)
    if (nfc) {
      // En legacy el código y el NFC coinciden: mismo valor real → mismo ficticio.
      const fakeNfc = code && nfc.toLowerCase() === code.toLowerCase() ? fakeCode : fakeHex(emp.id, seed)
      addExact(nfc, fakeNfc)
      if (isTextSafeCode(nfc)) addText(nfc, fakeNfc)
    }
  })

  const sortedUsers = [...users].sort(byCreatedAt)
  sortedUsers.forEach((u, i) => {
    const n = i + 1
    const fakeEmail = `usuario${n}@empresa-demo.com`
    const fakeName = `Usuario ${n}`
    addExact(u.email, fakeEmail)
    addText(u.email, fakeEmail)
    if (u.fullName?.trim()) {
      addExact(u.fullName, fakeName)
      for (const v of nameVariants(u.fullName)) addText(v, fakeName)
    }
  })

  const alternatives = [...textAlternatives]
    .sort((a, b) => b.length - a.length)
    .map((k) => escapeRegExp(k).replace(/ /g, "\\s+"))
  const textPattern = alternatives.length
    ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives.join("|")})(?![\\p{L}\\p{N}])`, "giu")
    : null

  const kProd = factor("kProd", seed, 0.6, 1.4)
  let kGoal = factor("kGoal", seed, 0.7, 1.3)
  // Actual y meta con factores distintos → el % de cumplimiento tampoco es el real.
  if (Math.abs(kGoal - kProd) < 0.08) kGoal = kProd > 1 ? kProd - 0.15 : kProd + 0.15

  return {
    kProd,
    kGoal,
    kMoney: demoMoneyFactor(seed),
    seed,
    exact,
    reverse,
    textPattern,
    textLookup,
    sensitiveValues: [...sensitive].filter((v) => v.includes(" ") || v.includes("@") || isTextSafeCode(v)),
  }
}

// --- Reglas por clave --------------------------------------------------------------------

/** Cantidades de producción (piezas, cajas, contadores, kg de scrap). */
const PROD_KEYS = new Set([
  "units",
  "count",
  "productionqty",
  "scrapqty",
  "scrapqtykg",
  "orphanunits",
  "excludedunits",
  "dailygoalactual",
  "attributed",
  "countatcheckin",
  "countatcheckout",
  "usagecount",
])

/** Contadores `from`/`to` (COUNTER_RESET); solo se escalan si son números. */
const COUNTER_KEYS = new Set(["from", "to"])

const GOAL_KEYS = new Set([
  "targetvalue",
  "dailygoaltarget",
  "dailymeta100",
  "monthlymeta100",
  "dailyboxes",
  "monthlyboxes",
  "meta100pieces",
  "meta110pieces",
  "goaltarget",
])

const MONEY_KEYS = new Set([
  "basebonus",
  "basebonus100",
  "over100perbox",
  "machineover100rate",
  "machineover110rate",
  "packover100rate",
  "packover110rate",
  "weeklyadvance",
])

function isMoneyKey(k: string): boolean {
  return MONEY_KEYS.has(k) || k.includes("mxn")
}

/** Claves de string que nunca son personas (máquinas, SKUs, ids, enums). */
function isOpaqueStringKey(k: string): boolean {
  return (
    k === "id" ||
    (k.endsWith("id") && !k.endsWith("uid")) ||
    k === "sku" ||
    k === "currentsku" ||
    k === "code" ||
    k === "machinecode" ||
    k === "eventtype" ||
    k === "status" ||
    k === "severity" ||
    k === "type" ||
    k === "role" ||
    k === "primaryrole" ||
    k === "secondaryrole" ||
    k.endsWith("at") ||
    k.endsWith("date") ||
    k.startsWith("snapshot") ||
    k === "nextcursor"
  )
}

function scaleRound(v: number, f: number): number {
  if (!Number.isFinite(v) || v === 0) return v
  const out = Math.round(v * f)
  // Un valor real positivo nunca se vuelve 0 (ocultaría que hubo producción).
  return v > 0 && out === 0 ? 1 : out
}

/** Entero con dither determinístico: el total de muchos eventos cuadra con v·f en promedio. */
function scaleDither(v: number, f: number, key: string, seed: number): number {
  if (!Number.isFinite(v) || v <= 0) return v
  const out = Math.floor(v * f + hash01(`d:${key}`, seed))
  return Math.max(1, out)
}

export function scaleMoney(v: number, f: number): number {
  if (!Number.isFinite(v) || v === 0) return v
  const x = v * f
  const abs = Math.abs(x)
  if (abs < 1) return Math.round(x * 1000) / 1000
  if (abs < 100) return Math.round(x * 100) / 100
  if (abs < 1000) return Math.round(x)
  return Math.round(x / 10) * 10
}

function shiftDate(value: string, months: number): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  d.setUTCMonth(d.getUTCMonth() + months)
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return d.toISOString().slice(0, 10)
  return d.toISOString()
}

// --- Texto libre -------------------------------------------------------------------------

const TEXT_UNITS_RE =
  /(\d{1,3}(?:,\d{3})+|\d+)(\s*(?:pzas?\.?|piezas?|uds?\.?|unidades|cajas?)\b)/giu
const TEXT_GOAL_RE = /(\bmeta\s*:?\s*)(\d{1,3}(?:,\d{3})+|\d+)/giu

function parseIntLoose(s: string): number {
  return Number(s.replace(/,/g, ""))
}

function formatLike(original: string, n: number): string {
  return original.includes(",") ? n.toLocaleString("en-US") : String(n)
}

export function anonymizeText(text: string, reg: DemoRegistry): string {
  let out = text
  if (reg.textPattern) {
    out = out.replace(reg.textPattern, (m) => reg.textLookup.get(norm(m)) ?? m)
  }
  out = out.replace(TEXT_GOAL_RE, (_m, prefix: string, num: string) => {
    return prefix + formatLike(num, scaleRound(parseIntLoose(num), reg.kGoal))
  })
  out = out.replace(TEXT_UNITS_RE, (_m, num: string, suffix: string) => {
    return formatLike(num, scaleRound(parseIntLoose(num), reg.kProd)) + suffix
  })
  return out
}

function anonymizeString(value: string, k: string, reg: DemoRegistry): string {
  if (k === "rfc") return value.trim() ? "XAXX010101000" : value
  if (k === "imss") return value.trim() ? "00000000000" : value
  if (k === "hiredat") return shiftDate(value, Math.round(factor(`h:${value}`, reg.seed, -8, 8)))
  if (k === "sql") return value
  const hit = reg.exact.get(value.trim().toLowerCase())
  if (hit) return hit
  if (isOpaqueStringKey(k)) return value
  return anonymizeText(value, reg)
}

// --- Eventos de producción ---------------------------------------------------------------

function isProductionEvent(o: Record<string, unknown>): boolean {
  return typeof o.eventType === "string" && !!o.payload && typeof o.payload === "object"
}

function primaryOperatorCode(payload: Record<string, unknown>): string | null {
  for (const k of ["OPERATOR_1", "operator_1", "OPERATOR", "operator", "employee"]) {
    const v = payload[k]
    if (typeof v === "string" && v.trim()) return v.trim().toLowerCase()
  }
  const ops = payload["operators"]
  if (Array.isArray(ops)) {
    const first = ops.find((x) => typeof x === "string" && x.trim())
    if (typeof first === "string") return first.trim().toLowerCase()
  }
  return null
}

/** Escala unidades/contadores del evento con un factor por operadora (cambia rankings). */
function scaleEventPayload(
  ev: Record<string, unknown>,
  payload: Record<string, unknown>,
  reg: DemoRegistry,
): Record<string, unknown> {
  const type = String(ev.eventType).trim().toUpperCase()
  const who = primaryOperatorCode(payload) ?? String(ev.machineId ?? "")
  // ORPHAN_PROD solo con kProd: así cuadra con las "N piezas" del texto de su alerta.
  const f = type === "ORPHAN_PROD" ? reg.kProd : reg.kProd * factor(`g:${who}`, reg.seed, 0.6, 1.4)
  const evKey = String(ev.id ?? ev.occurredAt ?? "")
  const out: Record<string, unknown> = { ...payload }
  for (const [key, v] of Object.entries(payload)) {
    if (typeof v !== "number") continue
    const k = normKey(key)
    if (k === "units" || k === "count") out[key] = scaleDither(v, f, `${evKey}:${k}`, reg.seed)
    else if (COUNTER_KEYS.has(k) || k === "countatcheckin" || k === "countatcheckout")
      out[key] = scaleRound(v, reg.kProd)
  }
  return out
}

// --- Recorrido ---------------------------------------------------------------------------

function walk(value: unknown, key: string, reg: DemoRegistry, eventPayload: boolean): unknown {
  const k = normKey(key)
  if (typeof value === "string") return anonymizeString(value, k, reg)
  if (typeof value === "number") {
    if (eventPayload && (k === "units" || k === "count" || COUNTER_KEYS.has(k))) return value
    if (PROD_KEYS.has(k) || COUNTER_KEYS.has(k)) return scaleRound(value, reg.kProd)
    if (GOAL_KEYS.has(k)) return scaleRound(value, reg.kGoal)
    if (isMoneyKey(k)) return scaleMoney(value, reg.kMoney)
    return value
  }
  if (Array.isArray(value)) return value.map((v) => walk(v, key, reg, eventPayload))
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    const isEvent = isProductionEvent(obj)
    for (const [ck, cv] of Object.entries(obj)) {
      if (isEvent && ck === "payload") {
        const scaled = scaleEventPayload(obj, cv as Record<string, unknown>, reg)
        out[ck] = walk(scaled, ck, reg, true)
      } else {
        out[ck] = walk(cv, ck, reg, eventPayload && ck !== "payload")
      }
    }
    return out
  }
  return value
}

/** Punto de entrada: anonimiza el cuerpo JSON de una respuesta GET (o de /data/query). */
export function anonymizeResponse(body: unknown, reg: DemoRegistry): unknown {
  return walk(body, "", reg, false)
}

/** Traduce códigos ficticios en la URL (filtros por persona) de vuelta a los reales. */
export function deanonymizePath(path: string, reg: DemoRegistry): string {
  const q = path.indexOf("?")
  if (q < 0) return path
  const params = new URLSearchParams(path.slice(q + 1))
  let changed = false
  for (const [key, val] of [...params.entries()]) {
    const real = reg.reverse.get(val.trim().toLowerCase())
    if (real) {
      params.set(key, real)
      changed = true
    }
  }
  return changed ? `${path.slice(0, q)}?${params.toString()}` : path
}

/** Leak-check de desarrollo: valores reales presentes en un texto. */
export function findLeaks(text: string, reg: DemoRegistry): string[] {
  const hay = norm(text)
  return reg.sensitiveValues.filter((v) => hay.includes(norm(v)))
}
