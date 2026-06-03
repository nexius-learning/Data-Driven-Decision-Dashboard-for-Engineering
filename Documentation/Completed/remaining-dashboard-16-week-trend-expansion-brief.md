# Feature Brief: Remaining Dashboard 16-Week Trend Expansion

Status: Complete

## Problem

The remaining dashboard trends do not expose enough history consistently. First Review Time still shows only the current dashboard range, while PR Size shows only 8 completed UTC ISO weeks plus its optional detached current-week-so-far point.

## Goal

Expand the remaining trends without changing card or table calculations:

- First Review Time shows previous plus current dashboard-range buckets using the shipped PR Cycle Time comparison UX.
- PR Size shows a fixed default depth of 16 completed UTC ISO weeks plus its existing optional detached current-week-so-far point.

These are independently releasable tasks inside one feature and release goal. Implement and verify them separately to reduce risk.

## Roadmap Position

Phase 04: Jira Flow Metrics remains the documented next step in `Documentation/README.md` and `Documentation/Roadmap/trackable-roadmap.md`.

FIX-004 was explicitly scheduled as a pre-Phase-04 stabilization gate and is complete. Phase 04 remains the next feature phase.

## Range Contracts

- Dashboard default remains `range.weeks = 8`.
- First Review comparison depth is dynamic: `previous range.weeks + current range.weeks`. Default is 16 points; `weeks = 4` produces 8 points.
- Preserve the existing First Review `weeklyTrend` payload shape and current-range-only role: 8 points by default, 4 when `weeks = 4`.
- PR Size is intentionally independent of dashboard `range.weeks`: use exactly 16 completed UTC ISO weeks for this feature. Do not add a config or environment override.
- PR Size may append one optional detached current-week-so-far point when measured data exists.
- Do not change metric-card, exception, or team-table semantics for either metric.

## First Review Comparison Contract

Add `firstReview.comparisonWeeklyTrend: FirstReviewComparisonPoint[]` alongside the compatibility `firstReview.weeklyTrend`:

```ts
type FirstReviewComparisonPoint = {
  period: 'previous' | 'current'
  bucketIndex: number
  bucketStart: string
  bucketEnd: string
  bucketLabel: string
  medianHours: number | null
}
```

- Populate exactly `range.weeks` previous points followed by exactly `range.weeks` current points.
- Reset the 1-based `bucketIndex` at the period boundary: previous points use `1..range.weeks`, then current points use `1..range.weeks`.
- Use only qualifying First Review aggregates from review-synced repositories.
- Preserve shipped First Review qualification semantics: median, trend, baseline, and comparison data use the first qualifying human review.
- Reuse the shipped PR Cycle Time comparison chart opt-in shape where practical. Keep First Review filtering and median calculation metric-specific.
- Build both `comparisonWeeklyTrend` halves with local calendar-day additions, not fixed millisecond increments. Internal buckets are half-open and each final bucket absorbs its local-day remainder so daylight-saving transitions do not create gaps or overlaps.
- Derive compatibility `firstReview.weeklyTrend` from the current half of that same local-calendar comparison bucket builder while preserving its existing shape and current-range-only role. Eliminate the fixed-millisecond compatibility path so it cannot disagree across daylight-saving transitions.
- Preserve null buckets as visual gaps, never zeroes.

### First Review Boundaries

First Review must preserve its shipped card behavior exactly:

- Previous period: `[previous.from, current.from)`
- Current period: `[current.from, current.to)`

Do not opportunistically include `current.to`. PR Cycle Time includes its final `current.to` boundary, but applying that behavior to First Review would change shipped First Review calculations.

Internal First Review buckets must also be half-open: `[bucketStart, bucketEnd)`. A PR merged exactly on an internal boundary contributes to the later bucket once. The final current bucket ends at `current.to` and remains exclusive.

### First Review UX

Reuse the shipped PR Cycle Time duration-comparison presentation:

- muted dashed previous segment;
- dark current segment;
- no connecting line across the period boundary;
- visible divider and previous/current period labels;
- sparse visible x-axis labels;
- latest accent limited to the current segment;
- all comparison points represented in the screen-reader list.

Use dynamic First Review comparison copy based on total comparison depth:

- Default: title `16-week First Review comparison trend`.
- With `weeks = 4`: title `8-week First Review comparison trend`.
- Apply the same dynamic depth to the help text, section `aria-label`, and chart `aria-label`.
- Explain in visible and accessible copy that the chart shows the previous segment followed by the current segment.

Add notes analogous to shipped PR Cycle Time:

- When the previous baseline is pending, state that previous-period points are context and do not represent an available comparison baseline.
- When the current period has no qualifying human-reviewed PRs, state that previous-period history is context, not current performance.

## PR Size Trend Contract

- Show exactly 16 completed UTC ISO weeks, independent of dashboard `range.weeks`. Do not add a config or environment override.
- Keep the current UTC ISO week out of the completed line.
- Preserve the existing optional detached current-week-so-far point and confidence note.
- Use the shared comparison presentation for the 16 completed weeks: muted dashed previous 8 completed weeks, dark latest 8 completed weeks, divider, compact previous/latest period labels, sparse x-axis labels, and the title `16-week PR Size comparison trend`.
- In PR Size line mode only, when completed history exceeds 8 points, render completed x-axis labels only at indexes `0`, `floor((count - 1) / 2)`, and `count - 1`. Always render the detached label when present.
- Preserve the existing plain-line label behavior for 8 or fewer completed PR Size points. Preserve duration-comparison label behavior unchanged.
- Keep all 16 completed points in the accessible list. Append one accessible current-week-so-far item only when the detached point exists.
- Preserve measured-count confidence wording, low-sample wording, future-row exclusion, and overflow rendering with the actual detached numeric value visible.
- Do not claim the trend line exactly explains the PR Size card comparison: their time-window semantics intentionally differ.

## Stale Completed Phase 02 Doc Drift

`Documentation/Completed/phase-02-first-review-time.md` is stale: its metric-definition table says bot-submitted reviews count. Shipped code uses the first qualifying human review, as reflected by `src/metrics/first-review-time.ts` and the refined completed Phase 02 brief.

For this follow-up, shipped code is the source of truth. The stale completed Phase 02 wording was corrected during implementation.

## In Scope

- First Review comparison payload, dynamic previous-plus-current bucketing, comparison chart wiring, context notes, and accessible list.
- PR Size fixed 16-completed-week history depth, sparse visible labels, accessible-list preservation, detached-point preservation, and responsive layout verification.
- Focused tests, release-gate wiring updates if needed, and browser verification.

## Out of Scope

- Card, exception, and team-table calculation changes.
- PR Cycle Time behavior changes.
- Jira, auth, cloud deployment, AI recommendations, or later quality metrics.
- User-controlled range selection.
- Placeholder UI or a large shared-chart refactor.
- Changing the completed Phase 02 behavior beyond its verified documentation correction.

## Edge Cases

- First Review previous period has no qualifying human-reviewed PRs: render previous gaps and baseline-context note.
- First Review current period has no qualifying human-reviewed PRs: render current gaps and no-current-data note.
- First Review all buckets are null: render the chart safely with a complete accessible list.
- First Review bucket boundaries cross a daylight-saving transition: local-day buckets remain contiguous.
- First Review PR merged exactly at `current.from`: count once in the first current bucket.
- First Review PR merged exactly at `current.to`: exclude it to preserve shipped behavior.
- PR Size current UTC ISO week has no measured PRs: render only 16 completed points.
- PR Size current UTC ISO week has measured PRs: append detached point and confidence note.
- PR Size detached value exceeds completed-week axis domain: preserve overflow marker and visible actual value.

## Responsive Playwright Contract

Use separate deterministic fixtures for First Review comparison, PR Size completed-only, PR Size normal detached partial, and PR Size detached overflow. Verify each applicable fixture at `1280x900` and `390x844`.

- Assert SVG labels remain inside SVG bounds.
- Assert every adjacent pair of rendered visible x-axis labels does not overlap.
- Assert previous/current period labels do not overlap.
- Assert the detached marker and value label remain inside SVG bounds.
- Assert the confidence note does not overlap the chart or team table.
- Capture retained Playwright screenshot artifacts under `test-results/` and record a reviewed checklist or sign-off for all eight fixture/viewport combinations.

## Acceptance Criteria

- [x] Default dashboard range remains 8 weeks.
- [x] With default range, First Review exposes 8 previous plus 8 current comparison points and retains its existing 8-point current-range `weeklyTrend`.
- [x] With `weeks = 4`, First Review exposes 4 previous plus 4 current comparison points and retains a 4-point current-range `weeklyTrend`.
- [x] First Review comparison points include `period`, `bucketIndex`, `bucketStart`, `bucketEnd`, `bucketLabel`, and `medianHours`.
- [x] First Review payload is named `firstReview.comparisonWeeklyTrend: FirstReviewComparisonPoint[]`; `bucketIndex` is 1-based and resets from `1..range.weeks` previous to `1..range.weeks` current.
- [x] First Review comparison data excludes unsynced repositories and uses first qualifying human reviews only.
- [x] First Review uses local calendar-day bucket additions, half-open internal boundaries, per-half final local-day remainder handling, and exclusive `current.to`; compatibility `firstReview.weeklyTrend` is the current half of the same builder with no fixed-millisecond DST disagreement.
- [x] First Review comparison UX includes sparse labels, divider, period labels, null gaps, baseline-context note, no-current-data note, and a screen-reader item for every comparison point.
- [x] First Review title, help text, section `aria-label`, and chart `aria-label` dynamically use total comparison depth: default `16-week First Review comparison trend`, and `8-week First Review comparison trend` when `weeks = 4`; visible and accessible copy explain previous then current segments.
- [x] PR Size returns exactly 16 completed UTC ISO weeks regardless of dashboard `range.weeks`, with no new config or environment override, plus at most one detached current partial point.
- [x] PR Size line mode renders the 16 completed weeks with the shared comparison presentation, title `16-week PR Size comparison trend`, compact previous/latest period labels, completed x-axis labels at indexes `0`, `floor((count - 1) / 2)`, and `count - 1`, and the detached label when present; it preserves 8-or-fewer plain-line fallback and duration-comparison behavior, and retains every point in the screen-reader list.
- [x] PR Size detached confidence, low-sample, future-row exclusion, and overflow-value behavior remain intact.
- [x] Responsive Playwright uses separate deterministic First Review comparison, PR Size completed-only, PR Size normal detached partial, and PR Size detached overflow fixtures at `1280x900` and `390x844`; assertions cover bounds and overlap contracts, retained screenshots are captured, and the fixture/viewport combinations receive rendered-browser sign-off.
- [x] Automated accessibility assertions cover First Review comparison-list length and order, previous/current semantics, dynamic title and aria labels, PR Size 16-or-17-item list behavior, and detached `current week so far` copy.
- [x] Dashboard order remains PR Cycle Time, First Review Time, PR Size.
- [x] No card or table calculation semantics change.
- [x] Phase 04 remains the documented next feature step after the explicitly scheduled FIX-004 stabilization gate.

## Verification Matrix

| Area | Required verification |
|---|---|
| First Review payload | `firstReview.comparisonWeeklyTrend: FirstReviewComparisonPoint[]`; default 16-point comparison; non-default `weeks = 4` gives 8 comparison points; 1-based `bucketIndex` resets for previous then current; compatibility `firstReview.weeklyTrend` remains the shape-preserving current half of the same builder. |
| First Review filtering | Review-synced repository filtering; first qualifying human review only; unsynced repositories excluded. |
| First Review boundaries | DST-crossing local calendar buckets for both halves and compatibility series; no fixed-millisecond path; internal boundary counted once in later bucket; `current.from` included once; `current.to` excluded; each final bucket absorbs its local-day remainder; all-null comparison remains safe. |
| First Review component | Dynamic title, help text, section `aria-label`, and chart `aria-label` use total comparison depth and explain previous then current segments; sparse visible labels; divider and non-overlapping period labels; no line across boundary; baseline-context note; no-current-data note; screen-reader list length equals `2 * range.weeks` with previous/current semantics. |
| PR Size metric | Exactly 16 completed UTC ISO weeks when `range.weeks = 8` and when `range.weeks = 4`; no config or environment override; optional detached partial adds at most one point; future rows excluded. |
| PR Size component | For the 16 completed-week history, line mode uses the shared comparison presentation with compact previous/latest period labels and title `16-week PR Size comparison trend`; visible completed labels are indexes `0`, `floor((count - 1) / 2)`, and `count - 1`; detached label is always visible when present; 8-or-fewer plain-line fallback and duration-comparison behavior remain unchanged; screen-reader list has 16 completed items or 17 with detached partial; detached item says current week so far; measured-count confidence and low-sample copy preserved; detached overflow marker and actual value preserved. |
| Responsive Playwright | Separate deterministic First Review comparison, PR Size completed-only, PR Size normal detached partial, and PR Size detached overflow fixtures at `1280x900` and `390x844`; assert SVG labels inside SVG bounds, every adjacent pair of rendered visible x-axis labels does not overlap, previous/current period labels do not overlap, detached marker/value label inside SVG bounds, and confidence note does not overlap chart or team table; retain screenshot artifacts under `test-results/` and record a reviewed checklist or sign-off for all eight fixture/viewport combinations. |
| Accessibility | Automated assertions cover First Review comparison-list length and order, previous/current semantics, dynamic title and aria labels, PR Size 16-or-17-item list behavior, and detached `current week so far` copy. |
| Static checks | `git diff --check`; `npm run lint`; `npm run typecheck`; `npm run build`. |
| Focused tests | Run targeted First Review metric/dashboard/component tests, shared `weekly-trend-chart` tests, PR Size metric/dashboard/component tests, and new Playwright cases. |
| Release regression | Run `npm run verify:phase02` and `npm run verify:phase03`. |
| Full regression | Run `npm run test -- --coverage` once as the full coverage regression path. Run `npm run verify:phase01` whenever implementation changes `src/components/dashboard/weekly-trend-chart.tsx` or shared chart helpers, because PR Cycle Time uses that renderer. |

## Recommendation

Schedule this as one dashboard-stabilization feature with two independently releasable tasks. First Review should adopt the shipped PR Cycle Time comparison UX while preserving its stricter existing boundaries and human-review semantics. PR Size should remain a completed-week chart with a detached partial signal, using a separate fixed 16-week history depth.
