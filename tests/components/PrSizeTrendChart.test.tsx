import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'

import { PrSizeTrendChart } from '~/components/dashboard/PrSizeTrendChart'
import { WeeklyTrendChart } from '~/components/dashboard/weekly-trend-chart'

vi.mock('~/components/dashboard/weekly-trend-chart', () => ({
  WeeklyTrendChart: vi.fn(() => null),
}))

const MockedWeeklyTrendChart = vi.mocked(WeeklyTrendChart)

function completed(
  weekStart: string,
  medianLines: number | null,
  measuredPrCount: number,
): {
  weekStart: string
  medianLines: number | null
  measuredPrCount: number
  isPartialWeek: boolean
} {
  return { weekStart, medianLines, measuredPrCount, isPartialWeek: false }
}

function partial(
  weekStart: string,
  medianLines: number | null,
  measuredPrCount: number,
): {
  weekStart: string
  medianLines: number | null
  measuredPrCount: number
  isPartialWeek: boolean
} {
  return { weekStart, medianLines, measuredPrCount, isPartialWeek: true }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('PrSizeTrendChart', () => {
  it('pr_size_trend_accessible_list_contains_16_or_17_items', () => {
    const completedWeeks = Array.from({ length: 16 }, (_, i) =>
      completed(`2026-01-${String(5 + i).padStart(2, '0')}`, 10 + i, 3),
    )
    const { rerender } = render(<PrSizeTrendChart weeklyTrend={completedWeeks} />)

    expect(screen.getByTestId('pr-size-weekly-trend-list').querySelectorAll('li')).toHaveLength(16)

    rerender(<PrSizeTrendChart weeklyTrend={[...completedWeeks, partial('2026-01-21', 30, 3)]} />)
    expect(screen.getByTestId('pr-size-weekly-trend-list').querySelectorAll('li')).toHaveLength(17)
  })

  it('pr_size_trend_detached_accessible_item_says_current_week_so_far', () => {
    render(
      <PrSizeTrendChart
        weeklyTrend={[completed('2026-04-06', 20, 5), partial('2026-04-13', 30, 3)]}
      />,
    )

    expect(screen.getByTestId('pr-size-weekly-trend-list').querySelector('[data-partial-week]')?.textContent).toContain(
      'current week so far',
    )
  })

  it('pr_size_trend_detached_overflow_preserves_actual_numeric_value', () => {
    render(
      <PrSizeTrendChart
        weeklyTrend={[completed('2026-04-06', 20, 5), partial('2026-04-13', 500, 3)]}
      />,
    )

    expect(MockedWeeklyTrendChart).toHaveBeenCalledWith(
      expect.objectContaining({
        detachedPoint: expect.objectContaining({ medianLines: 500 }),
      }),
      undefined,
    )
    expect(screen.getByTestId('pr-size-weekly-trend-list').querySelector('[data-partial-week]')?.textContent).toContain(
      '500 lines',
    )
  })

  it('renders_chart_with_data_points', () => {
    const data = [
      completed('2026-01-06', 100, 3),
      completed('2026-01-13', 200, 4),
      completed('2026-01-20', 150, 5),
      completed('2026-01-27', 300, 6),
    ]
    render(<PrSizeTrendChart weeklyTrend={data} />)
    expect(screen.getByTestId('pr-size-trend')).toBeTruthy()
    expect(MockedWeeklyTrendChart).toHaveBeenCalled()
  })

  it('null_weeks_not_mapped_to_zero', () => {
    const data = [
      completed('2026-01-06', 100, 3),
      completed('2026-01-13', null, 0),
      completed('2026-01-20', null, 0),
      completed('2026-01-27', 300, 6),
    ]
    render(<PrSizeTrendChart weeklyTrend={data} />)
    const passedTrend = MockedWeeklyTrendChart.mock.calls[0]?.[0]?.weeklyTrend
    expect(passedTrend?.[1]).toEqual({ weekStart: '2026-01-13', medianLines: null })
  })

  it('pr_size_trend_still_passes_lines_axis_label', () => {
    const data = [completed('2026-01-06', 100, 3), completed('2026-01-13', 200, 4)]
    render(<PrSizeTrendChart weeklyTrend={data} />)

    expect(MockedWeeklyTrendChart).toHaveBeenCalledWith(
      expect.objectContaining({
        valueMode: 'lines',
        yAxisLabel: 'Lines',
      }),
      undefined,
    )
  })

  it('pr_size_trend_passes_completed_points_and_detached_current_point', () => {
    const data = [
      completed('2026-04-06', 20, 5),
      completed('2026-04-13', 40, 4),
      partial('2026-04-20', 55, 2),
    ]
    render(<PrSizeTrendChart weeklyTrend={data} />)

    expect(MockedWeeklyTrendChart).toHaveBeenCalledWith(
      expect.objectContaining({
        weeklyTrend: [
          { weekStart: '2026-04-06', medianLines: 20 },
          { weekStart: '2026-04-13', medianLines: 40 },
        ],
        detachedPoint: expect.objectContaining({
          weekStart: '2026-04-20',
          medianLines: 55,
          label: 'Apr 20 so far',
        }),
      }),
      undefined,
    )
  })

  it('pr_size_trend_remains_line_mode_with_detached_current_partial', () => {
    const data = [
      completed('2026-04-06', 20, 5),
      completed('2026-04-13', 40, 4),
      partial('2026-04-20', 55, 2),
    ]
    render(<PrSizeTrendChart weeklyTrend={data} />)

    const props = MockedWeeklyTrendChart.mock.calls[0]?.[0]
    expect(props).toEqual(
      expect.objectContaining({
        valueMode: 'lines',
        detachedPoint: expect.objectContaining({
          weekStart: '2026-04-20',
          medianLines: 55,
        }),
      }),
    )
    expect(props).not.toHaveProperty('comparisonTrend')
  })

  it('pr_size_trend_no_detached_title_and_aria_use_completed_point_count', () => {
    const data = [
      completed('2026-01-06', 100, 3),
      completed('2026-01-13', 200, 4),
      completed('2026-01-20', 150, 5),
      completed('2026-01-27', 300, 6),
    ]
    render(<PrSizeTrendChart weeklyTrend={data} />)

    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('4 completed-week PR Size trend')
    expect(screen.getByTestId('pr-size-trend').getAttribute('aria-label')).toBe(
      '4 completed-week PR Size trend',
    )
    expect(MockedWeeklyTrendChart).toHaveBeenCalledWith(
      expect.objectContaining({
        ariaLabel: '4 completed-week PR size trend',
      }),
      undefined,
    )
    expect(screen.queryByText(/8-week/i)).toBeNull()
  })

  it('pr_size_trend_detached_title_and_aria_include_current_week_so_far', () => {
    const eightCompleted = Array.from({ length: 8 }, (_, i) =>
      completed(`2026-03-${String(10 + i).padStart(2, '0')}`, 10 + i, 5),
    )
    render(<PrSizeTrendChart weeklyTrend={[...eightCompleted, partial('2026-04-27', 80, 3)]} />)

    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe(
      '8 completed weeks + current week so far',
    )
    expect(screen.getByTestId('pr-size-trend').getAttribute('aria-label')).toBe(
      '8 completed weeks + current week so far',
    )
    expect(MockedWeeklyTrendChart).toHaveBeenCalledWith(
      expect.objectContaining({
        ariaLabel: '8 completed weeks plus current week so far PR size trend',
      }),
      undefined,
    )
  })

  it('pr_size_trend_omits_detached_point_when_partial_median_is_null', () => {
    const data = [completed('2026-04-06', 20, 5), partial('2026-04-20', null, 0)]
    render(<PrSizeTrendChart weeklyTrend={data} />)

    expect(MockedWeeklyTrendChart).toHaveBeenCalledWith(
      expect.objectContaining({
        detachedPoint: undefined,
      }),
      undefined,
    )
  })

  it('pr_size_trend_current_partial_low_count_copy_includes_week_start_measured_count_and_may_change', () => {
    const data = [completed('2026-04-06', 20, 5), partial('2026-04-20', 55, 2)]
    render(<PrSizeTrendChart weeklyTrend={data} />)

    const note = screen.getByTestId('pr-size-trend-confidence')
    expect(note.textContent).toContain('Week of 2026-04-20 so far')
    expect(note.textContent).toContain('2 measured PRs')
    expect(note.textContent).toContain('Low sample')
    expect(note.textContent).toContain('This value may change')
  })

  it('pr_size_trend_current_partial_three_plus_copy_omits_low_sample_wording_but_says_may_change', () => {
    const data = [completed('2026-04-06', 20, 5), partial('2026-04-20', 55, 4)]
    render(<PrSizeTrendChart weeklyTrend={data} />)

    const note = screen.getByTestId('pr-size-trend-confidence')
    expect(note.textContent).toContain('Week of 2026-04-20 so far')
    expect(note.textContent).toContain('4 measured PRs')
    expect(note.textContent).toContain('This value may change')
    expect(note.textContent).not.toContain('Low sample')
  })

  it('pr_size_trend_latest_completed_low_sample_copy_includes_week_start', () => {
    const data = [
      completed('2026-04-06', 20, 5),
      completed('2026-04-13', 30, 5),
      completed('2026-04-20', 40, 2),
    ]
    render(<PrSizeTrendChart weeklyTrend={data} />)

    const note = screen.getByTestId('pr-size-trend-confidence')
    expect(note.textContent).toBe('Week of 2026-04-20: 2 measured PRs. Low sample.')
  })

  it('pr_size_trend_low_sample_uses_latest_measured_completed_week_not_trailing_empty_week', () => {
    const data = [
      completed('2026-04-06', 20, 2),
      completed('2026-04-13', null, 0),
      completed('2026-04-20', null, 0),
    ]
    render(<PrSizeTrendChart weeklyTrend={data} />)

    const note = screen.getByTestId('pr-size-trend-confidence')
    expect(note.textContent).toBe('Week of 2026-04-06: 2 measured PRs. Low sample.')
  })

  it('pr_size_trend_completed_zero_count_week_has_no_low_sample_note', () => {
    const data = [
      completed('2026-04-06', null, 0),
      completed('2026-04-13', null, 0),
      completed('2026-04-20', 40, 5),
    ]
    render(<PrSizeTrendChart weeklyTrend={data} />)

    expect(screen.queryByTestId('pr-size-trend-confidence')).toBeNull()
  })

  it('pr_size_trend_sr_list_matches_visible_confidence_semantics', () => {
    const data = [completed('2026-04-06', 20, 5), partial('2026-04-20', 55, 2)]
    render(<PrSizeTrendChart weeklyTrend={data} />)

    const list = screen.getByTestId('pr-size-weekly-trend-list')
    const partialItem = list.querySelector('[data-partial-week]')
    expect(partialItem?.textContent).toContain('2 measured PRs')
    expect(partialItem?.textContent).toContain('current week so far')
    expect(partialItem?.textContent).toContain('This value may change')
    expect(partialItem?.textContent).toContain('Low sample')

    const visibleNote = screen.getByTestId('pr-size-trend-confidence').textContent
    expect(partialItem?.textContent).toContain(visibleNote ?? '')
  })

  it('pr_size_trend_zero_line_measured_point_is_not_treated_as_empty', () => {
    const data = [completed('2026-04-06', 0, 1)]
    render(<PrSizeTrendChart weeklyTrend={data} />)

    const list = screen.getByTestId('pr-size-weekly-trend-list')
    expect(within(list).getByText('0 lines')).toBeTruthy()
    expect(MockedWeeklyTrendChart).toHaveBeenCalledWith(
      expect.objectContaining({
        weeklyTrend: [{ weekStart: '2026-04-06', medianLines: 0 }],
      }),
      undefined,
    )
  })

  it('pr_size_trend_fractional_median_sr_text_is_not_rounded', () => {
    const data = [completed('2026-04-06', 1.5, 3)]
    render(<PrSizeTrendChart weeklyTrend={data} />)

    const list = screen.getByTestId('pr-size-weekly-trend-list')
    expect(list.textContent).toContain('1.5 lines')
    expect(list.textContent).not.toContain('2 lines')
  })

  it('pr_size_confidence_copy_uses_dashboard_confidence_class', () => {
    const lowSample = [completed('2026-04-06', 20, 5), partial('2026-04-20', 55, 2)]
    const { unmount: unmountLow } = render(<PrSizeTrendChart weeklyTrend={lowSample} />)
    const lowNote = screen.getByTestId('pr-size-trend-confidence')
    expect(lowNote).toHaveClass('pr-dashboard__chart-confidence')
    expect(lowNote).toHaveClass('pr-dashboard__chart-confidence--low-sample')
    unmountLow()

    const steady = [completed('2026-04-06', 20, 5), partial('2026-04-20', 55, 4)]
    render(<PrSizeTrendChart weeklyTrend={steady} />)
    const steadyNote = screen.getByTestId('pr-size-trend-confidence')
    expect(steadyNote).toHaveClass('pr-dashboard__chart-confidence')
    expect(steadyNote).not.toHaveClass('pr-dashboard__chart-confidence--low-sample')
  })
})
