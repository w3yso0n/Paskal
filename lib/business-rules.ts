export type BusinessHolidayScope = "one_time" | "annual"

export type ProductionIncidentType = "electrical_failure" | "other"

/** Tiempos de inactividad sin producción (alert-engine MQTT). */
export type AlertThresholdsConfig = {
  /** Primera alerta de paro (minutos sin producción). */
  idleMinutesStage1: number
  /** Segunda alerta / escalada (minutos sin producción). */
  idleMinutesStage2: number
}

export const DEFAULT_ALERT_THRESHOLDS: AlertThresholdsConfig = {
  idleMinutesStage1: 15,
  idleMinutesStage2: 45,
}
