import { describe, expectTypeOf, it } from 'vitest'
import type {
  FirstReview,
  FirstReviewException,
  FirstReviewMetric,
  FirstReviewTeamRow,
  PrCycleTimeDashboard,
  ReviewFreshness,
  ReviewMetricsPending,
  SyncError,
} from '~/metrics/pr-cycle-time-dashboard'
import type { FirstReviewComparisonPoint } from '~/metrics/first-review-time'

describe('phase 02 payload types', () => {
  it('phase_01_freshness_type_shape_unchanged', () => {
    expectTypeOf<PrCycleTimeDashboard['freshness']>().toEqualTypeOf<{
      reposScanned: number
      prMetadataSyncedAt: string | null
      prsMissingJiraKey: number
      syncErrors: number
      latestSyncStatus: 'success' | 'partial' | 'failed' | 'never_run'
    }>()
  })

  it('phase_01_payload_fields_unchanged_regression', () => {
    expectTypeOf<PrCycleTimeDashboard['range']>().toEqualTypeOf<{
      from: string
      to: string
      weeks: number
    }>()
  })

  it('phase_02_payload_fields_are_optional', () => {
    const partial: PrCycleTimeDashboard = {
      range: { from: '', to: '', weeks: 0 },
      metric: {
        medianHours: null,
        previousMedianHours: null,
        mergedPrCount: 0,
        trendPercent: null,
        baselineStatus: 'pending',
      },
      exceptions: [],
      weeklyTrend: [],
      comparisonWeeklyTrend: [],
      allTeams: [],
    teamBreakdown: [],
      freshness: {
        reposScanned: 0,
        prMetadataSyncedAt: null,
        prsMissingJiraKey: 0,
        syncErrors: 0,
        latestSyncStatus: 'never_run',
      },
    }
    // No firstReview/reviewFreshness/reviewMetricsPending — compiles.
    expect(partial.firstReview).toBeUndefined()
    expect(partial.reviewFreshness).toBeUndefined()
    expect(partial.reviewMetricsPending).toBeUndefined()
  })

  it('first_review_types_are_exported', () => {
    expectTypeOf<FirstReview>().toBeObject()
    expectTypeOf<FirstReviewMetric>().toBeObject()
    expectTypeOf<FirstReviewException>().toBeObject()
    expectTypeOf<FirstReviewTeamRow>().toBeObject()
    expectTypeOf<SyncError>().toBeObject()
    expectTypeOf<ReviewFreshness>().toBeObject()
    expectTypeOf<ReviewMetricsPending>().toBeObject()
  })

  it('first_review_comparison_point_type_includes_period_boundaries_and_reset_index', () => {
    const point: FirstReviewComparisonPoint = {
      period: 'current',
      bucketIndex: 1,
      bucketStart: '2026-03-05T00:00:00.000Z',
      bucketEnd: '2026-03-12T00:00:00.000Z',
      bucketLabel: '2026-03-05',
      medianHours: 3,
    }
    const firstReview: FirstReview = {
      metric: {
        medianHours: 3,
        previousMedianHours: null,
        qualifyingPrCount: 1,
        mergedPrCountInSyncedRepos: 1,
        trendPercent: null,
        baselineStatus: 'pending',
        botShare: null,
      },
      exceptions: [],
      weeklyTrend: [],
      comparisonWeeklyTrend: [point],
      allTeams: [],
    teamBreakdown: [],
    }
    expectTypeOf(firstReview.comparisonWeeklyTrend).toEqualTypeOf<FirstReviewComparisonPoint[]>()
  })
})

import { expect } from 'vitest'
