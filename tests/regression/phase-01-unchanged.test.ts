import { describe, expect, expectTypeOf, it } from 'vitest'
import type { PrCycleTimeDashboard } from '~/metrics/pr-cycle-time-dashboard'

type Phase01TeamColumn =
  | 'team'
  | 'mergedPrs'
  | 'medianHours'
  | 'previousMedianHours'
  | 'trendPercent'
  | 'longestOpenPrHours'

describe('phase 01 unchanged regression', () => {
  it('phase01_cycle_time_unchanged', () => {
    expectTypeOf<PrCycleTimeDashboard['metric']>().toEqualTypeOf<{
      medianHours: number | null
      previousMedianHours: number | null
      mergedPrCount: number
      trendPercent: number | null
      baselineStatus: 'available' | 'pending'
    }>()
  })

  it('phase_01_team_table_columns_unchanged_regression', () => {
    type TeamRow = PrCycleTimeDashboard['teamBreakdown'][number]
    expectTypeOf<keyof TeamRow>().toEqualTypeOf<Phase01TeamColumn>()
  })

  it('no_future_metric_cards', () => {
    const minimal: PrCycleTimeDashboard = {
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
    expect(minimal.firstReview).toBeUndefined()
    expect(minimal.reviewFreshness).toBeUndefined()
  })

  it('phase_01_freshness_type_shape_unchanged', () => {
    expectTypeOf<PrCycleTimeDashboard['freshness']>().toEqualTypeOf<{
      reposScanned: number
      prMetadataSyncedAt: string | null
      prsMissingJiraKey: number
      syncErrors: number
      latestSyncStatus: 'success' | 'partial' | 'failed' | 'never_run'
    }>()
  })
})
