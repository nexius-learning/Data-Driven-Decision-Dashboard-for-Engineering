import { CardHowToRead } from '~/components/dashboard/card-how-to-read'
import {
  formatDurationHoursForChart,
  selectDurationUnit,
} from '~/components/dashboard/duration-trend-scale'
import { WeeklyTrendChart } from '~/components/dashboard/weekly-trend-chart'
import type { FirstReviewMetric } from '~/metrics/pr-cycle-time-dashboard'
import type { FirstReviewComparisonPoint } from '~/metrics/first-review-time'

type Point = { weekStart: string; medianHours: number | null }

type Props = {
  weeklyTrend: Point[]
  comparisonWeeklyTrend: FirstReviewComparisonPoint[]
  metric: FirstReviewMetric
}

export function FirstReviewTrendChart({ weeklyTrend, comparisonWeeklyTrend }: Props) {
  const durationValues = comparisonWeeklyTrend
    .map((p) => p.medianHours)
    .filter((value): value is number => value != null && Number.isFinite(value))
  const durationUnit = selectDurationUnit(durationValues.length > 0 ? Math.max(...durationValues) : null)
  const periodWeeks = comparisonWeeklyTrend.length / 2
  const title = `${comparisonWeeklyTrend.length}-week First Review comparison trend`

  return (
    <section className="pr-dashboard__card" data-testid="first-review-trend" aria-label={title}>
      <h3 className="pr-dashboard__card-title">{title}</h3>
      <CardHowToRead>
        This {comparisonWeeklyTrend.length}-week chart shows the previous {periodWeeks}-week segment followed by the
        current {periodWeeks}-week segment. The muted dashed segment is the previous comparison period, the dark
        segment is the current dashboard period, and gaps mean no qualifying human-reviewed PRs in that bucket.
      </CardHowToRead>
      <WeeklyTrendChart
        valueMode="duration"
        weeklyTrend={weeklyTrend}
        comparisonTrend={comparisonWeeklyTrend}
        ariaLabel={title}
      />
      <ol data-testid="first-review-weekly-trend-list" className="pr-dashboard__sr-only">
        {comparisonWeeklyTrend.map((p) => (
          <li key={`${p.period}-${p.bucketIndex}`}>
            <span>{p.period}</span> <span>{p.bucketLabel}</span>:{' '}
            <span>{p.medianHours === null ? '—' : formatDurationHoursForChart(p.medianHours, durationUnit)}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
