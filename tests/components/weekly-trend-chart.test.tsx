import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import {
  buildDurationAxis,
  formatDurationHoursForChart,
} from '~/components/dashboard/duration-trend-scale'
import { FirstReviewTrendChart } from '~/components/dashboard/FirstReviewTrendChart'
import {
  layoutDetachedMarker,
  WEEKLY_TREND_CHART_VIEWBOX_HEIGHT,
  WEEKLY_TREND_CHART_VIEWBOX_WIDTH,
} from '~/components/dashboard/weekly-trend-chart-layout'
import {
  visiblePlainLineAxisLabelIndexes,
  WeeklyTrendChart,
} from '~/components/dashboard/weekly-trend-chart'

const comparisonTrend = Array.from({ length: 16 }, (_, i) => ({
  period: i < 8 ? ('previous' as const) : ('current' as const),
  bucketIndex: (i % 8) + 1,
  bucketStart: `2026-0${i < 8 ? 2 : 4}-${String((i % 8) + 1).padStart(2, '0')}T00:00:00.000Z`,
  bucketEnd: `2026-0${i < 8 ? 2 : 4}-${String((i % 8) + 2).padStart(2, '0')}T00:00:00.000Z`,
  bucketLabel: `2026-0${i < 8 ? 2 : 4}-${String((i % 8) + 1).padStart(2, '0')}`,
  medianHours: i === 2 || i === 10 ? null : i + 1,
}))

const fourWeekComparisonTrend = Array.from({ length: 8 }, (_, i) => ({
  period: i < 4 ? ('previous' as const) : ('current' as const),
  bucketIndex: (i % 4) + 1,
  bucketStart: `2026-0${i < 4 ? 3 : 4}-${String((i % 4) + 1).padStart(2, '0')}T00:00:00.000Z`,
  bucketEnd: `2026-0${i < 4 ? 3 : 4}-${String((i % 4) + 2).padStart(2, '0')}T00:00:00.000Z`,
  bucketLabel: `2026-0${i < 4 ? 3 : 4}-${String((i % 4) + 1).padStart(2, '0')}`,
  medianHours: i + 1,
}))

function parseBoundsAttr(value: string | null): { x: number; y: number; width: number; height: number } {
  const [x, y, width, height] = (value ?? '0,0,0,0').split(',').map(Number)
  return { x, y, width, height }
}

function rectInsideViewBox(
  rect: { x: number; y: number; width: number; height: number },
  viewW: number,
  viewH: number,
): boolean {
  return rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= viewW && rect.y + rect.height <= viewH
}

function shortRenderedDate(dateLabel: string): string {
  const d = new Date(`${dateLabel}T12:00:00.000Z`)
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(d)
}

afterEach(cleanup)

describe('WeeklyTrendChart', () => {
  it('weekly_chart_plain_line_axis_labels_are_sparse_over_eight_points', () => {
    const weeklyTrend = Array.from({ length: 16 }, (_, i) => ({
      weekStart: `2026-01-${String(5 + i).padStart(2, '0')}`,
      medianLines: 10 + i,
    }))

    render(<WeeklyTrendChart valueMode="lines" weeklyTrend={weeklyTrend} yAxisLabel="Lines" />)

    expect(visiblePlainLineAxisLabelIndexes(16)).toEqual([0, 7, 15])
    expect(screen.getByText('Jan 5')).toBeTruthy()
    expect(screen.getByText('Jan 12')).toBeTruthy()
    expect(screen.getByText('Jan 20')).toBeTruthy()
    expect(screen.queryByText('Jan 6')).toBeNull()
  })

  it('weekly_chart_plain_line_axis_labels_use_floor_midpoint', () => {
    expect(visiblePlainLineAxisLabelIndexes(9)).toEqual([0, 4, 8])
    expect(visiblePlainLineAxisLabelIndexes(10)).toEqual([0, 4, 9])
  })

  it('weekly_chart_plain_line_axis_labels_preserve_eight_or_fewer_points', () => {
    expect(visiblePlainLineAxisLabelIndexes(0)).toEqual([])
    expect(visiblePlainLineAxisLabelIndexes(1)).toEqual([0])
    expect(visiblePlainLineAxisLabelIndexes(8)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })

  it('weekly_chart_plain_line_axis_labels_always_include_detached_label', () => {
    const weeklyTrend = Array.from({ length: 16 }, (_, i) => ({
      weekStart: `2026-01-${String(5 + i).padStart(2, '0')}`,
      medianLines: 10 + i,
    }))

    render(
      <WeeklyTrendChart
        valueMode="lines"
        weeklyTrend={weeklyTrend}
        yAxisLabel="Lines"
        detachedPoint={{
          weekStart: '2026-01-21',
          medianLines: 30,
          label: 'Jan 21 so far',
          ariaLabel: 'Current week so far: 30 median lines',
        }}
      />,
    )

    expect(screen.getByText('Jan 21 so far')).toBeTruthy()
    expect(screen.queryByText('Jan 6')).toBeNull()
  })

  it('weekly_chart_detached_axis_label_is_right_anchored_on_its_own_row', () => {
    render(
      <WeeklyTrendChart
        valueMode="lines"
        weeklyTrend={Array.from({ length: 16 }, (_, i) => ({
          weekStart: `2026-01-${String(5 + i).padStart(2, '0')}`,
          medianLines: 10 + i,
        }))}
        yAxisLabel="Lines"
        detachedPoint={{
          weekStart: '2026-01-21',
          medianLines: 30,
          label: 'Jan 21 so far',
          ariaLabel: 'Current week so far: 30 median lines',
        }}
      />,
    )

    const label = screen.getByText('Jan 21 so far')
    expect(label).toHaveAttribute('text-anchor', 'end')
    expect(label).toHaveAttribute('y', '194')
  })

  it('weekly_chart_duration_comparison_axis_labels_remain_unchanged', () => {
    render(<WeeklyTrendChart valueMode="duration" weeklyTrend={[]} comparisonTrend={comparisonTrend} />)

    expect(screen.getByText(shortRenderedDate(comparisonTrend[0]!.bucketLabel))).toBeTruthy()
    expect(screen.getByText(shortRenderedDate(comparisonTrend[8]!.bucketLabel))).toBeTruthy()
    expect(screen.getByText(shortRenderedDate(comparisonTrend[15]!.bucketLabel))).toBeTruthy()
    expect(screen.queryByText(shortRenderedDate(comparisonTrend[1]!.bucketLabel))).toBeNull()
  })

  it('duration_chart_uses_minutes_under_one_hour', () => {
    render(
      <WeeklyTrendChart
        valueMode="duration"
        weeklyTrend={[
          { weekStart: '2026-04-06', medianHours: 0.25 },
          { weekStart: '2026-04-13', medianHours: 0.5 },
        ]}
      />,
    )

    expect(screen.getByText('Minutes')).toBeTruthy()
    expect(screen.getByText('30m')).toBeTruthy()
  })

  it('duration_chart_uses_hours_from_one_to_under_forty_eight_hours', () => {
    render(
      <WeeklyTrendChart
        valueMode="duration"
        weeklyTrend={[
          { weekStart: '2026-04-06', medianHours: 1 },
          { weekStart: '2026-04-13', medianHours: 47.9 },
        ]}
      />,
    )

    expect(screen.getByText('Hours')).toBeTruthy()
    expect(screen.getByText('47.9h')).toBeTruthy()
  })

  it('duration_chart_uses_days_at_forty_eight_hours_or_more', () => {
    render(
      <WeeklyTrendChart
        valueMode="duration"
        weeklyTrend={[
          { weekStart: '2026-04-06', medianHours: 24 },
          { weekStart: '2026-04-13', medianHours: 48 },
        ]}
      />,
    )

    expect(screen.getByText('Days')).toBeTruthy()
    expect(screen.getByText('2d')).toBeTruthy()
  })

  it('duration_chart_defaults_to_hours_for_all_null_weeks', () => {
    render(
      <WeeklyTrendChart
        valueMode="duration"
        weeklyTrend={[
          { weekStart: '2026-04-06', medianHours: null },
          { weekStart: '2026-04-13', medianHours: null },
        ]}
      />,
    )

    expect(screen.getByText('Hours')).toBeTruthy()
    expect(document.querySelectorAll('circle')).toHaveLength(0)
  })

  it('duration_chart_defaults_to_hours_for_empty_duration_trend', () => {
    render(<WeeklyTrendChart valueMode="duration" weeklyTrend={[]} />)

    expect(screen.getByText('Hours')).toBeTruthy()
    expect(document.querySelectorAll('circle')).toHaveLength(0)
  })

  it('duration_chart_keeps_tiny_non_zero_values_visible_on_day_axis', () => {
    render(
      <WeeklyTrendChart
        valueMode="duration"
        weeklyTrend={[
          { weekStart: '2026-04-06', medianHours: 0.5 },
          { weekStart: '2026-04-13', medianHours: 48 },
        ]}
      />,
    )

    expect(screen.getByText('0.02d')).toBeTruthy()
    expect(screen.queryByText('0.0')).toBeNull()
    expect(screen.queryByText('0.0d')).toBeNull()
  })

  it('duration_formatter_contract_is_raw_hours_for_wrapper_text', () => {
    expect(formatDurationHoursForChart(0.5, 'minutes')).toBe('30m')
    expect(formatDurationHoursForChart(1.5, 'hours')).toBe('1.5h')
    expect(formatDurationHoursForChart(0.5, 'days')).toBe('0.02d')
  })

  it('duration_formatter_keeps_tiny_positive_values_non_zero_in_each_unit', () => {
    const labels = [
      formatDurationHoursForChart(0.000001, 'minutes'),
      formatDurationHoursForChart(0.004, 'hours'),
      formatDurationHoursForChart(0.004, 'days'),
    ]

    expect(labels).toEqual(['0.0001m', '0.004h', '0.0002d'])
    for (const label of labels) {
      expect(label).not.toMatch(/^0(?:\.0+)?[mhd]?$/)
    }
  })

  it('duration_axis_adds_readable_headroom_above_maximum_point', () => {
    const axis = buildDurationAxis(45)
    expect(axis.paddedMax).toBeGreaterThanOrEqual(45 * 1.1)
    expect(axis.paddedMax).toBeLessThanOrEqual(45 * 1.2)
    expect(axis.maxValue).toBeGreaterThanOrEqual(axis.paddedMax)

    render(
      <WeeklyTrendChart
        valueMode="duration"
        weeklyTrend={[
          { weekStart: '2026-04-06', medianHours: 24 },
          { weekStart: '2026-04-13', medianHours: 45 },
        ]}
      />,
    )

    const pointYValues = Array.from(document.querySelectorAll('circle')).map((node) => Number(node.getAttribute('cy')))
    expect(pointYValues.every((y) => y > 32)).toBe(true)
  })

  it('duration_axis_handles_zero_only_values_without_divide_by_zero', () => {
    render(
      <WeeklyTrendChart
        valueMode="duration"
        weeklyTrend={[
          { weekStart: '2026-04-06', medianHours: 0 },
          { weekStart: '2026-04-13', medianHours: 0 },
          { weekStart: '2026-04-20', medianHours: null },
        ]}
      />,
    )

    expect(screen.getByText('Minutes')).toBeTruthy()
    expect(screen.getAllByText('0m')).toHaveLength(2)
    expect(screen.getByText('1')).toBeTruthy()
    const pointYValues = Array.from(document.querySelectorAll('circle')).map((node) => Number(node.getAttribute('cy')))
    expect(pointYValues).toEqual([172, 172])
  })

  it('duration_chart_preserves_null_weeks_as_gaps', () => {
    render(
      <WeeklyTrendChart
        valueMode="duration"
        weeklyTrend={[
          { weekStart: '2026-04-06', medianHours: 1 },
          { weekStart: '2026-04-13', medianHours: null },
          { weekStart: '2026-04-20', medianHours: 2 },
        ]}
      />,
    )

    const pathData = Array.from(document.querySelectorAll('path')).map((node) => node.getAttribute('d') ?? '')
    expect(pathData.some((d) => d.startsWith('M 48 ') && d.includes(' L 540 '))).toBe(false)
  })

  it('pr_size_sparse_line_ticks_remain_unchanged', () => {
    const weeklyTrend = [
      { weekStart: '2026-03-30', medianLines: null },
      { weekStart: '2026-04-06', medianLines: 108 },
      { weekStart: '2026-04-13', medianLines: 75 },
      { weekStart: '2026-04-20', medianLines: null },
      { weekStart: '2026-04-27', medianLines: null },
      { weekStart: '2026-05-04', medianLines: null },
      { weekStart: '2026-05-11', medianLines: 54 },
      { weekStart: '2026-05-18', medianLines: 69 },
    ]

    render(<WeeklyTrendChart valueMode="lines" weeklyTrend={weeklyTrend} ariaLabel="8-week PR size trend" yAxisLabel="Lines" />)

    const chart = screen.getByRole('img', { name: '8-week PR size trend' })
    const yTickLabels = Array.from(chart.querySelectorAll('text[fill="#9ca3af"]')).map(
      (node) => node.textContent,
    )
    const pointYValues = Array.from(chart.querySelectorAll('circle')).map((node) => Number(node.getAttribute('cy')))

    expect(yTickLabels).toEqual(['0', '30', '60', '90', '120'])
    expect(pointYValues.every((y) => y >= 32)).toBe(true)
    expect(screen.getByText('108')).toBeTruthy()
  })

  it('pr_size_chart_preserves_null_weeks_as_gaps', () => {
    render(
      <WeeklyTrendChart
        valueMode="lines"
        yAxisLabel="Lines"
        weeklyTrend={[
          { weekStart: '2026-04-06', medianLines: 20 },
          { weekStart: '2026-04-13', medianLines: null },
          { weekStart: '2026-04-20', medianLines: 40 },
        ]}
      />,
    )

    const pathData = Array.from(document.querySelectorAll('path')).map((node) => node.getAttribute('d') ?? '')
    expect(pathData.some((d) => d.startsWith('M 48 ') && d.includes(' L 540 '))).toBe(false)
  })

  it('line_chart_accepts_explicit_detached_point', () => {
    render(
      <WeeklyTrendChart
        valueMode="lines"
        yAxisLabel="Lines"
        weeklyTrend={[
          { weekStart: '2026-04-06', medianLines: 20 },
          { weekStart: '2026-04-13', medianLines: 40 },
        ]}
        detachedPoint={{
          weekStart: '2026-04-20',
          medianLines: 55,
          label: 'Apr 20 so far',
          ariaLabel: 'Current week so far: 55 median lines',
        }}
      />,
    )

    const chart = screen.getByRole('img', { name: '8-week PR size trend' })
    const pointLabels = Array.from(chart.querySelectorAll('text[font-weight="600"]')).map(
      (node) => node.textContent,
    )
    expect(pointLabels).toEqual(['20', '40', '55'])
    expect(screen.getByText('Apr 20 so far')).toBeTruthy()
    expect(chart.querySelectorAll('circle')).toHaveLength(2)
    expect(chart.querySelector('.pr-dashboard__chart-point--detached polygon')).toBeTruthy()
  })

  it('line_chart_detached_point_has_own_x_axis_slot_and_label', () => {
    render(
      <WeeklyTrendChart
        valueMode="lines"
        yAxisLabel="Lines"
        weeklyTrend={[
          { weekStart: '2026-04-06', medianLines: 20 },
          { weekStart: '2026-04-13', medianLines: 40 },
        ]}
        detachedPoint={{
          weekStart: '2026-04-20',
          medianLines: 55,
          label: 'Apr 20 so far',
          ariaLabel: 'Current week so far: 55 median lines',
        }}
      />,
    )

    const completedCx = Array.from(document.querySelectorAll('circle')).map((node) =>
      Number(node.getAttribute('cx')),
    )
    const detachedPolygon = document.querySelector('.pr-dashboard__chart-point--detached polygon')
    const detachedCx = Number(detachedPolygon?.getAttribute('points')?.split(',')[0])
    expect(detachedCx).toBeGreaterThan(completedCx.at(-1)!)
    expect(screen.getByText('Apr 20 so far')).toBeTruthy()
  })

  it('line_chart_detached_point_exposes_aria_label', () => {
    render(
      <WeeklyTrendChart
        valueMode="lines"
        yAxisLabel="Lines"
        weeklyTrend={[{ weekStart: '2026-04-06', medianLines: 20 }]}
        detachedPoint={{
          weekStart: '2026-04-13',
          medianLines: 30,
          label: 'Apr 13 so far',
          ariaLabel: 'Current week so far: 30 median lines',
        }}
      />,
    )

    const detachedMarker = document.querySelector('[aria-label="Current week so far: 30 median lines"]')
    expect(detachedMarker).toBeTruthy()
    expect(detachedMarker?.querySelector('title')?.textContent).toBe(
      'Current week so far: 30 median lines',
    )
  })

  it('line_chart_plain_series_does_not_infer_detachment_from_length', () => {
    const weeklyTrend = [
      '2026-02-02',
      '2026-02-09',
      '2026-02-16',
      '2026-02-23',
      '2026-03-02',
      '2026-03-09',
      '2026-03-16',
      '2026-03-23',
      '2026-03-30',
    ].map((weekStart, i) => ({ weekStart, medianLines: 10 + i }))

    render(
      <WeeklyTrendChart
        valueMode="lines"
        yAxisLabel="Lines"
        weeklyTrend={weeklyTrend}
        ariaLabel="9-week PR size trend"
      />,
    )

    expect(screen.queryByText(/so far/i)).toBeNull()
    expect(document.querySelectorAll('circle')).toHaveLength(9)
    const pathData = Array.from(document.querySelectorAll('path')).map((node) => node.getAttribute('d') ?? '')
    expect(pathData.some((d) => d.includes(' L '))).toBe(true)
  })

  it('duration_chart_props_do_not_gain_detached_behavior', () => {
    render(
      <WeeklyTrendChart
        valueMode="duration"
        weeklyTrend={[
          { weekStart: '2026-04-06', medianHours: 24 },
          { weekStart: '2026-04-13', medianHours: 48 },
        ]}
        ariaLabel="8-week PR cycle time trend"
      />,
    )

    expect(screen.getByRole('img', { name: '8-week PR cycle time trend' })).toBeTruthy()
    expect(screen.getByText('Days')).toBeTruthy()
    expect(screen.getByText('1d')).toBeTruthy()
    expect(screen.getByText('2d')).toBeTruthy()
    expect(document.querySelectorAll('circle')).toHaveLength(2)
    expect(screen.queryByText(/so far/i)).toBeNull()
  })

  it('weekly_chart_renders_duration_comparison_segments', () => {
    render(
      <WeeklyTrendChart
        valueMode="duration"
        weeklyTrend={[]}
        comparisonTrend={comparisonTrend}
        ariaLabel="16-week PR cycle time comparison trend"
      />,
    )

    expect(document.querySelector('[data-period="previous"] path')?.getAttribute('stroke')).toBe('#6b7280')
    expect(document.querySelector('[data-period="previous"] path')?.getAttribute('stroke-dasharray')).toBeTruthy()
    expect(document.querySelector('[data-period="current"] path')?.getAttribute('stroke')).toBe('#111827')
  })

  it('weekly_chart_does_not_connect_previous_to_current_segment', () => {
    render(<WeeklyTrendChart valueMode="duration" weeklyTrend={[]} comparisonTrend={comparisonTrend} />)

    const divider = document.querySelector('[data-testid="comparison-boundary-divider"]')
    expect(divider).toBeTruthy()
    const previousPath = document.querySelector('[data-period="previous"] path')?.getAttribute('d') ?? ''
    const currentPath = document.querySelector('[data-period="current"] path')?.getAttribute('d') ?? ''
    expect(previousPath).not.toContain(currentPath.match(/^M ([^L]+)/)?.[1] ?? 'current-start')
  })

  it('weekly_chart_current_accent_never_applies_to_previous_period', () => {
    render(<WeeklyTrendChart valueMode="duration" weeklyTrend={[]} comparisonTrend={comparisonTrend} />)

    const previousAccent = document.querySelector('[data-period="previous"] [stroke="#d97706"]')
    const currentAccent = document.querySelector('[data-period="current"] [stroke="#d97706"]')
    expect(previousAccent).toBeNull()
    expect(currentAccent).toBeTruthy()
  })

  it('weekly_chart_current_accent_absent_when_current_period_all_null', () => {
    const currentNull = comparisonTrend.map((p) => (p.period === 'current' ? { ...p, medianHours: null } : p))

    render(<WeeklyTrendChart valueMode="duration" weeklyTrend={[]} comparisonTrend={currentNull} />)

    expect(document.querySelector('[stroke="#d97706"]')).toBeNull()
  })

  it('weekly_chart_comparison_preserves_null_gaps', () => {
    render(<WeeklyTrendChart valueMode="duration" weeklyTrend={[]} comparisonTrend={comparisonTrend} />)

    const previousPaths = document.querySelectorAll('[data-period="previous"] path')
    const currentPaths = document.querySelectorAll('[data-period="current"] path')
    expect(previousPaths.length).toBeGreaterThan(1)
    expect(currentPaths.length).toBeGreaterThan(1)
  })

  it('weekly_chart_comparison_exposes_stable_period_selectors', () => {
    render(<WeeklyTrendChart valueMode="duration" weeklyTrend={[]} comparisonTrend={comparisonTrend} />)

    expect(document.querySelector('[data-period="previous"]')).toBeTruthy()
    expect(document.querySelector('[data-period="current"]')).toBeTruthy()
    expect(screen.getByTestId('comparison-boundary-divider')).toBeTruthy()
    expect(screen.getByTestId('comparison-label-previous')).toBeTruthy()
    expect(screen.getByTestId('comparison-label-current')).toBeTruthy()
  })

  it('weekly_chart_comparison_renders_previous_current_period_labels', () => {
    render(<WeeklyTrendChart valueMode="duration" weeklyTrend={[]} comparisonTrend={comparisonTrend} />)

    expect(screen.getByText('Previous 8 weeks')).toBeTruthy()
    expect(screen.getByText('Current 8 weeks')).toBeTruthy()
  })

  it('weekly_chart_comparison_labels_follow_period_bucket_count', () => {
    render(<WeeklyTrendChart valueMode="duration" weeklyTrend={[]} comparisonTrend={fourWeekComparisonTrend} />)

    expect(screen.getByText('Previous 4 weeks')).toBeTruthy()
    expect(screen.getByText('Current 4 weeks')).toBeTruthy()
    expect(screen.queryByText('Previous 8 weeks')).toBeNull()
  })

  it('weekly_chart_comparison_renders_boundary_divider', () => {
    render(<WeeklyTrendChart valueMode="duration" weeklyTrend={[]} comparisonTrend={comparisonTrend} />)

    const divider = screen.getByTestId('comparison-boundary-divider')
    expect(divider.getAttribute('stroke-dasharray')).toBeTruthy()
  })

  it('weekly_chart_comparison_uses_selected_x_axis_labels', () => {
    render(<WeeklyTrendChart valueMode="duration" weeklyTrend={[]} comparisonTrend={comparisonTrend} />)

    const allBucketLabels = comparisonTrend.filter((p) => screen.queryByText(shortRenderedDate(p.bucketLabel)))
    expect(allBucketLabels.length).toBeLessThan(16)
    expect(screen.getByText(shortRenderedDate(comparisonTrend[0]!.bucketLabel))).toBeTruthy()
    expect(screen.getByText(shortRenderedDate(comparisonTrend[8]!.bucketLabel))).toBeTruthy()
    expect(screen.getByText(shortRenderedDate(comparisonTrend[15]!.bucketLabel))).toBeTruthy()
  })

  it('weekly_chart_comparison_uses_selected_x_axis_labels_for_shorter_ranges', () => {
    render(<WeeklyTrendChart valueMode="duration" weeklyTrend={[]} comparisonTrend={fourWeekComparisonTrend} />)

    expect(screen.getByText(shortRenderedDate(fourWeekComparisonTrend[0]!.bucketLabel))).toBeTruthy()
    expect(screen.getByText(shortRenderedDate(fourWeekComparisonTrend[4]!.bucketLabel))).toBeTruthy()
    expect(screen.getByText(shortRenderedDate(fourWeekComparisonTrend[7]!.bucketLabel))).toBeTruthy()
    expect(screen.queryByText(shortRenderedDate(fourWeekComparisonTrend[2]!.bucketLabel))).toBeNull()
  })

  it('weekly_chart_comparison_accepts_aria_label', () => {
    render(
      <WeeklyTrendChart
        valueMode="duration"
        weeklyTrend={[]}
        comparisonTrend={comparisonTrend}
        ariaLabel="16-week PR cycle time comparison trend"
      />,
    )

    expect(screen.getByRole('img', { name: '16-week PR cycle time comparison trend' })).toBeTruthy()
  })

  it('weekly_chart_comparison_uses_non_color_distinction', () => {
    render(<WeeklyTrendChart valueMode="duration" weeklyTrend={[]} comparisonTrend={comparisonTrend} />)

    expect(document.querySelector('[data-period="previous"] path')?.getAttribute('stroke-dasharray')).toBeTruthy()
  })

  it('weekly_chart_comparison_previous_segment_uses_muted_reference_color', () => {
    render(<WeeklyTrendChart valueMode="duration" weeklyTrend={[]} comparisonTrend={comparisonTrend} />)

    expect(document.querySelector('[data-period="previous"] path')?.getAttribute('stroke')).toBe('#6b7280')
  })

  it('weekly_chart_comparison_current_segment_uses_primary_color', () => {
    render(<WeeklyTrendChart valueMode="duration" weeklyTrend={[]} comparisonTrend={comparisonTrend} />)

    expect(document.querySelector('[data-period="current"] path[stroke="#111827"]')).toBeTruthy()
  })

  it('weekly_chart_comparison_latest_current_point_uses_accent', () => {
    render(<WeeklyTrendChart valueMode="duration" weeklyTrend={[]} comparisonTrend={comparisonTrend} />)

    expect(document.querySelector('[data-period="current"] circle[stroke="#d97706"]')).toBeTruthy()
  })

  it('weekly_chart_first_review_duration_behavior_unchanged', () => {
    render(<WeeklyTrendChart valueMode="duration" weeklyTrend={comparisonTrend.slice(0, 8).map((p) => ({ weekStart: p.bucketLabel, medianHours: p.medianHours }))} />)

    expect(document.querySelector('[data-testid="comparison-boundary-divider"]')).toBeNull()
    expect(document.querySelector('[data-period="previous"]')).toBeNull()
    expect(document.querySelectorAll('circle')).toHaveLength(7)
  })

  it('weekly_chart_duration_comparison_is_opt_in_only', () => {
    render(
      <WeeklyTrendChart
        valueMode="duration"
        weeklyTrend={comparisonTrend.map((p) => ({ weekStart: p.bucketLabel, medianHours: p.medianHours }))}
      />,
    )

    expect(document.querySelector('[data-testid="comparison-boundary-divider"]')).toBeNull()
    expect(screen.getAllByText(/Feb|Apr/).length).toBeGreaterThan(3)
  })

  it('weekly_chart_pr_size_line_behavior_unchanged', () => {
    render(
      <WeeklyTrendChart
        valueMode="lines"
        yAxisLabel="Lines"
        weeklyTrend={[
          { weekStart: '2026-04-06', medianLines: 20 },
          { weekStart: '2026-04-13', medianLines: null },
          { weekStart: '2026-04-20', medianLines: 40 },
        ]}
        detachedPoint={{
          weekStart: '2026-04-27',
          medianLines: 55,
          label: 'Apr 27 so far',
          ariaLabel: 'Current week so far: 55 median lines',
        }}
      />,
    )

    expect(document.querySelector('[data-testid="comparison-boundary-divider"]')).toBeNull()
    expect(document.querySelector('.pr-dashboard__chart-point--detached')).toBeTruthy()
  })

  it('pr_size_line_mode_handles_all_null_or_empty_line_trend', () => {
    const { rerender } = render(
      <WeeklyTrendChart
        valueMode="lines"
        yAxisLabel="Lines"
        weeklyTrend={[
          { weekStart: '2026-04-06', medianLines: null },
          { weekStart: '2026-04-13', medianLines: null },
        ]}
      />,
    )

    expect(screen.getByText('Lines')).toBeTruthy()
    expect(document.querySelectorAll('circle')).toHaveLength(0)

    rerender(<WeeklyTrendChart valueMode="lines" yAxisLabel="Lines" weeklyTrend={[]} />)
    expect(screen.getByText('Lines')).toBeTruthy()
    expect(document.querySelectorAll('circle')).toHaveLength(0)
  })

  it('line_chart_detached_point_is_not_in_completed_series_path', () => {
    render(
      <WeeklyTrendChart
        valueMode="lines"
        yAxisLabel="Lines"
        weeklyTrend={[
          { weekStart: '2026-04-06', medianLines: 20 },
          { weekStart: '2026-04-13', medianLines: 40 },
        ]}
        detachedPoint={{
          weekStart: '2026-04-20',
          medianLines: 55,
          label: 'Apr 20 so far',
          ariaLabel: 'Current week so far: 55 median lines',
        }}
      />,
    )

    const detachedX = Number(
      document.querySelector('.pr-dashboard__chart-point--detached polygon')?.getAttribute('points')?.split(',')[0],
    )
    const pathData = Array.from(document.querySelectorAll('path')).map((node) => node.getAttribute('d') ?? '')
    expect(pathData.some((d) => d.includes(` ${detachedX} `))).toBe(false)
  })

  it('line_chart_detached_point_does_not_connect_across_null_gap', () => {
    render(
      <WeeklyTrendChart
        valueMode="lines"
        yAxisLabel="Lines"
        weeklyTrend={[
          { weekStart: '2026-04-06', medianLines: 20 },
          { weekStart: '2026-04-13', medianLines: null },
          { weekStart: '2026-04-20', medianLines: 40 },
        ]}
        detachedPoint={{
          weekStart: '2026-04-27',
          medianLines: 55,
          label: 'Apr 27 so far',
          ariaLabel: 'Current week so far: 55 median lines',
        }}
      />,
    )

    const pathData = Array.from(document.querySelectorAll('path')).map((node) => node.getAttribute('d') ?? '')
    const linePaths = pathData.filter((d) => d.startsWith('M ') && d.includes(' L '))
    expect(linePaths).toHaveLength(0)
  })

  it('line_chart_extreme_detached_outlier_does_not_flatten_completed_line', () => {
    const weeklyTrend = [
      { weekStart: '2026-04-06', medianLines: 20 },
      { weekStart: '2026-04-13', medianLines: 40 },
    ]

    const { unmount: unmountBaseline } = render(
      <WeeklyTrendChart valueMode="lines" yAxisLabel="Lines" weeklyTrend={weeklyTrend} />,
    )
    const baselineCy = Array.from(document.querySelectorAll('circle')).map((node) => Number(node.getAttribute('cy')))
    unmountBaseline()

    render(
      <WeeklyTrendChart
        valueMode="lines"
        yAxisLabel="Lines"
        weeklyTrend={weeklyTrend}
        detachedPoint={{
          weekStart: '2026-04-20',
          medianLines: 500,
          label: 'Apr 20 so far',
          ariaLabel: 'Current week so far: 500 median lines',
        }}
      />,
    )

    const completedCy = Array.from(document.querySelectorAll('circle')).map((node) => Number(node.getAttribute('cy')))
    expect(completedCy).toEqual(baselineCy)
    expect(screen.getByText('500')).toBeTruthy()

    const detachedGroup = document.querySelector('.pr-dashboard__chart-point--detached')
    expect(detachedGroup?.getAttribute('data-detached-overflow')).toBe('true')
    const markerBounds = parseBoundsAttr(detachedGroup?.getAttribute('data-layout-marker-bounds') ?? null)
    const labelBounds = parseBoundsAttr(detachedGroup?.getAttribute('data-layout-label-bounds') ?? null)
    expect(rectInsideViewBox(markerBounds, WEEKLY_TREND_CHART_VIEWBOX_WIDTH, WEEKLY_TREND_CHART_VIEWBOX_HEIGHT)).toBe(
      true,
    )
    expect(rectInsideViewBox(labelBounds, WEEKLY_TREND_CHART_VIEWBOX_WIDTH, WEEKLY_TREND_CHART_VIEWBOX_HEIGHT)).toBe(
      true,
    )
  })

  it('line_chart_current_only_state_scales_from_detached_point', () => {
    render(
      <WeeklyTrendChart
        valueMode="lines"
        yAxisLabel="Lines"
        weeklyTrend={[
          { weekStart: '2026-04-06', medianLines: null },
          { weekStart: '2026-04-13', medianLines: null },
        ]}
        detachedPoint={{
          weekStart: '2026-04-20',
          medianLines: 55,
          label: 'Apr 20 so far',
          ariaLabel: 'Current week so far: 55 median lines',
        }}
      />,
    )

    const linePaths = Array.from(document.querySelectorAll('path'))
      .map((node) => node.getAttribute('d') ?? '')
      .filter((d) => d.startsWith('M ') && d.includes(' L '))
    expect(linePaths).toHaveLength(0)
    expect(document.querySelectorAll('circle')).toHaveLength(0)
    expect(screen.getByText('55')).toBeTruthy()

    const detachedGroup = document.querySelector('.pr-dashboard__chart-point--detached')
    const markerBounds = parseBoundsAttr(detachedGroup?.getAttribute('data-layout-marker-bounds') ?? null)
    const labelBounds = parseBoundsAttr(detachedGroup?.getAttribute('data-layout-label-bounds') ?? null)
    expect(rectInsideViewBox(markerBounds, WEEKLY_TREND_CHART_VIEWBOX_WIDTH, WEEKLY_TREND_CHART_VIEWBOX_HEIGHT)).toBe(
      true,
    )
    expect(rectInsideViewBox(labelBounds, WEEKLY_TREND_CHART_VIEWBOX_WIDTH, WEEKLY_TREND_CHART_VIEWBOX_HEIGHT)).toBe(
      true,
    )
  })

  it('detached_label_layout_clamps_extreme_outlier_label_inside_viewbox', () => {
    const layout = layoutDetachedMarker({
      markerX: 540,
      markerY: 42,
      valueLabel: '99999',
    })

    expect(
      rectInsideViewBox(layout.valueLabelRect, WEEKLY_TREND_CHART_VIEWBOX_WIDTH, WEEKLY_TREND_CHART_VIEWBOX_HEIGHT),
    ).toBe(true)
    expect(
      rectInsideViewBox(layout.markerRect, WEEKLY_TREND_CHART_VIEWBOX_WIDTH, WEEKLY_TREND_CHART_VIEWBOX_HEIGHT),
    ).toBe(true)
  })

  it('detached_label_layout_clamps_current_only_label_inside_viewbox', () => {
    const layout = layoutDetachedMarker({
      markerX: 48,
      markerY: 120,
      valueLabel: '55',
    })

    expect(
      rectInsideViewBox(layout.valueLabelRect, WEEKLY_TREND_CHART_VIEWBOX_WIDTH, WEEKLY_TREND_CHART_VIEWBOX_HEIGHT),
    ).toBe(true)
    expect(
      rectInsideViewBox(layout.markerRect, WEEKLY_TREND_CHART_VIEWBOX_WIDTH, WEEKLY_TREND_CHART_VIEWBOX_HEIGHT),
    ).toBe(true)
  })

  it('line_chart_fractional_median_label_is_not_rounded_to_integer', () => {
    render(
      <WeeklyTrendChart
        valueMode="lines"
        yAxisLabel="Lines"
        weeklyTrend={[{ weekStart: '2026-04-06', medianLines: 1.5 }]}
      />,
    )

    expect(screen.getByText('1.5')).toBeTruthy()
    expect(screen.queryByText('2')).toBeNull()
  })

  it('duration_chart_preserves_existing_last_point_highlight', () => {
    render(
      <WeeklyTrendChart
        valueMode="duration"
        weeklyTrend={[
          { weekStart: '2026-04-06', medianHours: 24 },
          { weekStart: '2026-04-13', medianHours: 48 },
        ]}
      />,
    )

    const circles = Array.from(document.querySelectorAll('circle'))
    expect(circles).toHaveLength(2)
    expect(circles[1]?.getAttribute('r')).toBe('6')
    expect(circles[1]?.getAttribute('stroke')).toBe('#d97706')
  })

  it('detached_point_has_non_color_visual_marker_class_or_attribute', () => {
    render(
      <WeeklyTrendChart
        valueMode="lines"
        yAxisLabel="Lines"
        weeklyTrend={[{ weekStart: '2026-04-06', medianLines: 20 }]}
        detachedPoint={{
          weekStart: '2026-04-13',
          medianLines: 30,
          label: 'Apr 13 so far',
          ariaLabel: 'Current week so far: 30 median lines',
        }}
      />,
    )

    const detachedGroup = document.querySelector('.pr-dashboard__chart-point--detached')
    expect(detachedGroup).toBeTruthy()
    expect(detachedGroup?.getAttribute('data-layout-marker-bounds')).toBeTruthy()
    const polygon = detachedGroup?.querySelector('polygon')
    expect(polygon).toBeTruthy()
    expect(detachedGroup?.querySelector('circle')).toBeNull()
    expect(polygon?.getAttribute('stroke-dasharray')).toBeTruthy()
  })

  it('first_review_and_pr_cycle_time_accessibility_copy_unchanged_without_detached_props', () => {
    render(
      <WeeklyTrendChart
        valueMode="duration"
        weeklyTrend={[
          { weekStart: '2026-04-06', medianHours: 24 },
          { weekStart: '2026-04-13', medianHours: 48 },
        ]}
      />,
    )

    expect(screen.getByRole('img', { name: '8-week PR cycle time trend' })).toBeTruthy()
    expect(screen.queryByText(/PR size/i)).toBeNull()
    expect(screen.queryByText(/so far/i)).toBeNull()
    expect(document.querySelector('.pr-dashboard__chart-point--detached')).toBeNull()

    cleanup()

    render(
      <FirstReviewTrendChart
        weeklyTrend={[
          { weekStart: '2026-04-06', medianHours: 1 },
          { weekStart: '2026-04-13', medianHours: 2 },
        ]}
        comparisonWeeklyTrend={[
          {
            period: 'previous',
            bucketIndex: 1,
            bucketStart: '2026-03-30T00:00:00.000Z',
            bucketEnd: '2026-04-06T00:00:00.000Z',
            bucketLabel: '2026-03-30',
            medianHours: 1,
          },
          {
            period: 'current',
            bucketIndex: 1,
            bucketStart: '2026-04-06T00:00:00.000Z',
            bucketEnd: '2026-04-13T00:00:00.000Z',
            bucketLabel: '2026-04-06',
            medianHours: 2,
          },
        ]}
        metric={{
          medianHours: 2,
          previousMedianHours: 1,
          qualifyingPrCount: 1,
          mergedPrCountInSyncedRepos: 1,
          trendPercent: 100,
          baselineStatus: 'pending',
          botShare: null,
        }}
      />,
    )

    expect(screen.getByRole('img', { name: '2-week First Review comparison trend' })).toBeTruthy()
    expect(screen.queryByText(/PR size/i)).toBeNull()
    expect(screen.queryByText(/so far/i)).toBeNull()
    expect(document.querySelector('.pr-dashboard__chart-point--detached')).toBeNull()
  })
})
