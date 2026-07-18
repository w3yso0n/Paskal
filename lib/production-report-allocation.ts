export type IntegerAllocation<T> = {
  recipient: T
  quantity: number
}

/**
 * Reparte una cantidad entera con largest remainder. Los empates se resuelven
 * por el orden estable de entrada, por lo que el resultado es reproducible.
 */
export function allocateIntegerLargestRemainder<T>(
  total: number,
  recipients: readonly T[],
  weights?: readonly number[],
): IntegerAllocation<T>[] {
  if (recipients.length === 0) return []

  const integerTotal = Math.max(0, Math.round(Number.isFinite(total) ? total : 0))
  const normalizedWeights = recipients.map((_, index) => {
    const weight = weights?.[index] ?? 1
    return Number.isFinite(weight) && weight > 0 ? weight : 0
  })
  const weightTotal = normalizedWeights.reduce((sum, weight) => sum + weight, 0)
  const effectiveWeights =
    weightTotal > 0 ? normalizedWeights : recipients.map(() => 1)
  const effectiveTotal = effectiveWeights.reduce((sum, weight) => sum + weight, 0)

  const shares = recipients.map((recipient, index) => {
    const exact = (integerTotal * effectiveWeights[index]) / effectiveTotal
    const quantity = Math.floor(exact)
    return { recipient, quantity, remainder: exact - quantity, index }
  })

  const remaining =
    integerTotal - shares.reduce((sum, allocation) => sum + allocation.quantity, 0)
  const remainderOrder = [...shares].sort(
    (a, b) => b.remainder - a.remainder || a.index - b.index,
  )
  for (let index = 0; index < remaining; index++) {
    remainderOrder[index % remainderOrder.length].quantity += 1
  }

  return shares.map(({ recipient, quantity }) => ({ recipient, quantity }))
}

export function dedupeReportPeople(
  values: readonly (string | null | undefined)[],
): string[] {
  const seen = new Set<string>()
  const people: string[] = []
  for (const value of values) {
    const name = String(value ?? "").trim().replace(/\s+/g, " ")
    if (!name || name === "—") continue
    const key = name.toLocaleLowerCase("es")
    if (seen.has(key)) continue
    seen.add(key)
    people.push(name)
  }
  return people
}

export function reportRosterKey(
  operators: readonly (string | null | undefined)[],
  packers: readonly (string | null | undefined)[],
  explicitRosterId?: string | null,
): string {
  const rosterId = explicitRosterId?.trim()
  if (rosterId) return `id:${rosterId}`
  const operatorKey = dedupeReportPeople(operators)
    .map((person) => person.toLocaleLowerCase("es"))
    .join("|")
  const packerKey = dedupeReportPeople(packers)
    .map((person) => person.toLocaleLowerCase("es"))
    .join("|")
  return `op:${operatorKey};pk:${packerKey}`
}
