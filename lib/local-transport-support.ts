import type { ApiEmployee } from "@/lib/api"
import { demoMoney } from "@/lib/demo-mode"

/** Monto fijo mensual de apoyo de transporte para personal local (MXN). */
export const LOCAL_TRANSPORT_SUPPORT_MONTHLY_MXN = 800

/** Función (no constante) para que el monto se formatee al renderizar (modo demo). */
export function localTransportPolicySummary(): string[] {
  return [
    "Apoyo fijo para colaboradores que viven cerca de la planta (locales).",
    `Monto: ${formatTransportMxn(LOCAL_TRANSPORT_SUPPORT_MONTHLY_MXN)} por mes por persona seleccionada.`,
    "Marca o desmarca a quienes aplican; el cambio se guarda de inmediato.",
  ]
}

export function formatTransportMxn(amount: number): string {
  // Los montos son múltiplos del apoyo fijo: en modo demo se escala la unidad para que
  // "total = monto × personas" siga cuadrando.
  const shown = (amount / LOCAL_TRANSPORT_SUPPORT_MONTHLY_MXN) * demoMoney(LOCAL_TRANSPORT_SUPPORT_MONTHLY_MXN)
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(shown)
}

export type LocalTransportSummary = {
  selectedCount: number
  activeEligibleCount: number
  monthlyTotalMxn: number
}

export function summarizeLocalTransportSupport(
  employees: ApiEmployee[],
): LocalTransportSummary {
  const active = employees.filter((e) => e.status === "active")
  const selected = active.filter((e) => e.localTransportSupport)
  return {
    selectedCount: selected.length,
    activeEligibleCount: active.length,
    monthlyTotalMxn: selected.length * LOCAL_TRANSPORT_SUPPORT_MONTHLY_MXN,
  }
}

export function employeesWithLocalTransport(employees: ApiEmployee[]): ApiEmployee[] {
  return employees
    .filter((e) => e.localTransportSupport)
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "es"))
}
