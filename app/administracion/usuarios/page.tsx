"use client"

import { useState, useEffect } from "react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useAuth } from "@/contexts/auth-context"
import { RequirePermission } from "@/components/auth/require-permission"
import { hasPermission } from "@/lib/permissions"
import {
  getUsers,
  createUser,
  deleteUser,
  getOrgs,
  type ApiUser,
  type ApiOrg,
  type UserRole,
} from "@/lib/api"
import { toast } from "sonner"
import { UserPlus, Loader2, Trash2 } from "lucide-react"

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "admin", label: "Administrador" },
  { value: "manager", label: "Gestor" },
  { value: "operator", label: "Operador" },
  { value: "viewer", label: "Visualizador" },
]

export default function GestionUsuariosPage() {
  const { user, getAccessToken } = useAuth()
  const canManageUsers = hasPermission(user, "users.list")
  const canChooseOrg = hasPermission(user, "users.assign-org")

  const [users, setUsers] = useState<ApiUser[]>([])
  const [orgs, setOrgs] = useState<ApiOrg[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    email: "",
    password: "",
    fullName: "",
    role: "viewer" as UserRole,
    orgId: "",
  })

  const loadUsers = async () => {
    if (!canManageUsers) return
    setLoading(true)
    try {
      const token = await getAccessToken()
      if (token) {
        const list = await getUsers(token)
        setUsers(list)
      }
    } catch (e) {
      console.error("[Usuarios] Load failed", e)
      toast.error("No se pudieron cargar los usuarios.")
    } finally {
      setLoading(false)
    }
  }

  const loadOrgs = async () => {
    if (!canChooseOrg) return
    try {
      const token = await getAccessToken()
      if (token) {
        const list = await getOrgs(token)
        setOrgs(list)
      }
    } catch (e) {
      console.error("[Usuarios] Load orgs failed", e)
    }
  }

  useEffect(() => {
    if (canManageUsers) {
      loadUsers()
      if (canChooseOrg) loadOrgs()
    } else {
      setLoading(false)
    }
  }, [canManageUsers, canChooseOrg])

  const handleCreate = async () => {
    const email = form.email.trim().toLowerCase()
    const password = form.password.trim()
    const fullName = form.fullName.trim()
    if (!email || !password || !fullName) {
      toast.error("Email, contraseña y nombre son obligatorios.")
      return
    }
    if (password.length < 8) {
      toast.error("La contraseña debe tener al menos 8 caracteres.")
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
      const payload: Parameters<typeof createUser>[1] = {
        email,
        password,
        fullName,
        role: form.role,
      }
      if (canChooseOrg && form.orgId) payload.orgId = form.orgId
      await createUser(token, payload)
      toast.success("Usuario creado.")
      setDialogOpen(false)
      setForm({ email: "", password: "", fullName: "", role: "viewer", orgId: "" })
      loadUsers()
    } catch (e) {
      console.error("[Usuarios] Create failed", e)
      toast.error("No se pudo crear el usuario. Revisa que el email no exista.")
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string, email: string) => {
    if (!confirm(`¿Eliminar al usuario ${email}?`)) return
    try {
      const token = await getAccessToken()
      if (!token) return
      await deleteUser(token, id)
      toast.success("Usuario eliminado.")
      loadUsers()
    } catch (e) {
      console.error("[Usuarios] Delete failed", e)
      toast.error("No se pudo eliminar el usuario.")
    }
  }

  const getOrgName = (orgId: string) => orgs.find((o) => o.id === orgId)?.name ?? orgId

  return (
    <DashboardLayout
      breadcrumbs={[
        { label: "Inicio", href: "/" },
        { label: "Administración" },
        { label: "Gestión de usuarios" },
      ]}
    >
      <RequirePermission permissions={["users.list"]}>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Gestión de usuarios</h1>
            <p className="text-sm text-muted-foreground">
              {canChooseOrg
                ? "Como administrador de plataforma puedes añadir usuarios y asignar su organización. Los administradores de cada organización solo pueden añadir usuarios a su propia org."
                : "Añade usuarios a tu organización. Se asignarán automáticamente a tu organización."}
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <UserPlus className="h-4 w-4" />
                Nuevo usuario
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Nuevo usuario</DialogTitle>
                <DialogDescription>
                  {canChooseOrg
                    ? "Elige la organización del usuario. Los admins de organización no pueden elegir org."
                    : "El usuario se creará en tu organización."}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                {canChooseOrg && orgs.length > 0 && (
                  <div className="grid gap-2">
                    <Label>Organización</Label>
                    <Select
                      value={form.orgId || undefined}
                      onValueChange={(v) => setForm((f) => ({ ...f, orgId: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar organización" />
                      </SelectTrigger>
                      <SelectContent>
                        {orgs.map((org) => (
                          <SelectItem key={org.id} value={org.id}>
                            {org.name}
                            {org.code ? ` (${org.code})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="grid gap-2">
                  <Label htmlFor="user-email">Email</Label>
                  <Input
                    id="user-email"
                    type="email"
                    placeholder="usuario@ejemplo.com"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="user-password">Contraseña</Label>
                  <Input
                    id="user-password"
                    type="password"
                    placeholder="Mínimo 8 caracteres"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="user-fullName">Nombre completo</Label>
                  <Input
                    id="user-fullName"
                    placeholder="Nombre y apellidos"
                    value={form.fullName}
                    onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Rol</Label>
                  <Select
                    value={form.role}
                    onValueChange={(v) => setForm((f) => ({ ...f, role: v as UserRole }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleCreate} disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Creando…
                    </>
                  ) : (
                    "Crear usuario"
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Usuarios</CardTitle>
            <CardDescription>
              Listado de usuarios de {canChooseOrg ? "todas las organizaciones" : "tu organización"}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : users.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No hay usuarios. Crea uno con &quot;Nuevo usuario&quot;.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="pb-3 text-left font-medium text-muted-foreground">Email</th>
                      <th className="pb-3 text-left font-medium text-muted-foreground">Nombre</th>
                      <th className="pb-3 text-left font-medium text-muted-foreground">Rol</th>
                      <th className="pb-3 text-left font-medium text-muted-foreground">Estado</th>
                      {canChooseOrg && (
                        <th className="pb-3 text-left font-medium text-muted-foreground">Organización</th>
                      )}
                      <th className="pb-3 text-right font-medium text-muted-foreground">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-b border-border/50">
                        <td className="py-3 font-medium">{u.email}</td>
                        <td className="py-3 text-muted-foreground">{u.fullName}</td>
                        <td className="py-3">{ROLE_OPTIONS.find((r) => r.value === u.role)?.label ?? u.role}</td>
                        <td className="py-3 capitalize">{u.status}</td>
                        {canChooseOrg && (
                          <td className="py-3 text-muted-foreground">{getOrgName(u.orgId)}</td>
                        )}
                        <td className="py-3 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDelete(u.id, u.email)}
                            title="Eliminar usuario"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      </RequirePermission>
    </DashboardLayout>
  )
}
