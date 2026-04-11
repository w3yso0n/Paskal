/**
 * Tipos usados en la plataforma. Los datos reales vienen del backend / PLC.
 */

export type MachineStatus = "active" | "waiting" | "inactive"

export interface Machine {
  id: string
  name: string
  status: MachineStatus
  position: { row: number; col: number }
}

export interface Operator {
  id: number
  initials: string
  name: string
  machine: string
  sku: string
  units: number
  percentage: number
  isLeader?: boolean
}

export interface Employee {
  id: string
  name: string
  role: "Operador" | "Empacador"
  nfcId: string
  shift: "Matutino" | "Vespertino"
}

export type AlertType = "warning" | "error" | "info" | "success"
export type AlertCategory = "machine" | "production" | "employee" | "system"

export interface Alert {
  id: string
  type: AlertType
  category: AlertCategory
  title: string
  message: string
  timestamp: Date
  isRead: boolean
  machineId?: string
  employeeId?: string
  actionRequired?: boolean
}

export type GoalPeriod = "daily" | "weekly" | "monthly" | "annual"
export type GoalStatus = "on-track" | "at-risk" | "behind" | "completed" | "exceeded"

export interface ProductionGoal {
  id: string
  name: string
  description: string
  period: GoalPeriod
  targetValue: number
  currentValue: number
  unit: string
  startDate: string
  endDate: string
  status: GoalStatus
  machineId?: string
  skuId?: string
}

export type ShiftType = "Mañana" | "Tarde" | "Noche"
export type AttendanceStatus = "Asistente" | "Ausente" | "Retardo" | "Permiso"

export interface AttendanceRecord {
  id: string
  employeeId: string
  employeeName: string
  date: Date
  checkInTime?: string
  checkOutTime?: string
  status: AttendanceStatus
  hoursWorked?: number
  notes?: string
}

export interface ShiftRotation {
  id: string
  employeeId: string
  employeeName: string
  machine: string
  shift: ShiftType
  date: Date
  startTime: string
  endTime: string
  status: "Programado" | "Completado" | "Cancelado"
}

export interface AttendanceStats {
  employeeId: string
  employeeName: string
  totalDays: number
  presentDays: number
  absentDays: number
  lateDays: number
  permissions: number
  attendancePercentage: number
  averageHoursWorked: number
}
