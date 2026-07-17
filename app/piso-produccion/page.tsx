"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { MachineCard, type MachineWaitingReason } from "@/components/production/machine-card"
import {
  MachineStatusDot,
  machineStatusShortLabel,
} from "@/components/production/machine-status-dot"
import type { Machine } from "@/lib/types"
import {
  closeAllMachineCheckins,
  getActiveMachineCheckins,
  getEmployees,
  getMachines,
  updateMachine,
  type ApiEmployee,
  type ApiMachine,
  type ApiMachineCheckin,
} from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { TextAutocomplete, type TextAutocompleteOption } from "@/components/ui/text-autocomplete"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import { AlertTriangle, Eraser, Maximize2, Minimize2, Plus, RotateCcw, Settings2, X } from "lucide-react"
import { toast } from "sonner"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { filterFloorMachines } from "@/lib/machine-floor"
import {
  FLOOR_COLUMN_COUNT,
  FLOOR_MACHINE_CELL_MIN_HEIGHT,
  FLOOR_ROW_ORDER,
} from "@/lib/machine-floor-layout"
import {
  getProductSkus,
  recordProductSkuUsage,
  type ApiProductSku,
} from "@/lib/api"
import { SkuCodeInput, skuUnitsPerBox } from "@/components/sku/sku-code-input"
import { CreateSkuDialog } from "@/components/sku/create-sku-dialog"
import { normalizeSkuCode } from "@/lib/sku-catalog"
import { isFloorOperatorCandidate, isFloorPackerCandidate } from "@/lib/employee-production-role"
import { loadQuantityRules } from "@/lib/hook-sku-quantity-table"
import type { HookSkuQuantityRule } from "@/lib/hook-sku-generator"

function mapApiMachineToFrontend(m: ApiMachine): Machine & { onFloor: boolean } {
  const statusMap = { green: "active" as const, yellow: "waiting" as const, blue: "maintenance" as const, red: "inactive" as const }
  const label = m.code ?? m.name ?? ""
  const onFloor = m.floorRow != null && m.floorCol != null
  const position = {
    row: m.floorRow ?? 0,
    col: m.floorCol ?? 0,
  }
  return { id: m.id, name: label, status: statusMap[m.status], position, onFloor }
}

const MAX_PACKERS_PER_MACHINE = 4
const MAX_OPERATORS_PER_MACHINE = 2

function personAutocompleteOptions(
  names: string[],
  employeeRows: ApiEmployee[],
): TextAutocompleteOption[] {
  return names.map((name) => ({
    value: name,
    label: name,
    hint: employeeRows.find((e) => e.fullName === name)?.employeeCode ?? undefined,
  }))
}

function validateMachinePersonnelRoles(
  rows: MachineData[],
  employees: ApiEmployee[],
): string | null {
  const byName = new Map(employees.map((e) => [e.fullName, e]))
  for (const m of rows) {
    const checkOperator = (name?: string) => {
      if (!name?.trim()) return null
      const emp = byName.get(name)
      if (!emp) return `Máquina "${m.name}": no se encontró al empleado "${name}".`
      if (!isFloorOperatorCandidate(emp)) {
        return `Máquina "${m.name}": "${name}" no puede ser operador (debe ser operador de base o empacador con rol temporal Operador).`
      }
      return null
    }
    const checkPacker = (name?: string) => {
      if (!name?.trim()) return null
      const emp = byName.get(name)
      if (!emp) return `Máquina "${m.name}": no se encontró al empleado "${name}".`
      if (!isFloorPackerCandidate(emp)) {
        return `Máquina "${m.name}": "${name}" no puede ser empacador (empacador de base o operador con rol secundario Empaque).`
      }
      return null
    }
    for (const msg of [checkOperator(m.operator), checkOperator(m.operator2)]) {
      if (msg) return msg
    }
    for (const p of m.packers ?? []) {
      const msg = checkPacker(p)
      if (msg) return msg
    }
  }
  return null
}

/**
 * Estado visual de la máquina según el heartbeat del dispositivo:
 *  - Rojo ("inactive"): sin heartbeat en > 2 min (apagada o sin wifi).
 *  - Verde ("active"): encendida con SKU + operador + contador reseteado a 0 (counterReady).
 *  - Amarillo ("waiting"): encendida pero sin configuración completa (o falta resetear el contador).
 * El empacador no influye en el estado.
 */
function computeEffectiveStatus(
  sku: string | undefined,
  operator: string | undefined,
  offline?: boolean,
  inMaintenance?: boolean,
  counterReady?: boolean,
): Machine["status"] {
  if (offline) return "inactive"
  if (inMaintenance) return "maintenance"
  if (Boolean(sku) && Boolean(operator) && Boolean(counterReady)) return "active"
  return "waiting"
}

interface MachineData extends Machine {
  onFloor?: boolean
  machineCode?: string
  sku?: string
  unitsPerBox?: number
  operator?: string
  operator2?: string
  packers?: string[]
  production?: number
  /** Dispositivo sin heartbeat reciente (> 2 min): la máquina se considera apagada. */
  offline?: boolean
  /** Sesión de mantenimiento activa (estado azul). */
  inMaintenance?: boolean
  /** Amarilla SOLO porque el contador no se ha reseteado a 0 (ya tiene SKU + operador). */
  needsCounterReset?: boolean
  /** Motivo del amarillo (espeja el LED físico): fijo=sin operadora; parpadeo=falta SKU o reset. */
  waitingReason?: MachineWaitingReason
}

function machineNumberFromName(name: string): number {
  const match = name.match(/\d+/)
  return match ? Number(match[0]) : Number.POSITIVE_INFINITY
}

/** Cada cuánto se refresca el piso para detectar apagado (offline) en vivo y recuperación. */
const FLOOR_REFRESH_INTERVAL_MS = 30_000

/**
 * Mapea la respuesta del backend (máquinas + check-ins activos) al modelo de UI.
 * Resuelve el personal por nombre y deriva el estado efectivo, marcando como
 * apagada (rojo) cualquier máquina con `online === false` (sin heartbeat > 2 min).
 */
function buildMachineData(
  apiMachines: ApiMachine[],
  apiCheckins: ApiMachineCheckin[],
  employeeNameByCode: Map<string, string>,
): MachineData[] {
  const checkinByMachineId = new Map<string, ApiMachineCheckin>(
    apiCheckins.map((c) => [c.machineId, c]),
  )
  const resolve = (code: string | null | undefined) =>
    code ? employeeNameByCode.get(code) ?? code : undefined
  return filterFloorMachines(apiMachines).map((m) => {
    const base = mapApiMachineToFrontend(m)
    const c = checkinByMachineId.get(m.id)
    const sku = m.currentSku ?? undefined
    const operator = resolve(c?.operatorCode ?? m.operatorCode)
    const operator2 = resolve(c?.operator2Code ?? m.operator2Code)
    const packerCodes = [
      c?.packager1Code ?? m.packager1Code,
      c?.packager2Code ?? m.packager2Code,
      c?.packager3Code ?? m.packager3Code,
      c?.packager4Code ?? m.packager4Code,
    ].filter((v): v is string => Boolean(v))
    const packers = packerCodes.length
      ? packerCodes.map((code) => employeeNameByCode.get(code) ?? code)
      : undefined
    const offline = m.online === false
    const inMaintenance = m.inMaintenance === true
    return {
      ...base,
      status: computeEffectiveStatus(sku, operator, offline, inMaintenance, m.counterReady),
      machineCode: m.code ?? undefined,
      sku,
      unitsPerBox: m.unitsPerBox ?? undefined,
      operator,
      operator2,
      packers,
      offline,
      inMaintenance,
      // Amarilla solo por falta de reset: ya tiene SKU + operador y está en línea, sin mantenimiento.
      needsCounterReset:
        Boolean(sku) && Boolean(operator) && !offline && !inMaintenance && !m.counterReady,
      // Motivo del amarillo, en orden de resolución: operadora → SKU → reset del contador.
      waitingReason:
        offline || inMaintenance
          ? undefined
          : !operator
            ? ("sin_operadora" as const)
            : !sku
              ? ("sin_sku" as const)
              : !m.counterReady
                ? ("contador" as const)
                : undefined,
    }
  })
}

export default function ProductionFloorPage() {
  const { getAccessToken } = useAuth()
  const [employeeRows, setEmployeeRows] = useState<ApiEmployee[]>([])
  const employeeCodeByName = useMemo(() => {
    const map = new Map<string, string>()
    for (const e of employeeRows) {
      if (e.fullName && e.employeeCode) map.set(e.fullName, e.employeeCode)
    }
    return map
  }, [employeeRows])
  const operators = useMemo(
    () =>
      employeeRows
        .filter((e) => isFloorOperatorCandidate(e))
        .map((e) => e.fullName)
        .sort((a, b) => a.localeCompare(b, "es")),
    [employeeRows],
  )
  const packers = useMemo(
    () =>
      employeeRows
        .filter((e) => isFloorPackerCandidate(e))
        .map((e) => e.fullName)
        .sort((a, b) => a.localeCompare(b, "es")),
    [employeeRows],
  )

  const [machineData, setMachineData] = useState<MachineData[]>([])
  const [skuCatalog, setSkuCatalog] = useState<ApiProductSku[]>([])
  const [quantityRules, setQuantityRules] = useState<HookSkuQuantityRule[]>([])
  const [selectedMachineIds, setSelectedMachineIds] = useState<Set<string>>(() => new Set())
  const [bulkSku, setBulkSku] = useState("")
  const [rangeFrom, setRangeFrom] = useState("")
  const [rangeTo, setRangeTo] = useState("")
  const [createSkuOpen, setCreateSkuOpen] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Espejo de hasUnsavedChanges para los refrescos en segundo plano (evita stale closures).
  const hasUnsavedChangesRef = useRef(false)
  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges
  }, [hasUnsavedChanges])

  const loadAll = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent ?? false
      if (!silent) {
        setLoading(true)
        setError(null)
      }
      try {
        const token = await getAccessToken()
        if (!token) {
          if (!silent) setMachineData([])
          return
        }
        const [apiMachines, apiEmployees, apiCheckins, skus] = await Promise.all([
          getMachines(token),
          getEmployees(token),
          getActiveMachineCheckins(token),
          getProductSkus(token),
        ])
        // Un refresco en segundo plano no debe pisar ediciones locales sin guardar.
        if (silent && hasUnsavedChangesRef.current) return
        setSkuCatalog(skus)
        setQuantityRules(loadQuantityRules())
        setEmployeeRows(apiEmployees)

        const employeeNameByCode = new Map(
          apiEmployees
            .filter((e) => e.employeeCode)
            .map((e) => [String(e.employeeCode), e.fullName] as const),
        )
        setMachineData(buildMachineData(apiMachines, apiCheckins, employeeNameByCode))
      } catch (e) {
        if (!silent) {
          setError(e instanceof Error ? e.message : "Error al cargar máquinas")
          setMachineData([])
        }
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [getAccessToken],
  )

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // Refresco periódico: detecta apagado (offline → rojo) en vivo y la recuperación.
  // Se pausa mientras haya cambios sin guardar para no descartar ediciones locales.
  useEffect(() => {
    if (hasUnsavedChanges) return
    const id = window.setInterval(() => {
      void loadAll({ silent: true })
    }, FLOOR_REFRESH_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [loadAll, hasUnsavedChanges])

  // Refresco en vivo (SSE): al recibir una señal de cambio del backend, recarga (con
  // debounce). Ignora los pings de keep-alive. Si SSE falla, el polling de arriba es el
  // respaldo. Se pausa con cambios sin guardar para no descartar ediciones locales.
  useEffect(() => {
    if (hasUnsavedChanges) return
    const base = process.env.NEXT_PUBLIC_API_URL ?? ""
    if (!base) return
    let debounce: ReturnType<typeof setTimeout> | undefined
    const es = new EventSource(`${base}/live/stream`)
    es.onmessage = (ev) => {
      try {
        if (JSON.parse(ev.data)?.type === "ping") return
      } catch {
        /* payload no-JSON: tratar como señal de cambio */
      }
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => void loadAll({ silent: true }), 800)
    }
    es.onerror = () => {
      /* EventSource reintenta solo; el polling de 30 s queda como respaldo */
    }
    return () => {
      es.close()
      if (debounce) clearTimeout(debounce)
    }
  }, [loadAll, hasUnsavedChanges])

  const [selectedMachine, setSelectedMachine] = useState<MachineData | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isDiagramFullscreen, setIsDiagramFullscreen] = useState(false)
  const [focusedMachineId, setFocusedMachineId] = useState<string | null>(null)
  const [codeInput, setCodeInput] = useState("")
  const [operatorInput, setOperatorInput] = useState("")
  const [operator2Input, setOperator2Input] = useState("")
  const [packer1Input, setPacker1Input] = useState("")
  const [packer2Input, setPacker2Input] = useState("")
  const [packer3Input, setPacker3Input] = useState("")
  const [packer4Input, setPacker4Input] = useState("")
  const [dialogShowSecondOperator, setDialogShowSecondOperator] = useState(false)
  /** Filas de empacador visibles en el diálogo: 1 = solo emp.1; 2–4 = emp.2… visibles tras pulsar + */
  const [dialogVisiblePackerSlots, setDialogVisiblePackerSlots] = useState(1)
  /** Asignación rápida: panel extra (op.2 / emp.2–4) por máquina */
  const [quickAssignmentExpanded, setQuickAssignmentExpanded] = useState<Set<string>>(() => new Set())

  const machinesByColumn = useMemo(() => {
    const cols: MachineData[][] = Array.from({ length: FLOOR_COLUMN_COUNT }, () => [])
    for (const m of machineData) {
      const col = m.position.col
      if (col >= 0 && col < FLOOR_COLUMN_COUNT) {
        cols[col].push(m)
      }
    }
    return cols
  }, [machineData])

  const handleMachineClick = (machine: MachineData) => {
    if (isDiagramFullscreen) setIsDiagramFullscreen(false)
    setSelectedMachine(machine)
    setFocusedMachineId(machine.id)
    setCodeInput(machine.sku || "")
    setOperatorInput(machine.operator || "")
    setOperator2Input(machine.operator2 || "")
    setPacker1Input(machine.packers?.[0] || "")
    setPacker2Input(machine.packers?.[1] || "")
    setPacker3Input(machine.packers?.[2] || "")
    setPacker4Input(machine.packers?.[3] || "")
    setDialogShowSecondOperator(Boolean(machine.operator2))
    const nPack = machine.packers?.length ?? 0
    setDialogVisiblePackerSlots(Math.max(1, Math.min(MAX_PACKERS_PER_MACHINE, nPack || 1)))
    setIsDialogOpen(true)
  }

  const handleSave = () => {
    if (!selectedMachine) return

    const p1 = packer1Input.trim()
    const p2 = dialogVisiblePackerSlots >= 2 ? packer2Input.trim() : ""
    const p3 = dialogVisiblePackerSlots >= 3 ? packer3Input.trim() : ""
    const p4 = dialogVisiblePackerSlots >= 4 ? packer4Input.trim() : ""

    if (operator2Input.trim() && operator2Input.trim() === operatorInput.trim()) {
      setError("El segundo operador debe ser distinto del primero.")
      return
    }
    if (p3 && !p2) {
      setError("Asigna el empacador 2 antes del 3.")
      return
    }
    if (p4 && !p3) {
      setError("Asigna el empacador 3 antes del 4.")
      return
    }

    const nextPackers = [p1, p2, p3, p4].filter(Boolean)
    if (nextPackers.length > MAX_PACKERS_PER_MACHINE) {
      setError(`Máximo ${MAX_PACKERS_PER_MACHINE} empacadores por máquina.`)
      return
    }
    if (new Set(nextPackers).size !== nextPackers.length) {
      setError("Los empacadores deben ser distintos entre sí.")
      return
    }

    const roleError = validateMachinePersonnelRoles(
      [
        {
          ...selectedMachine,
          operator: operatorInput || undefined,
          operator2: dialogShowSecondOperator ? operator2Input.trim() || undefined : undefined,
          packers: nextPackers.length ? nextPackers : undefined,
        },
      ],
      employeeRows,
    )
    if (roleError) {
      setError(roleError)
      toast.error(roleError)
      return
    }

    setError(null)
    setMachineData((prev) =>
      prev.map((m) =>
        m.id === selectedMachine.id
          ? {
              ...m,
              sku: codeInput ? normalizeSkuCode(codeInput) : undefined,
              unitsPerBox: codeInput
                ? skuUnitsPerBox(skuCatalog, normalizeSkuCode(codeInput))
                : undefined,
              operator: operatorInput || undefined,
              operator2: dialogShowSecondOperator ? operator2Input.trim() || undefined : undefined,
              packers: nextPackers.length ? nextPackers : undefined,
              status: computeEffectiveStatus(
                codeInput || undefined,
                operatorInput || undefined,
                m.offline,
              ),
            }
          : m,
      ),
    )
    setHasUnsavedChanges(true)
    setIsDialogOpen(false)
    setSelectedMachine(null)
    setCodeInput("")
    setOperatorInput("")
    setOperator2Input("")
    setPacker1Input("")
    setPacker2Input("")
    setPacker3Input("")
    setPacker4Input("")
    setDialogShowSecondOperator(false)
    setDialogVisiblePackerSlots(1)
  }

  /** Borra solo una columna (SKU / operadores / empacadores) en todas las máquinas del piso. */
  const clearColumnOnAllMachines = (column: "sku" | "operators" | "packers") => {
    setMachineData((prev) =>
      prev.map((m) => {
        if (column === "sku") {
          return {
            ...m,
            sku: undefined,
            unitsPerBox: undefined,
            status: computeEffectiveStatus(undefined, m.operator, m.offline),
          }
        }
        if (column === "operators") {
          return {
            ...m,
            operator: undefined,
            operator2: undefined,
            status: computeEffectiveStatus(m.sku, undefined, m.offline),
          }
        }
        return { ...m, packers: undefined }
      }),
    )
    setHasUnsavedChanges(true)
    const messages = {
      sku: "SKU borrado en todas las máquinas. Guarda para aplicar.",
      operators: "Operadores borrados en todas las máquinas. Guarda para aplicar.",
      packers: "Empacadores borrados en todas las máquinas. Guarda para aplicar.",
    } as const
    toast.success(messages[column])
  }

  const handleReset = () => {
    // Optimistic UI: limpia localmente de inmediato
    setMachineData((prev) =>
      prev.map((m) => ({
        ...m,
        sku: undefined,
        unitsPerBox: undefined,
        operator: undefined,
        operator2: undefined,
        packers: undefined,
        status: "inactive" as const,
      })),
    )
    setHasUnsavedChanges(false)

    // Cierra check-ins, limpia SKU/personal en BD y recarga
    ;(async () => {
      const token = await getAccessToken()
      if (!token) {
        toast.error("Sesión inválida. Vuelve a iniciar sesión.")
        return
      }
      try {
        const apiMachines = await getMachines(token)
        const floorMachines = filterFloorMachines(apiMachines)
        const { closed } = await closeAllMachineCheckins(token)
        await Promise.all(
          floorMachines.map((m) =>
            updateMachine(token, m.id, {
              status: "idle",
              currentSku: null,
              operatorCode: null,
              operator2Code: null,
              packager1Code: null,
              packager2Code: null,
              packager3Code: null,
              packager4Code: null,
            }),
          ),
        )
        toast.success(
          `Roster cerrado: ${closed} check-in${closed !== 1 ? "s" : ""} (ops/empacadores). ` +
            `El cierre automático nocturno es a la 01:00; evita cerrar cerca de las 16:00/23:30.`,
        )

        const [freshMachines, apiEmployees, apiCheckins] = await Promise.all([
          getMachines(token),
          getEmployees(token),
          getActiveMachineCheckins(token),
        ])
        setEmployeeRows(apiEmployees)
        const employeeNameByCode = new Map(
          apiEmployees
            .filter((e) => e.employeeCode)
            .map((e) => [String(e.employeeCode), e.fullName] as const),
        )
        setMachineData(buildMachineData(freshMachines, apiCheckins, employeeNameByCode))
      } catch {
        toast.error("No se pudo cerrar el turno en el servidor.")
      }
    })()
  }

  const handleQuickUpdate = (machineId: string, patch: Partial<MachineData>) => {
    setMachineData((prev) =>
      prev.map((m) => {
        if (m.id !== machineId) return m
        const next = { ...m, ...patch }
        if (patch.sku !== undefined) {
          const sku = patch.sku ? normalizeSkuCode(patch.sku) : undefined
          next.sku = sku
          next.unitsPerBox = sku ? skuUnitsPerBox(skuCatalog, sku) : undefined
        }
        return {
          ...next,
          status: computeEffectiveStatus(next.sku, next.operator, next.offline),
        }
      }),
    )
    setHasUnsavedChanges(true)
  }

  const toggleQuickAssignmentExpanded = (machineId: string) => {
    setQuickAssignmentExpanded((prev) => {
      const n = new Set(prev)
      if (n.has(machineId)) n.delete(machineId)
      else n.add(machineId)
      return n
    })
  }

  const quickAssignmentExtraCount = (m: MachineData) => {
    let c = 0
    if (m.operator2) c += 1
    c += Math.max(0, (m.packers?.length ?? 0) - 1)
    return c
  }

  const applyAndSaveAssignments = () => {
    setError(null)
    const roleError = validateMachinePersonnelRoles(machineData, employeeRows)
    if (roleError) {
      setError(roleError)
      toast.error(roleError)
      return
    }
    // Solo operadores: únicos en toda la planta. Empacadores pueden repetirse entre máquinas.
    const normalize = (v?: string) => (v ?? "").trim()
    const usedOperatorsByMachine = new Map<string, string>() // operatorName -> machineName
    for (const m of machineData) {
      const machineName = m.name
      const operatorNames = [normalize(m.operator), normalize(m.operator2)].filter(Boolean)
      const packerNames = (m.packers ?? []).map(normalize).filter(Boolean)
      const allOnMachine = [...operatorNames, ...packerNames]

      if (new Set(allOnMachine).size !== allOnMachine.length) {
        setError(`El empleado está duplicado dentro de la máquina "${machineName}".`)
        toast.error("No se pudo guardar: empleado duplicado.")
        return
      }

      for (const c of operatorNames) {
        const prev = usedOperatorsByMachine.get(c)
        if (prev && prev !== machineName) {
          setError(
            `El operador "${c}" ya está asignado en "${prev}". Un operador no puede estar en dos máquinas a la vez.`,
          )
          toast.error("No se pudo guardar: operador repetido.")
          return
        }
        usedOperatorsByMachine.set(c, machineName)
      }
    }

    ;(async () => {
      const token = await getAccessToken()
      if (!token) {
        toast.error("Sesión inválida. Vuelve a iniciar sesión.")
        return
      }

      // Persistir a backend (machines.currentSku + c?digos). UI usa nombres, aqu? convertimos a employeeCode.
      const items = machineData.map((m) => {
        const operatorCode = m.operator ? employeeCodeByName.get(m.operator) ?? null : null
        const operator2Code = m.operator2 ? employeeCodeByName.get(m.operator2) ?? null : null
        const packer1Code = m.packers?.[0] ? employeeCodeByName.get(m.packers[0]) ?? null : null
        const packer2Code = m.packers?.[1] ? employeeCodeByName.get(m.packers[1]) ?? null : null
        const packer3Code = m.packers?.[2] ? employeeCodeByName.get(m.packers[2]) ?? null : null
        const packer4Code = m.packers?.[3] ? employeeCodeByName.get(m.packers[3]) ?? null : null
        // El backend deriva el status (verde/amarillo) desde SKU + operador.
        const payload = {
          currentSku: m.sku ? normalizeSkuCode(m.sku) : null,
          unitsPerBox: m.unitsPerBox,
          operatorCode,
          operator2Code,
          packager1Code: packer1Code,
          packager2Code: packer2Code,
          packager3Code: packer3Code,
          packager4Code: packer4Code,
        } as const
        return { machineId: m.id, machineName: m.name, payload }
      })

      try {
        // Primera pasada: todas las máquinas en paralelo (rápido en el caso normal, sin conflictos).
        const firstPass = await Promise.allSettled(
          items.map((it) => updateMachine(token, it.machineId, it.payload)),
        )

        // Si mueves a un operador de una máquina a otra en el MISMO guardado, dos PATCH
        // concurrentes pueden pisarse: la validación de "operador ya asignado" de la máquina
        // destino corre antes de que el check-out de la máquina origen termine de comitearse
        // en la BD, y rechaza algo que en realidad es válido (bug reportado: banner rojo de
        // error aunque el cambio sí terminaba aplicándose). Reintento SECUENCIAL, una sola vez,
        // solo de las que fallaron, después de que TODAS las demás ya asentaron — para entonces
        // cualquier carrera transitoria ya se resolvió. Si el conflicto es real, el reintento
        // también falla y sí se reporta.
        const results: Array<{ machineId: string; machineName: string; payload: any; saved: ApiMachine }> = []
        const failures: Array<{ machineName: string; reason: unknown }> = []
        for (let i = 0; i < items.length; i++) {
          const r = firstPass[i]
          if (r.status === "fulfilled") {
            results.push({ ...items[i], saved: r.value })
            continue
          }
          try {
            const saved = await updateMachine(token, items[i].machineId, items[i].payload)
            results.push({ ...items[i], saved })
          } catch (retryErr) {
            failures.push({ machineName: items[i].machineName, reason: retryErr })
          }
        }

        if (failures.length > 0) {
          const first = failures[0]
          const reason = first.reason as { message?: unknown } | undefined
          toast.error("No se pudo guardar en el backend.")
          setError(
            typeof reason?.message === "string" ? reason.message : "Error al guardar en el backend.",
          )
          setHasUnsavedChanges(true)
          return
        }

        // No mostrar "guardado" si el backend regres? valores distintos a lo enviado.
        const mismatches: Array<{ name: string; field: string; expected: string | null; got: string | null }> = []
        for (const r of results) {
          const expectedSku = r.payload.currentSku ?? null
          const gotSku = r.saved.currentSku ?? null
          if (expectedSku !== gotSku) {
            mismatches.push({ name: r.machineName, field: "currentSku", expected: expectedSku, got: gotSku })
          }

          const expectedOp = r.payload.operatorCode ?? null
          const gotOp = r.saved.operatorCode ?? null
          if (expectedOp !== gotOp) {
            mismatches.push({ name: r.machineName, field: "operatorCode", expected: expectedOp, got: gotOp })
          }

          const expectedOp2 = r.payload.operator2Code ?? null
          const gotOp2 = r.saved.operator2Code ?? null
          if (expectedOp2 !== gotOp2) {
            mismatches.push({ name: r.machineName, field: "operator2Code", expected: expectedOp2, got: gotOp2 })
          }

          const expectedP1 = r.payload.packager1Code ?? null
          const gotP1 = r.saved.packager1Code ?? null
          if (expectedP1 !== gotP1) {
            mismatches.push({ name: r.machineName, field: "packager1Code", expected: expectedP1, got: gotP1 })
          }

          const expectedP2 = r.payload.packager2Code ?? null
          const gotP2 = r.saved.packager2Code ?? null
          if (expectedP2 !== gotP2) {
            mismatches.push({ name: r.machineName, field: "packager2Code", expected: expectedP2, got: gotP2 })
          }

          const expectedP3 = r.payload.packager3Code ?? null
          const gotP3 = r.saved.packager3Code ?? null
          if (expectedP3 !== gotP3) {
            mismatches.push({ name: r.machineName, field: "packager3Code", expected: expectedP3, got: gotP3 })
          }

          const expectedP4 = r.payload.packager4Code ?? null
          const gotP4 = r.saved.packager4Code ?? null
          if (expectedP4 !== gotP4) {
            mismatches.push({ name: r.machineName, field: "packager4Code", expected: expectedP4, got: gotP4 })
          }
        }

        if (mismatches.length > 0) {
          const first = mismatches[0]
          toast.error("No se guard? en la base de datos. Cambios no persistidos.")
          setError(
            `El backend no persisti? los cambios. Ejemplo: "${first.name}" ${first.field} esperado=${String(first.expected)} recibido=${String(first.got)}.`,
          )
          setHasUnsavedChanges(true)
          return
        }

        // Fuente de verdad: recargar desde backend para evitar discrepancias locales.
        const [apiMachines, apiCheckins] = await Promise.all([
          getMachines(token),
          getActiveMachineCheckins(token),
        ])

        const employeeNameByCode = new Map(
          employeeRows
            .filter((e) => e.employeeCode)
            .map((e) => [String(e.employeeCode), e.fullName] as const),
        )
        setMachineData(buildMachineData(apiMachines, apiCheckins, employeeNameByCode))
        setHasUnsavedChanges(false)
        toast.success("Asignaciones guardadas.")

        const usedSkus = new Set(
          results
            .map((r) => r.payload.currentSku)
            .filter((s): s is string => Boolean(s)),
        )
        for (const code of usedSkus) {
          if (skuCatalog.some((s) => normalizeSkuCode(s.code) === normalizeSkuCode(code))) {
            await recordProductSkuUsage(token, code).catch(() => undefined)
          }
        }
      } catch (e) {
        toast.error("No se pudo guardar en el backend.")
        setHasUnsavedChanges(true)
      }
    })()
  }

  const selectedOperatorsByMachine = useMemo(() => {
    const map = new Map<string, string>() // operatorName -> machineId
    for (const m of machineData) {
      if (m.operator) map.set(m.operator, m.id)
      if (m.operator2) map.set(m.operator2, m.id)
    }
    return map
  }, [machineData])

  const getAvailableOperators = (all: string[], machineId: string, current?: string) => {
    const available = all.filter((name) => {
      const usedBy = selectedOperatorsByMachine.get(name)
      return !usedBy || usedBy === machineId || name === current
    })
    if (current && current.trim() && !available.includes(current)) {
      return [current, ...available]
    }
    return available
  }

  const getAvailablePackers = (
    all: string[],
    current?: string,
    otherSlotsOnMachine: string[] = [],
  ) => {
    const blocked = new Set(otherSlotsOnMachine.map((n) => n.trim()).filter(Boolean))
    if (current?.trim()) blocked.delete(current.trim())
    const available = all.filter((name) => !blocked.has(name) || name === current)
    if (current && current.trim() && !available.includes(current)) {
      return [current, ...available]
    }
    return available
  }

  // Stats
  const activeCount = machineData.filter(m => m.status === "active").length
  const waitingCount = machineData.filter(m => m.status === "waiting").length
  const waitingNoOperatorCount = machineData.filter(m => m.waitingReason === "sin_operadora").length
  const waitingNoSkuCount = machineData.filter(m => m.waitingReason === "sin_sku").length
  const waitingCounterCount = machineData.filter(m => m.waitingReason === "contador").length
  const inactiveCount = machineData.filter(m => m.status === "inactive").length
  const maintenanceCount = machineData.filter(m => m.status === "maintenance").length
  const assignedCount = machineData.filter(m => m.sku).length
  // Como el hueco central de la tira física: en producción (verde/amarillo) sin empacadora.
  const machineHasPackerGap = (m: MachineData) =>
    (m.status === "active" || m.status === "waiting") && !m.packers?.length
  const noPackerCount = machineData.filter(machineHasPackerGap).length

  const sortedMachines = useMemo(() => {
    const byNumericName = (value: string) => {
      const match = value.match(/\d+/)
      return match ? Number(match[0]) : Number.POSITIVE_INFINITY
    }
    return [...machineData].sort((a, b) => byNumericName(a.name) - byNumericName(b.name))
  }, [machineData])

  const toggleMachineSelected = (machineId: string, checked: boolean) => {
    setSelectedMachineIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(machineId)
      else next.delete(machineId)
      return next
    })
  }

  const toggleAllMachinesSelected = (checked: boolean) => {
    setSelectedMachineIds(
      checked ? new Set(sortedMachines.map((m) => m.id)) : new Set(),
    )
  }

  const applyRangeFromInputs = useCallback(() => {
    const from = Number(rangeFrom)
    const to = Number(rangeTo)
    if (!rangeFrom.trim() || !rangeTo.trim()) return
    if (!Number.isFinite(from) || !Number.isFinite(to)) return
    const min = Math.min(from, to)
    const max = Math.max(from, to)
    const ids = sortedMachines
      .filter((m) => {
        const n = machineNumberFromName(m.name)
        return n >= min && n <= max
      })
      .map((m) => m.id)
    setSelectedMachineIds(new Set(ids))
  }, [rangeFrom, rangeTo, sortedMachines])

  useEffect(() => {
    applyRangeFromInputs()
  }, [applyRangeFromInputs])

  const applyBulkSku = () => {
    const sku = normalizeSkuCode(bulkSku)
    if (!sku) {
      toast.error("Indica un SKU para aplicar.")
      return
    }
    if (selectedMachineIds.size === 0) {
      toast.error("Selecciona al menos una máquina.")
      return
    }
    const upb = skuUnitsPerBox(skuCatalog, sku)
    setMachineData((prev) =>
      prev.map((m) =>
        selectedMachineIds.has(m.id)
          ? {
              ...m,
              sku,
              unitsPerBox: upb,
              status: computeEffectiveStatus(sku, m.operator, m.offline),
            }
          : m,
      ),
    )
    setHasUnsavedChanges(true)
    toast.success(`SKU "${sku}" aplicado a ${selectedMachineIds.size} máquina(s).`)
  }

  const renderDiagram = (viewportClassName: string) => {
    return (
      <div className={cn("overflow-auto", viewportClassName)}>
        <div className="mx-auto flex min-h-full min-w-[900px] items-start justify-center gap-10 pt-2">
          {machinesByColumn.map((column, colIndex) => (
            <div key={colIndex} className="flex flex-col gap-1">
              {FLOOR_ROW_ORDER.map((row) => {
                const machine = column.find((m) => m.position.row === row)
                if (!machine) {
                  return (
                    <div
                      key={`empty-${colIndex}-${row}`}
                      className="w-36 shrink-0"
                      style={{ minHeight: FLOOR_MACHINE_CELL_MIN_HEIGHT }}
                      aria-hidden
                    />
                  )
                }
                return (
                  <MachineCard
                    key={machine.id}
                    name={machine.name}
                    status={machine.status}
                    code={machine.sku}
                    operator={machine.operator}
                    packer={
                      machine.packers?.length
                        ? machine.packers.length === 1
                          ? machine.packers[0]
                          : `${machine.packers[0]} (+${machine.packers.length - 1})`
                        : undefined
                    }
                    production={machine.production}
                    waitingReason={machine.waitingReason}
                    onClick={() => handleMachineClick(machine)}
                    isSelected={focusedMachineId === machine.id}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <DashboardLayout 
      breadcrumbs={[
        { label: "Inicio", href: "/" },
        { label: "Piso de producción" }
      ]}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Piso de Producción</h1>
            <p className="text-muted-foreground">
              Vista general de las máquinas y su estado actual de operación.
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
            {error}
          </div>
        )}
        {loading && (
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-muted-foreground">
            Cargando máquinas
          </div>
        )}

        {/* Stats Cards — todos los casos posibles, con el mismo foquito del diagrama */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">Total Máquinas</p>
            <p className="mt-1 text-2xl font-bold text-card-foreground">{machineData.length}</p>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
              En el diagrama de planta
            </p>
          </div>
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="flex items-center gap-1.5">
              <MachineStatusDot status="active" />
              <p className="text-xs font-medium uppercase text-green-600">Activas</p>
            </div>
            <p className="mt-1 text-2xl font-bold text-green-700">{activeCount}</p>
            <p className="mt-1 text-[11px] leading-snug text-green-700/80">
              SKU + operadora + contador en 0
            </p>
          </div>
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
            <div className="flex items-center gap-1.5">
              <MachineStatusDot status="waiting" />
              <p className="text-xs font-medium uppercase text-yellow-600">Esperando</p>
            </div>
            <p className="mt-1 text-2xl font-bold text-yellow-700">{waitingCount}</p>
            <div className="mt-1 space-y-1 text-[11px] leading-snug text-yellow-800">
              <p className="flex items-center gap-1.5">
                <MachineStatusDot status="waiting" className="h-2 w-2" />
                <span>Sin operadora · <b>{waitingNoOperatorCount}</b></span>
              </p>
              <p className="flex items-center gap-1.5">
                <MachineStatusDot status="waiting" blinking className="h-2 w-2" />
                <span>Falta SKU · <b>{waitingNoSkuCount}</b></span>
              </p>
              <p className="flex items-center gap-1.5">
                <MachineStatusDot status="waiting" blinking className="h-2 w-2" />
                <span>Contador ≠ 0 · <b>{waitingCounterCount}</b></span>
              </p>
            </div>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="flex items-center gap-1.5">
              <MachineStatusDot status="inactive" />
              <p className="text-xs font-medium uppercase text-red-600">Apagadas</p>
            </div>
            <p className="mt-1 text-2xl font-bold text-red-700">{inactiveCount}</p>
            <p className="mt-1 text-[11px] leading-snug text-red-700/80">
              Sin señal del equipo (&gt;2 min)
            </p>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="flex items-center gap-1.5">
              <MachineStatusDot status="maintenance" />
              <p className="text-xs font-medium uppercase text-blue-600">Mantenimiento</p>
            </div>
            <p className="mt-1 text-2xl font-bold text-blue-700">{maintenanceCount}</p>
            <p className="mt-1 text-[11px] leading-snug text-blue-700/80">
              Sesión de mantenimiento activa
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-1.5">
              <MachineStatusDot status="active" packerGap />
              <MachineStatusDot status="waiting" packerGap />
              <p className="text-xs font-medium uppercase text-muted-foreground">Sin empacadora</p>
            </div>
            <p className="mt-1 text-2xl font-bold text-card-foreground">{noPackerCount}</p>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
              Centro apagado: produce (verde o amarilla) sin empacadora marcada
            </p>
          </div>
        </div>

        {/* Plant Diagram */}
        <div className="rounded-xl border border-border bg-card p-8">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-card-foreground">Diagrama de la Planta</h2>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {assignedCount} de {machineData.length} con SKU asignado
              </span>
              <Button
                variant={hasUnsavedChanges ? "default" : "outline"}
                size="sm"
                onClick={applyAndSaveAssignments}
                disabled={!hasUnsavedChanges}
              >
                Guardar cambios
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="bg-transparent"
                onClick={() => setIsDiagramFullscreen(true)}
              >
                <Maximize2 className="mr-2 h-4 w-4" />
                Pantalla completa
              </Button>
            </div>
          </div>

          {renderDiagram("h-[610px] pt-1")}

          {/* Legend — mismos foquitos que el diagrama, un caso por elemento */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 border-t border-border pt-6">
            <div className="flex items-center gap-2">
              <MachineStatusDot status="active" className="h-3.5 w-3.5" />
              <span className="text-sm text-muted-foreground">Activa ({activeCount})</span>
            </div>
            <div className="flex items-center gap-2">
              <MachineStatusDot status="waiting" className="h-3.5 w-3.5" />
              <span className="text-sm text-muted-foreground">
                Sin operadora ({waitingNoOperatorCount})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <MachineStatusDot status="waiting" blinking className="h-3.5 w-3.5" />
              <span className="text-sm text-muted-foreground">
                <span className="font-medium text-yellow-700">Parpadea:</span> falta SKU (
                {waitingNoSkuCount}) o contador ≠ 0 ({waitingCounterCount})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <MachineStatusDot status="inactive" className="h-3.5 w-3.5" />
              <span className="text-sm text-muted-foreground">
                Apagada / sin señal ({inactiveCount})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <MachineStatusDot status="maintenance" className="h-3.5 w-3.5" />
              <span className="text-sm text-muted-foreground">
                Mantenimiento ({maintenanceCount})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1">
                <MachineStatusDot status="active" packerGap className="h-3.5 w-3.5" centerClassName="h-1.5 w-1.5" />
                <MachineStatusDot status="waiting" packerGap className="h-3.5 w-3.5" centerClassName="h-1.5 w-1.5" />
              </span>
              <span className="text-sm text-muted-foreground">
                Centro apagado = sin empacadora ({noPackerCount})
              </span>
            </div>
          </div>
        </div>

        {/* Quick Assignment */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex flex-wrap items-center gap-3 px-2 sm:px-4">
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    className="h-9 w-9 bg-sky-600 text-white hover:bg-sky-700"
                    onClick={() => setCreateSkuOpen(true)}
                    aria-label="Nuevo SKU"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[16rem]">
                  Crear un SKU nuevo en el catálogo.
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-9 w-9 border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                    onClick={handleReset}
                    aria-label="Reset"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[16rem]">
                  Reinicia el turno: cierra check-ins y borra SKU, operadores y empacadores de todas
                  las máquinas.
                </TooltipContent>
              </Tooltip>
              {hasUnsavedChanges ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" className="h-9" onClick={applyAndSaveAssignments}>
                      Guardar
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[16rem]">
                    Guarda en el servidor las asignaciones editadas en la carga rápida.
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/25 px-3 py-1">
              <Input
                className="h-9 w-20 text-center tabular-nums"
                type="number"
                min={1}
                value={rangeFrom}
                onChange={(e) => setRangeFrom(e.target.value)}
                placeholder="1"
                aria-label="Desde"
              />
              <span className="text-muted-foreground select-none px-0.5">—</span>
              <Input
                className="h-9 w-20 text-center tabular-nums"
                type="number"
                min={1}
                value={rangeTo}
                onChange={(e) => setRangeTo(e.target.value)}
                placeholder="20"
                aria-label="Hasta"
              />
            </div>
            <SkuCodeInput
              value={bulkSku}
              onValueChange={setBulkSku}
              catalog={skuCatalog}
              placeholder="SKU"
              className="h-9 min-w-40 flex-1 sm:max-w-xs"
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 bg-emerald-600 text-white hover:bg-emerald-700"
                    onClick={applyBulkSku}
                    disabled={selectedMachineIds.size === 0 || !bulkSku.trim()}
                  >
                    Aplicar
                    {selectedMachineIds.size > 0 ? (
                      <span className="ml-1 rounded-full bg-white/25 px-1.5 text-xs font-semibold">
                        {selectedMachineIds.size}
                      </span>
                    ) : null}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[16rem]">
                Asigna el SKU escrito a las máquinas seleccionadas (rango o casillas). No toca
                operadores ni empacadores.
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  className="h-9 bg-green-600 text-white hover:bg-green-700"
                  onClick={() => toggleAllMachinesSelected(true)}
                >
                  Todas
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[16rem]">
                Marca todas las máquinas de la lista para poder aplicar el SKU masivo.
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 border-red-300 text-red-700 hover:bg-red-50"
                  onClick={() => toggleAllMachinesSelected(false)}
                >
                  Limpiar
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[16rem]">
                Quita la selección de máquinas. No borra SKU ni personal ya asignado.
              </TooltipContent>
            </Tooltip>
            <div className="flex items-center gap-1.5 border-l border-border pl-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9"
                    onClick={() => clearColumnOnAllMachines("sku")}
                  >
                    <Eraser className="mr-1.5 h-3.5 w-3.5" />
                    SKU
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[16rem]">
                  Borra solo el SKU de todas las máquinas. Conserva operadores y empacadores.
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9"
                    onClick={() => clearColumnOnAllMachines("operators")}
                  >
                    <Eraser className="mr-1.5 h-3.5 w-3.5" />
                    Op.
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[16rem]">
                  Borra solo operadores (1 y 2) de todas las máquinas. Conserva SKU y empacadores.
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9"
                    onClick={() => clearColumnOnAllMachines("packers")}
                  >
                    <Eraser className="mr-1.5 h-3.5 w-3.5" />
                    Emp.
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[16rem]">
                  Borra solo empacadores de todas las máquinas. Conserva SKU y operadores.
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={
                      sortedMachines.length > 0 &&
                      selectedMachineIds.size === sortedMachines.length
                    }
                    onCheckedChange={(v) => toggleAllMachinesSelected(v === true)}
                    aria-label="Seleccionar todas"
                  />
                </TableHead>
                <TableHead>Máq.</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Op.</TableHead>
                <TableHead>Emp.</TableHead>
                <TableHead className="w-16">+</TableHead>
                <TableHead className="w-14 text-center text-xs" aria-label="Estado">
                  Estado
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedMachines.map((m) => {
                const ok = Boolean(m.sku) && Boolean(m.operator) && Boolean(m.packers?.[0])
                return (
                  <TableRow
                    key={m.id}
                    onClick={() => setFocusedMachineId(m.id)}
                    data-state={focusedMachineId === m.id ? "selected" : undefined}
                    className={cn(!ok && "bg-amber-50/40")}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedMachineIds.has(m.id)}
                        onCheckedChange={(v) => toggleMachineSelected(m.id, v === true)}
                        aria-label={`Seleccionar ${m.name}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <SkuCodeInput
                        value={m.sku ?? ""}
                        onValueChange={(sku) => handleQuickUpdate(m.id, { sku })}
                        catalog={skuCatalog}
                        placeholder="SKU"
                        className="w-44"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <TextAutocomplete
                          value={m.operator ?? ""}
                          onValueChange={(v) => {
                            const patch: Partial<MachineData> = { operator: v || undefined }
                            if (v && m.operator2 === v) patch.operator2 = undefined
                            handleQuickUpdate(m.id, patch)
                          }}
                          options={personAutocompleteOptions(
                            getAvailableOperators(operators, m.id, m.operator),
                            employeeRows,
                          )}
                          placeholder="Op."
                          className="w-52 min-w-0"
                          inputClassName="h-9"
                        />
                        {m.operator ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleQuickUpdate(m.id, { operator: undefined, operator2: undefined })
                            }}
                            title="Deseleccionar operador 1 (y 2)"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <TextAutocomplete
                          value={m.packers?.[0] ?? ""}
                          onValueChange={(v) => {
                            setError(null)
                            if (!v) {
                              handleQuickUpdate(m.id, { packers: undefined })
                              return
                            }
                            const tail = [m.packers?.[1], m.packers?.[2], m.packers?.[3]].filter(
                              Boolean,
                            ) as string[]
                            const deduped = tail.filter((t) => t !== v)
                            const next = [v, ...deduped].slice(0, MAX_PACKERS_PER_MACHINE)
                            handleQuickUpdate(m.id, { packers: next })
                          }}
                          options={personAutocompleteOptions(
                            getAvailablePackers(
                              packers,
                              m.packers?.[0],
                              (m.packers ?? []).filter((_, i) => i !== 0),
                            ),
                            employeeRows,
                          )}
                          placeholder="Emp."
                          className="w-52 min-w-0"
                          inputClassName="h-9"
                        />
                        {m.packers?.[0] ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleQuickUpdate(m.id, { packers: undefined })
                            }}
                            title="Deseleccionar empacadores"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell
                      className="align-top"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {quickAssignmentExpanded.has(m.id) ? (
                        <div className="flex min-w-52 flex-col gap-3 py-1">
                          <div className="space-y-1.5">
                            <p className="sr-only">Operador 2</p>
                            <div className="flex items-center gap-2">
                              <TextAutocomplete
                                value={m.operator2 ?? ""}
                                onValueChange={(v) => {
                                  if (v && v === m.operator) {
                                    setError("El operador 2 debe ser distinto del operador 1.")
                                    return
                                  }
                                  setError(null)
                                  handleQuickUpdate(m.id, { operator2: v || undefined })
                                }}
                                options={personAutocompleteOptions(
                                  getAvailableOperators(operators, m.id, m.operator2).filter(
                                    (name) => name !== m.operator,
                                  ),
                                  employeeRows,
                                )}
                                placeholder="Op.2"
                                className="w-full min-w-0"
                                inputClassName="h-9"
                              />
                              {m.operator2 ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9 shrink-0"
                                  onClick={() => handleQuickUpdate(m.id, { operator2: undefined })}
                                  title="Quitar operador 2"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              ) : null}
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <p className="sr-only">Empacador 2</p>
                            <div className="flex items-center gap-2">
                              <TextAutocomplete
                                value={m.packers?.[1] ?? ""}
                                onValueChange={(v) => {
                                  const first = m.packers?.[0]
                                  if (!first) {
                                    setError("Primero asigna el empacador 1.")
                                    return
                                  }
                                  if (v && v === first) {
                                    setError("Empacador 2 debe ser distinto al empacador 1.")
                                    return
                                  }
                                  setError(null)
                                  if (!v) {
                                    handleQuickUpdate(m.id, {
                                      packers: m.packers?.[0] ? [m.packers[0]] : undefined,
                                    })
                                    return
                                  }
                                  const next = [first, v, m.packers?.[2], m.packers?.[3]].filter(
                                    Boolean,
                                  ) as string[]
                                  handleQuickUpdate(m.id, { packers: next })
                                }}
                                options={personAutocompleteOptions(
                                  getAvailablePackers(
                                    packers,
                                    m.packers?.[1],
                                    (m.packers ?? []).filter((_, i) => i !== 1),
                                  ),
                                  employeeRows,
                                )}
                                placeholder="Emp.2"
                                className="w-full min-w-0"
                                inputClassName="h-9"
                              />
                              {m.packers?.[1] ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9 shrink-0"
                                  onClick={() =>
                                    handleQuickUpdate(m.id, {
                                      packers: m.packers?.[0] ? [m.packers[0]] : undefined,
                                    })
                                  }
                                  title="Quitar empacador 2 y siguientes"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              ) : null}
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <p className="sr-only">Empacador 3</p>
                            <div className="flex items-center gap-2">
                              <TextAutocomplete
                                value={m.packers?.[2] ?? ""}
                                onValueChange={(v) => {
                                  const a = m.packers?.[0]
                                  const b = m.packers?.[1]
                                  if (v && (!a || !b)) {
                                    setError("Primero asigna los empacadores 1 y 2.")
                                    return
                                  }
                                  if (v && (v === a || v === b)) {
                                    setError("Debe ser distinto a los empacadores anteriores.")
                                    return
                                  }
                                  setError(null)
                                  if (!v) {
                                    handleQuickUpdate(m.id, {
                                      packers: a && b ? [a, b] : a ? [a] : undefined,
                                    })
                                    return
                                  }
                                  const next = [a!, b!, v, m.packers?.[3]].filter(Boolean) as string[]
                                  handleQuickUpdate(m.id, { packers: next })
                                }}
                                options={personAutocompleteOptions(
                                  getAvailablePackers(
                                    packers,
                                    m.packers?.[2],
                                    (m.packers ?? []).filter((_, i) => i !== 2),
                                  ),
                                  employeeRows,
                                )}
                                placeholder="Emp.3"
                                className="w-full min-w-0"
                                inputClassName="h-9"
                              />
                              {m.packers?.[2] ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9 shrink-0"
                                  onClick={() => {
                                    const a = m.packers?.[0]
                                    const b = m.packers?.[1]
                                    handleQuickUpdate(m.id, {
                                      packers: a && b ? [a, b] : a ? [a] : undefined,
                                    })
                                  }}
                                  title="Quitar empacador 3 y 4"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              ) : null}
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <p className="sr-only">Empacador 4</p>
                            <div className="flex items-center gap-2">
                              <TextAutocomplete
                                value={m.packers?.[3] ?? ""}
                                onValueChange={(v) => {
                                  const a = m.packers?.[0]
                                  const b = m.packers?.[1]
                                  const c = m.packers?.[2]
                                  if (v && (!a || !b || !c)) {
                                    setError("Primero asigna los empacadores 1, 2 y 3.")
                                    return
                                  }
                                  if (v && (v === a || v === b || v === c)) {
                                    setError("Debe ser distinto a los empacadores anteriores.")
                                    return
                                  }
                                  setError(null)
                                  if (!v) {
                                    handleQuickUpdate(m.id, {
                                      packers: a && b && c ? [a, b, c] : undefined,
                                    })
                                    return
                                  }
                                  handleQuickUpdate(m.id, { packers: [a!, b!, c!, v] })
                                }}
                                options={personAutocompleteOptions(
                                  getAvailablePackers(
                                    packers,
                                    m.packers?.[3],
                                    (m.packers ?? []).filter((_, i) => i !== 3),
                                  ),
                                  employeeRows,
                                )}
                                placeholder="Emp.4"
                                className="w-full min-w-0"
                                inputClassName="h-9"
                              />
                              {m.packers?.[3] ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9 shrink-0"
                                  onClick={() => {
                                    const a = m.packers?.[0]
                                    const b = m.packers?.[1]
                                    const c = m.packers?.[2]
                                    handleQuickUpdate(m.id, {
                                      packers: a && b && c ? [a, b, c] : undefined,
                                    })
                                  }}
                                  title="Quitar empacador 4"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              ) : null}
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 self-start text-muted-foreground"
                            onClick={() => toggleQuickAssignmentExpanded(m.id)}
                            aria-label="Ocultar"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="relative h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleQuickAssignmentExpanded(m.id)
                          }}
                          aria-label="Más personal"
                        >
                          <Plus className="h-4 w-4" />
                          {quickAssignmentExtraCount(m) > 0 ? (
                            <Badge
                              variant="secondary"
                              className="absolute -right-1 -top-1 h-4 min-w-4 px-0 text-[10px]"
                            >
                              {quickAssignmentExtraCount(m)}
                            </Badge>
                          ) : null}
                        </Button>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {/* Mismo foquito que el diagrama: color + parpadeo + centro apagado */}
                      <MachineStatusDot
                        status={m.status}
                        blinking={
                          m.waitingReason === "sin_sku" || m.waitingReason === "contador"
                        }
                        packerGap={machineHasPackerGap(m)}
                        className="h-3 w-3"
                        title={
                          machineStatusShortLabel(m.status, m.waitingReason) +
                          (machineHasPackerGap(m) ? " · sin empacadora" : "")
                        }
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Fullscreen Diagram */}
      <Dialog open={isDiagramFullscreen} onOpenChange={setIsDiagramFullscreen}>
        <DialogContent
          showCloseButton={false}
          className="sm:max-w-[calc(100%-2rem)] w-[calc(100%-2rem)] h-[calc(100vh-2rem)] max-w-[calc(100%-2rem)] flex flex-col overflow-hidden p-0 gap-0"
        >
          <DialogHeader className="gap-1 border-b border-border px-4 py-2">
            <DialogTitle className="flex items-center justify-between gap-2 text-base sm:text-lg">
              <span>Diagrama de la Planta</span>
              <Button
                variant="outline"
                size="sm"
                className="bg-transparent"
                onClick={() => setIsDiagramFullscreen(false)}
              >
                <Minimize2 className="mr-2 h-4 w-4" />
                Salir
              </Button>
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Click en una máquina para asignar SKU y personal.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-hidden p-4">
            {renderDiagram("h-full ")}
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign Code Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-primary" />
              Configurar Máquina {selectedMachine?.name}
            </DialogTitle>
            <DialogDescription>
              SKU, hasta {MAX_OPERATORS_PER_MACHINE} operadores y hasta {MAX_PACKERS_PER_MACHINE} empacadores
              (usa los botones + en esta ventana).
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Machine Info */}
            <div className="rounded-lg bg-muted/50 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Estado actual:</span>
                <span className="flex items-center gap-1.5">
                  {selectedMachine && (
                    <MachineStatusDot
                      status={selectedMachine.status}
                      blinking={
                        selectedMachine.waitingReason === "sin_sku" ||
                        selectedMachine.waitingReason === "contador"
                      }
                      packerGap={machineHasPackerGap(selectedMachine)}
                      className="h-2.5 w-2.5"
                    />
                  )}
                  <span className={`font-medium px-2 py-0.5 rounded ${
                    selectedMachine?.status === "active"
                      ? "bg-green-100 text-green-700"
                      : selectedMachine?.status === "waiting"
                        ? "bg-yellow-100 text-yellow-700"
                        : selectedMachine?.status === "maintenance"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-red-100 text-red-700"
                  }`}>
                    {selectedMachine
                      ? machineStatusShortLabel(
                          selectedMachine.status,
                          selectedMachine.waitingReason,
                        )
                      : ""}
                  </span>
                </span>
              </div>
              {selectedMachine?.production !== undefined && (
                <div className="flex items-center justify-between text-sm mt-2">
                  <span className="text-muted-foreground">Producción hoy:</span>
                  <span className="font-medium text-foreground">{selectedMachine.production} unidades</span>
                </div>
              )}
              {/* Por qué está en este estado — nota por caso, como la del contador */}
              {selectedMachine?.status === "inactive" && (
                <div className="mt-2 flex items-center gap-2 rounded-md bg-red-100 px-2 py-1.5 text-xs font-medium text-red-800">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>Sin señal del equipo (&gt;2 min): apagada o sin WiFi.</span>
                </div>
              )}
              {selectedMachine?.status === "maintenance" && (
                <div className="mt-2 flex items-center gap-2 rounded-md bg-blue-100 px-2 py-1.5 text-xs font-medium text-blue-800">
                  <Settings2 className="h-4 w-4 shrink-0" />
                  <span>Sesión de mantenimiento activa — vuelve a su estado al cerrarla.</span>
                </div>
              )}
              {selectedMachine?.waitingReason === "sin_operadora" && (
                <div className="mt-2 flex items-center gap-2 rounded-md bg-amber-100 px-2 py-1.5 text-xs font-medium text-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>Sin operadora — falta el tap de entrada con tarjeta en el equipo.</span>
                </div>
              )}
              {selectedMachine?.waitingReason === "sin_sku" && (
                <div className="mt-2 flex items-center gap-2 rounded-md bg-amber-100 px-2 py-1.5 text-xs font-medium text-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>Operadora presente sin SKU — asígnalo aquí abajo para pasar a verde.</span>
                </div>
              )}
              {selectedMachine?.needsCounterReset && (
                <div className="mt-2 flex items-center gap-2 rounded-md bg-amber-100 px-2 py-1.5 text-xs font-medium text-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>El contador no está en 0 — resetéalo para que la máquina pase a verde.</span>
                </div>
              )}
              {selectedMachine && machineHasPackerGap(selectedMachine) && (
                <div className="mt-2 flex items-center gap-2 rounded-md bg-muted px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  <span className="shrink-0">◉</span>
                  <span>Produciendo sin empacadora marcada (centro apagado en el foquito).</span>
                </div>
              )}
            </div>

            {/* Code Input */}
            <div className="space-y-2">
              <Label htmlFor="code">SKU</Label>
              <SkuCodeInput
                id="code"
                value={codeInput}
                onValueChange={setCodeInput}
                catalog={skuCatalog}
                placeholder="Ej: s-negro-10m"
              />
            </div>

            {/* Operator */}
            <div className="space-y-2">
              <Label htmlFor="operator">Operador 1</Label>
              <TextAutocomplete
                id="operator"
                value={operatorInput}
                onValueChange={(v) => {
                  setOperatorInput(v)
                  if (operator2Input && v === operator2Input) setOperator2Input("")
                }}
                options={personAutocompleteOptions(
                  selectedMachine
                    ? getAvailableOperators(operators, selectedMachine.id, operatorInput)
                    : operators,
                  employeeRows,
                )}
                placeholder="Escribe nombre del operador…"
              />
            </div>

            {/* Packers */}
            <div className="space-y-2">
              <Label htmlFor="packer1">Empacador 1 (requerido)</Label>
              <TextAutocomplete
                id="packer1"
                value={packer1Input}
                onValueChange={(v) => {
                  setError(null)
                  setPacker1Input(v)
                  if (packer2Input && v && packer2Input === v) setPacker2Input("")
                  if (packer3Input && v && packer3Input === v) setPacker3Input("")
                  if (packer4Input && v && packer4Input === v) setPacker4Input("")
                }}
                options={personAutocompleteOptions(
                  getAvailablePackers(packers, packer1Input, [
                    packer2Input,
                    packer3Input,
                    packer4Input,
                  ]),
                  employeeRows,
                )}
                placeholder="Escribe nombre del empacador…"
              />
            </div>

            {!dialogShowSecondOperator ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full gap-2"
                disabled={!selectedMachine}
                onClick={() => setDialogShowSecondOperator(true)}
              >
                <Plus className="h-4 w-4" />
                Segundo operador (máx. {MAX_OPERATORS_PER_MACHINE})
              </Button>
            ) : (
              <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="operator2">Operador 2</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-muted-foreground"
                    onClick={() => {
                      setDialogShowSecondOperator(false)
                      setOperator2Input("")
                    }}
                  >
                    Quitar
                  </Button>
                </div>
                <TextAutocomplete
                  id="operator2"
                  value={operator2Input}
                  onValueChange={setOperator2Input}
                  options={personAutocompleteOptions(
                    (selectedMachine
                      ? getAvailableOperators(operators, selectedMachine.id, operator2Input).filter(
                          (op) => op !== operatorInput,
                        )
                      : operators.filter((op) => op !== operatorInput)
                    ),
                    employeeRows,
                  )}
                  placeholder="Escribe operador 2…"
                />
              </div>
            )}

            {dialogVisiblePackerSlots >= 2 ? (
              <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                <Label htmlFor="packer2">Empacador 2 (opcional)</Label>
                <TextAutocomplete
                  id="packer2"
                  value={packer2Input}
                  onValueChange={(v) => {
                    if (!packer1Input) {
                      setError("Primero asigna el empacador 1.")
                      return
                    }
                    if (v && v === packer1Input) {
                      setError("Debe ser distinto al empacador 1.")
                      return
                    }
                    setError(null)
                    setPacker2Input(v)
                    if (packer3Input && v && packer3Input === v) setPacker3Input("")
                    if (packer4Input && v && packer4Input === v) setPacker4Input("")
                  }}
                  options={personAutocompleteOptions(
                    getAvailablePackers(packers, packer2Input, [
                      packer1Input,
                      packer3Input,
                      packer4Input,
                    ]),
                    employeeRows,
                  )}
                  placeholder="Escribe empacador 2…"
                />
              </div>
            ) : null}

            {dialogVisiblePackerSlots >= 3 ? (
              <div className="space-y-2">
                <Label>Empacador 3 (opcional)</Label>
                <TextAutocomplete
                  value={packer3Input}
                  onValueChange={(v) => {
                    if (!packer2Input.trim()) {
                      setError("Primero asigna el empacador 2.")
                      return
                    }
                    if (v && (v === packer1Input || v === packer2Input)) {
                      setError("Debe ser distinto a los empacadores anteriores.")
                      return
                    }
                    setError(null)
                    setPacker3Input(v)
                    if (packer4Input && v && packer4Input === v) setPacker4Input("")
                  }}
                  options={personAutocompleteOptions(
                    getAvailablePackers(packers, packer3Input, [
                      packer1Input,
                      packer2Input,
                      packer4Input,
                    ]),
                    employeeRows,
                  )}
                  placeholder="Escribe empacador 3…"
                />
              </div>
            ) : null}

            {dialogVisiblePackerSlots >= 4 ? (
              <div className="space-y-2">
                <Label>Empacador 4 (opcional)</Label>
                <TextAutocomplete
                  value={packer4Input}
                  onValueChange={(v) => {
                    if (!packer3Input.trim()) {
                      setError("Primero asigna el empacador 3.")
                      return
                    }
                    if (v && (v === packer1Input || v === packer2Input || v === packer3Input)) {
                      setError("Debe ser distinto a los empacadores anteriores.")
                      return
                    }
                    setError(null)
                    setPacker4Input(v)
                  }}
                  options={personAutocompleteOptions(
                    getAvailablePackers(packers, packer4Input, [
                      packer1Input,
                      packer2Input,
                      packer3Input,
                    ]),
                    employeeRows,
                  )}
                  placeholder="Escribe empacador 4…"
                />
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {dialogVisiblePackerSlots < MAX_PACKERS_PER_MACHINE ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() =>
                    setDialogVisiblePackerSlots((n) => Math.min(MAX_PACKERS_PER_MACHINE, n + 1))
                  }
                >
                  <Plus className="h-4 w-4" />
                  {dialogVisiblePackerSlots < 2
                    ? "Agregar otro empacador (2)"
                    : `Agregar empacador (${dialogVisiblePackerSlots + 1})`}
                </Button>
              ) : null}
              {dialogVisiblePackerSlots > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDialogVisiblePackerSlots((n) => {
                      const next = Math.max(1, n - 1)
                      if (next < 4) setPacker4Input("")
                      if (next < 3) setPacker3Input("")
                      if (next < 2) setPacker2Input("")
                      return next
                    })
                  }}
                >
                  Quitar último empacador
                </Button>
              ) : null}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave}>
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreateSkuDialog
        open={createSkuOpen}
        onOpenChange={setCreateSkuOpen}
        quantityRules={quantityRules}
        getAccessToken={getAccessToken}
        onCreated={(sku) => {
          setSkuCatalog((prev) => [sku, ...prev.filter((s) => s.id !== sku.id)])
        }}
      />
    </DashboardLayout>
  )
}
