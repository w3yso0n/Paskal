import type { ApiEmployee } from "@/lib/api"

/** Monto fijo mensual de apoyo de transporte para personal local (MXN). */
export const LOCAL_TRANSPORT_SUPPORT_MONTHLY_MXN = 800

export const LOCAL_TRANSPORT_POLICY_SUMMARY = [
  "Apoyo fijo para colaboradores que viven cerca de la planta (locales).",
  `Monto: ${formatTransportMxn(LOCAL_TRANSPORT_SUPPORT_MONTHLY_MXN)} por mes por persona seleccionada.`,
  "Marca o desmarca a quienes aplican; el cambio se guarda de inmediato.",
]

export function formatTransportMxn(amount: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(amount)
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
