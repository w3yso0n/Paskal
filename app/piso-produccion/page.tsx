"use client"

import { useState } from "react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { MachineCard } from "@/components/production/machine-card"
import { machines, type Machine } from "@/lib/mock-data"
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
import { Settings2, RotateCcw } from "lucide-react"

interface MachineData extends Machine {
  code?: string
  operator?: string
  production?: number
}

// Mock operators
const availableOperators = [
  "Juan Pérez",
  "María García",
  "Carlos López",
  "Ana Martínez",
  "Roberto Sánchez",
  "Laura Torres",
  "Pedro Ramírez",
]

export default function ProductionFloorPage() {
  const [machineData, setMachineData] = useState<MachineData[]>(
    machines.map(m => ({
      ...m,
      production: Math.floor(Math.random() * 300) + 100,
      operator: availableOperators[Math.floor(Math.random() * availableOperators.length)],
    }))
  )
  const [selectedMachine, setSelectedMachine] = useState<MachineData | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [codeInput, setCodeInput] = useState("")
  const [operatorInput, setOperatorInput] = useState("")

  // Group machines by columns
  const columns = [
    machineData.filter(m => m.position.col === 0),
    machineData.filter(m => m.position.col === 1),
    machineData.filter(m => m.position.col === 2),
    machineData.filter(m => m.position.col === 3),
    machineData.filter(m => m.position.col === 4),
  ]

  const handleMachineClick = (machine: MachineData) => {
    setSelectedMachine(machine)
    setCodeInput(machine.code || "")
    setOperatorInput(machine.operator || "")
    setIsDialogOpen(true)
  }

  const handleSave = () => {
    if (selectedMachine) {
      setMachineData(prev => 
        prev.map(m => 
          m.id === selectedMachine.id 
            ? { ...m, code: codeInput || undefined, operator: operatorInput || undefined }
            : m
        )
      )
      setIsDialogOpen(false)
      setSelectedMachine(null)
      setCodeInput("")
      setOperatorInput("")
    }
  }

  const handleReset = () => {
    setMachineData(
      machines.map(m => ({
        ...m,
        production: Math.floor(Math.random() * 300) + 100,
        operator: availableOperators[Math.floor(Math.random() * availableOperators.length)],
      }))
    )
  }

  // Stats
  const activeCount = machineData.filter(m => m.status === "active").length
  const waitingCount = machineData.filter(m => m.status === "waiting").length
  const inactiveCount = machineData.filter(m => m.status === "inactive").length
  const assignedCount = machineData.filter(m => m.code).length

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
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Reiniciar
            </Button>
            <Button size="sm">
              <Settings2 className="mr-2 h-4 w-4" />
              Configurar
            </Button>
          </div>
        </div>

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
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-card-foreground">Diagrama de la Planta</h2>
            <span className="text-sm text-muted-foreground">
              {assignedCount} de {machineData.length} con código asignado
            </span>
          </div>
          
          <div className="overflow-x-auto">
            <div className="mx-auto flex min-w-[900px] justify-center gap-12 py-8">
              {columns.map((column, colIndex) => (
                <div key={colIndex} className="flex flex-col gap-10">
                  {column
                    .sort((a, b) => a.position.row - b.position.row)
                    .map((machine) => (
                      <MachineCard
                        key={machine.id}
                        id={machine.id}
                        name={machine.name}
                        status={machine.status}
                        code={machine.code}
                        operator={machine.operator}
                        production={machine.production}
                        onClick={() => handleMachineClick(machine)}
                        isSelected={selectedMachine?.id === machine.id}
                      />
                    ))}
                </div>
              ))}
            </div>
          </div>

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
            Haz click en una máquina para asignarle un código de producción y operador.
          </p>
        </div>
      </div>

      {/* Assign Code Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-primary" />
              Configurar Máquina {selectedMachine?.name}
            </DialogTitle>
            <DialogDescription>
              Asigna un código de producción y operador a esta máquina.
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
              <Label htmlFor="code">Código de Producción</Label>
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
                  {availableOperators.map((op) => (
                    <SelectItem key={op} value={op}>
                      {op}
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
