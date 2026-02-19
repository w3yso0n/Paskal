import { useCallback, useEffect, useState } from "react"
import {
  getAlertRules,
  createAlertRule,
  deleteAlertRule,
  type AlertRule as ApiAlertRule,
  type AlertRuleSeverity,
} from "@/lib/api"
import { toast } from "sonner"

interface UseAlertRulesOptions {
  enabled: boolean
  getAccessToken: () => Promise<string | null>
}

export interface AlertRuleForm {
  name: string
  condition: string
  threshold: number
  severity: AlertRuleSeverity
  isActive: boolean
}

const INITIAL_FORM: AlertRuleForm = {
  name: "",
  condition: "idle_minutes",
  threshold: 10,
  severity: "medium",
  isActive: true,
}

export function useAlertRules({ enabled, getAccessToken }: UseAlertRulesOptions) {
  const [rules, setRules] = useState<ApiAlertRule[]>([])
  const [loading, setLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<AlertRuleForm>(INITIAL_FORM)
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    try {
      const token = await getAccessToken()
      if (token) {
        const list = await getAlertRules(token)
        setRules(list)
      }
    } catch (e) {
      console.error("[Alertas] Load alert rules failed", e)
      toast.error("No se pudieron cargar las reglas de alerta.")
    } finally {
      setLoading(false)
    }
  }, [enabled, getAccessToken])

  useEffect(() => {
    load()
  }, [load])

  const handleCreate = async () => {
    const name = form.name.trim()
    if (!name) {
      toast.error("El nombre de la regla es obligatorio.")
      return
    }
    setSubmitting(true)
    try {
      const token = await getAccessToken()
      if (!token) {
        toast.error("Sesión expirada.")
        setSubmitting(false)
        return
      }
      await createAlertRule(token, {
        name,
        condition: form.condition,
        threshold: form.threshold,
        severity: form.severity,
        isActive: form.isActive,
      })
      toast.success("Regla de alerta creada.")
      setDialogOpen(false)
      setForm(INITIAL_FORM)
      load()
    } catch (e) {
      console.error("[Alertas] Create rule failed", e)
      toast.error("No se pudo crear la regla.")
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar esta regla de alerta?")) return
    try {
      const token = await getAccessToken()
      if (!token) return
      await deleteAlertRule(token, id)
      toast.success("Regla eliminada.")
      load()
    } catch (e) {
      console.error("[Alertas] Delete rule failed", e)
      toast.error("No se pudo eliminar la regla.")
    }
  }

  return {
    rules,
    loading,
    dialogOpen,
    setDialogOpen,
    form,
    setForm,
    submitting,
    handleCreate,
    handleDelete,
  }
}
