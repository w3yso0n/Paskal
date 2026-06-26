export type BusinessHolidayScope = "one_time" | "annual"

export type ProductionIncidentType = "electrical_failure" | "other"

export type AlertThresholdsConfig = {
  idleMinutesWithoutProduction: number
  idleMinutesStage1: number
  idleMinutesStage2: number
  lowProductionPercent: number
  criticalProductionPercent: number
  scrapPercentWarning: number
  /** Costo por kg de scrap de metal (MXN). */
  scrapMetalCostPerKgMxn: number
  /** Costo por kg de scrap de rafia/twine (MXN). */
  scrapTwineCostPerKgMxn: number
}

export const DEFAULT_ALERT_THRESHOLDS: AlertThresholdsConfig = {
  idleMinutesWithoutProduction: 10,
  idleMinutesStage1: 15,
  idleMinutesStage2: 45,
  lowProductionPercent: 80,
  criticalProductionPercent: 50,
  scrapPercentWarning: 5,
  scrapMetalCostPerKgMxn: 0,
  scrapTwineCostPerKgMxn: 0,
}
