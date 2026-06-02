import {
  buildDurationAxis,
  durationScaleFor,
  formatScaledDurationChartValue,
  selectDurationUnit,
} from '~/components/dashboard/duration-trend-scale'
import type { DurationScale } from '~/components/dashboard/duration-trend-scale'
import {
  DETACHED_MARKER_RADIUS,
  layoutDetachedMarker,
  WEEKLY_TREND_CHART_VIEWBOX_HEIGHT,
  WEEKLY_TREND_CHART_VIEWBOX_WIDTH,
} from '~/components/dashboard/weekly-trend-chart-layout'

export type WeeklyTrendHoursPoint = { weekStart: string; medianHours: number | null }
export type WeeklyTrendLinesPoint = { weekStart: string; medianLines: number | null }
export type DetachedLinesPoint = {
  weekStart: string
  medianLines: number
  label: string
  ariaLabel: string
}
export type DurationComparisonPoint = {
  period: 'previous' | 'current'
  bucketIndex: number
  bucketStart: string
  bucketEnd: string
  bucketLabel: string
  medianHours: number | null
}
export type WeeklyTrendChartProps =
  | {
      valueMode: 'duration'
      weeklyTrend: WeeklyTrendHoursPoint[]
      comparisonTrend?: DurationComparisonPoint[]
      ariaLabel?: string
      yAxisLabel?: string
    }
  | {
      valueMode: 'lines'
      weeklyTrend: WeeklyTrendLinesPoint[]
      detachedPoint?: DetachedLinesPoint
      comparisonPeriodWeeks?: number
      comparisonLabels?: { previous: string; current: string }
      ariaLabel?: string
      yAxisLabel?: string
    }

type WeeklyTrendPoint = WeeklyTrendHoursPoint | WeeklyTrendLinesPoint | DurationComparisonPoint

const VB_W = WEEKLY_TREND_CHART_VIEWBOX_WIDTH
const VB_H = WEEKLY_TREND_CHART_VIEWBOX_HEIGHT
const PAD_L = 48
const PAD_R = 20
const PAD_T = 32
const PAD_B = 48
const DETACHED_OVERFLOW_MARKER_Y = PAD_T + 10

function shortWeekLabel(weekStart: string): string {
  const d = new Date(`${weekStart}T12:00:00.000Z`)
  if (Number.isNaN(d.getTime())) return weekStart
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(d)
}

function niceStep(rawStep: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const normalized = rawStep / magnitude
  if (normalized <= 1) return magnitude
  if (normalized <= 2) return 2 * magnitude
  if (normalized <= 3) return 3 * magnitude
  if (normalized <= 5) return 5 * magnitude
  return 10 * magnitude
}

function buildLineAxis(maxNumeric: number): { maxValue: number; ticks: number[] } {
  const minTop = 10
  const paddedMax = Math.max(minTop, maxNumeric)
  const step = niceStep(paddedMax / 4)
  const maxValue = Math.ceil(paddedMax / step) * step
  const tickCount = Math.round(maxValue / step) + 1
  return { maxValue, ticks: Array.from({ length: tickCount }, (_, i) => i * step) }
}

// eslint-disable-next-line react-refresh/only-export-components -- Task 3.2 requires this chart selector to be exported.
export function visiblePlainLineAxisLabelIndexes(completedCount: number): number[] {
  if (completedCount <= 8) {
    return Array.from({ length: completedCount }, (_, i) => i)
  }
  return [0, Math.floor((completedCount - 1) / 2), completedCount - 1].filter(
    (value, index, values) => values.indexOf(value) === index,
  )
}

type Pt = { i: number; x: number; y: number; value: number }
type ComparisonPt = Pt & { period: 'previous' | 'current' }

function isLinesPoint(point: WeeklyTrendPoint): point is WeeklyTrendLinesPoint {
  return 'medianLines' in point
}

function isValidComparisonTrend(points: DurationComparisonPoint[]): boolean {
  if (points.length < 2 || points.length % 2 !== 0) return false
  const periodBucketCount = points.length / 2
  return points.every((point, index) => {
    const expectedPeriod = index < periodBucketCount ? 'previous' : 'current'
    return point.period === expectedPeriod && point.bucketIndex === (index % periodBucketCount) + 1
  })
}

function chartValue(point: WeeklyTrendPoint, durationScale: DurationScale): number | null {
  if (isLinesPoint(point)) return point.medianLines
  return point.medianHours == null ? null : durationScale.valueFromHours(point.medianHours)
}

function formatLinesPointLabel(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value)
}

function joinPath(points: Pt[], fromIdx: number, toIdx: number): string {
  let d = ''
  for (let j = fromIdx; j <= toIdx; j++) {
    const p = points[j]!
    d += j === fromIdx ? `M ${p.x} ${p.y}` : ` L ${p.x} ${p.y}`
  }
  return d
}

function contiguousRuns(points: Pt[]): Pt[][] {
  const runs: Pt[][] = []
  for (const point of points) {
    const current = runs.at(-1)
    if (!current || current.at(-1)!.i + 1 !== point.i) {
      runs.push([point])
    } else {
      current.push(point)
    }
  }
  return runs
}

function detachedDiamondPoints(cx: number, cy: number, radius: number): string {
  return `${cx},${cy - radius} ${cx + radius},${cy} ${cx},${cy + radius} ${cx - radius},${cy}`
}

export function WeeklyTrendChart(props: WeeklyTrendChartProps) {
  const linesMode = props.valueMode === 'lines'
  const comparisonTrend =
    !linesMode && props.comparisonTrend && isValidComparisonTrend(props.comparisonTrend)
      ? props.comparisonTrend
      : undefined
  const lineComparisonBucketCount =
    linesMode &&
    props.comparisonPeriodWeeks != null &&
    Number.isInteger(props.comparisonPeriodWeeks) &&
    props.comparisonPeriodWeeks > 0 &&
    props.comparisonPeriodWeeks * 2 === props.weeklyTrend.length
      ? props.comparisonPeriodWeeks
      : undefined
  const comparisonLabels = linesMode ? props.comparisonLabels : undefined
  const hasComparisonPresentation = comparisonTrend != null || lineComparisonBucketCount != null
  const weeklyTrend = comparisonTrend ?? props.weeklyTrend
  const detachedPoint = linesMode ? props.detachedPoint : undefined
  const ariaLabel =
    props.ariaLabel ?? (linesMode ? '8-week PR size trend' : '8-week PR cycle time trend')
  const yAxisLabel = props.yAxisLabel ?? 'Days'

  const seriesSlotCount = weeklyTrend.length
  const slotCount = seriesSlotCount + (detachedPoint ? 1 : 0)
  const innerW = VB_W - PAD_L - PAD_R
  const innerH = VB_H - PAD_T - PAD_B

  const durationHours = linesMode
    ? []
    : weeklyTrend
        .map((p) => ('medianHours' in p ? p.medianHours : null))
        .filter((v): v is number => v != null && Number.isFinite(v))
  const durationScale = durationScaleFor(selectDurationUnit(durationHours.length > 0 ? Math.max(...durationHours) : null))
  const chartValues = weeklyTrend.map((p) => chartValue(p, durationScale))
  const numeric = chartValues.filter((v): v is number => v != null && Number.isFinite(v))
  const detachedNumeric = detachedPoint?.medianLines
  const hasCompletedNumeric = numeric.length > 0
  const lineAxisMax = hasCompletedNumeric
    ? Math.max(...numeric)
    : detachedNumeric != null
      ? detachedNumeric
      : 0
  const { maxValue, ticks: yTicks } = linesMode
    ? buildLineAxis(lineAxisMax)
    : buildDurationAxis(Math.max(...numeric, 0))

  const detachedOverflows =
    linesMode &&
    detachedNumeric != null &&
    hasCompletedNumeric &&
    detachedNumeric > maxValue

  const xAt = (i: number) =>
    PAD_L + (slotCount <= 1 ? innerW / 2 : (i / Math.max(1, slotCount - 1)) * innerW)
  const yAt = (value: number) => PAD_T + (1 - value / maxValue) * innerH

  const pts: Pt[] = []
  for (let i = 0; i < seriesSlotCount; i++) {
    const value = chartValues[i]
    if (value != null && Number.isFinite(value)) {
      pts.push({ i, x: xAt(i), y: yAt(value), value })
    }
  }

  const comparisonPts: ComparisonPt[] =
    !hasComparisonPresentation
      ? []
      : pts.map((p) => ({
          ...p,
          period:
            comparisonTrend?.[p.i]?.period ??
            (p.i < lineComparisonBucketCount! ? 'previous' : 'current'),
        }))
  const latestCurrentPoint = comparisonPts.filter((p) => p.period === 'current').at(-1)
  const plainPts = hasComparisonPresentation ? [] : pts
  const comparisonBucketCount = comparisonTrend ? comparisonTrend.length / 2 : (lineComparisonBucketCount ?? 0)
  const comparisonBoundaryIndex = comparisonBucketCount - 0.5
  const previousLabelX = hasComparisonPresentation ? PAD_L : 0
  const currentLabelX = hasComparisonPresentation ? VB_W - PAD_R : 0
  const comparisonAxisLabelIndexes =
    !hasComparisonPresentation
      ? []
      : [0, comparisonBucketCount, weeklyTrend.length - 1].filter(
          (value, index, values) => values.indexOf(value) === index,
        )
  const plainAxisLabelIndexes =
    !hasComparisonPresentation && linesMode
      ? new Set(visiblePlainLineAxisLabelIndexes(weeklyTrend.length))
      : null

  const pathSegments: Array<{ d: string; stroke: string }> = []
  for (const run of contiguousRuns(plainPts)) {
    if (run.length < 2) continue
    for (let i = 0; i < run.length - 1; i++) {
      pathSegments.push({
        d: joinPath(run, i, i + 1),
        stroke: run[i + 1] === pts.at(-1) ? '#d97706' : '#111827',
      })
    }
  }

  const comparisonPathSegments: Array<{ d: string; period: 'previous' | 'current'; stroke: string; dashed: boolean }> = []
  for (const period of ['previous', 'current'] as const) {
    for (const run of contiguousRuns(comparisonPts.filter((p) => p.period === period))) {
      if (run.length < 2) continue
      for (let i = 0; i < run.length - 1; i++) {
        const segmentEnd = run[i + 1]!
        comparisonPathSegments.push({
          d: joinPath(run, i, i + 1),
          period,
          stroke: period === 'previous' ? '#6b7280' : segmentEnd === latestCurrentPoint ? '#d97706' : '#111827',
          dashed: period === 'previous',
        })
      }
    }
  }

  const formatPointLabel = (value: number) =>
    linesMode ? formatLinesPointLabel(value) : formatScaledDurationChartValue(value, durationScale.unit)
  const formatTickLabel = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1))
  const resolvedYAxisLabel = linesMode ? yAxisLabel : durationScale.axisLabel

  const detachedX = detachedPoint ? xAt(seriesSlotCount) : null
  const detachedPlotY =
    detachedPoint != null && detachedNumeric != null
      ? detachedOverflows
        ? DETACHED_OVERFLOW_MARKER_Y
        : yAt(detachedNumeric)
      : null
  const detachedLayout =
    detachedPoint && detachedX != null && detachedPlotY != null
      ? layoutDetachedMarker({
          markerX: detachedX,
          markerY: detachedPlotY,
          valueLabel: formatLinesPointLabel(detachedPoint.medianLines),
        })
      : null

  return (
    <div className="pr-dashboard__chart-wrap">
      <svg
        className="pr-dashboard__chart-svg"
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={ariaLabel}
      >
        <text x={PAD_L} y={18} fill="#6b7280" fontSize="11" fontWeight="500">
          {resolvedYAxisLabel}
        </text>

        {yTicks.map((t) => {
          const yy = yAt(t)
          return (
            <g key={t}>
              <line x1={PAD_L} y1={yy} x2={VB_W - PAD_R} y2={yy} stroke="#e5e7eb" strokeWidth="1" strokeDasharray="3 4" />
              <text x={PAD_L - 8} y={yy + 4} fill="#9ca3af" fontSize="10" textAnchor="end">
                {formatTickLabel(t)}
              </text>
            </g>
          )
        })}

        {pathSegments.map((segment) => (
          <path
            key={segment.d}
            d={segment.d}
            fill="none"
            stroke={segment.stroke}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {hasComparisonPresentation ? (
          <>
            <line
              data-testid="comparison-boundary-divider"
              x1={xAt(comparisonBoundaryIndex)}
              y1={PAD_T}
              x2={xAt(comparisonBoundaryIndex)}
              y2={PAD_T + innerH}
              stroke="#d1d5db"
              strokeWidth="1"
              strokeDasharray="3 4"
            />
            <text data-testid="comparison-label-previous" x={previousLabelX} y={30} fill="#6b7280" fontSize="10" fontWeight="600" textAnchor="start">
              {comparisonLabels?.previous ?? `Previous ${comparisonBucketCount} weeks`}
            </text>
            <text data-testid="comparison-label-current" x={currentLabelX} y={30} fill="#111827" fontSize="10" fontWeight="600" textAnchor="end">
              {comparisonLabels?.current ?? `Current ${comparisonBucketCount} weeks`}
            </text>
            <g data-period="previous">
              {comparisonPathSegments
                .filter((segment) => segment.period === 'previous')
                .map((segment) => (
                  <path
                    key={segment.d}
                    d={segment.d}
                    fill="none"
                    stroke={segment.stroke}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray={segment.dashed ? '5 4' : undefined}
                  />
                ))}
              {comparisonPts
                .filter((p) => p.period === 'previous')
                .map((p) => (
                  <g key={p.i}>
                    <circle cx={p.x} cy={p.y} r="5" fill="#fff" stroke="#6b7280" strokeWidth="2" />
                    <text x={p.x} y={p.y - 12} fill="#6b7280" fontSize="11" fontWeight="600" textAnchor="middle">
                      {formatPointLabel(p.value)}
                    </text>
                  </g>
                ))}
            </g>
            <g data-period="current">
              {comparisonPathSegments
                .filter((segment) => segment.period === 'current')
                .map((segment) => (
                  <path
                    key={segment.d}
                    d={segment.d}
                    fill="none"
                    stroke={segment.stroke}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
              {comparisonPts
                .filter((p) => p.period === 'current')
                .map((p) => {
                  const isLatest = p === latestCurrentPoint
                  return (
                    <g key={p.i}>
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={isLatest ? 6 : 5}
                        fill="#fff"
                        stroke={isLatest ? '#d97706' : '#111827'}
                        strokeWidth="2"
                      />
                      <text
                        x={p.x}
                        y={p.y - 12}
                        fill={isLatest ? '#d97706' : '#111827'}
                        fontSize="11"
                        fontWeight="600"
                        textAnchor="middle"
                      >
                        {formatPointLabel(p.value)}
                      </text>
                    </g>
                  )
                })}
            </g>
          </>
        ) : null}

        {!hasComparisonPresentation && pts.map((p, idx) => {
          const isLast = idx === pts.length - 1
          return (
            <g key={p.i}>
              <circle
                cx={p.x}
                cy={p.y}
                r={isLast ? 6 : 5}
                fill="#fff"
                stroke={isLast ? '#d97706' : '#111827'}
                strokeWidth="2"
              />
              <text
                x={p.x}
                y={p.y - 12}
                fill={isLast ? '#d97706' : '#111827'}
                fontSize="11"
                fontWeight="600"
                textAnchor="middle"
              >
                {formatPointLabel(p.value)}
              </text>
            </g>
          )
        })}

        {detachedPoint && detachedX != null && detachedPlotY != null && detachedLayout ? (
          <g
            className="pr-dashboard__chart-point--detached"
            data-detached-overflow={detachedOverflows ? 'true' : 'false'}
            data-layout-marker-bounds={`${detachedLayout.markerRect.x},${detachedLayout.markerRect.y},${detachedLayout.markerRect.width},${detachedLayout.markerRect.height}`}
            data-layout-label-bounds={`${detachedLayout.valueLabelRect.x},${detachedLayout.valueLabelRect.y},${detachedLayout.valueLabelRect.width},${detachedLayout.valueLabelRect.height}`}
            aria-label={detachedPoint.ariaLabel}
          >
            <title>{detachedPoint.ariaLabel}</title>
            {detachedOverflows ? (
              <line
                x1={detachedX}
                y1={detachedPlotY + DETACHED_MARKER_RADIUS + 2}
                x2={detachedX}
                y2={PAD_T + innerH}
                stroke="#111827"
                strokeWidth="1.5"
                strokeDasharray="4 3"
              />
            ) : null}
            <polygon
              points={detachedDiamondPoints(detachedX, detachedPlotY, DETACHED_MARKER_RADIUS)}
              fill="#fff"
              stroke="#111827"
              strokeWidth="2"
              strokeDasharray="4 2"
            />
            <text
              x={detachedLayout.valueLabelX}
              y={detachedLayout.valueLabelY}
              fill="#111827"
              fontSize="11"
              fontWeight="600"
              textAnchor={detachedLayout.valueLabelAnchor}
            >
              {formatLinesPointLabel(detachedPoint.medianLines)}
            </text>
          </g>
        ) : null}

        {!hasComparisonPresentation && weeklyTrend.map((p, i) => (
          plainAxisLabelIndexes == null || plainAxisLabelIndexes.has(i) ? (
          <text
            key={'weekStart' in p ? p.weekStart : p.bucketStart}
            x={xAt(i)}
            y={VB_H - 12}
            fill="#6b7280"
            fontSize="10"
            fontWeight="500"
            textAnchor="middle"
          >
            {'weekStart' in p ? shortWeekLabel(p.weekStart) : shortWeekLabel(p.bucketLabel)}
          </text>
          ) : null
        ))}

        {hasComparisonPresentation ? comparisonAxisLabelIndexes.map((i) => {
          const point = weeklyTrend[i]!
          const label = 'weekStart' in point ? point.weekStart : point.bucketLabel
          return (
          <text
            key={label}
            x={xAt(i)}
            y={VB_H - 12}
            fill="#6b7280"
            fontSize="10"
            fontWeight="500"
            textAnchor="middle"
          >
            {shortWeekLabel(label)}
          </text>
          )
        }) : null}

        {detachedPoint && detachedX != null ? (
          <text
            key={`detached-${detachedPoint.weekStart}`}
            x={detachedX}
            y={VB_H - 26}
            fill="#6b7280"
            fontSize="10"
            fontWeight="500"
            textAnchor="end"
          >
            {detachedPoint.label}
          </text>
        ) : null}
      </svg>
    </div>
  )
}
