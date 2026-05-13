"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { OperatorCard, OperatorRow } from "@/components/operations/operator-card"
import { Trophy, Maximize2, Minimize2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/auth-context"
import {
  getActiveMachineCheckins,
  getEmployees,
  getMachines,
  getProductionEvents,
  type ApiEmployee,
  type ApiMachine,
  type ApiMachineCheckin,
  type ApiProductionEvent,
} from "@/lib/api"

type UiOperator = {
  id: number
  initials: string
  name: string
  machine: string
  sku: string
  units: number
  percentage: number
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const ini = parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join("")
  return ini || "?"
}

/** Alineado con ingesta PLC/ESP: PROD, PRODUCCION, etc. */
function isProductionIncrementEvent(e: ApiProductionEvent): boolean {
  const payload = e.payload ?? {}
  const rawEvent =
    (payload["EVENT"] as string | undefined) ??
    (payload["event"] as string | undefined) ??
    e.eventType
  const v = String(rawEvent ?? "").trim().toLowerCase()
  if (!v) return false
  if (v === "prod") return true
  if (v.includes("produ")) return true
  return v === "producción" || v === "produccion"
}

function getEventCount(e: ApiProductionEvent): number {
  const payload = e.payload ?? {}
  const raw =
    (payload["COUNT"] as unknown) ??
    (payload["count"] as unknown) ??
    (payload["units"] as unknown)
  const n = typeof raw === "number" ? raw : Number(raw)
  return Number.isFinite(n) ? n : 0
}

/** Mapa código NFC / employee_code → nombre para mostrar en UI (PLC manda códigos). */
function buildEmployeeCodeToNameMap(employees: ApiEmployee[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const emp of employees) {
    const code = emp.employeeCode?.trim()
    const name = emp.fullName?.trim()
    if (code && name) map.set(code.toLowerCase(), name)
  }
  return map
}

function resolveOperatorDisplayName(
  operatorKey: string,
  codeToName: Map<string, string>,
): string {
  const raw = operatorKey.trim()
  if (!raw || raw === "SIN_OPERADOR") return "Sin operador"
  const byCode = codeToName.get(raw.toLowerCase())
  if (byCode) return byCode
  return raw
}

/** Código operador por máquina: prioriza check-in activo, luego configuración de máquina. */
function buildMachineOperatorCodeIndex(
  machines: ApiMachine[],
  checkins: ApiMachineCheckin[],
): {
  operatorByMachineId: Map<string, string>
  machineByCodeLower: Map<string, ApiMachine>
} {
  const machineByCodeLower = new Map<string, ApiMachine>()
  for (const m of machines) {
    const c = m.code?.trim()
    if (c) machineByCodeLower.set(c.toLowerCase(), m)
  }
  const operatorByMachineId = new Map<string, string>()
  for (const ch of checkins) {
    const oc = ch.operatorCode?.trim()
    if (oc) operatorByMachineId.set(ch.machineId, oc)
  }
  for (const m of machines) {
    const oc = m.operatorCode?.trim()
    if (oc && !operatorByMachineId.has(m.id)) operatorByMachineId.set(m.id, oc)
  }
  return { operatorByMachineId, machineByCodeLower }
}

type OperatorResolveSource = "payload" | "machineId" | "machineCode" | "sin"

/** UUID de máquina en el evento (camelCase o snake_case según serialización). */
function getEventMachineId(e: ApiProductionEvent): string | null {
  if (e.machineId?.trim()) return e.machineId.trim()
  const raw = e as unknown as Record<string, unknown>
  const sn = raw["machine_id"]
  if (typeof sn === "string" && sn.trim()) return sn.trim()
  return null
}

function isLikelyUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.trim())
}

function buildMachinesByIdMap(machines: ApiMachine[]): Map<string, ApiMachine> {
  return new Map(machines.map((m) => [m.id, m]))
}

function checkinMatchesEmployeeCode(c: ApiMachineCheckin, codeLower: string): boolean {
  const parts = [
    c.operatorCode,
    c.operator2Code,
    c.packager1Code,
    c.packager2Code,
    c.packager3Code,
    c.packager4Code,
  ]
  return parts.some((p) => p?.trim().toLowerCase() === codeLower)
}

/**
 * machineId de catálogo para el evento (UUID de máquina, código Mxx, o UUID de empleado mal puesto en MACHINE_ID).
 */
function tableroCatalogMachineIdForEvent(
  rawFromPayload: string,
  eventMachineId: string | null,
  byId: Map<string, ApiMachine>,
  byCodeLower: Map<string, ApiMachine>,
  employees: ApiEmployee[],
  checkins: ApiMachineCheckin[],
): string | null {
  const mid = eventMachineId?.trim()
  if (mid && byId.has(mid)) return mid

  const raw = rawFromPayload.trim()
  if (raw && byId.has(raw)) return raw

  if (raw) {
    const m = byCodeLower.get(raw.toLowerCase())
    if (m) return m.id
  }

  if (raw && isLikelyUuid(raw)) {
    const emp = employees.find((e) => e.id === raw)
    const ec = emp?.employeeCode?.trim().toLowerCase()
    if (ec) {
      const ch = checkins.find((c) => checkinMatchesEmployeeCode(c, ec))
      if (ch?.machineId && byId.has(ch.machineId)) return ch.machineId
    }
  }

  return null
}

/** Etiqueta para UI: código de máquina o nombre; no muestra UUIDs crudos si hay catálogo / check-in. */
function tableroResolveMachineLabel(
  rawFromPayload: string,
  eventMachineId: string | null,
  byId: Map<string, ApiMachine>,
  byCodeLower: Map<string, ApiMachine>,
  employees: ApiEmployee[],
  checkins: ApiMachineCheckin[],
): string {
  const tryKey = (key: string): string | null => {
    const t = key.trim()
    if (!t) return null
    const byUuid = byId.get(t)
    if (byUuid) return byUuid.code?.trim() || byUuid.name?.trim() || t
    const byCode = byCodeLower.get(t.toLowerCase())
    if (byCode) return byCode.code?.trim() || byCode.name?.trim() || t
    return null
  }

  const catalogId = tableroCatalogMachineIdForEvent(
    rawFromPayload,
    eventMachineId,
    byId,
    byCodeLower,
    employees,
    checkins,
  )
  if (catalogId) {
    const m = byId.get(catalogId)
    if (m) return m.code?.trim() || m.name?.trim() || m.id
  }

  const fromPayload = tryKey(rawFromPayload)
  if (fromPayload) return fromPayload
  const mid = eventMachineId?.trim()
  if (mid) {
    const fromEvent = tryKey(mid)
    if (fromEvent) return fromEvent
  }

  const tail = rawFromPayload.trim() || eventMachineId?.trim() || ""
  if (tail && !isLikelyUuid(tail)) return tail
  return "—"
}

function tableroResolveSkuFromMachine(
  rawFromPayload: string,
  eventMachineId: string | null,
  byId: Map<string, ApiMachine>,
  byCodeLower: Map<string, ApiMachine>,
  employees: ApiEmployee[],
  checkins: ApiMachineCheckin[],
): string | null {
  const skuFrom = (m: ApiMachine | undefined): string | null => {
    const s = m?.currentSku?.trim()
    return s || null
  }
  const catalogId = tableroCatalogMachineIdForEvent(
    rawFromPayload,
    eventMachineId,
    byId,
    byCodeLower,
    employees,
    checkins,
  )
  if (catalogId) {
    const s = skuFrom(byId.get(catalogId))
    if (s) return s
  }
  return null
}

function pickMoreReadableMachineLabel(prev: string, next: string): string {
  const norm = (s: string) => (s.trim() ? s.trim() : "—")
  const A = norm(prev)
  const B = norm(next)
  const rank = (s: string) => {
    if (s === "—") return 0
    if (isLikelyUuid(s)) return 1
    return 2
  }
  const rA = rank(A)
  const rB = rank(B)
  if (rB > rA) return B
  if (rA > rB) return A
  return A !== "—" ? A : B
}

/**
 * PLC puede enviar OPERATOR_1 u OPERATOR; si falta, inferimos por máquina (UUID o código M-014).
 */
function getOperatorCodeForProductionEvent(
  e: ApiProductionEvent,
  idx: ReturnType<typeof buildMachineOperatorCodeIndex>,
): { code: string; source: OperatorResolveSource } {
  const p = e.payload ?? {}
  const fromPayload =
    String((p["OPERATOR_1"] as string | undefined) ?? "").trim() ||
    String((p["operator_1"] as string | undefined) ?? "").trim() ||
    String((p["OPERATOR"] as string | undefined) ?? "").trim() ||
    String((p["operator"] as string | undefined) ?? "").trim()
  if (fromPayload) return { code: fromPayload, source: "payload" }

  const mid = getEventMachineId(e)
  if (mid) {
    const oc = idx.operatorByMachineId.get(mid)
    if (oc) return { code: oc, source: "machineId" }
  }

  const machineKey = String(
    (p["MACHINE_ID"] as string | undefined) ?? (p["machine"] as string | undefined) ?? "",
  )
    .trim()
    .toLowerCase()
  if (machineKey) {
    const m = idx.machineByCodeLower.get(machineKey)
    if (m) {
      const oc = idx.operatorByMachineId.get(m.id)
      if (oc) return { code: oc, source: "machineCode" }
    }
  }

  return { code: "SIN_OPERADOR", source: "sin" }
}

function isTableroDebugEnabled(): boolean {
  if (typeof window === "undefined") return false
  try {
    return (
      window.localStorage.getItem("TABLERO_DEBUG") === "1" ||
      process.env.NEXT_PUBLIC_TABLERO_DEBUG === "1"
    )
  } catch {
    return process.env.NEXT_PUBLIC_TABLERO_DEBUG === "1"
  }
}

export default function OperationsBoardPage() {
  const { getAccessToken } = useAuth()
  const [isFullscreen, setIsFullscreen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const sinOperadorHintLogged = useRef(false)
  const [operators, setOperators] = useState<UiOperator[]>([])
  const [loading, setLoading] = useState(true)

  const handleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await containerRef.current?.requestFullscreen()
        setIsFullscreen(true)
      } else {
        await document.exitFullscreen()
        setIsFullscreen(false)
      }
    } catch (err) {
      console.error("Error toggling fullscreen:", err)
    }
  }
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const token = await getAccessToken()
        if (!token) {
          if (!cancelled) setOperators([])
          return
        }

        const [events, employees, machines, checkins] = await Promise.all([
          getProductionEvents(token, { limit: 2000 }),
          getEmployees(token),
          getMachines(token),
          getActiveMachineCheckins(token),
        ])
        if (cancelled) return

        const codeToName = buildEmployeeCodeToNameMap(employees)
        const machineIdx = buildMachineOperatorCodeIndex(machines, checkins)
        const machinesById = buildMachinesByIdMap(machines)
        const bonusGoal = 400
        const byOperatorCode = new Map<
          string,
          { units: number; machine: string; sku: string }
        >()

        const debug = isTableroDebugEnabled()
        const resolveStats = {
          prodEventsWithUnits: 0,
          fromPayload: 0,
          fromMachineId: 0,
          fromMachineCode: 0,
          sinOperador: 0,
          unitsSinOperador: 0,
        }
        let sampleSin: ApiProductionEvent | null = null

        for (const e of events) {
          if (!isProductionIncrementEvent(e)) continue
          const count = getEventCount(e)
          if (count <= 0) continue

          const payload = e.payload ?? {}
          const { code: opCode, source } = getOperatorCodeForProductionEvent(e, machineIdx)
          if (debug) {
            resolveStats.prodEventsWithUnits += 1
            if (source === "payload") resolveStats.fromPayload += 1
            else if (source === "machineId") resolveStats.fromMachineId += 1
            else if (source === "machineCode") resolveStats.fromMachineCode += 1
            else {
              resolveStats.sinOperador += 1
              resolveStats.unitsSinOperador += count
              if (!sampleSin) sampleSin = e
            }
          }
          const eventMid = getEventMachineId(e)
          const machineRaw = String(
            (payload["MACHINE_ID"] as string | undefined) ??
              (payload["machine"] as string | undefined) ??
              eventMid ??
              "",
          ).trim()
          const payloadSku = String((payload["SKU"] as string | undefined) ?? "").trim()
          const machine = tableroResolveMachineLabel(
            machineRaw,
            eventMid,
            machinesById,
            machineIdx.machineByCodeLower,
            employees,
            checkins,
          )
          const skuFromPayload = payloadSku || "—"
          const skuFromMachine = tableroResolveSkuFromMachine(
            machineRaw,
            eventMid,
            machinesById,
            machineIdx.machineByCodeLower,
            employees,
            checkins,
          )
          const sku =
            skuFromPayload !== "—" ? skuFromPayload : skuFromMachine ?? "—"

          const current = byOperatorCode.get(opCode) ?? { units: 0, machine, sku }
          byOperatorCode.set(opCode, {
            units: current.units + count,
            machine: pickMoreReadableMachineLabel(current.machine, machine),
            sku: current.sku !== "—" ? current.sku : sku,
          })
        }

        const rows: UiOperator[] = [...byOperatorCode.entries()]
          .map(([opCode, v], idx) => {
            const displayName = resolveOperatorDisplayName(opCode, codeToName)
            const rawPct = bonusGoal > 0 ? (v.units / bonusGoal) * 100 : 0
            return {
              id: idx + 1,
              initials: initialsFromName(displayName),
              name: displayName,
              machine: v.machine,
              sku: v.sku,
              units: v.units,
              percentage: Math.max(0, Math.min(100, rawPct)),
            }
          })
          .sort((a, b) => b.units - a.units)

        if (
          !debug &&
          !sinOperadorHintLogged.current &&
          rows[0]?.name === "Sin operador"
        ) {
          sinOperadorHintLogged.current = true
          console.info(
            '[TableroOperativo] El #1 sale como "Sin operador". Para ver diagnóstico: localStorage.setItem("TABLERO_DEBUG","1") y recarga (F5).',
          )
        }

        if (debug) {
          const employeeCodesSample = employees
            .filter((emp) => emp.employeeCode?.trim())
            .slice(0, 12)
            .map((emp) => ({ code: emp.employeeCode, name: emp.fullName }))
          const machineOpSample = [...machineIdx.operatorByMachineId.entries()].slice(0, 8)
          const topRow = rows[0]
          const topEntry = [...byOperatorCode.entries()].sort((a, b) => b[1].units - a[1].units)[0]
          console.info("[TableroOperativo] debug ciclo", {
            counts: {
              eventsTotal: events.length,
              employees: employees.length,
              machines: machines.length,
              checkins: checkins.length,
              resolveStats,
            },
            maps: {
              employeeCodeToNameSize: codeToName.size,
              operatorByMachineIdSize: machineIdx.operatorByMachineId.size,
              machineByCodeKeys: [...machineIdx.machineByCodeLower.keys()].slice(0, 15),
              machineOpSample,
            },
            rankingTop: topRow
              ? {
                  displayName: topRow.name,
                  units: topRow.units,
                  opCodeAgregado: topEntry?.[0] ?? null,
                  tieneNombreEnMaestro:
                    topEntry?.[0] != null ? codeToName.has(topEntry[0].toLowerCase()) : null,
                }
              : null,
            employeeCodesSample,
            sinOperadorSampleEvent: sampleSin
              ? {
                  id: sampleSin.id,
                  machineId: sampleSin.machineId,
                  machineIdResuelto: getEventMachineId(sampleSin),
                  eventTopLevelKeys: Object.keys(sampleSin as unknown as Record<string, unknown>),
                  eventType: sampleSin.eventType,
                  payloadKeys: Object.keys(sampleSin.payload ?? {}),
                  payloadSnippet: sampleSin.payload,
                }
              : null,
            hint: "Desactiva con localStorage.removeItem('TABLERO_DEBUG')",
          })
        }

        setOperators(rows)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    const intervalId = window.setInterval(load, 20_000)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [getAccessToken])

  const sortedOperators = useMemo(
    () => [...operators].sort((a, b) => b.units - a.units),
    [operators],
  )
  const topThree = useMemo(() => sortedOperators.slice(0, 3), [sortedOperators])
  const restOperators = useMemo(() => sortedOperators.slice(3), [sortedOperators])
  const leftColumn = useMemo(() => restOperators.filter((_, i) => i % 2 === 0), [restOperators])
  const rightColumn = useMemo(() => restOperators.filter((_, i) => i % 2 === 1), [restOperators])
  const hasOperators = operators.length > 0

  return (
    <DashboardLayout 
      breadcrumbs={[
        { label: "Inicio", href: "/" },
        { label: "Tablero Operativo" }
      ]}
    >
      <div ref={containerRef} className={`space-y-3 ${isFullscreen ? 'fixed inset-0 bg-background overflow-auto p-8' : ''}`}>
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            <h1 className="text-xl font-bold text-foreground sm:text-2xl">Tablero Operativo en Vivo</h1>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={handleFullscreen}
            title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Top 3 Podium */}
        {loading ? (
          <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-muted-foreground">
            Cargando tablero…
          </div>
        ) : hasOperators ? (
          <>
            <div className="flex items-end justify-center">
              <div className="grid grid-flow-col auto-cols-max items-end gap-2">
                {topThree[1] && (
                  <div className="translate-y-4">
                    <OperatorCard operator={topThree[1]} rank={2} density="compact" />
                  </div>
                )}
                {topThree[0] && (
                  <div>
                    <OperatorCard operator={topThree[0]} rank={1} density="compact" />
                  </div>
                )}
                {topThree[2] && (
                  <div className="translate-y-4">
                    <OperatorCard operator={topThree[2]} rank={3} density="compact" />
                  </div>
                )}
              </div>
            </div>

            {/* Operator Rankings Table */}
            <div className="grid gap-0 lg:grid-cols-2">
              <div className="rounded-xl border border-border bg-card p-3">
                {leftColumn.map((operator, index) => (
                  <OperatorRow
                    key={operator.id}
                    operator={operator}
                    rank={4 + index * 2}
                    density="compact"
                  />
                ))}
              </div>
              <div className="rounded-xl border border-border bg-card p-3">
                {rightColumn.map((operator, index) => (
                  <OperatorRow
                    key={operator.id}
                    operator={operator}
                    rank={5 + index * 2}
                    density="compact"
                  />
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-muted-foreground">
            Sin datos de operadores. Los datos se cargan desde el PLC/ESP.
          </div>
        )}

        {/* Footer info */}
        <div className="text-center text-xs text-muted-foreground">
          Actualización automática • Meta bono: 400 uds
        </div>
      </div>
    </DashboardLayout>
  )
}
