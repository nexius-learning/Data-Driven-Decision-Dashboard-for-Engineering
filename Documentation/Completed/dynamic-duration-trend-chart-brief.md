# Feature Brief: Dynamic Duration Trend Chart

## Problem

The 8-week PR Cycle Time and First Review trend charts can show small duration values as `0.0` because hour-based data is plotted and labeled in days.

## Goal

Duration trend charts remain readable across minute, hour, and day-scale data without changing the underlying metric calculations.

## Users & Context

Engineering leaders use the local one-page dashboard to inspect recent PR flow. The issue appears when the current local dataset has sub-day medians, especially during early setup or small-team examples.

## Core Flow

1. User opens the dashboard.
2. User reads the PR Cycle Time trend chart.
3. The chart selects the clearest duration unit from the current non-empty weekly values.
4. User scrolls to First Review Time and sees the same duration-unit behavior there.
5. PR Size remains line-based and keeps its existing scale behavior.

## In Scope

- Apply dynamic duration units to PR Cycle Time and First Review trend charts.
- Select one unit for the whole duration chart based on the maximum non-null value.
- Use minutes when the maximum is under 1 hour.
- Use hours when the maximum is at least 1 hour and under 48 hours.
- Use days when the maximum is 48 hours or more.
- Use caller defaults of `Hours` for all-null PR Cycle Time and First Review charts.
- Add 10-20% y-axis headroom, then round the axis top to a readable nice number.
- Format point labels with enough precision that real non-zero values do not collapse to `0.0`.
- For mixed values on a days chart, show small values in days, for example `0.02d`, rather than switching point labels to hours.
- Preserve null weeks as gaps.
- Preserve PR Size chart line-based behavior and existing sparse tick behavior.

## Out of Scope

- User-controlled unit toggles, because automatic unit selection solves the problem with less UI.
- New dashboard sections or roadmap metric changes, because this refines existing computed metrics.
- Changes to PR Cycle Time, First Review, or PR Size calculations.
- Per-point mixed units, because they make one-axis charts harder to scan.
- Treating empty weeks as zero, because gaps are the current chart convention.

## Key Decisions

- Dynamic unit selection is based on the maximum non-null duration value, because one unit per chart keeps the axis coherent.
- PR Cycle Time and First Review are both included, because both use hour-based trend data and share the same failure mode.
- PR Size is excluded from duration-unit changes, because it is a line-count chart with separate axis behavior.
- Tiny non-zero values keep enough decimal precision in the selected unit, because the chart must never imply zero when the value is real.
- All-null duration charts default to Hours, because that is the clearest neutral unit before data exists.
- Axis headroom is dynamic instead of fixed, because fixed minimums caused the current compression problem.

## Edge Cases & Constraints

- All duration weeks are null: render the chart with an Hours axis and no points.
- Maximum duration is below 1 hour: render the axis in Minutes and label points in minutes.
- Maximum duration is between 1 hour and 48 hours: render the axis in Hours.
- Maximum duration is 48 hours or more: render the axis in Days.
- A small non-zero value on a larger-unit chart must not render as `0.0`.
- Empty weeks remain visual gaps and screen-reader entries should continue to distinguish empty weeks from zero-duration weeks.
- The shared trend chart is used by PR Cycle Time, First Review, and PR Size, so tests must prove PR Size behavior remains unchanged.
- The dashboard remains a one-page scrolling dashboard with PR Cycle Time first, First Review second, and PR Size third.

## Open Questions

- None.

## Future Iterations

- Tooltips with exact raw duration values if point labels become crowded.
- More compact mobile label behavior if dynamic precision creates overlap on narrow screens.
- A shared duration-formatting helper for chart labels, table values, and trend references if duplication grows.

## Recommendation

Build this before adding the next metric section. The current chart hides useful signal in small local datasets, which weakens trust in the dashboard. The implementation must keep one coherent axis unit per duration chart, preserve PR Size behavior, and prove through tests that real non-zero values never render as `0.0`.
