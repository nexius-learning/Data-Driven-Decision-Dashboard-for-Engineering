import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createDb, runMigrations } from '~/db/client'
import { pullRequestReviews, pullRequests, repositories } from '~/db/schema'
import { getFirstReviewComparisonWeeklyTrend, buildPrAggregate } from '~/metrics/first-review-time'
import { getPrSizeWeeklyTrend } from '~/metrics/pr-size-metric'
import type { PrSizeRecord } from '~/metrics/pr-size-types'

import {
  FIX_004_NOW,
  FIX_004_PR_SIZE_COMPLETED_POINTS,
  FIX_004_PR_SIZE_DETACHED_OVERFLOW_LINES,
  resetRemainingDashboardTrendExpansion,
  seedRemainingDashboardTrendExpansion,
} from './remaining-dashboard-trend-expansion.fixture'

const databaseUrl = process.env.DATABASE_URL?.trim()

describe('remaining dashboard trend expansion fixture', () => {
  let db: ReturnType<typeof createDb>

  beforeAll(async () => {
    await runMigrations(databaseUrl)
    db = createDb(databaseUrl)
  })

  beforeEach(async () => {
    await resetRemainingDashboardTrendExpansion(db)
  })

  afterAll(async () => {
    await resetRemainingDashboardTrendExpansion(db)
    await db.$client.end({ timeout: 5 })
  })

  it('fixture_first_review_comparison_has_previous_and_current_data', async () => {
    const seed = await seedRemainingDashboardTrendExpansion(db, {
      scenario: 'first-review-comparison',
    })
    const prs = await db.select().from(pullRequests)
    const reviews = await db.select().from(pullRequestReviews)
    const repos = await db.select().from(repositories)
    const syncedRepoIds = new Set(
      repos.filter((repo) => repo.lastReviewSyncedAt !== null).map((repo) => repo.id),
    )
    const reviewsByPrId = new Map(reviews.map((review) => [review.pullRequestId, review]))
    const aggregates = prs
      .filter((pr) => pr.mergedAt !== null && syncedRepoIds.has(pr.repositoryId))
      .map((pr) => {
        const review = reviewsByPrId.get(pr.id)!
        return buildPrAggregate({
          pr: {
            id: pr.id,
            number: pr.number,
            title: pr.title,
            repositoryId: pr.repositoryId,
            repoFullName: 'gde-mit/svc-synced',
            team: 'TeamAlpha',
            openedAt: pr.openedAt,
            mergedAt: pr.mergedAt!,
            authorBotFlag: false,
          },
          reviews: [{ state: 'APPROVED', submittedAt: review.submittedAt, isBot: false }],
          reviewComments: [],
        })
      })
    const comparison = getFirstReviewComparisonWeeklyTrend({
      prs: aggregates,
      previous: {
        start: new Date('2026-01-08T00:00:00.000Z'),
        end: new Date('2026-03-05T00:00:00.000Z'),
      },
      current: {
        start: new Date('2026-03-05T00:00:00.000Z'),
        end: new Date('2026-05-01T00:00:00.000Z'),
      },
      weeks: 8,
    })

    expect(seed.repoUnsyncedId).toBeDefined()
    expect(prs.filter((pr) => pr.repositoryId === seed.repoUnsyncedId)).toHaveLength(1)
    expect(comparison.slice(0, 8).every((point) => point.medianHours !== null)).toBe(true)
    expect(comparison.slice(8).every((point) => point.medianHours !== null)).toBe(true)
  })

  it('fixture_pr_size_completed_only_has_16_completed_points', async () => {
    await seedRemainingDashboardTrendExpansion(db, { scenario: 'pr-size-completed-only' })
    const trend = await getPrSizeTrend()

    expect(trend).toHaveLength(FIX_004_PR_SIZE_COMPLETED_POINTS)
    expect(trend.every((point) => point.isPartialWeek === false)).toBe(true)
    expect(trend.every((point) => point.medianLines !== null)).toBe(true)
  })

  it('fixture_pr_size_detached_partial_has_16_plus_one_points', async () => {
    await seedRemainingDashboardTrendExpansion(db, { scenario: 'pr-size-detached-partial' })
    const trend = await getPrSizeTrend()

    expect(trend).toHaveLength(FIX_004_PR_SIZE_COMPLETED_POINTS + 1)
    expect(trend.at(-1)?.isPartialWeek).toBe(true)
  })

  it('fixture_pr_size_detached_overflow_exceeds_completed_axis_domain', async () => {
    await seedRemainingDashboardTrendExpansion(db, { scenario: 'pr-size-detached-overflow' })
    const trend = await getPrSizeTrend()
    const completedMedianLines = trend
      .filter((point) => !point.isPartialWeek)
      .map((point) => point.medianLines!)

    expect(trend.at(-1)).toMatchObject({
      medianLines: FIX_004_PR_SIZE_DETACHED_OVERFLOW_LINES,
      isPartialWeek: true,
    })
    expect(FIX_004_PR_SIZE_DETACHED_OVERFLOW_LINES).toBeGreaterThan(Math.max(...completedMedianLines))
  })

  async function getPrSizeTrend() {
    const rows = await db.select().from(pullRequests)
    const prs: PrSizeRecord[] = rows.map((row) => ({
      id: row.id,
      number: row.number,
      title: row.title,
      url: row.url,
      repositoryId: row.repositoryId,
      repoFullName: 'gde-mit/svc-alpha',
      team: 'TeamAlpha',
      mergedAt: row.mergedAt!,
      additions: row.additions,
      deletions: row.deletions,
      changedFiles: row.changedFiles,
    }))
    return getPrSizeWeeklyTrend(prs, FIX_004_PR_SIZE_COMPLETED_POINTS, FIX_004_NOW, {
      includeCurrentPartial: true,
    })
  }
})
