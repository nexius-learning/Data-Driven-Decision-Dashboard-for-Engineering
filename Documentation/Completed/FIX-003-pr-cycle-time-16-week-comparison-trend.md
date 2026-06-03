# FIX-003 — PR Cycle Time 16-Week Comparison Trend
**Purpose**: Make the PR Cycle Time trend chart explain the card's current-versus-previous 8-week comparison by showing both periods in one chronological chart.
**Audience**: Engineering leaders using the local dashboard, plus implementers maintaining PR Cycle Time metrics and shared dashboard chart components.
**Status**: Complete

---

## Background
The Median PR Cycle Time card compares the current dashboard range against the previous 8-week comparison range, but the visible PR Cycle Time trend chart only shows the current 8 buckets. This made an observed live case confusing: the card showed a small previous median and a large percent increase, while the chart showed only current-period weekly medians. The feature brief is `Documentation/Completed/pr-cycle-time-16-week-comparison-trend-brief.md`.

This plan keeps the metric math unchanged and changes only PR Cycle Time trend presentation. It intentionally starts with PR Cycle Time before broadening the pattern to First Review or PR Size.

## Goal
When this fix is complete, the PR Cycle Time trend chart shows the previous 8 dashboard buckets followed by the current 8 dashboard buckets, with the previous segment visually tied to the previous-median reference color. Users can see the data that produced both sides of the card comparison without changing the dashboard's metric calculation, one-page order, or other metric charts.

---

## Scope

### In Scope
- Add a PR Cycle Time-only 16-point comparison trend payload.
- Preserve the existing card range, median, previous median, trend percent, baseline status, and merged PR count calculations.
- Preserve dashboard local-day inclusive range semantics, including final period buckets that may be longer than seven 24-hour days.
- Render the PR Cycle Time trend as previous 8 buckets plus current 8 buckets.
- Style the previous-period segment with `#6b7280` and a non-color distinction such as a dashed path.
- Keep the current-period segment in the existing primary chart color `#111827`.
- Ensure the current/latest accent can only apply to the latest non-null current-period point.
- Add divider/period labels, updated copy, screen-reader list coverage, and mobile-safe x-axis label density.
- Add regression coverage proving First Review and PR Size chart behavior is unchanged.
- Verify desktop and mobile rendering with browser screenshots.

### Out of Scope
- First Review trend changes, because this pattern should be validated on PR Cycle Time first.
- PR Size trend changes, because PR Size has separate completed-week/current-partial semantics.
- User-controlled date ranges, because the immediate problem is explaining the existing default comparison.
- 24-week or longer chart history, because 16 buckets is the smallest history that fully explains the card comparison.
- Changing the median or percent-change formulas.
- Treating empty buckets as zero.

---

## Acceptance criteria
- [ ] PR Cycle Time payload exposes a 16-point comparison trend with `period`, `bucketIndex`, `bucketStart`, `bucketEnd`, `bucketLabel`, and `medianHours`.
- [ ] Each comparison trend point exposes `bucketLabel` as a local `YYYY-MM-DD` date label for visible and accessible chart labels.
- [ ] Points 1-8 represent the previous comparison period, and points 9-16 represent the current comparison period.
- [ ] Previous buckets partition `[previous.from, current.from)` and current buckets partition `[current.from, current.to]`.
- [ ] Buckets 1-7 in each period are standard 7-local-day half-open buckets.
- [ ] Bucket 8 in each period ends at the period boundary and may be longer than seven 24-hour days.
- [ ] Previous bucket 8 starts at `previous.from + 49 local calendar days` and ends at `current.from`; current bucket 8 starts at `current.from + 49 local calendar days` and ends at `current.to`.
- [ ] Buckets 1-15 include `bucketStart` and exclude `bucketEnd`; bucket 16 includes `current.to`.
- [ ] The implementation does not drop the local end day from either period to force uniform seven-day buckets.
- [ ] PRs merged exactly at `previous.from`, `current.from`, and `current.to` are included exactly once.
- [ ] PR Cycle Time card `medianHours`, `previousMedianHours`, `trendPercent`, `baselineStatus`, and merged PR count remain unchanged for the same fixture data.
- [ ] The compatibility `weeklyTrend` field remains an 8-point current-period payload, and comparison semantics are never inferred from `weeklyTrend.length`.
- [ ] All dashboard mock payloads and type fixtures are updated when `comparisonWeeklyTrend` becomes part of the `PrCycleTimeDashboard` contract.
- [ ] PR Cycle Time trend title and help copy communicate a 16-week previous-plus-current comparison.
- [ ] Previous-period chart segment uses `#6b7280` and a non-color distinction.
- [ ] Current-period chart segment uses the current-series styling; any latest accent is limited to the latest non-null current-period point and its existing incoming segment behavior, never to previous-period points.
- [ ] No line is drawn across the previous/current divider.
- [ ] Null buckets remain visual gaps.
- [ ] Screen-reader list includes all 16 buckets and labels each as previous or current.
- [ ] Baseline-pending copy explains that previous-period points are context, not an available comparison baseline, including when the previous period has fewer than 3 merged PRs, no valid previous median, or a zero previous median.
- [ ] First Review remains an 8-week duration chart.
- [ ] PR Size remains line-mode with completed-week plus optional current-partial behavior unchanged.
- [ ] Desktop and mobile browser verification shows no incoherent overlap among labels, values, divider, and period labels.

---

## What does NOT change
- `range.weeks` remains `8`.
- PR Cycle Time card calculations and trend percent formula remain unchanged.
- Team breakdown, exceptions, source links, freshness, and refresh behavior remain unchanged.
- First Review trend chart remains 8 points.
- PR Size trend chart behavior remains unchanged.
- No database schema, migrations, routes, environment variables, collector changes, or external API changes are introduced.
- The one-page dashboard order remains PR Cycle Time, First Review Time, then PR Size.

---

## Known limitations / accepted trade-offs
- Bucket 8 in each period may be longer than seven 24-hour days because the chart must preserve the dashboard's local-day inclusive comparison ranges.
- The chart visually shows selected x-axis date labels only; all 16 buckets remain available through the accessible list.
- The first iteration does not add hover tooltips or PR counts.
- The first iteration does not extend the comparison-history pattern to First Review.

---

## Architecture
- `src/metrics/pr-cycle-time-summary.ts`
  - Add:
    ```ts
    export type PrCycleTimeTrendPeriod = 'previous' | 'current'

    export type PrCycleTimeComparisonTrendPoint = {
      period: PrCycleTimeTrendPeriod
      bucketIndex: number
      bucketStart: string
      bucketEnd: string
      bucketLabel: string
      medianHours: number | null
    }

    export function getComparisonWeeklyMedianTrend(
      prs: PullRequestRecord[],
      previous: DateRange,
      current: DateRange,
    ): PrCycleTimeComparisonTrendPoint[]
    ```
  - `bucketStart` and `bucketEnd` are ISO strings produced from exact `Date` boundaries.
  - `bucketLabel` is a local-date `YYYY-MM-DD` label derived from `bucketStart` with the same local calendar semantics as `getDashboardDateRanges`; chart code must not feed full ISO strings into the existing date-only `weekStart` label helper.
  - The helper uses the existing `median` calculation and `calculatePrCycleTime`, but not the old `getWeeklyMedianTrend` bucket loop.
  - The helper receives the full PR list available to the dashboard, not a current-period prefiltered list.
  - Previous period buckets partition `[previous.from, current.from)`.
  - Current period buckets partition `[current.from, current.to]`.
  - Buckets 1-7 in each period are 7-local-day half-open buckets.
  - Previous bucket 8 ends at `current.from`; current bucket 8 ends at `current.to`.
  - Buckets 1-15 include `bucketStart` and exclude `bucketEnd`; bucket 16 includes `current.to`.
  - Use local calendar-day addition from the range boundaries so daylight-saving transitions do not turn bucket starts into fixed `24h` offsets.
- `src/metrics/pr-cycle-time-dashboard.ts`
  - Add `comparisonWeeklyTrend: PrCycleTimeComparisonTrendPoint[]` to `PrCycleTimeDashboard`.
  - Populate it with `getComparisonWeeklyMedianTrend(prs, previous, current)`.
  - Keep existing `weeklyTrend` intact for compatibility until the UI fully moves away from it.
  - Update every typed dashboard fixture or mock payload that constructs `PrCycleTimeDashboard`, including route/app-shell and phase regression tests.
- `src/components/dashboard/weekly-trend-chart.tsx`
  - Add an explicit PR Cycle Time duration comparison opt-in prop instead of inferring behavior from array length.
  - Preferred type shape:
    ```ts
    type DurationComparisonPoint = {
      period: 'previous' | 'current'
      bucketIndex: number
      bucketStart: string
      bucketEnd: string
      bucketLabel: string
      medianHours: number | null
    }
    ```
  - Extend duration mode props with optional `comparisonTrend?: DurationComparisonPoint[]`.
  - When `comparisonTrend` is provided, render that series instead of `weeklyTrend` for duration charts.
  - Derive comparison x-axis labels from `bucketStart`, the previous/current divider boundary, and `bucketEnd`; do not require comparison points to be adapted into `weekStart`.
  - Keep line-mode props and behavior unchanged.
  - Previous segment path and points use `#6b7280` and dashed path styling.
  - Current segment path and points keep current-series styling.
  - Preserve the existing latest-point emphasis for the current period only, including the current incoming segment if that remains the shared chart convention.
  - Do not connect previous and current segments across the divider.
  - Show selected x-axis labels only.
- `src/components/dashboard/PrCycleTimeDashboard.tsx`
  - Use `data.comparisonWeeklyTrend` for the PR Cycle Time chart.
  - Update title, how-to-read copy, `aria-label`, and screen-reader list.
  - Keep `selectedDurationUnitForTrend` based on all non-null comparison points once the comparison payload is used.
  - Add conditional baseline-pending copy when previous comparison is unavailable.
- `src/components/dashboard/format-cycle-duration.ts`
  - Optionally add:
    ```ts
    export function formatPreviousMedianHumanReference(hours: number | null): string
    ```
  - This helper should format sub-hour previous medians as human-readable minutes/seconds if the UI copy needs it.
- `src/components/dashboard/PrCycleTimeDashboard.css`
  - Add minimal classes for comparison legend/period labels/divider if SVG attributes are not enough.

No new config keys or environment variables are introduced.

---

## Tests
- **comparison_trend_returns_16_points_with_period_metadata** (unit): `getComparisonWeeklyMedianTrend` returns 8 previous and 8 current points with required fields.
- **comparison_trend_preserves_dashboard_boundary_semantics** (unit): boundary PRs at `previous.from`, `current.from`, and `current.to` are included exactly once.
- **comparison_trend_final_buckets_cover_local_day_remainder** (unit): final previous/current buckets absorb the local-day inclusive range remainder.
- **dashboard_exposes_pr_cycle_time_comparison_weekly_trend** (integration): dashboard payload includes 16 comparison points while card metrics remain unchanged.
- **dashboard_comparison_trend_does_not_change_metric_card_values** (integration): median, previous median, trend percent, baseline status, and merged count are unchanged.
- **weekly_chart_renders_duration_comparison_segments** (component): previous/current segments render with distinct styles and no cross-boundary path.
- **weekly_chart_current_accent_never_applies_to_previous_period** (component): previous-only data never receives the latest accent.
- **weekly_chart_comparison_preserves_null_gaps** (component): null buckets remain gaps.
- **weekly_chart_first_review_duration_behavior_unchanged** (component): normal duration charts still render as 8-week single-series charts.
- **weekly_chart_pr_size_line_behavior_unchanged** (component): line-mode PR Size chart behavior and detached current partial behavior remain unchanged.
- **dashboard_renders_16_week_pr_cycle_time_comparison_trend** (component): dashboard title/copy/list render the 16-point comparison.
- **dashboard_comparison_trend_baseline_pending_copy** (component): baseline-pending chart copy explains previous points are context only.
- **pr_cycle_time_16_week_comparison_visual_desktop** (e2e): desktop chart labels/divider do not overlap incoherently.
- **pr_cycle_time_16_week_comparison_visual_mobile** (e2e): mobile chart labels/divider do not overlap incoherently.

---

## Documentation update
- [x] `Documentation/Completed/pr-cycle-time-16-week-comparison-trend-brief.md`, section: Recommendation, path: `Documentation/Completed/pr-cycle-time-16-week-comparison-trend-brief.md`
- [x] `Documentation/Completed/FIX-003-pr-cycle-time-16-week-comparison-trend.md`, section: Status, path: `Documentation/Completed/FIX-003-pr-cycle-time-16-week-comparison-trend.md`

---

## Task breakdown

### Phase 1 — Comparison Trend Data
> **Releasable**: when Task 1.2 is complete, the dashboard payload exposes the comparison trend while existing UI behavior can still remain unchanged.

#### Task 1.1 — PR Cycle Time comparison bucket helper
- [x] **File**: `src/metrics/pr-cycle-time-summary.ts`
- **Depends on**: nothing
- **Description**:
  - Add `PrCycleTimeTrendPeriod`, `PrCycleTimeComparisonTrendPoint`, and `getComparisonWeeklyMedianTrend(prs: PullRequestRecord[], previous: DateRange, current: DateRange): PrCycleTimeComparisonTrendPoint[]`.
  - Pass all dashboard PRs into the helper; do not prefilter to the current range, or the previous-period half of the comparison trend will be empty.
  - Build 16 chronological buckets:
    - previous buckets 1-7: `[previous.from + n*7 local days, previous.from + (n+1)*7 local days)`
    - previous bucket 8: `[previous.from + 49 local days, current.from)`
    - current buckets 1-7: `[current.from + n*7 local days, current.from + (n+1)*7 local days)`
    - current bucket 8: `[current.from + 49 local days, current.to]`
  - Use `calculatePrCycleTime(p)` for each merged PR and `median(hours)` for each bucket.
  - Exclude PRs with `mergedAt === null` or invalid/negative cycle time.
  - Include boundary rows exactly once.
  - Set `bucketIndex` to `1..8` within each period.
  - Set `bucketStart` and `bucketEnd` to exact ISO strings from the bucket boundaries.
  - Set `bucketLabel` to the local `YYYY-MM-DD` date of `bucketStart` for visible and accessible labels.
  - Use the same local calendar-day addition pattern as `getDashboardDateRanges`, not fixed millisecond offsets.
  - **Releasable**: after this task, PR Cycle Time comparison trend data can be computed without changing dashboard payloads.
- **Tests (TDD)** — `tests/metrics/pr-cycle-time-summary.test.ts`:
  - Unit: `comparison_trend_returns_16_points_with_period_metadata` — verifies 8 previous and 8 current points, ordered chronologically.
  - Unit: `comparison_trend_preserves_dashboard_boundary_semantics` — PRs at `previous.from`, `current.from`, and `current.to` appear once in the expected period.
  - Unit: `comparison_trend_final_buckets_cover_local_day_remainder` — final buckets include rows after the seventh 7-day bucket and before the period end.
  - Unit: `comparison_trend_internal_bucket_boundaries_do_not_double_count` — PRs exactly at internal bucket boundaries belong to the later bucket.
  - Unit: `comparison_trend_null_weeks_return_null_median` — empty buckets return `medianHours: null`.
  - Unit: `comparison_trend_skips_negative_or_unmerged_prs` — invalid/unmerged rows do not affect medians.
  - Checkpoint: `npm run test -- tests/metrics/pr-cycle-time-summary.test.ts`

#### Task 1.2 — Dashboard comparison trend payload
- [x] **File**: `src/metrics/pr-cycle-time-dashboard.ts`
- **Depends on**: Task 1.1
- **Description**:
  - Import `getComparisonWeeklyMedianTrend` and `PrCycleTimeComparisonTrendPoint`.
  - Add `comparisonWeeklyTrend: PrCycleTimeComparisonTrendPoint[]` to `PrCycleTimeDashboard`.
  - Populate it with `getComparisonWeeklyMedianTrend(prs, previous, current)` after current/previous ranges are available.
  - Pass the full metrics-repo PR set, or an explicitly previous-plus-current filtered set; never pass `currentMerged` and never reuse the existing current-only `weeklyTrend` input.
  - Keep `weeklyTrend` as the existing 8-point current-period payload for compatibility.
  - Update typed dashboard fixtures in component/app/regression tests so TypeScript failures expose any stale payload assumptions:
    - `tests/components/pr-cycle-time-dashboard.test.tsx`
    - `tests/components/freshness-strip-phase-02.test.tsx`
    - `tests/app/dashboard-route.test.tsx`
    - `tests/app/app-shell.test.tsx`
    - `tests/regression/phase-01-unchanged.test.ts`
  - Do not change `currentMerged`, `previousMerged`, card medians, trend percent, baseline status, team rows, exceptions, or PR Size/First Review payloads.
  - **Releasable**: after this task, server/dashboard data exposes the 16-point PR Cycle Time comparison trend.
- **Tests (TDD)** — `tests/metrics/pr-cycle-time-dashboard.test.ts`:
  - Integration: `dashboard_exposes_pr_cycle_time_comparison_weekly_trend` — payload has 16 comparison points with 8 previous and 8 current points.
  - Integration: `dashboard_comparison_trend_has_non_null_previous_context` — fixture data with previous-only merges produces at least one non-null previous-period bucket.
  - Integration: `dashboard_comparison_trend_does_not_change_metric_card_values` — card metric values match the pre-change expected values for the same fixture.
  - Integration: `dashboard_comparison_trend_includes_current_to_boundary` — PR merged exactly at `current.to` appears in the final current bucket.
  - Integration: `dashboard_existing_weekly_trend_remains_8_points` — compatibility `weeklyTrend` remains current-period 8 points.
  - Checkpoint: `npm run test -- tests/metrics/pr-cycle-time-dashboard.test.ts`

### Phase 2 — Shared Chart Opt-In Rendering
> **Releasable**: when Task 2.2 is complete, the shared chart can render PR Cycle Time comparison data without changing default First Review or PR Size behavior.

#### Task 2.1 — Duration comparison chart contract
- [x] **File**: `src/components/dashboard/weekly-trend-chart.tsx`
- **Depends on**: Task 1.1
- **Description**:
  - Add local/exported type:
    ```ts
    export type DurationComparisonPoint = {
      period: 'previous' | 'current'
      bucketIndex: number
      bucketStart: string
      bucketEnd: string
      bucketLabel: string
      medianHours: number | null
    }
    ```
  - Extend duration-mode `WeeklyTrendChartProps` with optional `comparisonTrend?: DurationComparisonPoint[]`.
  - When `comparisonTrend` is absent, keep current duration behavior exactly as-is.
  - When `comparisonTrend` is present:
    - derive duration scale from all non-null `medianHours` in `comparisonTrend`;
    - build separate path segments for previous and current periods;
    - do not draw a path between the last previous point and first current point;
    - render previous path with `#6b7280` and dashed styling;
    - render current path with the current-series styling used by existing duration charts;
    - render latest accent only on the latest non-null current-period point, plus the current incoming segment only if preserving the existing shared-chart convention;
    - keep null values as gaps.
  - Add stable DOM hooks for comparison assertions, such as `data-period="previous"`, `data-period="current"`, `data-testid="comparison-boundary-divider"`, and period label test IDs.
  - If comparison data is malformed, fail closed in tests and implementation: exactly 8 previous points followed by exactly 8 current points is the only supported comparison shape.
  - Keep line-mode props and behavior unchanged.
  - **Releasable**: after this task, the chart component can render comparison duration data through an explicit opt-in prop.
- **Tests (TDD)** — `tests/components/weekly-trend-chart.test.tsx`:
  - Unit: `weekly_chart_renders_duration_comparison_segments` — previous/current paths render with distinct stroke styles.
  - Unit: `weekly_chart_does_not_connect_previous_to_current_segment` — no path crosses the divider boundary.
  - Unit: `weekly_chart_current_accent_never_applies_to_previous_period` — previous-only data receives no current accent.
  - Unit: `weekly_chart_current_accent_absent_when_current_period_all_null` — previous values do not receive the current accent when the current segment has no values.
  - Unit: `weekly_chart_comparison_preserves_null_gaps` — null buckets break paths.
  - Unit: `weekly_chart_comparison_exposes_stable_period_selectors` — previous/current paths, divider, and period labels have stable test hooks.
  - Unit: `weekly_chart_first_review_duration_behavior_unchanged` — duration chart without comparison prop remains single-series.
  - Unit: `weekly_chart_pr_size_line_behavior_unchanged` — line-mode PR Size rendering and detached point behavior remain unchanged.
  - Checkpoint: `npm run test -- tests/components/weekly-trend-chart.test.tsx`

#### Task 2.2 — Comparison chart labels, divider, and accessible metadata
- [x] **File**: `src/components/dashboard/weekly-trend-chart.tsx`
- **Depends on**: Task 2.1
- **Description**:
  - Add visible previous/current period labels in comparison mode.
  - Add a visual divider at the previous/current boundary.
  - Show selected x-axis labels only in comparison mode: previous start, divider boundary, current start if distinct from divider, and current end.
  - Since the divider boundary and current start are the same instant, render one shared boundary label unless the final implementation proves a second label is visually distinct and non-overlapping.
  - Keep all 16 points represented in DOM/SVG metadata or caller-provided screen-reader output.
  - Support `ariaLabel` override so PR Cycle Time can name the chart as a 16-week comparison trend.
  - Do not rely on color alone: previous segment must be dashed and labeled.
  - Ensure label text has stable positions and does not change the SVG viewBox.
  - **Releasable**: after this task, the shared chart presents comparison mode with visible period context and accessible chart metadata.
- **Tests (TDD)** — `tests/components/weekly-trend-chart.test.tsx`:
  - Unit: `weekly_chart_comparison_renders_previous_current_period_labels` — labels are visible.
  - Unit: `weekly_chart_comparison_renders_boundary_divider` — divider is present at the period boundary.
  - Unit: `weekly_chart_comparison_uses_selected_x_axis_labels` — not all 16 x-labels render visually.
  - Unit: `weekly_chart_comparison_accepts_aria_label` — role image has the provided 16-week comparison label.
  - Unit: `weekly_chart_comparison_uses_non_color_distinction` — previous path has dashed styling.
  - Checkpoint: `npm run test -- tests/components/weekly-trend-chart.test.tsx`

### Phase 3 — Dashboard Integration
> **Releasable**: when Task 3.2 is complete, the PR Cycle Time section uses the 16-week comparison chart while the rest of the dashboard remains unchanged.

#### Task 3.1 — PR Cycle Time dashboard chart wiring
- [x] **File**: `src/components/dashboard/PrCycleTimeDashboard.tsx`
- **Depends on**: Task 1.2, Task 2.2
- **Description**:
  - Use `data.comparisonWeeklyTrend` as the source for the PR Cycle Time trend chart.
  - Pass `comparisonTrend={data.comparisonWeeklyTrend}` to `WeeklyTrendChart`.
  - Set `ariaLabel="16-week PR cycle time comparison trend"`.
  - Compute `weeklyTrendDurationUnit` from all non-null comparison trend values.
  - Keep fallback behavior explicit for transitional/test states only if the payload is optional during rollout; the completed contract should require `comparisonWeeklyTrend`.
  - Update hidden list `data-testid="weekly-trend-list"` to render all 16 comparison buckets.
  - Include period label text in each hidden list item: `previous` or `current`.
  - Keep `data.weeklyTrend` untouched for compatibility but stop using it for the visible PR Cycle Time chart.
  - **Releasable**: after this task, the PR Cycle Time dashboard renders the 16-bucket comparison trend.
- **Tests (TDD)** — `tests/components/pr-cycle-time-dashboard.test.tsx`:
  - Unit: `dashboard_renders_16_week_pr_cycle_time_comparison_trend` — trend list has 16 items and chart has 16-week aria label.
  - Unit: `dashboard_comparison_trend_hidden_list_labels_previous_and_current_periods` — accessible list identifies periods.
  - Unit: `dashboard_comparison_trend_uses_all_points_for_duration_unit_selection` — axis unit reflects max across previous and current points.
  - Unit: `dashboard_comparison_trend_preserves_null_vs_zero_duration` — null bucket says empty, zero bucket remains visible.
  - Checkpoint: `npm run test -- tests/components/pr-cycle-time-dashboard.test.tsx`

#### Task 3.2 — PR Cycle Time title, help copy, and baseline copy
- [x] **File**: `src/components/dashboard/PrCycleTimeDashboard.tsx`
- **Depends on**: Task 3.1
- **Description**:
  - Change chart heading from `8-week PR cycle time trend` to copy that communicates `16-week` and previous-plus-current 8 buckets.
  - Update `CardHowToRead` copy to explain:
    - muted/dashed first segment is the previous comparison period;
    - dark second segment is the current dashboard period;
    - gaps mean no merged PRs in that bucket.
  - When `data.metric.baselineStatus === 'pending'`, add copy explaining previous-period points are shown for context and do not represent an available baseline.
  - Cover every current baseline-pending path from `comparePeriods`: fewer than 3 previous merged PRs, `previousMedianHours === null`, and `previousMedianHours === 0`.
  - When current period has no merged PRs, keep the existing card no-data state and ensure chart copy prevents previous-period history from being mistaken for current performance.
  - **Releasable**: after this task, chart text explains how to interpret the 16-week comparison in normal and baseline-pending states.
- **Tests (TDD)** — `tests/components/pr-cycle-time-dashboard.test.tsx`:
  - Unit: `dashboard_comparison_trend_heading_names_previous_and_current_8_weeks` — heading communicates the new scope.
  - Unit: `dashboard_comparison_trend_how_to_read_maps_muted_segment_to_previous_median` — help copy explains segment meaning.
  - Unit: `dashboard_comparison_trend_baseline_pending_copy` — baseline-pending copy appears only when comparison baseline is unavailable.
  - Unit: `dashboard_comparison_trend_zero_or_null_previous_median_still_context_only` — previous points render but copy does not present them as an available baseline.
  - Unit: `dashboard_comparison_trend_no_current_data_copy_does_not_present_previous_as_current` — no-current state remains clear.
  - Checkpoint: `npm run test -- tests/components/pr-cycle-time-dashboard.test.tsx`

### Phase 4 — Visual Polish And Verification
> **Releasable**: when Task 4.2 is complete, the feature is visually verified and ready for implementation review.

#### Task 4.1 — Comparison trend styles
- [x] **File**: `src/components/dashboard/PrCycleTimeDashboard.css`
- **Depends on**: Task 2.2, Task 3.2
- **Description**:
  - Add minimal classes or CSS variables for comparison labels/divider if SVG inline attributes are not enough.
  - Reuse existing palette values:
    - previous segment/reference: `#6b7280`
    - current segment: `#111827`
    - latest current accent: existing `#d97706`
  - Ensure no decorative card nesting or new metric section is introduced.
  - Preserve responsive card dimensions and avoid text overlap.
  - **Releasable**: after this task, comparison trend styling is consistent with the dashboard visual system.
- **Tests (TDD)** — `tests/components/weekly-trend-chart.test.tsx`, `tests/components/pr-cycle-time-dashboard.test.tsx`:
  - Unit: `weekly_chart_comparison_previous_segment_uses_muted_reference_color` — previous stroke matches `#6b7280`.
  - Unit: `weekly_chart_comparison_current_segment_uses_primary_color` — current stroke matches `#111827`.
  - Unit: `weekly_chart_comparison_latest_current_point_uses_accent` — latest current point uses existing accent.
  - Checkpoint: `npm run test -- tests/components/weekly-trend-chart.test.tsx tests/components/pr-cycle-time-dashboard.test.tsx`

#### Task 4.2 — Browser verification for desktop and mobile
- [x] **File**: `tests/e2e/pr-cycle-time-dashboard.spec.ts` or a new focused e2e spec under `tests/e2e/`
- **Depends on**: Task 4.1
- **Description**:
  - Add or update E2E coverage for the PR Cycle Time 16-week comparison trend.
  - Seed data or use an existing fixture path that produces previous and current comparison points.
  - Use deterministic seeded timestamps derived from `getDashboardDateRanges` or a fixed app clock; avoid `Date.now()`-relative rows that can drift across the previous/current boundary during long test runs.
  - Verify the 16-week chart heading is visible.
  - Verify previous/current labels or legend text are visible.
  - Verify rendered SVG is non-empty.
  - Use explicit viewport changes because `playwright.config.ts` currently defines only a Desktop Chrome project:
    - desktop: `page.setViewportSize({ width: 1280, height: 900 })`
    - mobile: `page.setViewportSize({ width: 390, height: 844 })`
  - Use browser screenshots or bounding-box assertions after each viewport change to prove labels, divider, and point values do not overlap incoherently.
  - Keep this focused on PR Cycle Time; do not add First Review or PR Size feature changes.
  - **Releasable**: after this task, the chart is verified in a real browser at desktop and mobile sizes.
- **Tests (TDD)** — `tests/e2e/pr-cycle-time-dashboard.spec.ts`:
  - E2E: `dashboard_e2e_shows_pr_cycle_time_16_week_comparison_trend` — heading, labels, and SVG render.
  - E2E: `dashboard_e2e_pr_cycle_time_comparison_trend_desktop_layout` — desktop layout has no incoherent overlap.
  - E2E: `dashboard_e2e_pr_cycle_time_comparison_trend_mobile_layout` — mobile layout has no incoherent overlap.
  - Checkpoint: `npm run test:e2e -- tests/e2e/pr-cycle-time-dashboard.spec.ts`

### Phase 5 — Regression Gates And Documentation
> **Releasable**: when Task 5.2 is complete, the plan's implementation is fully verified and documented.

#### Task 5.1 — Shared chart regression gate
- [x] **File**: `tests/components/first-review-trend-chart.test.tsx`, `tests/components/PrSizeTrendChart.test.tsx`, `tests/components/weekly-trend-chart.test.tsx`
- **Depends on**: Task 4.2
- **Description**:
  - Add or strengthen regression tests proving First Review remains an 8-week duration chart.
  - Add or strengthen regression tests proving PR Size remains line-mode and preserves completed-week plus optional current-partial behavior.
  - Ensure `WeeklyTrendChart` comparison mode is opt-in only.
  - Run component tests that cover all three chart consumers.
  - **Releasable**: after this task, shared chart regressions are covered outside the PR Cycle Time happy path.
- **Tests (TDD)** — component tests:
  - Unit: `first_review_trend_remains_8_week_duration_chart` — no comparison mode appears in First Review.
  - Unit: `pr_size_trend_remains_line_mode_with_detached_current_partial` — PR Size detached behavior remains intact.
  - Unit: `weekly_chart_duration_comparison_is_opt_in_only` — 16-point behavior does not trigger from array length alone.
  - Checkpoint: `npm run test -- tests/components/weekly-trend-chart.test.tsx tests/components/first-review-trend-chart.test.tsx tests/components/PrSizeTrendChart.test.tsx`

#### Task 5.2 — Final verification and documentation status
- [x] **File**: `Documentation/Completed/FIX-003-pr-cycle-time-16-week-comparison-trend.md`, `Documentation/Completed/pr-cycle-time-16-week-comparison-trend-brief.md`
- **Depends on**: Task 5.1
- **Description**:
  - Update this plan status from `Draft` to `Complete` only after implementation and verification pass.
  - If implementation changes final wording or accepted trade-offs, update the brief's Recommendation or Edge Cases section.
  - Run final verification:
    - `git diff --check`
    - `npm run lint`
    - `npm run typecheck`
    - `npm run build`
    - `npm run test -- --coverage`
    - `npm run test -- tests/metrics/pr-cycle-time-summary.test.ts tests/metrics/pr-cycle-time-dashboard.test.ts tests/components/weekly-trend-chart.test.tsx tests/components/pr-cycle-time-dashboard.test.tsx tests/components/first-review-trend-chart.test.tsx tests/components/PrSizeTrendChart.test.tsx`
    - `npm run test:e2e -- tests/e2e/pr-cycle-time-dashboard.spec.ts`
  - Run broader phase verification because the shared chart renderer is touched:
    - `npm run verify:phase03`
  - **Releasable**: after this task, the feature is complete and ready to commit.
- **Tests (TDD)** — final gates:
  - Checkpoint: `git diff --check && npm run lint && npm run typecheck && npm run build && npm run test -- --coverage && npm run test -- tests/metrics/pr-cycle-time-summary.test.ts tests/metrics/pr-cycle-time-dashboard.test.ts tests/components/weekly-trend-chart.test.tsx tests/components/pr-cycle-time-dashboard.test.tsx tests/components/first-review-trend-chart.test.tsx tests/components/PrSizeTrendChart.test.tsx && npm run test:e2e -- tests/e2e/pr-cycle-time-dashboard.spec.ts && npm run verify:phase03`

#### Task 5.3 — Post-review variable range correction
- [x] **File**: `src/metrics/pr-cycle-time-summary.ts`, `src/components/dashboard/weekly-trend-chart.tsx`, `src/components/dashboard/PrCycleTimeDashboard.tsx`
- **Depends on**: Task 5.2
- **Description**:
  - Address implementation review finding that non-default dashboard ranges, such as 4 weeks, were misrepresented by hardcoded 8-bucket/16-week comparison labels.
  - Derive previous/current comparison bucket counts from `current.weeks`.
  - Derive chart validation, divider position, period labels, selected x-axis labels, heading, and `aria-label` from the actual comparison bucket count.
  - Preserve the default 8-week dashboard behavior as a 16-week comparison trend.
  - **Releasable**: after this task, configured dashboard ranges do not produce misleading comparison trend copy or buckets.
- **Tests (TDD)**:
  - Unit: `comparison_trend_uses_range_week_count_for_non_default_ranges`
  - Integration: `dashboard_comparison_trend_matches_requested_range_week_count`
  - Component: `weekly_chart_comparison_labels_follow_period_bucket_count`
  - Component: `weekly_chart_comparison_uses_selected_x_axis_labels_for_shorter_ranges`
  - Component: `dashboard_comparison_trend_heading_follows_requested_range`
  - Checkpoint: `npm run test -- tests/metrics/pr-cycle-time-summary.test.ts tests/metrics/pr-cycle-time-dashboard.test.ts tests/components/weekly-trend-chart.test.tsx tests/components/pr-cycle-time-dashboard.test.tsx`
