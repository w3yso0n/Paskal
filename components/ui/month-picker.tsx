"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const MONTHS_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
const MONTHS_FULL  = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]

type MonthPickerProps = {
  /** Fecha en formato YYYY-MM-DD o YYYY-MM. */
  value: string
  /** Devuelve siempre YYYY-MM-01. */
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function MonthPicker({
  value,
  onChange,
  placeholder = "Seleccionar mes",
  className,
}: MonthPickerProps) {
  const [open, setOpen] = React.useState(false)

  const { selYear, selMonth } = React.useMemo(() => {
    const parts = value?.split("-") ?? []
    const y = Number(parts[0])
    const m = Number(parts[1])
    const now = new Date()
    return {
      selYear:  y || now.getFullYear(),
      selMonth: m || now.getMonth() + 1,
    }
  }, [value])

  const [viewYear, setViewYear] = React.useState(selYear)
  React.useEffect(() => { setViewYear(selYear) }, [selYear])

  const handleSelect = (month: number) => {
    const mm = String(month).padStart(2, "0")
    onChange(`${viewYear}-${mm}-01`)
    setOpen(false)
  }

  const displayLabel = value
    ? `${MONTHS_FULL[selMonth - 1]} ${selYear}`
    : placeholder

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <CalendarDays className="mr-2 h-4 w-4 shrink-0" />
          {displayLabel}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-60 p-3" align="start">
        {/* Navegación de año */}
        <div className="mb-3 flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setViewYear((y) => y - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold">{viewYear}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setViewYear((y) => y + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Grid de meses */}
        <div className="grid grid-cols-3 gap-1.5">
          {MONTHS_SHORT.map((label, idx) => {
            const month = idx + 1
            const isSelected = month === selMonth && viewYear === selYear
            return (
              <button
                key={month}
                onClick={() => handleSelect(month)}
                className={cn(
                  "rounded-md py-2 text-sm font-medium transition-colors",
                  "hover:bg-accent hover:text-accent-foreground focus:outline-none",
                  isSelected
                    ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                    : "text-foreground",
                )}
              >
                {label}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
