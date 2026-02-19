"use client"

import { useEffect, useState } from "react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { RequirePermission } from "@/components/auth/require-permission"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/contexts/auth-context"
import {
  getEmailConfig,
  setEmailConfig,
  getOrgs,
  type EmailConfigResponse,
  type ApiOrg,
} from "@/lib/api"
import { toast } from "sonner"
import { Mail, Building2, Loader2, CheckCircle2, XCircle } from "lucide-react"

export default function ConfiguracionPlataformaPage() {
  const { getAccessToken } = useAuth()

  const [emailConfig, setEmailConfigState] = useState<EmailConfigResponse | null>(null)
  const [orgs, setOrgs] = useState<ApiOrg[]>([])
  const [loadingEmail, setLoadingEmail] = useState(true)
  const [loadingOrgs, setLoadingOrgs] = useState(true)
  const [savingEmail, setSavingEmail] = useState(false)

  const [emailForm, setEmailForm] = useState({
    host: "",
    port: 587,
    secure: false,
    user: "",
    password: "",
    from: "",
  })

  useEffect(() => {
    const load = async () => {
      const token = await getAccessToken()
      if (!token) return

      try {
        const config = await getEmailConfig(token)
        setEmailConfigState(config)
        setEmailForm({
          host: config.host,
          port: config.port,
          secure: config.secure,
          user: config.user,
          password: "",
          from: config.from,
        })
      } catch (e) {
        console.error("[Config] Load email config failed", e)
        toast.error("No se pudo cargar la configuración de email.")
      } finally {
        setLoadingEmail(false)
      }

      try {
        const orgList = await getOrgs(token)
        setOrgs(orgList)
      } catch (e) {
        console.error("[Config] Load orgs failed", e)
      } finally {
        setLoadingOrgs(false)
      }
    }
    load()
  }, [getAccessToken])

  const handleSaveEmail = async () => {
    if (!emailForm.host.trim() || !emailForm.from.trim()) {
      toast.error("Host y remitente son obligatorios.")
      return
    }
    setSavingEmail(true)
    try {
      const token = await getAccessToken()
      if (!token) {
        toast.error("Sesión expirada.")
        return
      }
      const updated = await setEmailConfig(token, {
        host: emailForm.host.trim(),
        port: emailForm.port,
        secure: emailForm.secure,
        user: emailForm.user.trim() || undefined,
        password: emailForm.password || undefined,
        from: emailForm.from.trim(),
      })
      setEmailConfigState(updated)
      setEmailForm((f) => ({ ...f, password: "" }))
      toast.success("Configuración de email guardada.")
    } catch (e) {
      console.error("[Config] Save email failed", e)
      toast.error("No se pudo guardar la configuración de email.")
    } finally {
      setSavingEmail(false)
    }
  }

  return (
    <DashboardLayout
      breadcrumbs={[
        { label: "Inicio", href: "/" },
        { label: "Configuración de plataforma" },
      ]}
    >
      <RequirePermission permissions={["platform-config.view"]}>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Configuración de plataforma
            </h1>
            <p className="text-muted-foreground">
              Ajustes globales que afectan a todas las organizaciones de la plataforma.
            </p>
          </div>

          <Tabs defaultValue="email" className="space-y-4">
            <TabsList>
              <TabsTrigger value="email" className="gap-2">
                <Mail className="h-4 w-4" />
                Email SMTP
              </TabsTrigger>
              <TabsTrigger value="orgs" className="gap-2">
                <Building2 className="h-4 w-4" />
                Organizaciones
              </TabsTrigger>
            </TabsList>

            <TabsContent value="email" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Servidor de correo SMTP</CardTitle>
                      <CardDescription>
                        Configura el servidor SMTP para el envío de notificaciones
                        por email desde la plataforma.
                      </CardDescription>
                    </div>
                    {emailConfig && (
                      <div className="flex items-center gap-2">
                        {emailConfig.configured ? (
                          <span className="flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Configurado
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
                            <XCircle className="h-3.5 w-3.5" />
                            Sin configurar
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {loadingEmail ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="grid max-w-lg gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="smtp-host">Host SMTP</Label>
                        <Input
                          id="smtp-host"
                          placeholder="smtp.gmail.com"
                          value={emailForm.host}
                          onChange={(e) =>
                            setEmailForm((f) => ({ ...f, host: e.target.value }))
                          }
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="smtp-port">Puerto</Label>
                          <Input
                            id="smtp-port"
                            type="number"
                            min={1}
                            max={65535}
                            value={emailForm.port}
                            onChange={(e) =>
                              setEmailForm((f) => ({
                                ...f,
                                port: Math.max(1, Number(e.target.value) || 587),
                              }))
                            }
                          />
                        </div>
                        <div className="flex items-end gap-2 pb-1">
                          <Switch
                            checked={emailForm.secure}
                            onCheckedChange={(checked) =>
                              setEmailForm((f) => ({ ...f, secure: checked }))
                            }
                          />
                          <Label>SSL/TLS</Label>
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="smtp-user">Usuario SMTP</Label>
                        <Input
                          id="smtp-user"
                          placeholder="usuario@ejemplo.com"
                          value={emailForm.user}
                          onChange={(e) =>
                            setEmailForm((f) => ({ ...f, user: e.target.value }))
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="smtp-password">Contraseña SMTP</Label>
                        <Input
                          id="smtp-password"
                          type="password"
                          placeholder={
                            emailConfig?.configured
                              ? "Dejar vacío para mantener la actual"
                              : "Contraseña del servidor SMTP"
                          }
                          value={emailForm.password}
                          onChange={(e) =>
                            setEmailForm((f) => ({ ...f, password: e.target.value }))
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="smtp-from">Correo remitente</Label>
                        <Input
                          id="smtp-from"
                          type="email"
                          placeholder="notificaciones@plataforma.com"
                          value={emailForm.from}
                          onChange={(e) =>
                            setEmailForm((f) => ({ ...f, from: e.target.value }))
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          Dirección que aparecerá como remitente en los correos
                          enviados.
                        </p>
                      </div>
                      <Button
                        onClick={handleSaveEmail}
                        disabled={savingEmail}
                        className="w-fit"
                      >
                        {savingEmail ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Guardando…
                          </>
                        ) : (
                          "Guardar configuración"
                        )}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="orgs" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Organizaciones registradas</CardTitle>
                  <CardDescription>
                    Lista de organizaciones activas en la plataforma.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {loadingOrgs ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : orgs.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      No hay organizaciones registradas.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="pb-3 text-left font-medium text-muted-foreground">
                              Nombre
                            </th>
                            <th className="pb-3 text-left font-medium text-muted-foreground">
                              Código
                            </th>
                            <th className="pb-3 text-left font-medium text-muted-foreground">
                              Creada
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {orgs.map((org) => (
                            <tr
                              key={org.id}
                              className="border-b border-border/50"
                            >
                              <td className="py-3 font-medium">{org.name}</td>
                              <td className="py-3 text-muted-foreground">
                                {org.code ?? "—"}
                              </td>
                              <td className="py-3 text-muted-foreground">
                                {new Date(org.createdAt).toLocaleDateString(
                                  "es-MX",
                                  {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                  },
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </RequirePermission>
    </DashboardLayout>
  )
}
