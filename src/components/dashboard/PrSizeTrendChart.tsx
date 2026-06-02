import { CardHowToRead } from '~/components/dashboard/card-how-to-read'
import {
  buildCompletedLowSampleConfidenceCopy,
  buildCurrentPartialConfidenceCopy,
  findCompletedLowSamplePoint,
  formatMedianLines,
  measuredPrLabel,
  type PrSizeTrendPoint,
} from '~/components/dashboard/pr-size-trend-confidence'
import { WeeklyTrendChart } from '~/components/dashboard/weekly-trend-chart'
import type { DetachedLinesPoint } from '~/components/dashboard/weekly-trend-chart'

type Point = PrSizeTrendPoint

type Props = {
  weeklyTrend: Point[]
}

function shortDetachedAxisLabel(weekStart: string): string {
  const d = new Date(`${weekStart}T12:00:00.000Z`)
  if (Number.isNaN(d.getTime())) return `${weekStart} so far`
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()} so far`
}

function completedWeekLabel(count: number): string {
  return `${count} completed ${count === 1 ? 'week' : 'weeks'}`
}

function buildSrListItemText(p: Point, isPartial: boolean): string {
  const median = p.medianLines === null ? 'no median' : formatMedianLines(p.medianLines)
  const measured = measuredPrLabel(p.measuredPrCount)
  if (isPartial) {
    const confidence = buildCurrentPartialConfidenceCopy(p)
    return `${p.weekStart}, ${median}, ${measured}, current week so far, ${confidence}`
  }
  if (p.measuredPrCount >= 1 && p.measuredPrCount <= 2) {
    return `${p.weekStart}, ${median}, ${measured}, ${buildCompletedLowSampleConfidenceCopy(p)}`
  }
  return `${p.weekStart}, ${median}, ${measured}`
}

export function PrSizeTrendChart({ weeklyTrend }: Props) {
  const completed = weeklyTrend.filter((p) => !p.isPartialWeek)
  const currentPartial = weeklyTrend.find((p) => p.isPartialWeek)
  const completedCount = completed.length

  const detachedPoint: DetachedLinesPoint | undefined =
    currentPartial != null &&
    currentPartial.measuredPrCount > 0 &&
    currentPartial.medianLines !== null
      ? {
          weekStart: currentPartial.weekStart,
          medianLines: currentPartial.medianLines,
          label: shortDetachedAxisLabel(currentPartial.weekStart),
          ariaLabel: `Current week so far: ${formatMedianLines(currentPartial.medianLines)}, ${measuredPrLabel(currentPartial.measuredPrCount)}`,
        }
      : undefined

  const comparisonPeriodWeeks = completedCount >= 2 && completedCount % 2 === 0 ? completedCount / 2 : null
  const title = `${completedCount}-week PR Size comparison trend`

  const confidenceCopy =
    currentPartial != null && currentPartial.measuredPrCount > 0
      ? buildCurrentPartialConfidenceCopy(currentPartial)
      : (() => {
          const lowSample = findCompletedLowSamplePoint(completed)
          return lowSample ? buildCompletedLowSampleConfidenceCopy(lowSample) : null
        })()

  const hasLowSampleConfidence =
    confidenceCopy != null &&
    (currentPartial != null && currentPartial.measuredPrCount > 0
      ? currentPartial.measuredPrCount < 3
      : true)
  const confidenceClassName = [
    'pr-dashboard__chart-confidence',
    hasLowSampleConfidence ? 'pr-dashboard__chart-confidence--low-sample' : null,
  ]
    .filter(Boolean)
    .join(' ')

  const chartWeeklyTrend = completed.map((p) => ({
    weekStart: p.weekStart,
    medianLines: p.medianLines,
  }))

  return (
    <section className="pr-dashboard__card" data-testid="pr-size-trend" aria-label={title}>
      <h3 className="pr-dashboard__card-title">{title}</h3>
      <CardHowToRead>
        {comparisonPeriodWeeks == null
          ? `Weekly median lines changed (additions plus deletions) for PRs merged in each week. Weeks with no qualifying PRs appear as gaps.`
          : `This ${completedCount}-week chart shows the previous ${completedWeekLabel(comparisonPeriodWeeks)} followed by the latest ${completedWeekLabel(comparisonPeriodWeeks)}. The muted dashed segment is the previous completed period, the dark segment is the latest completed period, and gaps mean no qualifying PRs in that bucket. A detached marker shows the current week so far when measured data exists.`}
      </CardHowToRead>
      <WeeklyTrendChart
        valueMode="lines"
        weeklyTrend={chartWeeklyTrend}
        detachedPoint={detachedPoint}
        {...(comparisonPeriodWeeks == null
          ? {}
          : {
              comparisonPeriodWeeks,
              comparisonLabels: {
                previous: 'Previous',
                current: 'Latest',
              },
            })}
        ariaLabel={title}
        yAxisLabel="Lines"
      />
      {confidenceCopy ? (
        <p className={confidenceClassName} data-testid="pr-size-trend-confidence">
          {confidenceCopy}
        </p>
      ) : null}
      <ol data-testid="pr-size-weekly-trend-list" className="pr-dashboard__sr-only">
        {completed.map((p) => (
          <li key={p.weekStart} data-week-start={p.weekStart}>
            <span className="week">{p.weekStart}</span>
            <span className="median">{p.medianLines === null ? '—' : formatMedianLines(p.medianLines)}</span>
            <span className="measured">{measuredPrLabel(p.measuredPrCount)}</span>
            <span className="detail">{buildSrListItemText(p, false)}</span>
          </li>
        ))}
        {currentPartial != null && currentPartial.measuredPrCount > 0 ? (
          <li key={currentPartial.weekStart} data-week-start={currentPartial.weekStart} data-partial-week>
            <span className="week">{currentPartial.weekStart}</span>
            <span className="median">
              {currentPartial.medianLines === null ? '—' : formatMedianLines(currentPartial.medianLines)}
            </span>
            <span className="measured">{measuredPrLabel(currentPartial.measuredPrCount)}</span>
            <span className="detail">{buildSrListItemText(currentPartial, true)}</span>
          </li>
        ) : null}
      </ol>
    </section>
  )
}
