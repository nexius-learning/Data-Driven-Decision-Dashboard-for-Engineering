# Feature Brief: PR Size Trend Partial-Week Confidence

## Problem
Users can misread the latest PR Size weekly trend point as a completed-week result when it may be based on only a few PRs from the current partial week.

## Goal
The PR Size trend keeps showing the current weekly median, but clearly communicates when the latest point is partial or low-sample so users trust the data without over-interpreting it.

## Users & Context
Engineering leads review the one-page dashboard after a refresh and scan the PR Size trend for large changes. They need to distinguish a real trend from an early current-week signal based on a small number of merged PRs.

## Core Flow
1. The user opens the dashboard and scrolls to PR Size.
2. The PR Size trend shows 8 completed UTC ISO weeks as the main trend line.
3. If the latest week is still in progress, the latest point appears as a separate current-week-so-far point instead of a normal completed-week point.
4. If the latest point is partial or has fewer than 3 measured PRs, the chart shows a concise confidence note with the PR count.
5. The user can still read the median value, but understands that the latest weekly value may change as more PRs merge.

## In Scope
- Extend PR Size weekly trend data to exactly these fields:
  - `weekStart`: `YYYY-MM-DD` UTC date for Monday 00:00:00.000Z of the ISO week.
  - `medianLines`: median `additions + deletions` for measured PRs in that ISO week, or `null` when the week has no measured PRs.
  - `measuredPrCount`: count of PRs merged in that ISO week where both `additions` and `deletions` are non-null; PRs with only null size fields do not count.
  - `isPartialWeek`: `true` only for the UTC ISO week containing `now`; otherwise `false`.
- Keep the existing weekly median calculation unchanged.
- Define the PR Size chart window as 8 completed UTC ISO weeks plus the current partial UTC ISO week as a detached point when that current week has `measuredPrCount > 0`.
- Count only PRs with `mergedAt <= now` in the current partial-week point; future-dated rows in the same UTC ISO week must not contribute to `medianLines` or `measuredPrCount`.
- Clamp all PR Size computations to `mergedAt <= now`, including the retained selected-window Median PR Size card, Size team breakdown, oversized exceptions, and PR Size section no-data/visibility gate.
- Update visible and accessible chart naming so the surface cannot imply that a ninth current-week-so-far point is a completed week; use wording equivalent to `8 completed weeks + current week so far`.
- Render the 8 completed weeks as the main PR Size trend line.
- Render the current partial week as a distinct current-week-so-far point, visually detached from the completed-week line.
- Show a concise confidence note when the latest point is partial or has fewer than 3 measured PRs.
- Include the same PR count context in accessible chart text.
- Add focused tests for payload shape, dashboard integration, shared chart regressions, UTC boundary behavior, zero/low/high current-week counts, accessible copy, and Phase 03 verification.

## Out of Scope
- Changing PR Size median math, because the current median is correct and already explains the observed May 25 value.
- Hiding or dropping the current week, because fresh signal is useful when labeled honestly.
- Adding the missing Largest PR table column, because it is related but should be a separate small follow-up.
- Adding author-level details, because the dashboard must not rank or shame individual authors.
- Adding configurable sample thresholds, because a fixed `< 3 PRs` rule is enough for the first version.
- Changing PR Cycle Time or First Review trend behavior, because this issue is specific to PR Size interpretation.

## Key Decisions
- Use confidence messaging instead of a warning: the data is valid, so the UI should explain confidence rather than imply an error.
- Keep current weekly median semantics: the trend should continue to show median `additions + deletions` per ISO week.
- Separate the current partial-week point from completed-week line rendering: this makes the partial state visible without hiding the value.
- Show the note when the latest point is partial or has fewer than 3 PRs: this covers both current-week incompleteness and low-sample completed weeks.
- Use UTC ISO-week boundaries consistently. `now` and `mergedAt` timestamps are bucketed against Monday 00:00 UTC, including dates that are still Sunday in a local timezone.
- Keep shared chart changes opt-in at the API level. The reusable chart must not accept a 9-point PR Size array and infer detachment by position. Use an explicit contract such as `weeklyTrend` for the 8 completed points plus an optional `detachedPoint`/`detachedCurrentPoint` prop, or an equivalently explicit `isDetached` path-exclusion API. PR Cycle Time and First Review must keep their existing behavior unless they pass those props explicitly.
- Limit the completed-week/current-week window change to the PR Size trend chart. The Median PR Size card, Size team breakdown, oversized exceptions, and PR Size section no-data/visibility gate continue to use the existing selected dashboard window unless a later roadmap item changes all PR Size surfaces together, but they must still exclude future-dated rows after `now`.
- Defer the Largest PR table column: it can help diagnose spikes, but it is not required to make the chart honest.

## Edge Cases & Constraints
- Current partial week with 0 measured PRs: do not render a current-week point, do not add the partial week to the 8 completed-week line, and do not show current-week confidence copy. The chart remains the 8 completed-week trend with existing null-gap behavior.
- Current partial week with 1 or 2 PRs: show the median and a note such as `Current week so far: 2 PRs measured. This value may change.`
- Current partial week with 3 or more PRs: still show the current-week-so-far state, because the period is incomplete.
- Completed latest measured week with 1 or 2 measured PRs: show a low-sample note without saying the week is partial.
- Completed week with 0 measured PRs: keep it as a null gap with no generic low-sample note.
- Current partial week with 0 measured PRs and latest completed measured week with 1 or 2 measured PRs: show no detached current-week point and no current-week copy, but do show the latest completed week's low-sample note.
- Measured PRs with `additions + deletions = 0`: keep `measuredPrCount > 0`, `medianLines = 0`, and render the point/confidence copy when the other conditions apply.
- Weeks with no sized PRs: keep the existing null-week gap behavior.
- Weeks with PRs but null size fields only: keep rendering as a null data gap, not zero.
- Current partial week with only null size fields: `measuredPrCount` is `0`, `medianLines` is `null`, and no detached point is rendered.
- Current partial week with future-dated PR rows after `now`: ignore those rows for the current-week-so-far point and for all retained selected-window PR Size surfaces.
- A current partial week with measured PRs does not replace one of the 8 completed weeks. The payload may contain 9 points total: 8 completed points with `isPartialWeek: false`, plus 1 current point with `isPartialWeek: true`.
- Weekly trend points are ordered chronologically ascending; when present, the `isPartialWeek: true` point is last.
- Shared chart component must remain safe for PR Cycle Time and First Review; PR Size-specific detached-point rendering and confidence copy must be opt-in.

## Visual & Accessibility Requirements
- The completed-week PR Size line uses the existing line and null-gap behavior.
- The current partial-week point is styled as related but distinct: no line segment connects it to the completed-week series, and its marker/label communicates `current week so far` without using color alone.
- The completed-week line's y-axis domain is based on the 8 completed-week points. The detached current-week point does not flatten the completed trend; if its value exceeds the completed-week axis range, render it as an overflow/current-week-so-far marker with the actual numeric label still visible.
- If all 8 completed weeks are null and the current partial week has measured PRs, render a current-week-only chart state: no completed-week line, a visible detached current-week marker, and an axis scaled from the current value so the marker is not clipped.
- The visible confidence note is concise, placed near the chart, and uses `measured PRs` wording so it does not imply total merged PRs.
- User-facing current-week copy should include the week start, such as `Week of 2026-05-25 so far: 2 measured PRs`, instead of relying only on ambiguous local-calendar wording.
- Low-sample completed-week copy must include the week start and measured count, and must say the sample is low, not that the week is incomplete; for example, `Week of 2026-05-18: 2 measured PRs. Low sample.`
- The chart image label, screen-reader list, and any hidden chart copy must include the same `measuredPrCount` and partial/low-sample context that sighted users receive.
- Existing labels for PR Cycle Time and First Review must not gain PR Size-specific wording.

## Test Requirements
- Metric/unit: PR Size weekly trend returns exactly `weekStart`, `medianLines`, `measuredPrCount`, and `isPartialWeek`; `measuredPrCount` includes only PRs with non-null `additions` and `deletions`.
- Metric/unit: window includes 8 completed UTC ISO weeks and adds the current partial UTC ISO week only when it has measured PRs.
- Metric/unit: UTC ISO boundary cases bucket Sunday 23:59:59.999Z into the ending week and Monday 00:00:00.000Z into the new week, independent of local timezone.
- Metric/unit: UTC boundary coverage runs under a non-UTC `TZ` at process start so local `Date` methods cannot accidentally pass.
- Metric/unit: current partial week with zero measured PRs returns no detached current-week point and no current-week confidence note.
- Metric/unit: current partial-week calculations ignore PRs with `mergedAt > now`, even when those PRs fall in the same UTC ISO week as `now`.
- Metric/unit: completed weeks with zero measured PRs stay null gaps and do not trigger generic low-sample copy.
- Metric/unit: current partial week with zero measured PRs plus latest completed measured week with 1 or 2 measured PRs shows only the completed-week low-sample note.
- Metric/unit: a measured PR with `additions + deletions = 0` still counts as measured and can render a zero-line point.
- Metric/unit: weekly trend points are chronological, and the optional partial point is last.
- Metric/unit or component: current partial week with 1 or 2 measured PRs renders the detached point and low-count current-week note.
- Metric/unit or component: current partial week with 3 or more measured PRs renders the detached point and current-week-so-far note without low-sample wording.
- Component: PR Size chart preserves null-week gaps and proves at SVG path level that the completed-series path excludes the detached current-week point.
- Component: PR Size chart title, visible copy, aria label, and screen-reader list use wording equivalent to `8 completed weeks + current week so far` when a detached point is present.
- Component/accessibility: current partial-week visible copy and screen-reader copy contain the exact `Week of YYYY-MM-DD` value from `weekStart`.
- Component/accessibility: completed low-sample visible copy and screen-reader copy contain the exact `Week of YYYY-MM-DD` value from the affected completed point's `weekStart`.
- Component: a plain 9-point `weeklyTrend` without the explicit detached-point opt-in API renders as a normal series and does not gain current-week labeling, current-week confidence copy, or detached-point rendering by position alone.
- Component: extreme current-week outliers do not flatten the completed-week line; tests cover the overflow/current-week-so-far rendering path and preserve the actual numeric label.
- Component: 8 null completed weeks plus one measured current partial week renders a current-week-only state with no completed line and a non-clipped current marker.
- Component: shared chart regressions prove PR Cycle Time and First Review behavior, labels, null gaps, and accessibility copy remain unchanged when the new opt-in props are absent.
- Dashboard integration: seeded dashboard data exposes the expanded PR Size weekly trend payload and renders the PR Size confidence note only under the documented conditions.
- Dashboard integration: tests prove the intentionally retained selected-window behavior for the Median PR Size card, Size team breakdown, oversized exceptions, and PR Size section no-data/visibility gate while the PR Size trend chart uses the 8-completed-weeks-plus-current-week model.
- Dashboard integration: future-dated PRs with `mergedAt > now` are excluded from the Median PR Size card, Size team breakdown, oversized exceptions, no-data/visibility gate, and PR Size trend chart.
- Accessibility: visible confidence copy and screen-reader chart/list copy contain matching measured-count and partial/low-sample semantics.
- Verification: `npm run verify:phase03` remains the primary release check for this refinement, and its coverage/include rules must cover `src/components/dashboard/weekly-trend-chart.tsx` when that shared renderer changes.
- Verification: if this refinement changes Phase 03 coverage/include rules, add or update a script/config test proving `verify:phase03` covers `src/components/dashboard/weekly-trend-chart.tsx`.
- Verification: any Playwright confidence-note coverage must be tagged so it runs under the `verify:phase03` Playwright filter.
- Verification: because the shared chart is touched, run `npm run verify:phase02` as a regression gate for First Review, and run `npm run verify:phase01` if the shared chart API or duration-chart rendering changes outside PR Size-only call sites.

## Open Questions
- None.

## Future Iterations
- Add the documented Largest PR column to the Size team breakdown.
- Add richer per-point details if the chart later gains real hover or click interactions.
- Consider a broader confidence model across all weekly trend charts if PR Cycle Time or First Review show similar interpretation issues.

## Recommendation
This is the right next refinement for PR Size because it fixes a trust problem without changing correct data. The hardest part is keeping the chart simple while making the current-week state unmistakable. Do not compromise on preserving the existing median semantics; the feature should clarify the signal, not hide it.
