# FIX-001 — Dynamic Duration Trend Chart
**Purpose**: Make duration trend charts readable for minute-, hour-, and day-scale values without changing metric calculations.
**Audience**: Engineering leaders using the local dashboard, plus implementers maintaining the shared dashboard chart components.
**Status**: Implemented

---

## Background
Before this fix, the PR Cycle Time and First Review trend charts received weekly median values in hours, but the shared chart plotted duration values as days and formatted labels with one decimal place. Local datasets with sub-day medians could therefore display real non-zero values as `0.0`, hiding signal during early setup and small-team usage. The feature brief is `Documentation/Completed/dynamic-duration-trend-chart-brief.md`.

## Goal
When this fix is complete, PR Cycle Time and First Review trend charts automatically choose minutes, hours, or days from the available non-null weekly values, keep one coherent unit per chart, preserve null-week gaps, and never label real non-zero duration points as `0.0`. PR Size trend charts continue to use line-based scaling and sparse tick behavior.

---

## Scope

### In Scope
- Dynamic duration unit selection for `medianHours` trend points in the shared weekly trend chart.
- Minutes when the maximum non-null duration is under 1 hour.
- Hours when the maximum non-null duration is at least 1 hour and under 48 hours.
- Days when the maximum non-null duration is 48 hours or more.
- Hours as the default unit when all duration weeks are null.
- Dynamic 10-20% y-axis headroom with a rounded readable axis top.
- Duration point labels with enough precision that non-zero values do not collapse to zero.
- Zero-duration weeks remain visible and distinguishable from null weeks.
- Screen-reader list values that match the selected duration unit behavior for PR Cycle Time and First Review.
- Visual line paths that break at null weeks instead of connecting across missing data.
- Regression coverage proving PR Size line-chart behavior remains unchanged.

### Out of Scope
- User-controlled unit toggles, because the brief chooses automatic unit selection.
- New dashboard sections, roadmap metrics, Jira work, AI recommendations, auth, cloud deployment, or quality metrics.
- Changes to PR Cycle Time, First Review, or PR Size metric calculations.
- Per-point mixed units, because one-axis charts must remain coherent.
- Treating empty weeks as zero.

---

## Acceptance criteria

> Acceptance criteria are verified in the final task. See [Task 2.1 — Final verification & documentation update].

---

## What does NOT change
- `src/metrics/pr-cycle-time-dashboard.ts` and other metric calculation modules continue returning hour-based `medianHours` values.
- `src/metrics/first-review-time.ts` and related First Review aggregation behavior stay unchanged.
- PR Size trend points continue using `medianLines`.
- Null weeks remain visual gaps and are not plotted as zero.
- Null weeks break SVG line segments; non-adjacent non-null points must not be joined across missing weeks.
- Zero-duration weeks are plotted at the baseline and labeled as zero in the selected unit; they are not treated as gaps.
- The one-page dashboard order remains PR Cycle Time, First Review Time, then PR Size.
- No author-level ranking or shaming surfaces are added.

---

## Known limitations / accepted trade-offs
- A single duration unit is selected per chart, even if individual points are much smaller than the largest point, because one unit keeps the y-axis readable.
- Small values on day-scale charts may display with more decimals, such as `0.02d`, because accuracy is more important than perfectly uniform label width.
- Tooltip-level raw values are deferred; this plan fixes visible labels and accessible list output first.

---

## Architecture
- Keep the fix in `src/components/dashboard/weekly-trend-chart.tsx`, because PR Cycle Time and First Review already share this component and PR Size can stay on the existing `medianLines` branch.
- Introduce a small non-visual duration scale helper in `src/components/dashboard/duration-trend-scale.ts` so SVG labels and screen-reader lists share one contract:
  - `type DurationUnit = 'minutes' | 'hours' | 'days'`
  - `type DurationScale = { unit: DurationUnit; axisLabel: string; suffix: string; valueFromHours: (hours: number) => number }`
  - `function selectDurationUnit(maxHours: number | null): DurationUnit`
  - `function durationScaleFor(unit: DurationUnit): DurationScale`
  - `function formatScaledDurationChartValue(displayValue: number, unit: DurationUnit): string`
  - `function formatDurationHoursForChart(hours: number, unit: DurationUnit): string`
- Keep formatter input semantics explicit:
  - `formatScaledDurationChartValue` receives the already-converted chart value in the selected unit.
  - `formatDurationHoursForChart` receives source `medianHours`, converts it through `durationScaleFor(unit).valueFromHours`, then delegates to `formatScaledDurationChartValue`.
- Keep `WeeklyTrendLinesPoint` behavior separate from duration behavior with an explicit chart mode:
  - Add `valueMode: 'duration' | 'lines'` to `WeeklyTrendChart`.
  - PR Cycle Time and First Review pass `valueMode="duration"`.
  - PR Size passes `valueMode="lines"`.
  - Do not infer chart mode from only the first trend point; empty, all-null, and sparse trend arrays must still render in the caller-selected mode.
  - Prefer a discriminated props type so `valueMode="duration"` accepts only `medianHours` trend data and `valueMode="lines"` accepts only `medianLines` trend data.
- Update `buildAxis(maxNumeric: number, linesMode: boolean)` or split it into `buildDurationAxis(...)` and `buildLineAxis(...)`.
  - Duration axis calculation must apply a testable 10-20% pre-rounding headroom value before selecting a nice rounded top when the maximum converted duration is greater than zero.
  - Zero-only duration charts use the selected unit with a small positive readable axis top, such as `1` minute for a minutes-scale zero-only chart, so baseline points can render without divide-by-zero behavior.
  - The helper should expose enough data to tests, such as `paddedMax`, so tests can prove the padding is in range instead of only proving the final top tick is greater than the maximum.
  - The function must continue preserving sparse line ticks for PR Size values above 99.
- Build SVG paths from contiguous runs of original week indexes.
  - A null week between two non-null values must create separate path segments or isolated points, not one continuous line across the gap.
  - This path segmentation applies to both duration charts and PR Size line charts.
- `WeeklyTrendChart` continues to accept:
  - `weeklyTrend: PrCycleTimeDashboard['weeklyTrend'] | WeeklyTrendLinesPoint[]`
  - `ariaLabel?: string`
  - `yAxisLabel?: string`
  - `valueMode: 'duration' | 'lines'`
  - The implementation should encode this as a discriminated TypeScript prop union if that stays simple.
- `yAxisLabel` remains honored for line charts. For duration charts, the selected duration scale supplies `Minutes`, `Hours`, or `Days`.
- `FirstReviewTrendChart` and the PR Cycle Time trend screen-reader list must import the shared duration helper and use the same selected-unit rules as the visible chart.
- No new config keys, environment variables, database changes, routes, server functions, or API contracts are introduced.

---

## Task breakdown

### Phase 1 — Shared Duration Chart Behavior
> **Releasable**: after Task 1.3, both duration charts render readable units and PR Size behavior is regression-covered.

#### Task 1.1 — Duration scale selection and label formatting
- [x] **File**: `src/components/dashboard/duration-trend-scale.ts`, `src/components/dashboard/weekly-trend-chart.tsx`
- **Depends on**: nothing
- **Description**:
  - Add `type DurationUnit = 'minutes' | 'hours' | 'days'`.
  - Add `type DurationScale = { unit: DurationUnit; axisLabel: string; suffix: string; valueFromHours: (hours: number) => number }`.
  - Add `function selectDurationUnit(maxHours: number | null): DurationUnit`.
  - `selectDurationUnit(null)` returns `'hours'`.
  - `selectDurationUnit(maxHours)` returns `'minutes'` when `maxHours < 1`, `'hours'` when `1 <= maxHours < 48`, and `'days'` when `maxHours >= 48`.
  - Add `function durationScaleFor(unit: DurationUnit): DurationScale`.
  - `durationScaleFor('minutes')` multiplies hours by `60`, uses axis label `Minutes`, and suffix `m`.
  - `durationScaleFor('hours')` keeps hours unchanged, uses axis label `Hours`, and suffix `h`.
  - `durationScaleFor('days')` divides hours by `24`, uses axis label `Days`, and suffix `d`.
  - Add `function formatScaledDurationChartValue(displayValue: number, unit: DurationUnit): string`.
  - Add `function formatDurationHoursForChart(hours: number, unit: DurationUnit): string`.
  - `formatScaledDurationChartValue` formats values that are already in the selected display unit.
  - `formatDurationHoursForChart` accepts source hour values, converts them through `durationScaleFor(unit).valueFromHours`, then formats the scaled value.
  - Formatting must never return a zero-looking label for a finite positive value. Examples: `formatDurationHoursForChart(0.5, 'minutes')` is `30m`; `formatDurationHoursForChart(1.5, 'hours')` is `1.5h`; `formatDurationHoursForChart(0.5, 'days')` is `0.02d`.
  - Tiny finite positive values must stay non-zero-looking in every unit, including hours-scale values such as `formatDurationHoursForChart(0.004, 'hours')`.
  - Use a deterministic precision rule:
    - exact zero renders as `0m`, `0h`, or `0d`;
    - values of `1` or more use the fewest decimals needed up to one decimal place;
    - positive values below `1` use the fewest decimals needed to show a non-zero digit, capped at four decimals;
    - values still below the four-decimal floor render as a less-than label such as `<0.0001h`, not as zero.
  - Exact zero formats as `0m`, `0h`, or `0d` according to the selected chart unit.
  - Keep line labels as rounded integers with no suffix.
  - Export only the duration scale and formatting helpers needed by wrapper components or tests; keep line-chart helpers private unless tests need them.
- **Releasable**: after this task, duration unit and label rules are available for the chart implementation.
- **Tests (TDD)** — `tests/components/weekly-trend-chart.test.tsx`:
  - Unit: `duration_chart_uses_minutes_under_one_hour` — renders hour values below 1 hour and asserts axis label `Minutes` plus point labels such as `30m`.
  - Unit: `duration_chart_uses_hours_from_one_to_under_forty_eight_hours` — renders values around 1-47.9 hours and asserts axis label `Hours` plus non-zero labels.
  - Unit: `duration_chart_uses_days_at_forty_eight_hours_or_more` — renders values at or above 48 hours and asserts axis label `Days`.
  - Unit: `duration_chart_defaults_to_hours_for_all_null_weeks` — renders all-null duration data and asserts axis label `Hours` with no plotted points.
  - Unit: `duration_chart_defaults_to_hours_for_empty_duration_trend` — renders an empty duration-mode trend and asserts axis label `Hours` with no plotted points if the component supports empty arrays.
  - Unit: `duration_chart_keeps_tiny_non_zero_values_visible_on_day_axis` — renders a day-scale chart containing a small non-zero point and asserts it is labeled like `0.02d`, not `0.0` or `0.0d`.
  - Unit: `duration_formatter_contract_is_raw_hours_for_wrapper_text` — calls `formatDurationHoursForChart` directly for minutes, hours, and days so wrapper code cannot accidentally double-convert values.
  - Unit: `duration_formatter_keeps_tiny_positive_values_non_zero_in_each_unit` — calls `formatDurationHoursForChart` for tiny positive minute-, hour-, and day-scale values and asserts none render as `0`, `0.0`, or a zero-with-suffix label.
  - Checkpoint: `npm run test -- tests/components/weekly-trend-chart.test.tsx && npm run lint && npm run typecheck && npm run test -- --coverage`

#### Task 1.2 — Duration y-axis headroom and null-gap preservation
- [x] **File**: `src/components/dashboard/weekly-trend-chart.tsx`
- **Depends on**: Task 1.1
- **Description**:
  - Update `chartValue(point: WeeklyTrendPoint)` or replace it with a duration-aware equivalent:
    - `medianHours` points are converted through the selected `DurationScale.valueFromHours`.
    - `medianLines` points continue returning `medianLines`.
    - `null` values continue returning `null`.
  - Update axis calculation so duration charts apply 10-20% headroom before rounding to a readable nice top value when the maximum converted duration is greater than zero.
  - For zero-only duration charts, select the unit from `maxHours === 0`, render zero-valued points on the baseline, and use a small positive readable axis top without applying the 10-20% headroom invariant.
  - Make the duration-axis padding testable, either by exporting a minimal `buildDurationAxis` helper for tests or by exposing enough rendered tick data to prove the pre-rounding padded value is in the 10-20% range for positive maxima.
  - Preserve the current sparse line-axis behavior for PR Size, including values above 99.
  - Replace the current compacted-point path behavior with path segments built from contiguous original week indexes.
  - Preserve null weeks as visual gaps for duration and PR Size charts: non-null points separated by one or more null weeks must not be joined by a line segment.
  - Continue rendering no point circles for all-null duration charts.
- **Releasable**: after this task, duration values are plotted on the selected unit scale with readable vertical spacing.
- **Tests (TDD)** — `tests/components/weekly-trend-chart.test.tsx`:
  - Unit: `duration_axis_adds_readable_headroom_above_maximum_point` — asserts the pre-rounding duration padding is between 10% and 20%, the rounded top tick is derived from that padded value, and no point is pinned to the top gridline.
  - Unit: `duration_axis_handles_zero_only_values_without_divide_by_zero` — renders `[0, 0, null]`, asserts the selected unit is Minutes, zero labels render as `0m`, zero points render on the baseline, null remains a gap, and the axis has a positive top.
  - Unit: `duration_chart_preserves_null_weeks_as_gaps` — renders `[value, null, value]` and asserts no continuous SVG path connects the two non-adjacent points; circle count alone is not sufficient.
  - Unit: `pr_size_sparse_line_ticks_remain_unchanged` — keeps the existing PR Size assertion for `['0', '30', '60', '90', '120']` with values above 99.
  - Unit: `pr_size_chart_preserves_null_weeks_as_gaps` — renders PR Size values separated by a null week and asserts the line path does not connect across the null week.
  - Unit: `pr_size_line_mode_handles_all_null_or_empty_line_trend` — verifies explicit `valueMode="lines"` keeps PR Size in line mode with `Lines` even when there are no finite line values.
  - Checkpoint: `npm run test -- tests/components/weekly-trend-chart.test.tsx && npm run lint && npm run typecheck && npm run test -- --coverage`

#### Task 1.3 — Wrapper and accessible text integration
- [x] **File**: `src/components/dashboard/PrCycleTimeDashboard.tsx`, `src/components/dashboard/FirstReviewTrendChart.tsx`
- **Depends on**: Task 1.2
- **Description**:
  - Update the PR Cycle Time trend chart call so it relies on the selected duration axis label instead of the hard-coded default `Days`.
  - Update the PR Cycle Time screen-reader list in `PrCycleTimeDashboard` so each non-null duration value uses the same selected chart-level unit and non-zero formatting as the visible chart labels.
  - Update `FirstReviewTrendChart` so the visible chart uses the same shared duration behavior and its screen-reader list reports values in the selected unit.
  - Keep `PrSizeTrendChart` unchanged except for any type updates required by the shared chart API.
  - Do not change metric card formatting; this fix is limited to weekly trend charts and their accessible list text.
- **Releasable**: after this task, users and screen readers get consistent duration units in PR Cycle Time and First Review trends.
- **Tests (TDD)** — `tests/components/pr-cycle-time-dashboard.test.tsx`, `tests/components/first-review-trend-chart.test.tsx`, `tests/components/PrSizeTrendChart.test.tsx`:
  - Unit: `dashboard_cycle_time_trend_uses_minutes_for_sub_hour_values` — renders a dashboard payload with sub-hour weekly values and asserts the chart axis or labels use minutes.
  - Unit: `dashboard_cycle_time_sr_trend_does_not_collapse_non_zero_duration_to_zero` — asserts the hidden list reports a positive non-zero duration for sub-hour weekly values.
  - Unit: `dashboard_cycle_time_sr_trend_preserves_null_vs_zero_duration` — asserts a null week remains `empty` or `—` while a zero-duration week remains distinguishable as `0h` or equivalent in the selected chart unit.
  - Unit: `dashboard_cycle_time_sr_uses_one_day_unit_for_mixed_values` — renders mixed values such as `0.5h` and `48h` and asserts the visible chart and hidden list keep both non-null values in days, including the small value as `0.02d` or equivalent.
  - Unit: `first_review_trend_uses_hours_for_hour_scale_values` — renders First Review values between 1 and 48 hours and asserts `Hours` plus hour labels.
  - Unit: `first_review_sr_trend_preserves_null_vs_zero_duration` — asserts null weeks remain `—` while zero-duration weeks remain distinguishable as `0h` or equivalent.
  - Unit: `first_review_sr_uses_one_day_unit_for_mixed_values` — renders mixed values such as `0.5h` and `48h` and asserts visible and accessible labels keep one day-scale unit.
  - Unit: `pr_size_trend_still_passes_lines_axis_label` — asserts `PrSizeTrendChart` still calls or renders `WeeklyTrendChart` with line data and `Lines`.
  - Checkpoint: `npm run test -- tests/components/pr-cycle-time-dashboard.test.tsx tests/components/first-review-trend-chart.test.tsx tests/components/PrSizeTrendChart.test.tsx && npm run lint && npm run typecheck && npm run test -- --coverage`

---

### Final Phase — Verification & Documentation

#### Task 2.1 — Final verification & documentation update
- [x] **File**: N/A (agent task)
- **Depends on**: Task 1.1, Task 1.2, Task 1.3
- **Description**:
  - Review `Documentation/README.md`, `Documentation/Roadmap/trackable-roadmap.md`, and relevant backlog/completed phase docs.
  - Update only documentation affected by the delivered chart behavior. Do not move the roadmap to Jira work or add a new metric phase for this refinement.
  - Verify all acceptance criteria below before marking this task complete.
- **Releasable**: after this task, the duration trend fix is verified and the project documentation reflects any user-visible behavior change.
- **Acceptance criteria** (must all pass):
  - PR Cycle Time weekly trend selects Minutes when the maximum non-null weekly median is under 1 hour.
  - PR Cycle Time weekly trend selects Hours when the maximum non-null weekly median is at least 1 hour and under 48 hours.
  - PR Cycle Time weekly trend selects Days when the maximum non-null weekly median is 48 hours or more.
  - First Review weekly trend follows the same unit thresholds as PR Cycle Time.
  - All-null PR Cycle Time and First Review trend charts render an Hours axis and no points.
  - Duration charts add 10-20% y-axis headroom before rounding the axis top to a readable nice value.
  - Zero-only duration charts use a positive readable axis top, render zero points on the baseline, and do not apply the positive-maximum 10-20% headroom invariant.
  - Real non-zero duration points never render visible or accessible labels as `0.0`.
  - Tiny positive duration values in minutes, hours, or days never render as any zero-looking visible or accessible label.
  - Small values on a day-scale chart remain in days, for example `0.02d`, instead of switching individual labels to hours.
  - Null weeks remain gaps and are distinguishable from zero-duration weeks in screen-reader output.
  - SVG trend paths do not connect non-null duration or PR Size points across intervening null weeks.
  - PR Size keeps line-based scale behavior and existing sparse tick behavior.
  - No metric calculation, server payload, database schema, collector, or roadmap metric scope changes are introduced.
  - The one-page dashboard order remains PR Cycle Time, First Review Time, then PR Size.
- **Tests (TDD)**: N/A — this is a verification and documentation task.
- **Checkpoint**: `npm run lint && npm run typecheck && npm run test -- tests/components/weekly-trend-chart.test.tsx tests/components/pr-cycle-time-dashboard.test.tsx tests/components/first-review-trend-chart.test.tsx tests/components/PrSizeTrendChart.test.tsx && npm run test -- --coverage`

### Verification notes

- `Documentation/README.md`, `Documentation/Roadmap/trackable-roadmap.md`, `Documentation/Completed/dynamic-duration-trend-chart-brief.md`, and `Documentation/Backlog/phase-04-jira-flow-metrics.md` were reviewed during final verification.
- No roadmap phase movement is needed; this fix refines existing PR Cycle Time and First Review trend charts and keeps Phase 04 as the next roadmap step.
- Final focused verification passed with `npm run lint`, `npm run typecheck`, and the component test checkpoint.
- Full `npm run test -- --coverage` passed after starting Docker Desktop and bringing the local Postgres container up with `npm run db:up`.
