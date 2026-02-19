"use client"

import { useState } from "react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { RequirePermission } from "@/components/auth/require-permission"
import { useAuth } from "@/contexts/auth-context"
import { hasPermission } from "@/lib/permissions"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Palette, Image as ImageIcon, Lock } from "lucide-react"
import { toast } from "sonner"

export default function ConfiguracionOrganizacionPage() {
  const { user } = useAuth()
  const [saving, setSaving] = useState(false)
  const canEdit = hasPermission(user, "org-config.edit")
  const [platformTitle, setPlatformTitle] = useState("Paskal")
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [floorImageFile, setFloorImageFile] = useState<File | null>(null)
  const [floorImagePreview, setFloorImagePreview] = useState<string | null>(null)

  const handleSaveColors = () => {
    setSaving(true)
    setTimeout(() => {
      setSaving(false)
      toast.success("Preferencias de color guardadas (próximamente persistidas).")
    }, 500)
  }

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (logoPreview) URL.revokeObjectURL(logoPreview)
    if (file) {
      setLogoFile(file)
      setLogoPreview(URL.createObjectURL(file))
    } else {
      setLogoFile(null)
      setLogoPreview(null)
    }
  }

  const handleFloorImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (floorImagePreview) URL.revokeObjectURL(floorImagePreview)
    if (file) {
      setFloorImageFile(file)
      setFloorImagePreview(URL.createObjectURL(file))
    } else {
      setFloorImageFile(null)
      setFloorImagePreview(null)
    }
  }

  const handleSaveImage = () => {
    setSaving(true)
    setTimeout(() => {
      setSaving(false)
      toast.success("Imagen y título guardados (próximamente persistidos).")
    }, 500)
  }

  const handleSavePassword = () => {
    setSaving(true)
    setTimeout(() => {
      setSaving(false)
      toast.success("Cambio de contraseña (próximamente conectado al backend).")
    }, 500)
  }

  return (
    <DashboardLayout
      breadcrumbs={[
        { label: "Inicio", href: "/" },
        { label: "Administración" },
        { label: "Configuración de la organización" },
      ]}
    >
      <RequirePermission permissions={["org-config.view"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Configuración de la organización</h1>
          <p className="text-muted-foreground">
            Personaliza la apariencia de la plataforma para tu organización.
          </p>
        </div>

        <Tabs defaultValue="colores" className="space-y-3">
          <TabsList className="flex flex-wrap gap-1 bg-muted p-1">
            <TabsTrigger value="colores" className="gap-2">
              <Palette className="h-4 w-4" />
              Colores
            </TabsTrigger>
            <TabsTrigger value="imagen" className="gap-2">
              <ImageIcon className="h-4 w-4" />
              Imagen y título
            </TabsTrigger>
            <TabsTrigger value="contraseñas" className="gap-2">
              <Lock className="h-4 w-4" />
              Contraseñas
            </TabsTrigger>
          </TabsList>

          <TabsContent value="colores" className="space-y-3">
            <Card>
              <CardHeader>
                <CardTitle>Colores de la plataforma</CardTitle>
                <CardDescription>
                  Define los colores principales que verán los usuarios de tu organización (tema claro/oscuro, acento).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 max-w-md">
                <div className="grid gap-2">
                  <Label>Color primario</Label>
                  <div className="flex gap-2">
                    <Input type="color" defaultValue="#0d9488" className="h-10 w-14 cursor-pointer p-1" />
                    <Input defaultValue="#0d9488" className="font-mono text-sm" readOnly />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Color de acento (alertas, destacados)</Label>
                  <div className="flex gap-2">
                    <Input type="color" defaultValue="#3b82f6" className="h-10 w-14 cursor-pointer p-1" />
                    <Input defaultValue="#3b82f6" className="font-mono text-sm" readOnly />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch defaultChecked />
                  <Label>Forzar tema oscuro para la organización</Label>
                </div>
                <Button onClick={handleSaveColors} disabled={saving}>
                  Guardar
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="imagen" className="space-y-3">
            <Card>
              <CardHeader>
                <CardTitle>Imagen y título de la plataforma</CardTitle>
                <CardDescription>
                  Logo e imagen que se muestran en la cabecera y en el inicio de sesión para tu organización.
                </CardDescription>
              </CardHeader>
              <CardContent className="max-w-md space-y-3 pt-6">
                <div className="grid gap-3">
                  <Label htmlFor="platform-title">Título de la plataforma</Label>
                  <Input
                    id="platform-title"
                    placeholder="Ej: Mi Planta - Paskal"
                    value={platformTitle}
                    onChange={(e) => setPlatformTitle(e.target.value)}
                    className="py-2.5"
                  />
                </div>

                <div className="grid gap-3 py-2">
                  <Label htmlFor="logo-upload">Logo de la organización</Label>
                  <Input
                    id="logo-upload"
                    type="file"
                    accept="image/png,.png,image/jpeg,.jpg,.jpeg"
                    onChange={handleLogoChange}
                    className="cursor-pointer file:mr-4 file:rounded-md file:bg-primary file:px-5  file:text-sm file:font-medium file:text-primary-foreground file:cursor-pointer hover:file:bg-primary/90"
                  />
                  <p className="text-xs text-muted-foreground">
                    Se recomienda usar formato PNG para mejor calidad.
                  </p>
                  {logoPreview && (
                    <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3 inline-block">
                      <img src={logoPreview} alt="Vista previa del logo" className="h-16 object-contain" />
                      {logoFile && <p className="mt-1 text-xs text-muted-foreground max-w-[200px] truncate">{logoFile.name}</p>}
                    </div>
                  )}
                </div>

                <div className="grid gap-3 py-2">
                  <Label htmlFor="floor-image-upload">Imagen para Piso de producción</Label>
                  <Input
                    id="floor-image-upload"
                    type="file"
                    accept="image/png,.png,image/jpeg,.jpg,.jpeg"
                    onChange={handleFloorImageChange}
                    className="cursor-pointer file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-5  file:text-sm file:font-medium file:text-primary-foreground file:cursor-pointer hover:file:bg-primary/90"
                  />
                  <p className="text-xs text-muted-foreground">
                    Imagen que se mostrará en la vista de Piso de producción. Se recomienda formato PNG.
                  </p>
                  {floorImagePreview && (
                    <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3 inline-block">
                      <img src={floorImagePreview} alt="Vista previa imagen piso de producción" className="h-24 object-contain" />
                      {floorImageFile && <p className="mt-1 text-xs text-muted-foreground max-w-[200px] truncate">{floorImageFile.name}</p>}
                    </div>
                  )}
                </div>

                <div className="pt-4">
                  <Button onClick={handleSaveImage} disabled={saving} size="lg" className="min-h-11 px-8">
                    Guardar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="contraseñas" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Cambiar contraseña</CardTitle>
                <CardDescription>
                  Actualiza la contraseña de tu cuenta de administrador de la organización.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 max-w-md">
                <div className="grid gap-2">
                  <Label>Contraseña actual</Label>
                  <Input type="password" placeholder="••••••••" />
                </div>
                <div className="grid gap-2">
                  <Label>Nueva contraseña</Label>
                  <Input type="password" placeholder="••••••••" />
                </div>
                <div className="grid gap-2">
                  <Label>Confirmar nueva contraseña</Label>
                  <Input type="password" placeholder="••••••••" />
                </div>
                <Button onClick={handleSavePassword} disabled={saving}>
                  Cambiar contraseña
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>
      </div>
      </RequirePermission>
    </DashboardLayout>
  )
}
