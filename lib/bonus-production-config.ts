/** Metas y reglas de producción/bono — fuente única para reportes y la plataforma. */

export type TailShiftConfig = {
  machine100: number
  machine110: number
  packMultiplier: number
  tailMultiplier100: number
  tailMultiplier110: number
  turboDaily100: number
  turboDaily110: number
  turboPeriodFactor: number
}

export type TurboShiftConfig = {
  machine100Daily: number
  machine110Daily: number
  packMultiplier: number
  daysPerWeek: number
  weeksPerMonth: number
}

export type RollerShiftBonusConfig = {
  dailyBoxes: number
  monthlyBoxes: number
  over100PerBox: number
}

export type RollerBonusConfig = {
  workingDays: number
  baseBonus: number
  shift1: RollerShiftBonusConfig
  shift2: RollerShiftBonusConfig
}

export type BendingShiftConfig = {
  oneHalfMachinesDailyBoxes: number
  twoMachinesDailyBoxes: number
  boxesPerMachine: number
}

export type BonusRulesConfig = {
  baseBonus100: number
  machineOver100Rate: number
  machineOver110Rate: number
  packOver100Rate: number
  packOver110Rate: number
  weeklyAdvance: number
}

export type ShiftReportMeta = {
  turboDailyMeta: number
  tailDailyMeta: number
}

export type BonusProductionConfigData = {
  tail: { shift1: TailShiftConfig; shift2: TailShiftConfig }
  turbo: { shift1: TurboShiftConfig; shift2: TurboShiftConfig }
  roller48: RollerBonusConfig
  roller36: RollerBonusConfig
  bending: { shift1: BendingShiftConfig; shift2: BendingShiftConfig }
  bonusRules: BonusRulesConfig
  shiftReportMeta: { shift1: ShiftReportMeta; shift2: ShiftReportMeta }
}

export type BonusProductionConfig = {
  id: string
  name: string
  /** YYYY-MM — aplica a reportes de ese mes en adelante hasta otra versión */
  effectiveMonth: string
  config: BonusProductionConfigData
  createdAt: string
  updatedAt: string
}

/** Valores de referencia ago-2024 del Excel de bonos. */
export const DEFAULT_BONUS_PRODUCTION_CONFIG: BonusProductionConfigData = {
  tail: {
    shift1: {
      machine100: 2950,
      machine110: 3245,
      packMultiplier: 2,
      tailMultiplier100: 5,
      tailMultiplier110: 5,
      turboDaily100: 3650,
      turboDaily110: 7300,
      turboPeriodFactor: 5,
    },
    shift2: {
      machine100: 2400,
      machine110: 2700,
      packMultiplier: 2,
      tailMultiplier100: 1,
      tailMultiplier110: 1,
      turboDaily100: 3000,
      turboDaily110: 6000,
      turboPeriodFactor: 4,
    },
  },
  turbo: {
    shift1: {
      machine100Daily: 3650,
      machine110Daily: 4015,
      packMultiplier: 2,
      daysPerWeek: 5,
      weeksPerMonth: 4,
    },
    shift2: {
      machine100Daily: 3000,
      machine110Daily: 3300,
      packMultiplier: 2,
      daysPerWeek: 5,
      weeksPerMonth: 4,
    },
  },
  roller48: {
    workingDays: 20,
    baseBonus: 1650,
    shift1: { dailyBoxes: 6, monthlyBoxes: 120, over100PerBox: 13.75 },
    shift2: { dailyBoxes: 5, monthlyBoxes: 100, over100PerBox: 16.5 },
  },
  roller36: {
    workingDays: 20,
    baseBonus: 1650,
    shift1: { dailyBoxes: 7, monthlyBoxes: 140, over100PerBox: 11.8 },
    shift2: { dailyBoxes: 6, monthlyBoxes: 120, over100PerBox: 13.75 },
  },
  bending: {
    shift1: {
      oneHalfMachinesDailyBoxes: 58,
      twoMachinesDailyBoxes: 77,
      boxesPerMachine: 38.4,
    },
    shift2: {
      oneHalfMachinesDailyBoxes: 46,
      twoMachinesDailyBoxes: 61,
      boxesPerMachine: 31.2,
    },
  },
  bonusRules: {
    baseBonus100: 1650,
    machineOver100Rate: 0.1,
    machineOver110Rate: 0.12,
    packOver100Rate: 0.05,
    packOver110Rate: 0.06,
    weeklyAdvance: 200,
  },
  shiftReportMeta: {
    shift1: { turboDailyMeta: 3650, tailDailyMeta: 2950 },
    shift2: { turboDailyMeta: 3000, tailDailyMeta: 2400 },
  },
}

export function resolveConfigForReportMonth(
  configs: BonusProductionConfig[],
  reportMonth: string,
): BonusProductionConfigData {
  const sorted = [...configs]
    .filter((c) => c.effectiveMonth <= reportMonth)
    .sort((a, b) => b.effectiveMonth.localeCompare(a.effectiveMonth))
  if (sorted.length > 0) return sorted[0].config
  const any = [...configs].sort((a, b) => b.effectiveMonth.localeCompare(a.effectiveMonth))
  if (any.length > 0) return any[0].config
  return DEFAULT_BONUS_PRODUCTION_CONFIG
}

export function getWorkingDaysForShift(
  config: BonusProductionConfigData,
  shiftNumber: 1 | 2,
): number {
  const turbo = shiftNumber === 1 ? config.turbo.shift1 : config.turbo.shift2
  const fromTurbo = turbo.daysPerWeek * turbo.weeksPerMonth
  if (fromTurbo > 0) return fromTurbo
  return config.roller48.workingDays
}

export function getShiftConfigSlice(
  config: BonusProductionConfigData,
  shiftNumber: 1 | 2,
) {
  const key = shiftNumber === 1 ? "shift1" : "shift2"
  return {
    tail: config.tail[key],
    turbo: config.turbo[key],
    bending: config.bending[key],
    reportMeta: config.shiftReportMeta[key],
    roller48: shiftNumber === 1 ? config.roller48.shift1 : config.roller48.shift2,
    roller36: shiftNumber === 1 ? config.roller36.shift1 : config.roller36.shift2,
  }
}
