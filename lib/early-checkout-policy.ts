import type { ApiGoal, ApiGoalShift, ApiMachine, ApiMachineCheckin } from "@/lib/api"
import type { BonusProductionConfigData } from "@/lib/bonus-production-config"
import { bonusConfigToGoalDefinitions } from "@/lib/bonus-goals-bridge"
import { dayKeyFromDate, minutesSinceMidnight, shiftEndMinutes } from "@/lib/shift-schedule"
import {
  findDailyGoalForOperator,
  productionShiftFromMeasuredAt,
} from "@/lib/tablero-operator-goal"
import { normalizeSku } from "@/lib/production-goal-events"

/** Regla: checkout antes del fin de turno no genera incidencia si ya cumplió la cuota diaria. */
export const EARLY_CHECKOUT_QUOTA_EXEMPTION_NOTE =
  "Se permite hacer check-out antes del fin de turno sin incidencia cuando el operador ya cumplió su cuota diaria."

export type EarlyCheckoutProductionRow = {
  timestamp: string
  event: string
  count: number
  operator: string
  machineIdRaw: string | null
  sku: string
  unitsPerBox: number
}

export type OperatorDailyQuota = {
  target: number
  actual: number
  met: boolean
  sourceKey: string | null
}

function goalUsesBoxes(sourceKey: string | null): boolean {
  if (!sourceKey) return false
  return sourceKey.startsWith("roller")
}

function buildNameToCode(employees: Array<{ fullName: string; employeeCode?: string | null }>) {
  const map = new Map<string, string>()
  for (const e of employees) {
    const name = e.fullName?.trim()
    const code = e.employeeCode?.trim()
    if (name && code) {
      map.set(name, code)
      map.set(name.toLowerCase(), code)
    }
  }
  return map
}

function dominantSkuForMachineShift(
  rows: EarlyCheckoutProductionRow[],
  machineId: string,
  day: string,
  shift: ApiGoalShift,
  nameToCode: Map<string, string>,
  operatorCode: string,
): string {
  const counts = new Map<string, number>()
  const codeLower = operatorCode.trim().toLowerCase()

  for (const r of rows) {
    if (r.event !== "Producción") continue
    if (r.machineIdRaw !== machineId) continue
    const d = new Date(r.timestamp)
    if (Number.isNaN(d.getTime()) || dayKeyFromDate(d) !== day) continue
    if (productionShiftFromMeasuredAt(r.timestamp) !== shift) continue
    const opCode =
      nameToCode.get(r.operator) ?? nameToCode.get(r.operator.toLowerCase()) ?? r.operator
    if (opCode.trim().toLowerCase() !== codeLower) continue
    const sku = r.sku?.trim()
    if (!sku || sku === "—") continue
    counts.set(sku, (counts.get(sku) ?? 0) + 1)
  }

  let best = ""
  let bestN = 0
  for (const [sku, n] of counts) {
    if (n > bestN) {
      best = sku
      bestN = n
    }
  }
  return best
}

export function sumOperatorProductionForShift(
  rows: EarlyCheckoutProductionRow[],
  operatorCode: string,
  day: string,
  shift: ApiGoalShift,
  nameToCode: Map<string, string>,
  useBoxes: boolean,
): number {
  const codeLower = operatorCode.trim().toLowerCase()
  let total = 0

  for (const r of rows) {
    if (r.event !== "Producción") continue
    const d = new Date(r.timestamp)
    if (Number.isNaN(d.getTime()) || dayKeyFromDate(d) !== day) continue
    if (productionShiftFromMeasuredAt(r.timestamp) !== shift) continue
    const opCode =
      nameToCode.get(r.operator) ?? nameToCode.get(r.operator.toLowerCase()) ?? r.operator
    if (opCode.trim().toLowerCase() !== codeLower) continue
    const boxes = Number(r.count) || 0
    if (boxes <= 0) continue
    total += useBoxes ? boxes : boxes * (Number(r.unitsPerBox) > 0 ? Number(r.unitsPerBox) : 48)
  }

  return total
}

export function resolveOperatorDailyQuota(input: {
  operatorCode: string
  day: string
  shift: ApiGoalShift
  machine: ApiMachine | null
  goals: ApiGoal[]
  bonusConfig: BonusProductionConfigData | null
  productionRows: EarlyCheckoutProductionRow[]
  employees: Array<{ fullName: string; employeeCode?: string | null }>
}): OperatorDailyQuota {
  const nameToCode = buildNameToCode(input.employees)
  const definitions = input.bonusConfig ? bonusConfigToGoalDefinitions(input.bonusConfig) : []
  const machine = input.machine
  const sku =
    dominantSkuForMachineShift(
      input.productionRows,
      machine?.id ?? "",
      input.day,
      input.shift,
      nameToCode,
      input.operatorCode,
    ) ||
    machine?.currentSku?.trim() ||
    ""

  const { goal, sourceKey } = findDailyGoalForOperator(input.goals, definitions, {
    machineId: machine?.id ?? null,
    machineCode: machine?.code ?? machine?.name ?? "",
    machineName: machine?.name ?? "",
    sku,
    unitsPerBox: machine?.unitsPerBox ?? null,
    shift: input.shift,
    today: input.day,
  })

  if (!goal) return { target: 0, actual: 0, met: false, sourceKey }
  const target = Number(goal.targetValue)
  if (!Number.isFinite(target) || target <= 0) {
    return { target: 0, actual: 0, met: false, sourceKey }
  }

  const useBoxes = normalizeSku(goal.sku) ? false : goalUsesBoxes(sourceKey)
  const actual = sumOperatorProductionForShift(
    input.productionRows,
    input.operatorCode,
    input.day,
    input.shift,
    nameToCode,
    useBoxes,
  )

  return {
    target,
    actual,
    met: actual >= target,
    sourceKey,
  }
}

export function isCheckoutBeforeShiftEnd(checkout: Date, shift: ApiGoalShift): boolean {
  return minutesSinceMidnight(checkout) < shiftEndMinutes(shift)
}

/**
 * Incidencia de salida anticipada solo si salió antes del fin de turno y NO cumplió cuota diaria.
 */
export function shouldFlagEarlyCheckoutUnderGoal(input: {
  checkout: Date
  shift: ApiGoalShift
  operatorCode: string
  checkin: ApiMachineCheckin
  machines: ApiMachine[]
  goals: ApiGoal[]
  bonusConfig: BonusProductionConfigData | null
  productionRows: EarlyCheckoutProductionRow[]
  employees: Array<{ fullName: string; employeeCode?: string | null }>
  /** Evita machines.find en cada check-out cuando el caller ya indexó. */
  machineHint?: ApiMachine | null
}): { flag: boolean; quota: OperatorDailyQuota } {
  if (!isCheckoutBeforeShiftEnd(input.checkout, input.shift)) {
    return { flag: false, quota: { target: 0, actual: 0, met: false, sourceKey: null } }
  }

  const day = dayKeyFromDate(input.checkout)
  const machine =
    input.machineHint !== undefined
      ? input.machineHint
      : (input.machines.find((m) => m.id === input.checkin.machineId) ?? null)

  const quota = resolveOperatorDailyQuota({
    operatorCode: input.operatorCode,
    day,
    shift: input.shift,
    machine,
    goals: input.goals,
    bonusConfig: input.bonusConfig,
    productionRows: input.productionRows,
    employees: input.employees,
  })

  if (quota.target <= 0 || quota.met) {
    return { flag: false, quota }
  }

  return { flag: true, quota }
}
