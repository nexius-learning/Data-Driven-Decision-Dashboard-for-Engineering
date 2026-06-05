# Phase 03: PR Size

Status: Implemented
Last updated: 2026-05-28

> Current follow-up note: Phase 03 shipped the PR Size surface. FIX-002 added partial-week confidence behavior, and FIX-004 later changed the visible PR Size chart from the original 8-week single-series baseline to the shared 16 completed-week comparison presentation.

Implementation plan: [FEAT-003 — PR Size](FEAT-003-pr-size-implementation-plan.md)

Depends on: [Phase 02: First Review Time](../Completed/phase-02-first-review-time.md) complete (`npm run verify:phase02`).

UI reference: [PR Cycle Time, First Review, and PR Size](../Assets/mockups/05-pr-cycle-time-first-review-and-pr-size.png).

![PR Cycle Time, First Review, and PR Size](../Assets/mockups/05-pr-cycle-time-first-review-and-pr-size.png)

## Goal

Add PR Size so the dashboard can detect oversized PR patterns.

## UI Changes

- Add a **PR Size** section below the First Review Time section on the same one-page dashboard.
- Add PR Size metric card.
- Add oversized PR exceptions.
- Add PR Size trend. The original Phase 03 baseline was 8 weeks; current shipped behavior is the FIX-004 comparison presentation.
- Show completed-week trend separately from current-week-so-far when current-week measured PRs exist.
- Show measured-count confidence notes for current-week-so-far and low-sample completed weeks.
- Add separate Size team breakdown.
- Show median PR size, not only maximum PR size.
- Preserve the PR Cycle Time and First Review Time sections above PR Size; do not move Phase 03 content into the first viewport.

## One-page layout rule

Phase 03 follows the project-wide one-page scroll pattern:

1. PR Cycle Time remains first.
2. First Review Time remains second.
3. PR Size is appended below First Review Time as the next scroll section.

Future metric mockups must follow the same pattern: keep existing metric sections in order and add the next metric after the last section.

## Data

Required data:

- Lines added and deleted per PR.
- File count per PR.
- Repository and team mapping.

## Acceptance criteria checklist

Verified by **FEAT-003** Task 10.1 (`npm run verify:phase03 && npm run verify:phase02 && npm run verify:phase01`).

- [x] PR Size section appears only after size data is collected (`prSize` omitted when no sized PRs).
- [x] Metric card shows median `additions + deletions` for non-null PRs in the 8-week window; shows `baseline pending` when fewer than 3 ISO weeks of size data (raw median still shown); shows period-over-period trend vs. the prior 8 weeks when enough data exists.
- [x] Oversized PR exceptions flag teams with ≥ 3 sized PRs where ≥ 50% exceed 2× team median; sorted by ratio descending; capped at 3; panel hidden when empty.
- [x] Original 8-week PR Size trend shipped; FIX-004 later expanded the visible chart to the shared comparison presentation. Null weeks remain gaps, not zeros; chart renders regardless of `baselineStatus`.
- [x] PR Size trend chart shows completed-week points plus an optional detached current-week-so-far point; detached current point is shown only when current week has measured PRs.
- [x] PR Size trend confidence copy includes measured PR counts and low-sample wording (`< 3 measured PRs`) without changing PR Size median math.
- [x] PR Size trend excludes future-dated rows (`mergedAt > now`) while including rows at exactly `mergedAt === now`.
- [x] Size team breakdown lists teams with ≥ 1 sized PR and no author names. Current UI columns are Team, PRs merged, Median size, and Trend; the original Largest PR column was not rendered.
- [x] Size sync computes merge/squash via `git diff <sha>^1 <sha> --shortstat`; rebase via GitHub PR detail API; `changedFiles` from shortstat or API.
- [x] PRs without size data are excluded from medians (never shown as zero).
- [x] Backfill writes found SHAs to `merge_commit_sha` so future refreshes skip grep.
- [x] Phase 01 and Phase 02 surfaces unchanged (`npm run verify:phase01` and `npm run verify:phase02` pass).
- [x] `npm run verify:phase03` passes (lint, typecheck, coverage ≥ 85% on Phase 03 sources, all `@phase03` E2E tests green).
- [x] The UI does not rank or shame individual authors.

## Acceptance Criteria (reference)

Product intent (tracked completion in checklist above):

- PR Size appears only after size data is collected.
- Oversized PR exceptions are deterministic.
- The UI does not shame individual authors.
