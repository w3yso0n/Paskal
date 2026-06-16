import {
  DEFAULT_QUANTITY_RULES,
  type HookSkuQuantityRule,
} from "@/lib/hook-sku-generator"

const STORAGE_KEY = "paskal-hook-sku-quantity-rules"

export function loadQuantityRules(): HookSkuQuantityRule[] {
  if (typeof window === "undefined") return [...DEFAULT_QUANTITY_RULES]
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return [...DEFAULT_QUANTITY_RULES]
    const parsed = JSON.parse(raw) as HookSkuQuantityRule[]
    if (!Array.isArray(parsed) || parsed.length === 0) return [...DEFAULT_QUANTITY_RULES]
    return parsed
  } catch {
    return [...DEFAULT_QUANTITY_RULES]
  }
}

export function saveQuantityRules(rules: HookSkuQuantityRule[]): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rules))
}

export function resetQuantityRulesToDefaults(): HookSkuQuantityRule[] {
  const defaults = [...DEFAULT_QUANTITY_RULES]
  saveQuantityRules(defaults)
  return defaults
}

export function newQuantityRuleId(): string {
  return `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
