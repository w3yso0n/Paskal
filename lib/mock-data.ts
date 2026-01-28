// Production data for charts
export const hourlyProductionData = [
  { hour: "06:00", production: 180 },
  { hour: "07:00", production: 280 },
  { hour: "08:00", production: 290 },
  { hour: "09:00", production: 320 },
  { hour: "10:00", production: 275 },
  { hour: "11:00", production: 260 },
  { hour: "12:00", production: 300 },
  { hour: "13:00", production: 290 },
  { hour: "14:00", production: 310 },
  { hour: "15:00", production: 295 },
  { hour: "16:00", production: 340 },
  { hour: "17:00", production: 180 },
]

// Machine production data over time
export const machineProductionData = Array.from({ length: 20 }, (_, i) => {
  const hour = 8 + Math.floor(i / 2)
  const minute = (i % 2) * 30
  const row: Record<string, string | number> = {
    time: `${hour}:${minute.toString().padStart(2, "0")}`,
  }

  for (let machine = 1; machine <= 20; machine++) {
    const base = 220 + machine * 8
    const variance = 120 + (machine % 5) * 20
    row[`Máquina ${machine}`] = Math.round(base + Math.random() * variance)
  }

  return row
})

// Event distribution data
export const eventDistributionData = [
  { name: "Producción", value: 720, color: "#22c55e" },
  { name: "Cambio SKU", value: 45, color: "#3b82f6" },
  { name: "Parada", value: 28, color: "#f97316" },
]

// Top machines performance
export const topMachinesData = [
  { machine: "M1", operator: "Juan P.", avgPerHour: 15.2, uptime: 95 },
  { machine: "M2", operator: "María G.", avgPerHour: 14.8, uptime: 92 },
  { machine: "M3", operator: "Carlos R.", avgPerHour: 16.1, uptime: 98 },
  { machine: "M4", operator: "Ana L.", avgPerHour: 13.5, uptime: 88 },
  { machine: "M5", operator: "Pedro S.", avgPerHour: 15.9, uptime: 90 },
]

// SKUs most produced
export const topSkusData = [
  { sku: "SKU-001", units: 2450, percentage: 28 },
  { sku: "SKU-002", units: 1890, percentage: 22 },
  { sku: "SKU-003", units: 1560, percentage: 18 },
  { sku: "SKU-004", units: 1230, percentage: 14 },
  { sku: "SKU-005", units: 980, percentage: 11 },
]

// Machine status for production floor
export type MachineStatus = "active" | "waiting" | "inactive"

export interface Machine {
  id: string
  name: string
  status: MachineStatus
  position: { row: number; col: number }
}

export const machines: Machine[] = [
  { id: "m1", name: "M1", status: "active", position: { row: 6, col: 0 } },
  { id: "m2", name: "M2", status: "active", position: { row: 5, col: 0 } },
  { id: "m3", name: "M3", status: "inactive", position: { row: 4, col: 0 } },
  { id: "m4", name: "M4", status: "waiting", position: { row: 3, col: 0 } },
  { id: "m5", name: "M5", status: "active", position: { row: 2, col: 0 } },
  { id: "m6", name: "M6", status: "active", position: { row: 1, col: 0 } },
  { id: "m7", name: "M7", status: "active", position: { row: 6, col: 1 } },
  { id: "m8", name: "M8", status: "inactive", position: { row: 5, col: 1 } },
  { id: "m11", name: "M11", status: "waiting", position: { row: 6, col: 2 } },
  { id: "m12", name: "M12", status: "waiting", position: { row: 5, col: 2 } },
  { id: "m13", name: "M13", status: "active", position: { row: 4, col: 2 } },
  { id: "m14", name: "M14", status: "inactive", position: { row: 3, col: 2 } },
  { id: "m15", name: "M15", status: "active", position: { row: 6, col: 3 } },
  { id: "m16", name: "M16", status: "waiting", position: { row: 5, col: 3 } },
  { id: "m17", name: "M17", status: "inactive", position: { row: 4, col: 3 } },
  { id: "m18", name: "M18", status: "active", position: { row: 3, col: 3 } },
  { id: "m19", name: "M19", status: "active", position: { row: 6, col: 4 } },
  { id: "m20", name: "M20", status: "active", position: { row: 5, col: 4 } },
  { id: "m21", name: "M21", status: "waiting", position: { row: 4, col: 4 } },
  { id: "m22", name: "M22", status: "active", position: { row: 3, col: 4 } },
]

// Operators for live dashboard
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

export const operators: Operator[] = [
  { id: 1, initials: "CR", name: "Carlos Ramírez", machine: "M3", sku: "SKU-001", units: 497, percentage: 100, isLeader: true },
  { id: 2, initials: "MG", name: "María González", machine: "M7", sku: "SKU-003", units: 458, percentage: 92 },
  { id: 3, initials: "JP", name: "Juan Pérez", machine: "M1", sku: "SKU-001", units: 450, percentage: 90 },
  { id: 4, initials: "AL", name: "Ana López", machine: "M12", sku: "SKU-002", units: 427, percentage: 100 },
  { id: 5, initials: "PS", name: "Pedro Sánchez", machine: "M5", sku: "SKU-004", units: 402, percentage: 100 },
  { id: 6, initials: "LM", name: "Laura Martínez", machine: "M15", sku: "SKU-001", units: 394, percentage: 99 },
  { id: 7, initials: "RT", name: "Roberto Torres", machine: "M8", sku: "SKU-003", units: 383, percentage: 96 },
  { id: 8, initials: "DC", name: "Diana Castro", machine: "M11", sku: "SKU-002", units: 361, percentage: 90 },
  { id: 9, initials: "MA", name: "Miguel Ángel", machine: "M19", sku: "SKU-005", units: 346, percentage: 87 },
  { id: 10, initials: "SH", name: "Sofía Herrera", machine: "M22", sku: "SKU-001", units: 333, percentage: 83 },
  { id: 11, initials: "FR", name: "Fernando Ruiz", machine: "M2", sku: "SKU-002", units: 321, percentage: 80 },
  { id: 12, initials: "CV", name: "Carmen Vega", machine: "M4", sku: "SKU-003", units: 306, percentage: 77 },
  { id: 13, initials: "AM", name: "Andrés Mora", machine: "M6", sku: "SKU-001", units: 297, percentage: 74 },
  { id: 14, initials: "PD", name: "Patricia Díaz", machine: "M13", sku: "SKU-004", units: 285, percentage: 71 },
  { id: 15, initials: "RL", name: "Ricardo Luna", machine: "M14", sku: "SKU-002", units: 272, percentage: 68 },
  { id: 16, initials: "ER", name: "Elena Ríos", machine: "M16", sku: "SKU-003", units: 257, percentage: 64 },
  { id: 17, initials: "JM", name: "Jorge Mendez", machine: "M17", sku: "SKU-001", units: 248, percentage: 62 },
  { id: 18, initials: "LO", name: "Lucía Ortega", machine: "M18", sku: "SKU-005", units: 233, percentage: 58 },
  { id: 19, initials: "OV", name: "Oscar Vargas", machine: "M20", sku: "SKU-002", units: 225, percentage: 56 },
  { id: 20, initials: "RN", name: "Rosa Navarro", machine: "M21", sku: "SKU-004", units: 206, percentage: 52 },
]

// Employees for management
export interface Employee {
  id: string
  name: string
  role: "Operador" | "Empacador"
  nfcId: string
  shift: "Matutino" | "Vespertino"
}

export const employees: Employee[] = [
  { id: "1", name: "Juan Pérez", role: "Operador", nfcId: "NFC-001", shift: "Matutino" },
  { id: "2", name: "María García", role: "Empacador", nfcId: "NFC-002", shift: "Vespertino" },
  { id: "3", name: "Carlos López", role: "Operador", nfcId: "NFC-003", shift: "Matutino" },
  { id: "4", name: "Ana Martínez", role: "Empacador", nfcId: "NFC-004", shift: "Vespertino" },
  { id: "5", name: "Roberto Sánchez", role: "Operador", nfcId: "NFC-005", shift: "Matutino" },
]

// Alerts and Notifications
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

// Performance comparison data
// Performance comparison data (moved into Métricas)

export const monthlyTrendData = [
  { month: "Ene", actual: 85000, target: 90000 },
  { month: "Feb", actual: 88000, target: 90000 },
  { month: "Mar", actual: 92000, target: 90000 },
  { month: "Abr", actual: 87000, target: 92000 },
  { month: "May", actual: 95000, target: 92000 },
  { month: "Jun", actual: 91000, target: 95000 },
  { month: "Jul", actual: 98000, target: 95000 },
  { month: "Ago", actual: 94000, target: 98000 },
  { month: "Sep", actual: 102000, target: 98000 },
  { month: "Oct", actual: 99000, target: 100000 },
  { month: "Nov", actual: 105000, target: 100000 },
  { month: "Dic", actual: 78000, target: 105000 },
]

// Goals and targets
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

export const productionGoals: ProductionGoal[] = [
  {
    id: "g1",
    name: "Meta Diaria de Producción",
    description: "Producir 3,500 unidades en el día",
    period: "daily",
    targetValue: 3500,
    currentValue: 3301,
    unit: "unidades",
    startDate: "2026-01-20",
    endDate: "2026-01-20",
    status: "on-track",
  },
  {
    id: "g2",
    name: "Meta Semanal",
    description: "Alcanzar 22,000 unidades esta semana",
    period: "weekly",
    targetValue: 22000,
    currentValue: 18500,
    unit: "unidades",
    startDate: "2026-01-13",
    endDate: "2026-01-19",
    status: "on-track",
  },
  {
    id: "g3",
    name: "Meta Mensual",
    description: "Producir 95,000 unidades en enero",
    period: "monthly",
    targetValue: 95000,
    currentValue: 72000,
    unit: "unidades",
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    status: "on-track",
  },
  {
    id: "g4",
    name: "Eficiencia OEE",
    description: "Mantener OEE promedio sobre 85%",
    period: "monthly",
    targetValue: 85,
    currentValue: 87.5,
    unit: "%",
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    status: "exceeded",
  },
  {
    id: "g5",
    name: "Reducción de Tiempo Muerto",
    description: "Menos de 3 horas de tiempo muerto diario",
    period: "daily",
    targetValue: 3,
    currentValue: 2.3,
    unit: "horas",
    startDate: "2026-01-20",
    endDate: "2026-01-20",
    status: "exceeded",
  },
  {
    id: "g6",
    name: "SKU-001 Semanal",
    description: "Producir 8,000 unidades de SKU-001",
    period: "weekly",
    targetValue: 8000,
    currentValue: 5200,
    unit: "unidades",
    startDate: "2026-01-13",
    endDate: "2026-01-19",
    status: "at-risk",
    skuId: "SKU-001",
  },
  {
    id: "g7",
    name: "Meta Anual 2026",
    description: "Alcanzar 1,200,000 unidades en el año",
    period: "annual",
    targetValue: 1200000,
    currentValue: 72000,
    unit: "unidades",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    status: "on-track",
  },
  {
    id: "g8",
    name: "Calidad de Producción",
    description: "Mantener tasa de calidad sobre 98%",
    period: "monthly",
    targetValue: 98,
    currentValue: 98.7,
    unit: "%",
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    status: "exceeded",
  },
]

export const alerts: Alert[] = [
  {
    id: "a1",
    type: "error",
    category: "machine",
    title: "Máquina M3 Detenida",
    message: "La máquina M3 se ha detenido inesperadamente. Se requiere revisión inmediata.",
    timestamp: new Date(Date.now() - 5 * 60 * 1000),
    isRead: false,
    machineId: "m3",
    actionRequired: true,
  },
  {
    id: "a2",
    type: "warning",
    category: "production",
    title: "Producción Baja en M4",
    message: "La máquina M4 lleva 45 minutos sin aumentar su producción.",
    timestamp: new Date(Date.now() - 15 * 60 * 1000),
    isRead: false,
    machineId: "m4",
    actionRequired: true,
  },
  {
    id: "a4",
    type: "success",
    category: "production",
    title: "Meta Diaria Alcanzada",
    message: "La línea de producción ha alcanzado la meta diaria de 3,000 unidades.",
    timestamp: new Date(Date.now() - 60 * 60 * 1000),
    isRead: true,
    actionRequired: false,
  },
  {
    id: "a5",
    type: "error",
    category: "machine",
    title: "Error en Sensor M14",
    message: "El sensor de temperatura de M14 reporta lecturas inconsistentes.",
    timestamp: new Date(Date.now() - 90 * 60 * 1000),
    isRead: false,
    machineId: "m14",
    actionRequired: true,
  },
  {
    id: "a6",
    type: "info",
    category: "system",
    title: "Actualización del Sistema",
    message: "Nueva actualización del sistema disponible. Versión 2.5.1",
    timestamp: new Date(Date.now() - 120 * 60 * 1000),
    isRead: true,
    actionRequired: false,
  },
]

// Attendance and Shift Rotation
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

// Attendance records for the last 30 days
export const attendanceRecords: AttendanceRecord[] = [
  // Carlos Ramírez
  { id: "a1", employeeId: "1", employeeName: "Carlos Ramírez", date: new Date(2026, 0, 23), checkInTime: "06:00", checkOutTime: "14:30", status: "Asistente", hoursWorked: 8.5 },
  { id: "a2", employeeId: "1", employeeName: "Carlos Ramírez", date: new Date(2026, 0, 22), checkInTime: "06:05", checkOutTime: "14:30", status: "Retardo", hoursWorked: 8.4 },
  { id: "a3", employeeId: "1", employeeName: "Carlos Ramírez", date: new Date(2026, 0, 21), checkInTime: "06:00", checkOutTime: "14:30", status: "Asistente", hoursWorked: 8.5 },
  { id: "a4", employeeId: "1", employeeName: "Carlos Ramírez", date: new Date(2026, 0, 20), checkInTime: "06:00", checkOutTime: "14:15", status: "Asistente", hoursWorked: 8.25 },
  { id: "a5", employeeId: "1", employeeName: "Carlos Ramírez", date: new Date(2026, 0, 17), status: "Permiso", notes: "Permiso médico" },
  // María González
  { id: "a6", employeeId: "2", employeeName: "María González", date: new Date(2026, 0, 23), checkInTime: "14:00", checkOutTime: "22:30", status: "Asistente", hoursWorked: 8.5 },
  { id: "a7", employeeId: "2", employeeName: "María González", date: new Date(2026, 0, 22), checkInTime: "14:00", checkOutTime: "22:30", status: "Asistente", hoursWorked: 8.5 },
  { id: "a8", employeeId: "2", employeeName: "María González", date: new Date(2026, 0, 21), checkInTime: "14:00", checkOutTime: "22:30", status: "Asistente", hoursWorked: 8.5 },
  { id: "a9", employeeId: "2", employeeName: "María González", date: new Date(2026, 0, 20), status: "Ausente", notes: "Sin justificación" },
  { id: "a10", employeeId: "2", employeeName: "María González", date: new Date(2026, 0, 17), checkInTime: "14:10", checkOutTime: "22:30", status: "Retardo", hoursWorked: 8.3 },
  // Juan Pérez
  { id: "a11", employeeId: "3", employeeName: "Juan Pérez", date: new Date(2026, 0, 23), checkInTime: "22:00", checkOutTime: "06:00", status: "Asistente", hoursWorked: 8 },
  { id: "a12", employeeId: "3", employeeName: "Juan Pérez", date: new Date(2026, 0, 22), checkInTime: "22:00", checkOutTime: "06:30", status: "Asistente", hoursWorked: 8.5 },
  { id: "a13", employeeId: "3", employeeName: "Juan Pérez", date: new Date(2026, 0, 21), checkInTime: "22:00", checkOutTime: "06:00", status: "Asistente", hoursWorked: 8 },
  { id: "a14", employeeId: "3", employeeName: "Juan Pérez", date: new Date(2026, 0, 20), checkInTime: "22:00", checkOutTime: "06:00", status: "Asistente", hoursWorked: 8 },
  { id: "a15", employeeId: "3", employeeName: "Juan Pérez", date: new Date(2026, 0, 17), checkInTime: "22:05", checkOutTime: "06:00", status: "Retardo", hoursWorked: 7.9 },
  // Ana López
  { id: "a16", employeeId: "4", employeeName: "Ana López", date: new Date(2026, 0, 23), checkInTime: "06:00", checkOutTime: "14:30", status: "Asistente", hoursWorked: 8.5 },
  { id: "a17", employeeId: "4", employeeName: "Ana López", date: new Date(2026, 0, 22), checkInTime: "06:00", checkOutTime: "14:30", status: "Asistente", hoursWorked: 8.5 },
  { id: "a18", employeeId: "4", employeeName: "Ana López", date: new Date(2026, 0, 21), checkInTime: "06:00", checkOutTime: "14:30", status: "Asistente", hoursWorked: 8.5 },
  { id: "a19", employeeId: "4", employeeName: "Ana López", date: new Date(2026, 0, 20), checkInTime: "06:00", checkOutTime: "14:30", status: "Asistente", hoursWorked: 8.5 },
  { id: "a20", employeeId: "4", employeeName: "Ana López", date: new Date(2026, 0, 17), checkInTime: "06:00", checkOutTime: "14:30", status: "Asistente", hoursWorked: 8.5 },
]

// Shift rotations
export const shiftRotations: ShiftRotation[] = [
  // Week of Jan 20-24, 2026
  { id: "s1", employeeId: "1", employeeName: "Carlos Ramírez", machine: "M3", shift: "Mañana", date: new Date(2026, 0, 23), startTime: "06:00", endTime: "14:30", status: "Completado" },
  { id: "s2", employeeId: "1", employeeName: "Carlos Ramírez", machine: "M3", shift: "Mañana", date: new Date(2026, 0, 24), startTime: "06:00", endTime: "14:30", status: "Programado" },
  { id: "s3", employeeId: "2", employeeName: "María González", machine: "M7", shift: "Tarde", date: new Date(2026, 0, 23), startTime: "14:00", endTime: "22:30", status: "Completado" },
  { id: "s4", employeeId: "2", employeeName: "María González", machine: "M7", shift: "Tarde", date: new Date(2026, 0, 24), startTime: "14:00", endTime: "22:30", status: "Programado" },
  { id: "s5", employeeId: "3", employeeName: "Juan Pérez", machine: "M1", shift: "Noche", date: new Date(2026, 0, 23), startTime: "22:00", endTime: "06:00", status: "Completado" },
  { id: "s6", employeeId: "3", employeeName: "Juan Pérez", machine: "M1", shift: "Noche", date: new Date(2026, 0, 24), startTime: "22:00", endTime: "06:00", status: "Programado" },
  { id: "s7", employeeId: "4", employeeName: "Ana López", machine: "M12", shift: "Mañana", date: new Date(2026, 0, 23), startTime: "06:00", endTime: "14:30", status: "Completado" },
  { id: "s8", employeeId: "4", employeeName: "Ana López", machine: "M12", shift: "Mañana", date: new Date(2026, 0, 24), startTime: "06:00", endTime: "14:30", status: "Programado" },
  { id: "s9", employeeId: "1", employeeName: "Carlos Ramírez", machine: "M3", shift: "Tarde", date: new Date(2026, 0, 25), startTime: "14:00", endTime: "22:30", status: "Programado" },
  { id: "s10", employeeId: "2", employeeName: "María González", machine: "M7", shift: "Noche", date: new Date(2026, 0, 25), startTime: "22:00", endTime: "06:00", status: "Programado" },
]

// Attendance statistics
export const attendanceStats: AttendanceStats[] = [
  { employeeId: "1", employeeName: "Carlos Ramírez", totalDays: 20, presentDays: 17, absentDays: 0, lateDays: 2, permissions: 1, attendancePercentage: 85, averageHoursWorked: 8.3 },
  { employeeId: "2", employeeName: "María González", totalDays: 20, presentDays: 16, absentDays: 1, lateDays: 1, permissions: 2, attendancePercentage: 80, averageHoursWorked: 8.2 },
  { employeeId: "3", employeeName: "Juan Pérez", totalDays: 20, presentDays: 18, absentDays: 0, lateDays: 1, permissions: 1, attendancePercentage: 90, averageHoursWorked: 8.1 },
  { employeeId: "4", employeeName: "Ana López", totalDays: 20, presentDays: 20, absentDays: 0, lateDays: 0, permissions: 0, attendancePercentage: 100, averageHoursWorked: 8.5 },
]
