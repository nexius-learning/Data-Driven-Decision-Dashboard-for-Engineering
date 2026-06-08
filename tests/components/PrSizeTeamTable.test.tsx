import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import type { PrSizeTeamRow } from '~/metrics/pr-cycle-time-dashboard'
import { PrSizeTeamTable } from '~/components/dashboard/PrSizeTeamTable'

afterEach(cleanup)

function row(o: Partial<PrSizeTeamRow> = {}): PrSizeTeamRow {
  return {
    team: o.team ?? 'Platform',
    prCount: o.prCount ?? 4,
    medianLines: o.medianLines === undefined ? 200 : o.medianLines,
    medianChangedFiles: o.medianChangedFiles === undefined ? 7 : o.medianChangedFiles,
    previousMedianLines: o.previousMedianLines === undefined ? 150 : o.previousMedianLines,
    trendPercent: o.trendPercent === undefined ? 33.3 : o.trendPercent,
    trend: o.trend ?? '↑',
    largestPrTitle: o.largestPrTitle ?? 'Big refactor',
    largestPrRepo: o.largestPrRepo ?? 'org/repo',
    largestPrUrl: o.largestPrUrl ?? 'https://github.com/org/repo/pull/1',
    largestPrLines: o.largestPrLines ?? 800,
  }
}

describe('PrSizeTeamTable', () => {
  it('renders_all_columns', () => {
    render(<PrSizeTeamTable rows={[row()]} />)
    expect(screen.getByText('Team')).toBeTruthy()
    expect(screen.getByText('Merged PRs')).toBeTruthy()
    expect(screen.getByText('Median Size')).toBeTruthy()
    expect(screen.getByText('Median Files')).toBeTruthy()
    expect(screen.getByText('Size Trend')).toBeTruthy()
    expect(screen.getByText('Platform')).toBeTruthy()
    expect(screen.getByText('4')).toBeTruthy()
    expect(screen.getByText('200 lines')).toBeTruthy()
    expect(screen.getByText('7')).toBeTruthy()
  })

  it('trend_arrows_rendered_correctly', () => {
    render(
      <PrSizeTeamTable
        rows={[
          row({ team: 'Up', trendPercent: 20, previousMedianLines: 100 }),
          row({ team: 'Down', trendPercent: -15, previousMedianLines: 100 }),
          row({ team: 'Flat', trendPercent: 5, previousMedianLines: 100 }),
          row({ team: 'Dash', trendPercent: null, previousMedianLines: null }),
        ]}
      />,
    )
    expect(screen.getByText(/\+20%/)).toBeTruthy()
    expect(screen.getByText(/-15%/)).toBeTruthy()
    expect(screen.getByText(/\+5%/)).toBeTruthy()
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1)
  })

  it('no_author_names_in_output', () => {
    const { container } = render(
      <PrSizeTeamTable
        rows={[
          row({
            largestPrTitle: 'Fix login',
            largestPrRepo: 'org/app',
          }),
        ]}
      />,
    )
    expect(container.textContent).not.toMatch(/author/i)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('no_largest_pr_column_in_table', () => {
    render(<PrSizeTeamTable rows={[row()]} />)
    expect(screen.queryByText('Largest PR')).toBeNull()
  })

  it('active_team_row_gets_highlight_class', () => {
    const { container } = render(
      <PrSizeTeamTable
        rows={[row({ team: 'Backend' }), row({ team: 'Frontend' })]}
        activeTeam="Backend"
      />,
    )
    const rows = container.querySelectorAll('tbody tr')
    expect(rows[0].classList.contains('pr-dashboard__team-row--active')).toBe(true)
    expect(rows[1].classList.contains('pr-dashboard__team-row--active')).toBe(false)
  })

  it('no_highlight_when_activeTeam_is_undefined', () => {
    const { container } = render(
      <PrSizeTeamTable rows={[row({ team: 'Backend' }), row({ team: 'Frontend' })]} />,
    )
    const rows = container.querySelectorAll('tbody tr')
    expect(rows[0].classList.contains('pr-dashboard__team-row--active')).toBe(false)
    expect(rows[1].classList.contains('pr-dashboard__team-row--active')).toBe(false)
  })

  it('all_rows_remain_visible_when_activeTeam_is_set', () => {
    render(
      <PrSizeTeamTable
        rows={[row({ team: 'Backend' }), row({ team: 'Frontend' }), row({ team: 'Platform' })]}
        activeTeam="Backend"
      />,
    )
    expect(screen.getByText('Backend')).toBeTruthy()
    expect(screen.getByText('Frontend')).toBeTruthy()
    expect(screen.getByText('Platform')).toBeTruthy()
  })
})
