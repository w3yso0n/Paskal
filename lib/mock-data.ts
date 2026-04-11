/**
 * Datos vacíos por defecto. Los datos reales se obtienen del backend / PLC (ingesta).
 * Tipos re-exportados desde lib/types.ts.
 */

export type {
  Machine,
  MachineStatus,
  Operator,
  Employee,
  Alert,
  AlertType,
  AlertCategory,
  ProductionGoal,
  GoalPeriod,
  GoalStatus,
  AttendanceRecord,
  AttendanceStatus,
  ShiftRotation,
  ShiftType,
  AttendanceStats,
} from "./types"

// ——— Datos vacíos (sin mocks) ———

export const hourlyProductionData: { hour: string; production: number }[] = []

export const machineProductionData: Record<string, string | number>[] = []

export const eventDistributionData: { name: string; value: number; color: string }[] = []

export const topMachinesData: { machine: string; operator: string; avgPerHour: number; uptime: number }[] = []

export const topSkusData: { sku: string; units: number; percentage: number }[] = []

export const machines: import("./types").Machine[] = []

export const operators: import("./types").Operator[] = []

export const employees: import("./types").Employee[] = []

export const monthlyTrendData: { month: string; actual: number; target: number }[] = []

export const productionGoals: import("./types").ProductionGoal[] = []

export const alerts: import("./types").Alert[] = []

export const attendanceRecords: import("./types").AttendanceRecord[] = []

export const shiftRotations: import("./types").ShiftRotation[] = []

export const attendanceStats: import("./types").AttendanceStats[] = []
