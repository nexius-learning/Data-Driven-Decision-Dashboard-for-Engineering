import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'

import type { PrCycleTimeDashboard as DashboardModel } from '~/metrics/pr-cycle-time-dashboard'
import {
  formatCycleDuration,
  formatDurationHumanDays,
  formatPreviousMedianReference,
} from '~/components/dashboard/format-cycle-duration'
import { PrCycleTimeDashboard } from '~/components/dashboard/PrCycleTimeDashboard'
import { DASHBOARD_SOURCE_PATHS } from '~/metrics/dashboard-source-paths'

function baseDashboard(overrides: Partial<DashboardModel> = {}): DashboardModel {
  const weeklyTrend = Array.from({ length: 8 }, (_, i) => ({
    weekStart: `2026-0${1 + i}-01`,
    medianHours: i % 2 === 0 ? 24 : null,
  }))
  const comparisonWeeklyTrend = Array.from({ length: 16 }, (_, i) => ({
    period: i < 8 ? ('previous' as const) : ('current' as const),
    bucketIndex: (i % 8) + 1,
    bucketStart: `2026-0${i < 8 ? 2 : 4}-${String((i % 8) + 1).padStart(2, '0')}T00:00:00.000Z`,
    bucketEnd: `2026-0${i < 8 ? 2 : 4}-${String((i % 8) + 2).padStart(2, '0')}T00:00:00.000Z`,
    bucketLabel: `2026-0${i < 8 ? 2 : 4}-${String((i % 8) + 1).padStart(2, '0')}`,
    medianHours: i % 2 === 0 ? 24 : null,
  }))
  return {
    range: { from: '2026-01-01T00:00:00.000Z', to: '2026-05-14T23:59:59.999Z', weeks: 8 },
    metric: {
      medianHours: 36,
      previousMedianHours: 40,
      mergedPrCount: 4,
      trendPercent: -10,
      baselineStatus: 'available',
    },
    exceptions: [],
    weeklyTrend,
    comparisonWeeklyTrend,
    teamBreakdown: [
      {
        team: 'Alpha',
        mergedPrs: 4,
        medianHours: 36,
        previousMedianHours: 40,
        trendPercent: -10,
        longestOpenPrHours: 12,
      },
    ],
    freshness: {
      reposScanned: 3,
      prMetadataSyncedAt: '2026-05-14T10:00:00.000Z',
      prsMissingJiraKey: 1,
      syncErrors: 0,
      latestSyncStatus: 'success',
    },
    ...overrides,
  }
}

function rangeDashboard(weeks: number): DashboardModel {
  const total = weeks * 2
  return baseDashboard({
    range: { from: '2026-04-01T00:00:00.000Z', to: '2026-05-14T23:59:59.999Z', weeks },
    weeklyTrend: Array.from({ length: weeks }, (_, i) => ({
      weekStart: `2026-04-${String(i + 1).padStart(2, '0')}`,
      medianHours: i + 1,
    })),
    comparisonWeeklyTrend: Array.from({ length: total }, (_, i) => ({
      period: i < weeks ? ('previous' as const) : ('current' as const),
      bucketIndex: (i % weeks) + 1,
      bucketStart: `2026-0${i < weeks ? 3 : 4}-${String((i % weeks) + 1).padStart(2, '0')}T00:00:00.000Z`,
      bucketEnd: `2026-0${i < weeks ? 3 : 4}-${String((i % weeks) + 2).padStart(2, '0')}T00:00:00.000Z`,
      bucketLabel: `2026-0${i < weeks ? 3 : 4}-${String((i % weeks) + 1).padStart(2, '0')}`,
      medianHours: i + 1,
    })),
  })
}

describe('formatCycleDuration', () => {
  it('formats_under_48h_as_hours', () => {
    expect(formatCycleDuration(12)).toBe('12h')
    expect(formatCycleDuration(47.2)).toBe('47.2h')
  })

  it('formats_48h_plus_as_days', () => {
    expect(formatCycleDuration(72)).toBe('3.0 days')
  })
})

describe('formatDurationHumanDays', () => {
  it('formats_plural_days', () => {
    expect(formatDurationHumanDays(216)).toBe('9 days')
  })

  it('formats_singular_day', () => {
    expect(formatDurationHumanDays(24)).toBe('1 day')
  })

  it('formats_null', () => {
    expect(formatDurationHumanDays(null)).toBe('—')
  })
})

describe('formatPreviousMedianReference', () => {
  it('keeps_precision_for_sub_hour_values', () => {
    expect(formatPreviousMedianReference(0.077)).toBe('0.077h')
  })

  it('formats_hour_values', () => {
    expect(formatPreviousMedianReference(12.4)).toBe('12.4h')
  })
})

describe.sequential('PrCycleTimeDashboard', () => {
  afterEach(() => {
    cleanup()
  })

  it('dashboard_renders_single_metric', () => {
    render(<PrCycleTimeDashboard data={baseDashboard()} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Median PR Cycle Time' })).toBeInTheDocument()
    expect(screen.getByTestId('median-pr-cycle-time')).toBeInTheDocument()
  })

  it('dashboard_empty_state_no_merged_prs', () => {
    render(
      <PrCycleTimeDashboard
        data={baseDashboard({
          metric: {
            medianHours: null,
            previousMedianHours: null,
            mergedPrCount: 0,
            trendPercent: null,
            baselineStatus: 'pending',
          },
        })}
      />,
    )
    expect(screen.getByTestId('median-pr-cycle-time')).toHaveTextContent('No merged PRs in range')
  })

  it('dashboard_shows_baseline_pending', () => {
    render(
      <PrCycleTimeDashboard
        data={baseDashboard({
          metric: {
            medianHours: 40,
            previousMedianHours: 0.5,
            mergedPrCount: 2,
            trendPercent: null,
            baselineStatus: 'pending',
          },
        })}
      />,
    )
    expect(screen.getByText('Baseline pending')).toBeInTheDocument()
  })

  it('dashboard_empty_state_no_repos', () => {
    render(
      <PrCycleTimeDashboard
        data={baseDashboard({
          metric: {
            medianHours: null,
            previousMedianHours: null,
            mergedPrCount: 0,
            trendPercent: null,
            baselineStatus: 'pending',
          },
          freshness: {
            reposScanned: 0,
            prMetadataSyncedAt: null,
            prsMissingJiraKey: 0,
            syncErrors: 0,
            latestSyncStatus: 'never_run',
          },
          teamBreakdown: [],
        })}
      />,
    )
    expect(screen.getByText('No repositories discovered')).toBeInTheDocument()
  })

  it('dashboard_shows_data_freshness', () => {
    render(<PrCycleTimeDashboard data={baseDashboard()} />)
    const strip = screen.getByTestId('data-freshness')
    expect(strip).toHaveTextContent('3 repos scanned')
    expect(strip).toHaveTextContent('GitHub PR metadata synced')
    expect(strip).toHaveTextContent('1 PR missing Jira key')
    expect(strip).toHaveTextContent('0 sync errors')
  })

  it('dashboard_links_freshness_and_metric_to_source_pages', () => {
    render(<PrCycleTimeDashboard data={baseDashboard()} />)
    expect(screen.getByRole('link', { name: /4 merged PRs analyzed/i })).toHaveAttribute(
      'href',
      DASHBOARD_SOURCE_PATHS.mergedPrs,
    )
    expect(screen.getByRole('link', { name: /3 repos scanned/i })).toHaveAttribute('href', DASHBOARD_SOURCE_PATHS.repos)
    expect(screen.getByRole('link', { name: /GitHub PR metadata synced/i })).toHaveAttribute(
      'href',
      DASHBOARD_SOURCE_PATHS.sync,
    )
    expect(screen.queryByRole('link', { name: /sync errors/i })).not.toBeInTheDocument()
  })

  it('dashboard_links_sync_errors_when_present', () => {
    render(
      <PrCycleTimeDashboard
        data={baseDashboard({
          freshness: {
            reposScanned: 3,
            prMetadataSyncedAt: '2026-05-14T10:00:00.000Z',
            prsMissingJiraKey: 0,
            syncErrors: 2,
            latestSyncStatus: 'partial',
          },
        })}
      />,
    )
    expect(screen.getByRole('link', { name: /2 sync errors/i })).toHaveAttribute(
      'href',
      DASHBOARD_SOURCE_PATHS.syncErrors,
    )
  })

  it('dashboard_shows_collapsible_how_to_read_on_each_card', () => {
    render(<PrCycleTimeDashboard data={baseDashboard()} />)
    expect(screen.getAllByText('How to read this')).toHaveLength(4)
  })

  it('dashboard_reveals_card_help_when_how_to_read_is_opened', async () => {
    render(<PrCycleTimeDashboard data={baseDashboard()} />)
    const toggles = screen.getAllByText('How to read this')
    await fireEvent.click(toggles[0]!)
    expect(screen.getByText(/Elapsed time from when a pull request is opened/i)).toBeVisible()
    expect(screen.getByText(/under about 7 minutes/i)).toBeVisible()
  })

  it('dashboard_shows_sync_failed_state', () => {
    render(
      <PrCycleTimeDashboard
        data={baseDashboard({
          freshness: {
            reposScanned: 1,
            prMetadataSyncedAt: '2026-05-01T12:00:00.000Z',
            prsMissingJiraKey: 0,
            syncErrors: 2,
            latestSyncStatus: 'failed',
          },
        })}
      />,
    )
    expect(screen.getByText('Sync failed')).toBeInTheDocument()
  })

  it('dashboard_renders_16_week_pr_cycle_time_comparison_trend', () => {
    render(<PrCycleTimeDashboard data={baseDashboard()} />)
    const trendList = screen.getByTestId('weekly-trend-list')
    const items = within(trendList).getAllByRole('listitem')
    expect(items).toHaveLength(16)
    expect(screen.getByRole('img', { name: '16-week PR cycle time comparison trend' })).toBeInTheDocument()
    expect(within(trendList).getAllByText('empty')).toHaveLength(8)
  })

  it('dashboard_comparison_trend_hidden_list_labels_previous_and_current_periods', () => {
    render(<PrCycleTimeDashboard data={baseDashboard()} />)
    const items = within(screen.getByTestId('weekly-trend-list')).getAllByRole('listitem')

    expect(items[0]).toHaveTextContent('previous')
    expect(items[8]).toHaveTextContent('current')
  })

  it('dashboard_comparison_trend_heading_names_previous_and_current_8_weeks', () => {
    render(<PrCycleTimeDashboard data={baseDashboard()} />)

    expect(screen.getByRole('heading', { name: '16-week PR cycle time comparison trend' })).toBeInTheDocument()
    expect(screen.getByText(/Previous 8 weeks followed by current 8 weeks/i)).toBeInTheDocument()
  })

  it('dashboard_comparison_trend_heading_follows_requested_range', () => {
    render(<PrCycleTimeDashboard data={rangeDashboard(4)} />)

    expect(screen.getByRole('heading', { name: '8-week PR cycle time comparison trend' })).toBeInTheDocument()
    expect(screen.getByText(/Previous 4 weeks followed by current 4 weeks/i)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '8-week PR cycle time comparison trend' })).toBeInTheDocument()
    expect(within(screen.getByTestId('weekly-trend-list')).getAllByRole('listitem')).toHaveLength(8)
  })

  it('dashboard_comparison_trend_how_to_read_maps_muted_segment_to_previous_median', async () => {
    render(<PrCycleTimeDashboard data={baseDashboard()} />)
    await fireEvent.click(screen.getAllByText('How to read this')[2]!)

    expect(screen.getByText(/muted dashed segment is the previous comparison period/i)).toBeVisible()
    expect(screen.getByText(/dark segment is the current dashboard period/i)).toBeVisible()
  })

  it('dashboard_comparison_trend_baseline_pending_copy', () => {
    const { rerender } = render(
      <PrCycleTimeDashboard
        data={baseDashboard({
          metric: {
            medianHours: 36,
            previousMedianHours: null,
            mergedPrCount: 4,
            trendPercent: null,
            baselineStatus: 'pending',
          },
        })}
      />,
    )

    expect(screen.getByText(/Previous-period points are shown for context/i)).toBeInTheDocument()

    rerender(<PrCycleTimeDashboard data={baseDashboard()} />)
    expect(screen.queryByText(/Previous-period points are shown for context/i)).toBeNull()
  })

  it('dashboard_comparison_trend_zero_or_null_previous_median_still_context_only', () => {
    render(
      <PrCycleTimeDashboard
        data={baseDashboard({
          metric: {
            medianHours: 36,
            previousMedianHours: 0,
            mergedPrCount: 4,
            trendPercent: null,
            baselineStatus: 'pending',
          },
        })}
      />,
    )

    expect(screen.getByText(/does not represent an available comparison baseline/i)).toBeInTheDocument()
  })

  it('dashboard_comparison_trend_no_current_data_copy_does_not_present_previous_as_current', () => {
    render(
      <PrCycleTimeDashboard
        data={baseDashboard({
          metric: {
            medianHours: null,
            previousMedianHours: 24,
            mergedPrCount: 0,
            trendPercent: null,
            baselineStatus: 'pending',
          },
        })}
      />,
    )

    expect(screen.getByText(/current period has no merged PRs/i)).toBeInTheDocument()
  })

  it('dashboard_cycle_time_trend_uses_minutes_for_sub_hour_values', () => {
    render(
      <PrCycleTimeDashboard
        data={baseDashboard({
          comparisonWeeklyTrend: baseDashboard().comparisonWeeklyTrend.map((p, i) => ({
            ...p,
            medianHours: i === 0 ? 0.25 : i === 1 ? 0.5 : null,
          })),
        })}
      />,
    )

    expect(screen.getByText('Minutes')).toBeInTheDocument()
    expect(screen.getAllByText('30m')).toHaveLength(2)
  })

  it('dashboard_cycle_time_sr_trend_does_not_collapse_non_zero_duration_to_zero', () => {
    render(
      <PrCycleTimeDashboard
        data={baseDashboard({
          comparisonWeeklyTrend: baseDashboard().comparisonWeeklyTrend.map((p, i) => ({
            ...p,
            medianHours: i === 0 ? 0.004 : null,
          })),
        })}
      />,
    )

    expect(screen.getByTestId('weekly-trend-list')).toHaveTextContent('0.2m')
    expect(screen.getByTestId('weekly-trend-list')).not.toHaveTextContent('0.0')
  })

  it('dashboard_cycle_time_sr_trend_preserves_null_vs_zero_duration', () => {
    render(
      <PrCycleTimeDashboard
        data={baseDashboard({
          comparisonWeeklyTrend: baseDashboard().comparisonWeeklyTrend.map((p, i) => ({
            ...p,
            medianHours: i === 0 ? null : i === 1 ? 0 : null,
          })),
        })}
      />,
    )

    const trendList = screen.getByTestId('weekly-trend-list')
    expect(trendList).toHaveTextContent('empty')
    expect(trendList).toHaveTextContent('0m')
  })

  it('dashboard_cycle_time_sr_uses_one_day_unit_for_mixed_values', () => {
    render(
      <PrCycleTimeDashboard
        data={baseDashboard({
          comparisonWeeklyTrend: baseDashboard().comparisonWeeklyTrend.map((p, i) => ({
            ...p,
            medianHours: i === 0 ? 0.5 : i === 1 ? 48 : null,
          })),
        })}
      />,
    )

    expect(screen.getByText('Days')).toBeInTheDocument()
    expect(screen.getAllByText('0.02d')).toHaveLength(2)
    expect(screen.getAllByText('2d')).toHaveLength(2)
  })

  it('dashboard_renders_team_breakdown', () => {
    render(<PrCycleTimeDashboard data={baseDashboard()} />)
    const table = screen.getByRole('table', { name: 'Team breakdown' })
    expect(within(table).getByRole('cell', { name: 'Alpha' })).toBeInTheDocument()
    expect(within(table).getByRole('cell', { name: '4' })).toBeInTheDocument()
  })

  it('dashboard_shows_previous_median_beside_trend', () => {
    render(
      <PrCycleTimeDashboard
        data={baseDashboard({
          metric: {
            medianHours: 1,
            previousMedianHours: 0.077,
            mergedPrCount: 10,
            trendPercent: 1203,
            baselineStatus: 'available',
          },
          teamBreakdown: [
            {
              team: 'DPA / Lecke',
              mergedPrs: 5,
              medianHours: 0.49,
              previousMedianHours: 0.036,
              trendPercent: 1266,
              longestOpenPrHours: null,
            },
          ],
        })}
      />,
    )
    expect(screen.getByText('(0.077h)')).toBeInTheDocument()
    expect(screen.getByText('(0.036h)')).toBeInTheDocument()
    expect(screen.getByText(/\+1203%/)).toBeInTheDocument()
    expect(screen.getByText(/\+1266%/)).toBeInTheDocument()
  })

  it('dashboard_renders_unassigned_team_with_attention_marker_and_mapping_comment', () => {
    const { container } = render(
      <PrCycleTimeDashboard
        data={baseDashboard({
          teamBreakdown: [
            {
              team: 'Unassigned',
              mergedPrs: 1,
              medianHours: 10,
              previousMedianHours: null,
              trendPercent: null,
              longestOpenPrHours: null,
            },
          ],
        })}
      />,
    )
    const table = screen.getByRole('table', { name: 'Team breakdown' })
    expect(within(table).getByRole('cell', { name: /Unassigned/ })).toBeInTheDocument()
    expect(container.querySelector('.pr-dashboard__team-dot--unassigned')).toBeInTheDocument()
    expect(within(table).getByText('needs team mapping')).toBeInTheDocument()
  })

  it('dashboard_renders_pr_cycle_time_exceptions_only', () => {
    render(
      <PrCycleTimeDashboard
        data={baseDashboard({
          exceptions: [
            {
              type: 'baseline_pending',
              severity: 'info',
              team: 'Alpha',
              message: 'Alpha baseline pending',
            },
          ],
        })}
      />,
    )
    expect(screen.getByText(/Alpha baseline pending/)).toBeInTheDocument()
  })

  it('dashboard_renders_long_open_prs_count', () => {
    render(
      <PrCycleTimeDashboard
        data={baseDashboard({
          exceptions: [
            {
              type: 'long_open_prs',
              severity: 'warning',
              team: 'Alpha',
              message: 'Alpha has open pull requests older than the team median cycle time.',
              count: 6,
              teamMedianHours: 36,
              averageOpenPrAgeHours: 54,
              percentOverTeamMedian: 50,
            },
          ],
        })}
      />,
    )

    expect(screen.getByText('6 PRs older than 36h team median')).toBeInTheDocument()
    expect(screen.getByText('Average open age 54h (+50% over median)')).toBeInTheDocument()
  })

  it('dashboard_renders_worsened_exception_median_in_hours', () => {
    render(
      <PrCycleTimeDashboard
        data={baseDashboard({
          exceptions: [
            {
              type: 'team_worsened',
              severity: 'warning',
              team: 'Alpha',
              message: 'Alpha median PR cycle time worsened by at least 25% versus the previous period.',
            },
          ],
          teamBreakdown: [
            {
              team: 'Alpha',
              mergedPrs: 4,
              medianHours: 0.077,
              previousMedianHours: 0.036,
              trendPercent: 114,
              longestOpenPrHours: null,
            },
          ],
        })}
      />,
    )

    expect(screen.getByText('0.077h median')).toBeInTheDocument()
    expect(screen.getByText('Compare against previous-period cycle time')).toBeInTheDocument()
  })

  it('dashboard_does_not_show_future_metrics', () => {
    render(<PrCycleTimeDashboard data={baseDashboard()} />)
    expect(screen.queryByText(/PR Size/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/First Review/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/WIP/i)).not.toBeInTheDocument()
  })

  it('dashboard_renders_only_phase_01_surface_after_phase_02_removal', () => {
    render(<PrCycleTimeDashboard data={baseDashboard()} />)
    // No First Review section nodes anywhere.
    expect(screen.queryByRole('heading', { level: 2, name: 'First Review Time' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: 'Median First Review Time' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: 'Review-latency exceptions' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: '8-week First Review trend' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: 'Review team breakdown' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('median-first-review-time')).not.toBeInTheDocument()
    expect(screen.queryByTestId('first-review-weekly-trend-list')).not.toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Review team breakdown' })).not.toBeInTheDocument()
    // Phase 01 viewport still renders.
    expect(screen.getByRole('heading', { level: 2, name: 'Median PR Cycle Time' })).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Team breakdown' })).toBeInTheDocument()
    // Phase 01 footer freshness items still render (regression guard).
    const strip = screen.getByTestId('data-freshness')
    expect(strip).toHaveTextContent('3 repos scanned')
    expect(strip).toHaveTextContent('GitHub PR metadata synced')
    expect(strip).toHaveTextContent('1 PR missing Jira key')
    expect(strip).toHaveTextContent('0 sync errors')
    // No Phase 02 freshness items.
    expect(strip).not.toHaveTextContent('GitHub review metadata synced')
    expect(strip).not.toHaveTextContent('review sync error')
  })

  it('phase_01_team_table_has_no_reviewed_prs_column_after_removal', () => {
    render(<PrCycleTimeDashboard data={baseDashboard()} />)
    const table = screen.getByRole('table', { name: 'Team breakdown' })
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((h) => h.textContent?.trim())
    expect(headers).toEqual(['Team', 'Merged PRs', 'Median', 'Trend (vs prev 8 w)', 'Longest Open PR'])
    expect(headers).not.toContain('Reviewed PRs')
  })

  it('refresh_button_invokes_callback', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    render(<PrCycleTimeDashboard data={baseDashboard()} onRefresh={onRefresh} />)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(onRefresh).toHaveBeenCalled()
  })

  it('team_filter_dropdown_is_visible_in_toolbar', () => {
    render(<PrCycleTimeDashboard data={baseDashboard()} />)
    expect(screen.getByRole('combobox', { name: 'Filter by team' })).toBeInTheDocument()
  })

  it('team_filter_calls_onTeamSelect_with_team_name_when_team_selected', () => {
    const onTeamSelect = vi.fn()
    render(
      <PrCycleTimeDashboard
        data={baseDashboard({
          teamBreakdown: [
            { team: 'Alpha', mergedPrs: 4, medianHours: 36, previousMedianHours: null, trendPercent: null, longestOpenPrHours: null },
          ],
        })}
        onTeamSelect={onTeamSelect}
      />,
    )
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by team' }), { target: { value: 'Alpha' } })
    expect(onTeamSelect).toHaveBeenCalledWith('Alpha')
  })

  it('team_filter_calls_onTeamSelect_with_undefined_when_all_teams_selected', () => {
    const onTeamSelect = vi.fn()
    render(
      <PrCycleTimeDashboard
        data={baseDashboard({
          teamBreakdown: [
            { team: 'Alpha', mergedPrs: 4, medianHours: 36, previousMedianHours: null, trendPercent: null, longestOpenPrHours: null },
          ],
        })}
        activeTeam="Alpha"
        onTeamSelect={onTeamSelect}
      />,
    )
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by team' }), { target: { value: '' } })
    expect(onTeamSelect).toHaveBeenCalledWith(undefined)
  })

  it('team_filter_unassigned_appears_last', () => {
    // teamBreakdown arrives pre-sorted by compareTeamLabels (Alpha < Zeta < Unassigned)
    render(
      <PrCycleTimeDashboard
        data={baseDashboard({
          teamBreakdown: [
            { team: 'Alpha', mergedPrs: 3, medianHours: 8, previousMedianHours: null, trendPercent: null, longestOpenPrHours: null },
            { team: 'Zeta', mergedPrs: 2, medianHours: 12, previousMedianHours: null, trendPercent: null, longestOpenPrHours: null },
            { team: 'Unassigned', mergedPrs: 1, medianHours: 5, previousMedianHours: null, trendPercent: null, longestOpenPrHours: null },
          ],
        })}
      />,
    )
    const select = screen.getByRole('combobox', { name: 'Filter by team' })
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.textContent)
    expect(options[options.length - 1]).toBe('Unassigned')
  })

  it('team_filter_shows_active_team_as_selected', () => {
    render(
      <PrCycleTimeDashboard
        data={baseDashboard({
          teamBreakdown: [
            { team: 'Alpha', mergedPrs: 4, medianHours: 36, previousMedianHours: null, trendPercent: null, longestOpenPrHours: null },
          ],
        })}
        activeTeam="Alpha"
      />,
    )
    const select = screen.getByRole('combobox', { name: 'Filter by team' }) as HTMLSelectElement
    expect(select.value).toBe('Alpha')
  })

  it('team_filter_shows_all_teams_when_no_active_team', () => {
    render(<PrCycleTimeDashboard data={baseDashboard()} />)
    const select = screen.getByRole('combobox', { name: 'Filter by team' }) as HTMLSelectElement
    expect(select.value).toBe('')
  })

  it('team_filter_lists_all_teams_first_then_breakdown_teams', () => {
    render(
      <PrCycleTimeDashboard
        data={baseDashboard({
          teamBreakdown: [
            { team: 'Beta', mergedPrs: 2, medianHours: 10, previousMedianHours: null, trendPercent: null, longestOpenPrHours: null },
            { team: 'Alpha', mergedPrs: 3, medianHours: 8, previousMedianHours: null, trendPercent: null, longestOpenPrHours: null },
          ],
        })}
      />,
    )
    const select = screen.getByRole('combobox', { name: 'Filter by team' })
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.textContent)
    expect(options[0]).toBe('All Teams')
    expect(options).toContain('Beta')
    expect(options).toContain('Alpha')
  })
})
