# Feature Brief: PR Cycle Time 16-Week Comparison Trend

## Problem

Users cannot easily reconcile the Median PR Cycle Time card's current-versus-previous 8-week comparison with the trend chart because the chart only shows the current 8 weeks.

## Goal

Make the chart explain the card comparison by showing both the previous 8-week period and the current 8-week period in one chronological 16-week trend.

## Users & Context

Engineering leaders use the one-page dashboard to understand whether PR cycle time is improving or worsening. The confusion appears when the previous-period median is very small, such as `0.164h`, while the visible current-period weekly chart shows larger but still reasonable values.

## Core Flow

1. User opens the dashboard.
2. User reads the Median PR Cycle Time card and sees the current median, percent change, and previous-period median reference.
3. User scrolls to the PR Cycle Time trend chart.
4. The chart shows the previous 8 dashboard buckets first and the current 8 dashboard buckets second.
5. The previous 8-week segment uses the same muted color as the previous-median reference on the card.
6. The current 8-week segment uses the existing primary chart color.
7. User can visually connect the previous-median reference to the previous 8 weeks on the chart.

## In Scope

- Change the PR Cycle Time trend chart from current 8 weeks to chronological 16 weeks.
- Include exactly the previous 8 dashboard buckets followed by exactly the current 8 dashboard buckets.
- Use the same current and previous date boundaries as the Median PR Cycle Time card comparison.
- Treat these as rolling dashboard buckets anchored to `getDashboardDateRanges`, not ISO weeks or completed calendar weeks.
- Preserve the dashboard's local-day inclusive range semantics even when that makes the final bucket in each period longer than seven 24-hour days.
- Color the previous 8-week segment with the existing previous-reference muted color, `#6b7280`.
- Keep the current 8-week segment in the existing primary chart color, `#111827`, with the current/latest accent behavior preserved where applicable.
- Add a clear divider and period labels between the previous and current 8-week periods.
- Use a non-color visual distinction for the previous segment, such as a dashed path, in addition to the muted color.
- Update title and explanatory copy so users understand the chart now contains both periods.
- Keep null weeks as gaps.
- Keep metric-card calculations unchanged.
- Keep this change limited to PR Cycle Time first.
- Add tests proving the PR Cycle Time payload and UI expose/render the previous-period chart data.

## Out of Scope

- First Review trend changes, because this should be validated on PR Cycle Time before broadening the pattern.
- PR Size trend changes, because PR Size has separate partial-week and line-count behavior.
- User-controlled date ranges, because the immediate problem is explaining the existing default comparison.
- 24-week or longer trend history, because 16 weeks is the smallest range that fully explains the card's comparison.
- Changing the median or percent-change formula, because the issue is presentation clarity, not calculation correctness.
- Treating empty weeks as zero, because the dashboard already uses gaps for no-data weeks.

## Key Decisions

- Use a 16-week chronological chart instead of an overlaid comparison chart, because the user wants to see the actual timeline that produced the card comparison.
- Color the first 8 weeks with `#6b7280`, because that is the existing color of the previous-median reference shown beside the card trend.
- Start with PR Cycle Time only, because this is the metric with the verified confusion and it avoids unnecessary shared-chart blast radius.
- Reuse the existing median calculation, but build PR Cycle Time-specific comparison bucketing that preserves the dashboard range boundaries.
- Keep one chart rather than adding a second chart, because the dashboard should remain a compact one-page scrolling view.
- Do not draw a connecting line across the previous/current boundary, because the divider represents a period comparison boundary, not an ordinary adjacent-week transition.
- Apply the current/latest accent only to the latest non-null point inside the current 8-bucket segment. Previous-period points must never receive the current/latest accent.
- Show only selected x-axis labels visually to avoid crowding: previous start, divider boundary, current start if distinct from the divider label, and current end. All 16 buckets must remain available in the accessible list.

## Data Contract

- Keep `range.weeks` as `8`, because the metric card and comparison label still describe the current dashboard window.
- Add a PR Cycle Time-only chart payload instead of changing the shared meaning of the existing 8-point `weeklyTrend` contract for all consumers.
- The chart payload must expose 16 ordered points with at least:
  - `period`: `previous` or `current`
  - `bucketIndex`: 1 through 8 within that period
  - `bucketStart`
  - `bucketEnd`
  - `medianHours`
- Points 1-8 must be the previous comparison period; points 9-16 must be the current comparison period.
- The previous-period buckets must partition `[previous.from, current.from)`.
- The current-period buckets must partition `[current.from, current.to]`.
- Within each 8-bucket period, buckets 1-7 are standard 7-local-day half-open buckets.
- Bucket 8 of the previous period ends at `current.from` and may be longer than seven 24-hour days because it must cover the full card comparison range.
- Bucket 8 of the current period ends at `current.to` and may be longer than seven 24-hour days because it must cover the full card comparison range.
- Buckets 1-15 use half-open intervals: include `bucketStart`, exclude `bucketEnd`.
- Bucket 16 uses a closed end: include PRs merged exactly at `current.to`.
- Boundary handling must match the card's merged-PR filtering: include PRs merged exactly at `previous.from`, exactly at `current.from`, and exactly at `current.to`; do not double-count a PR at the previous/current boundary or any internal bucket boundary.
- The implementation must not silently drop the local end day from either period in order to force exactly seven 24-hour days per bucket.
- The existing single-period `weeklyTrend` may remain for compatibility, but the new chart must not infer period semantics from array length alone.

## Acceptance Criteria

- The PR Cycle Time trend section title communicates `16-week` and `previous + current 8 weeks`.
- The how-to-read copy explains that the muted/dashed first segment is the previous 8-week comparison period and maps to the previous median shown on the card.
- When the previous baseline is pending or unavailable, the copy explains that the previous segment is shown for context and does not represent an available comparison baseline.
- The chart renders 16 buckets in chronological order with a visible previous/current divider.
- Previous-period points and path use `#6b7280` and a non-color distinction such as a dashed path.
- Current-period points and path use the existing primary chart color `#111827`.
- The latest accent color is used only for the latest non-null current-period point.
- The previous and current segments are not connected by a line across the divider.
- Null buckets render as gaps, not zeroes.
- The card's `medianHours`, `previousMedianHours`, `trendPercent`, `baselineStatus`, and merged PR count remain unchanged for the same fixture data.
- First Review remains an 8-week duration chart.
- PR Size remains line-mode with its completed-week plus optional current-partial behavior unchanged.
- The SVG `aria-label` identifies the chart as a 16-week PR Cycle Time comparison trend.
- The screen-reader list includes all 16 buckets and identifies each bucket as previous or current.
- The visible UI does not rely on color alone to distinguish previous from current.
- Desktop and mobile browser verification proves labels, point values, divider labels, and period labels do not overlap incoherently.
- `git diff --check`, relevant metric/component tests, and the phase verification path chosen by the implementation plan pass before completion. The implementation plan should name the exact commands.

## Edge Cases & Constraints

- Previous period has no merged PRs: render previous-period weeks as gaps and keep the card in baseline-pending behavior.
- Previous period has fewer than 3 merged PRs: render available weekly points, keep the trend comparison gated as it is today, and explain that the previous segment is context rather than an available baseline.
- Previous median is tiny: display the previous reference as a human duration in the card and chart support text rather than relying on decimal hours alone.
- Current period has no merged PRs: render the current segment as gaps, keep the existing no-data card state, and label the chart so previous-period history cannot be mistaken for current performance.
- Mixed minute/hour-scale values must keep the dynamic duration axis readable and must not collapse real non-zero values to `0.0`.
- The shared chart renderer is used by PR Cycle Time, First Review, and PR Size, so the implementation must opt PR Cycle Time into the 16-week behavior without changing other charts.
- Mobile labels must remain legible with 16 points; use selected visible x-axis labels while keeping all points accessible.

## Open Questions

- None.

## Future Iterations

- Extend the same comparison-history pattern to First Review if the PR Cycle Time version proves clearer.
- Add tooltip or hover details for exact weekly medians and PR counts.
- Add a compact range selector only if users later need history beyond the card comparison window.

## Recommendation

Build this as a focused PR Cycle Time clarity improvement before broadening it. The hardest part is not the data; it is preserving chart readability with 16 points while making the previous-period segment unmistakably connected to the card's previous median. Do not compromise the color relationship: previous 8 weeks should use the same muted reference color as the previous median.

Implementation note: the shipped first iteration keeps the visible x-axis intentionally sparse: previous start, the shared previous/current boundary, and current end. The screen-reader list carries all 16 bucket labels.
