import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import type { FirstReview } from '~/metrics/pr-cycle-time-dashboard'
import { FirstReviewSection } from '~/components/dashboard/FirstReviewSection'
import { FirstReviewTrendChart } from '~/components/dashboard/FirstReviewTrendChart'

vi.mock('~/components/dashboard/FirstReviewTrendChart', () => ({
  FirstReviewTrendChart: vi.fn(() => null),
}))

const MockedFirstReviewTrendChart = vi.mocked(FirstReviewTrendChart)

afterEach(cleanup)

function fr(overrides: Partial<FirstReview> = {}): FirstReview {
  return {
    metric: {
      medianHours: 5,
      previousMedianHours: 4,
      qualifyingPrCount: 3,
      mergedPrCountInSyncedRepos: 5,
      trendPercent: 25,
      baselineStatus: 'available',
      botShare: null,
    },
    exceptions: [],
    weeklyTrend: Array.from({ length: 8 }, (_, i) => ({
      weekStart: `2026-0${1 + i}-01`,
      medianHours: null,
    })),
    comparisonWeeklyTrend: [],
    teamBreakdown: [],
    ...overrides,
  }
}

describe('FirstReviewSection', () => {
  it('first_review_section_hidden_when_payload_lacks_firstReview', () => {
    const { container } = render(<FirstReviewSection firstReview={undefined} />)
    expect(container.firstChild).toBeNull()
  })

  it('first_review_section_visible_when_payload_has_firstReview', () => {
    render(<FirstReviewSection firstReview={fr()} />)
    expect(screen.getByTestId('phase02-section')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'First Review Time' })).toBeTruthy()
  })

  it('within_section_layout_card_and_exceptions_side_by_side', () => {
    render(<FirstReviewSection firstReview={fr()} />)
    const row1 = screen.getByTestId('phase02-row-1')
    expect(row1.querySelector('[data-testid="first-review-card"]')).toBeTruthy()
  })

  it('within_section_layout_trend_and_team_table_stacked_below_first_row', () => {
    render(<FirstReviewSection firstReview={fr()} />)
    const row2 = screen.getByTestId('phase02-row-2')
    const table = row2.querySelector('[data-testid="first-review-team-table"]')
    expect(table).toBeTruthy()
  })

  it('first_review_section_passes_comparison_payload_and_metric', () => {
    const comparisonWeeklyTrend = Array.from({ length: 16 }, (_, i) => ({
      period: i < 8 ? ('previous' as const) : ('current' as const),
      bucketIndex: (i % 8) + 1,
      bucketStart: `2026-04-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
      bucketEnd: `2026-04-${String(i + 2).padStart(2, '0')}T00:00:00.000Z`,
      bucketLabel: `2026-04-${String(i + 1).padStart(2, '0')}`,
      medianHours: null,
    }))
    const firstReview = fr({ comparisonWeeklyTrend })
    render(<FirstReviewSection firstReview={firstReview} />)

    expect(screen.getByTestId('phase02-section')).toHaveAttribute(
      'aria-label',
      'First Review Time with 16-week comparison trend',
    )
    expect(MockedFirstReviewTrendChart).toHaveBeenCalledWith(
      {
        weeklyTrend: firstReview.weeklyTrend,
        comparisonWeeklyTrend,
        metric: firstReview.metric,
      },
      undefined,
    )
  })
})
