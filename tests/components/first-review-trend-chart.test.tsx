import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { FirstReviewMetric } from '~/metrics/pr-cycle-time-dashboard'
import type { FirstReviewComparisonPoint } from '~/metrics/first-review-time'
import { FirstReviewTrendChart } from '~/components/dashboard/FirstReviewTrendChart'
import { WeeklyTrendChart } from '~/components/dashboard/weekly-trend-chart'

vi.mock('~/components/dashboard/weekly-trend-chart', () => ({
  WeeklyTrendChart: vi.fn(() => null),
}))

const MockedWeeklyTrendChart = vi.mocked(WeeklyTrendChart)

const metric: FirstReviewMetric = {
  medianHours: 5,
  previousMedianHours: 4,
  qualifyingPrCount: 3,
  mergedPrCountInSyncedRepos: 5,
  trendPercent: 25,
  baselineStatus: 'available',
  botShare: null,
}

function comparison(weeks = 8): FirstReviewComparisonPoint[] {
  return Array.from({ length: weeks * 2 }, (_, i) => ({
    period: i < weeks ? ('previous' as const) : ('current' as const),
    bucketIndex: (i % weeks) + 1,
    bucketStart: `2026-04-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
    bucketEnd: `2026-04-${String(i + 2).padStart(2, '0')}T00:00:00.000Z`,
    bucketLabel: `2026-04-${String(i + 1).padStart(2, '0')}`,
    medianHours: i === 1 ? null : i,
  }))
}

function currentHalf(points: FirstReviewComparisonPoint[]) {
  return points.slice(points.length / 2).map((point) => ({
    weekStart: point.bucketLabel,
    medianHours: point.medianHours,
  }))
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('FirstReviewTrendChart', () => {
  it('first_review_chart_renders_default_16_week_comparison_title_and_aria', () => {
    const points = comparison()
    render(
      <FirstReviewTrendChart
        weeklyTrend={currentHalf(points)}
        comparisonWeeklyTrend={points}
        metric={metric}
      />,
    )

    const title = '16-week First Review comparison trend'
    expect(screen.getByRole('heading', { level: 3, name: title })).toBeTruthy()
    expect(screen.getByTestId('first-review-trend')).toHaveAttribute('aria-label', title)
    expect(MockedWeeklyTrendChart).toHaveBeenCalledWith(
      expect.objectContaining({ ariaLabel: title }),
      undefined,
    )
  })

  it('first_review_chart_renders_dynamic_8_week_copy_for_four_week_range', () => {
    const points = comparison(4)
    render(
      <FirstReviewTrendChart
        weeklyTrend={currentHalf(points)}
        comparisonWeeklyTrend={points}
        metric={metric}
      />,
    )

    expect(screen.getByText('8-week First Review comparison trend')).toBeTruthy()
    expect(screen.getByText(/previous 4-week segment followed by the current 4-week segment/i)).toBeTruthy()
  })

  it('first_review_chart_passes_comparison_trend_opt_in', () => {
    const points = comparison()
    const weeklyTrend = currentHalf(points)
    render(
      <FirstReviewTrendChart
        weeklyTrend={weeklyTrend}
        comparisonWeeklyTrend={points}
        metric={metric}
      />,
    )

    expect(MockedWeeklyTrendChart).toHaveBeenCalledWith(
      expect.objectContaining({
        valueMode: 'duration',
        weeklyTrend,
        comparisonTrend: points,
      }),
      undefined,
    )
  })

  it('first_review_chart_accessible_list_contains_previous_then_current_points', () => {
    const points = comparison(4)
    render(
      <FirstReviewTrendChart
        weeklyTrend={currentHalf(points)}
        comparisonWeeklyTrend={points}
        metric={metric}
      />,
    )

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(8)
    expect(items[0]).toHaveTextContent('previous')
    expect(items[4]).toHaveTextContent('current')
  })

  it('first_review_chart_accessible_list_preserves_null_vs_zero', () => {
    const points = comparison(2)
    points[0]!.medianHours = null
    points[1]!.medianHours = 0
    render(
      <FirstReviewTrendChart
        weeklyTrend={currentHalf(points)}
        comparisonWeeklyTrend={points}
        metric={metric}
      />,
    )

    const list = screen.getByTestId('first-review-weekly-trend-list')
    expect(list).toHaveTextContent('—')
    expect(list).toHaveTextContent('0h')
  })
})
