import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import type { PrCycleTimeDashboard as DashboardModel } from '~/metrics/pr-cycle-time-dashboard'
import { PrCycleTimeDashboard } from '~/components/dashboard/PrCycleTimeDashboard'
import type { RefreshButtonState } from '~/server/derive-refresh-button-state'

function baseDashboard(overrides: Partial<DashboardModel> = {}): DashboardModel {
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
    weeklyTrend: [],
    comparisonWeeklyTrend: [],
    allTeams: [],
    teamBreakdown: [],
    freshness: {
      reposScanned: 3,
      prMetadataSyncedAt: '2026-05-14T10:00:00.000Z',
      prsMissingJiraKey: 0,
      syncErrors: 0,
      latestSyncStatus: 'success',
    },
    ...overrides,
  }
}

const running = (overrides: Partial<Extract<RefreshButtonState, { status: 'running' }>> = {}): RefreshButtonState => ({
  status: 'running',
  phaseLabel: 'Syncing pull requests',
  done: 3,
  total: 11,
  inFlightRepos: [],
  errorCount: 0,
  ...overrides,
})

const idle: RefreshButtonState = { status: 'idle' }

describe.sequential('Refresh button live state', () => {
  afterEach(() => cleanup())

  it('refresh_button_shows_live_label_while_running', () => {
    render(
      <PrCycleTimeDashboard
        data={baseDashboard()}
        onRefresh={() => {}}
        refreshButtonState={running()}
      />,
    )
    const btn = screen.getByRole('button', { name: /Syncing pull requests 3\/11/ })
    expect(btn).toBeInTheDocument()
  })

  it('refresh_button_has_aria_disabled_not_native_disabled_while_running', () => {
    render(
      <PrCycleTimeDashboard
        data={baseDashboard()}
        onRefresh={() => {}}
        refreshButtonState={running()}
      />,
    )
    const btn = screen.getByRole('button', { name: /Syncing pull requests/ })
    expect(btn).toHaveAttribute('aria-disabled', 'true')
    expect(btn).not.toBeDisabled()
  })

  it('refresh_button_shows_errors_suffix_when_error_count_positive', () => {
    render(
      <PrCycleTimeDashboard
        data={baseDashboard()}
        onRefresh={() => {}}
        refreshButtonState={running({ errorCount: 2 })}
      />,
    )
    expect(screen.getByRole('button', { name: /\(2 errors\)/ })).toBeInTheDocument()
  })

  it('refresh_button_shows_in_flight_repos_in_tooltip', () => {
    render(
      <PrCycleTimeDashboard
        data={baseDashboard()}
        onRefresh={() => {}}
        refreshButtonState={running({ inFlightRepos: ['repo-alpha', 'repo-beta'] })}
      />,
    )
    expect(screen.getByText('repo-alpha')).toBeInTheDocument()
    expect(screen.getByText('repo-beta')).toBeInTheDocument()
  })

  it('refresh_button_reverts_to_refresh_label_when_idle', () => {
    render(
      <PrCycleTimeDashboard
        data={baseDashboard()}
        onRefresh={() => {}}
        refreshButtonState={idle}
      />,
    )
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
  })

  it('refresh_button_no_aria_disabled_when_idle', () => {
    render(
      <PrCycleTimeDashboard
        data={baseDashboard()}
        onRefresh={() => {}}
        refreshButtonState={idle}
      />,
    )
    const btn = screen.getByRole('button', { name: 'Refresh' })
    expect(btn).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('refresh_button_scanning_phase_label', () => {
    render(
      <PrCycleTimeDashboard
        data={baseDashboard()}
        onRefresh={() => {}}
        refreshButtonState={running({ phaseLabel: 'Scanning repositories…', done: 0, total: 5 })}
      />,
    )
    expect(screen.getByRole('button', { name: /Scanning repositories/ })).toBeInTheDocument()
  })
})
