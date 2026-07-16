import type {
  BonusEffectiveRole,
  EmployeeProductionRole,
  EmployeeSecondaryRole,
} from "@/lib/employee-production-role"
import { resolveEmployeeProductionRole } from "@/lib/employee-production-role"

export type BonusSectionRole = EmployeeProductionRole

export type BonusEmployeeRoleEvent = {
  employeeName: string
  recordDate: string
  shift: string | null
  secondaryRole: EmployeeSecondaryRole
}

export type BonusEmployeePrimaryRole = {
  fullName: string
  primaryRole?: EmployeeProductionRole | null
  secondaryRole?: EmployeeSecondaryRole | null
}

function normalizePersonName(value: string): string {
  return value.trim().replace(/\s+/g, " ")
}

function bonusShiftLabel(shiftNumber: 1 | 2): "matutino" | "vespertino" {
  return shiftNumber === 1 ? "matutino" : "vespertino"
}

function roleEventMatchesShift(shift: string | null, shiftNumber: 1 | 2): boolean {
  const normalized = shift?.trim().toLowerCase()
  if (!normalized) return true
  return normalized === bonusShiftLabel(shiftNumber)
}

export function buildPrimaryRoleByPerson(
  employees: BonusEmployeePrimaryRole[],
): Map<string, BonusSectionRole> {
  const out = new Map<string, BonusSectionRole>()
  for (const emp of employees) {
    const name = normalizePersonName(emp.fullName)
    const role = resolveEmployeeProductionRole(emp.primaryRole)
    if (!name || !role) continue
    out.set(name, role)
  }
  return out
}

export function buildDefaultSecondaryRoleByPerson(
  employees: BonusEmployeePrimaryRole[],
): Map<string, EmployeeSecondaryRole> {
  const out = new Map<string, EmployeeSecondaryRole>()
  for (const emp of employees) {
    const name = normalizePersonName(emp.fullName)
    const primary = resolveEmployeeProductionRole(emp.primaryRole)
    if (
      !name ||
      (primary !== "operator" && primary !== "packer") ||
      !emp.secondaryRole
    ) {
      continue
    }
    out.set(name, emp.secondaryRole)
  }
  return out
}

export function buildTempSecondaryRoleByPersonDay(
  events: BonusEmployeeRoleEvent[],
  shiftNumber: 1 | 2,
): Map<string, Map<string, EmployeeSecondaryRole>> {
  const out = new Map<string, Map<string, EmployeeSecondaryRole>>()
  for (const ev of events) {
    if (!roleEventMatchesShift(ev.shift, shiftNumber)) continue
    const name = normalizePersonName(ev.employeeName)
    if (!name) continue
    const byDay = out.get(name) ?? new Map<string, EmployeeSecondaryRole>()
    byDay.set(ev.recordDate, ev.secondaryRole)
    out.set(name, byDay)
  }
  return out
}

function resolveEffectiveRole(
  primary: BonusSectionRole | undefined,
  defaultSecondary: EmployeeSecondaryRole | undefined,
  eventSecondary: EmployeeSecondaryRole | undefined,
): BonusEffectiveRole | undefined {
  if (!primary) return undefined
  if (primary !== "operator" && primary !== "packer") return primary
  const secondary = eventSecondary ?? defaultSecondary
  if (!secondary) return primary
  return secondary === "auxiliary" ? "auxiliary" : secondary
}

export function effectiveRoleForDay(
  personName: string,
  dayIso: string,
  primaryRoleByPerson: Map<string, BonusSectionRole>,
  defaultSecondaryByPerson: Map<string, EmployeeSecondaryRole>,
  tempSecondaryByPersonDay: Map<string, Map<string, EmployeeSecondaryRole>>,
): BonusEffectiveRole | undefined {
  const name = normalizePersonName(personName)
  const primary = primaryRoleByPerson.get(name)
  const defaultSecondary = defaultSecondaryByPerson.get(name)
  const eventSecondary = tempSecondaryByPersonDay.get(name)?.get(dayIso)
  return resolveEffectiveRole(primary, defaultSecondary, eventSecondary)
}

export function collectSectionPeople(
  productionPeople: string[],
  sectionRole: BonusSectionRole,
  primaryRoleByPerson: Map<string, BonusSectionRole>,
  defaultSecondaryByPerson: Map<string, EmployeeSecondaryRole>,
  tempSecondaryByPersonDay: Map<string, Map<string, EmployeeSecondaryRole>>,
  dayIsos: string[],
): string[] {
  const set = new Set(
    productionPeople.map((p) => normalizePersonName(p)).filter(Boolean),
  )

  for (const [person, primary] of primaryRoleByPerson) {
    if (primary === sectionRole) set.add(person)
    if (primary === "operator" || primary === "packer") {
      const defaultSecondary = defaultSecondaryByPerson.get(person)
      if (defaultSecondary && defaultSecondary !== "auxiliary" && defaultSecondary === sectionRole) {
        set.add(person)
      }
    }
  }

  for (const [person, byDay] of tempSecondaryByPersonDay) {
    const primary = primaryRoleByPerson.get(person)
    if (primary !== "operator" && primary !== "packer") continue
    for (const day of dayIsos) {
      const secondary = byDay.get(day)
      if (secondary && secondary !== "auxiliary" && secondary === sectionRole) {
        set.add(person)
        break
      }
    }
  }

  return [...set].sort((a, b) => a.localeCompare(b, "es"))
}

type DayRoleTotals = Record<BonusSectionRole, number>

function totalRoleProduction(roles: DayRoleTotals): number {
  return roles.operator + roles.packer + roles.bending + roles.roller
}

function workedInOtherRoles(roles: DayRoleTotals, sectionRole: BonusSectionRole): boolean {
  return (Object.keys(roles) as BonusSectionRole[]).some(
    (role) => role !== sectionRole && roles[role] > 0,
  )
}

/** ¿Mostrar n/a por rol distinto al de la sección? */
export function shouldShowNaForRoleContext(
  sectionRole: BonusSectionRole,
  effectiveRole: BonusEffectiveRole | undefined,
  primaryRole: BonusSectionRole | undefined,
  amountInSection: number,
  dayRoles: DayRoleTotals,
): boolean {
  // La producción y la meta siempre pertenecen al rol primordial. El rol temporal
  // solo indica en qué ranura trabajó ese día; no mueve su producción a otra meta.
  if (primaryRole && totalRoleProduction(dayRoles) > 0) {
    return sectionRole !== primaryRole
  }

  if (effectiveRole === "auxiliary") {
    return sectionRole !== "operator" || amountInSection > 0
  }

  if (effectiveRole) {
    if (sectionRole !== effectiveRole) {
      return (
        amountInSection > 0 ||
        (primaryRole === sectionRole && totalRoleProduction(dayRoles) > 0)
      )
    }
    return false
  }

  if (amountInSection > 0) return false
  return totalRoleProduction(dayRoles) > 0 && workedInOtherRoles(dayRoles, sectionRole)
}
