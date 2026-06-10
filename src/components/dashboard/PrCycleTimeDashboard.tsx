import type { ReactNode } from 'react'

import type {
  PrCycleTimeDashboard as DashboardModel,
  PrCycleTimeException,
} from '~/metrics/pr-cycle-time-dashboard'

import { CardHowToRead } from '~/components/dashboard/card-how-to-read'
import { DashboardSourceLink } from '~/components/dashboard/dashboard-source-link'
import {
  formatDurationHoursForChart,
  selectDurationUnit,
} from '~/components/dashboard/duration-trend-scale'
import { formatCycleDuration, formatDurationHumanDays } from '~/components/dashboard/format-cycle-duration'
import { TrendComparison } from '~/components/dashboard/trend-comparison'
import { DASHBOARD_SOURCE_PATHS } from '~/metrics/dashboard-source-paths'
import { WeeklyTrendChart } from '~/components/dashboard/weekly-trend-chart'
import { FirstReviewSection } from '~/components/dashboard/FirstReviewSection'
import { PrSizeSection } from '~/components/dashboard/PrSizeSection'
import { TeamLabel } from '~/components/dashboard/team-label'

import './PrCycleTimeDashboard.css'

export type PrCycleTimeDashboardProps = {
  data: DashboardModel
  onRefresh?: () => void | Promise<void>
  refreshing?: boolean
  refreshError?: string | null
  activeTeam?: string
  onTeamSelect?: (team: string | undefined) => void
}

/** Formats a trend percentage with a sign prefix, or "—" when the value is absent. */
function formatTrendPercent(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return '—'
  }
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(0)}%`
}

/** Selects hours or days as the display unit based on the maximum median in the trend series. */
function selectedDurationUnitForTrend(weeklyTrend: Array<{ medianHours: number | null }>) {
  const values = weeklyTrend
    .map((p) => p.medianHours)
    .filter((value): value is number => value != null && Number.isFinite(value))
  return selectDurationUnit(values.length > 0 ? Math.max(...values) : null)
}

/** Formats a duration in hours for use in exception descriptions. */
function formatExceptionHours(hours: number | null | undefined): string {
  if (hours == null || Number.isNaN(hours)) {
    return '—'
  }
  if (hours < 1) {
    return `${(Math.round(hours * 1000) / 1000).toString()}h`
  }
  return `${(Math.round(hours * 10) / 10).toString()}h`
}

/** Returns a human-relative label ("just now", "5 min ago", etc.) for an ISO timestamp. */
function formatSyncedAgo(iso: string | null, nowMs: number): string {
  if (!iso) return 'never'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return 'never'
  const m = Math.floor((nowMs - t) / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} hr ago`
  const d = Math.floor(h / 24)
  return `${d} day${d === 1 ? '' : 's'} ago`
}

type TeamRow = DashboardModel['teamBreakdown'][number]

/** Returns the highest worsening trend percent among all team breakdown rows. */
function maxPositiveTeamTrend(teams: TeamRow[]): number {
  let m = 0
  for (const r of teams) {
    if (r.trendPercent != null && r.trendPercent > 0) {
      m = Math.max(m, r.trendPercent)
    }
  }
  return m
}

/** Returns the CSS class for a team status dot based on trend direction and worst-team flag. */
function teamDotClass(row: TeamRow, teams: TeamRow[]): string {
  const maxPos = maxPositiveTeamTrend(teams)
  if (row.trendPercent == null && row.mergedPrs > 0) {
    return 'pr-dashboard__team-dot pr-dashboard__team-dot--muted'
  }
  if (row.trendPercent != null && row.trendPercent > 0) {
    if (maxPos > 0 && row.trendPercent === maxPos) {
      return 'pr-dashboard__team-dot pr-dashboard__team-dot--warn'
    }
    return 'pr-dashboard__team-dot pr-dashboard__team-dot--caution'
  }
  if (row.trendPercent != null && row.trendPercent < 0) {
    return 'pr-dashboard__team-dot pr-dashboard__team-dot--good'
  }
  return 'pr-dashboard__team-dot pr-dashboard__team-dot--muted'
}

/** Returns the CSS class for the median cell based on trend direction and worst-team status. */
function medianCellClass(row: TeamRow, teams: TeamRow[]): string {
  if (row.medianHours == null) return 'pr-dashboard__num'
  const maxPos = maxPositiveTeamTrend(teams)
  if (row.trendPercent != null && row.trendPercent < 0) {
    return 'pr-dashboard__num pr-dashboard__median--good'
  }
  if (row.trendPercent != null && row.trendPercent > 0 && maxPos > 0 && row.trendPercent === maxPos) {
    return 'pr-dashboard__num pr-dashboard__median--warn'
  }
  return 'pr-dashboard__num'
}

/** Renders a TrendComparison cell for a team breakdown row. */
function trendCell(row: TeamRow): ReactNode {
  return (
    <TrendComparison
      trendPercent={row.trendPercent}
      previousMedianHours={row.previousMedianHours}
      baselinePendingLabel={row.mergedPrs > 0 ? '— baseline pending' : '—'}
    />
  )
}

/** Returns a short display title for a PR cycle time exception. */
function exceptionTitle(e: PrCycleTimeException): string {
  switch (e.type) {
    case 'team_worsened':
      return `${e.team} worsened`
    case 'long_open_prs':
      return `${e.team} stale open PRs`
    case 'baseline_pending':
      return `${e.team} baseline pending`
    default:
      return e.team
  }
}

/** Returns a metric snippet string for a PR cycle time exception. */
function exceptionMetric(e: PrCycleTimeException, teams: TeamRow[]): string {
  switch (e.type) {
    case 'team_worsened': {
      const r = teams.find((x) => x.team === e.team)
      if (r?.medianHours == null) return '—'
      return `${formatExceptionHours(r.medianHours)} median`
    }
    case 'long_open_prs':
      if (e.count == null) return 'PRs older than team median'
      if (e.staleThresholdHours != null) {
        return `${e.count} ${e.count === 1 ? 'PR' : 'PRs'} older than ${formatExceptionHours(e.staleThresholdHours)}`
      }
      if (e.teamMedianHours == null) {
        return `${e.count} ${e.count === 1 ? 'PR' : 'PRs'} older than team median`
      }
      return `${e.count} ${e.count === 1 ? 'PR' : 'PRs'} older than ${formatExceptionHours(e.teamMedianHours)} team median`
    case 'baseline_pending':
      return 'Not enough prior-period data'
    default:
      return e.message
  }
}

/** Returns an actionable recommendation string for a PR cycle time exception. */
function exceptionRecommendation(e: PrCycleTimeException): string {
  switch (e.type) {
    case 'team_worsened':
      return 'Compare against previous-period cycle time'
    case 'long_open_prs':
      return 'Unblock, split, or close stale work before it inflates cycle time.'
    case 'baseline_pending':
      return 'Collect one more weekly refresh'
    default:
      return e.message
  }
}

function staleOpenPrDetails(e: PrCycleTimeException): ReactNode {
  if (e.type !== 'long_open_prs' || !e.prDetails || e.prDetails.length === 0) return null
  return (
    <ul className="pr-dashboard__stale-pr-details">
      {e.prDetails.map((pr) => {
        const title = `#${pr.prNumber} ${pr.title}`
        return (
          <li key={`${pr.repo}-${pr.prNumber}`} className="pr-dashboard__stale-pr-row">
            <div className="pr-dashboard__stale-pr-main">
              {pr.url ? (
                <a className="pr-dashboard__stale-pr-title" href={pr.url}>
                  {title}
                </a>
              ) : (
                <span className="pr-dashboard__stale-pr-title">{title}</span>
              )}
              <span className="pr-dashboard__stale-pr-repo">{pr.repo}</span>
            </div>
            <span className="pr-dashboard__stale-pr-age">{formatDurationHumanDays(pr.ageHours)} open</span>
          </li>
        )
      })}
    </ul>
  )
}

/** Renders a coloured trend indicator badge for team_worsened exceptions. */
function exceptionTrendSnippet(e: PrCycleTimeException, teams: TeamRow[]): ReactNode {
  if (e.type !== 'team_worsened') return null
  const tr = teams.find((x) => x.team === e.team)?.trendPercent
  if (tr == null) return null
  const up = tr > 0
  return (
    <span
      className={`pr-dashboard__exception-trend ${up ? 'pr-dashboard__exception-trend--warn' : 'pr-dashboard__trend-cell--good'}`}
    >
      {up ? '↑' : '↓'} {formatTrendPercent(tr)}
    </span>
  )
}

/** Top-level dashboard component rendering all metric sections, the team-filter toolbar, and the freshness footer. */
export function PrCycleTimeDashboard({
  data,
  onRefresh,
  refreshing = false,
  refreshError = null,
  activeTeam,
  onTeamSelect,
}: PrCycleTimeDashboardProps) {
  const nowMs = Date.now()
  const noRepos = data.freshness.reposScanned === 0
  const noMerged = !noRepos && data.metric.mergedPrCount === 0
  const baselinePending = data.metric.baselineStatus === 'pending'
  const syncFailed = data.freshness.latestSyncStatus === 'failed'
  const syncPartial = data.freshness.latestSyncStatus === 'partial'
  const weeklyTrendDurationUnit = selectedDurationUnitForTrend(data.comparisonWeeklyTrend)
  const comparisonWeeks = data.range.weeks * 2

  const metricTrendBlock = (() => {
    if (noRepos || noMerged) return null
    const tp = data.metric.trendPercent
    if (baselinePending || tp == null) {
      return (
        <div className="pr-dashboard__metric-trend pr-dashboard__metric-trend--neutral">
          <span className="pr-dashboard__metric-trend-pct">—</span>
          <span className="pr-dashboard__metric-trend-sub">vs previous {data.range.weeks} weeks</span>
        </div>
      )
    }
    return (
      <div className="pr-dashboard__metric-trend-wrap">
        <TrendComparison
          size="metric"
          trendPercent={tp}
          previousMedianHours={data.metric.previousMedianHours}
        />
        <span className="pr-dashboard__metric-trend-sub">vs previous {data.range.weeks} weeks</span>
      </div>
    )
  })()

  return (
    <div className="pr-dashboard">
      <div className="pr-dashboard__inner">
        <header className="pr-dashboard__header">
          <div className="pr-dashboard__header-row">
            <div className="pr-dashboard__brand">
              <h1 className="pr-dashboard__title">Engineering Decision Dashboard</h1>
              <p className="pr-dashboard__subtitle">Local-first engineering metrics</p>
            </div>
            <div className="pr-dashboard__header-center">
              <nav className="pr-dashboard__nav" aria-label="Primary">
                <span className="pr-dashboard__nav-tab pr-dashboard__nav-tab--active">Overview</span>
              </nav>
            </div>
            <div className="pr-dashboard__header-right">
              <div className="pr-dashboard__toolbar">
                <select
                  aria-label="Filter by team"
                  className="pr-dashboard__pill pr-dashboard__team-select"
                  value={activeTeam ?? ''}
                  onChange={(e) => onTeamSelect?.(e.target.value || undefined)}
                >
                  <option value="">All Teams</option>
                  {data.allTeams.map((team) => (
                    <option key={team} value={team}>
                      {team}
                    </option>
                  ))}
                </select>
                <span className="pr-dashboard__pill" aria-current="date">
                  <IconCalendar className="pr-dashboard__pill-icon" />
                  Last {data.range.weeks} weeks
                  <IconChevronDown className="pr-dashboard__pill-chevron" />
                </span>
                <span className="pr-dashboard__pill">
                  <IconDatabase className="pr-dashboard__pill-icon" />
                  Local data
                  <span className="pr-dashboard__pill-dot" aria-hidden="true" />
                </span>
                {onRefresh ? (
                  <button
                    type="button"
                    className="pr-dashboard__btn-refresh"
                    onClick={() => void onRefresh()}
                    disabled={refreshing}
                  >
                    <IconRefresh />
                    {refreshing ? 'Refreshing…' : 'Refresh'}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </header>

        {refreshError ? (
          <div className="pr-dashboard__error" role="alert">
            {refreshError}
            <button type="button" onClick={() => void onRefresh?.()}>
              Retry
            </button>
          </div>
        ) : null}
      </div>

      <div className="pr-dashboard__grid">
        <section aria-labelledby="metric-heading" className="pr-dashboard__card pr-dashboard__metric">
          <h2 id="metric-heading" className="pr-dashboard__card-title">
            Median PR Cycle Time
          </h2>
          <p className="pr-dashboard__metric-sub">PR opened to PR merged</p>
          <CardHowToRead>
            Elapsed time from when a pull request is opened until it is merged, shown in hours or days. A high
            median often means reviews start late or PRs sit idle. A very low median (for example under about 7
            minutes) can mean merges happen with little or no review.
          </CardHowToRead>
          <div className="pr-dashboard__metric-row">
            <div className="pr-dashboard__metric-value" data-testid="median-pr-cycle-time">
              {noRepos ? (
                <span>No repositories discovered</span>
              ) : noMerged ? (
                <span>No merged PRs in range</span>
              ) : (
                <span>{formatCycleDuration(data.metric.medianHours)}</span>
              )}
            </div>
            {metricTrendBlock}
          </div>
          {baselinePending && !noRepos && !noMerged ? (
            <p className="pr-dashboard__baseline">Baseline pending</p>
          ) : null}
          {syncFailed ? <p className="pr-dashboard__sync-failed">Sync failed</p> : null}
          {!noRepos && !noMerged ? (
            <div className="pr-dashboard__metric-footer">
              <IconMergeBranch />
              <DashboardSourceLink href={DASHBOARD_SOURCE_PATHS.mergedPrs}>
                {data.metric.mergedPrCount} merged PR{data.metric.mergedPrCount === 1 ? '' : 's'} analyzed
              </DashboardSourceLink>
            </div>
          ) : null}
        </section>

        <section aria-labelledby="exceptions-heading" className="pr-dashboard__card">
          <h2 id="exceptions-heading" className="pr-dashboard__card-title">
            PR cycle time exceptions
          </h2>
          <CardHowToRead>
            Teams that may need attention in this range: cycle time regressed by at least 25%, open PRs older than
            the team median, or not enough prior-period merges to compare trends. Up to three exceptions are shown.
          </CardHowToRead>
          {data.exceptions.length === 0 ? (
            <p className="pr-dashboard__exception-empty">None in this range</p>
          ) : (
            <ul className="pr-dashboard__exception-list">
              {data.exceptions.map((e) => (
                <li key={`${e.type}-${e.team}-${e.message}`} className="pr-dashboard__exception-row">
                  {e.severity === 'warning' ? (
                    <IconWarning className="pr-dashboard__exception-icon" />
                  ) : (
                    <IconInfo className="pr-dashboard__exception-icon" />
                  )}
                  <div className="pr-dashboard__exception-body">
                    <div className="pr-dashboard__exception-title-row">
                      <span className="pr-dashboard__exception-title">{exceptionTitle(e)}</span>
                      <span className="pr-dashboard__exception-metric">{exceptionMetric(e, data.teamBreakdown)}</span>
                      {exceptionTrendSnippet(e, data.teamBreakdown)}
                    </div>
                    <p className="pr-dashboard__exception-recommendation">{exceptionRecommendation(e)}</p>
                    {staleOpenPrDetails(e)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="trend-heading" className="pr-dashboard__card">
          <h2 id="trend-heading" className="pr-dashboard__card-title">
            {comparisonWeeks}-week PR cycle time comparison trend
          </h2>
          <CardHowToRead>
            Previous {data.range.weeks} weeks followed by current {data.range.weeks} weeks. The muted dashed segment is the previous comparison
            period, the dark segment is the current dashboard period, and gaps mean no merged PRs in that bucket.
          </CardHowToRead>
          {baselinePending && !noRepos && !noMerged ? (
            <p className="pr-dashboard__chart-note">
              Previous-period points are shown for context and this history does not represent an available comparison baseline.
            </p>
          ) : null}
          {noMerged && !noRepos ? (
            <p className="pr-dashboard__chart-note">
              The current period has no merged PRs; previous-period history is context, not current performance.
            </p>
          ) : null}
          <WeeklyTrendChart
            valueMode="duration"
            weeklyTrend={data.weeklyTrend}
            comparisonTrend={data.comparisonWeeklyTrend}
            ariaLabel={`${comparisonWeeks}-week PR cycle time comparison trend`}
          />
          <ol data-testid="weekly-trend-list" className="pr-dashboard__sr-only">
            {data.comparisonWeeklyTrend.map((p) => (
              <li key={`${p.period}-${p.bucketIndex}`}>
                <span>{p.period}</span> <span>{p.bucketLabel}</span>:{' '}
                {p.medianHours === null ? (
                  <span>empty</span>
                ) : (
                  <span>{formatDurationHoursForChart(p.medianHours, weeklyTrendDurationUnit)}</span>
                )}
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="teams-heading" className="pr-dashboard__card">
          <h2 id="teams-heading" className="pr-dashboard__card-title">
            Team breakdown
          </h2>
          <CardHowToRead>
            Per-team median cycle time and trend versus the previous {data.range.weeks} weeks, based on repository
            team mapping. Longest open PR shows the oldest still-open pull request for that team.
          </CardHowToRead>
          <div className="pr-dashboard__table-wrap">
            <table className="pr-dashboard__table" aria-label="Team breakdown">
              <thead>
                <tr>
                  <th>Team</th>
                  <th>Merged PRs</th>
                  <th>Median</th>
                  <th>Trend (vs prev {data.range.weeks} w)</th>
                  <th>Longest Open PR</th>
                </tr>
              </thead>
              <tbody>
                {data.teamBreakdown.map((row) => (
                  <tr key={row.team} className={activeTeam === row.team ? 'pr-dashboard__team-row--active' : undefined}>
                    <td>
                      <TeamLabel team={row.team} dotClassName={teamDotClass(row, data.teamBreakdown)} />
                    </td>
                    <td className="pr-dashboard__num">{row.mergedPrs}</td>
                    <td className={medianCellClass(row, data.teamBreakdown)}>{formatCycleDuration(row.medianHours)}</td>
                    <td>{trendCell(row)}</td>
                    <td className="pr-dashboard__num">
                      {row.longestOpenPrHours === null ? '—' : formatDurationHumanDays(row.longestOpenPrHours)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <FirstReviewSection firstReview={data.firstReview} activeTeam={activeTeam} />

        <PrSizeSection prSize={data.prSize} activeTeam={activeTeam} />

      </div>

      <footer className="pr-dashboard__freshness" data-testid="data-freshness">
        <span className="pr-dashboard__freshness-item">
          <IconRepos />
          <span>
            <DashboardSourceLink href={DASHBOARD_SOURCE_PATHS.repos}>
              <span className="pr-dashboard__freshness-strong">{data.freshness.reposScanned}</span> repos scanned
            </DashboardSourceLink>
          </span>
        </span>
        <span className="pr-dashboard__freshness-item">
          <IconGitHub />
          <span>
            <DashboardSourceLink href={DASHBOARD_SOURCE_PATHS.sync}>
              GitHub PR metadata synced{' '}
              <span className="pr-dashboard__freshness-strong">{formatSyncedAgo(data.freshness.prMetadataSyncedAt, nowMs)}</span>
            </DashboardSourceLink>
          </span>
        </span>
        <span className="pr-dashboard__freshness-item">
          <IconLink />
          <span>
            <span className="pr-dashboard__freshness-strong">{data.freshness.prsMissingJiraKey}</span> PR
            {data.freshness.prsMissingJiraKey === 1 ? '' : 's'} missing Jira key
          </span>
        </span>
        <span className="pr-dashboard__freshness-item">
          {data.freshness.syncErrors === 0 ? <IconCheckCircle /> : <IconAlertSmall />}
          <span>
            {data.freshness.syncErrors > 0 ? (
              <DashboardSourceLink href={DASHBOARD_SOURCE_PATHS.syncErrors}>
                <span className="pr-dashboard__freshness-strong">{data.freshness.syncErrors}</span> sync errors
              </DashboardSourceLink>
            ) : (
              <>
                <span className="pr-dashboard__freshness-strong">{data.freshness.syncErrors}</span> sync errors
              </>
            )}
          </span>
        </span>
        {syncPartial ? <span className="pr-dashboard__partial-note">Partial sync: review sync errors above.</span> : null}
        {data.reviewFreshness ? (
          <span className="pr-dashboard__freshness-item" data-testid="phase02-review-freshness">
            <span>
              Reviews synced{' '}
              <span className="pr-dashboard__freshness-strong">
                {formatSyncedAgo(data.reviewFreshness.oldestReviewSyncAt, nowMs)}
              </span>
            </span>
          </span>
        ) : null}
        {data.reviewMetricsPending ? (
          <span className="pr-dashboard__freshness-item" data-testid="phase02-review-pending">
            <span>{data.reviewMetricsPending.hint}</span>
          </span>
        ) : null}
      </footer>

      <aside className="pr-dashboard__future-guard" aria-hidden="true" />
    </div>
  )
}

function IconCalendar({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M5 1v2M11 1v2M2.5 6h11M3 3h10a1.5 1.5 0 011.5 1.5v8A1.5 1.5 0 0113 14H3a1.5 1.5 0 01-1.5-1.5v-8A1.5 1.5 0 013 3z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconChevronDown({ className }: { className?: string }) {
  return (
    <svg className={className} width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconDatabase({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <ellipse cx="8" cy="4" rx="5" ry="2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3 4v4c0 1.1 2.2 2 5 2s5-.9 5-2V4" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3 8v4c0 1.1 2.2 2 5 2s5-.9 5-2V8" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

function IconRefresh() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M13.5 8A5.5 5.5 0 008 2.5V1M2.5 8A5.5 5.5 0 008 13.5V15M15 5l-2-2M1 11l2 2"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconMergeBranch() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="5" cy="5" r="2.2" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="5" cy="13" r="2.2" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="13" cy="9" r="2.2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M7 5h4a2 2 0 012 2v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M7 13H9a2 2 0 002-2V9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function IconWarning({ className }: { className?: string }) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="M11 4L3 18h16L11 4z" stroke="#d97706" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M11 9v4M11 16h.01" stroke="#d97706" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function IconInfo({ className }: { className?: string }) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="8" stroke="#9ca3af" strokeWidth="1.4" />
      <path d="M11 10v5M11 7h.01" stroke="#9ca3af" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function IconRepos() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="2.5" y="5" width="6" height="10" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="9.5" y="3" width="6" height="12" rx="1" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

function IconGitHub() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        fill="currentColor"
        d="M9 1.2C4.8 1.2 1.4 4.6 1.4 8.8c0 3.7 2.4 6.8 5.7 7.9.4.1.6-.2.6-.4v-1.5c-2.3.5-2.8-1-2.8-1-.4-.9-.9-1.1-.9-1.1-.7-.5.1-.5.1-.5.8.1 1.2.8 1.2.8.7 1.2 1.8.9 2.2.7.1-.5.3-.9.5-1.1-1.8-.2-3.7-.9-3.7-4 0-.9.3-1.6.8-2.2-.1-.2-.4-1 .1-2 0 0 .7-.2 2.2.8.6-.2 1.3-.3 2-.3s1.4.1 2 .3c1.5-1 2.2-.8 2.2-.8.4 1 .1 1.8.1 2 .5.6.8 1.3.8 2.2 0 3.1-1.9 3.8-3.7 4 .3.3.6.8.6 1.6v2.4c0 .2.2.5.6.4 3.3-1.1 5.7-4.2 5.7-7.9C16.6 4.6 13.2 1.2 9 1.2z"
      />
    </svg>
  )
}

function IconLink() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M7.5 10.5l-2 2a2.5 2.5 0 01-3.5-3.5l2-2M10.5 7.5l2-2a2.5 2.5 0 013.5 3.5l-2 2M6.5 11.5l5-5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconCheckCircle() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="7" stroke="#22c55e" strokeWidth="1.2" />
      <path d="M5.5 9l2.2 2.2L12.5 6.5" stroke="#22c55e" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconAlertSmall() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="7" stroke="#d97706" strokeWidth="1.2" />
      <path d="M9 5v5M9 12h.01" stroke="#d97706" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}
