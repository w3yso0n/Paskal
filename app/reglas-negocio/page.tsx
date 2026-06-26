"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  CalendarDays,
  Loader2,
  Plus,
  Save,
  Trash2,
  Zap,
  Bell,
  Scale,
  Target,
} from "lucide-react"
import { toast } from "sonner"

import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { RequirePermission } from "@/components/auth/require-permission"
import { BonusConfigPanel } from "@/components/metas/bonus-config-panel"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/contexts/auth-context"
import {
  createBusinessHoliday,
  createProductionIncident,
  deleteBusinessHoliday,
  deleteProductionIncident,
  getBusinessAlertThresholds,
  getCatalogHolidays,
  getCustomBusinessHolidays,
  getMachines,
  getProductionIncidents,
  updateBusinessAlertThresholds,
  type ApiBusinessHoliday,
  type ApiCatalogHoliday,
  type ApiMachine,
  type ApiProductionIncident,
} from "@/lib/api"
import { DEFAULT_ALERT_THRESHOLDS, type AlertThresholdsConfig } from "@/lib/business-rules"
import { resolveCustomHolidayIso } from "@/lib/mexican-holidays"

function formatDateEs(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number)
  if (!y || !m || !d) return iso
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(y, m - 1, d))
}

const RULES_TABS = ["holidays", "electrical", "thresholds", "bono"] as const
type RulesTab = (typeof RULES_TABS)[number]

function parseRulesTab(value: string | null): RulesTab {
  if (value && RULES_TABS.includes(value as RulesTab)) return value as RulesTab
  return "holidays"
}

export default function ReglasNegocioPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { getAccessToken } = useAuth()
  const currentYear = new Date().getFullYear()
  const [activeTab, setActiveTab] = useState<RulesTab>(() =>
    parseRulesTab(searchParams.get("tab")),
  )
  const [year, setYear] = useState(currentYear)
  const [loading, setLoading] = useState(true)
  const [catalog, setCatalog] = useState<ApiCatalogHoliday[]>([])
  const [customHolidays, setCustomHolidays] = useState<ApiBusinessHoliday[]>([])
  const [incidents, setIncidents] = useState<ApiProductionIncident[]>([])
  const [machines, setMachines] = useState<ApiMachine[]>([])
  const [thresholds, setThresholds] = useState<AlertThresholdsConfig>(DEFAULT_ALERT_THRESHOLDS)
  const [savingThresholds, setSavingThresholds] = useState(false)

  useEffect(() => {
    setActiveTab(parseRulesTab(searchParams.get("tab")))
  }, [searchParams])

  const setRulesTab = (tab: string) => {
    const next = parseRulesTab(tab)
    setActiveTab(next)
    router.replace(next === "holidays" ? "/reglas-negocio" : `/reglas-negocio?tab=${next}`, {
      scroll: false,
    })
  }

  const [holidayForm, setHolidayForm] = useState({
    holidayDate: "",
    name: "",
    scope: "one_time" as "one_time" | "annual",
    notes: "",
  })

  const [incidentForm, setIncidentForm] = useState({
    incidentDate: "",
    shift: "",
    machineId: "",
    description: "",
    durationMinutes: "",
  })

  const loadAll = useCallback(async () => {
    const token = await getAccessToken()
    if (!token) return
    setLoading(true)
    try {
      const [catalogRows, customRows, incidentRows, machineRows, thresholdRows] =
        await Promise.all([
          getCatalogHolidays(token, year),
          getCustomBusinessHolidays(token, { year }),
          getProductionIncidents(token, {
            from: `${year}-01-01`,
            to: `${year}-12-31`,
            incidentType: "electrical_failure",
            limit: 500,
          }),
          getMachines(token),
          getBusinessAlertThresholds(token),
        ])
      setCatalog(catalogRows)
      setCustomHolidays(customRows)
      setIncidents(incidentRows)
      setMachines(machineRows)
      setThresholds(thresholdRows)
    } catch {
      toast.error("No se pudieron cargar las reglas de negocio")
    } finally {
      setLoading(false)
    }
  }, [getAccessToken, year])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const customResolved = useMemo(
    () =>
      customHolidays.map((h) => ({
        ...h,
        resolvedDate: resolveCustomHolidayIso(h.holidayDate, h.scope, year),
      })),
    [customHolidays, year],
  )

  const allHolidaysSorted = useMemo(() => {
    const official = catalog.map((h) => ({
      id: `official-${h.date}`,
      date: h.date,
      name: h.name,
      kind: "official" as const,
    }))
    const custom = customResolved.map((h) => ({
      id: h.id,
      date: h.resolvedDate,
      name: h.name,
      kind: "custom" as const,
      scope: h.scope,
    }))
    return [...official, ...custom].sort((a, b) => a.date.localeCompare(b.date))
  }, [catalog, customResolved])

  const handleAddHoliday = async () => {
    const token = await getAccessToken()
    if (!token) return
    if (!holidayForm.holidayDate || !holidayForm.name.trim()) {
      toast.error("Fecha y nombre son obligatorios")
      return
    }
    try {
      await createBusinessHoliday(token, {
        holidayDate: holidayForm.holidayDate,
        name: holidayForm.name.trim(),
        scope: holidayForm.scope,
        notes: holidayForm.notes.trim() || null,
      })
      toast.success("Día festivo agregado")
      setHolidayForm({ holidayDate: "", name: "", scope: "one_time", notes: "" })
      await loadAll()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar festivo")
    }
  }

  const handleDeleteHoliday = async (id: string) => {
    const token = await getAccessToken()
    if (!token) return
    try {
      await deleteBusinessHoliday(token, id)
      toast.success("Festivo eliminado")
      await loadAll()
    } catch {
      toast.error("No se pudo eliminar el festivo")
    }
  }

  const handleAddIncident = async () => {
    const token = await getAccessToken()
    if (!token) return
    if (!incidentForm.incidentDate) {
      toast.error("La fecha es obligatoria")
      return
    }
    try {
      await createProductionIncident(token, {
        incidentDate: incidentForm.incidentDate,
        shift: incidentForm.shift || null,
        machineId: incidentForm.machineId || null,
        incidentType: "electrical_failure",
        description: incidentForm.description.trim() || null,
        durationMinutes: incidentForm.durationMinutes
          ? Number(incidentForm.durationMinutes)
          : null,
      })
      toast.success("Fallo eléctrico registrado")
      setIncidentForm({
        incidentDate: "",
        shift: "",
        machineId: "",
        description: "",
        durationMinutes: "",
      })
      await loadAll()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al registrar incidencia")
    }
  }

  const handleDeleteIncident = async (id: string) => {
    const token = await getAccessToken()
    if (!token) return
    try {
      await deleteProductionIncident(token, id)
      toast.success("Registro eliminado")
      await loadAll()
    } catch {
      toast.error("No se pudo eliminar el registro")
    }
  }

  const handleSaveThresholds = async () => {
    const token = await getAccessToken()
    if (!token) return
    setSavingThresholds(true)
    try {
      const saved = await updateBusinessAlertThresholds(token, thresholds)
      setThresholds(saved)
      toast.success("Umbrales guardados")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar umbrales")
    } finally {
      setSavingThresholds(false)
    }
  }

  return (
    <RequirePermission permission="business-rules.manage">
      <DashboardLayout>
        <div className="space-y-6 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                <Scale className="h-7 w-7 text-primary" />
                Reglas de negocio
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Festivos, fallos eléctricos, umbrales de alertas y configuración de bono mensual.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="rules-year" className="sr-only">
                Año
              </Label>
              <Input
                id="rules-year"
                type="number"
                min={2020}
                max={2100}
                className="w-28"
                value={year}
                onChange={(e) => setYear(Number(e.target.value) || currentYear)}
              />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Cargando…
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={setRulesTab} className="space-y-4">
              <TabsList className="grid w-full max-w-3xl grid-cols-4">
                <TabsTrigger value="holidays" className="gap-1.5">
                  <CalendarDays className="h-4 w-4" />
                  Festivos
                </TabsTrigger>
                <TabsTrigger value="electrical" className="gap-1.5">
                  <Zap className="h-4 w-4" />
                  Fallos eléctricos
                </TabsTrigger>
                <TabsTrigger value="thresholds" className="gap-1.5">
                  <Bell className="h-4 w-4" />
                  Umbrales
                </TabsTrigger>
                <TabsTrigger value="bono" className="gap-1.5">
                  <Target className="h-4 w-4" />
                  Config. bono
                </TabsTrigger>
              </TabsList>

              <TabsContent value="holidays" className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Calendario {year}</CardTitle>
                      <CardDescription>
                        Festivos oficiales de México y días adicionales de la planta.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="max-h-[420px] overflow-y-auto space-y-2">
                      {allHolidaysSorted.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Sin festivos en este año.</p>
                      ) : (
                        allHolidaysSorted.map((h) => (
                          <div
                            key={h.id}
                            className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                          >
                            <div>
                              <p className="font-medium">{h.name}</p>
                              <p className="text-xs text-muted-foreground">{formatDateEs(h.date)}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={h.kind === "official" ? "secondary" : "outline"}>
                                {h.kind === "official" ? "Oficial" : "Personalizado"}
                              </Badge>
                              {h.kind === "custom" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive"
                                  onClick={() => handleDeleteHoliday(h.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Agregar festivo</CardTitle>
                      <CardDescription>
                        Aparece como DF en el acumulado de bono junto con los oficiales.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-2">
                        <Label htmlFor="holiday-date">Fecha</Label>
                        <Input
                          id="holiday-date"
                          type="date"
                          value={holidayForm.holidayDate}
                          onChange={(e) =>
                            setHolidayForm((f) => ({ ...f, holidayDate: e.target.value }))
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="holiday-name">Nombre</Label>
                        <Input
                          id="holiday-name"
                          placeholder="Ej. Puente administrativo"
                          value={holidayForm.name}
                          onChange={(e) => setHolidayForm((f) => ({ ...f, name: e.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Repetición</Label>
                        <Select
                          value={holidayForm.scope}
                          onValueChange={(v) =>
                            setHolidayForm((f) => ({
                              ...f,
                              scope: v as "one_time" | "annual",
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="one_time">Solo este año</SelectItem>
                            <SelectItem value="annual">Cada año (misma fecha)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="holiday-notes">Notas (opcional)</Label>
                        <Textarea
                          id="holiday-notes"
                          rows={2}
                          value={holidayForm.notes}
                          onChange={(e) => setHolidayForm((f) => ({ ...f, notes: e.target.value }))}
                        />
                      </div>
                      <Button onClick={handleAddHoliday} className="w-full">
                        <Plus className="h-4 w-4 mr-2" />
                        Agregar festivo
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="electrical" className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Registros {year}</CardTitle>
                      <CardDescription>
                        Días u horas con fallo eléctrico que afectaron producción.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="max-h-[420px] overflow-y-auto space-y-2">
                      {incidents.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Sin registros este año.</p>
                      ) : (
                        incidents.map((inc) => (
                          <div
                            key={inc.id}
                            className="rounded-lg border border-border px-3 py-2 text-sm space-y-1"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-medium">{formatDateEs(inc.incidentDate)}</p>
                                <p className="text-xs text-muted-foreground">
                                  {inc.shift ? `Turno: ${inc.shift}` : "Todo el día"}
                                  {inc.machine?.name ? ` · ${inc.machine.name}` : ""}
                                  {inc.durationMinutes != null
                                    ? ` · ${inc.durationMinutes} min`
                                    : ""}
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive shrink-0"
                                onClick={() => handleDeleteIncident(inc.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                            {inc.description ? (
                              <p className="text-xs text-muted-foreground">{inc.description}</p>
                            ) : null}
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Registrar fallo eléctrico</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-2">
                        <Label htmlFor="incident-date">Fecha</Label>
                        <Input
                          id="incident-date"
                          type="date"
                          value={incidentForm.incidentDate}
                          onChange={(e) =>
                            setIncidentForm((f) => ({ ...f, incidentDate: e.target.value }))
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Turno</Label>
                        <Select
                          value={incidentForm.shift || "all"}
                          onValueChange={(v) =>
                            setIncidentForm((f) => ({
                              ...f,
                              shift: v === "all" ? "" : v,
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Todo el día" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todo el día</SelectItem>
                            <SelectItem value="matutino">Matutino</SelectItem>
                            <SelectItem value="vespertino">Vespertino</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label>Máquina (opcional)</Label>
                        <Select
                          value={incidentForm.machineId || "none"}
                          onValueChange={(v) =>
                            setIncidentForm((f) => ({
                              ...f,
                              machineId: v === "none" ? "" : v,
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Toda la planta" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Toda la planta / línea</SelectItem>
                            {machines.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.name}
                                {m.code ? ` (${m.code})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="incident-duration">Duración (minutos)</Label>
                        <Input
                          id="incident-duration"
                          type="number"
                          min={0}
                          placeholder="Opcional"
                          value={incidentForm.durationMinutes}
                          onChange={(e) =>
                            setIncidentForm((f) => ({ ...f, durationMinutes: e.target.value }))
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="incident-desc">Descripción</Label>
                        <Textarea
                          id="incident-desc"
                          rows={3}
                          placeholder="Ej. Corte de energía por la tarde, línea turbo"
                          value={incidentForm.description}
                          onChange={(e) =>
                            setIncidentForm((f) => ({ ...f, description: e.target.value }))
                          }
                        />
                      </div>
                      <Button onClick={handleAddIncident} className="w-full">
                        <Zap className="h-4 w-4 mr-2" />
                        Registrar fallo
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="thresholds">
                <Card className="max-w-3xl">
                  <CardHeader>
                    <CardTitle className="text-lg">Umbrales de alertas</CardTitle>
                    <CardDescription>
                      Valores por defecto para la vista de Alertas y detección de paros.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="grid gap-2">
                        <Label>Minutos sin producción (paro)</Label>
                        <Input
                          type="number"
                          min={1}
                          max={240}
                          value={thresholds.idleMinutesWithoutProduction}
                          onChange={(e) =>
                            setThresholds((t) => ({
                              ...t,
                              idleMinutesWithoutProduction: Number(e.target.value) || 1,
                            }))
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Scrap — alerta (%)</Label>
                        <Input
                          type="number"
                          min={1}
                          max={100}
                          value={thresholds.scrapPercentWarning}
                          onChange={(e) =>
                            setThresholds((t) => ({
                              ...t,
                              scrapPercentWarning: Number(e.target.value) || 1,
                            }))
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Scrap metal — costo por kg (MXN)</Label>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={thresholds.scrapMetalCostPerKgMxn}
                          onChange={(e) =>
                            setThresholds((t) => ({
                              ...t,
                              scrapMetalCostPerKgMxn: Number(e.target.value) || 0,
                            }))
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Scrap twine/rafia — costo por kg (MXN)</Label>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={thresholds.scrapTwineCostPerKgMxn}
                          onChange={(e) =>
                            setThresholds((t) => ({
                              ...t,
                              scrapTwineCostPerKgMxn: Number(e.target.value) || 0,
                            }))
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Producción baja (% de meta)</Label>
                        <Input
                          type="number"
                          min={1}
                          max={100}
                          value={thresholds.lowProductionPercent}
                          onChange={(e) =>
                            setThresholds((t) => ({
                              ...t,
                              lowProductionPercent: Number(e.target.value) || 1,
                            }))
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Producción crítica (% de meta)</Label>
                        <Input
                          type="number"
                          min={1}
                          max={100}
                          value={thresholds.criticalProductionPercent}
                          onChange={(e) =>
                            setThresholds((t) => ({
                              ...t,
                              criticalProductionPercent: Number(e.target.value) || 1,
                            }))
                          }
                        />
                      </div>
                    </div>
                    <Button onClick={handleSaveThresholds} disabled={savingThresholds}>
                      {savingThresholds ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      Guardar umbrales
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="bono" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Configuración de bono</CardTitle>
                    <CardDescription>
                      Metas por área: Winding, Bending (81 600 fijo por turno) y Roller, más reglas
                      de bono por mes. Al guardar se sincronizan las metas en Metas y los reportes
                      Excel.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <BonusConfigPanel />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </DashboardLayout>
    </RequirePermission>
  )
}
