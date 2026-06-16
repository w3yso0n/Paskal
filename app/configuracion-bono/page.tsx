"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/** Redirige a Reglas de negocio → Configuración de bono. */
export default function ConfiguracionBonoRedirectPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace("/reglas-negocio?tab=bono")
  }, [router])
  return null
}
