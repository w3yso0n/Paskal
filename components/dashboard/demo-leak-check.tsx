"use client"

import { useEffect } from "react"
import { peekDemoRegistry } from "@/lib/api"
import { findLeaks } from "@/lib/demo-anonymizer"
import { useDemoMode } from "@/lib/demo-mode"

/**
 * Solo en modo demo: vigila el DOM (texto, title, aria-label, placeholder, value) y avisa en
 * consola si aparece algún nombre, código, NFC o email real. Para ensayar el demo antes de
 * presentarlo; no muestra nada en la interfaz.
 */
export function DemoLeakCheck() {
  const { active } = useDemoMode()

  useEffect(() => {
    if (!active) return
    const reported = new Set<string>()
    let timer: ReturnType<typeof setTimeout> | null = null

    const scan = async () => {
      const reg = await peekDemoRegistry()?.catch(() => null)
      if (!reg) return
      const parts: string[] = [document.body.innerText]
      document
        .querySelectorAll<HTMLElement>("[title],[aria-label],[placeholder],input,textarea")
        .forEach((el) => {
          for (const attr of ["title", "aria-label", "placeholder"]) {
            const v = el.getAttribute(attr)
            if (v) parts.push(v)
          }
          if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) parts.push(el.value)
        })
      const leaks = findLeaks(parts.join("\n"), reg).filter((v) => !reported.has(v))
      if (leaks.length) {
        leaks.forEach((v) => reported.add(v))
        console.warn(`[Modo demo] Dato real visible en ${location.pathname}:`, leaks)
      }
    }

    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => void scan(), 1000)
    }
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["title", "aria-label", "placeholder", "value"],
    })
    schedule()
    return () => {
      observer.disconnect()
      if (timer) clearTimeout(timer)
    }
  }, [active])

  return null
}
