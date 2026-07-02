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
} from "@/components/ui/dialog"
import { useAuth } from "@/contexts/auth-context"
import { RequirePermission } from "@/components/auth/require-permission"
import { hasPermission } from "@/lib/permissions"
import { ROLE_LABELS, USER_ROLES } from "@/lib/platform-permissions"
import {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  getApiErrorMessage,
  type ApiUser,
  type UserRole,
} from "@/lib/api"
import { toast } from "sonner"
import { UserPlus, Loader2, Trash2, Pencil } from "lucide-react"

const ROLE_OPTIONS: { value: UserRole; label: string }[] = USER_ROLES.map((role) => ({
  value: role,
  label: ROLE_LABELS[role],
}))

const STATUS_OPTIONS = [
  { value: "active", label: "Activo" },
  { value: "inactive", label: "Inactivo" },
  { value: "suspended", label: "Suspendido" },
] as const

type UserForm = {
  email: string
  password: string
  fullName: string
  role: UserRole
  status: string
}

const EMPTY_FORM: UserForm = {
  email: "",
  password: "",
  fullName: "",
  role: "supervisor",
  status: "active",
}

export default function GestionUsuariosPage() {
  const { user, getAccessToken } = useAuth()
  const canManageUsers = hasPermission(user, "users.list")
  const canCreateUsers = hasPermission(user, "users.create")
  const canUpdateUsers = hasPermission(user, "users.update")
  const canDeleteUsers = hasPermission(user, "users.delete")

  const [users, setUsers] = useState<ApiUser[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<ApiUser | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<UserForm>(EMPTY_FORM)

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
      console.error("[Usuarios] Load failed", { message: getApiErrorMessage(e), raw: e })
      toast.error(getApiErrorMessage(e) || "No se pudieron cargar los usuarios.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (canManageUsers) {
      loadUsers()
    } else {
      setLoading(false)
    }
  }, [canManageUsers])

  const openCreateDialog = () => {
    setEditingUser(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  const openEditDialog = (u: ApiUser) => {
    setEditingUser(u)
    setForm({
      email: u.email,
      password: "",
      fullName: u.fullName,
      role: u.role,
      status: u.status,
    })
    setDialogOpen(true)
  }

  const handleDialogChange = (open: boolean) => {
    setDialogOpen(open)
    if (!open) {
      setEditingUser(null)
      setForm(EMPTY_FORM)
    }
  }

  const handleSubmit = async () => {
    const email = form.email.trim().toLowerCase()
    const password = form.password.trim()
    const fullName = form.fullName.trim()
    if (!email || !fullName) {
      toast.error("Email y nombre son obligatorios.")
      return
    }
    if (!editingUser && !password) {
      toast.error("La contraseña es obligatoria al crear un usuario.")
      return
    }
    if (password && password.length < 8) {
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
      if (editingUser) {
        const payload: Parameters<typeof updateUser>[2] = {
          email,
          fullName,
          role: form.role,
          status: form.status,
        }
        if (password) payload.password = password
        await updateUser(token, editingUser.id, payload)
        toast.success("Usuario actualizado.")
      } else {
        await createUser(token, {
          email,
          password,
          fullName,
          role: form.role,
          status: form.status,
        })
        toast.success("Usuario creado.")
      }
      handleDialogChange(false)
      loadUsers()
    } catch (e) {
      const msg = getApiErrorMessage(e)
      console.error("[Usuarios] Save failed", {
        editing: !!editingUser,
        message: msg || "(sin mensaje)",
        raw: e,
      })
      toast.error(
        msg ||
          (editingUser
            ? "No se pudo actualizar el usuario."
            : "No se pudo crear el usuario. Revisa que el email no exista o que Firebase Admin esté configurado en el servidor."),
      )
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
      const msg = getApiErrorMessage(e)
      console.error("[Usuarios] Delete failed", { message: msg || "(sin mensaje)", raw: e })
      toast.error(msg || "No se pudo eliminar el usuario.")
    }
  }

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
              Crea y edita usuarios de la plataforma.
            </p>
          </div>
          {canCreateUsers && (
            <Button className="gap-2" onClick={openCreateDialog}>
              <UserPlus className="h-4 w-4" />
              Nuevo usuario
            </Button>
          )}
        </div>

        {(canCreateUsers || canUpdateUsers) && (
          <Dialog open={dialogOpen} onOpenChange={handleDialogChange}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {editingUser ? "Editar usuario" : "Nuevo usuario"}
                </DialogTitle>
                <DialogDescription>
                  {editingUser
                    ? "Actualiza los datos del usuario. Deja la contraseña vacía para no cambiarla."
                    : "Crea un nuevo usuario para la plataforma."}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
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
                  <Label htmlFor="user-password">
                    Contraseña{editingUser ? " (opcional)" : ""}
                  </Label>
                  <Input
                    id="user-password"
                    type="password"
                    placeholder={editingUser ? "Sin cambios" : "Mínimo 8 caracteres"}
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
                <div className="grid gap-2">
                  <Label>Estado</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => handleDialogChange(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSubmit} disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Guardando…
                    </>
                  ) : editingUser ? (
                    "Guardar cambios"
                  ) : (
                    "Crear usuario"
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Usuarios</CardTitle>
            <CardDescription>
              Listado de usuarios.
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
                      <th className="pb-3 text-right font-medium text-muted-foreground">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-b border-border/50">
                        <td className="py-3 font-medium">{u.email}</td>
                        <td className="py-3 text-muted-foreground">{u.fullName}</td>
                        <td className="py-3">{ROLE_OPTIONS.find((r) => r.value === u.role)?.label ?? u.role}</td>
                        <td className="py-3 capitalize">
                          {STATUS_OPTIONS.find((s) => s.value === u.status)?.label ?? u.status}
                        </td>
                        <td className="py-3 text-right">
                          <div className="flex justify-end gap-1">
                            {canUpdateUsers && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => openEditDialog(u)}
                                title="Editar usuario"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                            {canDeleteUsers && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                onClick={() => handleDelete(u.id, u.email)}
                                title="Eliminar usuario"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
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
