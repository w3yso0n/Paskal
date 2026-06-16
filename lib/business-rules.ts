export type BusinessHolidayScope = "one_time" | "annual"

export type ProductionIncidentType = "electrical_failure" | "other"

export type AlertThresholdsConfig = {
  idleMinutesWithoutProduction: number
  lowProductionPercent: number
  criticalProductionPercent: number
  scrapPercentWarning: number
}

export const DEFAULT_ALERT_THRESHOLDS: AlertThresholdsConfig = {
  idleMinutesWithoutProduction: 10,
  lowProductionPercent: 80,
  criticalProductionPercent: 50,
  scrapPercentWarning: 5,
}
