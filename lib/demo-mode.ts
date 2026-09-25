import { useSyncExternalStore } from "react"
import { demoMoneyFactor, scaleMoney } from "@/lib/demo-anonymizer"

/**
 * Modo demo (ícono de ojo, solo equipo Droven): la interfaz se ve igual pero los datos privados
 * de la empresa (nombres, KPIs, montos) se sustituyen por valores ficticios en `fetchWithAuth`.
 * Ver `lib/demo-anonymizer.ts`.
 *
 * Se activa solo si el usuario actual es rol `droven` Y el flag está guardado en este navegador;
 * un usuario de Paskal nunca hereda el flag (auth-context lo borra al detectar otro rol).
 */

const STORAGE_FLAG = "paskal_demo_mode"
const STORAGE_SEED = "paskal_demo_seed"

let demoEligible = false
const listeners = new Set<() => void>()

function readFlag(): boolean {
  if (typeof window === "undefined") return false
  try {
    return localStorage.getItem(STORAGE_FLAG) === "1"
  } catch {
    return false
  }
}

function notify() {
  for (const l of listeners) l()
}

/** auth-context: se llama cada vez que cambia el usuario. */
export function setDemoEligible(eligible: boolean) {
  if (demoEligible === eligible) return
  demoEligible = eligible
  notify()
}

export function isDemoModeActive(): boolean {
  return demoEligible && readFlag()
}

export function clearDemoMode() {
  if (typeof window === "undefined") return
  try {
    localStorage.removeItem(STORAGE_FLAG)
  } catch {
    // almacenamiento bloqueado: no hay flag que borrar
  }
}

/**
 * Activa/desactiva y recarga: las páginas guardan datos crudos en su estado y el registro de
 * seudónimos se reconstruye desde cero.
 */
export function setDemoMode(on: boolean) {
  if (typeof window === "undefined") return
  try {
    if (on) {
      localStorage.setItem(STORAGE_FLAG, "1")
      if (!localStorage.getItem(STORAGE_SEED)) {
        localStorage.setItem(STORAGE_SEED, String(Math.floor(Math.random() * 2 ** 31)))
      }
    } else {
      localStorage.removeItem(STORAGE_FLAG)
    }
  } catch {
    return
  }
  window.location.reload()
}

/** Semilla estable por navegador: las cifras ficticias no cambian entre recargas del demo. */
export function getDemoSeed(): number {
  if (typeof window === "undefined") return 1
  try {
    const raw = Number(localStorage.getItem(STORAGE_SEED))
    return Number.isFinite(raw) && raw > 0 ? raw : 1
  } catch {
    return 1
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useDemoMode(): { active: boolean; toggle: () => void } {
  const active = useSyncExternalStore(subscribe, isDemoModeActive, () => false)
  return { active, toggle: () => setDemoMode(!active) }
}

/** Correo/nombre del usuario logueado mientras el modo demo está activo. */
export const DEMO_USER_EMAIL = "demo@droven.mx"
export const DEMO_USER_NAME = "Equipo Droven"

/**
 * Montos fijos del frontend (despensa, transporte) que no pasan por el API: en modo demo se
 * escalan con el mismo factor que el dinero de las respuestas. Fuera del demo, sin cambios.
 */
export function demoMoney(amount: number): number {
  if (!isDemoModeActive() || !Number.isFinite(amount) || amount === 0) return amount
  const f = demoMoneyFactor(getDemoSeed())
  return Math.abs(amount) >= 100 ? Math.round((amount * f) / 10) * 10 : scaleMoney(amount, f)
}
