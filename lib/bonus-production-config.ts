/** Metas y reglas de producción/bono — fuente única para reportes y la plataforma. */

export const META_110_FACTOR = 1.1
export const BENDING_MONTHLY_META_PER_SHIFT = 81_600

export type WindingShiftConfig = {
  /** Meta diaria al 100% (piezas). */
  dailyMeta100: number
  /** Días laborables del mes para meta mensual (p. ej. 20). */
  workingDaysPerMonth: number
}

export type BendingShiftConfig = {
  /** Meta mensual fija al 100% por turno (piezas). */
  monthlyMeta100: number
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

export type BonusRulesConfig = {
  baseBonus100: number
  machineOver100Rate: number
  machineOver110Rate: number
  packOver100Rate: number
  packOver110Rate: number
  weeklyAdvance: number
}

export type BonusProductionConfigData = {
  winding: { shift1: WindingShiftConfig; shift2: WindingShiftConfig }
  bending: { shift1: BendingShiftConfig; shift2: BendingShiftConfig }
  roller48: RollerBonusConfig
  roller36: RollerBonusConfig
  bonusRules: BonusRulesConfig
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

export function meta110From100(value100: number): number {
  return Math.round(value100 * META_110_FACTOR)
}

export function monthlyMeta100FromDaily(
  dailyMeta100: number,
  workingDaysPerMonth: number,
): number {
  return dailyMeta100 * workingDaysPerMonth
}

export function monthlyMeta110FromDaily(
  dailyMeta100: number,
  workingDaysPerMonth: number,
): number {
  return meta110From100(monthlyMeta100FromDaily(dailyMeta100, workingDaysPerMonth))
}

export function bendingDailyMetaFromMonthly(
  monthlyMeta100: number,
  workingDaysPerMonth: number,
): number {
  if (workingDaysPerMonth <= 0) return 0
  return Math.round(monthlyMeta100 / workingDaysPerMonth)
}

/** Valores de referencia — Winding 3650/día × 20 días; Bending 81 600/mes por turno. */
export const DEFAULT_BONUS_PRODUCTION_CONFIG: BonusProductionConfigData = {
  winding: {
    shift1: { dailyMeta100: 3650, workingDaysPerMonth: 20 },
    shift2: { dailyMeta100: 3000, workingDaysPerMonth: 20 },
  },
  bending: {
    shift1: { monthlyMeta100: BENDING_MONTHLY_META_PER_SHIFT },
    shift2: { monthlyMeta100: BENDING_MONTHLY_META_PER_SHIFT },
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
  bonusRules: {
    baseBonus100: 1650,
    machineOver100Rate: 0.1,
    machineOver110Rate: 0.12,
    packOver100Rate: 0.05,
    packOver110Rate: 0.06,
    weeklyAdvance: 200,
  },
}

type LegacyConfig = Record<string, unknown>

function readNumber(obj: unknown, key: string, fallback: number): number {
  if (obj && typeof obj === "object" && key in obj) {
    const v = Number((obj as Record<string, unknown>)[key])
    if (Number.isFinite(v)) return v
  }
  return fallback
}

function normalizeWindingBlock(
  raw: unknown,
  fallback: { shift1: WindingShiftConfig; shift2: WindingShiftConfig },
): { shift1: WindingShiftConfig; shift2: WindingShiftConfig } {
  const block = raw as { shift1?: WindingShiftConfig; shift2?: WindingShiftConfig } | undefined
  return {
    shift1: {
      dailyMeta100: readNumber(block?.shift1, "dailyMeta100", fallback.shift1.dailyMeta100),
      workingDaysPerMonth: readNumber(
        block?.shift1,
        "workingDaysPerMonth",
        fallback.shift1.workingDaysPerMonth,
      ),
    },
    shift2: {
      dailyMeta100: readNumber(block?.shift2, "dailyMeta100", fallback.shift2.dailyMeta100),
      workingDaysPerMonth: readNumber(
        block?.shift2,
        "workingDaysPerMonth",
        fallback.shift2.workingDaysPerMonth,
      ),
    },
  }
}

function normalizeBendingBlock(
  _raw: unknown,
  _fallback: { shift1: BendingShiftConfig; shift2: BendingShiftConfig },
): { shift1: BendingShiftConfig; shift2: BendingShiftConfig } {
  return {
    shift1: { monthlyMeta100: BENDING_MONTHLY_META_PER_SHIFT },
    shift2: { monthlyMeta100: BENDING_MONTHLY_META_PER_SHIFT },
  }
}

/** Migra configuraciones antiguas al esquema actual (winding / bending / roller). */
export function normalizeBonusProductionConfig(
  raw: BonusProductionConfigData | LegacyConfig,
): BonusProductionConfigData {
  const legacy = raw as LegacyConfig
  const def = DEFAULT_BONUS_PRODUCTION_CONFIG

  if (legacy.winding && typeof legacy.winding === "object") {
    return {
      winding: normalizeWindingBlock(legacy.winding, def.winding),
      bending: normalizeBendingBlock(legacy.bending, def.bending),
      roller48: (legacy.roller48 as RollerBonusConfig) ?? def.roller48,
      roller36: (legacy.roller36 as RollerBonusConfig) ?? def.roller36,
      bonusRules: (legacy.bonusRules as BonusRulesConfig) ?? def.bonusRules,
    }
  }

  if (legacy.production && typeof legacy.production === "object") {
    return {
      winding: normalizeWindingBlock(legacy.production, def.winding),
      bending: normalizeBendingBlock(legacy.bending, def.bending),
      roller48: (legacy.roller48 as RollerBonusConfig) ?? def.roller48,
      roller36: (legacy.roller36 as RollerBonusConfig) ?? def.roller36,
      bonusRules: (legacy.bonusRules as BonusRulesConfig) ?? def.bonusRules,
    }
  }

  const turbo = legacy.turbo as
    | {
        shift1?: { machine100Daily?: number; daysPerWeek?: number; weeksPerMonth?: number }
        shift2?: { machine100Daily?: number; daysPerWeek?: number; weeksPerMonth?: number }
      }
    | undefined
  const shiftReportMeta = legacy.shiftReportMeta as
    | { shift1?: { turboDailyMeta?: number }; shift2?: { turboDailyMeta?: number } }
    | undefined
  const roller48 = (legacy.roller48 as RollerBonusConfig) ?? def.roller48

  const shift1Daily =
    readNumber(turbo?.shift1, "machine100Daily", 0) ||
    readNumber(shiftReportMeta?.shift1, "turboDailyMeta", 0) ||
    def.winding.shift1.dailyMeta100
  const shift2Daily =
    readNumber(turbo?.shift2, "machine100Daily", 0) ||
    readNumber(shiftReportMeta?.shift2, "turboDailyMeta", 0) ||
    def.winding.shift2.dailyMeta100

  const t1Days =
    readNumber(turbo?.shift1, "daysPerWeek", 5) * readNumber(turbo?.shift1, "weeksPerMonth", 4)
  const t2Days =
    readNumber(turbo?.shift2, "daysPerWeek", 5) * readNumber(turbo?.shift2, "weeksPerMonth", 4)
  const workingDays =
    roller48.workingDays > 0 ? roller48.workingDays : def.winding.shift1.workingDaysPerMonth

  return {
    winding: {
      shift1: {
        dailyMeta100: shift1Daily,
        workingDaysPerMonth: t1Days > 0 ? t1Days : workingDays,
      },
      shift2: {
        dailyMeta100: shift2Daily,
        workingDaysPerMonth: t2Days > 0 ? t2Days : workingDays,
      },
    },
    bending: normalizeBendingBlock(legacy.bending, def.bending),
    roller48,
    roller36: (legacy.roller36 as RollerBonusConfig) ?? def.roller36,
    bonusRules: (legacy.bonusRules as BonusRulesConfig) ?? def.bonusRules,
  }
}

export function resolveConfigForReportMonth(
  configs: BonusProductionConfig[],
  reportMonth: string,
): BonusProductionConfigData {
  const sorted = [...configs]
    .filter((c) => c.effectiveMonth <= reportMonth)
    .sort((a, b) => b.effectiveMonth.localeCompare(a.effectiveMonth))
  if (sorted.length > 0) return normalizeBonusProductionConfig(sorted[0].config)
  const any = [...configs].sort((a, b) => b.effectiveMonth.localeCompare(a.effectiveMonth))
  if (any.length > 0) return normalizeBonusProductionConfig(any[0].config)
  return DEFAULT_BONUS_PRODUCTION_CONFIG
}

export function getWorkingDaysForShift(
  config: BonusProductionConfigData,
  shiftNumber: 1 | 2,
): number {
  const key = shiftNumber === 1 ? "shift1" : "shift2"
  const days = config.winding[key].workingDaysPerMonth
  if (days > 0) return days
  return config.roller48.workingDays
}

export function getShiftConfigSlice(config: BonusProductionConfigData, shiftNumber: 1 | 2) {
  const key = shiftNumber === 1 ? "shift1" : "shift2"
  return {
    winding: config.winding[key],
    bending: config.bending[key],
    roller48: shiftNumber === 1 ? config.roller48.shift1 : config.roller48.shift2,
    roller36: shiftNumber === 1 ? config.roller36.shift1 : config.roller36.shift2,
  }
}
