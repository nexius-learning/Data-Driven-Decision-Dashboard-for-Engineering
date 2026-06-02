import path from 'node:path'
import { randomUUID } from 'node:crypto'

import type { AppDb } from '~/db/client'
import {
  pullRequestReviewComments,
  pullRequestReviews,
  pullRequests,
  repositories,
  syncErrors,
  syncRuns,
} from '~/db/schema'
import { PR_SIZE_COMPLETED_TREND_WEEKS } from '~/metrics/pr-cycle-time-dashboard'
import { isoWeekStart } from '~/metrics/pr-size-metric'

export type RemainingDashboardTrendExpansionScenario =
  | 'first-review-comparison'
  | 'pr-size-completed-only'
  | 'pr-size-detached-partial'
  | 'pr-size-detached-overflow'

export const FIX_004_NOW = new Date('2026-04-30T12:00:00.000Z')
export const FIX_004_REPO_ROOT = '/tmp/remaining-dashboard-trend-expansion'
export const FIX_004_PR_SIZE_COMPLETED_POINTS = PR_SIZE_COMPLETED_TREND_WEEKS
export const FIX_004_PR_SIZE_DETACHED_PARTIAL_LINES = 480
export const FIX_004_PR_SIZE_DETACHED_OVERFLOW_LINES = 5_000

const MS_PER_HOUR = 60 * 60 * 1000
const FIX_004_FIRST_REVIEW_WEEKS = 8

type SeedOptions = {
  repoRoot?: string
  scenario: RemainingDashboardTrendExpansionScenario
}

export type RemainingDashboardTrendExpansionSeedResult = {
  now: Date
  repoRoot: string
  repoSyncedId: string
  repoUnsyncedId?: string
}

function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

function makeRepository(repoRoot: string, repo: string, reviewSynced: boolean) {
  return {
    id: randomUUID(),
    name: repo,
    path: path.join(repoRoot, `${repo}-${randomUUID()}`),
    rootPath: repoRoot,
    remoteUrl: `https://github.com/gde-mit/${repo}.git`,
    owner: 'gde-mit',
    repo,
    remoteIdentity: `github:gde-mit/${repo}`,
    team: repo === 'svc-unsynced' ? 'TeamUnsynced' : 'TeamAlpha',
    scanStatus: 'ready' as const,
    active: true,
    lastScannedAt: FIX_004_NOW,
    lastPrSyncedAt: FIX_004_NOW,
    lastReviewSyncedAt: reviewSynced ? FIX_004_NOW : null,
  }
}

function makePr(
  repositoryId: string,
  number: number,
  mergedAt: Date,
  options: { reviewHours?: number; lines?: number } = {},
) {
  const reviewHours = options.reviewHours ?? 24
  const openedAt = new Date(mergedAt.getTime() - (reviewHours + 2) * MS_PER_HOUR)
  return {
    repositoryId,
    githubNodeId: `e2e-fix004-${randomUUID()}`,
    number,
    title: `FIX-004 seeded PR ${number}`,
    state: 'merged',
    openedAt,
    githubUpdatedAt: mergedAt,
    mergedAt,
    url: `https://github.com/gde-mit/svc-alpha/pull/${number}`,
    additions: options.lines ?? null,
    deletions: options.lines === undefined ? null : 0,
    changedFiles: options.lines === undefined ? null : Math.max(1, Math.ceil(options.lines / 80)),
  }
}

async function insertReviewedPr(
  db: AppDb,
  repositoryId: string,
  number: number,
  mergedAt: Date,
  reviewHours: number,
): Promise<void> {
  const [pr] = await db
    .insert(pullRequests)
    .values(makePr(repositoryId, number, mergedAt, { reviewHours }))
    .returning({ id: pullRequests.id, openedAt: pullRequests.openedAt })

  await db.insert(pullRequestReviews).values({
    pullRequestId: pr.id,
    githubReviewId: 10_000 + number,
    state: 'APPROVED',
    submittedAt: new Date(pr.openedAt.getTime() + reviewHours * MS_PER_HOUR),
    authorLogin: 'reviewer',
    authorType: 'User',
    isBot: false,
  })
}

async function seedFirstReviewComparison(
  db: AppDb,
  repoRoot: string,
): Promise<RemainingDashboardTrendExpansionSeedResult> {
  const synced = makeRepository(repoRoot, 'svc-synced', true)
  const unsynced = makeRepository(repoRoot, 'svc-unsynced', false)
  await db.insert(repositories).values([synced, unsynced])

  const currentFrom = new Date('2026-03-05T00:00:00.000Z')
  const previousFrom = new Date('2026-01-08T00:00:00.000Z')
  const previousHours = [2, 4, 8, 12, 24, 36, 48, 72]
  const currentHours = [3, 6, 10, 16, 28, 42, 64, 96]

  for (let index = 0; index < FIX_004_FIRST_REVIEW_WEEKS; index += 1) {
    await insertReviewedPr(
      db,
      synced.id,
      index + 1,
      addUtcDays(previousFrom, index * 7 + 2),
      previousHours[index]!,
    )
    await insertReviewedPr(
      db,
      synced.id,
      index + 101,
      addUtcDays(currentFrom, index * 7 + 2),
      currentHours[index]!,
    )
  }

  await insertReviewedPr(db, unsynced.id, 999, addUtcDays(currentFrom, 3), 240)

  return {
    now: new Date(FIX_004_NOW),
    repoRoot,
    repoSyncedId: synced.id,
    repoUnsyncedId: unsynced.id,
  }
}

async function seedPrSize(
  db: AppDb,
  repoRoot: string,
  scenario: Exclude<RemainingDashboardTrendExpansionScenario, 'first-review-comparison'>,
): Promise<RemainingDashboardTrendExpansionSeedResult> {
  const synced = makeRepository(repoRoot, 'svc-alpha', true)
  await db.insert(repositories).values(synced)

  const currentWeekStart = isoWeekStart(FIX_004_NOW)
  const rows = Array.from({ length: FIX_004_PR_SIZE_COMPLETED_POINTS }, (_, index) => {
    const weekStart = addUtcDays(currentWeekStart, -(FIX_004_PR_SIZE_COMPLETED_POINTS - index) * 7)
    const lines = 40 + index * 80
    return makePr(synced.id, index + 1, addUtcDays(weekStart, 3), { lines })
  })

  if (scenario !== 'pr-size-completed-only') {
    const lines =
      scenario === 'pr-size-detached-overflow'
        ? FIX_004_PR_SIZE_DETACHED_OVERFLOW_LINES
        : FIX_004_PR_SIZE_DETACHED_PARTIAL_LINES
    rows.push(makePr(synced.id, 101, addUtcDays(currentWeekStart, 2), { lines }))
  }

  await db.insert(pullRequests).values(rows)

  return {
    now: new Date(FIX_004_NOW),
    repoRoot,
    repoSyncedId: synced.id,
  }
}

export async function resetRemainingDashboardTrendExpansion(db: AppDb): Promise<void> {
  await db.delete(syncErrors)
  await db.delete(syncRuns)
  await db.delete(pullRequestReviewComments)
  await db.delete(pullRequestReviews)
  await db.delete(pullRequests)
  await db.delete(repositories)
}

export async function seedRemainingDashboardTrendExpansion(
  db: AppDb,
  options: SeedOptions,
): Promise<RemainingDashboardTrendExpansionSeedResult> {
  const repoRoot = options.repoRoot ?? FIX_004_REPO_ROOT

  await db.insert(syncRuns).values({
    id: randomUUID(),
    kind: 'collector_refresh',
    status: 'success',
    startedAt: FIX_004_NOW,
    finishedAt: FIX_004_NOW,
    message: `fix004-e2e-seed:${options.scenario}`,
    errorCount: 0,
  })

  if (options.scenario === 'first-review-comparison') {
    return seedFirstReviewComparison(db, repoRoot)
  }
  return seedPrSize(db, repoRoot, options.scenario)
}
