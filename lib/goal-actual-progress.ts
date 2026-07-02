import {
  getMetricPoints,
  getProductionEvents,
  type ApiGoal,
  type ApiGoalShift,
  type ApiMachine,
  type ApiMetric,
  type ApiMetricPoint,
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
  productionUnitsFromEvent,
  resolveProductionEventSku,
} from "@/lib/production-goal-events"
import { productionShiftFromMeasuredAt } from "@/lib/tablero-operator-goal"

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

export function isProductionMetricName(name: string): boolean {
  const normalized = name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
  return normalized === "produccion"
}

export function getProductionMetricIds(metrics: ApiMetric[]): Set<string> {
  return new Set(metrics.filter((m) => isProductionMetricName(m.name)).map((m) => m.id))
}

export function resolveProductionMetricId(metrics: ApiMetric[]): string | null {
  return metrics.find((m) => isProductionMetricName(m.name))?.id ?? null
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
  metrics: ApiMetric[],
  options?: { shiftFilter?: "all" | ApiGoalShift; ref?: Date },
): ApiGoal[] {
  const productionMetricIds = getProductionMetricIds(metrics)
  if (productionMetricIds.size === 0) return []

  const ref = options?.ref ?? new Date()
  return goals.filter((g) => {
    if (!isGoalActive(g)) return false
    if (!productionMetricIds.has(g.metricId)) return false
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

export function computeActualByGoalId(input: {
  goals: ApiGoal[]
  machines: ApiMachine[]
  metricPoints: ApiMetricPoint[]
  productionEvents: ApiProductionEvent[]
  metrics?: ApiMetric[]
}): Record<string, number> {
  const { goals, machines, metricPoints, productionEvents, metrics = [] } = input
  const { skuById, upbById } = buildMachineMaps(machines)
  const productionMetricIds = getProductionMetricIds(metrics)
  const activeGoals = goals.filter(isGoalActive)
  const skuGoals = activeGoals.filter((g) => normalizeSku(g.sku))
  const nonSkuGoals = activeGoals.filter((g) => !normalizeSku(g.sku))
  const actual: Record<string, number> = {}

  for (const g of nonSkuGoals) {
    const range = goalComplianceDateRange(g)
    const { from, to } = toDateTimeRange(range.startDate, range.endDate)
    const shift = g.shift ?? null
    let sum = metricPoints
      .filter((p) => p.metricId === g.metricId)
      .filter((p) => (g.lineId ? p.lineId === g.lineId : true))
      .filter((p) => (g.machineId ? p.machineId === g.machineId : true))
      .filter((p) => p.measuredAt >= from && p.measuredAt <= to)
      .filter((p) => {
        if (!shift) return true
        return productionShiftFromMeasuredAt(p.measuredAt) === shift
      })
      .reduce((acc, p) => acc + Number(p.value ?? 0), 0)

    if (sum <= 0 && productionMetricIds.has(g.metricId)) {
      sum = productionEvents
        .filter((e) => (g.machineId ? e.machineId === g.machineId : true))
        .filter((e) => e.occurredAt >= from && e.occurredAt <= to)
        .filter((e) => {
          if (!shift) return true
          return productionShiftFromMeasuredAt(e.occurredAt) === shift
        })
        .reduce((acc, e) => acc + productionUnitsFromEvent(e, upbById), 0)
    }

    actual[g.id] = sum
  }

  for (const g of skuGoals) {
    const goalSku = normalizeSku(g.sku)?.toLowerCase()
    if (!goalSku) continue
    const range = goalComplianceDateRange(g)
    const { from, to } = toDateTimeRange(range.startDate, range.endDate)
    const shift = g.shift ?? null
    actual[g.id] = productionEvents
      .filter((e) => (g.machineId ? e.machineId === g.machineId : true))
      .filter((e) => e.occurredAt >= from && e.occurredAt <= to)
      .filter((e) => {
        if (!shift) return true
        return productionShiftFromMeasuredAt(e.occurredAt) === shift
      })
      .filter((e) => {
        const eventSku = resolveProductionEventSku(e, skuById)
        return eventSku?.trim().toLowerCase() === goalSku
      })
      .reduce((acc, e) => acc + productionUnitsFromEvent(e, upbById), 0)
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
  metrics: ApiMetric[] = [],
): Promise<Record<string, number>> {
  if (goals.length === 0) return {}

  const activeGoals = goals.filter(isGoalActive)
  if (activeGoals.length === 0) {
    return Object.fromEntries(goals.map((g) => [g.id, 0]))
  }

  const skuGoals = activeGoals.filter((g) => normalizeSku(g.sku))
  const nonSkuGoals = activeGoals.filter((g) => !normalizeSku(g.sku))
  const metricIds = Array.from(new Set(activeGoals.map((g) => g.metricId)))
  const productionMetricIds = getProductionMetricIds(metrics)
  const needsProductionEvents =
    skuGoals.length > 0 ||
    nonSkuGoals.some((g) => productionMetricIds.has(g.metricId))

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

  const [pointsByMetric, productionEvents] = await Promise.all([
    nonSkuGoals.length > 0
      ? Promise.all(
          metricIds.map((metricId) =>
            getMetricPoints(accessToken, {
              metricId,
              from: range.from,
              to: range.to,
              limit: 5000,
            }),
          ),
        )
      : Promise.resolve([] as ApiMetricPoint[][]),
    needsProductionEvents
      ? getProductionEvents(accessToken, { from: range.from, to: range.to, limit: 10000 })
      : Promise.resolve([] as ApiProductionEvent[]),
  ])

  return computeActualByGoalId({
    goals,
    machines,
    metricPoints: pointsByMetric.flat(),
    productionEvents,
    metrics,
  })
}

export function summarizeMonthlyGoalProgress(
  goals: ApiGoal[],
  actualByGoalId: Record<string, number>,
  metrics: ApiMetric[],
  options?: { shiftFilter?: "all" | ApiGoalShift },
): { actual: number; target: number; pct: number; goalCount: number } | null {
  const monthly = selectMonthlyProductionGoals(goals, metrics, options)
  if (monthly.length === 0) return null
  const target = monthly.reduce((acc, g) => acc + Number(g.targetValue || 0), 0)
  if (!Number.isFinite(target) || target <= 0) return null
  const actual = monthly.reduce((acc, g) => acc + Number(actualByGoalId[g.id] ?? 0), 0)
  const pct = Math.round((actual / target) * 100)
  return { actual, target, pct, goalCount: monthly.length }
}
