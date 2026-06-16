/** Normaliza una parte o código SKU completo (siempre minúsculas). */
export function normalizeSkuPart(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "")
}

export function normalizeSkuCode(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "")
}

export function buildSkuCodeFromParts(parts: {
  hookType: string
  color: string
  length: string
  extra?: string
}): string {
  const segments = [
    normalizeSkuPart(parts.hookType),
    normalizeSkuPart(parts.color),
    normalizeSkuPart(parts.length),
    parts.extra ? normalizeSkuPart(parts.extra) : "",
  ].filter(Boolean)
  return segments.join("-")
}

export function isSkuRegistered(
  code: string,
  catalog: Array<{ code: string }>,
): boolean {
  const normalized = normalizeSkuCode(code)
  if (!normalized) return true
  return catalog.some((s) => normalizeSkuCode(s.code) === normalized)
}

export const SKU_COMPONENT_LABELS: Record<string, string> = {
  hook_type: "Tipo de gancho",
  color: "Color",
  length: "Metraje",
  extra: "Componente extra",
}
