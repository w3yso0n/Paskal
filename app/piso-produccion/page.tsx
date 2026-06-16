"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { MachineCard } from "@/components/production/machine-card"
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
import { Maximize2, Minimize2, Plus, Settings2, RotateCcw, X, Tags } from "lucide-react"
import { toast } from "sonner"
import { filterFloorMachines } from "@/lib/machine-floor"
import {
  getProductSkus,
  recordProductSkuUsage,
  type ApiProductSku,
} from "@/lib/api"
import { SkuCodeInput, skuUnitsPerBox } from "@/components/sku/sku-code-input"
import { CreateSkuDialog } from "@/components/sku/create-sku-dialog"
import { normalizeSkuCode } from "@/lib/sku-catalog"
import { loadQuantityRules } from "@/lib/hook-sku-quantity-table"
import type { HookSkuQuantityRule } from "@/lib/hook-sku-generator"

function mapApiMachineToFrontend(m: ApiMachine): Machine & { onFloor: boolean } {
  const statusMap = { running: "active" as const, idle: "waiting" as const, stopped: "inactive" as const, maintenance: "inactive" as const, offline: "inactive" as const }
  const label = m.code ?? m.name
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

function computeEffectiveStatus(
  sku: string | undefined,
  operator: string | undefined,
  packers: string[] | undefined,
): Machine["status"] {
  const hasSku = Boolean(sku)
  const hasOperator = Boolean(operator)
  const hasPacker = Boolean(packers?.length)
  if (hasSku && hasOperator && hasPacker) return "active"
  if (hasSku || hasOperator || hasPacker) return "waiting"
  return "inactive"
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
}

function machineNumberFromName(name: string): number {
  const match = name.match(/\d+/)
  return match ? Number(match[0]) : Number.POSITIVE_INFINITY
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
  const operators = useMemo(() => {
    const byPosition = employeeRows
      .filter((e) => (e.position ?? "").toLowerCase().includes("oper"))
      .map((e) => e.fullName)
    if (byPosition.length > 0) return byPosition
    return employeeRows.filter((e) => e.status === "active").map((e) => e.fullName)
  }, [employeeRows])
  const packers = useMemo(() => {
    const byPosition = employeeRows
      .filter((e) => (e.position ?? "").toLowerCase().includes("empac"))
      .map((e) => e.fullName)
    if (byPosition.length > 0) return byPosition
    return employeeRows.filter((e) => e.status === "active").map((e) => e.fullName)
  }, [employeeRows])

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

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const token = await getAccessToken()
        if (!token) {
          setMachineData([])
          return
        }
        const [apiMachines, apiEmployees, apiCheckins, skus] = await Promise.all([
          getMachines(token),
          getEmployees(token),
          getActiveMachineCheckins(token),
          getProductSkus(token),
        ])
        if (cancelled) return
        setSkuCatalog(skus)
        setQuantityRules(loadQuantityRules())
        setEmployeeRows(apiEmployees)

        const employeeNameByCode = new Map(
          apiEmployees
            .filter((e) => e.employeeCode)
            .map((e) => [String(e.employeeCode), e.fullName] as const),
        )
        const checkinByMachineId = new Map<string, ApiMachineCheckin>(
          apiCheckins.map((c) => [c.machineId, c]),
        )
        const mapped = filterFloorMachines(apiMachines).map((m) => {
          const base = mapApiMachineToFrontend(m)
          const sku = m.currentSku ?? undefined
          const operator = (() => {
            const c = checkinByMachineId.get(m.id)
            const code = c?.operatorCode ?? m.operatorCode
            if (!code) return undefined
            return employeeNameByCode.get(code) ?? code
          })()
          const operator2 = (() => {
            const c = checkinByMachineId.get(m.id)
            const code = c?.operator2Code ?? m.operator2Code
            if (!code) return undefined
            return employeeNameByCode.get(code) ?? code
          })()
          const packers = (() => {
            const c = checkinByMachineId.get(m.id)
            const codes = [
              c?.packager1Code ?? m.packager1Code,
              c?.packager2Code ?? m.packager2Code,
              c?.packager3Code ?? m.packager3Code,
              c?.packager4Code ?? m.packager4Code,
            ].filter((v): v is string => Boolean(v))
            if (codes.length === 0) return undefined
            return codes.map((code) => employeeNameByCode.get(code) ?? code)
          })()
          return {
            ...base,
            status: computeEffectiveStatus(sku, operator, packers),
            machineCode: m.code ?? undefined,
            sku,
            unitsPerBox: m.unitsPerBox ?? undefined,
            operator,
            operator2,
            packers,
          }
        })
        setMachineData(mapped)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Error al cargar máquinas")
          setMachineData([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [getAccessToken])
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

  // Group machines by columns
  const columns = [
    machineData.filter(m => m.position.col === 0),
    machineData.filter(m => m.position.col === 1),
    machineData.filter(m => m.position.col === 2),
    machineData.filter(m => m.position.col === 3),
    machineData.filter(m => m.position.col === 4),
  ]

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
                nextPackers.length ? nextPackers : undefined,
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

  const handleReset = () => {
    // Optimistic UI: limpia localmente de inmediato
    setMachineData((prev) =>
      prev.map((m) => ({
        ...m,
        operator: undefined,
        operator2: undefined,
        packers: undefined,
        status: "inactive" as const,
      })),
    )
    setHasUnsavedChanges(false)

    // Llama al backend: cierra TODOS los checkins activos y pone las máquinas en idle
    ;(async () => {
      const token = await getAccessToken()
      if (!token) {
        toast.error("Sesión inválida. Vuelve a iniciar sesión.")
        return
      }
      try {
        const { closed } = await closeAllMachineCheckins(token)
        toast.success(`Turno cerrado: ${closed} check-in${closed !== 1 ? "s" : ""} cerrado${closed !== 1 ? "s" : ""}.`)

        // Recarga desde el backend para que la UI refleje el estado real
        const [apiMachines, apiEmployees, apiCheckins] = await Promise.all([
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
        const checkinByMachineId = new Map<string, ApiMachineCheckin>(
          apiCheckins.map((c) => [c.machineId, c]),
        )
        const mapped = filterFloorMachines(apiMachines).map((m) => {
          const base = mapApiMachineToFrontend(m)
          const sku = m.currentSku ?? undefined
          const operator = (() => {
            const c = checkinByMachineId.get(m.id)
            const code = c?.operatorCode ?? m.operatorCode
            if (!code) return undefined
            return employeeNameByCode.get(code) ?? code
          })()
          const operator2 = (() => {
            const c = checkinByMachineId.get(m.id)
            const code = c?.operator2Code ?? m.operator2Code
            if (!code) return undefined
            return employeeNameByCode.get(code) ?? code
          })()
          const packers = (() => {
            const c = checkinByMachineId.get(m.id)
            const codes = [
              c?.packager1Code ?? m.packager1Code,
              c?.packager2Code ?? m.packager2Code,
              c?.packager3Code ?? m.packager3Code,
              c?.packager4Code ?? m.packager4Code,
            ].filter((v): v is string => Boolean(v))
            if (codes.length === 0) return undefined
            return codes.map((code) => employeeNameByCode.get(code) ?? code)
          })()
          return {
            ...base,
            status: computeEffectiveStatus(sku, operator, packers),
            machineCode: m.code ?? undefined,
            sku,
            unitsPerBox: m.unitsPerBox ?? undefined,
            operator,
            operator2,
            packers,
          }
        })
        setMachineData(mapped)
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
          status: computeEffectiveStatus(next.sku, next.operator, next.packers),
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
    // Permitir guardar información incompleta. Solo bloquear si hay empleados repetidos.
    const normalize = (v?: string) => (v ?? "").trim()
    const usedByEmployee = new Map<string, string>() // employee -> machineName
    for (const m of machineData) {
      const machineName = m.name
      const codes = [
        normalize(m.operator),
        normalize(m.operator2),
        ...(m.packers ?? []).map(normalize),
      ].filter(Boolean)

      // Duplicado dentro de la misma máquina
      if (new Set(codes).size !== codes.length) {
        setError(`El empleado está duplicado dentro de la máquina "${machineName}".`)
        toast.error("No se pudo guardar: empleado duplicado.")
        return
      }

      for (const c of codes) {
        const prev = usedByEmployee.get(c)
        if (prev && prev !== machineName) {
          setError(
            `El empleado "${c}" ya está asignado en "${prev}". No puede estar en dos máquinas a la vez.`,
          )
          toast.error("No se pudo guardar: empleado repetido.")
          return
        }
        usedByEmployee.set(c, machineName)
      }
    }

    ;(async () => {
      const token = await getAccessToken()
      if (!token) {
        toast.error("Sesión inválida. Vuelve a iniciar sesión.")
        return
      }

      // Persistir a backend (machines.currentSku + c?digos). UI usa nombres, aqu? convertimos a employeeCode.
      const updates = machineData.map(async (m) => {
        const operatorCode = m.operator ? employeeCodeByName.get(m.operator) ?? null : null
        const operator2Code = m.operator2 ? employeeCodeByName.get(m.operator2) ?? null : null
        const packer1Code = m.packers?.[0] ? employeeCodeByName.get(m.packers[0]) ?? null : null
        const packer2Code = m.packers?.[1] ? employeeCodeByName.get(m.packers[1]) ?? null : null
        const packer3Code = m.packers?.[2] ? employeeCodeByName.get(m.packers[2]) ?? null : null
        const packer4Code = m.packers?.[3] ? employeeCodeByName.get(m.packers[3]) ?? null : null
        const configured = Boolean(
          m.sku ||
            operatorCode ||
            operator2Code ||
            packer1Code ||
            packer2Code ||
            packer3Code ||
            packer4Code,
        )
        const ok = Boolean(m.sku) && Boolean(operatorCode) && Boolean(packer1Code)
        const nextStatus = ok ? "running" : "idle"
        const payload = {
          status: configured ? nextStatus : "idle",
          currentSku: m.sku ? normalizeSkuCode(m.sku) : null,
          unitsPerBox: m.unitsPerBox,
          operatorCode,
          operator2Code,
          packager1Code: packer1Code,
          packager2Code: packer2Code,
          packager3Code: packer3Code,
          packager4Code: packer4Code,
        } as const
        const saved = await updateMachine(token, m.id, payload)
        return { machineId: m.id, machineName: m.name, payload, saved }
      })

      try {
        const settled = await Promise.allSettled(updates)
        const rejected = settled.filter((r) => r.status === "rejected")
        if (rejected.length > 0) {
          const first = rejected[0] as PromiseRejectedResult
          toast.error("No se pudo guardar en el backend.")
          setError(first.reason?.message ? String(first.reason.message) : "Error al guardar en el backend.")
          setHasUnsavedChanges(true)
          return
        }

        const results = (settled as PromiseFulfilledResult<
          { machineId: string; machineName: string; payload: any; saved: ApiMachine }
        >[]).map((r) => r.value)

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
        const checkinByMachineId = new Map<string, ApiMachineCheckin>(
          apiCheckins.map((c) => [c.machineId, c]),
        )
        const mapped: MachineData[] = filterFloorMachines(apiMachines).map((m) => {
          const base = mapApiMachineToFrontend(m)
          const sku = m.currentSku ?? undefined
          const operator = (() => {
            const c = checkinByMachineId.get(m.id)
            const code = c?.operatorCode ?? m.operatorCode
            if (!code) return undefined
            return employeeNameByCode.get(code) ?? code
          })()
          const operator2 = (() => {
            const c = checkinByMachineId.get(m.id)
            const code = c?.operator2Code ?? m.operator2Code
            if (!code) return undefined
            return employeeNameByCode.get(code) ?? code
          })()
          const packers = (() => {
            const c = checkinByMachineId.get(m.id)
            const codes = [
              c?.packager1Code ?? m.packager1Code,
              c?.packager2Code ?? m.packager2Code,
              c?.packager3Code ?? m.packager3Code,
              c?.packager4Code ?? m.packager4Code,
            ].filter((v): v is string => Boolean(v))
            if (codes.length === 0) return undefined
            return codes.map((code) => employeeNameByCode.get(code) ?? code)
          })()
          return {
            ...base,
            status: computeEffectiveStatus(sku, operator, packers),
            machineCode: m.code ?? undefined,
            sku,
            unitsPerBox: m.unitsPerBox ?? undefined,
            operator,
            operator2,
            packers,
          }
        })
        setMachineData(mapped)
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

  const selectedPackers = useMemo(() => {
    const set = new Set<string>()
    for (const m of machineData) {
      for (const p of m.packers ?? []) {
        if (p) set.add(p)
      }
    }
    return set
  }, [machineData])

  const selectedEmployeesByMachine = useMemo(() => {
    const map = new Map<string, string>() // employeeName -> machineId
    for (const m of machineData) {
      if (m.operator) map.set(m.operator, m.id)
      if (m.operator2) map.set(m.operator2, m.id)
      for (const p of m.packers ?? []) {
        if (p) map.set(p, m.id)
      }
    }
    return map
  }, [machineData])

  const getAvailablePeople = (all: string[], machineId: string, current?: string) => {
    return all.filter((name) => {
      const usedBy = selectedEmployeesByMachine.get(name)
      return !usedBy || usedBy === machineId || name === current
    })
  }

  const canAddPacker = (packerName: string, machineId: string) => {
    if (!packerName) return true
    if (selectedPackers.has(packerName)) return true
    const current = machineData.find((m) => m.id === machineId)?.packers ?? []
    const currentUnique = new Set(current.filter(Boolean))
    const uniqueTotal = selectedPackers.size

    return uniqueTotal - currentUnique.size + (currentUnique.has(packerName) ? 0 : 1) <= 4
  }

  // Stats
  const activeCount = machineData.filter(m => m.status === "active").length
  const waitingCount = machineData.filter(m => m.status === "waiting").length
  const inactiveCount = machineData.filter(m => m.status === "inactive").length
  const assignedCount = machineData.filter(m => m.sku).length

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

  const selectMachineRange = () => {
    const from = Number(rangeFrom)
    const to = Number(rangeTo)
    if (!Number.isFinite(from) || !Number.isFinite(to)) {
      toast.error("Indica números de máquina válidos para el rango.")
      return
    }
    const min = Math.min(from, to)
    const max = Math.max(from, to)
    const ids = sortedMachines
      .filter((m) => {
        const n = machineNumberFromName(m.name)
        return n >= min && n <= max
      })
      .map((m) => m.id)
    setSelectedMachineIds(new Set(ids))
    toast.message(`${ids.length} máquina(s) seleccionada(s).`)
  }

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
              status: computeEffectiveStatus(sku, m.operator, m.packers),
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
        <div className="mx-auto flex min-h-full min-w-[900px] items-end justify-center gap-14">
          {columns.map((column, colIndex) => (
            <div key={colIndex} className="flex min-h-full flex-col justify-end ">
              {column
                .sort((a, b) => a.position.row - b.position.row)
                .map((machine) => (
                  <MachineCard
                    key={machine.id}
                    id={machine.id}
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
                    onClick={() => handleMachineClick(machine)}
                    isSelected={focusedMachineId === machine.id}
                  />
                ))}
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

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">Total Máquinas</p>
            <p className="text-2xl font-bold text-card-foreground">{machineData.length}</p>
          </div>
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <p className="text-xs font-medium uppercase text-green-600">Activas</p>
            <p className="text-2xl font-bold text-green-700">{activeCount}</p>
          </div>
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
            <p className="text-xs font-medium uppercase text-yellow-600">Esperando</p>
            <p className="text-2xl font-bold text-yellow-700">{waitingCount}</p>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-xs font-medium uppercase text-red-600">Inactivas</p>
            <p className="text-2xl font-bold text-red-700">{inactiveCount}</p>
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

          {/* Legend */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 border-t border-border pt-6">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-green-500" />
              <span className="text-sm text-muted-foreground">Activa ({activeCount})</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-yellow-500" />
              <span className="text-sm text-muted-foreground">Esperando ({waitingCount})</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-red-500" />
              <span className="text-sm text-muted-foreground">Inactiva ({inactiveCount})</span>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <p className="text-sm text-primary">
            <strong>Tip:</strong> Pasa el cursor sobre cada máquina para ver su información detallada.
            Haz click en una máquina para asignarle SKU, operador y empacador.
          </p>
        </div>

        {/* Quick Assignment */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-card-foreground">Asignación rápida</h2>
              <p className="text-sm text-muted-foreground">
                Captura SKU por máquina. Presiona Enter para ir a la siguiente.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href="/administracion/gestion-skus">
                  <Tags className="mr-2 h-4 w-4" />
                  Gestión SKUs
                </Link>
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCreateSkuOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Nuevo SKU
              </Button>
              <Button
                onClick={applyAndSaveAssignments}
                disabled={!hasUnsavedChanges}
              >
                {hasUnsavedChanges ? "Guardar" : "Guardado"}
              </Button>
              <Button variant="outline" onClick={handleReset}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset
              </Button>
            </div>
          </div>

          <div className="mb-4 rounded-lg border border-dashed border-border bg-muted/20 p-4 space-y-3">
            <p className="text-sm font-medium text-foreground">Cambio masivo de SKU</p>
            <p className="text-xs text-muted-foreground">
              Marca máquinas en la tabla, define un rango numérico o selecciona todas, luego aplica un SKU.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Desde máq.</Label>
                <Input
                  className="w-24"
                  type="number"
                  min={1}
                  value={rangeFrom}
                  onChange={(e) => setRangeFrom(e.target.value)}
                  placeholder="1"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Hasta máq.</Label>
                <Input
                  className="w-24"
                  type="number"
                  min={1}
                  value={rangeTo}
                  onChange={(e) => setRangeTo(e.target.value)}
                  placeholder="20"
                />
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={selectMachineRange}>
                Seleccionar rango
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => toggleAllMachinesSelected(true)}
              >
                Todas
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => toggleAllMachinesSelected(false)}
              >
                Limpiar
              </Button>
              <div className="min-w-[200px] flex-1 space-y-1">
                <Label className="text-xs">SKU a aplicar</Label>
                <SkuCodeInput
                  value={bulkSku}
                  onValueChange={setBulkSku}
                  catalog={skuCatalog}
                  placeholder="Código SKU"
                />
              </div>
              <Button type="button" onClick={applyBulkSku} disabled={selectedMachineIds.size === 0}>
                Aplicar a {selectedMachineIds.size || "…"}
              </Button>
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
                <TableHead>Máquina</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Operador 1</TableHead>
                <TableHead>Empacador 1</TableHead>
                <TableHead className="min-w-44">Más personal</TableHead>
                <TableHead>Validación</TableHead>
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
                        placeholder="sku-001"
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
                            getAvailablePeople(operators, m.id, m.operator),
                            employeeRows,
                          )}
                          placeholder="Escribe operador…"
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
                            if (v && !canAddPacker(v, m.id)) {
                              setError("Máximo 4 empacadores únicos en toda la planta.")
                              return
                            }
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
                            getAvailablePeople(packers, m.id, m.packers?.[0]),
                            employeeRows,
                          )}
                          placeholder="Escribe empacador…"
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
                            <p className="text-xs font-medium text-muted-foreground">Operador 2</p>
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
                                  getAvailablePeople(operators, m.id, m.operator2).filter(
                                    (name) => name !== m.operator,
                                  ),
                                  employeeRows,
                                )}
                                placeholder="Escribe operador 2…"
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
                            <p className="text-xs font-medium text-muted-foreground">Empacador 2</p>
                            <div className="flex items-center gap-2">
                              <TextAutocomplete
                                value={m.packers?.[1] ?? ""}
                                onValueChange={(v) => {
                                  const first = m.packers?.[0]
                                  if (!first) {
                                    setError("Primero asigna el empacador 1.")
                                    return
                                  }
                                  if (v && !canAddPacker(v, m.id)) {
                                    setError("Máximo 4 empacadores únicos en toda la planta.")
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
                                  getAvailablePeople(packers, m.id, m.packers?.[1]),
                                  employeeRows,
                                )}
                                placeholder="Escribe empacador 2…"
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
                            <p className="text-xs font-medium text-muted-foreground">Empacador 3</p>
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
                                  if (v && !canAddPacker(v, m.id)) {
                                    setError("Máximo 4 empacadores únicos en toda la planta.")
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
                                  getAvailablePeople(packers, m.id, m.packers?.[2]),
                                  employeeRows,
                                )}
                                placeholder="Escribe empacador 3…"
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
                            <p className="text-xs font-medium text-muted-foreground">Empacador 4</p>
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
                                  if (v && !canAddPacker(v, m.id)) {
                                    setError("Máximo 4 empacadores únicos en toda la planta.")
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
                                  getAvailablePeople(packers, m.id, m.packers?.[3]),
                                  employeeRows,
                                )}
                                placeholder="Escribe empacador 4…"
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
                            size="sm"
                            className="self-start text-muted-foreground"
                            onClick={() => toggleQuickAssignmentExpanded(m.id)}
                          >
                            Ocultar
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleQuickAssignmentExpanded(m.id)
                          }}
                        >
                          <Plus className="h-4 w-4" />
                          Más
                          {quickAssignmentExtraCount(m) > 0 ? (
                            <Badge variant="secondary" className="ml-1 font-normal">
                              {quickAssignmentExtraCount(m)}
                            </Badge>
                          ) : null}
                        </Button>
                      )}
                    </TableCell>
                    <TableCell>
                      {ok ? (
                        <Badge variant="secondary">OK</Badge>
                      ) : (
                        <Badge variant="destructive">Faltan datos</Badge>
                      )}
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
                <span className={`font-medium px-2 py-0.5 rounded ${
                  selectedMachine?.status === "active" 
                    ? "bg-green-100 text-green-700" 
                    : selectedMachine?.status === "waiting"
                    ? "bg-yellow-100 text-yellow-700"
                    : "bg-red-100 text-red-700"
                }`}>
                  {selectedMachine?.status === "active" && "Activa"}
                  {selectedMachine?.status === "waiting" && "Esperando"}
                  {selectedMachine?.status === "inactive" && "Inactiva"}
                </span>
              </div>
              {selectedMachine?.production !== undefined && (
                <div className="flex items-center justify-between text-sm mt-2">
                  <span className="text-muted-foreground">Producción hoy:</span>
                  <span className="font-medium text-foreground">{selectedMachine.production} unidades</span>
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
                    ? getAvailablePeople(operators, selectedMachine.id, operatorInput)
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
                  if (v && !canAddPacker(v, selectedMachine?.id ?? "")) {
                    setError("Máximo 4 empacadores únicos en toda la planta.")
                    return
                  }
                  setError(null)
                  setPacker1Input(v)
                  if (packer2Input && v && packer2Input === v) setPacker2Input("")
                  if (packer3Input && v && packer3Input === v) setPacker3Input("")
                  if (packer4Input && v && packer4Input === v) setPacker4Input("")
                }}
                options={personAutocompleteOptions(
                  selectedMachine
                    ? getAvailablePeople(packers, selectedMachine.id, packer1Input)
                    : packers,
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
                      ? getAvailablePeople(operators, selectedMachine.id, operator2Input).filter(
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
                    if (v && !canAddPacker(v, selectedMachine?.id ?? "")) {
                      setError("Máximo 4 empacadores únicos en toda la planta.")
                      return
                    }
                    setError(null)
                    setPacker2Input(v)
                    if (packer3Input && v && packer3Input === v) setPacker3Input("")
                    if (packer4Input && v && packer4Input === v) setPacker4Input("")
                  }}
                  options={personAutocompleteOptions(packers, employeeRows)}
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
                    if (v && !canAddPacker(v, selectedMachine?.id ?? "")) {
                      setError("Máximo 4 empacadores únicos en toda la planta.")
                      return
                    }
                    setError(null)
                    setPacker3Input(v)
                    if (packer4Input && v && packer4Input === v) setPacker4Input("")
                  }}
                  options={personAutocompleteOptions(packers, employeeRows)}
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
                    if (v && !canAddPacker(v, selectedMachine?.id ?? "")) {
                      setError("Máximo 4 empacadores únicos en toda la planta.")
                      return
                    }
                    setError(null)
                    setPacker4Input(v)
                  }}
                  options={personAutocompleteOptions(packers, employeeRows)}
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
