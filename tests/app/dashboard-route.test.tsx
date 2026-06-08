import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'

import type { PrCycleTimeDashboard } from '~/metrics/pr-cycle-time-dashboard'
import { getDashboardData } from '../../src/server/dashboard-functions'
import { routeTree } from '../../src/routeTree.gen'

const mockDashboard: PrCycleTimeDashboard = {
  range: { from: '2026-01-01T00:00:00.000Z', to: '2026-05-14T23:59:59.999Z', weeks: 8 },
  metric: {
    medianHours: 12,
    previousMedianHours: null,
    mergedPrCount: 2,
    trendPercent: null,
    baselineStatus: 'pending',
  },
  exceptions: [],
  weeklyTrend: Array.from({ length: 8 }, (_, i) => ({
    weekStart: `2026-0${1 + i}-01`,
    medianHours: null,
  })),
  comparisonWeeklyTrend: [],
  teamBreakdown: [],
  freshness: {
    reposScanned: 1,
    prMetadataSyncedAt: null,
    prsMissingJiraKey: 0,
    syncErrors: 0,
    latestSyncStatus: 'never_run',
  },
}

const refreshSummary = {
  reposScanned: 0,
  reposIncluded: 0,
  reposExcluded: 0,
  prsSeen: 0,
  prsMerged: 0,
  prsMissingJiraKey: 0,
  syncErrors: 0,
  syncWarnings: 0,
  status: 'success' as const,
}

const { useServerFnMock } = vi.hoisted(() => ({
  useServerFnMock: vi.fn((_fn: unknown) => {
    void _fn
    return () => Promise.resolve({ ok: true, summary: refreshSummary })
  }),
}))

vi.mock('../../src/server/dashboard-functions', () => ({
  getDashboardData: vi.fn(async () => mockDashboard),
  loadDashboardPayload: vi.fn(async () => mockDashboard),
  refreshLocalDataFn: vi.fn(),
}))

vi.mock('@tanstack/react-start', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-start')>()
  return {
    ...actual,
    useServerFn: (fn: unknown) => useServerFnMock(fn),
  }
})

describe('dashboard route', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    useServerFnMock.mockImplementation((_fn: unknown) => {
      void _fn
      return () => Promise.resolve({ ok: true, summary: refreshSummary })
    })
  })

  it('team_param_is_passed_to_getDashboardData', async () => {
    const history = createMemoryHistory({ initialEntries: ['/?team=Frontend'] })
    const router = createRouter({ routeTree, history })
    await router.load()
    render(<RouterProvider router={router} />)
    await waitFor(() => {
      expect(vi.mocked(getDashboardData)).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ team: 'Frontend' }) }),
      )
    })
  })

  it('no_team_param_calls_getDashboardData_without_team', async () => {
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const router = createRouter({ routeTree, history })
    await router.load()
    render(<RouterProvider router={router} />)
    await waitFor(() => {
      expect(vi.mocked(getDashboardData)).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ team: expect.any(String) }) }),
      )
    })
  })

  it('team_and_weeks_params_are_both_passed_to_getDashboardData', async () => {
    const history = createMemoryHistory({ initialEntries: ['/?team=Backend&weeks=4'] })
    const router = createRouter({ routeTree, history })
    await router.load()
    render(<RouterProvider router={router} />)
    await waitFor(() => {
      expect(vi.mocked(getDashboardData)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ team: 'Backend', weeks: 4 }),
        }),
      )
    })
  })

  it('unknown_team_param_renders_dashboard_without_error', async () => {
    const history = createMemoryHistory({ initialEntries: ['/?team=NonExistent'] })
    const router = createRouter({ routeTree, history })
    await router.load()
    render(<RouterProvider router={router} />)
    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull()
      expect(screen.getByTestId('median-pr-cycle-time')).toBeInTheDocument()
    })
  })

  it('route_renders_dashboard_data', async () => {
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const router = createRouter({ routeTree, history })
    await router.load()
    render(<RouterProvider router={router} />)
    await waitFor(() => {
      expect(screen.getByTestId('median-pr-cycle-time')).toHaveTextContent('12h')
    })
  })

  it('refresh_button_updates_dashboard', async () => {
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const router = createRouter({ routeTree, history })
    const invalidate = vi.spyOn(router, 'invalidate').mockResolvedValue(undefined as never)
    await router.load()
    render(<RouterProvider router={router} />)
    await screen.findByRole('button', { name: 'Refresh' })
    screen.getByRole('button', { name: 'Refresh' }).click()
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalled()
    })
  })

  it('team_filter_dropdown_shows_active_team_from_url', async () => {
    vi.mocked(getDashboardData).mockImplementationOnce(async () => ({
      ...mockDashboard,
      teamBreakdown: [
        { team: 'Frontend', mergedPrs: 2, medianHours: 10, previousMedianHours: null, trendPercent: null, longestOpenPrHours: null },
      ],
    }))
    const history = createMemoryHistory({ initialEntries: ['/?team=Frontend'] })
    const router = createRouter({ routeTree, history })
    await router.load()
    render(<RouterProvider router={router} />)
    await waitFor(() => {
      const select = screen.getByRole('combobox', { name: 'Filter by team' }) as HTMLSelectElement
      expect(select.value).toBe('Frontend')
    })
  })

  it('team_filter_dropdown_navigates_to_team_url_on_selection', async () => {
    const frontendDashboard = {
      ...mockDashboard,
      teamBreakdown: [
        { team: 'Frontend', mergedPrs: 2, medianHours: 10, previousMedianHours: null, trendPercent: null, longestOpenPrHours: null },
      ],
    }
    vi.mocked(getDashboardData).mockResolvedValue(frontendDashboard as typeof mockDashboard)
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const router = createRouter({ routeTree, history })
    await router.load()
    render(<RouterProvider router={router} />)
    await screen.findByRole('combobox', { name: 'Filter by team' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by team' }), { target: { value: 'Frontend' } })
    await waitFor(() => {
      expect(vi.mocked(getDashboardData)).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ team: 'Frontend' }) }),
      )
    })
  })

  it('team_filter_dropdown_clears_team_param_when_all_teams_selected', async () => {
    vi.mocked(getDashboardData).mockImplementationOnce(async () => ({
      ...mockDashboard,
      teamBreakdown: [
        { team: 'Frontend', mergedPrs: 2, medianHours: 10, previousMedianHours: null, trendPercent: null, longestOpenPrHours: null },
      ],
    }))
    const history = createMemoryHistory({ initialEntries: ['/?team=Frontend'] })
    const router = createRouter({ routeTree, history })
    await router.load()
    render(<RouterProvider router={router} />)
    await screen.findByRole('combobox', { name: 'Filter by team' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by team' }), { target: { value: '' } })
    await waitFor(() => {
      const lastCall = vi.mocked(getDashboardData).mock.lastCall?.[0] as { data?: { team?: string } } | undefined
      expect(lastCall?.data?.team).toBeUndefined()
      expect(vi.mocked(getDashboardData).mock.calls.length).toBeGreaterThan(1)
    })
  })

  it('route_shows_refresh_error', async () => {
    useServerFnMock.mockImplementationOnce((_fn: unknown) => {
      void _fn
      return () =>
        Promise.resolve({
          ok: false,
          message: 'GitHub rate limit exceeded',
        } as never)
    })
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const router = createRouter({ routeTree, history })
    await router.load()
    render(<RouterProvider router={router} />)
    await screen.findByRole('button', { name: 'Refresh' })
    screen.getByRole('button', { name: 'Refresh' }).click()
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('GitHub rate limit exceeded')
    })
  })
})
