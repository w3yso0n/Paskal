import type { ApiMachine } from "./api"

/** Máquina con posición en el diagrama del piso (monitoreada / asignación rápida). */
export function isFloorMachine(
  m: Pick<ApiMachine, "floorRow" | "floorCol">,
): boolean {
  return m.floorRow != null && m.floorCol != null
}

export function filterFloorMachines<T extends Pick<ApiMachine, "floorRow" | "floorCol">>(
  machines: T[],
): T[] {
  return machines.filter(isFloorMachine)
}
