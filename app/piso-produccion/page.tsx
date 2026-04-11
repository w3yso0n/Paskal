"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { MachineCard } from "@/components/production/machine-card"
import type { Machine } from "@/lib/types"
import { getEmployees, getMachines, type ApiEmployee, type ApiMachine } from "@/lib/api"
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
import { Maximize2, Minimize2, Settings2, RotateCcw } from "lucide-react"

/** Mapeo código máquina -> posición en diagrama (row, col).
 * Nota: las columnas son 0-indexed (col: 0 es la primera columna visual).
 * La 2da columna visual es col: 1 y aquí solo debe tener M7 y M8.
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
  packer?: string
  production?: number
}

export default function ProductionFloorPage() {
  const { getAccessToken, user } = useAuth()
  const [employeeRows, setEmployeeRows] = useState<ApiEmployee[]>([])
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
        const [apiMachines, apiEmployees] = await Promise.all([
          getMachines(token),
          getEmployees(token),
        ])
        if (cancelled) return
        setEmployeeRows(
          user?.orgId ? apiEmployees.filter((e) => e.orgId === user.orgId) : apiEmployees,
        )
        const mapped = apiMachines.map((m) => ({
          ...mapApiMachineToFrontend(m),
          machineCode: m.code ?? undefined,
        }))
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
  }, [getAccessToken, user?.orgId])
  const [selectedMachine, setSelectedMachine] = useState<MachineData | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isDiagramFullscreen, setIsDiagramFullscreen] = useState(false)
  const [focusedMachineId, setFocusedMachineId] = useState<string | null>(null)
  const [codeInput, setCodeInput] = useState("")
  const [operatorInput, setOperatorInput] = useState("")
  const [packerInput, setPackerInput] = useState("")

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
    setPackerInput(machine.packer || "")
    setIsDialogOpen(true)
  }

  const handleSave = () => {
    if (selectedMachine) {
      setMachineData(prev => 
        prev.map(m => 
          m.id === selectedMachine.id 
            ? {
                ...m,
                sku: codeInput || undefined,
                operator: operatorInput || undefined,
                packer: packerInput || undefined,
              }
            : m
        )
      )
      setIsDialogOpen(false)
      setSelectedMachine(null)
      setCodeInput("")
      setOperatorInput("")
      setPackerInput("")
    }
  }

  const handleReset = () => {
    setMachineData((prev) =>
      prev.map((m) => ({ ...m, operator: undefined, packer: undefined }))
    )
  }

  const handleQuickUpdate = (machineId: string, patch: Partial<MachineData>) => {
    setMachineData((prev) => prev.map((m) => (m.id === machineId ? { ...m, ...patch } : m)))
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
                    packer={machine.packer}
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
            Cargando máquinas…
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
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Máquina</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Operador</TableHead>
                <TableHead>Empacador</TableHead>
                <TableHead>Validación</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedMachines.map((m, index) => {
                const ok = Boolean(m.sku) && Boolean(m.operator) && Boolean(m.packer)
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
                      <Select
                        value={m.operator ?? ""}
                        onValueChange={(v) => handleQuickUpdate(m.id, { operator: v || undefined })}
                      >
                        <SelectTrigger className="h-9 w-52">
                          <SelectValue placeholder="Seleccionar" />
                        </SelectTrigger>
                        <SelectContent>
                          {operators.map((name) => (
                            <SelectItem key={name} value={name}>
                              {name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={m.packer ?? ""}
                        onValueChange={(v) => handleQuickUpdate(m.id, { packer: v || undefined })}
                      >
                        <SelectTrigger className="h-9 w-52">
                          <SelectValue placeholder="Seleccionar" />
                        </SelectTrigger>
                        <SelectContent>
                          {packers.map((name) => (
                            <SelectItem key={name} value={name}>
                              {name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-primary" />
              Configurar Máquina {selectedMachine?.name}
            </DialogTitle>
            <DialogDescription>
              Asigna SKU, operador y empacador a esta máquina.
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

            {/* Packer Select */}
            <div className="space-y-2">
              <Label htmlFor="packer">Empacador Asignado</Label>
              <Select value={packerInput} onValueChange={setPackerInput}>
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
