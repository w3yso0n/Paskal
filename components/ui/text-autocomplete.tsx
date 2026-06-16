"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export type TextAutocompleteOption = {
  value: string
  label: string
  hint?: string
}

type TextAutocompleteProps = {
  id?: string
  value: string
  onValueChange: (value: string) => void
  options: TextAutocompleteOption[]
  placeholder?: string
  disabled?: boolean
  className?: string
  inputClassName?: string
}

export function TextAutocomplete({
  id,
  value,
  onValueChange,
  options,
  placeholder = "Escribe para buscar…",
  disabled = false,
  className,
  inputClassName,
}: TextAutocompleteProps) {
  const listId = useId()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const selected = useMemo(
    () => options.find((o) => o.value === value),
    [options, value],
  )

  useEffect(() => {
    if (selected) {
      setQuery(selected.label)
    } else {
      setQuery(value)
    }
  }, [value, selected])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options.slice(0, 15)
    return options
      .filter(
        (o) =>
          o.label.toLowerCase().includes(q) ||
          o.value.toLowerCase().includes(q) ||
          (o.hint?.toLowerCase().includes(q) ?? false),
      )
      .slice(0, 15)
  }, [options, query])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setOpen(false)
        if (selected) setQuery(selected.label)
        else setQuery(value)
      }
    }
    document.addEventListener("mousedown", onPointerDown)
    return () => document.removeEventListener("mousedown", onPointerDown)
  }, [value, selected])

  const pick = (opt: TextAutocompleteOption) => {
    onValueChange(opt.value)
    setQuery(opt.label)
    setOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true)
      return
    }
    if (!open || filtered.length === 0) return

    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % filtered.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length)
    } else if (e.key === "Enter") {
      e.preventDefault()
      const opt = filtered[activeIndex]
      if (opt) pick(opt)
    } else if (e.key === "Escape") {
      setOpen(false)
      if (selected) setQuery(selected.label)
      else setQuery(value)
    }
  }

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <Input
        id={id}
        value={query}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        className={inputClassName}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        onChange={(e) => {
          const next = e.target.value
          setQuery(next)
          setOpen(true)
          if (!next.trim()) onValueChange("")
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
      />
      {open && filtered.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-popover py-1 text-sm shadow-md"
        >
          {filtered.map((opt, index) => (
            <li
              key={opt.value}
              role="option"
              aria-selected={value === opt.value}
              className={cn(
                "cursor-pointer px-3 py-2",
                index === activeIndex && "bg-accent text-accent-foreground",
                value === opt.value && index !== activeIndex && "bg-muted/50",
              )}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(opt)
              }}
            >
              <span className="font-medium">{opt.label}</span>
              {opt.hint ? (
                <span className="ml-2 text-xs text-muted-foreground">{opt.hint}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {open && query.trim() && filtered.length === 0 ? (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover px-3 py-2 text-sm text-muted-foreground shadow-md">
          Sin coincidencias
        </div>
      ) : null}
    </div>
  )
}
