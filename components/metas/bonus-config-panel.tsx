"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Save, Plus } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import {
  createGoal,
  getGoals,
  updateGoal,
  getBonusProductionConfigs,
  upsertBonusProductionConfig,
  type ApiBonusProductionConfig,
} from "@/lib/api"
import {
  BENDING_MONTHLY_META_PER_SHIFT,
  DEFAULT_BONUS_PRODUCTION_CONFIG,
  meta110From100,
  monthlyMeta100FromDaily,
  monthlyMeta110FromDaily,
  normalizeBonusProductionConfig,
  type BonusProductionConfigData,
} from "@/lib/bonus-production-config"
import {
  bonusConfigToGoalDefinitions,
  buildGoalPayloadFromDefinition,
  goalMatchesBonusDefinition,
  monthDateBounds,
} from "@/lib/bonus-goals-bridge"

function NumField({
  label,
  value,
  onChange,
  step = 1,
  disabled = false,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
  disabled?: boolean
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        step={step}
        disabled={disabled}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </div>
  )
}

function ReadOnlyField({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="text"
        readOnly
        disabled
        className="bg-muted/50"
        value={value.toLocaleString("es-MX", { maximumFractionDigits: 0 })}
      />
    </div>
  )
}

function WindingShiftSection({
  config,
  onChange,
}: {
  config: BonusProductionConfigData
  onChange: (next: BonusProductionConfigData) => void
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {(["shift1", "shift2"] as const).map((sk, idx) => {
        const shiftLabel = idx === 0 ? "Turno 1" : "Turno 2"
        const winding = config.winding[sk]
        const daily110 = meta110From100(winding.dailyMeta100)
        const monthly100 = monthlyMeta100FromDaily(
          winding.dailyMeta100,
          winding.workingDaysPerMonth,
        )
        const monthly110 = monthlyMeta110FromDaily(
          winding.dailyMeta100,
          winding.workingDaysPerMonth,
        )

        const updateWinding = (patch: Partial<typeof winding>) =>
          onChange({
            ...config,
            winding: {
              ...config.winding,
              [sk]: { ...winding, ...patch },
            },
          })

        return (
          <div key={sk} className="rounded-lg border border-border p-4 space-y-4">
            <h3 className="font-semibold text-foreground">Winding — {shiftLabel}</h3>
            <div className="grid grid-cols-2 gap-3">
              <NumField
                label="Meta diaria 100% (piezas)"
                value={winding.dailyMeta100}
                onChange={(v) => updateWinding({ dailyMeta100: v })}
              />
              <ReadOnlyField label="Meta diaria 110% (auto)" value={daily110} />
              <NumField
                label="Días laborables / mes"
                value={winding.workingDaysPerMonth}
                onChange={(v) => updateWinding({ workingDaysPerMonth: v })}
              />
              <ReadOnlyField label="Meta mensual 100% (auto)" value={monthly100} />
              <ReadOnlyField label="Meta mensual 110% (auto)" value={monthly110} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function BendingShiftSection({ config }: { config: BonusProductionConfigData }) {
  const workingDays = config.winding.shift1.workingDaysPerMonth || 20

  return (
    <div className="grid gap-6 lg:grid-cols-2 max-w-4xl">
      {(["shift1", "shift2"] as const).map((sk, idx) => {
        const shiftLabel = idx === 0 ? "Turno 1" : "Turno 2"
        const bending = config.bending[sk]
        const monthly110 = meta110From100(bending.monthlyMeta100)
        const daily100 = Math.round(bending.monthlyMeta100 / workingDays)

        return (
          <div key={sk} className="rounded-lg border border-border p-4 space-y-4">
            <h3 className="font-semibold text-foreground">Bending — {shiftLabel}</h3>
            <div className="grid grid-cols-2 gap-3">
              <ReadOnlyField label="Meta mensual 100% (fija)" value={bending.monthlyMeta100} />
              <ReadOnlyField label="Meta mensual 110% (auto)" value={monthly110} />
              <ReadOnlyField
                label={`Meta diaria derivada (${workingDays} días)`}
                value={daily100}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

async function syncGoalsFromBonusConfig(
  token: string,
  config: BonusProductionConfigData,
  effectiveMonth: string,
): Promise<number> {
  const bounds = monthDateBounds(effectiveMonth)
  const definitions = bonusConfigToGoalDefinitions(config)
  const existing = await getGoals(token)
  let synced = 0

  for (const def of definitions) {
    const payload = buildGoalPayloadFromDefinition(def, bounds)
    const match = existing.find((g) =>
      goalMatchesBonusDefinition(g, def, bounds),
    )
    if (match) {
      await updateGoal(token, match.id, {
        targetValue: payload.targetValue,
        period: payload.period,
        shift: payload.shift,
        startDate: payload.startDate,
        endDate: payload.endDate,
      })
    } else {
      await createGoal(token, payload)
    }
    synced += 1
  }
  return synced
}

type BonusConfigPanelProps = {
  onSaved?: () => void
}

export function BonusConfigPanel({ onSaved }: BonusConfigPanelProps) {
  const { getAccessToken } = useAuth()
  const [versions, setVersions] = useState<ApiBonusProductionConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [effectiveMonth, setEffectiveMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  })
  const [configName, setConfigName] = useState("Configuración de bono")
  const [config, setConfig] = useState<BonusProductionConfigData>(DEFAULT_BONUS_PRODUCTION_CONFIG)

  const loadVersions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = await getAccessToken()
      if (!token) return
      const rows = await getBonusProductionConfigs(token)
      setVersions(rows)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar")
    } finally {
      setLoading(false)
    }
  }, [getAccessToken])

  useEffect(() => {
    loadVersions()
  }, [loadVersions])

  useEffect(() => {
    const match = versions.find((r) => r.effectiveMonth === effectiveMonth)
    if (match) {
      setConfig(normalizeBonusProductionConfig(match.config))
      setConfigName(match.name)
    } else {
      setConfig(structuredClone(DEFAULT_BONUS_PRODUCTION_CONFIG))
      setConfigName(`Configuración ${effectiveMonth}`)
    }
  }, [effectiveMonth, versions])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const token = await getAccessToken()
      if (!token) return
      const normalized = normalizeBonusProductionConfig(config)
      const saved = await upsertBonusProductionConfig(token, {
        name: configName.trim() || `Configuración ${effectiveMonth}`,
        effectiveMonth,
        config: normalized,
      })
      const synced = await syncGoalsFromBonusConfig(token, normalized, effectiveMonth)
      setVersions((prev) => {
        const rest = prev.filter((v) => v.effectiveMonth !== saved.effectiveMonth)
        return [saved, ...rest].sort((a, b) => b.effectiveMonth.localeCompare(a.effectiveMonth))
      })
      setSuccess(
        `Configuración guardada y ${synced} meta(s) sincronizadas para seguimiento y reportes de bono.`,
      )
      onSaved?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar")
    } finally {
      setSaving(false)
    }
  }

  const rollerBlock = (key: "roller48" | "roller36", label: string) => {
    const r = config[key]
    return (
      <div className="rounded-lg border border-border p-4 space-y-4">
        <h3 className="font-semibold">{label}</h3>
        <div className="grid grid-cols-2 gap-3 max-w-md">
          <NumField
            label="Días laborables"
            value={r.workingDays}
            onChange={(v) => setConfig({ ...config, [key]: { ...r, workingDays: v } })}
          />
          <NumField
            label="Bono base ($)"
            value={r.baseBonus}
            onChange={(v) => setConfig({ ...config, [key]: { ...r, baseBonus: v } })}
          />
        </div>
        {(["shift1", "shift2"] as const).map((sk, i) => (
          <div key={sk} className="grid grid-cols-3 gap-3">
            <p className="col-span-3 text-sm font-medium text-muted-foreground">Turno {i + 1}</p>
            <NumField
              label="Meta diaria (cajas)"
              value={r[sk].dailyBoxes}
              onChange={(v) =>
                setConfig({ ...config, [key]: { ...r, [sk]: { ...r[sk], dailyBoxes: v } } })
              }
            />
            <NumField
              label="Meta mensual (cajas)"
              value={r[sk].monthlyBoxes}
              onChange={(v) =>
                setConfig({ ...config, [key]: { ...r, [sk]: { ...r[sk], monthlyBoxes: v } } })
              }
            />
            <NumField
              label="$/caja >100%"
              value={r[sk].over100PerBox}
              step={0.01}
              onChange={(v) =>
                setConfig({ ...config, [key]: { ...r, [sk]: { ...r[sk], over100PerBox: v } } })
              }
            />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-end gap-4">
        <Button onClick={handleSave} disabled={saving} className="gap-2 shrink-0">
          <Save className="h-4 w-4" />
          {saving ? "Guardando…" : "Guardar y sincronizar metas"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-4 items-end rounded-xl border border-border bg-card p-4">
        <div className="space-y-1">
          <Label>Mes vigente (YYYY-MM)</Label>
          <Input
            type="month"
            value={effectiveMonth}
            onChange={(e) => setEffectiveMonth(e.target.value)}
            className="w-[200px]"
          />
        </div>
        <div className="space-y-1 flex-1 min-w-[200px]">
          <Label>Nombre de la versión</Label>
          <Input value={configName} onChange={(e) => setConfigName(e.target.value)} />
        </div>
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          onClick={() => {
            setConfig(structuredClone(DEFAULT_BONUS_PRODUCTION_CONFIG))
            setConfigName(`Nueva ${effectiveMonth}`)
          }}
        >
          <Plus className="h-4 w-4" />
          Restaurar valores por defecto
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-destructive text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-green-500/40 bg-green-500/10 p-3 text-green-800 text-sm">
          {success}
        </div>
      )}
      {loading && <p className="text-sm text-muted-foreground">Cargando versiones…</p>}

      {versions.length > 0 && (
        <div className="text-sm text-muted-foreground">
          Versiones guardadas: {versions.map((v) => v.effectiveMonth).join(", ")}
        </div>
      )}

      <Tabs defaultValue="winding" className="space-y-4">
        <TabsList>
          <TabsTrigger value="winding">Winding</TabsTrigger>
          <TabsTrigger value="bending">Bending</TabsTrigger>
          <TabsTrigger value="roller">Roller</TabsTrigger>
          <TabsTrigger value="rules">Reglas de bono</TabsTrigger>
        </TabsList>

        <TabsContent value="winding">
          <WindingShiftSection config={config} onChange={setConfig} />
        </TabsContent>

        <TabsContent value="bending">
          <BendingShiftSection config={config} />
        </TabsContent>

        <TabsContent value="roller" className="grid gap-6 lg:grid-cols-2">
          {rollerBlock("roller48", "Roller 48 mts")}
          {rollerBlock("roller36", "Roller 36 mts")}
        </TabsContent>

        <TabsContent value="rules">
          <div className="rounded-lg border border-border p-4 grid grid-cols-2 md:grid-cols-3 gap-4 max-w-3xl">
            <NumField
              label="Bono 100% ($)"
              value={config.bonusRules.baseBonus100}
              onChange={(v) =>
                setConfig({ ...config, bonusRules: { ...config.bonusRules, baseBonus100: v } })
              }
            />
            <NumField
              label="Máq. >100% ($/pieza)"
              value={config.bonusRules.machineOver100Rate}
              step={0.01}
              onChange={(v) =>
                setConfig({
                  ...config,
                  bonusRules: { ...config.bonusRules, machineOver100Rate: v },
                })
              }
            />
            <NumField
              label="Máq. >110% ($/pieza)"
              value={config.bonusRules.machineOver110Rate}
              step={0.01}
              onChange={(v) =>
                setConfig({
                  ...config,
                  bonusRules: { ...config.bonusRules, machineOver110Rate: v },
                })
              }
            />
            <NumField
              label="Empaque >100% ($/pieza)"
              value={config.bonusRules.packOver100Rate}
              step={0.01}
              onChange={(v) =>
                setConfig({ ...config, bonusRules: { ...config.bonusRules, packOver100Rate: v } })
              }
            />
            <NumField
              label="Empaque >110% ($/pieza)"
              value={config.bonusRules.packOver110Rate}
              step={0.01}
              onChange={(v) =>
                setConfig({ ...config, bonusRules: { ...config.bonusRules, packOver110Rate: v } })
              }
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
