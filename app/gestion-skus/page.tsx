"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/** Redirige a Administración → Gestión de SKUs. */
export default function GestionSkusRedirectPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace("/administracion/gestion-skus")
  }, [router])
  return null
}
