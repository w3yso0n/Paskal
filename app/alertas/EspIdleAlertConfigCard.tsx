"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Cpu, Loader2, Send } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { ApiMachine } from "@/lib/api"
import {
  getEspIdlePrefsForMachine,
  joinDeviceUrl,
  saveEspIdlePrefsForMachine,
} from "@/lib/esp-idle-device-storage"

const DEFAULT_PATH = "/api/idle-alert-timers"

type Props = {
  machines: ApiMachine[]
  canConfigure: boolean
}

export function EspIdleAlertConfigCard({ machines, canConfigure }: Props) {
  const withCode = useMemo(
    () => machines.filter((m) => (m.code ?? "").trim().length > 0),
    [machines],
  )

  const [machineId, setMachineId] = useState<string>("")
  const [baseUrl, setBaseUrl] = useState("")
  const [path, setPath] = useState(DEFAULT_PATH)
  const [firstMinutes, setFirstMinutes] = useState(15)
  const [repeatMinutes, setRepeatMinutes] = useState(45)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (withCode.length === 0) {
      setMachineId("")
      return
    }
    setMachineId((cur) => {
      if (cur && withCode.some((m) => m.id === cur)) return cur
      return withCode[0].id
    })
  }, [withCode])

  useEffect(() => {
    if (!machineId) return
    const saved = getEspIdlePrefsForMachine(machineId)
    if (saved) {
      setBaseUrl(saved.baseUrl)
      setPath(saved.path || DEFAULT_PATH)
    } else {
      setBaseUrl("")
      setPath(DEFAULT_PATH)
    }
  }, [machineId])

  const selected = useMemo(
    () => withCode.find((m) => m.id === machineId) ?? null,
    [withCode, machineId],
  )

  const persistAddress = useCallback(() => {
    if (!machineId) return
    saveEspIdlePrefsForMachine(machineId, {
      baseUrl: baseUrl.trim(),
      path: path.trim() || DEFAULT_PATH,
    })
  }, [machineId, baseUrl, path])

  const handleSendToEsp = async () => {
    if (!canConfigure) {
      toast.error("Solo administradores pueden enviar esta configuración al dispositivo.")
      return
    }
    if (!selected?.code?.trim()) {
      toast.error("La máquina debe tener un código (se envía a la ESP como machineCode).")
      return
    }
    const b = baseUrl.trim()
    if (!b) {
      toast.error("Indica la URL base del dispositivo (ej. http://192.168.4.1).")
      return
    }
    if (firstMinutes < 1 || repeatMinutes < 1) {
      toast.error("Los tiempos deben ser al menos 1 minuto.")
      return
    }
    if (repeatMinutes < firstMinutes) {
      toast.warning(
        "El reenvío es menor que la primera alerta; la ESP puede ignorarlo o ajustar lógica según firmware.",
      )
    }

    const url = joinDeviceUrl(b, path.trim() || DEFAULT_PATH)
    const body = {
      firstAlertMinutes: Math.round(firstMinutes),
      repeatAlertMinutes: Math.round(repeatMinutes),
      machineCode: selected.code.trim(),
    }

    persistAddress()
    setSending(true)
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => "")
        throw new Error(text || `HTTP ${res.status}`)
      }
      toast.success("Configuración enviada al dispositivo.")
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error de red"
      toast.error(
        `No se pudo contactar la ESP (${msg}). Revisa URL, que el equipo esté en red y CORS si usas HTTPS → HTTP.`,
      )
    } finally {
      setSending(false)
    }
  }

  if (!canConfigure) return null

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Cpu className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <CardTitle>Tiempos de alerta por paro (ESP32)</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Solo administradores. Envía a la dirección del dispositivo cuántos minutos sin
              producción deben pasar antes de notificar. Con firmware Droven, la ESP envía{" "}
              <code className="rounded bg-muted px-1 text-xs">ALERT_15</code> y{" "}
              <code className="rounded bg-muted px-1 text-xs">ALERT_45</code> en el batch{" "}
              <code className="rounded bg-muted px-1 text-xs">POST /production-event/ingest</code>{" "}
              (ya no usa <code className="rounded bg-muted px-1 text-xs">/machine-stop-alert</code>).
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {withCode.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay máquinas con código asignado. El código es el que la ESP usa como{" "}
            <code className="rounded bg-muted px-1 text-xs">MACHINE_ID</code>.
          </p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2 sm:col-span-2">
                <Label>Máquina</Label>
                <Select value={machineId} onValueChange={setMachineId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona máquina" />
                  </SelectTrigger>
                  <SelectContent>
                    {withCode.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name} ({m.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="esp-base-url">URL base del dispositivo</Label>
                <Input
                  id="esp-base-url"
                  placeholder="http://192.168.4.1"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  onBlur={persistAddress}
                />
                <p className="text-xs text-muted-foreground">
                  Se guarda en este navegador por máquina. Ej.: IP del AP del ESP o URL fija en LAN.
                </p>
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="esp-path">Ruta del endpoint en la ESP</Label>
                <Input
                  id="esp-path"
                  placeholder={DEFAULT_PATH}
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  onBlur={persistAddress}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="esp-first">Primera alerta (min)</Label>
                <Input
                  id="esp-first"
                  type="number"
                  min={1}
                  max={10080}
                  value={firstMinutes}
                  onChange={(e) =>
                    setFirstMinutes(Math.max(1, Math.min(10080, Number(e.target.value) || 1)))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="esp-repeat">Reenvío / segunda alerta (min)</Label>
                <Input
                  id="esp-repeat"
                  type="number"
                  min={1}
                  max={10080}
                  value={repeatMinutes}
                  onChange={(e) =>
                    setRepeatMinutes(Math.max(1, Math.min(10080, Number(e.target.value) || 1)))
                  }
                />
              </div>
            </div>

            <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Contrato sugerido (POST al dispositivo)</p>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded bg-background p-2 text-[11px] leading-relaxed">
                {`POST ${joinDeviceUrl(baseUrl.trim() || "http://ESP_IP", path.trim() || DEFAULT_PATH)}
Content-Type: application/json

${JSON.stringify(
  {
    firstAlertMinutes: Math.round(firstMinutes),
    repeatAlertMinutes: Math.round(repeatMinutes),
    machineCode: selected?.code ?? "M-001",
  },
  null,
  2,
)}`}
              </pre>
              <p className="mt-2">
                La ESP debe aplicar esos temporizadores y, al dispararse, enviar al backend un
                evento en <code className="rounded bg-background px-1">POST /production-event/ingest</code>{" "}
                con <code className="rounded bg-background px-1">EVENT: &quot;ALERT_15&quot;</code> o{" "}
                <code className="rounded bg-background px-1">&quot;ALERT_45&quot;</code> y{" "}
                <code className="rounded bg-background px-1">COUNT: 0.0</code> (contrato Droven).
              </p>
            </div>

            <Button type="button" onClick={handleSendToEsp} disabled={sending} className="gap-2">
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Enviar configuración a la ESP
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
