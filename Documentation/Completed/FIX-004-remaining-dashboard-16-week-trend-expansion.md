# FIX-004 — Remaining Dashboard 16-Week Trend Expansion
**Purpose**: Expand the remaining dashboard trend history after FIX-003: First Review adopts the shipped previous-plus-current comparison UX, and PR Size shows a fixed 16 completed UTC ISO-week history plus its existing optional detached current-week-so-far point.
**Audience**: Engineering leaders using the local dashboard, plus implementers maintaining First Review, PR Size, and shared dashboard chart components.
**Status**: Complete

---

## Background
FIX-003 shipped a previous-plus-current comparison trend for PR Cycle Time. First Review still exposes only the current dashboard-range weekly series, and its builder uses fixed millisecond increments that can disagree with local calendar-day boundaries across daylight-saving transitions. PR Size correctly distinguishes completed weeks from an optional detached current-week-so-far point, but its completed history still follows dashboard `range.weeks` and defaults to 8 points.

The authoritative brief is `Documentation/Completed/remaining-dashboard-16-week-trend-expansion-brief.md`. FIX-004 was explicitly scheduled as a pre-Phase-04 stabilization gate and is complete. Phase 04 Jira Flow Metrics remains the documented next feature step in `Documentation/README.md` and `Documentation/Roadmap/trackable-roadmap.md`.

## Goal
First Review shows the previous dashboard range followed by the current dashboard range with the shipped PR Cycle Time comparison presentation, while preserving First Review card, table, exception, human-review, synced-repository, and exclusive-boundary semantics. PR Size independently shows exactly 16 completed UTC ISO weeks plus its existing optional detached current-week-so-far point, without changing card or table calculations.

---

## Scope

### In Scope
- Add `firstReview.comparisonWeeklyTrend: FirstReviewComparisonPoint[]`.
- Replace the First Review fixed-millisecond trend builder with a local calendar-day comparison bucket builder and derive compatibility `weeklyTrend` from its current half.
- Wire First Review into the shared duration-comparison chart opt-in with dynamic total-depth copy, context notes, and a complete accessible list.
- Make PR Size request exactly 16 completed UTC ISO weeks independent of dashboard `range.weeks`.
- Add sparse visible completed x-axis labels for PR Size line mode when completed history exceeds 8 points.
- Preserve PR Size detached current-week-so-far confidence, low-sample, future-row exclusion, and overflow-value behavior.
- Add deterministic responsive Playwright fixtures, assertions, retained screenshots, and reviewed sign-off.
- Correct the stale completed Phase 02 documentation only after roadmap scheduling authorizes implementation.

### Out of Scope
- Changing metric-card, exception, or team-table calculations.
- Changing PR Cycle Time behavior.
- Adding Jira, auth, cloud deployment, AI recommendations, or later quality metrics.
- Adding user-controlled range selection, config keys, or environment overrides.
- Adding placeholder UI or a large shared-chart refactor.
- Changing roadmap phase ordering or completed Phase 02 behavior beyond the verified documentation correction.

---

## Acceptance criteria
- [x] Phase 04 remains the documented next feature step after the explicitly scheduled FIX-004 stabilization gate.
- [x] Default dashboard `range.weeks` remains `8`.
- [x] First Review exposes `comparisonWeeklyTrend` with `range.weeks` previous points followed by `range.weeks` current points, and 1-based `bucketIndex` resets at the period boundary.
- [x] Default First Review comparison depth is 16 points; `weeks = 4` produces 8 comparison points.
- [x] First Review compatibility `weeklyTrend` retains its current-range-only shape and is derived from the current half of the same comparison bucket builder.
- [x] First Review uses local calendar-day additions, half-open internal buckets, per-half final remainder handling, inclusive `current.from`, and exclusive `current.to`.
- [x] First Review comparison data uses review-synced repositories and first qualifying human reviews only.
- [x] First Review comparison UX includes muted dashed previous segment, dark current segment, no cross-boundary line, divider, period labels, sparse visible x-axis labels, current-only latest accent, null gaps, and all points in the accessible list.
- [x] First Review title, help text, section `aria-label`, and chart `aria-label` dynamically use total comparison depth and explain previous then current segments.
- [x] First Review shows baseline-context copy when the previous baseline is pending and no-current-data copy when the current period has no qualifying human-reviewed PRs.
- [x] PR Size returns exactly 16 completed UTC ISO weeks regardless of dashboard `range.weeks`, plus at most one detached current-week-so-far point.
- [x] PR Size line mode with more than 8 completed points renders completed x-axis labels only at indexes `0`, `floor((count - 1) / 2)`, and `count - 1`, and always renders the detached label when present.
- [x] PR Size line mode uses the shared comparison presentation for its 16 completed weeks, with title `16-week PR Size comparison trend`, compact previous/latest period labels, divider, muted dashed previous segment, and dark latest segment.
- [x] PR Size preserves 8-or-fewer plain-line labels, duration-comparison labels, accessible list completeness, confidence wording, low-sample wording, future-row exclusion, overflow marker, and actual detached numeric value.
- [x] Responsive Playwright covers First Review comparison, PR Size completed-only, PR Size normal detached partial, and PR Size detached overflow at `1280x900` and `390x844`, with bounds, overlap, retained screenshots, and rendered-browser sign-off.
- [x] Dashboard order remains PR Cycle Time, First Review Time, PR Size.
- [x] No card, exception, or team-table semantics change.

---

## What does NOT change
- `range.weeks` default remains `8`.
- First Review card periods remain previous `[previous.from, current.from)` and current `[current.from, current.to)`.
- First Review uses the first qualifying human review; bot-only reviews do not enter median, trend, baseline, or comparison calculations.
- PR Size card, table, exceptions, visibility gate, measured-count confidence, and future-row clamping retain their shipped semantics.
- PR Cycle Time comparison payload and chart behavior remain unchanged.
- No database schema, migration, collector, route, external API, config, or environment-variable changes are introduced.
- The one-page dashboard order remains PR Cycle Time, First Review Time, then PR Size.

---

## Known limitations / accepted trade-offs
- PR Size chart depth intentionally differs from the dashboard card/table window: the chart is fixed at 16 completed UTC ISO weeks, while non-trend PR Size surfaces retain selected dashboard-range semantics.
- First Review and PR Cycle Time share the comparison renderer but preserve metric-specific boundary behavior: First Review excludes `current.to`; PR Cycle Time retains its shipped final-boundary inclusion.
- Sparse visible labels improve responsive readability; every trend point remains available through accessible lists.
- Browser screenshots require manual review because jsdom cannot prove rendered SVG text bounds.

---

## Architecture
- `src/metrics/first-review-time.ts`
  - Add:
    ```ts
    export type FirstReviewTrendPeriod = 'previous' | 'current'

    export type FirstReviewComparisonPoint = {
      period: FirstReviewTrendPeriod
      bucketIndex: number
      bucketStart: string
      bucketEnd: string
      bucketLabel: string
      medianHours: number | null
    }

    export function getFirstReviewComparisonWeeklyTrend(input: {
      prs: PrAggregate[]
      previous: DateRange
      current: DateRange
      weeks: number
    }): FirstReviewComparisonPoint[]
    ```
  - Build exactly `weeks` previous buckets then `weeks` current buckets with local calendar-day additions.
  - Each half uses standard 7-local-day bucket starts and forces its final bucket end to the period boundary so any local-day remainder is absorbed without gaps or overlaps.
  - Every bucket is half-open. The final current bucket ends at `current.to` and remains exclusive.
  - Replace `getFirstReviewWeeklyTrend(prs, range)` fixed-millisecond behavior with a shape-preserving current-half projection from the comparison builder. Prefer a wrapper with an explicit `weeks` argument over a second bucket implementation.
- `src/metrics/pr-cycle-time-dashboard.ts`
  - Extend:
    ```ts
    export type FirstReview = {
      metric: FirstReviewMetric
      exceptions: FirstReviewException[]
      weeklyTrend: Array<{ weekStart: string; medianHours: number | null }>
      comparisonWeeklyTrend: FirstReviewComparisonPoint[]
      teamBreakdown: FirstReviewTeamRow[]
    }
    ```
  - Populate First Review comparison points from review-synced aggregates only, using `previous`, `current`, and `current.weeks`.
  - Derive compatibility `weeklyTrend` from the current half of `comparisonWeeklyTrend`.
  - Change PR Size trend orchestration only:
    ```ts
    export const PR_SIZE_COMPLETED_TREND_WEEKS = 16
    ```
    and call `getPrSizeWeeklyTrend(sizePrsForTrend, PR_SIZE_COMPLETED_TREND_WEEKS, now, { includeCurrentPartial: true })`.
- `src/components/dashboard/FirstReviewSection.tsx`
  - Pass `firstReview.comparisonWeeklyTrend` and `firstReview.metric` into `FirstReviewTrendChart`.
  - Derive the section `aria-label` from total comparison depth so visible and accessible naming remain aligned.
- `src/components/dashboard/FirstReviewTrendChart.tsx`
  - Accept:
    ```ts
    type Props = {
      weeklyTrend: Array<{ weekStart: string; medianHours: number | null }>
      comparisonWeeklyTrend: FirstReviewComparisonPoint[]
      metric: FirstReviewMetric
    }
    ```
  - Use `comparisonWeeklyTrend` for visible chart rendering and accessible list output.
  - Derive total comparison depth from `comparisonWeeklyTrend.length`.
  - Reuse `WeeklyTrendChart` duration `comparisonTrend` opt-in.
  - Render baseline-context and no-current-data notes without changing card behavior.
- `src/components/dashboard/weekly-trend-chart.tsx`
  - Preserve shipped duration comparison behavior.
  - In plain line mode only, add a small x-axis label-index helper:
    ```ts
    export function visiblePlainLineAxisLabelIndexes(completedCount: number): number[]
    ```
  - Return all indexes for counts `<= 8`; return `[0, Math.floor((completedCount - 1) / 2), completedCount - 1]` for counts `> 8`, de-duplicated.
  - Detached-point labels remain independently rendered whenever a detached point exists.
- `tests/e2e/fixtures/`
  - Add deterministic scenario fixtures for First Review comparison, PR Size completed-only, PR Size detached partial, and PR Size detached overflow.
- `tests/e2e/remaining-dashboard-trend-expansion.spec.ts`
  - Run all four fixture scenarios at desktop and mobile viewports.
  - Retain screenshots under `test-results/`.
- `Documentation/Completed/phase-02-first-review-time.md`
  - Correct stale metric-definition prose so it matches shipped first-qualifying-human-review behavior after implementation is scheduled.
- `package.json`
  - Add `verify:fix004` only if a focused release-gate script materially improves repeatability; otherwise keep the explicit final checkpoint command in this plan.

No new config keys or environment variables are introduced.

---

## Tests
- **first_review_comparison_returns_previous_then_current_points** (unit): dynamic comparison depth, metadata, order, and reset `bucketIndex`.
- **first_review_comparison_uses_local_calendar_day_buckets_across_dst** (unit): both halves remain contiguous across daylight-saving transitions.
- **first_review_comparison_preserves_exclusive_current_to** (unit): `current.from` counts once and `current.to` remains excluded.
- **first_review_weekly_trend_is_current_half_projection** (unit): compatibility shape remains current-only and cannot disagree with comparison buckets.
- **dashboard_first_review_comparison_excludes_unsynced_repositories** (integration): only review-synced repositories contribute.
- **dashboard_first_review_comparison_uses_first_qualifying_human_review** (integration): bot-only review data does not contribute.
- **first_review_chart_renders_dynamic_comparison_copy_and_accessible_list** (component): total depth, period semantics, null gaps, notes, and accessible list are correct.
- **dashboard_pr_size_trend_uses_fixed_16_completed_weeks** (integration): dashboard `weeks = 8` and `weeks = 4` both produce 16 completed PR Size points plus optional detached partial.
- **weekly_chart_plain_line_axis_labels_are_sparse_over_eight_points** (component): completed labels use first, midpoint, last indexes only.
- **weekly_chart_plain_line_labels_preserve_short_history_and_detached_label** (component): short histories and detached label behavior remain unchanged.
- **remaining_dashboard_trends_responsive_layout** (e2e): all four deterministic fixtures pass desktop/mobile bounds and overlap assertions with retained screenshots.
- **phase_regression_gates** (integration/e2e): Phase 01, Phase 02, and Phase 03 verification paths remain green where shared rendering changes apply.

---

## Documentation update
- [x] `Documentation/README.md`, section: Next Step, path: `Documentation/README.md` — schedule FIX-004 explicitly before implementation begins, while keeping phase ordering intentional.
- [x] `Documentation/Roadmap/trackable-roadmap.md`, section: Current Next Step, path: `Documentation/Roadmap/trackable-roadmap.md` — add the scheduled stabilization work before execution.
- [x] `Documentation/Completed/phase-02-first-review-time.md`, section: metric definition, path: `Documentation/Completed/phase-02-first-review-time.md` — correct stale bot-review wording during scheduled implementation.
- [x] `Documentation/Completed/FIX-004-remaining-dashboard-16-week-trend-expansion.md`, section: Status and browser sign-off, path: `Documentation/Completed/FIX-004-remaining-dashboard-16-week-trend-expansion.md`.

---

## Task breakdown

### Phase 0 — Scheduling Gate And Documentation Alignment
> **Releasable**: when Task 0.2 is complete, FIX-004 is explicitly scheduled and documentation no longer contradicts shipped First Review semantics. Do not execute later phases before this gate.

#### Task 0.1 — Explicit roadmap scheduling authorization
- [x] **File**: `Documentation/README.md`, `Documentation/Roadmap/trackable-roadmap.md`
- **Depends on**: nothing
- **Description**:
  - Add FIX-004 as an explicitly scheduled dashboard-stabilization item before implementation begins.
  - Preserve the product decision that Jira Flow Metrics is the next feature phase; document whether FIX-004 is a pre-Phase-04 stabilization gate or a deliberately scheduled interruption.
  - Link this plan and its authoritative brief.
  - Do not mark implementation tasks complete in this documentation-only scheduling commit.
- **Releasable**: after this task, execution of FIX-004 is authorized without silently changing roadmap priorities.
- **Tests (TDD)** — documentation checks:
  - Static: roadmap and README both link `FIX-004-remaining-dashboard-16-week-trend-expansion.md`.
  - Static: roadmap wording still states the intentional Phase 04 position.
  - Checkpoint: `git diff --check && rg -n "FIX-004|Phase 04" Documentation/README.md Documentation/Roadmap/trackable-roadmap.md`

#### Task 0.2 — Correct stale completed Phase 02 review semantics
- [x] **File**: `Documentation/Completed/phase-02-first-review-time.md`
- **Depends on**: Task 0.1
- **Description**:
  - Correct the stale metric-definition text that says bot-submitted reviews count.
  - State that shipped median, trend, baseline, and comparison semantics use the first qualifying human review.
  - Preserve hygiene-specific bot-review documentation where it remains accurate.
  - Keep the edit narrowly scoped to the verified bot-review semantics drift; do not opportunistically rewrite the completed phase document.
  - Keep this as a documentation-only task.
- **Releasable**: after this task, completed Phase 02 documentation matches shipped code before FIX-004 implementation begins.
- **Tests (TDD)** — documentation checks:
  - Static: metric-definition text names first qualifying human review.
  - Static: no inaccurate claim remains that bot-submitted reviews enter First Review latency calculations.
  - Checkpoint: `git diff --check && rg -n "human|bot|First Review" Documentation/Completed/phase-02-first-review-time.md`

### Phase 1 — First Review Comparison Data
> **Releasable**: when Task 1.2 is complete, the dashboard payload exposes First Review previous-plus-current comparison points while compatibility `weeklyTrend` remains current-range-only.

#### Task 1.1 — First Review local-calendar comparison bucket builder
- [x] **File**: `src/metrics/first-review-time.ts`
- **Depends on**: Task 0.2
- **Description**:
  - Add `FirstReviewTrendPeriod`, `FirstReviewComparisonPoint`, and `getFirstReviewComparisonWeeklyTrend(...)` exactly as specified in Architecture.
  - Use local calendar-day addition for all bucket boundaries; remove the fixed `WEEK_MS` bucket stepping path.
  - Build `weeks` previous points followed by `weeks` current points.
  - Reset `bucketIndex` to `1` at the current-period boundary.
  - Keep every bucket half-open, including the final current bucket ending at exclusive `current.to`.
  - Force each half's final bucket end to its exact period boundary so daylight-saving transitions cannot create gaps or overlaps.
  - Use `firstQualifyingHumanReviewAt` and existing `median` behavior. Null buckets remain `medianHours: null`.
  - Make compatibility `getFirstReviewWeeklyTrend(...)` a current-half projection from this builder, with explicit `weeks`; do not maintain a second bucket loop.
- **Releasable**: after this task, First Review comparison and compatibility trends share one DST-safe bucket implementation.
- **Tests (TDD)** — `tests/metrics/first-review-trend.test.ts`:
  - Unit: `first_review_comparison_returns_previous_then_current_points`.
  - Unit: `first_review_comparison_bucket_index_resets_at_current_period`.
  - Unit: `first_review_comparison_uses_requested_range_depth`.
  - Unit: `first_review_comparison_internal_boundary_counts_once_in_later_bucket`.
  - Unit: `first_review_comparison_current_from_counts_once_in_current_bucket`.
  - Unit: `first_review_comparison_current_to_remains_exclusive`.
  - Unit: `first_review_comparison_local_calendar_buckets_remain_contiguous_across_dst`.
  - Unit: `first_review_comparison_final_bucket_absorbs_local_day_remainder`.
  - Unit: `first_review_comparison_null_buckets_remain_null`.
  - Unit: `first_review_weekly_trend_is_current_half_projection`.
  - Checkpoint: `npm run test -- tests/metrics/first-review-trend.test.ts`

#### Task 1.2 — Dashboard First Review comparison payload
- [x] **File**: `src/metrics/pr-cycle-time-dashboard.ts`, typed dashboard fixtures under `tests/`
- **Depends on**: Task 1.1
- **Description**:
  - Add `comparisonWeeklyTrend: FirstReviewComparisonPoint[]` to `FirstReview`.
  - Build comparison points from aggregates belonging to review-synced repositories only.
  - Use `previousRange`, `currentRange`, and `current.weeks`.
  - Derive `firstReview.weeklyTrend` from the current half of the same comparison result.
  - Preserve First Review card, team table, exception, freshness, and pending-section calculations.
  - Update every typed dashboard fixture or mock payload that constructs `FirstReview`.
- **Releasable**: after this task, API consumers can render First Review comparison history without losing compatibility payloads.
- **Tests (TDD)** — `tests/metrics/dashboard-phase-02.test.ts`, `tests/metrics/dashboard-types-phase-02.test.ts`:
  - Integration: `dashboard_first_review_exposes_default_16_point_comparison`.
  - Integration: `dashboard_first_review_exposes_8_point_comparison_for_four_week_range`.
  - Integration: `dashboard_first_review_weekly_trend_matches_current_comparison_half`.
  - Integration: `dashboard_first_review_comparison_excludes_unsynced_repositories`.
  - Integration: `dashboard_first_review_comparison_uses_first_qualifying_human_review`.
  - Type: `first_review_comparison_point_type_includes_period_boundaries_and_reset_index`.
  - Checkpoint: `npm run test -- tests/metrics/dashboard-phase-02.test.ts tests/metrics/dashboard-types-phase-02.test.ts`

### Phase 2 — First Review Comparison UX
> **Releasable**: when Task 2.2 is complete, First Review visibly renders the comparison chart with dynamic copy and context notes.

#### Task 2.1 — First Review comparison chart wiring and accessibility
- [x] **File**: `src/components/dashboard/FirstReviewTrendChart.tsx`, `src/components/dashboard/FirstReviewSection.tsx`
- **Depends on**: Task 1.2
- **Description**:
  - Extend `FirstReviewTrendChart` props with `comparisonWeeklyTrend` and `metric`.
  - Make the enclosing First Review section `aria-label` dynamic from total comparison depth.
  - Pass `comparisonTrend={comparisonWeeklyTrend}` into `WeeklyTrendChart` duration mode.
  - Derive title, section `aria-label`, chart `aria-label`, and help-copy depth from `comparisonWeeklyTrend.length`.
  - Explain that the muted dashed previous segment is followed by the dark current segment; gaps mean no qualifying human-reviewed PRs.
  - Render the screen-reader list from all comparison points in chronological order, including `period`, bucket label, and formatted median/null value.
  - Preserve `weeklyTrend` prop wiring only for the compatibility chart prop required by `WeeklyTrendChart`; do not render a second list.
- **Releasable**: after this task, First Review renders default 16-week and non-default dynamic comparison presentations accessibly.
- **Tests (TDD)** — `tests/components/first-review-trend-chart.test.tsx`, `tests/components/first-review-section.test.tsx`:
  - Unit: `first_review_chart_renders_default_16_week_comparison_title_and_aria`.
  - Unit: `first_review_chart_renders_dynamic_8_week_copy_for_four_week_range`.
  - Unit: `first_review_chart_passes_comparison_trend_opt_in`.
  - Unit: `first_review_chart_accessible_list_contains_previous_then_current_points`.
  - Unit: `first_review_chart_accessible_list_preserves_null_vs_zero`.
  - Unit: `first_review_section_passes_comparison_payload_and_metric`.
  - Checkpoint: `npm run test -- tests/components/first-review-trend-chart.test.tsx tests/components/first-review-section.test.tsx`

#### Task 2.2 — First Review comparison context notes
- [x] **File**: `src/components/dashboard/FirstReviewTrendChart.tsx`
- **Depends on**: Task 2.1
- **Description**:
  - When `metric.baselineStatus === 'pending'`, render visible copy stating that previous-period points are context and do not represent an available comparison baseline.
  - When the current comparison half has no non-null `medianHours`, render visible copy stating that previous-period history is context, not current performance.
  - Keep notes informational and non-alerting.
  - Keep card behavior unchanged.
- **Releasable**: after this task, First Review history cannot be misread as an available baseline or current performance.
- **Tests (TDD)** — `tests/components/first-review-trend-chart.test.tsx`:
  - Unit: `first_review_chart_baseline_pending_note_marks_previous_points_as_context`.
  - Unit: `first_review_chart_no_current_data_note_marks_history_as_context`.
  - Unit: `first_review_chart_available_baseline_with_current_data_omits_context_notes`.
  - Unit: `first_review_chart_all_null_comparison_renders_safely`.
  - Checkpoint: `npm run test -- tests/components/first-review-trend-chart.test.tsx`

### Phase 3 — PR Size Fixed 16-Completed-Week Trend
> **Releasable**: when Task 3.2 is complete, PR Size shows fixed 16-completed-week history with responsive sparse labels and unchanged detached-current semantics.

#### Task 3.1 — Dashboard PR Size fixed trend depth
- [x] **File**: `src/metrics/pr-cycle-time-dashboard.ts`
- **Depends on**: Task 0.2
- **Description**:
  - Add `export const PR_SIZE_COMPLETED_TREND_WEEKS = 16`.
  - Call `getPrSizeWeeklyTrend(sizePrsForTrend, PR_SIZE_COMPLETED_TREND_WEEKS, now, { includeCurrentPartial: true })`.
  - Keep card, exception, table, visibility, future-row clamp, and dashboard-range behavior unchanged.
  - Do not add config or environment overrides.
- **Releasable**: after this task, PR Size API output has 16 completed points and at most one detached-current candidate.
- **Tests (TDD)** — `tests/metrics/dashboard-phase-03.test.ts`, `tests/metrics/pr-size-metric.test.ts`:
  - Integration: `dashboard_pr_size_trend_returns_16_completed_weeks_for_default_range`.
  - Integration: `dashboard_pr_size_trend_returns_16_completed_weeks_for_four_week_dashboard_range`.
  - Integration: `dashboard_pr_size_trend_appends_at_most_one_current_partial_point`.
  - Integration: `dashboard_pr_size_non_trend_surfaces_keep_selected_dashboard_range`.
  - Regression: `dashboard_pr_size_future_row_exclusion_remains_intact`.
  - Checkpoint: `npm run test -- tests/metrics/dashboard-phase-03.test.ts tests/metrics/pr-size-metric.test.ts`

#### Task 3.2 — Sparse PR Size line-mode x-axis labels
- [x] **File**: `src/components/dashboard/weekly-trend-chart.tsx`
- **Depends on**: Task 3.1
- **Description**:
  - Add `visiblePlainLineAxisLabelIndexes(completedCount: number): number[]` exactly as specified in Architecture.
  - Apply it only when `comparisonTrend == null` and `valueMode === 'lines'`.
  - For line-mode completed histories over 8 points, render visible completed labels only at first, midpoint, and last indexes.
  - Use the shared segmented comparison presentation for the fixed 16 completed-week PR Size chart.
  - Keep every data point, point value, path segment, null gap, and accessible caller list unchanged.
  - Always render detached-point axis label when present.
  - Preserve all-label behavior for line histories of 8 or fewer points.
  - Preserve duration and duration-comparison label behavior unchanged.
- **Releasable**: after this task, PR Size 16-week labels remain readable without changing any chart data.
- **Tests (TDD)** — `tests/components/weekly-trend-chart.test.tsx`, `tests/components/PrSizeTrendChart.test.tsx`:
  - Unit: `weekly_chart_plain_line_axis_labels_are_sparse_over_eight_points`.
  - Unit: `weekly_chart_plain_line_axis_labels_use_floor_midpoint`.
  - Unit: `weekly_chart_plain_line_axis_labels_preserve_eight_or_fewer_points`.
  - Unit: `weekly_chart_plain_line_axis_labels_always_include_detached_label`.
  - Unit: `weekly_chart_duration_comparison_axis_labels_remain_unchanged`.
  - Unit: `pr_size_trend_accessible_list_contains_16_or_17_items`.
  - Unit: `pr_size_trend_detached_accessible_item_says_current_week_so_far`.
  - Regression: `pr_size_trend_detached_overflow_preserves_actual_numeric_value`.
  - Checkpoint: `npm run test -- tests/components/weekly-trend-chart.test.tsx tests/components/PrSizeTrendChart.test.tsx`

### Phase 4 — Responsive Browser Verification
> **Releasable**: when Task 4.2 is complete, all four deterministic scenarios are browser-verified at desktop and mobile sizes with retained screenshot evidence.

#### Task 4.1 — Deterministic FIX-004 Playwright fixtures
- [x] **File**: `tests/e2e/fixtures/remaining-dashboard-trend-expansion.fixture.ts`
- **Depends on**: Task 2.2, Task 3.2
- **Description**:
  - Add deterministic seeded scenarios:
    - `first-review-comparison`
    - `pr-size-completed-only`
    - `pr-size-detached-partial`
    - `pr-size-detached-overflow`
  - Use fixed timestamps or a deterministic clock boundary so rows cannot drift between buckets during a test run.
  - Seed review-synced and unsynced repositories where needed to prove First Review filtering.
  - Seed values that produce visible labels at realistic extremes, including PR Size detached overflow.
  - Keep fixtures separate so each visual contract can fail independently.
- **Releasable**: after this task, responsive verification scenarios are deterministic and independently runnable.
- **Tests (TDD)** — fixture tests:
  - Integration: `fixture_first_review_comparison_has_previous_and_current_data`.
  - Integration: `fixture_pr_size_completed_only_has_16_completed_points`.
  - Integration: `fixture_pr_size_detached_partial_has_16_plus_one_points`.
  - Integration: `fixture_pr_size_detached_overflow_exceeds_completed_axis_domain`.
  - Checkpoint: `npm run test -- tests/e2e/fixtures/remaining-dashboard-trend-expansion.fixture.test.ts`

#### Task 4.2 — Responsive Playwright assertions and retained screenshots
- [x] **File**: `tests/e2e/remaining-dashboard-trend-expansion.spec.ts`, `test-results/` screenshot artifacts
- **Depends on**: Task 4.1
- **Description**:
  - Run each fixture at:
    - desktop: `1280x900`
    - mobile: `390x844`
  - Assert SVG labels remain inside SVG bounds.
  - Assert each adjacent pair of rendered visible x-axis labels does not overlap.
  - Assert First Review previous/current period labels do not overlap.
  - Assert PR Size detached marker and value label remain inside SVG bounds.
  - Assert PR Size confidence note does not overlap the chart or team table.
  - Capture retained screenshots under `test-results/` for all eight fixture/viewport combinations.
  - Add the reviewed screenshot checklist to Task 5.2 before marking this plan complete.
- **Releasable**: after this task, FIX-004 visual behavior is verified in a real browser.
- **Tests (TDD)** — `tests/e2e/remaining-dashboard-trend-expansion.spec.ts`:
  - E2E: `first_review_comparison_responsive_layout`.
  - E2E: `pr_size_completed_only_responsive_layout`.
  - E2E: `pr_size_detached_partial_responsive_layout`.
  - E2E: `pr_size_detached_overflow_responsive_layout`.
  - Checkpoint: `npm run test:e2e -- tests/e2e/remaining-dashboard-trend-expansion.spec.ts`

### Phase 5 — Release Gates And Sign-Off
> **Releasable**: when Task 5.2 is complete, FIX-004 is fully verified, manually reviewed, and documented.

#### Task 5.1 — Focused FIX-004 verification gate
- [x] **File**: `package.json` only if adding `verify:fix004`
- **Depends on**: Task 4.2
- **Description**:
  - Add `verify:fix004` only if it improves repeatability; otherwise run the explicit command below.
  - Cover First Review metric/dashboard/components, shared chart behavior, PR Size metric/dashboard/components, and focused Playwright.
  - Run Phase 01 because the shared chart renderer is touched.
  - Run Phase 02 and Phase 03 because both shipped surfaces change.
- **Releasable**: after this task, automated release gates prove the chart changes did not regress earlier phases.
- **Tests (TDD)** — final automated gates:
  - Checkpoint: `git diff --check && npm run lint && npm run typecheck && npm run build && npm run test -- --coverage && npm run test:e2e -- tests/e2e/remaining-dashboard-trend-expansion.spec.ts && npm run verify:phase01 && npm run verify:phase02 && npm run verify:phase03`

#### Task 5.2 — Manual screenshot review and plan completion
- [x] **File**: `Documentation/Completed/FIX-004-remaining-dashboard-16-week-trend-expansion.md`, `Documentation/Completed/remaining-dashboard-16-week-trend-expansion-brief.md`
- **Depends on**: Task 5.1
- **Description**:
  - Review and record rendered-browser sign-off for the same deterministic fixtures used to retain screenshots under `test-results/`:
    - First Review comparison desktop and mobile.
    - PR Size completed-only desktop and mobile.
    - PR Size normal detached partial desktop and mobile.
    - PR Size detached overflow desktop and mobile.
  - Update this plan status from `Draft` to `Complete` only after all automated gates pass and all eight fixture/viewport combinations receive rendered-browser sign-off.
  - Update the brief only if implementation reveals a necessary wording correction or accepted trade-off.
  - Confirm Phase 04 roadmap wording remains intentional after completion.
- **Releasable**: after this task, FIX-004 is complete and ready to commit.
- **Tests (TDD)** — manual sign-off:
  - Checkpoint: `git diff --check && find test-results -type f | sort`

---

## Browser screenshot sign-off
- Browser policy prevented direct `file://` inspection of retained screenshot artifacts. The same deterministic fixtures were reviewed on the live local dashboard, with the retained Playwright screenshots generated by the passing responsive suite.
- [x] First Review comparison — `1280x900`
- [x] First Review comparison — `390x844`
- [x] PR Size completed-only — `1280x900`
- [x] PR Size completed-only — `390x844`
- [x] PR Size detached partial — `1280x900`
- [x] PR Size detached partial — `390x844`
- [x] PR Size detached overflow — `1280x900`
- [x] PR Size detached overflow — `390x844`
