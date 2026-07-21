import type { ApiMachine } from "@/lib/api"

/**
 * Nombre visible de una máquina. `code` es la identidad ("M-001") y `name` solo su alias, así
 * que ambos pueden venir nulos: hacer `(m.code ?? m.name).trim()` reventaba la pantalla si los
 * dos faltaban. Siempre devuelve algo mostrable.
 */
export function machineDisplayLabel(
  m: Pick<ApiMachine, "code" | "name"> & { id?: string },
  fallback = "—",
): string {
  return (m.code ?? m.name ?? "").trim() || (m.name ?? "").trim() || m.id?.trim() || fallback
}
