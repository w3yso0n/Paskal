"use client"

import { useState } from "react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/auth-context"
import { changeMyPassword, getApiErrorMessage } from "@/lib/api"
import { toast } from "sonner"
import { Loader2, Lock } from "lucide-react"

export default function ConfiguracionPage() {
  const { getAccessToken, user } = useAuth()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!form.currentPassword.trim()) {
      toast.error("Ingresa tu contraseña actual.")
      return
    }
    if (form.newPassword.length < 8) {
      toast.error("La nueva contraseña debe tener al menos 8 caracteres.")
      return
    }
    if (form.newPassword !== form.confirmPassword) {
      toast.error("La confirmación no coincide con la nueva contraseña.")
      return
    }

    setSaving(true)
    try {
      const token = await getAccessToken()
      if (!token) {
        toast.error("Sesión expirada.")
        return
      }
      await changeMyPassword(token, {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      })
      setForm({ currentPassword: "", newPassword: "", confirmPassword: "" })
      toast.success("Contraseña actualizada correctamente.")
    } catch (err) {
      const msg = getApiErrorMessage(err)
      toast.error(msg || "No se pudo cambiar la contraseña.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <DashboardLayout
      breadcrumbs={[
        { label: "Inicio", href: "/" },
        { label: "Configuración" },
      ]}
    >
      <div className="mx-auto max-w-lg space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Configuración</h1>
          <p className="text-muted-foreground">
            Administra la seguridad de tu cuenta{user?.email ? ` (${user.email})` : ""}.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Cambiar contraseña
            </CardTitle>
            <CardDescription>
              Actualiza la contraseña de tu usuario. Debes conocer la contraseña actual.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="current-password">Contraseña actual</Label>
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  value={form.currentPassword}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, currentPassword: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="new-password">Nueva contraseña</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={form.newPassword}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, newPassword: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="confirm-password">Confirmar nueva contraseña</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={form.confirmPassword}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, confirmPassword: e.target.value }))
                  }
                />
              </div>
              <Button type="submit" disabled={saving} className="w-fit">
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Guardando…
                  </>
                ) : (
                  "Cambiar contraseña"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
