import type { FirstReviewTeamRow } from '~/metrics/pr-cycle-time-dashboard'
import { CardHowToRead } from '~/components/dashboard/card-how-to-read'
import { formatCycleDuration } from '~/components/dashboard/format-cycle-duration'
import { TeamLabel } from '~/components/dashboard/team-label'
import { TrendComparison } from '~/components/dashboard/trend-comparison'

type Props = {
  rows: FirstReviewTeamRow[]
  activeTeam?: string
}

/** Formats a nullable hours value as a human-readable duration or "—". */
function fmtHours(h: number | null): string {
  return h === null ? '—' : formatCycleDuration(h)
}

/** Renders a table of per-team first review time metrics with trend indicators. */
export function FirstReviewTeamTable({ rows, activeTeam }: Props) {
  return (
    <section className="pr-dashboard__card" data-testid="first-review-team-table" aria-label="Review team breakdown">
      <h3 className="pr-dashboard__card-title">Review team breakdown</h3>
      <CardHowToRead>
        Per-team median first review time and trend versus the previous 8 weeks, based on merged PRs from review-synced
        repositories.
      </CardHowToRead>
      <div className="pr-dashboard__table-wrap">
        <table className="pr-dashboard__table" aria-label="Review team breakdown">
          <thead>
            <tr>
              <th scope="col">Team</th>
              <th scope="col">Reviewed PRs</th>
              <th scope="col">First Review</th>
              <th scope="col">Review Trend</th>
              <th scope="col">No-review Merges</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} data-testid="first-review-team-empty">
                  No team data in range
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.team} className={activeTeam === r.team ? 'pr-dashboard__team-row--active' : undefined}>
                  <td>
                    <TeamLabel team={r.team} dotClassName={teamDotClass(r, rows)} />
                  </td>
                  <td className="pr-dashboard__num">{r.reviewedPrs}</td>
                  <td className={medianCellClass(r, rows)}>{fmtHours(r.medianHours)}</td>
                  <td>
                    <TrendComparison
                      trendPercent={r.trendPercent}
                      previousMedianHours={r.previousMedianHours}
                      baselinePendingLabel={r.reviewedPrs > 0 ? '— baseline pending' : '—'}
                    />
                  </td>
                  <td className="pr-dashboard__num">{formatNoReviewMerges(r.noReviewMergeCount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/** Returns the largest positive trend percentage across the given team rows. */
function maxPositiveTeamTrend(rows: FirstReviewTeamRow[]): number {
  return rows.reduce((max, row) => Math.max(max, row.trendPercent && row.trendPercent > 0 ? row.trendPercent : 0), 0)
}

/** Returns the CSS class for the team status dot based on trend direction and relative magnitude. */
function teamDotClass(row: FirstReviewTeamRow, rows: FirstReviewTeamRow[]): string {
  const maxPos = maxPositiveTeamTrend(rows)
  if (row.trendPercent != null && row.trendPercent > 0) {
    return row.trendPercent === maxPos
      ? 'pr-dashboard__team-dot pr-dashboard__team-dot--warn'
      : 'pr-dashboard__team-dot pr-dashboard__team-dot--caution'
  }
  if (row.trendPercent != null && row.trendPercent < 0) {
    return 'pr-dashboard__team-dot pr-dashboard__team-dot--good'
  }
  return 'pr-dashboard__team-dot pr-dashboard__team-dot--muted'
}

/** Returns the CSS class for the median cell based on trend direction. */
function medianCellClass(row: FirstReviewTeamRow, rows: FirstReviewTeamRow[]): string {
  const maxPos = maxPositiveTeamTrend(rows)
  if (row.medianHours == null) return 'pr-dashboard__num'
  if (row.trendPercent != null && row.trendPercent < 0) return 'pr-dashboard__num pr-dashboard__median--good'
  if (row.trendPercent != null && row.trendPercent > 0 && row.trendPercent === maxPos) {
    return 'pr-dashboard__num pr-dashboard__median--warn'
  }
  return 'pr-dashboard__num'
}

/** Formats a no-review merge count as a labelled string, or "—" when null. */
function formatNoReviewMerges(n: number | null): string {
  if (n === null) return '—'
  return `${n} no-review merge${n === 1 ? '' : 's'}`
}
