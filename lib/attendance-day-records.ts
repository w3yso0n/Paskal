import type { ApiEmployeeDayRecord, ApiEmployeeDayRecordType } from "@/lib/api"
import type { AttendanceRecord, AttendanceStatus } from "@/lib/types"

const RECORD_TYPE_STATUS: Record<ApiEmployeeDayRecordType, AttendanceStatus> = {
  vacation: "Vacaciones",
  incapacity: "Incapacidad",
  incident: "Falta justificada",
  excused_unpaid: "Permiso sin goce",
  time_exchange: "Tiempo por tiempo",
}

export const DAY_RECORD_TYPE_LABEL: Record<ApiEmployeeDayRecordType, string> = {
  vacation: "Vacaciones (V)",
  incapacity: "Incapacidad (INCAP)",
  incident: "Incidencia / falta justificada (INC)",
  excused_unpaid: "Permiso sin goce (PSG)",
  time_exchange: "Tiempo por tiempo (TXT)",
}

function dayKeyFromDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const da = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${da}`
}

function mergeKey(employeeId: string, day: string): string {
  return `${employeeId}|${day}`
}

function dayRecordToAttendance(r: ApiEmployeeDayRecord): AttendanceRecord {
  const date = new Date(`${r.recordDate}T12:00:00`)
  const shiftLabel =
    r.shift === "matutino"
      ? "Matutino"
      : r.shift === "vespertino"
        ? "Vespertino"
        : "Ambos turnos"
  const typeLabel = DAY_RECORD_TYPE_LABEL[r.recordType]
  const noteParts = [typeLabel, shiftLabel]
  if (r.notes?.trim()) noteParts.push(r.notes.trim())

  return {
    id: `day-record-${r.id}`,
    employeeId: r.employeeId,
    employeeName: r.employeeName,
    date,
    status: RECORD_TYPE_STATUS[r.recordType],
    notes: noteParts.join(" · "),
    dayRecordId: r.id,
    dayRecordType: r.recordType,
  }
}

/**
 * Combina asistencia por check-in NFC con registros de día (vacaciones, incapacidad, faltas).
 * El registro de día prevalece sobre el estado del check-in para la misma persona y fecha.
 */
export function mergeAttendanceWithDayRecords(
  checkinRecords: AttendanceRecord[],
  dayRecords: ApiEmployeeDayRecord[],
): AttendanceRecord[] {
  const byKey = new Map<string, AttendanceRecord>()

  for (const r of checkinRecords) {
    const day = dayKeyFromDate(r.date)
    byKey.set(mergeKey(r.employeeId, day), { ...r })
  }

  for (const dr of dayRecords) {
    const day = dr.recordDate.trim().slice(0, 10)
    const key = mergeKey(dr.employeeId, day)
    const fromDay = dayRecordToAttendance(dr)
    const existing = byKey.get(key)

    if (existing) {
      byKey.set(key, {
        ...existing,
        status: fromDay.status,
        notes: [fromDay.notes, existing.notes].filter(Boolean).join(" · "),
        dayRecordId: dr.id,
        dayRecordType: dr.recordType,
      })
    } else {
      byKey.set(key, fromDay)
    }
  }

  return [...byKey.values()].sort((a, b) => {
    const d = b.date.getTime() - a.date.getTime()
    if (d !== 0) return d
    return a.employeeName.localeCompare(b.employeeName, "es")
  })
}
