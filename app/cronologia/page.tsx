"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { RequireModule } from "@/components/auth/require-module"
import { useAuth } from "@/contexts/auth-context"
import {
  attributeOrphanProduction,
  getAlerts,
  getApiErrorMessage,
  getEmployees,
  getMachines,
  getProductionEvents,
  getProductSkus,
  type ApiAlert,
  type ApiEmployee,
  type ApiMachine,
  type ApiProductionEvent,
  type ApiProductSku,
} from "@/lib/api"
import {
  buildCronoContext,
  buildMachineAccents,
  buildMachinePresenceLanes,
  buildTimeline,
  computeCronologiaWindow,
  personCodeSet,
  shiftChangeMoment,
  type CronologiaMode,
  type TimelineItem,
  formatUnits,
} from "@/lib/cronologia"
import { isFloorOperatorCandidate, isFloorPackerCandidate } from "@/lib/employee-production-role"
import { TimelineBand } from "@/components/cronologia/timeline-band"
import { TimelineList } from "@/components/cronologia/timeline-list"
import { PLANT_TIMEZONE } from "@/lib/tablero-operator-goal"
import { getPartsInTimeZone } from "@/lib/shift-timezone"
import { ALERTS_POLL_MS } from "@/lib/alert-ui"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TextAutocomplete, type TextAutocompleteOption } from "@/components/ui/text-autocomplete"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { ChevronLeft, ChevronRight, Factory, History, Loader2, RefreshCw, User } from "lucide-react"
import { toast } from "sonner"

/** Tope de eventos por consulta; si llega justo al tope el día viene truncado. */
const EVENTS_LIMIT = 5000

/** Fecha `yyyy-mm-dd` de HOY en zona de planta (no del navegador). */
function todayPlantIso(): string {
  const p = getPartsInTimeZone(new Date(), PLANT_TIMEZONE)
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`
}

/** Suma `delta` días a una fecha `yyyy-mm-dd` (aritmética de calendario, sin zonas). */
function addDaysIso(iso: string, delta: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + delta, 12))
  return d.toISOString().slice(0, 10)
}

export default function CronologiaPage() {
  const { getAccessToken } = useAuth()

  // Catálogos base
  const [machines, setMachines] = useState<ApiMachine[]>([])
  const [employees, setEmployees] = useState<ApiEmployee[]>([])
  const [skus, setSkus] = useState<ApiProductSku[]>([])

  // Atribución de piezas pendientes (mismo flujo que en Alertas)
  const [assignItem, setAssignItem] = useState<TimelineItem | null>(null)
  const [assignPerson, setAssignPerson] = useState("")
  const [assignSku, setAssignSku] = useState("")
  const [assigning, setAssigning] = useState(false)

  // Selección
  const [mode, setMode] = useState<CronologiaMode>("machine")
  const [machineId, setMachineId] = useState("")
  const [personCode, setPersonCode] = useState("")
  const [dateIso, setDateIso] = useState(todayPlantIso)

  // Datos del timeline
  const [events, setEvents] = useState<ApiProductionEvent[] | null>(null)
  const [alerts, setAlerts] = useState<ApiAlert[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const highlightTimer = useRef<number | null>(null)

  const hasSelection = mode === "machine" ? Boolean(machineId) : Boolean(personCode)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const token = await getAccessToken()
        if (!token) return
        const [machineRows, employeeRows, skuRows] = await Promise.all([
          getMachines(token),
          getEmployees(token),
          getProductSkus(token).catch(() => [] as ApiProductSku[]),
        ])
        if (cancelled) return
        setMachines(machineRows)
        setEmployees(employeeRows)
        setSkus(skuRows)
      } catch (err) {
        if (!cancelled) toast.error(getApiErrorMessage(err))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [getAccessToken])

  // Siempre día completo: la cronología cuenta la historia entera — de la máquina en su día, o
  // del operador en todo aquello en lo que estuvo involucrado sin importar la hora.
  const window_ = useMemo(() => computeCronologiaWindow(dateIso, "all"), [dateIso])

  const loadTimeline = useCallback(
    async (silent = false) => {
      if (!hasSelection || !window_) {
        setEvents(null)
        setAlerts([])
        return
      }
      if (silent) setRefreshing(true)
      else setLoading(true)
      try {
        const token = await getAccessToken()
        if (!token) return
        const range = { from: window_.from, to: window_.toExclusive }
        // Modo operador: se pide el día completo de TODAS las máquinas (tras el rollup horario
        // el volumen es manejable) y se filtra por persona en cliente — no hay filtro por
        // operador en el backend.
        const [eventRows, alertRows] = await Promise.all([
          getProductionEvents(token, {
            ...(mode === "machine" ? { machineId } : {}),
            ...range,
            limit: EVENTS_LIMIT,
          }),
          // OJO: alertas sin máquina (p. ej. plant_outage) quedan fuera en modo máquina por el
          // filtro server-side; aceptado para mantener una sola consulta simple.
          getAlerts(token, {
            ...(mode === "machine" ? { machineId } : {}),
            ...range,
            limit: 1000,
          }),
        ])
        setEvents(eventRows)
        setAlerts(alertRows)
      } catch (err) {
        toast.error(getApiErrorMessage(err))
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [getAccessToken, hasSelection, machineId, mode, window_],
  )

  useEffect(() => {
    void loadTimeline()
  }, [loadTimeline])

  // Auto-refresh solo cuando se está viendo el día de HOY (patrón del centro de alertas).
  useEffect(() => {
    if (!hasSelection || dateIso !== todayPlantIso()) return
    const id = window.setInterval(() => void loadTimeline(true), ALERTS_POLL_MS)
    return () => window.clearInterval(id)
  }, [dateIso, hasSelection, loadTimeline])

  const ctx = useMemo(() => buildCronoContext(employees, machines), [employees, machines])

  const selectedEmployee = useMemo(
    () => employees.find((e) => e.employeeCode === personCode) ?? null,
    [employees, personCode],
  )

  const result = useMemo(() => {
    if (!events) return null
    return buildTimeline({
      events,
      alerts,
      mode,
      personCodes: selectedEmployee ? personCodeSet(selectedEmployee) : undefined,
      personName: selectedEmployee?.fullName,
      ctx,
      window: window_ ? { bandStart: window_.bandStart, bandEnd: window_.bandEnd } : undefined,
      // EN VIVO: el "ahora" avanza con cada refresco de datos (poll cada ALERTS_POLL_MS).
      nowMs: dateIso === todayPlantIso() ? Date.now() : null,
    })
  }, [alerts, ctx, dateIso, events, mode, selectedEmployee, window_])

  // Modo operador: color de identidad por máquina (carriles de la banda + badges del listado)
  // para distinguir de un vistazo qué pasó en cada máquina donde estuvo la persona.
  const machineAccents = useMemo(
    () => (mode === "operator" && result ? buildMachineAccents(result.items) : undefined),
    [mode, result],
  )

  // Modo máquina (espejo): carril de presencia por persona — quién estaba dentro en cada momento.
  const presenceLanes = useMemo(
    () =>
      mode === "machine" && events && window_
        ? buildMachinePresenceLanes(
            events,
            ctx,
            window_.bandStart,
            window_.bandEnd,
            dateIso === todayPlantIso() ? Date.now() : undefined,
          )
        : undefined,
    [ctx, dateIso, events, mode, window_],
  )

  const partialData = events !== null && events.length >= EVENTS_LIMIT

  const machineOptions = useMemo(
    () =>
      [...machines]
        .filter((m) => m.code)
        .sort((a, b) => (a.code ?? "").localeCompare(b.code ?? "", "es-MX", { numeric: true })),
    [machines],
  )

  // Solo operadoras (rol primordial operador, o empaque cubriendo como operadora): la
  // cronología por persona cuenta la historia de quien OPERA la máquina.
  const personOptions = useMemo<TextAutocompleteOption[]>(
    () =>
      employees
        .filter((e) => e.employeeCode && isFloorOperatorCandidate(e))
        .sort((a, b) => a.fullName.localeCompare(b.fullName, "es-MX"))
        .map((e) => ({
          value: e.employeeCode as string,
          label: e.fullName,
          hint: e.employeeCode ?? undefined,
        })),
    [employees],
  )

  const handleSelectFromBand = useCallback((anchorId: string) => {
    setHighlightId(anchorId)
    const el = document.getElementById(anchorId)
    el?.scrollIntoView({ behavior: "smooth", block: "center" })
    // El foco sigue el salto (teclado/lector de pantalla continúan en el detalle).
    ;(el as HTMLElement | null)?.focus({ preventScroll: true })
    if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current)
    highlightTimer.current = window.setTimeout(() => setHighlightId(null), 2000)
  }, [])

  useEffect(
    () => () => {
      if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current)
    },
    [],
  )

  const assignTargetsPackager = assignItem?.attribution?.target === "packager"
  const assignCandidates = useMemo(
    () =>
      employees.filter((e) =>
        e.employeeCode && (assignTargetsPackager ? isFloorPackerCandidate(e) : isFloorOperatorCandidate(e)),
      ),
    [employees, assignTargetsPackager],
  )

  const openAssign = useCallback((item: TimelineItem) => {
    setAssignPerson("")
    setAssignSku("")
    setAssignItem(item)
  }, [])

  const submitAssign = useCallback(async () => {
    const attribution = assignItem?.attribution
    if (!attribution || !assignItem?.machineId || !assignPerson) return
    setAssigning(true)
    try {
      const token = await getAccessToken()
      if (!token) {
        toast.error("Sesión no válida o expirada.")
        return
      }
      const res = await attributeOrphanProduction(token, assignItem.machineId, {
        alertId: attribution.alertId,
        operatorCode: attribution.target === "operator" ? assignPerson : null,
        packager1Code: attribution.target === "packager" ? assignPerson : null,
        sku: attribution.target === "operator" ? assignSku || null : null,
      })
      const roleLabel = attribution.target === "packager" ? "empacador" : "operador"
      if (res.assigned) {
        toast.success(`Se atribuyeron ${res.attributed} piezas y quedó asignado a la máquina.`)
      } else {
        toast.warning(
          res.assignError
            ? `Se atribuyeron ${res.attributed} piezas, pero no se pudo asignar el ${roleLabel}: ${res.assignError}`
            : `Se atribuyeron ${res.attributed} piezas.`,
        )
      }
      setAssignItem(null)
      await loadTimeline(true)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    } finally {
      setAssigning(false)
    }
  }, [assignItem, assignPerson, assignSku, getAccessToken, loadTimeline])

  const subjectLabel =
    mode === "machine"
      ? machineOptions.find((m) => m.id === machineId)?.code ?? null
      : selectedEmployee?.fullName ?? null

  const isToday = dateIso === todayPlantIso()
  const shiftChangeAt = useMemo(() => shiftChangeMoment(dateIso), [dateIso])

  // Navegación cruzada: de la historia de una operadora a la de su máquina y viceversa,
  // conservando el día. Empacadoras puras no tienen cronología propia (se ven en su máquina).
  const goToMachine = useCallback(
    (machineCode: string) => {
      const m = machines.find((x) => x.code?.trim() === machineCode)
      if (!m) return
      setMode("machine")
      setMachineId(m.id)
    },
    [machines],
  )
  const goToPerson = useCallback(
    (code: string) => {
      const emp = employees.find((e) => e.employeeCode?.trim() === code.trim())
      if (!emp) return
      if (!isFloorOperatorCandidate(emp)) {
        toast.info("Las empacadoras se consultan desde la cronología de su máquina.")
        return
      }
      setMode("operator")
      setPersonCode(emp.employeeCode as string)
    },
    [employees],
  )

  return (
    <DashboardLayout breadcrumbs={[{ label: "Inicio", href: "/" }, { label: "Cronología" }]}>
      <RequireModule modules={["cronologia"]}>
        <div className="space-y-6">
          {/* Encabezado */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <History className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Cronología</h1>
                <p className="text-sm text-muted-foreground">
                  Línea de tiempo de los sucesos de una máquina u operador por día y turno
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => void loadTimeline(true)}
              disabled={!hasSelection || loading || refreshing}
              aria-label="Actualizar"
              title="Actualizar"
            >
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            </Button>
          </div>

          {/* Controles */}
          <Card>
            <CardContent className="flex flex-wrap items-end gap-4 pt-6">
              <div className="space-y-1.5">
                <Label>Ver por</Label>
                <ToggleGroup
                  type="single"
                  value={mode}
                  onValueChange={(v) => {
                    if (v === "machine" || v === "operator") setMode(v)
                  }}
                  className="justify-start gap-2"
                >
                  <ToggleGroupItem value="machine" size="sm" className="rounded-md px-3 shadow-none">
                    <Factory className="mr-1.5 h-4 w-4" />
                    Máquina
                  </ToggleGroupItem>
                  <ToggleGroupItem value="operator" size="sm" className="rounded-md px-3 shadow-none">
                    <User className="mr-1.5 h-4 w-4" />
                    Operador
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>

              {mode === "machine" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="crono-machine">Máquina</Label>
                  <Select value={machineId} onValueChange={setMachineId}>
                    <SelectTrigger id="crono-machine" className="w-44">
                      <SelectValue placeholder="Elegir máquina" />
                    </SelectTrigger>
                    <SelectContent>
                      {machineOptions.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="crono-person">Operadora</Label>
                  <TextAutocomplete
                    id="crono-person"
                    value={personCode}
                    onValueChange={setPersonCode}
                    options={personOptions}
                    placeholder="Escribe un nombre…"
                    className="w-64"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="crono-date">Día</Label>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => setDateIso((d) => addDaysIso(d, -1))}
                    aria-label="Día anterior"
                    title="Día anterior"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <input
                    id="crono-date"
                    type="date"
                    value={dateIso}
                    max={todayPlantIso()}
                    onChange={(e) => {
                      // Borrar la fecha dejaba la vista en blanco: se ignora el vacío.
                      if (e.target.value) setDateIso(e.target.value)
                    }}
                    className={cn(
                      "h-9 rounded-md border border-input bg-background px-3 text-sm",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    )}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => setDateIso((d) => addDaysIso(d, 1))}
                    disabled={isToday}
                    aria-label="Día siguiente"
                    title="Día siguiente"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  {!isToday ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9"
                      onClick={() => setDateIso(todayPlantIso())}
                    >
                      Hoy
                    </Button>
                  ) : null}
                </div>
              </div>

            </CardContent>
          </Card>

          {/* Contenido */}
          {!hasSelection ? (
            <Card>
              <CardContent className="py-16 text-center text-sm text-muted-foreground">
                Elige una máquina o un operador para ver su cronología del día.
              </CardContent>
            </Card>
          ) : loading && !result ? (
            <Card>
              <CardContent className="space-y-4 pt-6">
                <div className="h-20 animate-pulse rounded-md bg-muted" />
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : result && window_ ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base">
                  <span>{subjectLabel ?? "Cronología"} · día completo</span>
                  {/* EN VIVO (hoy, con auto-refresh corriendo) vs Histórico (día pasado). */}
                  {isToday ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                      </span>
                      EN VIVO
                    </span>
                  ) : (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                      Histórico
                    </span>
                  )}
                  <span className="text-sm font-normal text-muted-foreground">
                    {result.items.length} sucesos · {result.alertCount} alertas · Total del día:{" "}
                    {formatUnits(result.totalUnits)} pzas
                    {result.orphanUnits > 0
                      ? ` (${formatUnits(result.orphanUnits)} sin atribuir)`
                      : ""}
                  </span>
                </CardTitle>
                {partialData ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Se alcanzó el tope de {formatUnits(EVENTS_LIMIT)} eventos: la cronología puede
                    estar incompleta.
                  </p>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-6">
                {result.items.length === 0 ? (
                  <div className="space-y-4 py-10 text-center">
                    <p className="text-sm text-muted-foreground">
                      Sin sucesos registrados de {subjectLabel ?? "esta selección"} ese día.
                    </p>
                    <div className="flex justify-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setDateIso((d) => addDaysIso(d, -1))}>
                        Ver día anterior
                      </Button>
                      {!isToday ? (
                        <Button variant="outline" size="sm" onClick={() => setDateIso(todayPlantIso())}>
                          Ir a hoy
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <>
                    <TimelineBand
                      items={result.items}
                      statusSegments={result.statusSegments}
                      bandStart={window_.bandStart}
                      bandEnd={window_.bandEnd}
                      nowMs={isToday ? Date.now() : null}
                      machineAccents={machineAccents}
                      presenceLanes={presenceLanes}
                      shiftChangeAt={shiftChangeAt}
                      onMachineLaneClick={mode === "operator" ? goToMachine : undefined}
                      onPersonLaneClick={mode === "machine" ? goToPerson : undefined}
                      onSelect={handleSelectFromBand}
                    />
                    <TimelineList
                      items={result.items}
                      totalUnits={result.totalUnits}
                      orphanUnits={result.orphanUnits}
                      highlightId={highlightId}
                      showMachine={mode === "operator"}
                      machineAccents={machineAccents}
                      shiftChangeAt={shiftChangeAt}
                      onMachineClick={mode === "operator" ? goToMachine : undefined}
                      onPersonClick={mode === "machine" ? goToPerson : undefined}
                      onAttribute={openAssign}
                    />
                  </>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* Diálogo de atribución de piezas pendientes (mismo flujo que en Alertas) */}
        <Dialog open={assignItem !== null} onOpenChange={(o) => !o && setAssignItem(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Asignar {assignTargetsPackager ? "empacador" : "producción huérfana"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Hay{" "}
                <span className="font-medium text-foreground">
                  {formatUnits(assignItem?.attribution?.units ?? 0)} piezas
                </span>{" "}
                producidas sin {assignTargetsPackager ? "empacador asignado" : "estar en verde"}.
                Elige el {assignTargetsPackager ? "empacador" : "operador"}
                {assignTargetsPackager ? "" : " y SKU"} a quien se le acreditarán.
              </p>
              <div className="space-y-1.5">
                <Label>{assignTargetsPackager ? "Empacador" : "Operador"}</Label>
                <Select value={assignPerson} onValueChange={setAssignPerson}>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={assignTargetsPackager ? "Selecciona empacador" : "Selecciona operador"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {assignCandidates.map((e) => (
                      <SelectItem key={e.id} value={e.employeeCode as string}>
                        {e.fullName}
                        {e.nfcCardUid ? ` (NFC: ${e.nfcCardUid})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!assignTargetsPackager ? (
                <div className="space-y-1.5">
                  <Label>SKU (opcional — si no, el actual de la máquina)</Label>
                  <Select value={assignSku} onValueChange={setAssignSku}>
                    <SelectTrigger>
                      <SelectValue placeholder="SKU" />
                    </SelectTrigger>
                    <SelectContent>
                      {skus.map((s) => (
                        <SelectItem key={s.id} value={s.code}>
                          {s.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setAssignItem(null)} disabled={assigning}>
                  Cancelar
                </Button>
                <Button onClick={submitAssign} disabled={assigning || !assignPerson}>
                  {assigning && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  Atribuir
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </RequireModule>
    </DashboardLayout>
  )
}
