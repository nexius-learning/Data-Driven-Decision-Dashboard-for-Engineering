# FIX-002 — PR Size Trend Partial-Week Confidence
**Purpose**: Make the PR Size weekly trend honest about partial-week and low-sample data without changing PR Size median semantics.
**Audience**: Engineering leaders using the local dashboard, plus implementers maintaining PR Size metrics and shared dashboard chart components.
**Status**: Implemented (later expanded by FIX-004)

> Current follow-up note: FIX-002 shipped the detached current-week and confidence behavior for PR Size. FIX-004 later expanded the completed-week portion to the shared 16 completed-week comparison presentation, so default 8-week wording below is historical baseline language.

---

## Background
The PR Size trend can currently show a large latest-week value that is mathematically correct but easy to misread as a completed-week trend. The trigger case was the week of 2026-05-25: the chart showed `6319` because only two measured PRs existed in that current ISO week, with line sizes `11592` and `1046`, so the median was `(11592 + 1046) / 2`. The Size team breakdown did not show `6319` because it uses selected-window team medians, not weekly all-team medians.

The feature brief is `Documentation/Completed/pr-size-trend-partial-week-confidence-brief.md`. It was adversarially reviewed and converged on a chart-only refinement: keep the existing PR Size median math, keep non-trend PR Size surfaces on the selected dashboard window, but make the weekly trend chart show the configured completed-week window (8 weeks by default) plus an explicitly detached current-week-so-far point when current-week measured data exists.

## Goal
When this fix is complete, users can see the current PR Size weekly median when it exists, but the UI clearly distinguishes completed-week trend data from current-week-so-far or low-sample data. Future-dated PR rows after `now` are excluded from all PR Size surfaces, weekly trend points expose measured counts, and shared chart behavior for PR Cycle Time and First Review remains unchanged unless explicitly opted into detached-point rendering.

---

## Scope

### In Scope
- Expand PR Size weekly trend points to include `weekStart`, `medianLines`, `measuredPrCount`, and `isPartialWeek`.
- Change PR Size weekly trend generation to return the configured completed UTC ISO-week window (8 weeks by default) plus an optional current partial UTC ISO week point.
- Clamp PR Size computations to `mergedAt <= now`, including metric card, team table, oversized exceptions, no-data/visibility gate, and weekly trend.
- Add explicit opt-in detached-point rendering to `WeeklyTrendChart`; never infer detachment from array length, including the default 9-point case.
- Update `PrSizeTrendChart` title, aria label, help text, visible confidence copy, and screen-reader list to distinguish completed weeks from current-week-so-far and low-sample completed weeks.
- Preserve null-week gaps, line-based PR Size scaling, and duration-chart behavior.
- Add focused unit, component, dashboard integration, and `@phase03` E2E coverage.
- Ensure `verify:phase03` covers touched PR Size dashboard orchestration and shared chart code, and run phase regression gates required by shared chart changes.

### Out of Scope
- Changing PR Size median math, because the current median is correct.
- Hiding the current week, because fresh signal is useful when labeled honestly.
- Adding the missing Largest PR table column, because it is a related follow-up, not required for chart confidence. This plan may record or correct the existing docs/code drift, but must not implement the column.
- Adding author-level details, because the dashboard must not rank or shame individual authors.
- Adding configurable low-sample thresholds, because `< 3 measured PRs` is enough for this refinement.
- Changing PR Cycle Time or First Review trend behavior unless required for shared chart compatibility.

---

## Acceptance criteria

> Acceptance criteria are verified in the final task. See [Task 4.1 — Final verification & documentation update].

---

## What does NOT change
- PR Size continues to mean `additions + deletions` for PRs with non-null `additions` and `deletions`.
- PRs with null size fields remain excluded from PR Size medians and measured PR counts.
- Median PR Size card, Size team breakdown, oversized exceptions, and PR Size section visibility continue to use the selected dashboard window, except that they must exclude future-dated rows after `now`.
- PR Cycle Time and First Review charts keep existing rendering, labels, accessibility copy, and null-gap behavior when detached-point props are absent.
- PR Size null weeks remain gaps and are never plotted as zero.
- No database schema, collector, route, environment variable, or external API changes are introduced.
- The one-page dashboard order remains PR Cycle Time, First Review Time, then PR Size.

---

## Known limitations / accepted trade-offs
- PR Size trend chart semantics intentionally differ from the PR Size card/table window: the chart shows the configured completed UTC ISO-week window plus current week so far; card/table/exceptions keep the selected dashboard window.
- The current-week point is still visible when low-sample; the UI explains confidence instead of suppressing the data.
- Low-sample signaling is limited to the latest displayed current partial point or latest completed measured point, not every historical low-sample week.
- The detached current-week point may use overflow/current-week-so-far rendering for extreme outliers rather than rescaling the completed-week line.

---

## Architecture
- `src/metrics/pr-size-metric.ts`
  - Add and export:
    ```ts
    export type PrSizeWeeklyTrendPoint = {
      weekStart: string
      medianLines: number | null
      measuredPrCount: number
      isPartialWeek: boolean
    }
    ```
  - Update `getPrSizeWeeklyTrend(prs: PrSizeRecord[], weeks: number, now: Date, options?: { includeCurrentPartial?: boolean }): PrSizeWeeklyTrendPoint[]`.
  - The returned array is chronological ascending.
  - The first `weeks` entries are completed UTC ISO weeks ending before `isoWeekStart(now)`, with `isPartialWeek: false`.
  - Completed-week starts are exactly `isoWeekStart(now) - weeks * 7 days` through `isoWeekStart(now) - 7 days`; the current UTC ISO week is never part of the completed series.
  - Add a final current-week point with `isPartialWeek: true` only when `options.includeCurrentPartial === true` and the current UTC ISO week has `measuredPrCount > 0`.
  - Default `includeCurrentPartial` to `false` so existing dashboard wiring cannot expose a connected/mislabeled current-week point before `PrSizeTrendChart` is updated.
  - Current partial-week calculations include only PRs where `mergedAt <= now`.
  - `measuredPrCount` counts only PRs with non-null `additions` and `deletions`.
- `src/metrics/pr-cycle-time-dashboard.ts`
  - Update `PrSize.weeklyTrend` to `PrSizeWeeklyTrendPoint[]`.
  - Clamp all PR Size input lists to `mergedAt <= now` before computing metric, exceptions, weekly trend, team table, and section visibility.
  - Keep the existing dashboard call completed-only until `PrSizeTrendChart` is updated; enable `includeCurrentPartial` in the same task that splits/detaches/labels the current partial point.
  - Preserve selected-window semantics for non-trend PR Size surfaces.
- `src/components/dashboard/weekly-trend-chart.tsx`
  - Extend line-mode chart props with an explicit opt-in detached point contract. Preferred shape:
    ```ts
    type WeeklyTrendHoursPoint = { weekStart: string; medianHours: number | null }
    type WeeklyTrendLinesPoint = { weekStart: string; medianLines: number | null }
    type DetachedLinesPoint = {
      weekStart: string
      medianLines: number
      label: string
      ariaLabel: string
    }
    type WeeklyTrendChartProps =
      | {
          valueMode: 'duration'
          weeklyTrend: WeeklyTrendHoursPoint[]
          ariaLabel?: string
          yAxisLabel?: string
        }
      | {
          valueMode: 'lines'
          weeklyTrend: WeeklyTrendLinesPoint[]
          detachedPoint?: DetachedLinesPoint
          ariaLabel?: string
          yAxisLabel?: string
        }
    ```
  - Any plain `weeklyTrend` array remains a normal connected series; detached rendering occurs only through `detachedPoint`, not by array length.
  - For line charts with `detachedPoint`, build the completed-series path from `weeklyTrend` only.
  - Render `detachedPoint.ariaLabel` in the SVG output, for example through a `<title>` in the detached marker group and/or an accessible label on the marker group.
  - The x-axis domain and labels use `weeklyTrend` plus the optional `detachedPoint`; the detached point gets its own final x-axis slot and label, but it is never part of the completed-series path.
  - Axis domain is based on completed points. If the detached point exceeds that domain, render an overflow/current-week marker with the actual numeric label visible. If all completed points are null and `detachedPoint` exists, scale from the detached point and render no completed line.
  - Line-mode point labels preserve actual median values: integers render without decimals, fractional medians render with the needed decimal precision instead of being rounded to a different integer.
- `src/components/dashboard/weekly-trend-chart-layout.ts`
  - Add deterministic detached-label layout helpers for detached marker labels.
  - The helper must use explicit text-width assumptions, such as a named average glyph width and horizontal/vertical padding, and return marker plus label rectangles clamped inside the `560 x 220` SVG viewBox.
  - Component tests must assert helper outputs and rendered SVG attributes, not browser-only SVG text measurement in jsdom.
- `src/components/dashboard/PrSizeTrendChart.tsx`
  - Split `weeklyTrend` into completed points and optional current partial point.
  - Render title/aria wording equivalent to `<N> completed weeks + current week so far` when a detached current point exists, where `N` is the completed-point count (8 by default).
  - Render visible confidence copy:
    - current partial: `Week of YYYY-MM-DD so far: N measured PRs. This value may change.`
    - current partial with `N < 3`: include low-count wording.
    - latest completed measured week with `1` or `2` PRs and no current point: `Week of YYYY-MM-DD: N measured PRs. Low sample.`
  - Screen-reader list and hidden chart copy must match visible measured-count and partial/low-sample semantics.
- `src/components/dashboard/PrCycleTimeDashboard.css`
  - Add minimal PR Size confidence note and detached/current marker styles.
  - Do not rely on color alone.
- `vitest.config.phase03.ts`
  - Include `src/components/dashboard/weekly-trend-chart.tsx` in Phase 03 coverage when touched by this fix.
  - Cover the PR Size future-row clamp added in `src/metrics/pr-cycle-time-dashboard.ts` either by adding that file to Phase 03 coverage or by extracting the changed PR Size orchestration into a small covered helper such as `src/metrics/pr-size-dashboard.ts`.

No new config keys, environment variables, database columns, migrations, routes, server functions, or external API contracts are introduced. Current-week-so-far behavior is covered by component tests and injected-`now` dashboard integration tests; Playwright covers the completed low-sample confidence note and responsive layout.

---

## Task breakdown

### Phase 1 — PR Size Trend Data Contract
> **Internal checkpoint**: after Task 1.3, the server can produce the expanded PR Size trend payload and all PR Size surfaces exclude future-dated rows. Do not ship or expose an optional current partial point in the dashboard UI until Task 3.1 splits, detaches, and labels that point.

#### Task 1.1 — Expanded PR Size weekly trend point contract
- [x] **File**: `src/metrics/pr-size-metric.ts`
- **Depends on**: nothing
- **Description**:
  - Add:
    ```ts
    export type PrSizeWeeklyTrendPoint = {
      weekStart: string
      medianLines: number | null
      measuredPrCount: number
      isPartialWeek: boolean
    }
    ```
  - Change `getPrSizeWeeklyTrend(prs: PrSizeRecord[], weeks: number, now: Date, options?: { includeCurrentPartial?: boolean }): PrSizeWeeklyTrendPoint[]`.
  - For each completed week, compute:
    - `weekStart`: Monday 00:00 UTC formatted as `YYYY-MM-DD`.
    - `medianLines`: median of `additions + deletions` for measured PRs in that UTC ISO week, or `null`.
    - `measuredPrCount`: count of measured PRs in that UTC ISO week.
    - `isPartialWeek: false`.
  - Use `weeks` completed UTC ISO weeks before `isoWeekStart(now)`; when `weeks === 8`, this is 8 completed weeks, not 7 completed weeks plus the current week.
  - Compute completed-week starts as `isoWeekStart(now) - weeks * 7 days` through `isoWeekStart(now) - 7 days`.
  - Add the current partial UTC ISO week only when `options.includeCurrentPartial === true` and it has `measuredPrCount > 0`.
  - Keep `includeCurrentPartial` defaulting to `false`; this task must not change the existing dashboard path into a connected 9-point chart before the UI split/detach work is implemented.
  - For the current partial week, ignore PR rows with `mergedAt > now`.
  - Keep completed weeks chronological ascending, and append the optional partial point last.
  - Keep null-size-only weeks as `{ medianLines: null, measuredPrCount: 0 }`.
  - Keep zero-line measured PRs as measured: `measuredPrCount > 0` and `medianLines: 0`.
- **Internal checkpoint**: after this task, PR Size weekly trend data carries count and partial-week metadata, but current partial points are not shippable until the UI detaches and labels them.
- **Tests (TDD)** — `tests/metrics/pr-size-metric.test.ts`:
  - Unit: `weekly_trend_returns_expanded_point_shape` — asserts every point has exactly `weekStart`, `medianLines`, `measuredPrCount`, and `isPartialWeek`.
  - Unit: `weekly_trend_counts_only_prs_with_additions_and_deletions` — null size rows do not increase `measuredPrCount`.
  - Unit: `weekly_trend_returns_configured_completed_weeks_without_current_when_current_empty` — `now` mid-week with no current measured PRs returns the configured point count, all `isPartialWeek: false`.
  - Unit: `weekly_trend_completed_window_ends_at_previous_utc_iso_week` — the final completed point is `isoWeekStart(now) - 7 days`, not `isoWeekStart(now)`.
  - Unit: `weekly_trend_respects_configured_completed_week_count` — a non-8 `weeks` input returns that many completed points plus the optional partial point.
  - Unit: `weekly_trend_does_not_append_current_partial_without_explicit_opt_in` — current measured PRs do not add a partial point unless `includeCurrentPartial` is true.
  - Unit: `weekly_trend_opt_in_does_not_append_current_partial_when_current_week_has_zero_measured_prs` — with `includeCurrentPartial: true`, current-week rows with null size fields only still produce no partial point.
  - Unit: `weekly_trend_appends_current_partial_week_when_measured_prs_exist` — with `includeCurrentPartial: true`, current measured PRs add one final point with `isPartialWeek: true`.
  - Unit: `weekly_trend_ignores_future_rows_after_now_in_current_week` — a PR later than `now` in the same UTC ISO week does not affect count or median.
  - Unit: `weekly_trend_includes_pr_merged_exactly_at_now_and_excludes_one_ms_after_now` — `mergedAt === now` counts, while `mergedAt === now + 1ms` does not.
  - Unit: `weekly_trend_zero_line_pr_counts_as_measured` — `additions: 0`, `deletions: 0` produces `measuredPrCount: 1`, `medianLines: 0`.
  - Unit: `weekly_trend_preserves_fractional_even_count_median` — line sizes `[1, 2]` produce `medianLines: 1.5`.
  - Unit: `weekly_trend_points_are_chronological_with_partial_last` — point order is ascending and the optional partial point is last.
  - Unit: `weekly_trend_completed_zero_count_week_is_null_gap` — completed week with no measured PRs has `medianLines: null`, `measuredPrCount: 0`.
  - Checkpoint: `npm run lint && npm run typecheck && npm run test -- tests/metrics/pr-size-metric.test.ts`

#### Task 1.2 — UTC boundary regression for PR Size trend
- [x] **File**: `src/metrics/pr-size-metric.ts`, `tests/metrics/pr-size-metric-utc-boundary.test.ts`, `vitest.config.phase03.ts`
- **Depends on**: Task 1.1
- **Description**:
  - Add focused UTC-boundary tests in a separate test file that can run under a non-UTC `TZ` at process start.
  - Assert `2026-05-31T23:59:59.999Z` buckets into the week starting `2026-05-25`.
  - Assert `2026-06-01T00:00:00.000Z` buckets into the week starting `2026-06-01`.
  - Add Dec/Jan ISO-year rollover coverage under the same non-UTC `TZ`, including the final Sunday before a Monday UTC ISO-year transition and the Monday `00:00:00.000Z` start of the new UTC ISO week.
  - Ensure the test setup cannot pass by accidentally using local `Date` methods.
  - If a separate Vitest config or npm script is needed for stable `TZ`, add the smallest possible script/config and include it in final verification.
- **Internal checkpoint**: after this task, PR Size ISO-week bucketing is protected against local-time regressions, but the fix is not shippable until the UI detaches and labels current partial points.
- **Tests (TDD)** — `tests/metrics/pr-size-metric-utc-boundary.test.ts`:
  - Unit: `weekly_trend_buckets_sunday_utc_boundary_under_non_utc_tz` — Sunday 23:59:59.999Z remains in the ending UTC ISO week.
  - Unit: `weekly_trend_buckets_monday_utc_boundary_under_non_utc_tz` — Monday 00:00:00.000Z starts the new UTC ISO week.
  - Unit: `weekly_trend_buckets_iso_year_rollover_sunday_under_non_utc_tz` — Dec/Jan Sunday remains in its UTC ISO week.
  - Unit: `weekly_trend_buckets_iso_year_rollover_monday_under_non_utc_tz` — Dec/Jan Monday 00:00:00.000Z starts the new UTC ISO week.
  - Checkpoint: `npm run lint && npm run typecheck && TZ=America/Los_Angeles npm run test -- tests/metrics/pr-size-metric-utc-boundary.test.ts`

#### Task 1.3 — Dashboard PR Size clamping and payload integration
- [x] **File**: `src/metrics/pr-cycle-time-dashboard.ts`, optionally `src/metrics/pr-size-dashboard.ts` if a small helper is extracted for covered PR Size orchestration
- **Depends on**: Task 1.1, Task 1.2
- **Description**:
  - Import `PrSizeWeeklyTrendPoint` from `~/metrics/pr-size-metric`.
  - Update `PrSize.weeklyTrend` type to `PrSizeWeeklyTrendPoint[]`.
  - Add helper:
    ```ts
    function mergedNoLaterThan(p: { mergedAt: Date }, now: Date): boolean
    ```
    returning `p.mergedAt.getTime() <= now.getTime()`.
  - Apply future-row clamping to PR Size only:
    - `currentSizePrs` must satisfy selected current window and `mergedAt <= now`.
    - `priorSizePrs` should remain prior-window bounded and naturally before `now`.
    - `sizePrsForTrend` must exclude rows with `mergedAt > now`.
    - `getPrSizeTeamBreakdown(...)` must receive data that cannot include future-dated current rows.
    - `currentTeamPrs` for exceptions must be built from clamped `currentSizePrs`.
    - `prSizeOptional` visibility gate must use clamped `prSizeMetric.qualifyingPrCount`.
  - Preserve selected-window behavior for Median PR Size card, Size team breakdown, oversized exceptions, and no-data/visibility gate.
  - Preserve completed-only dashboard output for now by calling `getPrSizeWeeklyTrend(sizePrsForTrend, weeks, now)` without `includeCurrentPartial`.
  - Do not opt the dashboard payload into current partial output until Task 3.1, where `PrSizeTrendChart` can split, detach, and label the point.
- **Internal checkpoint**: after this task, dashboard payload and PR Size surfaces cannot be polluted by future-dated rows. If implementation is committed task-by-task, keep the optional current partial point behind the later `PrSizeTrendChart` split/detach work so the current UI never connects or mislabels it.
- **Tests (TDD)** — `tests/metrics/dashboard-phase-03.test.ts`, `tests/metrics/dashboard-types-phase-03.test.ts`:
  - Integration: `dashboard_pr_size_weekly_trend_exposes_expanded_completed_week_payload` — seeded dashboard output includes expanded weekly trend fields for completed weeks and does not expose a current partial point yet.
  - Integration: `dashboard_pr_size_excludes_future_rows_from_metric_table_exceptions_visibility_and_trend` — a future PR after `now` does not affect median card, team rows, exceptions, visibility, or weekly trend.
  - Integration: `dashboard_pr_size_includes_merged_at_now_and_excludes_one_ms_after_now` — `mergedAt === now` contributes to metric card, team rows, exceptions, and visibility, while `mergedAt === now + 1ms` contributes to none of them. Current-week trend contribution is asserted later when Task 3.1 opts the dashboard into partial-week output.
  - Integration: `dashboard_pr_size_non_trend_surfaces_keep_selected_window` — card/table/exceptions use selected dashboard window while trend uses completed-week/current-week model.
  - Type: `pr_size_weekly_trend_type_includes_count_and_partial_flag` — compile-time shape fixture includes `measuredPrCount` and `isPartialWeek`.
  - Checkpoint: `npm run lint && npm run typecheck && npm run test -- tests/metrics/dashboard-phase-03.test.ts tests/metrics/dashboard-types-phase-03.test.ts`

---

### Phase 2 — Shared Chart Detached-Point Rendering
> **Releasable**: after Task 2.2, the shared chart can render a PR Size current-week point only through explicit opt-in while preserving existing duration behavior.

#### Task 2.1 — Explicit detached point API for line charts
- [x] **File**: `src/components/dashboard/weekly-trend-chart.tsx`
- **Depends on**: Task 1.1
- **Description**:
  - Replace the loose `WeeklyTrendChart` prop shape with a discriminated union:
    ```ts
    export type WeeklyTrendHoursPoint = { weekStart: string; medianHours: number | null }
    export type WeeklyTrendLinesPoint = { weekStart: string; medianLines: number | null }
    export type DetachedLinesPoint = {
      weekStart: string
      medianLines: number
      label: string
      ariaLabel: string
    }
    export type WeeklyTrendChartProps =
      | {
          valueMode: 'duration'
          weeklyTrend: WeeklyTrendHoursPoint[]
          ariaLabel?: string
          yAxisLabel?: string
        }
      | {
          valueMode: 'lines'
          weeklyTrend: WeeklyTrendLinesPoint[]
          detachedPoint?: DetachedLinesPoint
          ariaLabel?: string
          yAxisLabel?: string
        }
    ```
  - Do not infer current-week behavior from array length or point position.
  - Any plain `weeklyTrend` array without `detachedPoint` renders exactly like a normal line series.
  - When `detachedPoint` is present, compute x-axis slots and x-axis labels from `weeklyTrend` plus the detached point, while computing the connected SVG path from `weeklyTrend` only.
  - `detachedPoint.medianLines` is numeric by type; callers must omit `detachedPoint` when the current partial point has `medianLines === null`.
  - Keep PR Cycle Time and First Review call sites valid without passing `detachedPoint`.
  - Keep line `yAxisLabel` behavior unchanged.
- **Releasable**: after this task, callers have an explicit API for detached PR Size line points.
- **Tests (TDD)** — `tests/components/weekly-trend-chart.test.tsx`:
  - Unit: `line_chart_accepts_explicit_detached_point` — renders completed line data plus `detachedPoint`.
  - Unit: `line_chart_detached_point_has_own_x_axis_slot_and_label` — detached point is positioned after the last completed point and has its own label.
  - Unit: `line_chart_detached_point_exposes_aria_label` — detached marker renders the provided `ariaLabel` in accessible SVG output so the shared prop is not dead data.
  - Unit: `line_chart_plain_series_does_not_infer_detachment_from_length` — a plain array, including the default 9-point case, remains a normal connected line with no current-week labeling or detached marker.
  - Unit: `duration_chart_props_do_not_gain_detached_behavior` — duration-mode rendering is unchanged with existing props.
  - Unit: `pr_size_line_mode_handles_all_null_or_empty_line_trend` — existing line-mode null behavior remains.
  - Checkpoint: `npm run lint && npm run typecheck && npm run test -- tests/components/weekly-trend-chart.test.tsx`

#### Task 2.2 — Detached line rendering, axis behavior, and shared regressions
- [x] **File**: `src/components/dashboard/weekly-trend-chart.tsx`, `src/components/dashboard/weekly-trend-chart-layout.ts`
- **Depends on**: Task 2.1
- **Description**:
  - Build completed-series paths only from `weeklyTrend`, never from `detachedPoint`.
  - Preserve null-week gaps in completed series.
  - Render `detachedPoint` as a visually distinct marker/label with no connecting path segment to completed points.
  - The marker must not rely on color alone; use shape, stroke, label, or other non-color distinction.
  - Axis domain for line charts with `detachedPoint`:
    - use completed numeric points when at least one completed point exists;
    - if detached value exceeds completed axis, render an overflow/current-week-so-far marker while preserving the actual numeric label;
    - if all completed points are null and detached value exists, scale from detached value and render no completed line.
  - Add deterministic layout geometry for detached marker labels when labels could clip near the SVG edges.
  - The layout geometry must expose marker and label rectangles using explicit text-width assumptions and must clamp those rectangles inside the `560 x 220` viewBox.
  - Do not rely on jsdom SVG text measurement for rendered label bounds.
  - Keep existing last-point styling for normal duration and line charts without `detachedPoint`.
  - Preserve fractional line labels; do not round `1.5` median lines to `2`.
  - Keep First Review and PR Cycle Time labels, paths, and accessibility copy unchanged.
- **Releasable**: after this task, the chart renderer visually separates current-week-so-far values without regressing shared chart behavior.
- **Tests (TDD)** — `tests/components/weekly-trend-chart.test.tsx`:
  - Unit: `line_chart_detached_point_is_not_in_completed_series_path` — SVG path data excludes the detached point.
  - Unit: `line_chart_detached_point_does_not_connect_across_null_gap` — null-gap behavior still applies to completed series.
  - Unit: `line_chart_extreme_detached_outlier_does_not_flatten_completed_line` — completed point Y positions remain readable, detached label shows actual value, and deterministic marker/label layout rectangles remain inside the SVG viewBox.
  - Unit: `line_chart_current_only_state_scales_from_detached_point` — all-null completed weeks plus detached point renders no completed line, shows the actual detached value label, and deterministic marker/label layout rectangles remain inside the SVG viewBox.
  - Unit: `detached_label_layout_clamps_extreme_outlier_label_inside_viewbox` — asserts the layout helper keeps a long outlier label rectangle within `0..560 x 0..220`.
  - Unit: `detached_label_layout_clamps_current_only_label_inside_viewbox` — asserts the layout helper keeps the current-only detached label rectangle within `0..560 x 0..220`.
  - Unit: `line_chart_fractional_median_label_is_not_rounded_to_integer` — `medianLines: 1.5` renders as `1.5`, not `2`.
  - Unit: `duration_chart_preserves_existing_last_point_highlight` — duration chart without detached point keeps existing behavior.
  - Unit: `first_review_and_pr_cycle_time_accessibility_copy_unchanged_without_detached_props` — shared chart does not add PR Size wording when opt-in props are absent.
  - Checkpoint: `npm run lint && npm run typecheck && npm run test -- tests/components/weekly-trend-chart.test.tsx`

---

### Phase 3 — PR Size UI, E2E, and Verification Wiring
> **Releasable**: after Task 3.4, users can see measured-count confidence messaging in the PR Size trend and the Phase 03 verification gate covers the touched chart code.

#### Task 3.1 — PR Size trend confidence copy and accessibility
- [x] **File**: `src/components/dashboard/PrSizeTrendChart.tsx`, `src/metrics/pr-cycle-time-dashboard.ts`
- **Depends on**: Task 1.1, Task 1.3, Task 2.2
- **Description**:
  - Update `type Point` to include:
    ```ts
    type Point = {
      weekStart: string
      medianLines: number | null
      measuredPrCount: number
      isPartialWeek: boolean
    }
    ```
  - Split `weeklyTrend` into:
    - completed points: `isPartialWeek === false`;
    - optional current partial point: `isPartialWeek === true`.
  - Opt the dashboard payload into partial-week output by changing the PR Size trend call to `getPrSizeWeeklyTrend(sizePrsForTrend, weeks, now, { includeCurrentPartial: true })` in the same task that updates `PrSizeTrendChart` to split/detach/label that point.
  - Pass only completed points to `WeeklyTrendChart.weeklyTrend`.
  - Pass the optional current partial point through `detachedPoint` only when it has `measuredPrCount > 0` and `medianLines !== null`.
  - Build `detachedPoint.label` and `detachedPoint.ariaLabel` in `PrSizeTrendChart`; keep measured-count and confidence semantics out of the shared `WeeklyTrendChart` prop contract.
  - Title and aria label:
    - no detached point: use wording equivalent to `<N> completed-week PR Size trend`, where `N` is the completed-point count;
    - detached point: use wording equivalent to `<N> completed weeks + current week so far`, where `N` is the completed-point count.
  - Visible confidence copy:
    - current partial with 1 or 2 measured PRs: include `Week of YYYY-MM-DD so far`, measured count, low-count wording, and `This value may change`.
    - current partial with 3+ measured PRs: include `Week of YYYY-MM-DD so far`, measured count, and `This value may change`, without low-sample wording.
    - no current partial point and latest completed measured week has 1 or 2 measured PRs: include `Week of YYYY-MM-DD`, measured count, and `Low sample`.
    - completed weeks with 0 measured PRs do not create generic low-sample copy.
  - Screen-reader list must include week, median, measured count, and partial/low-sample semantics matching visible copy.
  - Keep null weeks distinct from zero-line measured weeks.
- **Releasable**: after this task, PR Size trend UI explains current-week and low-sample confidence.
- **Tests (TDD)** — `tests/components/PrSizeTrendChart.test.tsx`, `tests/metrics/dashboard-phase-03.test.ts`:
  - Unit: `pr_size_trend_passes_completed_points_and_detached_current_point` — verifies `WeeklyTrendChart` receives completed points and explicit `detachedPoint`.
  - Unit: `pr_size_trend_no_detached_title_and_aria_use_completed_point_count` — non-default completed counts do not keep hardcoded `8-week` wording.
  - Unit: `pr_size_trend_detached_title_and_aria_include_current_week_so_far` — detached current point updates the visible title plus section/chart aria labels to include completed count and current-week-so-far semantics.
  - Unit: `pr_size_trend_omits_detached_point_when_partial_median_is_null` — current partial metadata with no measured median does not create an empty detached slot.
  - Unit: `pr_size_trend_current_partial_low_count_copy_includes_week_start_measured_count_and_may_change` — visible copy includes exact `Week of YYYY-MM-DD`, measured count, low-count wording, and `This value may change`.
  - Unit: `pr_size_trend_current_partial_three_plus_copy_omits_low_sample_wording_but_says_may_change` — current copy is so-far only, omits low-sample wording, and includes `This value may change`.
  - Unit: `pr_size_trend_latest_completed_low_sample_copy_includes_week_start` — no current point, completed low-sample note includes exact week start.
  - Unit: `pr_size_trend_low_sample_uses_latest_measured_completed_week_not_trailing_empty_week` — if the final completed week has `measuredPrCount: 0`, the note uses the nearest earlier completed week with 1 or 2 measured PRs.
  - Unit: `pr_size_trend_completed_zero_count_week_has_no_low_sample_note` — zero measured completed week remains a gap.
  - Unit: `pr_size_trend_sr_list_matches_visible_confidence_semantics` — screen-reader list includes measured count and partial/low-sample context.
  - Unit: `pr_size_trend_zero_line_measured_point_is_not_treated_as_empty` — `medianLines: 0`, `measuredPrCount > 0` renders as measured zero.
  - Unit: `pr_size_trend_fractional_median_sr_text_is_not_rounded` — screen-reader text preserves fractional medians such as `1.5 lines`.
  - Integration: `dashboard_pr_size_weekly_trend_exposes_partial_point_only_after_detached_ui_support` — dashboard output opts into current partial data in the same task that renders it detached.
  - Checkpoint: `npm run lint && npm run typecheck && npm run test -- tests/components/PrSizeTrendChart.test.tsx tests/metrics/dashboard-phase-03.test.ts`

#### Task 3.2 — PR Size confidence styling
- [x] **File**: `src/components/dashboard/PrCycleTimeDashboard.css`
- **Depends on**: Task 3.1
- **Description**:
  - Add minimal classes for PR Size confidence copy and detached/current marker support if needed by `WeeklyTrendChart`/`PrSizeTrendChart`.
  - Suggested class names:
    - `.pr-dashboard__chart-confidence`
    - `.pr-dashboard__chart-confidence--low-sample`
    - `.pr-dashboard__chart-point--detached`
  - Styling must be quiet and informational, not error-like.
  - Styling must not rely on color alone.
  - Preserve mobile layout; confidence copy must wrap without overlapping chart labels.
- **Releasable**: after this task, confidence messaging is readable and visually consistent with the dashboard.
- **Tests (TDD)** — `tests/components/PrSizeTrendChart.test.tsx`, `tests/components/weekly-trend-chart.test.tsx`:
  - Unit: `pr_size_confidence_copy_uses_dashboard_confidence_class` — visible note uses expected class.
  - Unit: `detached_point_has_non_color_visual_marker_class_or_attribute` — marker has a structural class/attribute beyond color.
  - Checkpoint: `npm run lint && npm run typecheck && npm run test -- tests/components/PrSizeTrendChart.test.tsx tests/components/weekly-trend-chart.test.tsx`

#### Task 3.3 — Phase 03 E2E confidence scenario
- [x] **File**: `tests/e2e/fixtures/phase-03-size.fixture.ts`, `tests/e2e/phase03-pr-size.spec.ts`
- **Depends on**: Task 1.3, Task 3.1, Task 3.2
- **Description**:
  - Extend `Phase03Scenario` with a deterministic `'low-sample-confidence'` scenario.
  - Seed PRs deliberately relative to UTC ISO weeks:
    - enough historical completed-week PRs for the PR Size section to render;
    - no current-week measured PRs;
    - 1 or 2 measured PRs in the latest completed UTC ISO week.
  - Avoid accidental weekday-dependent behavior by deriving dates from UTC ISO week start.
  - Do not add a Playwright current-week-so-far E2E in this plan, because the normal server path computes `now` at page load and can cross a UTC ISO-week boundary between fixture seeding and render.
  - Keep current-week-so-far behavior covered by component tests and injected-`now` dashboard integration tests.
  - Keep same-week future-row exclusion covered by deterministic injected-`now` dashboard integration tests, not Playwright.
  - Add a Playwright test tagged `@phase03` that verifies:
    - PR Size section renders;
    - PR Size trend confidence copy is visible;
    - copy includes `Week of YYYY-MM-DD` and measured PR count;
    - the confidence copy is informational, not an error state.
  - Add responsive layout coverage at mobile and desktop widths that verifies dashboard order remains PR Cycle Time, First Review Time, then PR Size, and that PR Size confidence copy does not overlap the chart or team table.
- **Releasable**: after this task, completed low-sample confidence and responsive layout are covered end to end; current-week-so-far confidence remains covered by component and injected-`now` dashboard integration tests.
- **Tests (TDD)** — `tests/e2e/phase03-pr-size.spec.ts`:
  - E2E: `phase03_pr_size_trend_shows_completed_low_sample_confidence_note @phase03` — verifies the latest completed low-sample confidence copy with exact week start and measured count.
  - E2E: `phase03_pr_size_confidence_layout_preserves_dashboard_order @phase03` — runs at mobile and desktop widths, checks section order, and asserts confidence copy is not overlapping chart/table bounds.
  - Checkpoint: `npm run lint && npm run typecheck && npm run test:e2e -- --grep @phase03`

#### Task 3.4 — Phase 03 coverage and script wiring
- [x] **File**: `package.json`, `vitest.config.phase03.ts`, `tests/scripts/verify-phase-02.test.ts` or a new `tests/scripts/verify-phase-03.test.ts`
- **Depends on**: Task 2.2, Task 3.3
- **Description**:
  - Add `src/components/dashboard/weekly-trend-chart.tsx` to `vitest.config.phase03.ts` coverage include because this fix touches the shared chart renderer.
  - Cover the PR Size dashboard clamping path changed in Task 1.3:
    - either add `src/metrics/pr-cycle-time-dashboard.ts` to Phase 03 coverage if the dashboard integration tests keep coverage above threshold;
    - or extract the PR Size-only clamp/orchestration logic into a narrow helper such as `src/metrics/pr-size-dashboard.ts` and include that helper in Phase 03 coverage.
  - If using the extracted-helper path, the script/config test must also verify that `src/metrics/pr-cycle-time-dashboard.ts` imports and calls the covered helper; listing the helper in coverage is not enough.
  - Include `src/components/dashboard/weekly-trend-chart-layout.ts` in Phase 03 coverage narrowly.
  - Add or update a script/config test proving Phase 03 coverage includes `weekly-trend-chart.tsx`.
  - Do not broaden coverage to unrelated dashboard files.
  - Confirm new Playwright tests include `@phase03` so they run under `npm run verify:phase03`.
  - Assert the `verify:phase03` script still runs lint, typecheck, the non-UTC UTC-boundary test, Phase 03 coverage, and `playwright test --grep @phase03`.
  - Update `package.json` so `verify:phase03` runs `TZ=America/Los_Angeles npm run test -- tests/metrics/pr-size-metric-utc-boundary.test.ts` before Phase 03 coverage and Playwright.
- **Releasable**: after this task, Phase 03 verification covers the shared chart code touched by this refinement.
- **Tests (TDD)** — `tests/scripts/verify-phase-03.test.ts`:
  - Unit: `verify_phase03_coverage_includes_weekly_trend_chart` — reads `vitest.config.phase03.ts` and asserts `src/components/dashboard/weekly-trend-chart.tsx` is covered.
  - Unit: `verify_phase03_coverage_includes_weekly_trend_chart_layout` — reads `vitest.config.phase03.ts` and asserts `src/components/dashboard/weekly-trend-chart-layout.ts` is covered.
  - Unit: `verify_phase03_coverage_includes_pr_size_dashboard_clamp` — asserts Phase 03 coverage includes `src/metrics/pr-cycle-time-dashboard.ts`; if a helper is extracted instead, also asserts `src/metrics/pr-cycle-time-dashboard.ts` imports/calls that covered helper.
  - Unit: `verify_phase03_script_runs_required_gates` — mirrors the Phase 02 wiring test pattern and asserts `verify:phase03` runs lint, typecheck, `TZ=America/Los_Angeles npm run test -- tests/metrics/pr-size-metric-utc-boundary.test.ts`, `vitest run --coverage --config vitest.config.phase03.ts`, and `playwright test --grep @phase03`.
  - Unit: `phase03_e2e_confidence_tests_are_tagged` — asserts the named confidence E2E test definitions include `@phase03`, not merely that the file contains some `@phase03` tests.
  - Checkpoint: `npm run lint && npm run typecheck && npm run test -- tests/scripts/verify-phase-03.test.ts`

---

### Final Phase — Verification & Documentation

#### Task 4.1 — Final verification & documentation update
- [x] **File**: `Documentation/README.md`, `Documentation/Roadmap/trackable-roadmap.md`, `Documentation/Completed/phase-03-pr-size.md`, `Documentation/Completed/phase-03-pr-size-brief.md`, `Documentation/Completed/FEAT-003-pr-size-implementation-plan.md`
- **Depends on**: Task 1.1, Task 1.2, Task 1.3, Task 2.1, Task 2.2, Task 3.1, Task 3.2, Task 3.3, Task 3.4
- **Description**:
  - Discover user-facing PR Size chart behavior documentation, including `Documentation/README.md`, `Documentation/Roadmap/trackable-roadmap.md`, `Documentation/Completed/phase-03-pr-size.md`, `Documentation/Completed/phase-03-pr-size-brief.md`, and `Documentation/Completed/FEAT-003-pr-size-implementation-plan.md`.
  - Update only documentation affected by this delivered chart behavior; do not rewrite unrelated roadmap material.
  - If the existing Phase 03 docs still claim the missing Largest PR table column is implemented, record that as a separate follow-up or correct the stale documentation without adding the column in this fix.
  - Do not add new roadmap metric scope, Jira work, AI recommendations, auth, cloud deployment, or quality metrics.
  - Verify all acceptance criteria below before marking this task complete.
- **Releasable**: after this task, the PR Size trend confidence fix is fully verified and documentation reflects the delivered behavior.
- **Acceptance criteria** (must all pass):
  - PR Size weekly trend payload includes `weekStart`, `medianLines`, `measuredPrCount`, and `isPartialWeek`.
  - PR Size weekly trend returns the configured number of completed UTC ISO weeks (8 by default) plus an optional current partial UTC ISO week point.
  - Current partial-week point is included only when `measuredPrCount > 0`.
  - All PR Size computations exclude rows where `mergedAt > now`.
  - PR Size computations include rows where `mergedAt === now` and exclude rows where `mergedAt === now + 1ms`.
  - `measuredPrCount` includes only PRs with non-null `additions` and `deletions`.
  - Zero-line measured PRs count as measured and render as `0` lines, not as empty data.
  - Fractional PR Size medians are preserved in visible and screen-reader labels; they are not rounded to a different integer.
  - UTC ISO boundary tests pass under a non-UTC timezone.
  - Dec/Jan UTC ISO-year rollover tests pass under a non-UTC timezone.
  - Completed weeks with no measured PRs remain null gaps and do not trigger generic low-sample copy.
  - Current partial week with 1 or 2 measured PRs renders a detached current-week point and visible confidence copy with exact week start, measured count, low-sample wording, and `This value may change`.
  - Current partial week with 3 or more measured PRs renders current-week-so-far copy with `This value may change` and without low-sample wording.
  - Current partial week with 0 measured PRs renders no detached point and no current-week confidence copy.
  - Latest completed measured week with 1 or 2 measured PRs renders low-sample copy with exact week start and measured count.
  - PR Size trend title and aria text use the completed-point count both with and without a detached current-week point.
  - Detached current-week marker exposes its `ariaLabel` in the rendered SVG/accessibility output.
  - `WeeklyTrendChart` does not infer detached behavior from a plain array length, including the default 9-point case.
  - `WeeklyTrendChart.detachedPoint` accepts only numeric `medianLines`; null current partial medians are omitted rather than rendered as empty detached slots.
  - Detached current-week point is not connected to the completed-week SVG path.
  - Extreme current-week outliers do not flatten the completed-week PR Size trend line.
  - Exceeded-domain detached current-week markers and labels remain inside the SVG viewport while preserving the actual numeric label.
  - Detached label viewport assertions use deterministic layout rectangles with explicit text-width assumptions; jsdom-only SVG text measurement is not accepted for rendered bounds.
  - Current-week-only state renders without clipping when all completed weeks are null.
  - PR Cycle Time and First Review chart behavior remains unchanged when detached props are absent.
  - PR Size card, team breakdown, exceptions, and section visibility keep selected-window behavior while excluding future rows after `now`.
  - New E2E confidence tests are tagged `@phase03`.
  - Current-week-so-far behavior is covered by component/dashboard integration tests with injected `now`; Playwright covers completed low-sample confidence and layout only.
  - `npm run verify:phase03` passes.
  - `npm run verify:phase02` passes because the shared chart renderer is touched.
  - `npm run verify:phase01` passes because this fix changes the shared `WeeklyTrendChart` API used by Phase 01.
  - `git diff --check` passes.
- **Tests (TDD)**: N/A — this is a verification and documentation task.
- **Checkpoint**: `npm run verify:phase03 && npm run verify:phase02 && npm run verify:phase01 && git diff --check`
