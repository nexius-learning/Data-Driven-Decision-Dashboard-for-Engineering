import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import type { PrCycleTimeDashboard as DashboardModel } from '~/metrics/pr-cycle-time-dashboard'
import { PrCycleTimeDashboard } from '~/components/dashboard/PrCycleTimeDashboard'

afterEach(cleanup)

function base(overrides: Partial<DashboardModel> = {}): DashboardModel {
  return {
    range: { from: '2026-01-01T00:00:00Z', to: '2026-04-30T23:59:59Z', weeks: 8 },
    metric: {
      medianHours: 24,
      previousMedianHours: 20,
      mergedPrCount: 5,
      trendPercent: 20,
      baselineStatus: 'available',
    },
    exceptions: [],
    weeklyTrend: Array.from({ length: 8 }, (_, i) => ({
      weekStart: `2026-0${1 + i}-01`,
      medianHours: null,
    })),
    comparisonWeeklyTrend: [],
    allTeams: [],
    teamBreakdown: [],
    freshness: {
      reposScanned: 1,
      prMetadataSyncedAt: new Date(Date.now() - 60_000).toISOString(),
      prsMissingJiraKey: 0,
      syncErrors: 0,
      latestSyncStatus: 'success',
    },
    ...overrides,
  }
}

describe('FreshnessStrip phase 02 extension', () => {
  it('freshness_shows_oldest_review_sync_across_synced_repos', () => {
    const data = base({
      reviewFreshness: {
        oldestReviewSyncAt: new Date(Date.now() - 60_000).toISOString(),
        reviewSyncErrors: [],
      },
    })
    render(<PrCycleTimeDashboard data={data} />)
    expect(screen.getByTestId('phase02-review-freshness')).toBeTruthy()
  })

  it('freshness_pending_hint_visible_in_phase01_strip_when_hidden', () => {
    const data = base({
      reviewMetricsPending: { hint: 'Review metrics will appear after the next refresh' },
    })
    render(<PrCycleTimeDashboard data={data} />)
    expect(screen.getByTestId('phase02-review-pending')).toBeTruthy()
  })

  it('freshness_pending_hint_absent_when_visible', () => {
    const data = base({
      reviewFreshness: {
        oldestReviewSyncAt: new Date().toISOString(),
        reviewSyncErrors: [],
      },
    })
    render(<PrCycleTimeDashboard data={data} />)
    expect(screen.queryByTestId('phase02-review-pending')).toBeNull()
  })
})
