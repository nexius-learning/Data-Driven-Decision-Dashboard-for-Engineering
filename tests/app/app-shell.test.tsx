import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'

import type { PrCycleTimeDashboard } from '~/metrics/pr-cycle-time-dashboard'
import { routeTree } from '../../src/routeTree.gen'

const mockDashboard: PrCycleTimeDashboard = {
  range: { from: '2026-01-01T00:00:00.000Z', to: '2026-05-14T23:59:59.999Z', weeks: 8 },
  metric: {
    medianHours: null,
    previousMedianHours: null,
    mergedPrCount: 0,
    trendPercent: null,
    baselineStatus: 'pending',
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
    reposScanned: 0,
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

describe('app shell', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders_app_title', async () => {
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const router = createRouter({ routeTree, history })
    await router.load()
    render(<RouterProvider router={router} />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Engineering Decision Dashboard' })).toBeInTheDocument()
    })
  })
})
