import {
  getManualDataCaptures,
  getProductionEvents,
  type ApiGoal,
  type ApiGoalShift,
  type ApiMachine,
  type ApiManualDataCapture,
  type ApiProductionEvent,
} from "@/lib/api"
import {
  goalComplianceDateRange,
  GOAL_OPEN_END_DATE,
  isGoalActive,
  todayYmd,
} from "@/lib/goal-compliance-range"
import {
  normalizeSku,
  sumProductionUnitsInRange,
} from "@/lib/production-goal-events"

function toDateTimeRange(dateOnlyStart: string, dateOnlyEnd: string) {
  return {
    from: `${dateOnlyStart}T00:00:00.000Z`,
    to: `${dateOnlyEnd}T23:59:59.999Z`,
  }
}

function buildMachineMaps(machines: ApiMachine[]) {
  const skuById = new Map<string, string>()
  const upbById = new Map<string, number>()
  for (const m of machines) {
    const sku = m.currentSku?.trim()
    if (sku) skuById.set(m.id, sku)
    const upb = m.unitsPerBox
    if (upb != null && Number.isFinite(upb) && upb > 0) upbById.set(m.id, upb)
  }
  return { skuById, upbById }
}

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

export function normalizeGoalDate(value: string): string {
  const trimmed = value.trim()
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed)
  if (match) return match[1]
  const d = new Date(trimmed)
  if (Number.isNaN(d.getTime())) return trimmed.slice(0, 10)
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

function goalAppliesToCurrentMonth(goal: ApiGoal, ref: Date = new Date()): boolean {
  const endDate = normalizeGoalDate(goal.endDate)
  if (endDate >= GOAL_OPEN_END_DATE) return true

  const range = goalComplianceDateRange(goal, ref)
  const y = ref.getFullYear()
  const m = ref.getMonth()
  const monthStart = `${y}-${pad2(m + 1)}-01`
  const monthEnd = todayYmd(ref)

  return range.startDate <= monthEnd && range.endDate >= monthStart
}

export function selectMonthlyProductionGoals(
  goals: ApiGoal[],
  options?: { shiftFilter?: "all" | ApiGoalShift; ref?: Date },
): ApiGoal[] {
  const ref = options?.ref ?? new Date()
  return goals.filter((g) => {
    if (!isGoalActive(g)) return false
    if (g.metricKind !== "production") return false
    if (g.period !== "monthly") return false
    if (!goalAppliesToCurrentMonth(g, ref)) return false
    if (
      options?.shiftFilter &&
      options.shiftFilter !== "all" &&
      g.shift &&
      g.shift !== options.shiftFilter
    ) {
      return false
    }
    return true
  })
}

function yearMonthFromDate(dateOnly: string): number {
  const y = Number(dateOnly.slice(0, 4))
  const m = Number(dateOnly.slice(5, 7))
  return y * 100 + m
}

/** Suma scrap de capturas manuales (categoría scrap) en el rango de cumplimiento. */
export function sumScrapQtyInComplianceRange(
  captures: ApiManualDataCapture[],
  startDate: string,
  endDate: string,
): number {
  const startYm = yearMonthFromDate(startDate)
  const endYm = yearMonthFromDate(endDate)
  let sum = 0
  for (const c of captures) {
    if (c.category !== "scrap") continue
    const y = c.recordYear
    const m = c.recordMonth
    if (y == null || m == null) continue
    const ym = y * 100 + m
    if (ym < startYm || ym > endYm) continue
    const q = c.scrapQty
    if (q != null && Number.isFinite(q) && q > 0) sum += q
  }
  return sum
}

export function computeActualByGoalId(input: {
  goals: ApiGoal[]
  machines: ApiMachine[]
  productionEvents: ApiProductionEvent[]
  scrapCaptures?: ApiManualDataCapture[]
}): Record<string, number> {
  const { goals, machines, productionEvents, scrapCaptures = [] } = input
  const { skuById, upbById } = buildMachineMaps(machines)
  const activeGoals = goals.filter(isGoalActive)
  const actual: Record<string, number> = {}

  for (const g of activeGoals) {
    const range = goalComplianceDateRange(g)
    const { from, to } = toDateTimeRange(range.startDate, range.endDate)
    const shift = g.shift ?? null
    const goalSku = normalizeSku(g.sku)

    if (g.metricKind === "production") {
      actual[g.id] = sumProductionUnitsInRange(productionEvents, {
        machineId: g.machineId,
        from,
        to,
        shift,
        sku: goalSku,
        machineSkuById: skuById,
        machineUpbById: upbById,
      })
    } else if (g.metricKind === "scrap") {
      actual[g.id] = sumScrapQtyInComplianceRange(
        scrapCaptures,
        range.startDate,
        range.endDate,
      )
    } else {
      actual[g.id] = 0
    }
  }

  for (const g of goals) {
    if (!isGoalActive(g)) actual[g.id] = 0
  }

  return actual
}

export async function fetchActualByGoalId(
  accessToken: string,
  goals: ApiGoal[],
  machines: ApiMachine[],
): Promise<Record<string, number>> {
  if (goals.length === 0) return {}

  const activeGoals = goals.filter(isGoalActive)
  if (activeGoals.length === 0) {
    return Object.fromEntries(goals.map((g) => [g.id, 0]))
  }

  const needsProductionEvents = activeGoals.some((g) => g.metricKind === "production")
  const needsScrapCaptures = activeGoals.some((g) => g.metricKind === "scrap")

  const complianceRanges = activeGoals.map((g) => goalComplianceDateRange(g))
  const minStart = complianceRanges.reduce(
    (min, r) => (r.startDate < min ? r.startDate : min),
    complianceRanges[0].startDate,
  )
  const maxEnd = complianceRanges.reduce(
    (max, r) => (r.endDate > max ? r.endDate : max),
    complianceRanges[0].endDate,
  )
  const range = toDateTimeRange(minStart, maxEnd)

  const [productionEvents, scrapCaptures] = await Promise.all([
    needsProductionEvents
      ? getProductionEvents(accessToken, { from: range.from, to: range.to, limit: 10000 })
      : Promise.resolve([] as ApiProductionEvent[]),
    needsScrapCaptures
      ? getManualDataCaptures(accessToken, {
          category: "scrap",
          from: minStart,
          to: maxEnd,
          limit: 2000,
        })
      : Promise.resolve([] as ApiManualDataCapture[]),
  ])

  return computeActualByGoalId({
    goals,
    machines,
    productionEvents,
    scrapCaptures,
  })
}

export function summarizeMonthlyGoalProgress(
  goals: ApiGoal[],
  actualByGoalId: Record<string, number>,
  options?: { shiftFilter?: "all" | ApiGoalShift },
): { actual: number; target: number; pct: number; goalCount: number } | null {
  const monthly = selectMonthlyProductionGoals(goals, options)
  if (monthly.length === 0) return null
  const target = monthly.reduce((acc, g) => acc + Number(g.targetValue || 0), 0)
  if (!Number.isFinite(target) || target <= 0) return null
  const actual = monthly.reduce((acc, g) => acc + Number(actualByGoalId[g.id] ?? 0), 0)
  const pct = Math.round((actual / target) * 100)
  return { actual, target, pct, goalCount: monthly.length }
}
