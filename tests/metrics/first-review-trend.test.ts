import { describe, expect, it } from 'vitest'
import {
  compareFirstReviewPeriods,
  getFirstReviewComparisonWeeklyTrend,
  getFirstReviewWeeklyTrend,
  type PrAggregate,
} from '~/metrics/first-review-time'

function agg(overrides: Partial<PrAggregate>): PrAggregate {
  return {
    prId: `pr-${Math.random()}`,
    prNumber: 1,
    title: 't',
    repoId: 'r-1',
    repoFullName: 'o/r',
    team: 'T',
    openedAt: overrides.openedAt ?? new Date('2026-03-01T00:00:00Z'),
    mergedAt: overrides.mergedAt ?? new Date('2026-03-02T00:00:00Z'),
    firstQualifyingHumanReviewAt: overrides.firstQualifyingHumanReviewAt ?? null,
    anyQualifyingReviewCount: 1,
    qualifyingHumanReviewCount: 1,
    qualifyingBotReviewCount: 0,
    firstQualifyingReviewIsBot: false,
    preMergeCommentCount: 0,
    mergeWithoutReviewMatchesHygieneRule: false,
  }
}

const RANGE_8W = {
  start: new Date('2026-03-01T00:00:00Z'),
  end: new Date('2026-04-26T00:00:00Z'),
}

function addLocalDays(date: Date, days: number): Date {
  const out = new Date(date)
  out.setDate(out.getDate() + days)
  return out
}

function reviewedPr(mergedAt: Date, hours = 2): PrAggregate {
  return agg({
    openedAt: new Date(mergedAt.getTime() - hours * 60 * 60 * 1000),
    mergedAt,
    firstQualifyingHumanReviewAt: mergedAt,
  })
}

describe('first-review weekly trend and period comparison', () => {
  it('first_review_weekly_trend_renders_null_weeks', () => {
    const out = getFirstReviewWeeklyTrend([], RANGE_8W, 8)
    expect(out).toHaveLength(8)
    expect(out.every((p) => p.medianHours === null)).toBe(true)
  })

  it('trend_gate_three_qualifying_human_prs', () => {
    const out = compareFirstReviewPeriods({
      currentMedian: 5,
      previousMedian: 4,
      previousQualifyingPrCount: 3,
    })
    expect(out.baselineStatus).toBe('available')
    expect(out.trendPercent).not.toBeNull()
  })

  it('trend_gate_two_qualifying_human_prs', () => {
    const out = compareFirstReviewPeriods({
      currentMedian: 5,
      previousMedian: 4,
      previousQualifyingPrCount: 2,
    })
    expect(out.baselineStatus).toBe('pending')
    expect(out.trendPercent).toBeNull()
  })

  it('trend_percent_null_when_previous_median_zero', () => {
    const out = compareFirstReviewPeriods({
      currentMedian: 5,
      previousMedian: 0,
      previousQualifyingPrCount: 5,
    })
    expect(out.trendPercent).toBeNull()
  })

  it('trend_bucketed_into_weeks_with_data', () => {
    const out = getFirstReviewWeeklyTrend(
      [
        agg({
          openedAt: new Date('2026-03-02T00:00:00Z'),
          mergedAt: new Date('2026-03-03T00:00:00Z'),
          firstQualifyingHumanReviewAt: new Date('2026-03-02T02:00:00Z'),
        }),
      ],
      RANGE_8W,
      8,
    )
    const nonNull = out.filter((p) => p.medianHours !== null)
    expect(nonNull).toHaveLength(1)
    expect(nonNull[0].medianHours).toBe(2)
  })

  it('first_review_comparison_returns_previous_then_current_points', () => {
    const previous = {
      start: new Date('2026-01-01T00:00:00Z'),
      end: new Date('2026-01-29T00:00:00Z'),
    }
    const current = {
      start: new Date(previous.end),
      end: new Date('2026-02-26T00:00:00Z'),
    }
    const out = getFirstReviewComparisonWeeklyTrend({ prs: [], previous, current, weeks: 4 })

    expect(out).toHaveLength(8)
    expect(out.slice(0, 4).every((point) => point.period === 'previous')).toBe(true)
    expect(out.slice(4).every((point) => point.period === 'current')).toBe(true)
  })

  it('first_review_comparison_bucket_index_resets_at_current_period', () => {
    const previous = {
      start: new Date('2026-01-01T00:00:00Z'),
      end: new Date('2026-01-29T00:00:00Z'),
    }
    const current = {
      start: new Date(previous.end),
      end: new Date('2026-02-26T00:00:00Z'),
    }
    const out = getFirstReviewComparisonWeeklyTrend({ prs: [], previous, current, weeks: 4 })

    expect(out.map((point) => point.bucketIndex)).toEqual([1, 2, 3, 4, 1, 2, 3, 4])
  })

  it('first_review_comparison_uses_requested_range_depth', () => {
    const previous = {
      start: new Date('2026-01-01T00:00:00Z'),
      end: new Date('2026-01-15T00:00:00Z'),
    }
    const current = {
      start: new Date(previous.end),
      end: new Date('2026-01-29T00:00:00Z'),
    }

    expect(getFirstReviewComparisonWeeklyTrend({ prs: [], previous, current, weeks: 2 })).toHaveLength(4)
  })

  it('first_review_comparison_internal_boundary_counts_once_in_later_bucket', () => {
    const previous = {
      start: new Date('2026-01-01T00:00:00Z'),
      end: new Date('2026-01-15T00:00:00Z'),
    }
    const current = {
      start: new Date(previous.end),
      end: new Date('2026-01-29T00:00:00Z'),
    }
    const mergedAt = addLocalDays(current.start, 7)
    const out = getFirstReviewComparisonWeeklyTrend({
      prs: [reviewedPr(mergedAt, 3)],
      previous,
      current,
      weeks: 2,
    })

    expect(out[2].medianHours).toBeNull()
    expect(out[3].medianHours).toBe(3)
  })

  it('first_review_comparison_current_from_counts_once_in_current_bucket', () => {
    const previous = {
      start: new Date('2026-01-01T00:00:00Z'),
      end: new Date('2026-01-15T00:00:00Z'),
    }
    const current = {
      start: new Date(previous.end),
      end: new Date('2026-01-29T00:00:00Z'),
    }
    const out = getFirstReviewComparisonWeeklyTrend({
      prs: [reviewedPr(current.start, 4)],
      previous,
      current,
      weeks: 2,
    })

    expect(out[1].medianHours).toBeNull()
    expect(out[2].medianHours).toBe(4)
  })

  it('first_review_comparison_current_to_remains_exclusive', () => {
    const previous = {
      start: new Date('2026-01-01T00:00:00Z'),
      end: new Date('2026-01-15T00:00:00Z'),
    }
    const current = {
      start: new Date(previous.end),
      end: new Date('2026-01-29T00:00:00Z'),
    }
    const out = getFirstReviewComparisonWeeklyTrend({
      prs: [reviewedPr(current.end, 5)],
      previous,
      current,
      weeks: 2,
    })

    expect(out.every((point) => point.medianHours === null)).toBe(true)
  })

  it('first_review_comparison_local_calendar_buckets_remain_contiguous_across_dst', () => {
    const previous = {
      start: new Date('2026-03-01T00:00:00'),
      end: new Date('2026-03-22T00:00:00'),
    }
    const current = {
      start: new Date(previous.end),
      end: new Date('2026-04-12T00:00:00'),
    }
    const out = getFirstReviewComparisonWeeklyTrend({ prs: [], previous, current, weeks: 3 })

    expect(out[0].bucketEnd).toBe(out[1].bucketStart)
    expect(out[2].bucketEnd).toBe(out[3].bucketStart)
    expect(out[4].bucketEnd).toBe(out[5].bucketStart)
    expect(out[5].bucketStart).toBe(addLocalDays(current.start, 14).toISOString())
    expect(out[5].bucketEnd).toBe(current.end.toISOString())
  })

  it('first_review_comparison_final_bucket_absorbs_local_day_remainder', () => {
    const previous = {
      start: new Date('2026-01-01T00:00:00'),
      end: new Date('2026-01-16T00:00:00'),
    }
    const current = {
      start: new Date(previous.end),
      end: new Date('2026-01-31T00:00:00'),
    }
    const previousRemainder = addLocalDays(previous.start, 14)
    const currentRemainder = addLocalDays(current.start, 14)
    const out = getFirstReviewComparisonWeeklyTrend({
      prs: [reviewedPr(previousRemainder, 6), reviewedPr(currentRemainder, 8)],
      previous,
      current,
      weeks: 2,
    })

    expect(out[1].bucketEnd).toBe(previous.end.toISOString())
    expect(out[1].medianHours).toBe(6)
    expect(out[3].bucketEnd).toBe(current.end.toISOString())
    expect(out[3].medianHours).toBe(8)
  })

  it('first_review_comparison_null_buckets_remain_null', () => {
    const previous = {
      start: new Date('2026-01-01T00:00:00Z'),
      end: new Date('2026-01-15T00:00:00Z'),
    }
    const current = {
      start: new Date(previous.end),
      end: new Date('2026-01-29T00:00:00Z'),
    }

    expect(
      getFirstReviewComparisonWeeklyTrend({ prs: [], previous, current, weeks: 2 }).every(
        (point) => point.medianHours === null,
      ),
    ).toBe(true)
  })

  it('first_review_weekly_trend_is_current_half_projection', () => {
    const current = {
      start: new Date('2026-01-15T00:00:00Z'),
      end: new Date('2026-01-29T00:00:00Z'),
    }
    const previous = {
      start: addLocalDays(current.start, -14),
      end: new Date(current.start),
    }
    const prs = [reviewedPr(addLocalDays(current.start, 7), 9)]
    const comparison = getFirstReviewComparisonWeeklyTrend({ prs, previous, current, weeks: 2 })

    expect(getFirstReviewWeeklyTrend(prs, current, 2)).toEqual(
      comparison.slice(2).map((point) => ({
        weekStart: point.bucketLabel,
        medianHours: point.medianHours,
      })),
    )
  })
})
