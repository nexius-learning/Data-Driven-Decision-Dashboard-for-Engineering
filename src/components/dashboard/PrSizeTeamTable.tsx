import type { PrSizeTeamRow } from '~/metrics/pr-cycle-time-dashboard'
import { CardHowToRead } from '~/components/dashboard/card-how-to-read'
import { TeamLabel } from '~/components/dashboard/team-label'
import { TrendComparison } from '~/components/dashboard/trend-comparison'

type Props = {
  rows: PrSizeTeamRow[]
}

function formatMedianLines(lines: number | null): string {
  if (lines === null) return '—'
  return `${lines} lines`
}

function formatMedianFiles(files: number | null): string {
  if (files === null) return '—'
  return String(files)
}

function formatPreviousMedianLines(lines: number | null): string {
  if (lines === null) return '—'
  return `${lines} lines`
}

export function PrSizeTeamTable({ rows }: Props) {
  return (
    <section
      className="pr-dashboard__card"
      data-testid="pr-size-team-table"
      aria-label="Size team breakdown"
    >
      <h3 className="pr-dashboard__card-title">Size team breakdown</h3>
      <CardHowToRead>
        Per-team median changed lines, median changed files, and size trend versus the previous 8 weeks, based on
        merged PRs with collected size data.
      </CardHowToRead>
      <div className="pr-dashboard__table-wrap">
        <table className="pr-dashboard__table" aria-label="Size team breakdown">
          <thead>
            <tr>
              <th scope="col">Team</th>
              <th scope="col">Merged PRs</th>
              <th scope="col">Median Size</th>
              <th scope="col">Median Files</th>
              <th scope="col">Size Trend</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} data-testid="pr-size-team-empty">
                  No team data in range
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.team}>
                  <td>
                    <TeamLabel team={r.team} dotClassName={teamDotClass(r, rows)} />
                  </td>
                  <td className="pr-dashboard__num">{r.prCount}</td>
                  <td className={medianCellClass(r, rows)}>{formatMedianLines(r.medianLines)}</td>
                  <td className="pr-dashboard__num">{formatMedianFiles(r.medianChangedFiles)}</td>
                  <td>
                    <TrendComparison
                      trendPercent={r.trendPercent}
                      previousMedianHours={r.previousMedianLines}
                      formatPreviousMedian={formatPreviousMedianLines}
                      baselinePendingLabel="—"
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function maxPositiveTeamTrend(rows: PrSizeTeamRow[]): number {
  return rows.reduce(
    (max, row) => Math.max(max, row.trendPercent && row.trendPercent > 0 ? row.trendPercent : 0),
    0,
  )
}

function teamDotClass(row: PrSizeTeamRow, rows: PrSizeTeamRow[]): string {
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

function medianCellClass(row: PrSizeTeamRow, rows: PrSizeTeamRow[]): string {
  const maxPos = maxPositiveTeamTrend(rows)
  if (row.medianLines == null) return 'pr-dashboard__num'
  if (row.trendPercent != null && row.trendPercent < 0) {
    return 'pr-dashboard__num pr-dashboard__median--good'
  }
  if (row.trendPercent != null && row.trendPercent > 0 && row.trendPercent === maxPos) {
    return 'pr-dashboard__num pr-dashboard__median--warn'
  }
  return 'pr-dashboard__num'
}
