"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { MachineCard } from "@/components/production/machine-card"
import type { Machine } from "@/lib/types"
import {
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Maximize2, Minimize2, Settings2, RotateCcw, X } from "lucide-react"
import { toast } from "sonner"

/** Mapeo c?digo m?quina -> posici?n en diagrama (row, col).
 * Nota: las columnas son 0-indexed (col: 0 es la primera columna visual).
 * La 2da columna visual es col: 1 y aqu? solo debe tener M7 y M8.
 */
const MACHINE_POSITIONS: Record<string, { row: number; col: number }> = {
  M1: { row: 6, col: 0 }, M2: { row: 5, col: 0 }, M3: { row: 4, col: 0 }, M4: { row: 3, col: 0 },
  M5: { row: 2, col: 0 }, M6: { row: 1, col: 0 }, M7: { row: 6, col: 1 }, M8: { row: 5, col: 1 },
  M9: { row: 6, col: 2 }, M10: { row: 5, col: 2 }, M11: { row: 4, col: 2 }, M12: { row: 3, col: 2 },
  M13: { row: 6, col: 3 }, M14: { row: 5, col: 3 }, M15: { row: 4, col: 3 }, M16: { row: 3, col: 3 },
  M17: { row: 6, col: 4 }, M18: { row: 5, col: 4 }, M19: { row: 4, col: 4 }, M20: { row: 3, col: 4 },
}

function mapApiMachineToFrontend(m: ApiMachine): Machine {
  const statusMap = { running: "active" as const, idle: "waiting" as const, stopped: "inactive" as const, maintenance: "inactive" as const, offline: "inactive" as const }
  const code = m.code ?? m.name
  const position = MACHINE_POSITIONS[code] ?? { row: 0, col: 0 }
  return { id: m.id, name: m.name, status: statusMap[m.status], position }
}

interface MachineData extends Machine {
  machineCode?: string
  sku?: string
  operator?: string
  packers?: string[]
  production?: number
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
        const [apiMachines, apiEmployees, apiCheckins] = await Promise.all([
          getMachines(token),
          getEmployees(token),
          getActiveMachineCheckins(token),
        ])
        if (cancelled) return
        setEmployeeRows(apiEmployees)

        const employeeNameByCode = new Map(
          apiEmployees
            .filter((e) => e.employeeCode)
            .map((e) => [String(e.employeeCode), e.fullName] as const),
        )
        const checkinByMachineId = new Map<string, ApiMachineCheckin>(
          apiCheckins.map((c) => [c.machineId, c]),
        )
        const mapped = apiMachines.map((m) => ({
          ...mapApiMachineToFrontend(m),
          machineCode: m.code ?? undefined,
          sku: m.currentSku ?? undefined,
          operator: (() => {
            const c = checkinByMachineId.get(m.id)
            const code = c?.operatorCode ?? m.operatorCode
            if (!code) return undefined
            return employeeNameByCode.get(code) ?? code
          })(),
          packers: (() => {
            const c = checkinByMachineId.get(m.id)
            const codes = [
              c?.packager1Code ?? m.packager1Code,
              c?.packager2Code ?? m.packager2Code,
              c?.packager3Code ?? m.packager3Code,
              c?.packager4Code ?? m.packager4Code,
            ].filter((v): v is string => Boolean(v))
            if (codes.length === 0) return undefined
            return codes.map((code) => employeeNameByCode.get(code) ?? code)
          })(),
        }))
        setMachineData(mapped)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Error al cargar m?quinas")
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
  const [packer1Input, setPacker1Input] = useState("")
  const [packer2Input, setPacker2Input] = useState("")

  const skuRefs = useRef<Array<HTMLInputElement | null>>([])

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
    setPacker1Input(machine.packers?.[0] || "")
    setPacker2Input(machine.packers?.[1] || "")
    setIsDialogOpen(true)
  }

  const handleSave = () => {
    if (selectedMachine) {
      const nextPackers = [packer1Input.trim(), packer2Input.trim()].filter(Boolean)
      if (nextPackers.length > 2) {
        setError("M?ximo 2 empacadores por m?quina.")
        return
      }

      setMachineData(prev => 
        prev.map(m => 
          m.id === selectedMachine.id 
            ? {
                ...m,
                sku: codeInput || undefined,
                operator: operatorInput || undefined,
                packers: nextPackers.length ? nextPackers : undefined,
                status:
                  (codeInput || operatorInput || nextPackers.length)
                    ? (codeInput && operatorInput && nextPackers.length ? "active" : "waiting")
                    : "inactive",
              }
            : m
        )
      )
      setHasUnsavedChanges(true)
      setIsDialogOpen(false)
      setSelectedMachine(null)
      setCodeInput("")
      setOperatorInput("")
      setPacker1Input("")
      setPacker2Input("")
    }
  }

  const handleReset = () => {
    setMachineData((prev) =>
      prev.map((m) => ({ ...m, operator: undefined, packers: undefined, status: "inactive" }))
    )
    setHasUnsavedChanges(true)
  }

  const handleQuickUpdate = (machineId: string, patch: Partial<MachineData>) => {
    setMachineData((prev) => prev.map((m) => (m.id === machineId ? { ...m, ...patch } : m)))
    setHasUnsavedChanges(true)
  }

  const applyAndSaveAssignments = () => {
    setError(null)
    // Permitir guardar informaci?n incompleta. Solo bloquear si hay empleados repetidos.
    const normalize = (v?: string) => (v ?? "").trim()
    const usedByEmployee = new Map<string, string>() // employee -> machineName
    for (const m of machineData) {
      const machineName = m.name
      const codes = [normalize(m.operator), ...(m.packers ?? []).map(normalize)].filter(Boolean)

      // Duplicado dentro de la misma m?quina
      if (new Set(codes).size !== codes.length) {
        setError(`El empleado est? duplicado dentro de la m?quina "${machineName}".`)
        toast.error("No se pudo guardar: empleado duplicado.")
        return
      }

      for (const c of codes) {
        const prev = usedByEmployee.get(c)
        if (prev && prev !== machineName) {
          setError(
            `El empleado "${c}" ya est? asignado en "${prev}". No puede estar en dos m?quinas a la vez.`,
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
        toast.error("Sesi?n inv?lida. Vuelve a iniciar sesi?n.")
        return
      }

      // Persistir a backend (machines.currentSku + c?digos). UI usa nombres, aqu? convertimos a employeeCode.
      const updates = machineData.map(async (m) => {
        const operatorCode = m.operator ? employeeCodeByName.get(m.operator) ?? null : null
        const packer1Code = m.packers?.[0] ? employeeCodeByName.get(m.packers[0]) ?? null : null
        const packer2Code = m.packers?.[1] ? employeeCodeByName.get(m.packers[1]) ?? null : null
        const configured = Boolean(m.sku || operatorCode || packer1Code || packer2Code)
        const ok = Boolean(m.sku) && Boolean(operatorCode) && Boolean(packer1Code)
        const nextStatus = ok ? "running" : "idle"
        const payload = {
          status: configured ? nextStatus : "idle",
          currentSku: m.sku ?? null,
          operatorCode,
          packager1Code: packer1Code,
          packager2Code: packer2Code,
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
        const mapped: MachineData[] = apiMachines.map((m) => ({
          ...mapApiMachineToFrontend(m),
          machineCode: m.code ?? undefined,
          sku: m.currentSku ?? undefined,
          operator: (() => {
            const c = checkinByMachineId.get(m.id)
            const code = c?.operatorCode ?? m.operatorCode
            if (!code) return undefined
            return employeeNameByCode.get(code) ?? code
          })(),
          packers: (() => {
            const c = checkinByMachineId.get(m.id)
            const codes = [
              c?.packager1Code ?? m.packager1Code,
              c?.packager2Code ?? m.packager2Code,
              c?.packager3Code ?? m.packager3Code,
              c?.packager4Code ?? m.packager4Code,
            ].filter((v): v is string => Boolean(v))
            if (codes.length === 0) return undefined
            return codes.map((code) => employeeNameByCode.get(code) ?? code)
          })(),
        }))
        setMachineData(mapped)
        setHasUnsavedChanges(false)
        toast.success("Asignaciones guardadas.")
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
    // Si el packer no est? ya seleccionado en otra maquina, solo permitir si no excede 4 ?nicos,
    // considerando que esta m?quina podr?a estar reemplazando uno existente.
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
        { label: "Piso de producci?n" }
      ]}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Piso de Producci?n</h1>
            <p className="text-muted-foreground">
              Vista general de las m?quinas y su estado actual de operaci?n.
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
            Cargando m?quinas
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">Total M?quinas</p>
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
            <strong>Tip:</strong> Pasa el cursor sobre cada m?quina para ver su informaci?n detallada.
            Haz click en una m?quina para asignarle SKU, operador y empacador.
          </p>
        </div>

        {/* Quick Assignment */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-card-foreground">Asignaci?n r?pida</h2>
              <p className="text-sm text-muted-foreground">
                Captura SKU por m?quina. Presiona Enter para ir a la siguiente.
              </p>
            </div>
            <div className="flex items-center gap-2">
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

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>M?quina</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Operador</TableHead>
                <TableHead>Empacador 1</TableHead>
                <TableHead>Empacador 2</TableHead>
                <TableHead>Validaci?n</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedMachines.map((m, index) => {
                const ok = Boolean(m.sku) && Boolean(m.operator) && Boolean(m.packers?.[0])
                return (
                  <TableRow
                    key={m.id}
                    onClick={() => setFocusedMachineId(m.id)}
                    data-state={focusedMachineId === m.id ? "selected" : undefined}
                    className={cn(!ok && "bg-amber-50/40")}
                  >
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell>
                      <Input
                        ref={(el) => {
                          skuRefs.current[index] = el
                        }}
                        value={m.sku ?? ""}
                        placeholder="SKU-001"
                        onFocus={() => setFocusedMachineId(m.id)}
                        onChange={(e) => handleQuickUpdate(m.id, { sku: e.target.value.toUpperCase() })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            skuRefs.current[index + 1]?.focus()
                          }
                        }}
                        className="w-44"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Select
                          value={m.operator ?? ""}
                          onValueChange={(v) => handleQuickUpdate(m.id, { operator: v || undefined })}
                        >
                          <SelectTrigger className="h-9 w-52">
                            <SelectValue placeholder="Seleccionar" />
                          </SelectTrigger>
                          <SelectContent>
                            {getAvailablePeople(operators, m.id, m.operator).map((name) => (
                              <SelectItem key={name} value={name}>
                                {name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {m.operator ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleQuickUpdate(m.id, { operator: undefined })
                            }}
                            title="Deseleccionar operador"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Select
                          value={m.packers?.[0] ?? ""}
                          onValueChange={(v) => {
                            const next = v ? ([v, m.packers?.[1]].filter(Boolean) as string[]) : []
                            if (v && !canAddPacker(v, m.id)) {
                              setError("M?ximo 4 empacadores ?nicos en toda la planta.")
                              return
                            }
                            setError(null)
                            handleQuickUpdate(m.id, { packers: next.length ? next : undefined })
                          }}
                        >
                          <SelectTrigger className="h-9 w-52">
                            <SelectValue placeholder="Seleccionar" />
                          </SelectTrigger>
                          <SelectContent>
                            {getAvailablePeople(packers, m.id, m.packers?.[0]).map((name) => (
                              <SelectItem key={name} value={name}>
                                {name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {m.packers?.[0] ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9"
                            onClick={(e) => {
                              e.stopPropagation()
                              const next = m.packers?.[1] ? [m.packers[1]] : []
                              handleQuickUpdate(m.id, { packers: next.length ? next : undefined })
                            }}
                            title="Deseleccionar empacador 1"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Select
                          value={m.packers?.[1] ?? ""}
                          onValueChange={(v) => {
                            const first = m.packers?.[0]
                            if (!first) {
                              setError("Primero asigna el empacador 1.")
                              return
                            }
                            if (v && !canAddPacker(v, m.id)) {
                              setError("M?ximo 4 empacadores ?nicos en toda la planta.")
                              return
                            }
                            if (v && v === first) {
                              setError("Empacador 2 debe ser distinto al empacador 1.")
                              return
                            }
                            setError(null)
                            const next = [first, v || undefined].filter(Boolean) as string[]
                            handleQuickUpdate(m.id, { packers: next })
                          }}
                        >
                          <SelectTrigger className="h-9 w-52">
                            <SelectValue placeholder="Opcional" />
                          </SelectTrigger>
                          <SelectContent>
                            {getAvailablePeople(packers, m.id, m.packers?.[1]).map((name) => (
                              <SelectItem key={name} value={name}>
                                {name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {m.packers?.[1] ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleQuickUpdate(m.id, { packers: m.packers?.[0] ? [m.packers[0]] : undefined })
                            }}
                            title="Deseleccionar empacador 2"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>
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
              Click en una m?quina para asignar SKU y personal.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-hidden p-4">
            {renderDiagram("h-full ")}
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign Code Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-primary" />
              Configurar M?quina {selectedMachine?.name}
            </DialogTitle>
            <DialogDescription>
              Asigna SKU, operador y empacador a esta m?quina.
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
                  <span className="text-muted-foreground">Producci?n hoy:</span>
                  <span className="font-medium text-foreground">{selectedMachine.production} unidades</span>
                </div>
              )}
            </div>

            {/* Code Input */}
            <div className="space-y-2">
              <Label htmlFor="code">SKU</Label>
              <Input
                id="code"
                placeholder="Ej: PROD-001, SKU-123"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              />
            </div>

            {/* Operator Select */}
            <div className="space-y-2">
              <Label htmlFor="operator">Operador Asignado</Label>
              <Select value={operatorInput} onValueChange={setOperatorInput}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar operador" />
                </SelectTrigger>
                <SelectContent>
                  {operators.map((op) => (
                    <SelectItem key={op} value={op}>
                      {op}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Packers Select */}
            <div className="space-y-2">
              <Label htmlFor="packer1">Empacador 1 (requerido)</Label>
              <Select
                value={packer1Input}
                onValueChange={(v) => {
                  if (v && !canAddPacker(v, selectedMachine?.id ?? "")) {
                    setError("M?ximo 4 empacadores ?nicos en toda la planta.")
                    return
                  }
                  setError(null)
                  setPacker1Input(v)
                  if (packer2Input && v && packer2Input === v) setPacker2Input("")
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar empacador" />
                </SelectTrigger>
                <SelectContent>
                  {packers.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="packer2">Empacador 2 (opcional, m?x 2 por m?quina)</Label>
              <Select
                value={packer2Input}
                onValueChange={(v) => {
                  if (!packer1Input) {
                    setError("Primero asigna el empacador 1.")
                    return
                  }
                  if (v && v === packer1Input) {
                    setError("Empacador 2 debe ser distinto al empacador 1.")
                    return
                  }
                  if (v && !canAddPacker(v, selectedMachine?.id ?? "")) {
                    setError("M?ximo 4 empacadores ?nicos en toda la planta.")
                    return
                  }
                  setError(null)
                  setPacker2Input(v)
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Opcional" />
                </SelectTrigger>
                <SelectContent>
                  {packers.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
    </DashboardLayout>
  )
}
