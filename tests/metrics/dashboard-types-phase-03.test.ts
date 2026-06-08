import { describe, expect, expectTypeOf, it } from 'vitest'
import type {
  PrCycleTimeDashboard,
  PrSize,
  PrSizeException,
  PrSizeMetric,
  PrSizeTeamRow,
} from '~/metrics/pr-cycle-time-dashboard'
import type { PrSizeWeeklyTrendPoint } from '~/metrics/pr-size-metric'

describe('phase 03 payload types', () => {
  it('dashboard_type_prSize_key_is_optional', () => {
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
    expect(partial.prSize).toBeUndefined()
  })

  it('pr_size_type_shape_matches_spec', () => {
    const metric: PrSizeMetric = {
      medianLines: 312,
      medianChangedFiles: 5,
      previousMedianLines: 280,
      trendPercent: 11.4,
      baselineStatus: 'available',
      qualifyingPrCount: 12,
    }

    const exception: PrSizeException = {
      type: 'oversized_pr_pattern',
      severity: 'warning',
      team: 'Platform',
      message: '2 of 4 PRs exceed 2× team median',
      flaggedPrCount: 2,
      totalPrCount: 4,
    }

    const teamRow: PrSizeTeamRow = {
      team: 'Platform',
      prCount: 4,
      medianLines: 200,
      medianChangedFiles: 7,
      previousMedianLines: 150,
      trendPercent: 33.3,
      trend: '↑',
      largestPrTitle: 'Big refactor',
      largestPrRepo: 'org/repo',
      largestPrUrl: 'https://github.com/org/repo/pull/1',
      largestPrLines: 800,
    }

    const prSize: PrSize = {
      metric,
      exceptions: [exception],
      weeklyTrend: [
        { weekStart: '2026-04-07', medianLines: 250, measuredPrCount: 3, isPartialWeek: false },
      ],
      teamBreakdown: [teamRow],
    }

    expectTypeOf<PrSize>().toEqualTypeOf<{
      metric: PrSizeMetric
      exceptions: PrSizeException[]
      weeklyTrend: PrSizeWeeklyTrendPoint[]
      teamBreakdown: PrSizeTeamRow[]
    }>()

    expect(prSize.metric.qualifyingPrCount).toBe(12)
    expect(prSize.exceptions[0]?.type).toBe('oversized_pr_pattern')
    expect(prSize.teamBreakdown[0]?.trend).toBe('↑')
  })

  it('pr_size_weekly_trend_type_includes_count_and_partial_flag', () => {
    const point: PrSizeWeeklyTrendPoint = {
      weekStart: '2026-04-07',
      medianLines: 250,
      measuredPrCount: 4,
      isPartialWeek: false,
    }

    expectTypeOf(point).toMatchTypeOf<PrSizeWeeklyTrendPoint>()
    expectTypeOf(point.measuredPrCount).toBeNumber()
    expectTypeOf(point.isPartialWeek).toBeBoolean()
    expect(point.measuredPrCount).toBe(4)
    expect(point.isPartialWeek).toBe(false)
  })
})
