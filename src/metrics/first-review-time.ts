import { isMergeWithoutReview } from '~/metrics/first-review-hygiene-predicate'
import { median } from '~/metrics/pr-cycle-time-summary'

export type ReviewState = 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'PENDING' | 'DISMISSED'

export type ReviewRow = {
  state: ReviewState
  submittedAt: Date | null
  isBot: boolean
}

export type ReviewCommentRow = {
  createdAt: Date
}

export type PrWithReviews = {
  pr: {
    id: string
    number: number
    title: string
    repositoryId: string
    repoFullName: string
    team: string
    openedAt: Date
    mergedAt: Date
    authorBotFlag: boolean
  }
  reviews: ReviewRow[]
  reviewComments: ReviewCommentRow[]
}

export type PrAggregate = {
  prId: string
  prNumber: number
  title: string
  repoId: string
  repoFullName: string
  team: string
  openedAt: Date
  mergedAt: Date
  firstQualifyingHumanReviewAt: Date | null
  anyQualifyingReviewCount: number
  qualifyingHumanReviewCount: number
  qualifyingBotReviewCount: number
  firstQualifyingReviewIsBot: boolean
  preMergeCommentCount: number
  mergeWithoutReviewMatchesHygieneRule: boolean
}

const QUALIFYING_STATES: ReadonlySet<ReviewState> = new Set([
  'APPROVED',
  'CHANGES_REQUESTED',
  'COMMENTED',
])

const SEVEN_MINUTES_MS = 7 * 60 * 1000

function isQualifying(r: ReviewRow, mergedAt: Date): boolean {
  if (!QUALIFYING_STATES.has(r.state)) return false
  if (r.submittedAt === null) return false
  if (r.submittedAt.getTime() >= mergedAt.getTime()) return false
  return true
}

export function getFirstHumanReviewSubmittedAt(reviews: ReviewRow[], mergedAt: Date): Date | null {
  let earliest: Date | null = null
  for (const r of reviews) {
    if (!isQualifying(r, mergedAt)) continue
    if (r.isBot) continue
    if (earliest === null || (r.submittedAt as Date).getTime() < earliest.getTime()) {
      earliest = r.submittedAt
    }
  }
  return earliest
}

export function getFirstReviewHours(pr: { openedAt: Date }, firstHumanReviewSubmittedAt: Date): number {
  return (firstHumanReviewSubmittedAt.getTime() - pr.openedAt.getTime()) / (1000 * 60 * 60)
}

export type DateRange = { start: Date; end: Date }

function isInRange(date: Date, range: DateRange): boolean {
  const t = date.getTime()
  return t >= range.start.getTime() && t < range.end.getTime()
}

export type FirstReviewMedianResult = {
  medianHours: number | null
  M: number
  N: number
}

export type WeeklyMedianPoint = {
  weekStart: string
  medianHours: number | null
}

export type FirstReviewTrendPeriod = 'previous' | 'current'

export type FirstReviewComparisonPoint = {
  period: FirstReviewTrendPeriod
  bucketIndex: number
  bucketStart: string
  bucketEnd: string
  bucketLabel: string
  medianHours: number | null
}

function addCalendarDays(d: Date, deltaDays: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + deltaDays)
  return x
}

function getCalendarWeekCount(range: DateRange): number {
  let weeks = 1
  while (addCalendarDays(range.start, weeks * 7).getTime() < range.end.getTime()) {
    weeks += 1
  }
  return weeks
}

function formatLocalDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function getFirstReviewComparisonWeeklyTrend(input: {
  prs: PrAggregate[]
  previous: DateRange
  current: DateRange
  weeks: number
}): FirstReviewComparisonPoint[] {
  const points: FirstReviewComparisonPoint[] = []

  const appendPeriod = (period: FirstReviewTrendPeriod, range: DateRange) => {
    for (let i = 0; i < input.weeks; i += 1) {
      const bucketStart = addCalendarDays(range.start, i * 7)
      const bucketEnd =
        i === input.weeks - 1 ? new Date(range.end) : addCalendarDays(range.start, (i + 1) * 7)
      const hours: number[] = []

      for (const p of input.prs) {
        if (p.firstQualifyingHumanReviewAt === null) continue
        const mergedAt = p.mergedAt.getTime()
        if (mergedAt < bucketStart.getTime() || mergedAt >= bucketEnd.getTime()) continue
        hours.push(getFirstReviewHours(p, p.firstQualifyingHumanReviewAt))
      }

      points.push({
        period,
        bucketIndex: i + 1,
        bucketStart: bucketStart.toISOString(),
        bucketEnd: bucketEnd.toISOString(),
        bucketLabel: formatLocalDate(bucketStart),
        medianHours: hours.length === 0 ? null : median(hours),
      })
    }
  }

  appendPeriod('previous', input.previous)
  appendPeriod('current', input.current)

  return points
}

export function getFirstReviewWeeklyTrend(
  prs: PrAggregate[],
  range: DateRange,
  weeks = getCalendarWeekCount(range),
): WeeklyMedianPoint[] {
  const previous = {
    start: addCalendarDays(range.start, -weeks * 7),
    end: new Date(range.start),
  }
  return getFirstReviewComparisonWeeklyTrend({ prs, previous, current: range, weeks })
    .slice(weeks)
    .map((point) => ({
      weekStart: point.bucketLabel,
      medianHours: point.medianHours,
    }))
}

export function compareFirstReviewPeriods(input: {
  currentMedian: number | null
  previousMedian: number | null
  previousQualifyingPrCount: number
}): { trendPercent: number | null; baselineStatus: 'available' | 'pending' } {
  if (
    input.previousQualifyingPrCount < 3 ||
    input.previousMedian === null ||
    input.previousMedian === 0
  ) {
    return { trendPercent: null, baselineStatus: 'pending' }
  }
  if (input.currentMedian === null) {
    return { trendPercent: null, baselineStatus: 'available' }
  }
  const trendPercent = ((input.currentMedian - input.previousMedian) / input.previousMedian) * 100
  return { trendPercent, baselineStatus: 'available' }
}

export function computeFirstReviewMedian(input: {
  prs: PrAggregate[]
  range: DateRange
  reviewSyncedRepoIds: Set<string>
}): FirstReviewMedianResult {
  const inN = input.prs.filter(
    (p) => input.reviewSyncedRepoIds.has(p.repoId) && isInRange(p.mergedAt, input.range),
  )
  const qualifying = inN.filter((p) => p.firstQualifyingHumanReviewAt !== null)
  const hours = qualifying.map((p) =>
    getFirstReviewHours(p, p.firstQualifyingHumanReviewAt as Date),
  )
  return {
    medianHours: hours.length === 0 ? null : median(hours),
    M: qualifying.length,
    N: inN.length,
  }
}

export function buildPrAggregate(input: PrWithReviews): PrAggregate {
  const { pr, reviews, reviewComments } = input
  const mergedAt = pr.mergedAt
  const qualifying = reviews.filter((r) => isQualifying(r, mergedAt))
  const sortedQualifying = qualifying
    .slice()
    .sort((a, b) => (a.submittedAt as Date).getTime() - (b.submittedAt as Date).getTime())
  const firstAny = sortedQualifying[0]
  const human = qualifying.filter((r) => !r.isBot)
  const bot = qualifying.filter((r) => r.isBot)
  const firstHuman = human
    .slice()
    .sort((a, b) => (a.submittedAt as Date).getTime() - (b.submittedAt as Date).getTime())[0]

  const preMergeCommentCount = reviewComments.filter((c) => c.createdAt.getTime() < mergedAt.getTime()).length

  const anyQualifyingReviewCount = qualifying.length
  const hygieneFromPredicate = isMergeWithoutReview({
    authorBotFlag: pr.authorBotFlag,
    anyQualifyingReviewCount,
    preMergeCommentCount,
  })
  const mergeWithoutReviewMatchesHygieneRule =
    hygieneFromPredicate && mergedAt.getTime() - pr.openedAt.getTime() < SEVEN_MINUTES_MS

  return {
    prId: pr.id,
    prNumber: pr.number,
    title: pr.title,
    repoId: pr.repositoryId,
    repoFullName: pr.repoFullName,
    team: pr.team,
    openedAt: pr.openedAt,
    mergedAt,
    firstQualifyingHumanReviewAt: firstHuman?.submittedAt ?? null,
    anyQualifyingReviewCount,
    qualifyingHumanReviewCount: human.length,
    qualifyingBotReviewCount: bot.length,
    firstQualifyingReviewIsBot: firstAny ? firstAny.isBot : false,
    preMergeCommentCount,
    mergeWithoutReviewMatchesHygieneRule,
  }
}
