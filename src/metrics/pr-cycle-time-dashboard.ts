import { desc, eq, inArray, isNotNull } from 'drizzle-orm'

import { getDashboardDateRanges, getEnv } from '~/config/env'
import { loadTeamMapping } from '~/config/team-mapping'
import type { AppDb } from '~/db/client'
import {
  pullRequestReviewComments,
  pullRequestReviews,
  pullRequests,
  repositories,
  syncErrors,
  syncRuns,
} from '~/db/schema'
import { sortExceptionsBySeverityThenMagnitude } from '~/metrics/exception-sort'
import { computeBotShare } from '~/metrics/first-review-bot-share'
import {
  buildFirstReviewExceptions,
  type TeamFirstReviewAgg,
} from '~/metrics/first-review-exceptions'
import { countMergeWithoutReviewByTeam } from '~/metrics/first-review-hygiene'
import { getFirstReviewTeamBreakdown } from '~/metrics/first-review-team-breakdown'
import {
  buildPrAggregate,
  compareFirstReviewPeriods,
  computeFirstReviewMedian,
  getFirstReviewComparisonWeeklyTrend,
  type FirstReviewComparisonPoint,
  type PrAggregate,
  type PrWithReviews,
  type ReviewRow,
} from '~/metrics/first-review-time'
import { calculatePrCycleTime, type PullRequestRecord } from '~/metrics/pr-cycle-time'
import {
  comparePeriods,
  getComparisonWeeklyMedianTrend,
  getWeeklyMedianTrend,
  median,
  type PrCycleTimeComparisonTrendPoint,
} from '~/metrics/pr-cycle-time-summary'
import { buildPrSizeExceptions } from '~/metrics/pr-size-exceptions'
import {
  computePrSizeMetric,
  getPrSizeWeeklyTrend,
  type PrSizeWeeklyTrendPoint,
} from '~/metrics/pr-size-metric'
import { getPrSizeTeamBreakdown } from '~/metrics/pr-size-team-breakdown'
import type { PrSizeRecord } from '~/metrics/pr-size-types'

export type PrCycleTimeDashboardInput = {
  db: AppDb
  weeks?: number
  now?: Date
  team?: string
}

export type StaleOpenPrDetail = {
  prNumber: number
  title: string
  repo: string
  url: string
  ageHours: number
}

export type PrCycleTimeException = {
  type: 'team_worsened' | 'long_open_prs' | 'baseline_pending'
  severity: 'warning' | 'info'
  team: string
  message: string
  count?: number
  teamMedianHours?: number
  staleThresholdHours?: number
  averageOpenPrAgeHours?: number
  percentOverTeamMedian?: number
  percentOverStaleThreshold?: number
  prDetails?: StaleOpenPrDetail[]
}

export type FirstReviewMetric = {
  medianHours: number | null
  previousMedianHours: number | null
  qualifyingPrCount: number
  mergedPrCountInSyncedRepos: number
  trendPercent: number | null
  baselineStatus: 'available' | 'pending'
  botShare: {
    botReviewCount: number
    humanReviewCount: number
    firstReviewByBotCount: number
  } | null
}

export type FirstReviewException = {
  type: 'review_latency_worsened' | 'merge_without_review' | 'review_baseline_pending'
  severity: 'warning' | 'info'
  team: string
  message: string
  trendPercent?: number | null
  count?: number
  prDetails?: Array<{ prNumber: number; title: string; repo: string }>
}

export type SyncError = {
  repoFullName: string
  source: 'github_prs' | 'github_reviews'
  message: string
  occurredAt: string
}

export type FirstReviewTeamRow = {
  team: string
  reviewedPrs: number
  medianHours: number | null
  previousMedianHours: number | null
  trendPercent: number | null
  noReviewMergeCount: number | null
}

export type FirstReview = {
  metric: FirstReviewMetric
  exceptions: FirstReviewException[]
  weeklyTrend: Array<{ weekStart: string; medianHours: number | null }>
  comparisonWeeklyTrend: FirstReviewComparisonPoint[]
  teamBreakdown: FirstReviewTeamRow[]
}

export type ReviewFreshness = {
  oldestReviewSyncAt: string
  reviewSyncErrors: SyncError[]
}

export type ReviewMetricsPending = {
  hint: string
}

export type PrSizeMetric = {
  medianLines: number | null
  medianChangedFiles: number | null
  previousMedianLines: number | null
  trendPercent: number | null
  baselineStatus: 'available' | 'pending'
  qualifyingPrCount: number
}

export type PrSizeException = {
  type: 'oversized_pr_pattern'
  severity: 'warning'
  team: string
  message: string
  flaggedPrCount: number
  totalPrCount: number
}

export type PrSizeTeamRow = {
  team: string
  prCount: number
  medianLines: number | null
  medianChangedFiles: number | null
  previousMedianLines: number | null
  trendPercent: number | null
  trend: '↑' | '↓' | '→' | '—'
  largestPrTitle: string
  largestPrRepo: string
  largestPrUrl: string
  largestPrLines: number
}

export type PrSize = {
  metric: PrSizeMetric
  exceptions: PrSizeException[]
  weeklyTrend: PrSizeWeeklyTrendPoint[]
  teamBreakdown: PrSizeTeamRow[]
}

export type PrCycleTimeDashboard = {
  range: { from: string; to: string; weeks: number }
  metric: {
    medianHours: number | null
    previousMedianHours: number | null
    mergedPrCount: number
    trendPercent: number | null
    baselineStatus: 'available' | 'pending'
  }
  exceptions: PrCycleTimeException[]
  weeklyTrend: Array<{ weekStart: string; medianHours: number | null }>
  comparisonWeeklyTrend: PrCycleTimeComparisonTrendPoint[]
  allTeams: string[]
  teamBreakdown: Array<{
    team: string
    mergedPrs: number
    medianHours: number | null
    previousMedianHours: number | null
    trendPercent: number | null
    longestOpenPrHours: number | null
  }>
  freshness: {
    reposScanned: number
    prMetadataSyncedAt: string | null
    prsMissingJiraKey: number
    syncErrors: number
    latestSyncStatus: 'success' | 'partial' | 'failed' | 'never_run'
  }
  firstReview?: FirstReview
  reviewFreshness?: ReviewFreshness
  reviewMetricsPending?: ReviewMetricsPending
  prSize?: PrSize
}

const MS_PER_HOUR = 1000 * 60 * 60
export const STALE_OPEN_PR_MIN_HOURS = 72
export const STALE_OPEN_PR_DETAIL_LIMIT = 3
export const STALE_OPEN_PR_TEAM_FILTER_DETAIL_LIMIT = 10

export const DASHBOARD_UNASSIGNED_TEAM = 'Unassigned'
export const PR_SIZE_COMPLETED_TREND_WEEKS = 16

export function staleOpenPrThresholdHours(teamMedianHours: number | null): number {
  if (teamMedianHours == null || !Number.isFinite(teamMedianHours) || teamMedianHours <= 0) {
    return STALE_OPEN_PR_MIN_HOURS
  }
  return Math.max(STALE_OPEN_PR_MIN_HOURS, teamMedianHours)
}

/** Sorts team labels alphabetically, pinning "Unassigned" to the end. */
function compareTeamLabels(a: string, b: string): number {
  if (a === DASHBOARD_UNASSIGNED_TEAM && b !== DASHBOARD_UNASSIGNED_TEAM) return 1
  if (b === DASHBOARD_UNASSIGNED_TEAM && a !== DASHBOARD_UNASSIGNED_TEAM) return -1
  return a.localeCompare(b)
}

/** Returns true when the repository is active and its scan has completed. */
function isMetricsRepository(repo: typeof repositories.$inferSelect): boolean {
  return repo.active && repo.scanStatus === 'ready'
}

/** Returns the repo's team label, falling back to DASHBOARD_UNASSIGNED_TEAM when blank. */
function repoTeamLabel(repo: typeof repositories.$inferSelect): string {
  return repo.team?.trim() ? repo.team : DASHBOARD_UNASSIGNED_TEAM
}

/** Casts a raw DB pull request row to a typed PullRequestRecord. */
function rowToPr(row: typeof pullRequests.$inferSelect): PullRequestRecord {
  return {
    ...row,
    state: row.state as PullRequestRecord['state'],
  }
}

/** Returns true when the PR was merged within the current reporting window. */
function mergedInCurrent(pr: PullRequestRecord, from: Date, to: Date): boolean {
  if (pr.mergedAt == null) return false
  const m = pr.mergedAt.getTime()
  return m >= from.getTime() && m <= to.getTime()
}

/** Returns true when the PR was merged in the previous comparison period. */
function mergedInPrevious(pr: PullRequestRecord, previousFrom: Date, currentFrom: Date): boolean {
  if (pr.mergedAt == null) return false
  const m = pr.mergedAt.getTime()
  return m >= previousFrom.getTime() && m < currentFrom.getTime()
}

/** Returns true when the size record was merged within the current reporting window. */
function mergedInCurrentSize(p: PrSizeRecord, from: Date, to: Date): boolean {
  const m = p.mergedAt.getTime()
  return m >= from.getTime() && m <= to.getTime()
}

/** Returns true when the size record falls in the previous comparison window. */
function mergedInPreviousSize(p: PrSizeRecord, previousFrom: Date, currentFrom: Date): boolean {
  const m = p.mergedAt.getTime()
  return m >= previousFrom.getTime() && m < currentFrom.getTime()
}

/** Returns true when the item was merged at or before the reference time. */
function mergedNoLaterThan(p: { mergedAt: Date }, now: Date): boolean {
  return p.mergedAt.getTime() <= now.getTime()
}

/** Extracts cycle time in hours from a merged PR, returning null when unavailable. */
function cycleHoursForMerged(pr: PullRequestRecord): number | null {
  const c = calculatePrCycleTime(pr)
  return c?.cycleTimeHours ?? null
}

/** Serialises a Date to an ISO 8601 string. */
function formatIso(d: Date): string {
  return d.toISOString()
}

type TeamBreakdownRow = PrCycleTimeDashboard['teamBreakdown'][number]

/** Sorts cycle time exceptions in-place by severity, then by worsening magnitude. */
function sortExceptions(exceptions: PrCycleTimeException[], teamBreakdown: TeamBreakdownRow[]): void {
  sortExceptionsBySeverityThenMagnitude(exceptions, (e) => {
    if (e.type !== 'team_worsened') return null
    const tr = teamBreakdown.find((t) => t.team === e.team)?.trendPercent
    return tr == null ? null : Math.abs(tr)
  })
}

/** Computes the full dashboard payload from the database for the given period and optional team filter. */
export async function getPrCycleTimeDashboard(input: PrCycleTimeDashboardInput): Promise<PrCycleTimeDashboard> {
  const env = getEnv()
  const now = input.now ?? new Date()
  const weeks = input.weeks ?? env.defaultRangeWeeks
  const { current, previous } = getDashboardDateRanges(now, weeks)
  await loadTeamMapping(env.teamMappingPath)

  const allRepos = await input.db
    .select()
    .from(repositories)
    .where(eq(repositories.rootPath, env.repoRoot))

  const reposScanned = allRepos.filter((r) => r.scanStatus !== 'missing').length
  const allMetricsRepos = allRepos.filter(isMetricsRepository)
  const teamFilteredRepos =
    input.team !== undefined
      ? allMetricsRepos.filter((r) => repoTeamLabel(r) === input.team)
      : allMetricsRepos
  const metricsRepos = teamFilteredRepos.length > 0 ? teamFilteredRepos : allMetricsRepos
  const metricsRepoIds = metricsRepos.map((r) => r.id)
  const metricsRepoIdSet = new Set(metricsRepoIds)
  const allMetricsRepoIds = allMetricsRepos.map((r) => r.id)

  const prRows =
    allMetricsRepoIds.length === 0
      ? []
      : await input.db.select().from(pullRequests).where(inArray(pullRequests.repositoryId, allMetricsRepoIds))

  const repoById = new Map(allMetricsRepos.map((r) => [r.id, r]))
  const prs: PullRequestRecord[] = []
  const sizePrs: PrSizeRecord[] = []
  for (const row of prRows) {
    prs.push(rowToPr(row))
    if (row.mergedAt == null) continue
    if (!metricsRepoIdSet.has(row.repositoryId)) continue
    const repo = repoById.get(row.repositoryId)
    const repoFullName =
      repo?.owner && repo.repo ? `${repo.owner}/${repo.repo}` : (repo?.name ?? '')
    sizePrs.push({
      id: row.id,
      number: row.number,
      title: row.title,
      url: row.url,
      repositoryId: row.repositoryId,
      repoFullName,
      team: repo ? repoTeamLabel(repo) : DASHBOARD_UNASSIGNED_TEAM,
      mergedAt: row.mergedAt,
      additions: row.additions,
      deletions: row.deletions,
      changedFiles: row.changedFiles,
    })
  }

  const filteredPrs = input.team !== undefined ? prs.filter((p) => metricsRepoIdSet.has(p.repositoryId)) : prs
  const currentMerged = filteredPrs.filter((p) => mergedInCurrent(p, current.from, current.to))
  const previousMerged = filteredPrs.filter((p) => mergedInPrevious(p, previous.from, current.from))

  const currentHours = currentMerged.map(cycleHoursForMerged).filter((h): h is number => h != null)
  const previousHours = previousMerged.map(cycleHoursForMerged).filter((h): h is number => h != null)

  const currentMedian = median(currentHours)
  const previousMedian = median(previousHours)
  const mergedPrCount = currentMerged.length

  const trend = comparePeriods({
    currentMedian,
    previousMedian,
    previousMergedPrCount: previousMerged.length,
  })

  const weeklyTrend = getWeeklyMedianTrend(
    filteredPrs.filter((p) => mergedInCurrent(p, current.from, current.to)),
    current,
  )
  const comparisonWeeklyTrend = getComparisonWeeklyMedianTrend(filteredPrs, previous, current)

  const allCurrentMerged = prs.filter((p) => mergedInCurrent(p, current.from, current.to))
  const allPreviousMerged = prs.filter((p) => mergedInPrevious(p, previous.from, current.from))

  const teamLabels = new Set<string>()
  for (const r of allMetricsRepos) {
    teamLabels.add(repoTeamLabel(r))
  }
  const sortedTeamLabels = [...teamLabels].sort(compareTeamLabels)
  const displayTeamLabels =
    input.team !== undefined ? sortedTeamLabels.filter((l) => l === input.team) : sortedTeamLabels

  const teamBreakdown: TeamBreakdownRow[] = displayTeamLabels.map((teamLabel) => {
    const repoIdsForTeam = new Set(
      allMetricsRepos.filter((r) => repoTeamLabel(r) === teamLabel).map((r) => r.id),
    )

    const curTeam = allCurrentMerged.filter((p) => repoIdsForTeam.has(p.repositoryId))
    const prevTeam = allPreviousMerged.filter((p) => repoIdsForTeam.has(p.repositoryId))
    const curH = curTeam.map(cycleHoursForMerged).filter((h): h is number => h != null)
    const prevMed = median(prevTeam.map(cycleHoursForMerged).filter((h): h is number => h != null))
    const med = median(curH)
    const teamTrend = comparePeriods({
      currentMedian: med,
      previousMedian: prevMed,
      previousMergedPrCount: prevTeam.length,
    })

    const openForTeam = prs.filter((p) => p.state === 'open' && repoIdsForTeam.has(p.repositoryId))
    let longestOpenPrHours: number | null = null
    if (openForTeam.length > 0) {
      const ages = openForTeam.map((p) => (now.getTime() - p.openedAt.getTime()) / MS_PER_HOUR)
      longestOpenPrHours = Math.max(...ages)
    }

    return {
      team: teamLabel,
      mergedPrs: curTeam.length,
      medianHours: med,
      previousMedianHours: prevMed,
      trendPercent: teamTrend.trendPercent,
      longestOpenPrHours,
    }
  })

  const [latestRun] = await input.db
    .select()
    .from(syncRuns)
    .where(isNotNull(syncRuns.finishedAt))
    .orderBy(desc(syncRuns.finishedAt), desc(syncRuns.id))
    .limit(1)

  let latestSyncStatus: PrCycleTimeDashboard['freshness']['latestSyncStatus'] = 'never_run'
  if (latestRun && (latestRun.status === 'success' || latestRun.status === 'partial' || latestRun.status === 'failed')) {
    latestSyncStatus = latestRun.status
  }

  const prsMissingJiraKey = filteredPrs.filter(
    (p) => p.missingJiraKey && (p.state === 'open' || mergedInCurrent(p, current.from, current.to)),
  ).length

  const exceptions: PrCycleTimeException[] = []

  for (const row of teamBreakdown) {
    const prevTeam = previousMerged.filter((p) => {
      const r = repoById.get(p.repositoryId)
      return r != null && repoTeamLabel(r) === row.team
    })

    if (row.mergedPrs > 0 && prevTeam.length < 3) {
      exceptions.push({
        type: 'baseline_pending',
        severity: 'info',
        team: row.team,
        message: `${row.team} has fewer than 3 merged pull requests in the previous period; baseline comparison is pending.`,
      })
    }

    const prevTeamMedian = median(
      prevTeam.map(cycleHoursForMerged).filter((h): h is number => h != null),
    )

    const teamBaselineAvailable =
      prevTeam.length >= 3 && prevTeamMedian != null && prevTeamMedian > 0

    if (
      teamBaselineAvailable &&
      row.medianHours != null &&
      prevTeamMedian != null &&
      row.medianHours >= prevTeamMedian * 1.25
    ) {
      exceptions.push({
        type: 'team_worsened',
        severity: 'warning',
        team: row.team,
        message: `${row.team} median PR cycle time worsened by at least 25% versus the previous period.`,
      })
    }

    if (row.medianHours != null) {
      const teamMedian = row.medianHours
      const tooOldPrs = prs.filter((p) => {
        if (p.state !== 'open') return false
        const r = repoById.get(p.repositoryId)
        if (!r || repoTeamLabel(r) !== row.team) return false
        const ageH = (now.getTime() - p.openedAt.getTime()) / MS_PER_HOUR
        return ageH > teamMedian
      })
      const tooOldCount = tooOldPrs.length
      if (tooOldCount > 0) {
        const tooOldAges = tooOldPrs.map((p) => (now.getTime() - p.openedAt.getTime()) / MS_PER_HOUR)
        const averageOpenPrAgeHours = tooOldAges.reduce((sum, age) => sum + age, 0) / tooOldAges.length
        exceptions.push({
          type: 'long_open_prs',
          severity: 'warning',
          team: row.team,
          message: `${row.team} has open pull requests older than the team's current median cycle time.`,
          count: tooOldCount,
          teamMedianHours: teamMedian,
          averageOpenPrAgeHours,
          percentOverTeamMedian:
            teamMedian > 0 ? ((averageOpenPrAgeHours - teamMedian) / teamMedian) * 100 : undefined,
        })
      }
    }
  }

  sortExceptions(exceptions, teamBreakdown)
  const scopedExceptions = input.team !== undefined ? exceptions.filter((e) => e.team === input.team) : exceptions
  const limited = scopedExceptions.slice(0, 3)

  const sizePrsForTrend = sizePrs.filter((p) => mergedNoLaterThan(p, now))
  const currentSizePrs = sizePrs.filter(
    (p) => mergedInCurrentSize(p, current.from, current.to) && mergedNoLaterThan(p, now),
  )
  const priorSizePrs = sizePrs.filter((p) => mergedInPreviousSize(p, previous.from, current.from))
  const prSizeMetric = computePrSizeMetric(currentSizePrs, priorSizePrs)
  const currentTeamPrs = new Map<string, PrSizeRecord[]>()
  for (const p of currentSizePrs) {
    const team = p.team?.trim() ? p.team : DASHBOARD_UNASSIGNED_TEAM
    const list = currentTeamPrs.get(team) ?? []
    list.push(p)
    currentTeamPrs.set(team, list)
  }
  const prSizeOptional: PrSize | undefined =
    prSizeMetric.qualifyingPrCount > 0
      ? {
          metric: prSizeMetric,
          exceptions: buildPrSizeExceptions(currentTeamPrs),
          weeklyTrend: getPrSizeWeeklyTrend(sizePrsForTrend, PR_SIZE_COMPLETED_TREND_WEEKS, now, {
            includeCurrentPartial: true,
          }),
          teamBreakdown: getPrSizeTeamBreakdown(sizePrsForTrend, current, previous, displayTeamLabels),
        }
      : undefined

  const phase01: PrCycleTimeDashboard = {
    range: {
      from: formatIso(current.from),
      to: formatIso(current.to),
      weeks: current.weeks,
    },
    metric: {
      medianHours: currentMedian,
      previousMedianHours: previousMedian,
      mergedPrCount,
      trendPercent: trend.trendPercent,
      baselineStatus: trend.baselineStatus,
    },
    exceptions: limited,
    weeklyTrend,
    comparisonWeeklyTrend,
    allTeams: sortedTeamLabels,
    teamBreakdown,
    freshness: {
      reposScanned,
      prMetadataSyncedAt: latestRun?.finishedAt ? formatIso(latestRun.finishedAt) : null,
      prsMissingJiraKey,
      syncErrors: latestRun?.errorCount ?? 0,
      latestSyncStatus,
    },
  }

  const syncedRepos = metricsRepos.filter((r) => r.lastReviewSyncedAt !== null)
  if (syncedRepos.length === 0) {
    return {
      ...phase01,
      ...(prSizeOptional ? { prSize: prSizeOptional } : {}),
      reviewMetricsPending: { hint: 'Review metrics will appear after the next refresh' },
    }
  }

  const syncedRepoIds = new Set(syncedRepos.map((r) => r.id))
  const mergedPrsInSyncedRepos = prs.filter(
    (p) => p.mergedAt !== null && syncedRepoIds.has(p.repositoryId),
  )
  const mergedPrIds = mergedPrsInSyncedRepos.map((p) => p.id)

  const reviewRows =
    mergedPrIds.length === 0
      ? []
      : await input.db
          .select()
          .from(pullRequestReviews)
          .where(inArray(pullRequestReviews.pullRequestId, mergedPrIds))
  const reviewCommentRows =
    mergedPrIds.length === 0
      ? []
      : await input.db
          .select()
          .from(pullRequestReviewComments)
          .where(inArray(pullRequestReviewComments.pullRequestId, mergedPrIds))

  const reviewsByPrId = new Map<string, ReviewRow[]>()
  for (const r of reviewRows) {
    const list = reviewsByPrId.get(r.pullRequestId) ?? []
    list.push({
      state: r.state as ReviewRow['state'],
      submittedAt: r.submittedAt,
      isBot: r.isBot,
    })
    reviewsByPrId.set(r.pullRequestId, list)
  }
  const commentsByPrId = new Map<string, { createdAt: Date }[]>()
  for (const c of reviewCommentRows) {
    const list = commentsByPrId.get(c.pullRequestId) ?? []
    list.push({ createdAt: c.createdAt })
    commentsByPrId.set(c.pullRequestId, list)
  }

  const aggregates: PrAggregate[] = mergedPrsInSyncedRepos.map((p) => {
    const repo = repoById.get(p.repositoryId)
    const repoFullName = repo?.owner && repo.repo ? `${repo.owner}/${repo.repo}` : repo?.name ?? ''
    const input: PrWithReviews = {
      pr: {
        id: p.id,
        number: p.number,
        title: p.title,
        repositoryId: p.repositoryId,
        repoFullName,
        team: repo ? repoTeamLabel(repo) : DASHBOARD_UNASSIGNED_TEAM,
        openedAt: p.openedAt,
        mergedAt: p.mergedAt as Date,
        authorBotFlag: false,
      },
      reviews: reviewsByPrId.get(p.id) ?? [],
      reviewComments: commentsByPrId.get(p.id) ?? [],
    }
    return buildPrAggregate(input)
  })

  const currentRange = { start: current.from, end: current.to }
  const previousRange = { start: previous.from, end: current.from }

  const currentAggs = aggregates.filter((a) => {
    const t = a.mergedAt.getTime()
    return t >= currentRange.start.getTime() && t < currentRange.end.getTime()
  })
  const previousAggs = aggregates.filter((a) => {
    const t = a.mergedAt.getTime()
    return t >= previousRange.start.getTime() && t < previousRange.end.getTime()
  })

  const cur = computeFirstReviewMedian({
    prs: currentAggs,
    range: currentRange,
    reviewSyncedRepoIds: syncedRepoIds,
  })
  const prev = computeFirstReviewMedian({
    prs: previousAggs,
    range: previousRange,
    reviewSyncedRepoIds: syncedRepoIds,
  })
  const firstReviewCompare = compareFirstReviewPeriods({
    currentMedian: cur.medianHours,
    previousMedian: prev.medianHours,
    previousQualifyingPrCount: prev.M,
  })

  const bot = computeBotShare({
    prs: currentAggs,
    reviewSyncedRepoIds: syncedRepoIds,
    range: currentRange,
  })

  const firstReviewComparisonWeekly = getFirstReviewComparisonWeeklyTrend({
    prs: aggregates,
    previous: previousRange,
    current: currentRange,
    weeks: current.weeks,
  })
  const firstReviewWeekly = firstReviewComparisonWeekly.slice(current.weeks).map((point) => ({
    weekStart: point.bucketLabel,
    medianHours: point.medianHours,
  }))

  const teamLabelsFR = new Set<string>()
  for (const r of syncedRepos) teamLabelsFR.add(repoTeamLabel(r))
  for (const a of currentAggs) teamLabelsFR.add(a.team)
  const sortedTeamLabelsFR = [...teamLabelsFR].sort(compareTeamLabels)

  const hygieneCounts = countMergeWithoutReviewByTeam(currentAggs)

  const teamAggs: TeamFirstReviewAgg[] = sortedTeamLabelsFR.map((teamName) => {
    const curTeam = currentAggs.filter((a) => a.team === teamName)
    const prevTeam = previousAggs.filter((a) => a.team === teamName)
    const curHumanHours = curTeam
      .filter((a) => a.firstQualifyingHumanReviewAt !== null)
      .map(
        (a) =>
          ((a.firstQualifyingHumanReviewAt as Date).getTime() - a.openedAt.getTime()) /
          MS_PER_HOUR,
      )
    const prevHumanHours = prevTeam
      .filter((a) => a.firstQualifyingHumanReviewAt !== null)
      .map(
        (a) =>
          ((a.firstQualifyingHumanReviewAt as Date).getTime() - a.openedAt.getTime()) /
          MS_PER_HOUR,
      )
    const med = median(curHumanHours)
    const prevMed = median(prevHumanHours)
    const cmp = compareFirstReviewPeriods({
      currentMedian: med,
      previousMedian: prevMed,
      previousQualifyingPrCount: prevHumanHours.length,
    })
    const nrm = hygieneCounts.get(teamName) ?? null
    return {
      team: teamName,
      currentQualifyingPrCount: curHumanHours.length,
      previousQualifyingPrCount: prevHumanHours.length,
      medianHours: med,
      previousMedianHours: prevMed,
      trendPercent: cmp.trendPercent,
      noReviewMergeCount: nrm,
    }
  })

  const firstReviewExceptions = buildFirstReviewExceptions({
    teams: teamAggs,
    prs: currentAggs,
  }).map((e) => ({ ...e, message: formatFirstReviewMessage(e) }))

  const firstReview: FirstReview = {
    metric: {
      medianHours: cur.medianHours,
      previousMedianHours: prev.medianHours,
      qualifyingPrCount: cur.M,
      mergedPrCountInSyncedRepos: cur.N,
      trendPercent: firstReviewCompare.trendPercent,
      baselineStatus: firstReviewCompare.baselineStatus,
      botShare: bot,
    },
    exceptions: firstReviewExceptions,
    weeklyTrend: firstReviewWeekly,
    comparisonWeeklyTrend: firstReviewComparisonWeekly,
    teamBreakdown: getFirstReviewTeamBreakdown({ teams: teamAggs }),
  }

  const oldestReviewSyncMs = Math.min(
    ...syncedRepos.map((r) => (r.lastReviewSyncedAt as Date).getTime()),
  )

  const reviewSyncErrorsList: SyncError[] = []
  if (latestRun) {
    const rows = await input.db
      .select()
      .from(syncErrors)
      .where(eq(syncErrors.syncRunId, latestRun.id))
    for (const row of rows) {
      if (row.source !== 'github_reviews') continue
      const repo = row.repositoryId ? repoById.get(row.repositoryId) : null
      const repoFullName =
        repo && repo.owner && repo.repo ? `${repo.owner}/${repo.repo}` : repo?.name ?? ''
      reviewSyncErrorsList.push({
        repoFullName,
        source: 'github_reviews',
        message: row.message,
        occurredAt: formatIso(row.createdAt),
      })
    }
  }

  return {
    ...phase01,
    ...(prSizeOptional ? { prSize: prSizeOptional } : {}),
    firstReview,
    reviewFreshness: {
      oldestReviewSyncAt: formatIso(new Date(oldestReviewSyncMs)),
      reviewSyncErrors: reviewSyncErrorsList,
    },
  }
}

/** Renders the human-readable message for a first-review exception type and team. */
function formatFirstReviewMessage(e: { type: string; team: string }): string {
  if (e.type === 'review_latency_worsened') {
    return `${e.team} first review median worsened by at least 25% versus the previous period.`
  }
  if (e.type === 'merge_without_review') {
    return `${e.team} merged at least one PR with no qualifying review.`
  }
  return `${e.team} first review baseline is pending (fewer than 3 qualifying human reviews in the previous period).`
}
