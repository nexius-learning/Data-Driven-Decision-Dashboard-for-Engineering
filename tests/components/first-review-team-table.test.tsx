import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import type { FirstReviewTeamRow } from '~/metrics/pr-cycle-time-dashboard'
import { FirstReviewTeamTable } from '~/components/dashboard/FirstReviewTeamTable'

afterEach(cleanup)

function row(o: Partial<FirstReviewTeamRow>): FirstReviewTeamRow {
  return {
    team: o.team ?? 'T',
    reviewedPrs: o.reviewedPrs ?? 0,
    medianHours: o.medianHours === undefined ? null : o.medianHours,
    previousMedianHours: o.previousMedianHours === undefined ? null : o.previousMedianHours,
    trendPercent: o.trendPercent === undefined ? null : o.trendPercent,
    noReviewMergeCount: o.noReviewMergeCount === undefined ? null : o.noReviewMergeCount,
  }
}

describe('FirstReviewTeamTable', () => {
  it('phase_02_team_column', () => {
    render(<FirstReviewTeamTable rows={[row({})]} />)
    expect(screen.getByText('Team')).toBeTruthy()
    expect(screen.getByText('Reviewed PRs')).toBeTruthy()
    expect(screen.getByText('First Review')).toBeTruthy()
    expect(screen.getByText('Review Trend')).toBeTruthy()
    expect(screen.getByText('No-review Merges')).toBeTruthy()
  })

  it('phase_02_team_table_includes_teams_with_only_bot_reviews_with_em_dash', () => {
    render(
      <FirstReviewTeamTable
        rows={[row({ team: 'BotOnly', medianHours: null, trendPercent: null, noReviewMergeCount: null })]}
      />,
    )
    const cells = screen.getAllByText('—')
    expect(cells.length).toBeGreaterThanOrEqual(3)
  })

  it('phase_02_team_table_no_review_merges_renders_em_dash_not_zero_when_no_hygiene_match', () => {
    const { container } = render(
      <FirstReviewTeamTable rows={[row({ medianHours: 5, trendPercent: 10, noReviewMergeCount: null })]} />,
    )
    expect(container.textContent).not.toMatch(/\b0\b/)
  })

  it('first_review_team_table_renders_empty_state_when_no_team_rows', () => {
    render(<FirstReviewTeamTable rows={[]} />)
    expect(screen.getByTestId('first-review-team-empty')).toBeTruthy()
    expect(screen.getByText('No team data in range')).toBeTruthy()
  })

  it('phase02_dashboard_components_have_accessible_aria_labels_and_table_scope_headers', () => {
    const { container } = render(<FirstReviewTeamTable rows={[row({})]} />)
    const ths = container.querySelectorAll('th[scope="col"]')
    expect(ths.length).toBe(5)
    const tbl = container.querySelector('table')
    expect(tbl?.getAttribute('aria-label')).toBe('Review team breakdown')
  })

  it('first_review_team_table_uses_dashboard_table_classes', () => {
    const { container } = render(
      <FirstReviewTeamTable
        rows={[
          row({
            team: 'Chat',
            reviewedPrs: 82,
            medianHours: 8,
            previousMedianHours: 4,
            trendPercent: 100,
            noReviewMergeCount: null,
          }),
        ]}
      />,
    )
    expect(container.querySelector('.pr-dashboard__card .pr-dashboard__table')).toBeTruthy()
    expect(screen.getByText('82')).toBeTruthy()
    expect(screen.getByText('↑ +100%')).toBeTruthy()
    expect(screen.getByText('(4h)')).toBeTruthy()
  })

  it('unassigned_team_gets_attention_marker_and_mapping_comment', () => {
    const { container } = render(<FirstReviewTeamTable rows={[row({ team: 'Unassigned' })]} />)
    expect(container.querySelector('.pr-dashboard__team-dot--unassigned')).toBeTruthy()
    expect(screen.getByText('needs team mapping')).toBeTruthy()
  })
})
