import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'

import type {
  FirstReview,
  PrCycleTimeDashboard as PrCycleTimeDashboardData,
  PrSize,
} from '~/metrics/pr-cycle-time-dashboard'
import { PrCycleTimeDashboard } from '~/components/dashboard/PrCycleTimeDashboard'
import { PrSizeSection } from '~/components/dashboard/PrSizeSection'

afterEach(cleanup)

function prSize(overrides: Partial<PrSize> = {}): PrSize {
  return {
    metric: {
      medianLines: 312,
      medianChangedFiles: 5,
      previousMedianLines: 260,
      trendPercent: 20,
      baselineStatus: 'available',
      qualifyingPrCount: 10,
    },
    exceptions: [],
    weeklyTrend: Array.from({ length: 8 }, (_, i) => ({
      weekStart: `2026-0${1 + i}-01`,
      medianLines: i % 2 === 0 ? 200 : null,
      measuredPrCount: i % 2 === 0 ? 2 : 0,
      isPartialWeek: false,
    })),
    teamBreakdown: [],
    ...overrides,
  }
}

function firstReview(): FirstReview {
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
  }
}

function dashboard(overrides: Partial<PrCycleTimeDashboardData> = {}): PrCycleTimeDashboardData {
  const weeklyTrend = Array.from({ length: 8 }, (_, i) => ({
    weekStart: `2026-0${1 + i}-01`,
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
    comparisonWeeklyTrend: [],
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
    firstReview: firstReview(),
    prSize: prSize(),
    ...overrides,
  }
}

describe('PrSizeSection', () => {
  it('section_hidden_when_prSize_undefined', () => {
    const { container } = render(<PrSizeSection prSize={undefined} />)
    expect(container.firstChild).toBeNull()
  })

  it('section_renders_when_prSize_provided', () => {
    render(<PrSizeSection prSize={prSize()} />)
    const section = screen.getByTestId('phase03-section')
    expect(section).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'PR Size' })).toBeTruthy()
    expect(within(section).getByTestId('pr-size-card')).toBeTruthy()
    expect(within(section).getByTestId('pr-size-trend')).toBeTruthy()
    expect(within(section).getByTestId('pr-size-team-table')).toBeTruthy()
  })

  it('section_shows_baseline_pending_state', () => {
    render(
      <PrSizeSection
        prSize={prSize({
          metric: {
            medianLines: 100,
            medianChangedFiles: 3,
            previousMedianLines: null,
            trendPercent: null,
            baselineStatus: 'pending',
            qualifyingPrCount: 2,
          },
        })}
      />,
    )
    expect(screen.getByTestId('phase03-section')).toBeTruthy()
    expect(screen.getByText('Baseline pending')).toBeTruthy()
    expect(screen.getByTestId('pr-size-trend')).toBeTruthy()
  })

  it('phase01_section_still_renders', () => {
    render(<PrCycleTimeDashboard data={dashboard()} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Median PR Cycle Time' })).toBeTruthy()
    expect(screen.getByTestId('phase03-section')).toBeTruthy()
  })

  it('phase02_section_still_renders', () => {
    render(<PrCycleTimeDashboard data={dashboard()} />)
    expect(screen.getByTestId('phase02-section')).toBeTruthy()
    expect(screen.getByTestId('phase03-section')).toBeTruthy()
  })
})
