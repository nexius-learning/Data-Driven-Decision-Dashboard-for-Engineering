import type { FirstReview } from '~/metrics/pr-cycle-time-dashboard'
import { FirstReviewCard } from './FirstReviewCard'
import { FirstReviewExceptionsPanel } from './FirstReviewExceptionsPanel'
import { FirstReviewTeamTable } from './FirstReviewTeamTable'
import { FirstReviewTrendChart } from './FirstReviewTrendChart'

type Props = {
  firstReview: FirstReview | undefined
  activeTeam?: string
}

/** Renders the First Review Time section, or nothing when firstReview data is absent. */
export function FirstReviewSection({ firstReview, activeTeam }: Props) {
  if (firstReview === undefined) return null
  return (
    <section
      className="pr-dashboard__phase-section"
      data-testid="phase02-section"
      aria-label={`First Review Time with ${firstReview.comparisonWeeklyTrend.length}-week comparison trend`}
    >
      <div className="pr-dashboard__section-header">
        <h2 className="pr-dashboard__section-title">First Review Time</h2>
        <p className="pr-dashboard__section-subtitle">Review latency for merged PRs with submitted reviews</p>
      </div>
      <div data-testid="phase02-row-1" className="phase02-row-1 pr-dashboard__section-grid">
        <FirstReviewCard metric={firstReview.metric} />
        <FirstReviewExceptionsPanel
          exceptions={firstReview.exceptions}
          teamBreakdown={firstReview.teamBreakdown}
        />
      </div>
      <div data-testid="phase02-row-2" className="phase02-row-2 pr-dashboard__section-grid">
        <FirstReviewTrendChart
          weeklyTrend={firstReview.weeklyTrend}
          comparisonWeeklyTrend={firstReview.comparisonWeeklyTrend}
          metric={firstReview.metric}
        />
        <FirstReviewTeamTable rows={firstReview.teamBreakdown} activeTeam={activeTeam} />
      </div>
    </section>
  )
}
