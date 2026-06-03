# FEAT-003 — PR Size
**Purpose**: Add Phase 03 PR Size visibility (Median PR Size, oversized-PR exceptions, 8-week trend, team breakdown) without changing Phase 01 or Phase 02 surfaces.
**Audience**: Head of Engineering, FEAT-003 implementation agent, engineers maintaining the dashboard.
**Status**: Done (updated with FIX-002 PR Size trend confidence behavior)

---

## Background

Phase 02 ([FEAT-002](FEAT-002-first-review-time-implementation-plan.md)) shipped First Review Time. Phase 03 adds the third metric leg: PR Size. Engineering leads can now see cycle time, review latency, and code churn side-by-side. The brief ([phase-03-pr-size-brief.md](phase-03-pr-size-brief.md)) is authoritative for product semantics. The phase doc ([phase-03-pr-size.md](phase-03-pr-size.md)) is the high-level roadmap entry.

PR Size is computed from local git — `merge_commit_sha` is already returned by the GitHub list-PRs response but was never extracted. Storing it costs nothing; size is computed via `git diff <sha>^1 <sha> --shortstat` for merge and squash commits, with a GitHub PR detail API fallback for rebase-merged PRs.

---

## Goal

When this plan is complete, the user can run the app locally, click Refresh, and after at least one PR's size has been computed, see a new PR Size section below the First Review Time section containing: a Median PR Size card with a "across N files" secondary line and a period-over-period trend, an oversized-PR exceptions panel, an 8-week size trend chart, and a team breakdown table. Until size data exists the section is hidden. `npm run verify:phase02` continues to pass; `npm run verify:phase03` passes.

---

## Scope

### In Scope

- Drizzle migration: add `additions`, `deletions`, `changed_files`, `merge_commit_sha` columns to `pull_requests`.
- Shared `src/metrics/math.ts` utility re-exporting `median` (extracted from `pr-cycle-time-summary.ts`).
- `src/metrics/pr-size-types.ts` for internal record types (`PrSizeRecord`).
- `GitHubPullRequest` type extension: add `mergeCommitSha: string | null`.
- `normalizePullRequest` extraction of `merge_commit_sha` from the GitHub list-PR response (already returned, zero extra API calls).
- `upsertPullRequests` extended to persist `mergeCommitSha`.
- GitHub PR detail client: `GET /repos/{owner}/{repo}/pulls/{number}` — returns `additions`, `deletions`, `changed_files` for the rebase fallback.
- Single `src/collector/pr-size-sync.ts`: merge-strategy detector, `git fetch` helper, `git diff --shortstat` runner, backfill via `git log --grep`, ancestor check, per-repo sync orchestrator. Backfill writes the found SHA back to `merge_commit_sha` in the DB so future refreshes skip the grep.
- `src/collector/pr-size-store.ts`: `updatePrSize` writes `additions`, `deletions`, `changedFiles`, and optionally `mergeCommitSha` when backfill found it.
- Size sync third pass in `refresh.ts` via existing `runWithConcurrency`.
- Metrics: `src/metrics/pr-size-metric.ts`, `src/metrics/pr-size-exceptions.ts`, `src/metrics/pr-size-team-breakdown.ts`.
- Dashboard payload extension: `PrSize`, `PrSizeMetric`, `PrSizeException`, `PrSizeTeamRow` types added to `pr-cycle-time-dashboard.ts`; optional `prSize?: PrSize` key on `PrCycleTimeDashboard`. `getPrCycleTimeDashboard` extends the existing Phase 01 DB query to also select size columns; size fields are extracted inline alongside `rowToPr` without mutating `PullRequestRecord`.
- UI: `PrSizeSection.tsx`, `PrSizeCard.tsx`, `PrSizeExceptionsPanel.tsx`, `PrSizeTrendChart.tsx`, `PrSizeTeamTable.tsx` added below `<FirstReviewSection>` in `PrCycleTimeDashboard.tsx`.
- `vitest.config.phase03.ts` and `verify:phase03` npm script.
- Documentation updates: phase doc acceptance checklist, roadmap link.

### Out of Scope

- Author-level size metrics.
- Separate additions vs. deletions breakdown in the UI.
- Per-file or per-directory size analysis.
- Configurable oversized thresholds.
- Modifying Phase 01 or Phase 02 computations, payload shape, or UI.

---

## Acceptance criteria

> Acceptance criteria are verified in the final task. See [Task 10.1 — Final verification & documentation update].

---

## What does NOT change

- Phase 01 `PrCycleTimeDashboard` keys: `range`, `metric`, `exceptions`, `weeklyTrend`, `teamBreakdown`, `freshness`.
- `PullRequestRecord` type — the Phase 01 input type must not gain size fields.
- Phase 02 `firstReview`, `reviewFreshness`, `reviewMetricsPending` payload shape.
- `pull_request_reviews` and `pull_request_review_comments` tables.
- `repositories.lastReviewSyncedAt` column.
- Phase 01 and Phase 02 metric computations.

---

## Known limitations / accepted trade-offs

- Backfill is best-effort: PRs whose local commit cannot be identified (custom squash/rebase message templates) remain size-null.
- Organizations using custom squash message templates omitting `(#N)` will see those PRs use the API fallback — harmless.
- Chronically oversized teams won't be flagged by the exceptions panel (by design: the panel detects behavioral *changes*, not absolute violations). The team breakdown table surfaces absolute median directly.
- Binary files contribute 0 to `additions + deletions` but ARE counted in `changedFiles`.
- **Persistent git failures**: PRs where `git diff` fails permanently (e.g., corrupt object, missing pack) remain `additions IS NULL` and will be retried on every sync run. There is no automatic skip-after-N-retries mechanism. Monitor `sync_errors` rows with `source = 'git-diff-failed'` for repeated failures against the same PR; manual `NULL`-override is the remediation path.

---

## Architecture

### Resolved decisions

| Decision | Choice | Rationale |
|---|---|---|
| Backfill SHA persistence | Write found SHA back to `merge_commit_sha` | Future syncs skip grep; one-time cost to confirm ancestry |
| `median` utility | New `src/metrics/math.ts` re-exports it | Neutral home; no circular imports for Phase 04+ |
| Dashboard DB query | Extend Phase 01 query; extract size fields inline | Single DB round trip; `PullRequestRecord` stays untouched |
| `pr-size-sync.ts` scope | Single file | Matches Phase 02 `review-sync.ts` precedent |
| Type co-location | `pr-size-types.ts` for record types; dashboard output types in `pr-cycle-time-dashboard.ts` | Consistent with Phase 01/02 pattern |
| `buildPrSizeExceptions` median type | Simple median over current window (not rolling) | The brief says "rolling 8-week median"; this plan uses a simple median computed over the fixed current window queried on each dashboard load — equivalent result because the window is recomputed fresh on every request. "Simple" is used to avoid implying a time-series sliding calculation. |

### New modules

- `src/metrics/math.ts` — re-exports `median(values: number[]): number | null` (extracted from `pr-cycle-time-summary.ts`).
- `src/metrics/pr-size-types.ts` — `PrSizeRecord` and other internal input types for metric/exceptions/breakdown functions.
- `src/collector/pr-size-sync.ts` — all git operations + per-repo orchestration.
- `src/collector/pr-size-store.ts` — `updatePrSize`.
- `src/metrics/pr-size-metric.ts` — `computePrSizeMetric`, `getPrSizeWeeklyTrend`.
- `src/metrics/pr-size-exceptions.ts` — `buildPrSizeExceptions`.
- `src/metrics/pr-size-team-breakdown.ts` — `getPrSizeTeamBreakdown`.

### Extended modules

- `src/db/schema.ts` — four new nullable columns on `pull_requests`.
- `src/collector/github-client.ts` — `GitHubPullRequest` gains `mergeCommitSha: string | null`; new `getPullRequestDetail` method.
- `src/collector/pull-request-store.ts` — `upsertPullRequests` persists `mergeCommitSha`.
- `src/collector/refresh.ts` — third pass for size sync; `sizeSyncErrors` added to `RefreshSummary`.
- `src/metrics/pr-cycle-time-dashboard.ts` — new types `PrSizeMetric`, `PrSizeException`, `PrSizeTeamRow`, `PrSize`; `PrCycleTimeDashboard` gains `prSize?: PrSize`; `getPrCycleTimeDashboard` extends Phase 01 query and populates `prSize`.
- `src/metrics/pr-cycle-time-summary.ts` — `median` re-exported from `math.ts` instead of defined here (non-breaking; existing callers still import from this file, which re-exports it).
- `src/components/dashboard/PrCycleTimeDashboard.tsx` — renders `<PrSizeSection>` after `<FirstReviewSection>`.

### New UI components

- `src/components/dashboard/PrSizeSection.tsx`
- `src/components/dashboard/PrSizeCard.tsx`
- `src/components/dashboard/PrSizeExceptionsPanel.tsx`
- `src/components/dashboard/PrSizeTrendChart.tsx`
- `src/components/dashboard/PrSizeTeamTable.tsx`

### Dashboard payload types (in `pr-cycle-time-dashboard.ts`)

```ts
export type PrSizeMetric = {
  medianLines: number | null
  medianChangedFiles: number | null
  previousMedianLines: number | null
  trendPercent: number | null
  baselineStatus: 'available' | 'pending'
  qualifyingPrCount: number
}

export type PrSizeException = {
  type: 'oversized_pr_pattern'
  severity: 'warning'
  team: string
  message: string
  flaggedPrCount: number
  totalPrCount: number  // count of PRs with non-null size data (denominator for both flagging ratio and UI display "N of M PRs")
}

export type PrSizeTeamRow = {
  team: string
  prCount: number
  medianLines: number | null
  trend: '↑' | '↓' | '→' | '—'
  largestPrTitle: string
  largestPrRepo: string
  largestPrUrl: string
  largestPrLines: number
}

export type PrSize = {
  metric: PrSizeMetric
  exceptions: PrSizeException[]
  weeklyTrend: Array<{
    weekStart: string
    medianLines: number | null
    measuredPrCount: number
    isPartialWeek: boolean
  }>
  teamBreakdown: PrSizeTeamRow[]
}
```

### Internal record type (in `pr-size-types.ts`)

```ts
export type PrSizeRecord = {
  id: string
  number: number
  title: string
  url: string
  repositoryId: string
  repoFullName: string   // "owner/repo"
  team: string | null
  mergedAt: Date
  additions: number | null
  deletions: number | null
  changedFiles: number | null
}
```

---

## Task breakdown

### Phase 1 — Foundation & Schema
> **Releasable**: after Task 1.5 — the collector can persist size data; no UI yet.

#### Task 1.1 — math.ts: shared median utility
- [x] **File**: `src/metrics/math.ts`
- **Depends on**: nothing
- **Description**:
  - Define `median(values: number[]): number | null` (sort ascending, return middle or average of two middles; `null` on empty array). This is the same implementation currently in `pr-cycle-time-summary.ts`.
  - In `src/metrics/pr-cycle-time-summary.ts`: remove the local `median` definition, add `export { median } from '~/metrics/math'`. All existing callers continue to work without changes.
- **Releasable**: after this task, `median` is available from a neutral module; Phase 03 metric functions can import it.
- **Tests (TDD)** — `tests/metrics/math.test.ts`:
  - Unit: `median_returns_middle_for_odd_length` — `[1, 3, 5]` → `3`.
  - Unit: `median_averages_two_middles_for_even_length` — `[1, 3]` → `2`.
  - Unit: `median_returns_null_for_empty_array` — `[]` → `null`.
  - Unit: `median_sorts_before_computing` — `[5, 1, 3]` → `3`.
  - Regression: `pr_cycle_time_summary_median_import_still_works` — import `median` from `pr-cycle-time-summary` and verify it returns the same result as before (re-export not a breaking change).
  - Checkpoint: `vitest run tests/metrics/math.test.ts`

#### Task 1.2 — pr-size-types.ts: PrSizeRecord
- [x] **File**: `src/metrics/pr-size-types.ts`
- **Depends on**: nothing
- **Description**:
  - Define and export `PrSizeRecord` as shown in the Architecture section.
  - No logic — types only.
- **Releasable**: after this task, metric/exceptions/breakdown functions can import a shared input type.
- **Tests (TDD)** — `tests/metrics/pr-size-types.test.ts`:
  - Unit: `pr_size_record_type_compiles` — construct a `PrSizeRecord` literal with all fields and verify TypeScript accepts it (compile-time test).
  - Unit: `pr_size_record_allows_null_size_fields` — `additions: null`, `deletions: null`, `changedFiles: null` type-checks.
  - Checkpoint: `vitest run tests/metrics/pr-size-types.test.ts`

#### Task 1.3 — Schema migration: add size columns to pull_requests
- [x] **File**: `src/db/schema.ts` + generated migration
- **Depends on**: nothing
- **Description**:
  - Add to `pullRequests` in `src/db/schema.ts`:
    - `additions: integer('additions')` — nullable
    - `deletions: integer('deletions')` — nullable
    - `changedFiles: integer('changed_files')` — nullable
    - `mergeCommitSha: text('merge_commit_sha')` — nullable
  - Run `npm run db:generate` to produce the SQL migration; run `npm run db:migrate` to apply.
  - Migration must apply cleanly to both a fresh DB and a Phase 02 DB.
- **Releasable**: after this task the four columns exist; all existing code still compiles.
- **Tests (TDD)** — `tests/db/pr-size-migration.test.ts`:
  - Integration: `migration_adds_additions_deletions_changed_files_merge_commit_sha` — verify columns exist with nullable constraint via `select` returning null for existing rows.
  - Integration: `migration_applies_on_phase02_db` — in a fully-migrated DB, insert a `pull_requests` row using only Phase 01/02 columns (do not set `additions`, `deletions`, `changed_files`, `merge_commit_sha`); assert that selecting the row returns null for all four new columns.
  - Checkpoint: `vitest run tests/db/pr-size-migration.test.ts`

#### Task 1.4 — GitHubPullRequest type: add mergeCommitSha field
- [x] **File**: `src/collector/github-client.ts`
- **Depends on**: nothing
- **Description**:
  - Add `mergeCommitSha: string | null` to `GitHubPullRequest` type.
  - In `normalizePullRequest`, extract `raw.merge_commit_sha`: if string and non-empty, store it; otherwise `null`. GitHub returns this on all list-PR responses at no extra cost.
- **Releasable**: after this task `GitHubPullRequest` carries `mergeCommitSha`; downstream consumers that don't use it are unaffected.
- **Tests (TDD)** — `tests/collector/github-client-pr-size.test.ts`:
  - Unit: `normalize_pr_extracts_merge_commit_sha_when_present` — `merge_commit_sha: "abc123"` → `mergeCommitSha: "abc123"`.
  - Unit: `normalize_pr_sets_merge_commit_sha_null_when_absent` — field missing → `null`.
  - Unit: `normalize_pr_sets_merge_commit_sha_null_when_empty_string` — `merge_commit_sha: ""` → `null`.
  - Checkpoint: `vitest run tests/collector/github-client-pr-size.test.ts`

#### Task 1.5 — upsertPullRequests: persist mergeCommitSha
- [x] **File**: `src/collector/pull-request-store.ts`
- **Depends on**: Task 1.3, Task 1.4
- **Description**:
  - Write `mergeCommitSha` to `merge_commit_sha` on both insert and update paths.
  - `PullRequestSyncSummary` and function signature are unchanged.
  - `additions`/`deletions`/`changedFiles` are written by the size sync step (Task 5.1); not touched here.
- **Releasable**: after this task `merge_commit_sha` is stored for all newly synced PRs.
- **Tests (TDD)** — `tests/collector/pull-request-store-size.test.ts`:
  - Unit: `upsert_pr_stores_merge_commit_sha` — insert PR with `mergeCommitSha: "abc"` → DB row has `"abc"`.
  - Unit: `upsert_pr_stores_null_merge_commit_sha` — `mergeCommitSha: null` → null in DB.
  - Unit: `upsert_pr_updates_merge_commit_sha_on_second_upsert` — first upsert null, second upsert `"abc"` → DB has `"abc"`.
  - Checkpoint: `vitest run tests/collector/pull-request-store-size.test.ts`

---

### Phase 2 — GitHub Client: PR Detail API
> **Releasable**: after Task 2.1 — the rebase fallback API call is callable.

#### Task 2.1 — GitHub client: getPullRequestDetail method
- [x] **File**: `src/collector/github-client.ts`
- **Depends on**: Task 1.4
- **Description**:
  - Add `getPullRequestDetail(input: { owner: string; repo: string; pullNumber: number }): Promise<{ additions: number; deletions: number; changedFiles: number }>` to `GitHubClient`.
  - Calls `GET /repos/{owner}/{repo}/pulls/{pullNumber}`. Extracts `additions`, `deletions`, `changed_files` (all integers; throw `GitHubSyncError` if missing or not finite).
  - Reuses existing auth headers and `GitHubSyncError` error classes. Called only for rebase-merged PRs.
- **Releasable**: after this task the API fallback for rebase PRs is callable.
- **Tests (TDD)** — `tests/collector/github-client-pr-detail.test.ts`:
  - Unit: `get_pr_detail_returns_additions_deletions_changed_files` — mocked HTTP 200 with valid body.
  - Unit: `get_pr_detail_throws_sync_error_on_missing_additions` — body without `additions` field.
  - Unit: `get_pr_detail_throws_sync_error_on_rate_limit` — HTTP 429.
  - Unit: `get_pr_detail_throws_sync_error_on_unauthorized` — HTTP 401.
  - Checkpoint: `vitest run tests/collector/github-client-pr-detail.test.ts`

---

### Phase 3 — Size Computation Primitives
> **Releasable**: after Task 3.3 — all git primitives and strategy detection are callable.

#### Task 3.1 — Merge strategy detector
- [x] **File**: `src/collector/pr-size-sync.ts`
- **Depends on**: nothing
- **Description**:
  - `detectMergeStrategy(sha: string, repoPath: string, prNumber: number): Promise<'merge' | 'squash' | 'rebase'>`.
  - Run `git rev-list --parents -1 <sha>` with `LC_ALL=C`, 10 s timeout. Output format: `<commit-sha> [<parent1> <parent2> ...]`. Split on whitespace; first token is the commit SHA itself; remaining tokens are parent SHAs. `parentCount = tokens.length - 1`. `parentCount >= 2` → `'merge'` (handles octopus merges with 3+ parents). `parentCount === 1` → squash/rebase check.
  - Single parent: run `git log -1 --format=%s <sha>`. First line ends with `(#<prNumber>)` → `'squash'`. Otherwise → `'rebase'`.
  - Zero parents (`parentCount === 0`, root commit or orphan): throw `GitOpError` — callers treat this as a failed diff and log `syncErrors` `source = 'git-diff-failed'`.
  - Non-zero exit or timeout from either call: throw a local `GitOpError`.
- **Releasable**: after this task strategy detection is callable.
- **Tests (TDD)** — `tests/collector/pr-size-sync.test.ts` (start this file; Tasks 3.2–3.3 add to it):
  - Unit: `detect_strategy_two_parents_returns_merge` — mock returns two SHAs.
  - Unit: `detect_strategy_squash_message_suffix_returns_squash` — one parent, message ends `(#42)`.
  - Unit: `detect_strategy_no_suffix_returns_rebase` — one parent, message `"feat: add thing"`.
  - Unit: `detect_strategy_squash_requires_end_not_substring` — `(#42)` in body but not at line end → `'rebase'`.
  - Unit: `detect_strategy_zero_parents_throws_git_op_error` — mock git rev-list returns only the SHA itself (no parent SHAs); verify `GitOpError` thrown.
  - Checkpoint: `vitest run tests/collector/pr-size-sync.test.ts`

#### Task 3.2 — git diff --shortstat runner
- [x] **File**: `src/collector/pr-size-sync.ts`
- **Depends on**: Task 3.1
- **Description**:
  - `runGitDiffShortstat(sha: string, repoPath: string): Promise<{ additions: number; deletions: number; changedFiles: number }>`.
  - Runs `LC_ALL=C git diff <sha>^1 <sha> --shortstat` with 30 s timeout.
  - Parse: `(\d+) files? changed`, `(\d+) insertions?\(\+\)`, `(\d+) deletions?\(-\)` — each match optional, default 0 if absent. Explicitly: absent insertions token → `additions = 0`; absent deletions token → `deletions = 0`. These are NEVER stored as null — null means the git diff command was not run, not that the count is zero.
  - Non-zero exit or timeout: throw `GitOpError` with a message for the `syncErrors` `message` column.
- **Releasable**: after this task git-based size computation is callable.
- **Tests (TDD)** — `tests/collector/pr-size-sync.test.ts`:
  - Unit: `git_diff_shortstat_parses_full_output` — `3 files changed, 10 insertions(+), 5 deletions(-)`.
  - Unit: `git_diff_shortstat_parses_insertions_only` — `2 files changed, 4 insertions(+)`.
  - Unit: `git_diff_shortstat_parses_deletions_only` — `1 file changed, 3 deletions(-)`.
  - Unit: `git_diff_shortstat_empty_output_returns_zeros` — empty string → `{ additions: 0, deletions: 0, changedFiles: 0 }`.
  - Unit: `git_diff_shortstat_deletions_only_returns_additions_zero` — input `"1 file changed, 3 deletions(-)"` → `{ additions: 0, deletions: 3, changedFiles: 1 }`.
  - Unit: `git_diff_shortstat_insertions_only_returns_deletions_zero` — input `"2 files changed, 4 insertions(+)"` → `{ additions: 4, deletions: 0, changedFiles: 2 }`.
  - Unit: `git_diff_shortstat_throws_on_non_zero_exit` — exit code 128.
  - Unit: `git_diff_shortstat_throws_on_timeout` — simulate timeout.
  - Unit: `git_diff_shortstat_throws_on_root_commit_no_parent` — mock git diff exit with 'fatal: Invalid revision sha^1'; verify `GitOpError` thrown with a message indicating root-commit as the cause.
  - Checkpoint: `vitest run tests/collector/pr-size-sync.test.ts`

#### Task 3.3 — git fetch helper
- [x] **File**: `src/collector/pr-size-sync.ts`
- **Depends on**: Task 3.2
- **Description**:
  - `fetchRepo(repoPath: string): Promise<{ ok: true } | { ok: false; reason: string }>`.
  - Runs `LC_ALL=C git fetch --quiet` with 120 s timeout. Non-zero exit or timeout: return `{ ok: false, reason }` without throwing. Callers log to `syncErrors` and skip the repo's size sync.
- **Releasable**: after this task the fetch step is callable.
- **Tests (TDD)** — `tests/collector/pr-size-sync.test.ts`:
  - Unit: `fetch_repo_returns_ok_on_success` — mock exit 0.
  - Unit: `fetch_repo_returns_error_on_non_zero` — mock exit 1 with stderr.
  - Unit: `fetch_repo_returns_error_on_timeout` — simulate timeout.
  - Checkpoint: `vitest run tests/collector/pr-size-sync.test.ts`

---

### Phase 4 — Backfill
> **Releasable**: after Task 4.2 — backfill for PRs without `mergeCommitSha` is callable.

#### Task 4.1 — Ancestor check helper
- [x] **File**: `src/collector/pr-size-sync.ts`
- **Depends on**: nothing (independent git primitive)
- **Description**:
  - `isAncestorOfDefaultBranch(sha: string, repoPath: string): Promise<{ ancestor: boolean; warning?: string }>`.
  - Try `git merge-base --is-ancestor <sha> origin/HEAD`; on failure try `origin/main`, then `origin/master`. If none resolve: return `{ ancestor: false, warning: 'could not verify ancestry; SHA skipped' }` — false negatives (size missing) are safer than false positives (wrong size data from wrong commits).
  - Exit 0 → `{ ancestor: true }`; exit 1 → `{ ancestor: false }`. `LC_ALL=C`, 10 s timeout.
- **Releasable**: after this task commits on unmerged branches are rejectable.
- **Tests (TDD)** — `tests/collector/pr-size-sync.test.ts`:
  - Unit: `ancestor_check_returns_true_when_exit_0` — `origin/HEAD` resolves, exit 0.
  - Unit: `ancestor_check_returns_false_when_exit_1` — exit 1.
  - Unit: `ancestor_check_falls_back_to_origin_main` — `origin/HEAD` fails, `origin/main` exits 0.
  - Unit: `ancestor_check_falls_back_to_origin_master` — `origin/HEAD` and `origin/main` fail, `origin/master` exits 0.
  - Unit: `ancestor_check_rejects_when_all_remotes_fail` — all three fail → `{ ancestor: false, warning: 'could not verify ancestry; SHA skipped' }`.
  - Checkpoint: `vitest run tests/collector/pr-size-sync.test.ts`

#### Task 4.2 — git log grep backfill searcher
- [x] **File**: `src/collector/pr-size-sync.ts`
- **Depends on**: Task 4.1
- **Description**:
  - `findCommitForPr(prNumber: number, mergedAt: Date, repoPath: string): Promise<string | null>`.
  - Pass 1: `git log --all --format=%H%x00%s --grep="pull request #<N>"`. Filter to entries where subject (first line) matches `^Merge pull request #<N> from `. Run `isAncestorOfDefaultBranch` and reject non-ancestors. If multiple remain, pick closest in commit date to `mergedAt`.
  - Pass 2 (only if pass 1 yields nothing): `git log --all --format=%H%x00%s --fixed-strings --grep='(#<N>)'`. Filter to entries where subject ends with `(#<N>)`. Same ancestor check and date selection.
  - Returns SHA or `null`. **When a SHA is found, callers must also write it back to `pull_requests.merge_commit_sha`** (done in Task 5.1 orchestrator via `pr-size-store`).
  - All git log calls in both passes: `LC_ALL=C`, 30 s timeout. If the commit date is known from `mergedAt`, add `--until='<mergedAt + 1 day>'` and `--since='<mergedAt - 30 days>'` as bounds to reduce traversal.
- **Releasable**: after this task backfill SHA lookup is callable.
- **Tests (TDD)** — `tests/collector/pr-size-sync.test.ts`:
  - Unit: `find_commit_returns_merge_commit_sha` — pass 1 returns valid merge commit.
  - Unit: `find_commit_body_mention_excluded` — `#N` only in body → excluded.
  - Unit: `find_commit_falls_through_to_squash_pass` — pass 1 empty → pass 2 returns squash SHA.
  - Unit: `find_commit_squash_body_mention_excluded` — `(#N)` not at subject end → excluded.
  - Unit: `find_commit_picks_closest_to_merged_at` — two pass-1 results, picks closer one.
  - Unit: `find_commit_returns_null_when_no_match` — both passes empty → `null`.
  - Unit: `find_commit_non_ancestor_rejected` — ancestor check returns `false` → SHA excluded.
  - Unit: `find_commit_returns_null_when_commit_outside_date_window` — mock git log with `--since`/`--until` bounds returning empty; verify function returns `null` (no error thrown, best-effort contract).
  - Checkpoint: `vitest run tests/collector/pr-size-sync.test.ts`

---

### Phase 5 — Store & Sync Orchestrator
> **Releasable**: after Task 5.2 — Refresh button triggers size computation end-to-end.

#### Task 5.1 — pr-size-store: updatePrSize
- [x] **File**: `src/collector/pr-size-store.ts`
- **Depends on**: Task 1.3
- **Description**:
  - `updatePrSize(db: AppDb, pullRequestId: string, size: { additions: number; deletions: number; changedFiles: number; mergeCommitSha?: string }): Promise<void>`.
  - Updates `additions`, `deletions`, `changed_files`, and `merge_commit_sha` (if provided) on the matching row.
  - The `mergeCommitSha` parameter is present when backfill found the SHA — writing it back prevents future refreshes from re-running the grep.
- **Releasable**: after this task size data (including backfill SHAs) can be written to the DB.
- **Tests (TDD)** — `tests/collector/pr-size-store.test.ts`:
  - Unit: `update_pr_size_writes_three_columns` — insert PR, call `updatePrSize`, verify `additions`, `deletions`, `changedFiles` set.
  - Unit: `update_pr_size_writes_merge_commit_sha_when_provided` — pass `mergeCommitSha: "abc"` → DB row has `"abc"`.
  - Unit: `update_pr_size_does_not_clear_merge_commit_sha_when_omitted` — existing SHA in DB; call without `mergeCommitSha` → SHA unchanged.
  - Unit: `update_pr_size_overwrites_existing_size_values` — second call with different values overwrites.
  - Checkpoint: `vitest run tests/collector/pr-size-store.test.ts`

#### Task 5.2 — syncRepositoryPrSizes orchestrator
- [x] **File**: `src/collector/pr-size-sync.ts`
- **Depends on**: Task 3.3, Task 4.2, Task 5.1
- **Description**:
  - `syncRepositoryPrSizes(input: { db: AppDb; repoPath: string; repositoryId: string; owner: string; repo: string; syncRunId: string; githubClient: GitHubClient }): Promise<{ ok: number; skipped: number; failed: number }>`.
  - Step 1: `fetchRepo`. On failure: log `syncErrors` row `source = 'git-fetch-failed'`; return `{ ok: 0, skipped: allMergedCount, failed: 0 }`.
  - Step 2: select all `pull_requests` where `repositoryId` matches AND `mergedAt IS NOT NULL` AND (`additions IS NULL`).
  - For each PR:
    - If `mergeCommitSha` non-null: detect strategy → git diff (or API fallback for `'rebase'`) → `updatePrSize`.
    - If `mergeCommitSha` null: `findCommitForPr` → if found, detect strategy → git diff/API → `updatePrSize({ ..., mergeCommitSha: foundSha })`. If not found: count as skipped.
    - On git/API failure: log `syncErrors` `source = 'git-diff-failed'`; count as failed.
  - Marks caller's sync status `partial` when `failed / (ok + skipped + failed) >= 0.1` (the ratio is returned; the `refresh.ts` caller decides on the overall status).
- **Releasable**: after this task `syncRepositoryPrSizes` is callable end-to-end.
- **Tests (TDD)** — `tests/collector/pr-size-sync-integration.test.ts`:
  - Integration: `sync_sizes_computes_merge_commit_pr` — repo with merged PR with known `mergeCommitSha`, mock git calls, verify `additions`/`deletions`/`changedFiles` written.
  - Integration: `sync_sizes_falls_back_to_api_for_rebase_pr` — seed a merged PR with `mergeCommitSha: 'abc123'` (non-null); mock `detectMergeStrategy` to return `'rebase'`; verify `getPullRequestDetail` is called with the correct `pullNumber` and the returned `additions`/`deletions`/`changedFiles` are stored.
  - Integration: `sync_sizes_backfills_pr_without_merge_commit_sha` — `mergeCommitSha` null, `findCommitForPr` returns SHA, size computed and stored including SHA written back.
  - Integration: `sync_sizes_skips_open_prs` — `mergedAt: null` PR not processed.
  - Integration: `sync_sizes_logs_git_diff_failed_on_error` — mock git diff failure, verify `syncErrors` row inserted.
  - Integration: `sync_sizes_logs_failed_when_sha_not_found_after_fetch` — seed PR with `mergeCommitSha: 'deadbeef'` (non-null); mock `fetchRepo` to return `ok: true`; mock `git diff deadbeef^1 deadbeef` to exit non-zero with 'unknown revision'; verify `syncErrors` row inserted with `source = 'git-diff-failed'` and PR counted as `failed`.
  - Integration: `sync_sizes_logs_error_when_backfill_sha_fails_strategy_detection` — seed PR with `mergeCommitSha: null`; mock `findCommitForPr` to return `'sha-abc'`; mock `detectMergeStrategy` to throw `GitOpError`; assert `syncErrors` row inserted with `source = 'git-diff-failed'` and PR counted as `failed`; sync continues to next PR.
  - Integration: `sync_sizes_reports_partial_when_10pct_fail` — enough failures to cross 10% threshold.
  - Integration: `sync_sizes_skips_repo_on_fetch_failure` — fetch fails, `syncErrors` logged, returns `{ ok: 0, skipped: N, failed: 0 }`.
  - Checkpoint: `vitest run tests/collector/pr-size-sync-integration.test.ts`

#### Task 5.3 — Wire size sync into refresh.ts
- [x] **File**: `src/collector/refresh.ts`
- **Depends on**: Task 5.2
- **Description**:
  - After the Phase 02 review sync pass, add a third `runWithConcurrency` pass over repos that succeeded Phase 01 PR sync in this invocation.
  - For each repo call `syncRepositoryPrSizes`. Accumulate `sizeSyncErrors` count.
  - Add `sizeSyncErrors: number` to `RefreshSummary` type.
  - Propagate `status: 'partial'` if any repo's failed ratio ≥ 10%.
- **Releasable**: after this task Refresh triggers size computation.
- **Tests (TDD)** — `tests/collector/refresh-size-sync.test.ts`:
  - Integration: `refresh_runs_size_sync_after_pr_sync` — mock `syncRepositoryPrSizes`, verify called for repos with successful PR sync.
  - Integration: `refresh_runs_size_sync_after_review_sync` — verify ordering: mock all three passes; assert size sync is called only after review sync completes (not interleaved).
  - Integration: `refresh_skips_size_sync_for_failed_pr_sync_repos` — repo whose PR sync failed is excluded.
  - Integration: `refresh_adds_size_sync_errors_to_summary` — `sizeSyncErrors` populated.
  - Checkpoint: `vitest run tests/collector/refresh-size-sync.test.ts`

---

### Phase 6 — Metrics
> **Releasable**: after Task 6.3 — all metric computations are callable.

#### Task 6.1 — PrSizeMetric computation
- [x] **File**: `src/metrics/pr-size-metric.ts`
- **Depends on**: Task 1.1, Task 1.2
- **Description**:
  - Imports `median` from `~/metrics/math`.
  - `computePrSizeMetric(current: PrSizeRecord[], prior: PrSizeRecord[]): PrSizeMetric`:
    - `medianLines`: `median` of `additions + deletions` for non-null PRs in `current`; `null` if none.
    - `medianChangedFiles`: `median` of `changedFiles` for PRs with non-null `changedFiles` in `current`; `null` if none.
    - `previousMedianLines`: same over `prior`; `null` if none.
    - `trendPercent`: `((medianLines - previousMedianLines) / previousMedianLines) * 100` rounded to 1 dp; `null` if either median null, `previousMedianLines === 0`, or `qualifyingPrCount < 3` in `current` or `prior`.
    - The prior qualifying count (used for the `< 3` guard) is computed internally as `prior.filter(p => p.additions !== null && p.deletions !== null).length` — it is NOT exposed as a field on `PrSizeMetric`.
    - `baselineStatus`: `'pending'` if fewer than 3 distinct ISO-week strings among `current` PRs with non-null size; `'available'` otherwise.
    - `qualifyingPrCount`: count of PRs with non-null `additions`/`deletions` in `current`.
  - `getPrSizeWeeklyTrend(prs: PrSizeRecord[], weeks: number, now: Date): Array<{ weekStart: string; medianLines: number | null }>`: bucket PRs by ISO week; `null` for empty weeks (gap, not zero).
- **Releasable**: after this task the median card metric is computable.
- **Tests (TDD)** — `tests/metrics/pr-size-metric.test.ts`:
  - Unit: `median_lines_excludes_null_size_prs` — mix of null and sized PRs; only sized in median.
  - Unit: `median_changed_files_excludes_null_changed_files_independently` — seed PRs where some have `changedFiles: null` but non-null `additions`/`deletions`; assert `medianChangedFiles` is computed only from PRs with non-null `changedFiles`, while `qualifyingPrCount` still counts the PR.
  - Unit: `median_lines_null_when_no_sized_prs`.
  - Unit: `trend_percent_computed_correctly` — current 120, prior 100 → `+20.0`.
  - Unit: `trend_percent_rounds_to_one_decimal_place` — current median 100, prior median 300 → `-66.7` (verifies rounding, not truncation).
  - Unit: `trend_percent_null_when_fewer_than_3_qualifying_in_current`.
  - Unit: `trend_percent_null_when_fewer_than_3_qualifying_in_prior` — `current` has 5 PRs with size data, `prior` has 2 PRs with size data (producing non-null `previousMedianLines`), assert `trendPercent === null`.
  - Unit: `trend_percent_null_when_prior_median_null`.
  - Unit: `trend_percent_null_when_previous_median_is_zero` — `prior` PRs all have `additions: 0, deletions: 0` producing `previousMedianLines = 0`; assert `trendPercent === null`.
  - Unit: `baseline_status_pending_when_3_prs_span_only_2_iso_weeks` — seed 4 PRs with non-null size all with `mergedAt` dates falling in exactly 2 distinct ISO weeks; assert `baselineStatus === 'pending'` (verifies week-counting, not PR-counting).
  - Unit: `baseline_status_available_when_prs_span_3_or_more_iso_weeks` — seed 3 PRs each in a different ISO week; assert `baselineStatus === 'available'`.
  - Unit: `weekly_trend_returns_null_for_empty_weeks`.
  - Unit: `weekly_trend_null_for_week_with_only_null_size_prs` — seed a week with 2 PRs both having `additions: null, deletions: null`; assert that week's `medianLines` is `null` (not `0`).
  - Unit: `weekly_trend_buckets_correctly_by_iso_week`.
  - Checkpoint: `vitest run tests/metrics/pr-size-metric.test.ts`

#### Task 6.2 — PrSizeExceptions computation
- [x] **File**: `src/metrics/pr-size-exceptions.ts`
- **Depends on**: Task 1.1, Task 1.2
- **Description**:
  - Imports `median` from `~/metrics/math`.
  - `buildPrSizeExceptions(teamPrs: Map<string, PrSizeRecord[]>): PrSizeException[]`:
    - For each team: compute the median (simple, not rolling) of `additions + deletions` for PRs with non-null size.
    - Suppress teams with < 3 PRs with non-null size.
    - Flag team if `flaggedPrCount / totalWithSizeCount >= 0.5` where flagged means `additions + deletions > 2 × median`.
    - Sort by ratio descending; cap at 3.
  - Note: teams consistently shipping large PRs are NOT flagged — their median adjusts (by design).
- **Releasable**: after this task the exceptions panel is computable.
- **Tests (TDD)** — `tests/metrics/pr-size-exceptions.test.ts`:
  - Unit: `fires_when_50pct_prs_exceed_2x_median` — 3 PRs, 2 exceed 2× → flagged.
  - Unit: `fires_at_exact_50pct_boundary` — 4 PRs with non-null size, exactly 2 exceeding 2× team median (ratio = 0.5); assert team IS flagged (`>= 0.5` threshold).
  - Unit: `does_not_fire_at_below_50pct` — 3 PRs, 1 exceeds 2× → not flagged.
  - Unit: `suppressed_for_fewer_than_3_prs`.
  - Unit: `sorted_by_flagged_ratio_descending`.
  - Unit: `capped_at_three_teams`.
  - Unit: `null_size_prs_excluded_from_all_counts`.
  - Unit: `chronically_large_team_not_flagged` — all PRs large but median also large → 0 exceed 2×.
  - Checkpoint: `vitest run tests/metrics/pr-size-exceptions.test.ts`

#### Task 6.3 — PrSizeTeamBreakdown computation
- [x] **File**: `src/metrics/pr-size-team-breakdown.ts`
- **Depends on**: Task 1.1, Task 1.2
- **Description**:
  - Imports `median` from `~/metrics/math`.
  - `getPrSizeTeamBreakdown(prs: PrSizeRecord[], currentWindow: { from: Date; to: Date }, priorWindow: { from: Date; to: Date }): PrSizeTeamRow[]`:
    - Group by `team`; exclude PRs where `team === null`.
    - Only include teams with ≥ 1 PR with non-null size in `currentWindow`.
    - `prCount`: PRs with non-null size in window.
    - `medianLines`: median of `additions + deletions` for non-null PRs in `currentWindow`.
    - `trend`: `'↑'` if current >= prior × 1.1; `'↓'` if prior >= current × 1.1; `'→'` otherwise. `'—'` if < 3 PRs with size data in either window.
    - `largestPr*`: the single PR with highest `additions + deletions` in `currentWindow` across all team repos.
    - Sorted by `medianLines` descending (null last).
- **Releasable**: after this task the team breakdown table is computable.
- **Tests (TDD)** — `tests/metrics/pr-size-team-breakdown.test.ts`:
  - Unit: `excludes_teams_with_no_size_data`.
  - Unit: `trend_up_when_current_exceeds_prior_by_10pct` — current 111, prior 100 → `'↑'` (strictly above 10%).
  - Unit: `trend_up_at_exact_10pct_boundary` — current 110, prior 100 → `'↑'` (`>= 1.1` threshold).
  - Unit: `trend_down_when_prior_exceeds_current_by_10pct` — current 89, prior 100 → `'↓'` (strictly below -10%).
  - Unit: `trend_down_at_exact_10pct_boundary` — current 90, prior 100 → `'↓'` (`>= 1.1` threshold applied symmetrically).
  - Unit: `trend_flat_within_10pct` — current 105, prior 100 → `'→'`.
  - Unit: `trend_dash_when_fewer_than_3_prs_in_current`.
  - Unit: `trend_dash_when_fewer_than_3_prs_in_prior`.
  - Unit: `prior_window_median_computed_from_prior_prs_only` — create 4 PRs in `currentWindow` (median 100 lines), 5 PRs in `priorWindow` with a different median (50 lines); assert team row has correct `medianLines` (100) and trend `'↑'`, verifying prior median is drawn from prior window PRs, not all PRs.
  - Unit: `largest_pr_selected_correctly_across_repos`.
  - Unit: `largest_pr_excludes_null_size_prs` — team with 3 PRs: one `additions: null`, two with non-null size data of different magnitudes; assert `largestPrLines` equals the larger of the two sized PRs.
  - Unit: `sorted_by_median_descending`.
  - Unit: `null_team_repos_excluded`.
  - Checkpoint: `vitest run tests/metrics/pr-size-team-breakdown.test.ts`

---

### Phase 7 — Dashboard Payload Integration
> **Releasable**: after Task 7.2 — the API returns `prSize` data when available.

#### Task 7.1 — Add PrSize output types to pr-cycle-time-dashboard.ts
- [x] **File**: `src/metrics/pr-cycle-time-dashboard.ts`
- **Depends on**: Task 6.3
- **Description**:
  - Add types `PrSizeMetric`, `PrSizeException`, `PrSizeTeamRow`, `PrSize` as shown in the Architecture section.
  - Add `prSize?: PrSize` to `PrCycleTimeDashboard` type.
  - No behavior change — `getPrCycleTimeDashboard` still returns the same payload (new key absent until Task 7.2).
- **Releasable**: after this task TypeScript consumers can reference the new types.
- **Tests (TDD)** — `tests/metrics/dashboard-types-phase-03.test.ts`:
  - Unit: `dashboard_type_prSize_key_is_optional` — `PrCycleTimeDashboard` without `prSize` type-checks.
  - Unit: `pr_size_type_shape_matches_spec` — construct a full `PrSize` literal and verify all fields present.
  - Checkpoint: `vitest run tests/metrics/dashboard-types-phase-03.test.ts`

#### Task 7.2 — getPrCycleTimeDashboard: extend Phase 01 query and populate prSize
- [x] **File**: `src/metrics/pr-cycle-time-dashboard.ts`
- **Depends on**: Task 7.1, Task 6.1, Task 6.2, Task 6.3
- **Description**:
  - Extend the existing `pullRequests` + `repositories` query to also select `additions`, `deletions`, `changedFiles`, `title`, `url` from `pullRequests`. These columns are already present on `$inferSelect` after the migration.
  - In the existing row-iteration loop (where `rowToPr(row)` is called), also extract size fields inline: `const sizeEntry = { id: row.id, number: row.number, title: row.title, url: row.url, repositoryId: row.repositoryId, repoFullName: ..., team: row.team, mergedAt: row.mergedAt, additions: row.additions, deletions: row.deletions, changedFiles: row.changedFiles }` and push into a parallel `sizePrs: PrSizeRecord[]` array.
  - `PullRequestRecord` type is **not changed**.
  - After all existing Phase 01/02 computations, compute size metrics:
    - `computePrSizeMetric(currentSizePrs, priorSizePrs)` — pass current-window PRs and prior-window PRs separately.
    - `getPrSizeWeeklyTrend(sizePrs, weeks, now)` — pass the full `sizePrs` array (unfiltered); the function buckets internally by ISO week.
    - `buildPrSizeExceptions(currentTeamPrs)` — pass **only current-window PRs**, grouped by team. Do NOT include prior-window PRs; the brief specifies flagging against current-window behavior only.
    - `getPrSizeTeamBreakdown(sizePrs, currentWindow, priorWindow)` — pass the full array; the function filters by window internally.
  - Set `prSize` on the returned payload only when `qualifyingPrCount > 0`; otherwise omit.
  - Current and prior windows: use the same `weeks` value already resolved at the top of `getPrCycleTimeDashboard` (same `current`/`previous` date ranges computed for Phase 01/02 — do NOT hardcode 8). Pass `weeks` (not the literal `8`) to `getPrSizeWeeklyTrend`.
- **Releasable**: after this task the full PR Size payload flows from DB to API.
- **Tests (TDD)** — `tests/metrics/dashboard-phase-03.test.ts`:
  - Integration: `dashboard_includes_pr_size_when_sized_prs_exist` — insert PRs with size data, verify `prSize` key present with correct median.
  - Integration: `dashboard_omits_pr_size_when_no_sized_prs` — all PRs null size → `prSize` key absent.
  - Integration: `dashboard_pr_size_metric_matches_expected_median` — known set of PRs, verify exact median value.
  - Integration: `dashboard_computes_median_over_sized_prs_only` — seed 5 PRs: 3 with `additions + deletions` values of 100, 200, 300 (median 200); 2 with `additions: null, deletions: null`; assert `prSize.metric.medianLines === 200`, `prSize.metric.qualifyingPrCount === 3`, and `prSize` key IS present (section shown).
  - Integration: `dashboard_phase01_shape_unchanged` — seed 3 PRs with known `openedAt`/`mergedAt` values; assert `metric.medianHours` equals the expected value for the seeded data (not just that the key exists); assert `exceptions`, `weeklyTrend`, `teamBreakdown` are arrays with expected lengths (regression).
  - Integration: `dashboard_phase02_shape_unchanged` — assert `firstReview`, `reviewFreshness`, `reviewMetricsPending` keys unchanged (regression).
  - Checkpoint: `vitest run tests/metrics/dashboard-phase-03.test.ts`

---

### Phase 8 — UI
> **Releasable**: after Task 8.5 — the PR Size section is visible in the browser.

#### Task 8.1 — PrSizeCard component
- [x] **File**: `src/components/dashboard/PrSizeCard.tsx`
- **Depends on**: Task 7.2
- **Description**:
  - Props: `{ metric: PrSizeMetric }`.
  - Headline: `medianLines` formatted as `"N lines"`.
  - Secondary line: `"across N files"` from `medianChangedFiles`; omit if null.
  - Reuse `TrendComparison` for period-over-period trend. Show `"baseline pending"` (suppress trend arrow) when `baselineStatus === 'pending'`.
  - Coverage subtitle: `"Across N PRs"` from `qualifyingPrCount`.
- **Releasable**: after this task the metric card renders.
- **Tests (TDD)** — `tests/components/PrSizeCard.test.tsx`:
  - Unit: `renders_median_lines_value` — `medianLines: 312` → `"312"` visible.
  - Unit: `renders_across_n_files_secondary_line` — `medianChangedFiles: 5` → `"across 5 files"`.
  - Unit: `omits_secondary_line_when_changed_files_null`.
  - Unit: `shows_baseline_pending_when_pending`.
  - Unit: `shows_trend_arrow_when_available` — positive `trendPercent` shows `+` indicator.
  - Checkpoint: `vitest run tests/components/PrSizeCard.test.tsx`

#### Task 8.2 — PrSizeExceptionsPanel component
- [x] **File**: `src/components/dashboard/PrSizeExceptionsPanel.tsx`
- **Depends on**: Task 8.1
- **Description**:
  - Props: `{ exceptions: PrSizeException[] }`.
  - Returns `null` when `exceptions.length === 0`.
  - Each exception row: team name + `"N of M PRs exceed 2× team median"`. No author names.
- **Releasable**: after this task the exceptions panel renders.
- **Tests (TDD)** — `tests/components/PrSizeExceptionsPanel.test.tsx`:
  - Unit: `panel_hidden_when_no_exceptions`.
  - Unit: `panel_shows_team_and_description` — one exception, team name and count visible.
  - Unit: `panel_shows_multiple_exceptions` — three rows.
  - Checkpoint: `vitest run tests/components/PrSizeExceptionsPanel.test.tsx`

#### Task 8.3 — PrSizeTrendChart component
- [x] **File**: `src/components/dashboard/PrSizeTrendChart.tsx`
- **Depends on**: Task 8.1
- **Description**:
  - Props: `{ weeklyTrend: Array<{ weekStart: string; medianLines: number | null }> }`.
  - Reuse `WeeklyTrendChart`. Null weeks → gaps (not zero). Y-axis label: `"Median lines changed"`.
- **Releasable**: after this task the trend chart renders.
- **Tests (TDD)** — `tests/components/PrSizeTrendChart.test.tsx`:
  - Unit: `renders_chart_with_data_points` — 4 non-null weeks renders without crash.
  - Unit: `null_weeks_not_mapped_to_zero` — mock `WeeklyTrendChart` as a spy; pass data with null entries; assert the spy received the prop array with null values preserved (not coerced to 0).
  - Checkpoint: `vitest run tests/components/PrSizeTrendChart.test.tsx`

#### Task 8.4 — PrSizeTeamTable component
- [x] **File**: `src/components/dashboard/PrSizeTeamTable.tsx`
- **Depends on**: Task 8.1
- **Description**:
  - Props: `{ rows: PrSizeTeamRow[] }`.
  - Columns: Team, PRs merged, Median size (lines), Trend, Largest PR (title + repo as link to `largestPrUrl`).
  - Trend cell: `↑`, `↓`, `→`, `—`. No author names anywhere.
- **Releasable**: after this task the team table renders.
- **Tests (TDD)** — `tests/components/PrSizeTeamTable.test.tsx`:
  - Unit: `renders_all_columns` — all column headers and first-row cells present.
  - Unit: `trend_arrows_rendered_correctly` — all four trend values render as expected.
  - Unit: `largest_pr_is_a_link` — `largestPrUrl` in an anchor tag.
  - Unit: `no_author_names_in_output`.
  - Checkpoint: `vitest run tests/components/PrSizeTeamTable.test.tsx`

#### Task 8.5 — PrSizeSection component and PrCycleTimeDashboard wiring
- [x] **Files**: `src/components/dashboard/PrSizeSection.tsx`, `src/components/dashboard/PrCycleTimeDashboard.tsx`
- **Depends on**: Task 8.2, Task 8.3, Task 8.4
- **Description**:
  - `PrSizeSection({ prSize }: { prSize: PrSize | undefined })` — returns `null` when `prSize === undefined` (hidden-until-data, same pattern as `FirstReviewSection`).
  - Rendering states: (a) `prSize === undefined` → section not rendered; (b) `prSize` defined + `metric.baselineStatus === 'pending'` → section shown, median card displays `"baseline pending"` in place of the trend arrow (raw median is still shown); (c) `prSize` defined + `metric.baselineStatus === 'available'` → section shown with all elements including trend.
  - When present: heading `"PR Size"`, subtitle `"Median lines changed per merged PR"`, renders `PrSizeCard`, `PrSizeExceptionsPanel`, `PrSizeTrendChart`, `PrSizeTeamTable`. `data-testid="phase03-section"` on the section element.
  - In `PrCycleTimeDashboard.tsx`: import `PrSizeSection`, render after `<FirstReviewSection>`.
- **Releasable**: after this task the full PR Size section is visible in the browser.
- **Tests (TDD)** — `tests/components/PrSizeSection.test.tsx`:
  - Unit: `section_hidden_when_prSize_undefined`.
  - Unit: `section_renders_when_prSize_provided` — `data-testid="phase03-section"` present, all children rendered.
  - Unit: `section_shows_baseline_pending_state` — pass `prSize` with `metric.baselineStatus = 'pending'`; assert section renders (not hidden), "baseline pending" text is present, trend chart is still rendered.
  - Unit: `phase01_section_still_renders` — both sections present in `PrCycleTimeDashboard`.
  - Unit: `phase02_section_still_renders` — `data-testid="phase02-section"` present alongside phase03.
  - Checkpoint: `vitest run tests/components/PrSizeSection.test.tsx`

---

### Phase 9 — Verify Script & E2E
> **Releasable**: after Task 9.2 — full verification gate passes.

#### Task 9.1 — vitest.config.phase03.ts and verify:phase03 npm script
- [x] **Files**: `vitest.config.phase03.ts`, `package.json`
- **Depends on**: Task 8.5
- **Description**:
  - Create `vitest.config.phase03.ts` mirroring `vitest.config.phase02.ts`. Coverage `include`:
    ```
    src/metrics/pr-size-*.ts
    src/metrics/math.ts
    src/collector/pr-size-*.ts
    src/components/dashboard/PrSize*.tsx
    ```
  - Thresholds: lines/functions/branches/statements ≥ 85%.
  - Add to `package.json` scripts:
    ```
    "verify:phase03": "npm run lint && npm run typecheck && vitest run --coverage --config vitest.config.phase03.ts && playwright test --grep @phase03"
    ```
- **Tests (TDD)**: N/A — config file.
- **Checkpoint**: `npm run verify:phase03`

#### Task 9.2 — Playwright E2E tests
- [x] **File**: `tests/e2e/phase03-pr-size.spec.ts`
- **Depends on**: Task 9.1
- **Description**:
  - All tests tagged `@phase03`.
  - Seed setup: E2E setup must seed at minimum: 6 PRs across 2 teams with non-null `additions`/`deletions`/`changedFiles` values (e.g., lines from 50 to 800). At least 1 team should have 2+ PRs exceeding 2× team median to test the exceptions panel. Use a direct `db.insert(pullRequests).values({..., additions: N, deletions: N, changedFiles: N})` in the test setup — do NOT rely on the git sync path for E2E tests.
  - `phase03_pr_size_section_visible_when_data_exists` — seed DB with PRs with non-null size, assert `data-testid="phase03-section"` visible.
  - `phase03_pr_size_section_hidden_when_no_data` — no sized PRs → section absent.
  - `phase03_pr_size_card_shows_median` — seeded median visible in card.
  - `phase03_team_table_renders` — at least one team row visible.
  - `phase03_exceptions_panel_hidden_when_no_exceptions`.
  - `phase03_phase01_still_visible` — Phase 01 section present alongside Phase 03.
  - `phase03_phase02_still_visible` — Phase 02 section present alongside Phase 03.
- **Checkpoint**: `playwright test --grep @phase03`

---

### Phase 10 — Final Verification & Documentation

#### Task 10.1 — Final verification & documentation update
- [x] **File**: N/A (agent task)
- **Depends on**: all prior tasks
- **Description**:
  - Spawn an agent to discover all documentation in the project (READMEs, phase docs, roadmap, `Documentation/`) and update every file whose content is affected by this plan. At minimum: mark Phase 03 acceptance criteria checkboxes in `phase-03-pr-size.md`; update `trackable-roadmap.md`; update `Documentation/README.md` if it references phases.
  - Verify all acceptance criteria below are met before marking this task complete.
- **Releasable**: after this task the feature is fully verified and all documentation reflects the delivered implementation.
- **Acceptance criteria** (must all pass):
  - **Metric card**: Shows median `additions + deletions` for non-null PRs in the 8-week window. Shows `"baseline pending"` when < 3 weeks of size data (raw median still shown). Shows period-over-period trend vs. prior 8 weeks.
  - **Exceptions panel**: Teams with ≥ 3 PRs where ≥ 50% exceed 2× team median. Sorted by ratio descending. Max 3. Hidden when empty.
  - **Trend chart**: Median PR size per week for 8 weeks. Null weeks are gaps, not zeros. Renders regardless of `baselineStatus`.
  - **Team breakdown**: All teams with ≥ 1 sized PR. Columns: Team, PRs merged, Median size, Trend (↑/↓/→/—), Largest PR (title + repo link). Sorted by median descending. No author names.
  - **No data state**: Entire PR Size section hidden when zero PRs have non-null `additions`/`deletions`.
  - **Size computation**: Merge/squash via `git diff <sha>^1 <sha> --shortstat`; rebase via GitHub PR detail API. Strategy detection per brief. `changedFiles` from `--shortstat` file count (git path) or `changed_files` (API path).
  - **Null handling**: PRs where size cannot be computed are excluded from all medians. Not shown as zero.
  - **Backfill**: Found SHAs written back to `merge_commit_sha` so future refreshes skip the grep.
  - **Phase 01 and Phase 02 surfaces unchanged**: `npm run verify:phase01` and `npm run verify:phase02` both pass.
  - **`npm run verify:phase03` passes**: lint + typecheck + coverage ≥ 85% on Phase 03 source files + all `@phase03` E2E tests green.
- **Tests (TDD)**: N/A — verification task.
- **Checkpoint**: `npm run verify:phase03 && npm run verify:phase02 && npm run verify:phase01`
