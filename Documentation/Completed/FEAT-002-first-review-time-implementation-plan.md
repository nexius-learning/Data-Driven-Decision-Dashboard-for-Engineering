# FEAT-002 — First Review Time
**Purpose**: Add Phase 02 review-latency visibility (Median First Review Time, merge-without-review hygiene) without changing the Phase 01 PR Cycle Time surface.
**Audience**: Head of Engineering, FEAT-002 implementation agent, engineers maintaining the dashboard.
**Status**: To Do

---

## Background

Phase 01 ([FEAT-001](FEAT-001-pr-cycle-time-mvp-implementation-plan.md)) shipped a single-metric dashboard for PR Cycle Time. Phase 02 adds two review-health signals so leadership can see how long PRs wait for a first human review and which teams are merging without review at all. The brief (see Feature Brief link below) makes three product overrides on top of the locked phase doc: median measures **first human review** only, bot activity is shown as honest context, and the Phase 02 surface lives in a second section below the Phase 01 viewport.

Feature brief: [phase-02-first-review-time-brief.md](phase-02-first-review-time-brief.md) — **authoritative for product semantics where it overrides the phase doc.**
Phase doc: [phase-02-first-review-time.md](phase-02-first-review-time.md)
UI mockup: [04-pr-cycle-time-and-first-review.png](../Assets/mockups/04-pr-cycle-time-and-first-review.png)

### Migration from existing partial Phase 02 implementation

A partial Phase 02 surface already exists in the codebase and predates this plan. FEAT-002 is **not** a greenfield build; it is a reconciliation of the existing partial implementation with the locked brief. The existing code that must change:

- `src/metrics/pr-cycle-time-dashboard.ts` already exports a nested `firstReview?` shape with `metric.reviewedPrCount`, team rows containing `reviewedPrs` and `mergeWithoutReviewCount: number`, and `freshness: { reviewMetadataSyncedAt, reviewSyncErrors }` nested **inside** `firstReview`. FEAT-002 reshapes this per the Core Types section below: rename `reviewedPrCount` to `qualifyingPrCount` and add a sibling `mergedPrCountInSyncedRepos` (N); change `mergeWithoutReviewCount: number` to `noReviewMergeCount: number | null`; **remove** the nested `firstReview.freshness` and replace it with two top-level siblings `reviewFreshness` and `reviewMetricsPending`; **remove** the `reviewedPrs` field from team rows (the column is dropped per the brief; the trend-cell baseline-pending logic must be re-implemented against `medianHours`/`trendPercent` only).
- `src/components/dashboard/PrCycleTimeDashboard.tsx` already renders the First Review section inline (subtitle `PR opened to first submitted review`, Reviewed-PRs `<th>`/`<td>`, em-dash logic that uses `=== 0` rather than `=== null` for the No-review Merges cell). FEAT-002 extracts this inline rendering into dedicated component files (`FirstReviewSection.tsx`, `FirstReviewCard.tsx`, `FirstReviewExceptionsPanel.tsx`, `FirstReviewTrendChart.tsx`, `FirstReviewTeamTable.tsx`, `FreshnessStrip.tsx`), changes the subtitle to `PR opened to first human review`, drops the `Reviewed PRs` column, and switches the em-dash logic from `=== 0` to `=== null` (the data layer now emits `null` for "no hygiene match" and `≥1` numbers otherwise; literal `0` is no longer produced).
- `src/collector/refresh.ts` already uses a worker-pool `runWithConcurrency` helper (see lines 52 and 175). The original plan referenced a "global semaphore" object that does not exist. Task 4.3 is rewritten to run review sync as a **second pass** through `runWithConcurrency` over repos whose Phase 01 PR sync succeeded in this invocation; no semaphore object is introduced.

Every Phase 5/6/7 task below assumes this migration is the starting state. New tasks 0.1 and 7.0 capture the explicit removal steps so the implementing agent does not bolt new code on top of the existing partial surface.

---

## Goal

When this plan is complete, the user can run the app locally, click Refresh, and after at least one repo's review sync succeeds, see a new Phase 02 section below the unchanged Phase 01 viewport containing: a Median First Review Time card (human reviews only) with a coverage subtitle and bot-share side stat, a review-latency exceptions panel, an 8-week First Review weekly trend chart, a Phase 02 team table with First Review / Review Trend / No-review Merges columns, and a freshness item showing the oldest review sync timestamp. Until the first review sync succeeds the section is hidden and the freshness strip shows a single "Review metrics will appear after the next refresh" hint. `npm run verify:phase01` continues to pass; `npm run verify:phase02` passes.

---

## Scope

### In Scope

- Drizzle migration adding a `pull_request_reviews` table (raw per-review storage) and `repositories.lastReviewSyncedAt`. The spec's three denormalized columns on `pull_requests` (`firstReviewSubmittedAt`, `distinctReviewAuthors`, `reviewCommentCount`) are **dropped in the same migration** if they were created earlier; this plan does not create them.
- GitHub REST clients for `GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews` and `.../comments`.
- Bot identity helper (`user.type === "Bot"` OR `user.login.endsWith("[bot]")`; null user → human).
- Review sync step in the collector, run after Phase 01 PR sync, with same-invocation gating per repo, using the existing `runWithConcurrency` helper in `src/collector/refresh.ts` (reusing the `GITHUB_SYNC_CONCURRENCY` limit), `lastReviewSyncedAt` updated only on full-repo success, per-repo error isolation with `sync_errors.source = github_reviews`, incremental gating on `githubUpdatedAt > lastReviewSyncedAt`.
- Metrics module computing First Review Time (humans only), median, 8-week weekly trend with null buckets, previous-period comparison, team breakdown, merge-without-review hygiene, bot-share side stat (B, X%, K), and Phase 02 exception list (`review_latency_worsened`, `merge_without_review`, `review_baseline_pending`).
- Dashboard payload extensions: nested `firstReview?` object, top-level siblings `reviewFreshness?` and `reviewMetricsPending?`. Phase 01 `freshness` type is **not** mutated.
- UI: hidden-until-synced Phase 02 section below Phase 01; First Review card with subtitle/coverage/side-stat states; exceptions panel (hides when empty); weekly trend chart (always renders once section is shown); Phase 02 team table; combined freshness strip rendering Phase 01 + Phase 02 items as one visual row.
- `verify:phase02` npm script: `eslint && tsc --noEmit && vitest run --coverage && playwright test --grep @phase02`. Coverage scope: aggregate ≥85% over Phase 02 source files only; every Phase 02 source file must have non-zero coverage.
- Documentation updates: phase doc acceptance checklist boxes, trackable roadmap link, README next-step.

### Out of Scope

- Splitting hygiene to a later phase — rejected; ship together (brief).
- Author-level rankings or review-author identity in any UI surface (no surveillance).
- Range selector, Jira data, auth, cloud sync, PR size — Phase 03+.
- Heuristic bot detection beyond `user.type` / `[bot]` suffix.
- Force-push stale-review detection.
- Notifications/alerts on two-period exception persistence.
- Per-team "Reviewed PRs" column (deferred to Future Iterations in brief).
- Modifying Phase 01 PR Cycle Time computations, exceptions, payload shape, or UI.

---

## Acceptance criteria

- [ ] Drizzle migration creates `pull_request_reviews` and `repositories.lastReviewSyncedAt`; applies cleanly to a fresh DB and to a Phase 01 DB.
- [ ] GitHub client fetches reviews and review comments with pagination; surfaces rate-limit errors as structured sync errors.
- [ ] Bot identity helper classifies `user.type === "Bot"`, `[bot]` suffix logins, null `user` objects, and null `user.type` consistently per brief.
- [ ] Review sync runs only for repos whose **this-invocation** Phase 01 PR sync succeeded; per-PR failures are logged to `sync_errors` but do not block other PRs; `lastReviewSyncedAt` is set to repo-sync finish time only on full-repo success.
- [ ] Median First Review Time is computed over qualifying PRs (≥1 qualifying human review).
- [ ] Coverage values M and N are computed per brief definitions and surfaced in the card subtitle (suppressed when N=0; M=0 N>0 shows "0 of N").
- [ ] Bot-share side stat (B, X%, K) is computed per brief definitions and omitted entirely when B=0.
- [ ] 8-week First Review weekly trend renders once Phase 02 is visible, with null buckets for empty weeks.
- [ ] Trend percent is gated on ≥3 qualifying PRs in previous period AND previous median > 0.
- [ ] Merge-without-review hygiene rule fires per locked thresholds (no qualifying review of any kind, zero pre-merge review comments, merged in <7 minutes).
- [ ] Phase 02 exceptions panel emits `review_latency_worsened`, `merge_without_review`, `review_baseline_pending` per brief gating, sorted by severity → trend magnitude → team name, capped at 3 total, hidden when zero exceptions qualify.
- [ ] Phase 02 team table includes any team with ≥1 merged PR in a review-synced repo; columns show `—` per brief rules; teams with only bot reviews and no hygiene match show three dashes.
- [ ] Dashboard payload omits `firstReview` key entirely when no repo has `lastReviewSyncedAt IS NOT NULL`; sets `reviewMetricsPending` in that state and `reviewFreshness` in the visible state.
- [ ] Phase 01 freshness type is unchanged (regression test asserts exact shape).
- [ ] Phase 02 section is hidden until at least one repo has `lastReviewSyncedAt IS NOT NULL`; freshness strip shows the pending hint in that state.
- [ ] Phase 02 section is visible after the first repo's review sync succeeds.
- [ ] Phase 01 team table column set is unchanged (regression test asserts exact ordered header strings).
- [ ] Phase 01 PR Cycle Time card, exceptions, trend, team table behavior remain unchanged.
- [ ] `npm run verify:phase01` continues to pass.
- [ ] `npm run verify:phase02` passes.
- [ ] Trackable roadmap and phase doc are updated.

### Acceptance-to-test traceability

| Acceptance criterion | Task(s) | Primary test(s) |
| --- | --- | --- |
| Drizzle migration | 2.1, 2.2 | `migration_creates_pull_request_reviews_table`, `migration_adds_last_review_synced_at`, `migration_applies_on_fresh_db`, `migration_applies_on_phase01_db` |
| GitHub client | 3.1, 3.2 | `github_client_lists_pr_reviews`, `github_client_paginates_reviews`, `github_client_lists_pr_review_comments`, `github_client_review_rate_limit_error` |
| Bot identity | 3.3 | `bot_identity_user_type_bot_is_bot`, `bot_login_endswith_bracket_bot_literal_suffix`, `bot_login_must_end_with_bracket_bot_not_just_contain_it`, `human_user_with_login_ending_in_bracket_bot_is_classified_as_bot`, `null_user_object_treated_as_human`, `null_user_type_treated_as_human` |
| Review sync gating + isolation | 4.1, 4.2, 4.3 | `review_sync_skipped_when_pr_sync_failed_same_run`, `review_sync_runs_when_pr_sync_succeeded`, `per_repo_review_sync_error_isolated`, `last_review_synced_at_on_success_only`, `incremental_gating_on_github_updated_at`, `recompute_from_full_response_on_dismissed_review` |
| Median + qualifying PR | 5.1, 5.2 | `human_only_median_excludes_bot_reviews`, `bot_first_then_human_uses_human_timestamp`, `human_first_then_bot_uses_human_timestamp`, `bot_only_pr_excluded_from_median_and_M`, `dismissed_and_pending_ignored`, `review_after_merge_ignored` |
| Coverage M and N | 5.2, 6.2 | `coverage_subtitle_m_of_n_population`, `coverage_subtitle_n_excludes_unsynced_repo_prs`, `coverage_subtitle_omitted_when_N_zero`, `mixed_sync_state_excludes_unsynced_repo_prs_from_M_N_B_K_and_team_breakdown` |
| Bot-share side stat | 5.3 | `bot_share_denominator_includes_bots`, `first_review_by_bot_count_K`, `K_excludes_prs_with_zero_qualifying_reviews`, `bot_share_side_stat_absent_when_B_zero` |
| Trend + baseline | 5.4 | `first_review_weekly_trend_renders_null_weeks`, `trend_gate_three_qualifying_human_prs`, `trend_percent_null_when_previous_median_zero` |
| Hygiene | 4.1, 5.5 | `merge_without_review_hygiene_rule`, `bot_only_pr_not_auto_hygiene`, `hygiene_uses_any_qualifying_review_count_not_distinct_authors`, `review_comment_count_excludes_post_merge` (lives in Task 4.1 review store, sourced for hygiene rule) |
| Exception sort order | 5.0 | `exception_sort_helper_orders_by_severity_then_abs_trend_then_team_name`, `exception_sort_helper_null_trend_sorts_last_within_severity`, `sort_helper_places_null_magnitude_after_zero_magnitude`, `phase_01_sortExceptions_orders_fixed_fixture_inputs_in_exact_expected_order` |
| Exception emission rules | 5.6 | `review_latency_worsened_fires_at_25pct_threshold`, `review_latency_worsened_does_not_fire_below_25pct_threshold`, `review_latency_worsened_requires_previous_baseline`, `merge_without_review_without_qualifying_reviews`, `review_baseline_pending_emitted`, `baseline_pending_team_with_only_bot_reviews_silent`, `exceptions_sort_by_severity_then_magnitude_then_team_name`, `exceptions_capped_at_three_total_across_types`, `exceptions_panel_hidden_when_zero_qualifying_exceptions`, `exception_builder_populates_trend_percent_from_team_aggregate`, `merge_without_review_exception_populates_prDetails_with_title_repo_only`, `non_merge_without_review_exceptions_omit_prDetails` |
| Team breakdown | 5.7 | `first_review_team_column`, `phase_02_team_table_includes_teams_with_only_bot_reviews_with_em_dash`, `phase_02_team_table_no_review_merges_renders_em_dash_not_zero_when_no_hygiene_match` |
| Payload contract | 6.1, 6.2 | `payload_omits_firstReview_key_before_first_sync`, `payload_includes_firstReview_after_first_sync`, `payload_includes_reviewFreshness_when_phase02_visible`, `payload_includes_reviewMetricsPending_when_phase02_hidden`, `phase_01_freshness_type_shape_unchanged` |
| Hidden-until-synced | 6.2, 7.1 | `phase_02_section_hidden_when_no_repo_review_synced`, `phase_02_section_hidden_when_repositories_table_empty`, `phase_02_section_visible_after_first_repo_sync`, `freshness_pending_hint_visible_in_phase01_strip_when_hidden`, `freshness_pending_hint_absent_when_visible`, `e2e_first_sync_reveals_phase_02_section` |
| First Review card | 7.2 | `card_subtitle_reads_first_human_review`, `card_subtitle_and_coverage_suppressed_when_N_zero`, `coverage_subtitle_renders_M_of_N`, `bot_share_side_stat_renders` |
| Exceptions panel UI | 7.3 | `review_exceptions_panel`, `exceptions_panel_hidden_when_zero_qualifying_exceptions` (component) |
| Trend chart UI | 7.4 | `trend_chart_renders_with_null_weeks_when_M_zero` |
| Phase 02 team table UI | 7.5 | `phase_02_team_column`, `two_team_tables_render_independently` |
| Freshness strip | 7.6 | `freshness_shows_oldest_review_sync_across_synced_repos` |
| Phase 01 regression | 8.1 | `phase_01_team_table_columns_unchanged_regression`, `phase01_cycle_time_unchanged`, `no_future_metric_cards`, `phase_01_freshness_type_shape_unchanged` |
| Layout | 7.1 | `within_section_layout_card_and_exceptions_side_by_side`, `within_section_layout_trend_and_team_table_stacked_below_first_row` |
| E2E | 8.2 | `e2e_first_sync_reveals_phase_02_section`, `e2e_bot_only_pr_visible_in_hygiene_not_in_median`, `e2e_phase_01_unchanged_under_phase_02_load` |
| Verify | 9.1 | `verify:phase02` script invocation; `verify:phase01` continues green |
| Docs | 9.2 | `docs_phase_02_checklist_updated`, `docs_trackable_roadmap_links_feat_002` |

---

## What does NOT change

- Phase 01 `pull_requests` columns, `repositories` columns other than the new `lastReviewSyncedAt`, and `sync_errors` shape.
- Phase 01 `PrCycleTimeDashboard` `metric`, `exceptions`, `weeklyTrend`, `teamBreakdown`, and `freshness` types and values.
- Phase 01 UI (header, range label, Local data pill, Refresh action, PR Cycle Time card, PR Cycle Time exceptions panel, PR Cycle Time trend chart, Phase 01 team table, Phase 01 freshness strip content).
- `verify:phase01` script behavior.
- Existing collector `refreshLocalData` orchestration **prior to** the review sync step (PR sync and repository upserts unchanged).
- GitHub PR metadata sync (`/pulls` endpoint usage).
- No author identity, avatar, or login appears in any Phase 02 UI surface.

---

## Known limitations / accepted trade-offs

- Bot detection relies solely on GitHub's `user.type` and `[bot]` suffix. No heuristic fallback; this is intentional.
- Review-comment edits that do not bump GitHub's `pull_request.updated_at` may leave per-PR `reviewCommentCount` stale until the next sync that does see an `updated_at` bump. Accepted as low-probability.
- A repo whose review sync **pass** completes can still contain individual PRs whose review fetch failed; those PRs are included in N but have empty review data. Accepted; surfaced as per-repo sync errors.
- The exception cap of 3 may be entirely consumed by a single type (commonly `merge_without_review`). Intentional: cap is a noise budget, not a diversity quota.
- Force-pushed PRs that retain reviews against a since-replaced commit are treated normally (no staleness detection).
- Subtitle visual placement of the bot-share side stat (in-card vs. tooltip vs. below-card) is a planning-stage UX choice during Task 7.2 and not load-bearing.
- Storage shape locked in this plan: `pull_request_reviews` table (raw rows). Denormalized-columns alternative is not pursued.

---

## Architecture

### New modules

- `src/db/schema.ts` — extend with `pullRequestReviews` table; add `lastReviewSyncedAt` to `repositories`.
- `drizzle/0002_<drizzle-auto-suffix>.sql` — the next sequential migration produced by `drizzle-kit generate`. Drizzle assigns the filename; do not hand-pick the suffix.
- `src/collector/github-client.ts` — extend with `listPullRequestReviews` and `listPullRequestReviewComments` methods.
- `src/collector/bot-identity.ts` — pure helper.
- `src/collector/review-store.ts` — upserts review rows; sets per-PR pre-merge review-comment count cache on the review pass.
- `src/collector/review-sync.ts` — orchestrates per-repo review sync; updates `lastReviewSyncedAt`.
- `src/collector/refresh.ts` — extend to call review sync after PR sync (same invocation, gated per repo).
- `src/metrics/first-review-time.ts` — pure computations.
- `src/metrics/first-review-hygiene.ts` — pure hygiene rule.
- `src/metrics/first-review-bot-share.ts` — pure B, X%, K.
- `src/metrics/exception-sort.ts` — generic sort helper extracted from Phase 01's `sortExceptions`. Both phases share this. See Task 5.0.
- `src/metrics/first-review-exceptions.ts` — pure exception list builder; uses the shared sort helper (does **not** copy-paste the Phase 01 body).
- `src/metrics/first-review-team-breakdown.ts` — per-team aggregations.
- `src/metrics/pr-cycle-time-dashboard.ts` — extend with `firstReview`, `reviewFreshness`, `reviewMetricsPending` payload assembly. Phase 01 fields untouched.
- `src/server/dashboard-functions.ts` — no signature change; extended `getDashboardData` returns the extended payload.
- `src/components/dashboard/FirstReviewSection.tsx` — section wrapper, hidden when payload lacks `firstReview`.
- `src/components/dashboard/FirstReviewCard.tsx` — card with subtitle / coverage / side-stat states.
- `src/components/dashboard/FirstReviewExceptionsPanel.tsx`.
- `src/components/dashboard/FirstReviewTrendChart.tsx`.
- `src/components/dashboard/FirstReviewTeamTable.tsx`.
- `src/components/dashboard/FreshnessStrip.tsx` — extend (or wrap) existing strip to render Phase 01 + Phase 02 items in one visual row without mutating Phase 01 freshness props.

### Data flow

1. User clicks Refresh.
2. Collector runs Phase 01 PR sync (unchanged).
3. For each repo whose PR sync succeeded **this invocation**, collector runs review sync: fetches reviews and review comments for merged PRs gated by `githubUpdatedAt > lastReviewSyncedAt` (or NULL); recomputes per-PR review rows from the full response; logs per-PR errors to `sync_errors` but continues; sets `lastReviewSyncedAt` to current time on full-repo success.
4. Server function `getDashboardData` reads the database and assembles the extended payload. If no repo has `lastReviewSyncedAt IS NOT NULL`, omit `firstReview` and include `reviewMetricsPending: { hint: "Review metrics will appear after the next refresh" }`. Otherwise compute `firstReview` from `pull_request_reviews` and include `reviewFreshness: { oldestReviewSyncAt, reviewSyncErrors }`.
5. UI renders Phase 01 viewport unchanged. Below it, `FirstReviewSection` reads `firstReview` from props; renders nothing if absent. `FreshnessStrip` reads `freshness`, `reviewFreshness?`, and `reviewMetricsPending?` and composes one visual row.

### Config

No new env vars in Phase 02 (review sync reuses `GITHUB_SYNC_CONCURRENCY`).

### Core types (reshape of existing `firstReview` in `src/metrics/pr-cycle-time-dashboard.ts`)

This section is the **single source of truth** for the payload type. Every field is annotated as **NEW**, **RENAMED FROM** (existing field being renamed/reshaped), or **REMOVED FROM EXISTING**. The implementing agent must reconcile the existing nested `firstReview` shape (see "Migration from existing partial Phase 02 implementation" above) to match exactly what is defined here.

```ts
export type FirstReviewMetric = {
  medianHours: number | null
  previousMedianHours: number | null
  qualifyingPrCount: number              // M — RENAMED FROM existing `reviewedPrCount`; semantics change to "qualifying human-reviewed PR count" (bot-only PRs excluded).
  mergedPrCountInSyncedRepos: number     // N — NEW. Count of merged PRs in range whose owning repo has lastReviewSyncedAt IS NOT NULL.
  trendPercent: number | null
  baselineStatus: 'available' | 'pending'
  botShare: {                            // NEW
    botReviewCount: number               // B
    humanReviewCount: number             // H
    firstReviewByBotCount: number        // K
  } | null  // null when B === 0 (side stat suppressed)
}

export type FirstReviewException = {
  type: 'review_latency_worsened' | 'merge_without_review' | 'review_baseline_pending'
  severity: 'warning' | 'info'
  team: string
  message: string
  trendPercent?: number | null
  count?: number
  prDetails?: Array<{ prNumber: number; title: string; repo: string }>  // Populated ONLY for `merge_without_review`. By design contains no author/avatar/reviewer fields (brief no-surveillance rule).
}

// NEW exported type — array of per-repo review-sync errors surfaced in `reviewFreshness.reviewSyncErrors`.
// Phase 01's existing `freshness.syncErrors: number` count is unchanged (out of scope for FEAT-002).
export type SyncError = {
  repoFullName: string
  source: 'github_prs' | 'github_reviews'
  message: string
  occurredAt: string  // ISO timestamp
}

export type FirstReviewTeamRow = {
  team: string
  medianHours: number | null         // — when no qualifying human-reviewed PRs
  trendPercent: number | null        // — when comparison unavailable
  noReviewMergeCount: number | null  // RESHAPED FROM existing `mergeWithoutReviewCount: number`. Now `null` means "no hygiene match" (renders as em dash); any value `≥ 1` is rendered as a number. The data layer never returns `0`.
  // REMOVED FROM EXISTING: `reviewedPrs`, `previousMedianHours`. The brief drops the "Reviewed PRs" column from the UI; `previousMedianHours` is no longer surfaced per-team (trend percent is sufficient and the existing UI cell did not display the previous value).
}

export type FirstReview = {
  metric: FirstReviewMetric
  exceptions: FirstReviewException[]
  weeklyTrend: WeeklyMedianPoint[]
  teamBreakdown: FirstReviewTeamRow[]
  // REMOVED FROM EXISTING: nested `freshness: { reviewMetadataSyncedAt, reviewSyncErrors }`. Replaced by top-level siblings `reviewFreshness` and `reviewMetricsPending` below (per brief §83).
}

export type ReviewFreshness = {                 // NEW top-level sibling of `firstReview` (NOT nested inside `firstReview`).
  oldestReviewSyncAt: string
  reviewSyncErrors: SyncError[]                 // Per brief §83: array of per-repo SyncError objects (defined above), NOT a count. Phase 01's existing `freshness.syncErrors: number` is unchanged; this new array is additive on the new `reviewFreshness` field only.
}

export type ReviewMetricsPending = {            // NEW top-level sibling of `firstReview`. Present only when Phase 02 is hidden.
  hint: string
}

// Existing PrCycleTimeDashboard is extended (additively):
//   firstReview?: FirstReview              (reshaped from existing nested type — see above)
//   reviewFreshness?: ReviewFreshness      (NEW top-level sibling)
//   reviewMetricsPending?: ReviewMetricsPending  (NEW top-level sibling)
// The existing nested `firstReview.freshness` is REMOVED. Phase 01 `freshness` is untouched.
```

### Core types — internal (not in payload)

These types are used by the metric modules in Phase 5 but never leak into the payload. They are listed here so Task signatures in Phase 5 are unambiguous. **`PrWithReviews` is the input to `buildPrAggregate` (Task 5.1) only; `PrAggregate` is the canonical shape consumed by all downstream metric/exception/team modules (Tasks 5.2–5.7).** Downstream signatures must never declare `PrWithReviews[]`.

```ts
// PR row joined with the per-PR review and review-comment rows, already filtered to pre-merge
// (submittedAt < mergedAt for reviews, createdAt < mergedAt for comments). Bot classification
// is preserved per review row (isBot) so callers can split human vs bot without re-classifying.
export type PrWithReviews = {
  pr: PullRequestRecord                   // existing Phase 01 type
  reviews: PullRequestReviewRow[]         // schema row shape from src/db/schema.ts (Task 2.1)
  reviewComments: PullRequestReviewCommentRow[]  // pre-merge filtered
}

// PR-level derived values used by hygiene and the median computation. Built once per refresh
// from the raw review/comment rows; passed downstream so each consumer does not re-walk
// the review array.
export type PrAggregate = {
  prId: string
  prNumber: number                               // PR-level detail surfaced into `FirstReviewException.prDetails` for `merge_without_review`
  title: string                                  // PR title, surfaced into `prDetails` (no author/avatar fields by design)
  repoId: string
  repoFullName: string                           // e.g. "org/repo", surfaced into `prDetails.repo`
  team: string
  openedAt: Date
  mergedAt: Date
  firstQualifyingHumanReviewAt: Date | null      // earliest qualifying human review submittedAt, null if none
  anyQualifyingReviewCount: number               // human + bot, qualifying-review definition
  qualifyingHumanReviewCount: number             // human-only subset of the above (used by Task 5.3)
  qualifyingBotReviewCount: number               // bot-only subset of the above (used by Task 5.3)
  firstQualifyingReviewIsBot: boolean            // true iff the earliest qualifying review (any kind) is bot-authored (used by Task 5.3 to compute K)
  preMergeCommentCount: number                   // count of review comments with createdAt < mergedAt
  mergeWithoutReviewMatchesHygieneRule: boolean  // isMergeWithoutReview (Task 4.4) === true AND (mergedAt - openedAt) < 7 minutes
}

// Per-team aggregate fed to the exceptions builder and the team-breakdown builder.
export type TeamFirstReviewAgg = {
  team: string
  currentQualifyingPrCount: number               // count of team PRs with firstQualifyingHumanReviewAt != null in current period
  previousQualifyingPrCount: number              // same count in previous period (drives baseline gate and the review_baseline_pending exception)
  medianHours: number | null                     // current-period median over qualifying human-reviewed PRs
  previousMedianHours: number | null             // previous-period median; drives trendPercent
  trendPercent: number | null                    // gated per brief: null when previousQualifyingPrCount < 3 OR previousMedian == null OR previousMedian === 0
  noReviewMergeCount: number | null              // null when no hygiene matches; ≥ 1 otherwise
}
```

### Schema additions

```ts
// src/db/schema.ts (additions only)
export const pullRequestReviews = pgTable('pull_request_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  pullRequestId: uuid('pull_request_id').notNull().references(() => pullRequests.id, { onDelete: 'cascade' }),
  githubReviewId: bigint('github_review_id', { mode: 'number' }).notNull(),
  state: text('state').notNull(), // APPROVED | CHANGES_REQUESTED | COMMENTED | PENDING | DISMISSED
  submittedAt: timestamp('submitted_at', { withTimezone: true }), // nullable (PENDING)
  authorLogin: text('author_login'),       // nullable (deleted user)
  authorType: text('author_type'),         // nullable (mannequin)
  isBot: boolean('is_bot').notNull(),      // classification at sync time, recomputed on each sync pass
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uniqueGithubReview: uniqueIndex('pull_request_reviews_unique_github_review').on(t.pullRequestId, t.githubReviewId),
  pullRequestIdx: index('pull_request_reviews_pr_id_idx').on(t.pullRequestId),
}))

export const pullRequestReviewComments = pgTable('pull_request_review_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  pullRequestId: uuid('pull_request_id').notNull().references(() => pullRequests.id, { onDelete: 'cascade' }),
  githubCommentId: bigint('github_comment_id', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
}, (t) => ({
  uniqueGithubComment: uniqueIndex('pull_request_review_comments_unique_github_comment').on(t.pullRequestId, t.githubCommentId),
  // Plain index on pullRequestId — needed for the per-PR pre-merge comment count query.
  // The unique composite index above is a (pullRequestId, githubCommentId) UNIQUE; Postgres
  // can use its leading column for prefix lookups, but a dedicated single-column index keeps
  // the count query plan stable and matches the access pattern (filter by prId only).
  pullRequestIdx: index('idx_pull_request_review_comments_pr_id').on(t.pullRequestId),
}))

// repositories: add lastReviewSyncedAt timestamptz null.
```

**`bigint` mode choice (`mode: 'number'`).** GitHub review IDs and review-comment IDs are 64-bit identifiers in principle, but their actual values today are well below 2^53 (Number.MAX_SAFE_INTEGER). Drizzle's `bigint({ mode: 'number' })` returns a JS `number` (faster equality, JSON-friendly) but silently loses precision above 2^53. Documented choice: use `mode: 'number'` now; revisit and migrate to `mode: 'bigint'` (BigInt at the boundary) if GitHub's ID space approaches 2^53. This trade-off is intentional and matches Phase 01's `bigint` usage.

---

## Tests

(See task breakdown for owners; this section is the consolidated list.)

- **Schema / migration** (integration): `migration_creates_pull_request_reviews_table`, `migration_adds_last_review_synced_at`, `migration_applies_on_fresh_db`, `migration_applies_on_phase01_db`, `pull_request_reviews_unique_per_github_review_id`, `migration_single_file_no_second_migration`.
- **GitHub client** (unit): `github_client_lists_pr_reviews`, `github_client_paginates_reviews`, `github_client_lists_pr_review_comments`, `github_client_review_rate_limit_error`.
- **Bot identity** (unit): `bot_identity_user_type_bot_is_bot`, `bot_login_endswith_bracket_bot_literal_suffix`, `bot_login_must_end_with_bracket_bot_not_just_contain_it` (input `foo[bot]bar` → false; documents that the rule is a literal `endsWith('[bot]')` suffix, not a substring match), `human_user_with_login_ending_in_bracket_bot_is_classified_as_bot` (input `alice[bot]` with `user.type === 'User'` → true; documents the accepted edge case where the `[bot]` suffix alone forces bot classification), `null_user_object_treated_as_human`, `null_user_type_treated_as_human`.
- **Review store** (integration): `review_store_upserts_reviews_idempotently`, `review_store_recomputes_on_dismissed_review`, `review_store_persists_pre_merge_comment_count`, `review_comment_count_excludes_post_merge`.
- **Review sync** (integration): `review_sync_skipped_when_pr_sync_failed_same_run`, `review_sync_runs_when_pr_sync_succeeded`, `per_repo_review_sync_error_isolated`, `per_pr_review_sync_error_does_not_block_other_prs`, `last_review_synced_at_on_success_only`, `last_review_synced_at_unchanged_on_failure`, `incremental_gating_on_github_updated_at`, `review_sync_runs_inside_shared_concurrency_pool` (asserts review sync calls go through the same `runWithConcurrency` helper used by Phase 01 PR sync — not a semaphore mock).
- **PR aggregation unit** (unit): `pr_aggregate_counts_pre_merge_comments_per_pr`, `pr_aggregate_counts_any_qualifying_reviews_per_pr`.
- **Metric unit** (unit): `human_only_median_excludes_bot_reviews`, `first_review_uses_earliest_qualifying_human_review`, `bot_first_then_human_uses_human_timestamp`, `human_first_then_bot_uses_human_timestamp`, `bot_only_pr_excluded_from_median_and_M`, `dismissed_and_pending_ignored`, `review_after_merge_ignored`, `review_metric_boundary_submitted_at_equals_merged_at_is_excluded`, `coverage_subtitle_m_of_n_population`, `coverage_subtitle_n_excludes_unsynced_repo_prs`, `coverage_subtitle_data_omitted_at_metric_level_when_N_zero`, `median_handles_single_qualifying_pr` (M = 1 → that PR's hours are the median), `self_review_by_pr_author_counts_as_qualifying` (author identity does not filter qualifying-review classification).
- **Bot-share unit** (unit): `bot_share_denominator_includes_bots`, `first_review_by_bot_count_K`, `K_excludes_prs_with_zero_qualifying_reviews`, `bot_share_returns_null_when_B_zero`.
- **Trend / baseline unit** (unit): `first_review_weekly_trend_renders_null_weeks`, `trend_gate_three_qualifying_human_prs`, `trend_percent_null_when_previous_median_zero`. (Note: `baseline_pending_team_with_only_bot_reviews_silent` relocated to **Exceptions unit** below, since it is an exception-builder assertion, not a trend-module assertion.)
- **Hygiene unit** (unit): `merge_without_review_hygiene_rule`, `bot_only_pr_not_auto_hygiene`, `hygiene_uses_any_qualifying_review_count_not_distinct_authors`, `hygiene_seven_minute_threshold_boundary`.
- **Exceptions unit** (unit): `review_latency_worsened_fires_at_25pct_threshold`, `review_latency_worsened_does_not_fire_below_25pct_threshold`, `review_latency_worsened_requires_previous_baseline`, `merge_without_review_without_qualifying_reviews`, `review_baseline_pending_emitted`, `baseline_pending_team_with_only_bot_reviews_silent` (relocated from trend module), `exceptions_sort_by_severity_then_magnitude_then_team_name`, `exceptions_capped_at_three_total_across_types`, `exception_sort_helper_orders_by_severity_then_abs_trend_then_team_name` (covers the shared helper extracted into `src/metrics/exception-sort.ts`; see Task 5.0 below).
- **Team breakdown unit** (unit): `first_review_team_column_em_dash_when_no_qualifying_pr`, `phase_02_team_table_includes_teams_with_only_bot_reviews_with_em_dash`, `phase_02_team_table_no_review_merges_renders_em_dash_not_zero_when_no_hygiene_match`.
- **Payload contract** (integration): `payload_omits_firstReview_key_before_first_sync`, `payload_includes_firstReview_after_first_sync`, `payload_includes_reviewFreshness_when_phase02_visible`, `payload_includes_reviewMetricsPending_when_phase02_hidden`, `payload_omits_reviewMetricsPending_when_phase02_visible` (negative case at the payload layer), `review_freshness_includes_per_repo_sync_errors` (asserts `reviewFreshness.reviewSyncErrors` is a `SyncError[]` containing per-repo error objects, not a count), `phase_01_freshness_type_shape_unchanged`, `phase_01_payload_fields_unchanged_regression`, `mixed_sync_state_excludes_unsynced_repo_prs_from_M_N_B_K_and_team_breakdown` (one repo synced, one un-synced; PRs from the un-synced repo do not contribute to M, N, B, K, or the Phase 02 team table).
- **Component** (component): `first_review_section_hidden_when_payload_lacks_firstReview`, `first_review_section_visible_when_payload_has_firstReview`, `card_subtitle_reads_first_human_review`, `card_subtitle_and_coverage_suppressed_when_N_zero`, `coverage_subtitle_renders_M_of_N`, `coverage_subtitle_omitted_when_N_zero`, `bot_share_side_stat_renders`, `bot_share_side_stat_absent_when_B_zero`, `first_review_card_body_renders_baseline_pending_text_when_status_pending`, `exceptions_panel_hidden_when_zero_qualifying_exceptions`, `review_exceptions_panel_renders_capped_three`, `no_review_merge_pr_detail_renders_title_and_repo_only_no_author` (negative compliance: PR-detail surface for a `merge_without_review` exception shows PR title and repo only; no author name, no avatar, no review-author info in the DOM), `trend_chart_renders_with_null_weeks_when_M_zero`, `phase_02_team_column`, `first_review_team_table_renders_empty_state_when_no_team_rows`, `two_team_tables_render_independently`, `phase_01_team_table_columns_unchanged_regression`, `freshness_pending_hint_visible_in_phase01_strip_when_hidden`, `freshness_pending_hint_absent_when_visible`, `freshness_shows_oldest_review_sync_across_synced_repos`, `within_section_layout_card_and_exceptions_side_by_side`, `within_section_layout_trend_and_team_table_stacked_below_first_row`, `phase02_dashboard_components_have_accessible_aria_labels_and_table_scope_headers` (accessibility: card has an `aria-label` / heading, both team tables use `<th scope="col">` for column headers, exceptions panel is reachable as a labelled region), `no_future_metric_cards`, `phase01_cycle_time_unchanged`.
- **E2E** (e2e): `e2e_no_first_review_before_sync_fixture`, `e2e_first_sync_reveals_phase_02_section`, `e2e_bot_only_pr_visible_in_hygiene_not_in_median`, `e2e_phase_01_unchanged_under_phase_02_load`, `e2e_merge_without_review_visible`.
- **Docs** (unit): `docs_phase_02_checklist_updated`, `docs_trackable_roadmap_links_feat_002`.

---

## Documentation update

- [ ] Phase 02 acceptance checklist, section: `Acceptance criteria checklist`, path: `Documentation/Roadmap/phases/phase-02-first-review-time.md`
- [ ] Trackable roadmap link, section: `Phase 02: First Review Time`, path: `Documentation/Roadmap/trackable-roadmap.md`
- [ ] README status, section: `Next Step`, path: `Documentation/README.md`
- [ ] FEAT-002 link added to the Phase 02 phase doc's `Implementation plan` line.

---

## Task breakdown

### Per-task execution rule

- Every task follows TDD: add or update the named tests before implementation.
- Every implementation task checkpoint includes the focused test command plus `npm run test -- --coverage` before commit.
- The full `npm run verify:phase01` must remain green after every task in Phases 2–9.
- Tasks that touch lint/typecheck/build/e2e configuration include those commands in the checkpoint.

### Phase 0 — Reconcile existing partial Phase 02 implementation
> **Releasable**: after this phase, the existing partial Phase 02 surface is reduced to a known starting state that matches the brief's contract. No new behavior is shipped here; this is a refactor pass that prepares the codebase for Phases 2–9.

#### Task 0.1 — Remove existing partial Phase 02 fields and inline UI
- [x] **File**: `src/metrics/pr-cycle-time-dashboard.ts`, `src/components/dashboard/PrCycleTimeDashboard.tsx`, `src/components/dashboard/PrCycleTimeDashboard.css`, `tests/components/pr-cycle-time-dashboard.test.tsx`
- **Depends on**: nothing (must run before Task 6.1 reshapes the payload type)
- **Description**:
  - **Payload type (in `src/metrics/pr-cycle-time-dashboard.ts`).** Delete the existing nested `firstReview?: { metric: { ..., reviewedPrCount, reviewedPrs, mergeWithoutReviewCount, ... }, ..., freshness: { reviewMetadataSyncedAt, reviewSyncErrors } }` block (current lines 51–73). Also delete the exported `FirstReviewException` type alias from this file (it will be re-introduced in Task 6.1 with the new shape). Leave the rest of `PrCycleTimeDashboard` untouched. The new shape is added by Task 6.1; this task only removes the old one so the codebase compiles in a clean intermediate state with `firstReview` temporarily absent. Any payload-assembly code that populates the old `firstReview` block is deleted in the same edit (this is the partial Phase 02 implementation; Phase 01 logic is untouched).
  - **Inline UI rendering (in `PrCycleTimeDashboard.tsx`).** Delete the inline First Review section block, including: the `firstReviewByTeam` map, the `noReviewMergeCell` helper (currently at `PrCycleTimeDashboard.tsx:226-229`), the `firstReviewTrendBlock` IIFE (currently at `PrCycleTimeDashboard.tsx:269-290`), the `firstReview` rendering block (currently around lines 474+), the `Reviewed PRs` `<th>` and the corresponding `<td>` in the team table, the import of `FirstReviewException` from `pr-cycle-time-dashboard.ts`, and any helpers that exist only to support the inline First Review section (`firstReviewTeamFor`, `firstReviewExceptionTitle`, `firstReviewExceptionMetric`, `firstReviewExceptionRecommendation`, `firstReviewExceptionTrendSnippet`, `firstReviewTrendCell`). Imports orphaned by these deletions are removed in the same commit (per CLAUDE.md surgical-changes rule).
  - **Footer freshness items (in `PrCycleTimeDashboard.tsx` lines 622-693).** Delete **only** the Phase-02-specific footer items that read from `firstReview.freshness.reviewMetadataSyncedAt` and `firstReview.freshness.reviewSyncErrors`. **Leave the Phase 01 freshness items in place** (they continue to render the existing `freshness` props). Task 7.6 re-introduces Phase 02 freshness items via the new top-level `reviewFreshness` / `reviewMetricsPending` payload shape after the `FreshnessStrip.tsx` extraction.
  - **CSS.** Remove any selectors that were used only by the deleted inline First Review section. Selectors shared with Phase 01 are left intact.
  - **Tests.** Update `tests/components/pr-cycle-time-dashboard.test.tsx` to drop assertions on the deleted inline section (they will be replaced by the dedicated component tests in Phase 7). Phase 01 assertions in this file are unchanged.
- **Releasable**: after this task, the codebase compiles, `npm run verify:phase01` continues to pass, and the dashboard renders the Phase 01 surface only (no First Review section). This is the explicit starting state for Phases 2–9.
- **Tests (TDD)** — `tests/components/pr-cycle-time-dashboard.test.tsx` updates **and** a new type-shape test file:
  - Component: `dashboard_renders_only_phase_01_surface_after_phase_02_removal` — with no `firstReview` in the payload (which is now the only valid state), the rendered DOM contains the Phase 01 viewport and no First Review section nodes. The test also asserts that the **Phase 01 footer freshness items still render** after Task 0.1 (regression guard against accidental deletion of the Phase 01 footer items).
  - Component: `phase_01_team_table_has_no_reviewed_prs_column_after_removal` — the team table header set is exactly the Phase 01 locked list (no `Reviewed PRs` column).
  - Type-level: `phase01_dashboard_type_has_no_firstReview_block_after_removal` — asserts at the TypeScript type level that `PrCycleTimeDashboard` no longer has a `firstReview` property and that `FirstReviewException` is no longer exported from `pr-cycle-time-dashboard.ts`. Lives in `tests/types/phase-01-dashboard-type-shape.test-d.ts` and uses `@ts-expect-error` on accessing the removed keys (e.g. `// @ts-expect-error firstReview removed` before a sample access of `payload.firstReview`) plus an `Expect<Equal<...>>` style assertion (via `expect-type` or an inline helper) that the exported type set from the module does not include `FirstReviewException`. Run via `tsc --noEmit` on the `.test-d.ts` file.
  - Checkpoint: `npm run verify:phase01`

### Phase 1 — Plan-doc bootstrap
> **Releasable**: after this phase, FEAT-002 exists as a tracked plan with documentation links.

#### Task 1.1 — Add FEAT-002 docs links
- [x] **File**: `Documentation/Roadmap/phases/phase-02-first-review-time.md`, `Documentation/Roadmap/trackable-roadmap.md`, `Documentation/README.md`
- **Depends on**: nothing
- **Description**:
  - Phase 02 phase doc: replace the "Implementation plan: FEAT-002 (to be authored before coding starts)" line with a direct link to `FEAT-002-first-review-time-implementation-plan.md`.
  - Trackable roadmap: add FEAT-002 link under the Phase 02 section.
  - README: update Next Step to point at FEAT-002.
- **Releasable**: after this task, the roadmap and README reference this plan.
- **Tests (TDD)** — `tests/docs/feat-002-links.test.ts`:
  - Unit: `docs_phase_02_links_feat_002` — phase doc contains the FEAT-002 link.
  - Unit: `docs_trackable_roadmap_links_feat_002` — roadmap contains the FEAT-002 link.
  - Unit: `docs_readme_next_step_points_at_feat_002` — README Next Step mentions FEAT-002.
  - Checkpoint: `npm run test -- tests/docs/feat-002-links.test.ts`

### Phase 2 — Schema and migration
> **Releasable**: after this phase, the database schema supports Phase 02 storage; Phase 01 schema is unchanged in semantics.

#### Task 2.1 — Extend Drizzle schema
- [x] **File**: `src/db/schema.ts`
- **Depends on**: Task 1.1
- **Description**:
  - Add `pullRequestReviews` table per the schema additions above (UUID PK, FK to `pull_requests.id` with cascade delete, unique `(pull_request_id, github_review_id)`).
  - Add `pullRequestReviewComments` table per the schema additions above.
  - Add `lastReviewSyncedAt` nullable `timestamptz` column to `repositories`.
  - Do **not** add denormalized review columns to `pull_requests`.
- **Releasable**: after this task, Drizzle compiles with new types.
- **Tests (TDD)** — `tests/db/schema-phase-02.test.ts`:
  - Unit: `schema_defines_pull_request_reviews_table` — table object exists with expected columns.
  - Unit: `schema_defines_pull_request_review_comments_table` — table object exists.
  - Unit: `schema_repositories_has_last_review_synced_at` — column exists, nullable, timestamptz.
  - Unit: `schema_pull_requests_unchanged_phase01_columns` — exact Phase 01 column set on `pullRequests`.
  - Checkpoint: `npm run test -- tests/db/schema-phase-02.test.ts`

#### Task 2.2 — Generate and apply migration
- [x] **File**: the next sequential migration file produced by `drizzle-kit generate`, expected to be `drizzle/0002_*.sql` (Drizzle picks the filename suffix; do **not** hand-rename it). _Implementation note: actual generated file is `drizzle/0001_rapid_starjammers.sql` (Phase 01 shipped only `0000_initial.sql`, so the next index is `0001`)._
- **Depends on**: Task 2.1
- **Description**:
  - Run `npm run db:generate` to produce the next migration file (Drizzle assigns the `0002_<auto-suffix>.sql` name). Phase 02 ships exactly **one** migration file; per the brief, no second migration is permitted in this phase.
  - Verify the generated SQL creates both tables, adds `last_review_synced_at`, and includes the unique indices plus the new plain `idx_pull_request_review_comments_pr_id` index on `pull_request_review_comments.pull_request_id`.
  - Do not drop or alter Phase 01 columns.
- **Releasable**: after this task, a fresh DB and a Phase 01 DB both accept the migration.
- **Tests (TDD)** — `tests/db/migrations-phase-02.test.ts` (integration; uses disposable Postgres):
  - Integration: `migration_creates_pull_request_reviews_table` — table exists post-migration with expected columns.
  - Integration: `migration_creates_pull_request_review_comments_table` — table exists.
  - Integration: `migration_adds_last_review_synced_at` — column exists.
  - Integration: `migration_applies_on_fresh_db` — clean DB → all migrations succeed.
  - Integration: `migration_applies_on_phase01_db` — DB seeded with Phase 01 schema → 0002 applies without error.
  - Integration: `migration_applies_idempotently_on_phase_01_db` — running the migration twice on a Phase 01 DB (e.g., re-applying after a partial-failure rollback simulation) leaves the DB in the same final state as a single application.
  - Integration: `migration_single_file_no_second_migration` — exactly one `0002_*.sql` file exists in `drizzle/` after `db:generate`; no `0003_*.sql` is produced by Phase 02 work.
  - Integration: `migration_creates_idx_pull_request_review_comments_pr_id` — the new single-column index on `pull_request_review_comments.pull_request_id` exists post-migration (queryable via `pg_indexes`).
  - Integration: `pull_request_reviews_unique_per_github_review_id` — duplicate insert raises unique violation.
  - Checkpoint: `npm run test -- tests/db/migrations-phase-02.test.ts`

### Phase 3 — Data acquisition primitives
> **Releasable**: after each task in this phase, the corresponding helper is callable in isolation.

#### Task 3.1 — GitHub client: list PR reviews
- [x] **File**: `src/collector/github-client.ts`
- **Depends on**: Task 2.2
- **Description**:
  - Add method `GitHubClient.listPullRequestReviews(input: { owner: string; repo: string; pullNumber: number }): Promise<GitHubReview[]>`.
  - Type `GitHubReview`: `{ id: number; state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'PENDING' | 'DISMISSED'; submittedAt: Date | null; user: { login: string; type: 'User' | 'Bot' | null } | null }`.
  - Paginate via the `Link: rel="next"` header; default `per_page=100`.
  - Map rate-limit (403/429) responses to a structured `GitHubRateLimitError` (same shape Phase 01 uses).
  - Do not retry rate-limit failures inside the client — caller decides.
- **Releasable**: after this task, the client can fetch reviews for a single PR.
- **Tests (TDD)** — `tests/collector/github-client-reviews.test.ts`:
  - Unit: `github_client_lists_pr_reviews` — mocked single-page response is mapped to `GitHubReview[]`.
  - Unit: `github_client_paginates_reviews` — two pages via `Link` header are concatenated.
  - Unit: `github_client_review_rate_limit_error` — 403 with `x-ratelimit-remaining: 0` raises `GitHubRateLimitError`.
  - Unit: `github_client_review_user_null_preserved` — review with `user: null` keeps `user: null` in mapped output.
  - Checkpoint: `npm run test -- tests/collector/github-client-reviews.test.ts`

#### Task 3.2 — GitHub client: list PR review comments
- [x] **File**: `src/collector/github-client.ts`
- **Depends on**: Task 3.1
- **Description**:
  - Add method `GitHubClient.listPullRequestReviewComments(input: { owner: string; repo: string; pullNumber: number }): Promise<GitHubReviewComment[]>`.
  - Type `GitHubReviewComment`: `{ id: number; createdAt: Date }`.
  - Paginate identically to Task 3.1.
- **Releasable**: after this task, the client can fetch review comments for a single PR.
- **Tests (TDD)** — `tests/collector/github-client-review-comments.test.ts`:
  - Unit: `github_client_lists_pr_review_comments` — single-page mapping.
  - Unit: `github_client_paginates_review_comments` — multi-page concatenation.
  - Checkpoint: `npm run test -- tests/collector/github-client-review-comments.test.ts`

#### Task 3.3 — Bot identity helper
- [x] **File**: `src/collector/bot-identity.ts`
- **Depends on**: nothing (pure helper; can be parallel to 3.1/3.2 but ordered for review predictability)
- **Description**:
  - Export `isBotReviewer(user: { login?: string | null; type?: 'User' | 'Bot' | null } | null | undefined): boolean`.
  - Return `true` when `user?.type === 'Bot'` OR `user?.login?.endsWith('[bot]') === true`.
  - Return `false` otherwise (including `user == null` and `user.type` null/unknown with no `[bot]` suffix).
  - Must not throw on null inputs.
- **Releasable**: after this task, the bot-identity rule is available to sync and metric layers.
- **Tests (TDD)** — `tests/collector/bot-identity.test.ts`:
  - Unit: `bot_identity_user_type_bot_is_bot` — `{ type: 'Bot' }` → true.
  - Unit: `bot_login_endswith_bracket_bot_literal_suffix` — `dependabot[bot]` → true.
  - Unit: `bot_login_must_end_with_bracket_bot_not_just_contain_it` — input `foo[bot]bar` (with `user.type === 'User'`) → false. Documents that the rule is a literal `endsWith('[bot]')` suffix; a `[bot]` substring in the middle of the login does not match.
  - Unit: `human_user_with_login_ending_in_bracket_bot_is_classified_as_bot` — input `{ login: 'alice[bot]', type: 'User' }` → true. Documents the accepted edge case where `user.type` is `User` but the login ends in `[bot]` — the suffix wins, per the brief's OR semantics. Rare and intentional.
  - Unit: `null_user_object_treated_as_human` — `null` input → false.
  - Unit: `null_user_type_treated_as_human` — `{ login: 'alice', type: null }` → false.
  - Unit: `user_type_user_is_not_bot` — `{ type: 'User', login: 'alice' }` → false.
  - Checkpoint: `npm run test -- tests/collector/bot-identity.test.ts`

### Phase 4 — Review sync orchestration
> **Releasable**: after this phase, Refresh persists per-review rows for merged PRs and sets `lastReviewSyncedAt`.

#### Task 4.1 — Review store
- [x] **File**: `src/collector/review-store.ts`
- **Depends on**: Task 3.3
- **Description**:
  - Export `upsertReviewsForPr(db: AppDb, input: { pullRequestId: string; mergedAt: Date; reviews: GitHubReview[]; comments: GitHubReviewComment[] }): Promise<{ reviewsWritten: number; preMergeCommentCount: number }>`.
  - **Recompute from full response**: delete existing rows for `pullRequestId` then insert fresh rows in one transaction. (No incremental delta — handles dismissed reviews.)
  - For each review, classify via `isBotReviewer` and persist `isBot`.
  - For comments, persist only those with `createdAt < mergedAt`; return the count.
  - Idempotent: repeated calls with identical input produce identical end state.
- **Releasable**: after this task, raw review data for a PR can be persisted.
- **Tests (TDD)** — `tests/collector/review-store.test.ts` (integration; disposable Postgres):
  - Integration: `review_store_upserts_reviews_idempotently` — second call with same input doesn't duplicate.
  - Integration: `review_store_recomputes_on_dismissed_review` — dismissing a review in second call removes it from store.
  - Integration: `review_store_persists_pre_merge_comment_count` — pre-merge comments counted, post-merge excluded.
  - Integration: `review_comment_count_excludes_post_merge` — explicit boundary test.
  - Integration: `review_store_classifies_bot_at_write_time` — bot reviews flagged in `is_bot` column.
  - Checkpoint: `npm run test -- tests/collector/review-store.test.ts`

#### Task 4.2 — Review sync orchestrator
- [x] **File**: `src/collector/review-sync.ts`
- **Depends on**: Task 4.1, Task 3.1, Task 3.2
- **Description**:
  - Export `syncRepositoryReviews(db: AppDb, deps: { client: GitHubClient; now: Date }, repo: RepositoryRow): Promise<{ status: 'success' | 'partial' | 'skipped'; perPrErrors: SyncError[] }>`.
  - **Note on concurrency.** Per-repo concurrency is controlled by the **caller** in Task 4.3 via the existing `runWithConcurrency` helper in `src/collector/refresh.ts`. This function does **not** accept a semaphore object and does **not** limit its own per-PR fan-out beyond a sensible serial loop. There is no global semaphore object in the codebase (the original plan was wrong about this; see "Migration from existing partial Phase 02 implementation" above).
  - List merged PRs for the repo where `githubUpdatedAt > repo.lastReviewSyncedAt` OR `repo.lastReviewSyncedAt IS NULL` (full backfill in the latter case).
  - For each PR, call `listPullRequestReviews` and `listPullRequestReviewComments`, then `upsertReviewsForPr`.
  - Per-PR errors: log to `sync_errors` with `source: 'github_reviews'` and continue to the next PR; do not abort the repo pass.
  - Rate-limit error: stop starting new fetches in this repo, mark the repo's status as `partial`, leave `lastReviewSyncedAt` unchanged.
  - On full-repo success (every PR fetched without error), set `lastReviewSyncedAt = now`.
- **Releasable**: after this task, a single repo's reviews can be synced.
- **Tests (TDD)** — `tests/collector/review-sync.test.ts` (integration):
  - Integration: `review_sync_runs_when_pr_sync_succeeded` — repo with PRs gets review rows.
  - Integration: `per_repo_review_sync_error_isolated` — error in repo A doesn't affect repo B (covered fully in 4.3, but a single-repo error variant lives here).
  - Integration: `per_pr_review_sync_error_does_not_block_other_prs` — one failing PR logs error, others persist.
  - Integration: `last_review_synced_at_on_success_only` — full-repo success sets timestamp.
  - Integration: `last_review_synced_at_unchanged_on_failure` — any per-PR failure leaves timestamp.
  - Integration: `incremental_gating_on_github_updated_at` — only PRs with newer `githubUpdatedAt` are re-fetched.
  - Integration: `review_sync_rate_limit_stops_starting_new_fetches` — rate-limit error halts further starts; timestamp unchanged.
  - Checkpoint: `npm run test -- tests/collector/review-sync.test.ts`

#### Task 4.3 — Refresh integration
- [x] **File**: `src/collector/refresh.ts`
- **Depends on**: Task 4.2
- **Description**:
  - **Concurrency model (chosen: option (a) — second pass).** After Phase 01's PR-sync `runWithConcurrency` block (currently at line 175 of `src/collector/refresh.ts`) completes for **all** repos in the same invocation, run a **second** `runWithConcurrency(syncTargets, env.githubSyncConcurrency, ...)` pass that invokes `syncRepositoryReviews` for the subset of repos whose Phase 01 PR sync succeeded **in this invocation**.
  - **Eligibility rule (aligned with brief §75).** A repo is eligible for review sync iff its this-invocation PR sync result was **success**. Repos whose PR sync was `partial` or `failed` are skipped this run; the next refresh retries both phases. This is stricter than the previous draft ("success OR partial with at least one PR persisted") — the brief is authoritative.
  - **Why option (a) over inlining inside the existing per-repo callback.** Two-pass is safer because review sync's eligibility depends on the **final** PR-sync result for the repo, not the intermediate state inside the callback. It also keeps Phase 01 behavior byte-identical: the existing `runWithConcurrency` call site is unmodified; the review pass is purely additive.
  - **No new helper.** Do **not** introduce a Semaphore class, a global semaphore object, or any new concurrency primitive. Reuse `runWithConcurrency` as-is (it is already a worker-pool with the `GITHUB_SYNC_CONCURRENCY` limit).
  - Aggregate per-repo review sync errors into `RefreshSummary` (extend if needed without changing Phase 01 fields semantically — add `reviewSyncErrors: number` as an additive optional field, defaulted to `0`). **`RefreshSummary.reviewSyncErrors: number` is the per-invocation collector counter used for logging/observability only; it is NOT the source for the payload's `reviewFreshness.reviewSyncErrors: SyncError[]`, which is independently assembled in Task 6.2 by querying `sync_errors` rows. The two fields serve different purposes and are not derived from each other.**
  - Do not change orchestration behavior for repos that fail PR sync.
- **Releasable**: after this task, Refresh end-to-end persists review data for ready repos.
- **Tests (TDD)** — `tests/collector/refresh-phase-02.test.ts` (integration):
  - Integration: `review_sync_skipped_when_pr_sync_failed_same_run` — repo with failed (non-success) PR sync gets no review fetch attempts. Covers the `partial` and `failed` cases (both skipped per the stricter rule).
  - Integration: `review_sync_runs_inside_shared_concurrency_pool` — spy on `runWithConcurrency` confirms the review pass invokes the **same** helper used by Phase 01 PR sync (no semaphore mock; assert helper identity by spying on the module export).
  - Integration: `refresh_summary_includes_review_sync_errors` — `RefreshSummary.reviewSyncErrors` reflects logged errors.
  - Integration: `refresh_phase_01_summary_fields_unchanged` — Phase 01 fields on `RefreshSummary` keep identical values vs. baseline.
  - Checkpoint: `npm run test -- tests/collector/refresh-phase-02.test.ts`

#### Task 4.4 — Hygiene predicate primitive
- [x] **File**: `src/metrics/first-review-hygiene-predicate.ts` (new)
- **Depends on**: nothing (pure function over its inputs)
- **Description**:
  - Export a single pure predicate: `isMergeWithoutReview(pr: { authorBotFlag: boolean; anyQualifyingReviewCount: number; preMergeCommentCount: number }): boolean`.
  - Returns `true` iff `authorBotFlag === false` AND `anyQualifyingReviewCount === 0` AND `preMergeCommentCount === 0`. The 7-minute merge-window predicate stays in Task 5.5 (`first-review-hygiene.ts`) because it depends on date math; this primitive is the **review-and-comment** half of the hygiene rule, the part both Task 5.1 (`buildPrAggregate`) and Task 5.5 (`countMergeWithoutReviewByTeam`) need before either is implemented.
  - No imports beyond TypeScript types. No date math. No DB.
- **Releasable**: predicate callable in isolation; resolves the previous dependency cycle between Task 5.1 and Task 5.5 (see MO-2).
- **Tests (TDD)** — `tests/metrics/first-review-hygiene-predicate.test.ts`:
  - Unit: `predicate_returns_true_when_no_qualifying_reviews_and_no_pre_merge_comments` — positive case.
  - Unit: `predicate_returns_false_when_any_qualifying_review_exists` — review present → false.
  - Unit: `predicate_returns_false_when_pre_merge_comment_exists` — comment present → false.
  - Unit: `predicate_returns_false_when_author_is_bot` — bot-author PRs are excluded by the predicate.
  - Checkpoint: `npm run test -- tests/metrics/first-review-hygiene-predicate.test.ts`

### Phase 5 — Metrics computations
> **Releasable**: after this phase, all First Review computations are callable as pure functions over PR + review fixtures.

#### Task 5.0 — Extract shared exception sort helper
- [x] **File**: `src/metrics/exception-sort.ts` (new), `src/metrics/pr-cycle-time-dashboard.ts` (refactor existing `sortExceptions`)
- **Depends on**: Task 0.1 (Task 5.0 also edits `src/metrics/pr-cycle-time-dashboard.ts`; Task 0.1's deletions must land first so the two edits do not overlap or create a broken intermediate state)
- **Description**:
  - Create `src/metrics/exception-sort.ts` exporting a generic helper:
    ```ts
    export function sortExceptionsBySeverityThenMagnitude<E extends { severity: 'warning' | 'info'; team: string }>(
      exceptions: E[],
      lookupAbsTrendPercent: (e: E) => number | null,
    ): void
    ```
    Sort order: severity descending (warning > info), then `lookupAbsTrendPercent(e)` descending with `null` **placed last** (the helper's contract is: a `null` return from the lookup callback sorts after every numeric value within the same severity bucket, including `0`), then team name ascending. This matches the exact behavior of the existing Phase 01 `sortExceptions` in `pr-cycle-time-dashboard.ts` (lines 125–145).
  - **Contract on the lookup callback.** Callers must return `null` (not `0`) when the underlying value is absent. A common mistake is `Math.abs(trendPercent ?? null)` which evaluates to `0` (because `null ?? null` is `null` and `Math.abs(null)` is `0`); the correct form is `trendPercent == null ? null : Math.abs(trendPercent)`.
  - **Stability assumption.** The helper assumes a stable sort, guaranteed by ECMAScript 2019 for the V8/JSC engines used by Node ≥ 12 and modern browsers. The project targets Node ≥ 20 and modern browsers; this assumption holds. If a future target environment lacks stable sort, swap the implementation for a stable-sort helper without changing the contract.
  - Refactor the existing Phase 01 `sortExceptions` (in `pr-cycle-time-dashboard.ts`) to **call** this helper. **Phase 01 BEHAVIOR is unchanged** — only the implementation is hoisted into the shared module. The exported `sortExceptions` symbol stays where it is so any internal call sites in Phase 01 continue to resolve.
  - Phase 02's exception builder (Task 5.6) uses the same helper with `FirstReviewException` and `FirstReviewTeamRow`. **No copy-paste.**
- **Releasable**: a single sort helper backs both phases; Phase 01 regression suite is green.
- **Tests (TDD)** — `tests/metrics/exception-sort.test.ts`:
  - Unit: `exception_sort_helper_orders_by_severity_then_abs_trend_then_team_name` — full ordering across mixed severities, mixed trend magnitudes, and ties on team name.
  - Unit: `exception_sort_helper_null_trend_sorts_last_within_severity` — `null` from the lookup goes after numeric values within the same severity bucket.
  - Unit: `sort_helper_places_null_magnitude_after_zero_magnitude` — explicit assertion that a row with lookup → `null` sorts AFTER a row with lookup → `0` within the same severity (guards against the `Math.abs(null) === 0` footgun).
  - Unit: `exception_sort_helper_stable_within_ties` — equal severity + equal magnitude + equal team name → stable order.
  - Integration: `phase_01_sortExceptions_orders_fixed_fixture_inputs_in_exact_expected_order` — table-driven assertion with 3–5 fixed input/expected-output pairs covering mixed severities, null/zero/positive magnitudes, and team-name tie-breaks. Replaces the earlier snapshot-based regression test for greater robustness against accidental snapshot regeneration.
  - Checkpoint: `npm run test -- tests/metrics/exception-sort.test.ts && npm run verify:phase01`

#### Task 5.1 — First Review per-PR computation and PR aggregate derivation
- [x] **File**: `src/metrics/first-review-time.ts`
- **Depends on**: Task 4.1 (uses review row shape), Task 4.4 (uses the `isMergeWithoutReview` predicate to populate `mergeWithoutReviewMatchesHygieneRule` on `PrAggregate`). The predicate lives in a separate module (`src/metrics/first-review-hygiene-predicate.ts`); Task 5.1 imports it and combines it with the 7-minute window check to populate the aggregate flag. This split keeps Tasks 5.1 and 5.5 non-circular — both depend on Task 4.4, not on each other.
- **Description**:
  - Export `getFirstHumanReviewSubmittedAt(reviews: ReviewRow[], mergedAt: Date): Date | null`.
  - Filter reviews to qualifying-human set (`state ∈ {APPROVED, CHANGES_REQUESTED, COMMENTED}`, `submittedAt != null`, `submittedAt < mergedAt`, `isBot === false`).
  - Return earliest `submittedAt`, or `null` if none qualify.
  - Export `getFirstReviewHours(pr: { openedAt: Date }, firstHumanReviewSubmittedAt: Date): number` returning hours difference.
  - **PrAggregate derivation.** Export `buildPrAggregate(input: PrWithReviews): PrAggregate`. This consumes the raw `reviews` and `reviewComments` arrays on the input (already loaded by the payload layer in Task 6.2 via a join on `pullRequestId`) and computes:
    - `firstQualifyingHumanReviewAt` — via `getFirstHumanReviewSubmittedAt`.
    - `anyQualifyingReviewCount` — count of reviews in the qualifying set (state in `{APPROVED, CHANGES_REQUESTED, COMMENTED}`, `submittedAt != null`, `submittedAt < mergedAt`) **regardless** of `isBot`. Human + bot summed.
    - `preMergeCommentCount` — count of `reviewComments` with `createdAt < mergedAt`. The payload layer's join is filtered by `createdAt < mergedAt` in SQL where possible (using the new `idx_pull_request_review_comments_pr_id` index from the schema task) but the aggregate also asserts the boundary in-memory for safety.
    - `mergeWithoutReviewMatchesHygieneRule` — pre-computed Boolean via the hygiene rule predicate (kept as a flag on `PrAggregate` so downstream consumers don't re-derive it).
  - This aggregate is the **single** per-PR input shape consumed by Tasks 5.2 (median), 5.3 (bot share), 5.4 (trend), 5.5 (hygiene), 5.6 (exceptions), 5.7 (team breakdown). Every downstream task takes `PrAggregate[]` (plus auxiliary args like `range`, `reviewSyncedRepoIds`); `PrWithReviews` is **internal** to `buildPrAggregate` and never appears in downstream signatures.
- **Releasable**: per-PR first review timing is computable from stored data.
- **Tests (TDD)** — `tests/metrics/first-review-time.test.ts`:
  - Unit: `first_review_uses_earliest_qualifying_human_review` — earliest matching review wins.
  - Unit: `human_only_median_excludes_bot_reviews` (covered via the next computation but verifies the bot exclusion at the timestamp level).
  - Unit: `bot_first_then_human_uses_human_timestamp` — bot review before human → human timestamp returned.
  - Unit: `human_first_then_bot_uses_human_timestamp` — sanity.
  - Unit: `dismissed_and_pending_ignored` — non-qualifying states ignored.
  - Unit: `review_after_merge_ignored` — `submittedAt >= mergedAt` excluded.
  - Unit: `returns_null_when_only_bot_reviews` — bot-only PR → null.
  - Unit: `returns_null_when_no_reviews` — empty array → null.
  - Unit: `review_metric_boundary_submitted_at_equals_merged_at_is_excluded` — review with `submittedAt === mergedAt` is excluded (strict `<` comparison).
  - Unit: `self_review_by_pr_author_counts_as_qualifying` — a review whose author equals the PR author still qualifies; author identity does not filter the qualifying-review classification (per brief edge case).
  - Unit: `pr_aggregate_counts_any_qualifying_reviews_per_pr` — `buildPrAggregate` sums human + bot qualifying reviews into `anyQualifyingReviewCount` over a fixture with mixed authors and states.
  - Unit: `pr_aggregate_counts_pre_merge_comments_per_pr` — `buildPrAggregate` returns the count of `reviewComments` with `createdAt < mergedAt`; post-merge comments are excluded.
  - Checkpoint: `npm run test -- tests/metrics/first-review-time.test.ts`

#### Task 5.2 — Median, M, N, qualifying population
- [x] **File**: `src/metrics/first-review-time.ts`
- **Depends on**: Task 5.1
- **Description**:
  - Export `computeFirstReviewMedian(input: { prs: PrAggregate[]; range: DateRange; reviewSyncedRepoIds: Set<string> }): { medianHours: number | null; M: number; N: number }`. Input is already-aggregated; no raw review rows are needed here.
  - M: count of PRs with `firstQualifyingHumanReviewAt != null`.
  - N: count of PRs in range whose repo is in `reviewSyncedRepoIds`.
  - Median: median of `(firstQualifyingHumanReviewAt - openedAt)` in hours across qualifying PRs; `null` when M = 0.
- **Releasable**: median and coverage are computable.
- **Tests (TDD)** — `tests/metrics/first-review-median.test.ts`:
  - Unit: `median_humans_only` — bot review presence doesn't change median.
  - Unit: `coverage_subtitle_m_of_n_population` — M and N computed correctly across fixture.
  - Unit: `coverage_subtitle_n_excludes_unsynced_repo_prs` — PR from un-synced repo excluded from N.
  - Unit: `bot_only_pr_excluded_from_median_and_M` — bot-only PR contributes to N only.
  - Unit: `median_null_when_M_zero` — all PRs bot-only → median null.
  - Unit: `median_handles_even_and_odd_counts` — both shapes correct.
  - Unit: `median_handles_single_qualifying_pr` — M = 1: median equals that PR's hours (edge case).
  - Unit: `coverage_subtitle_data_omitted_at_metric_level_when_N_zero` — when N = 0, the metric module returns shape signalling subtitle/coverage should be omitted (e.g., `qualifyingPrCount === 0 && mergedPrCountInSyncedRepos === 0`); this is enforced at the metric layer, not just at the component layer.
  - Checkpoint: `npm run test -- tests/metrics/first-review-median.test.ts`

#### Task 5.3 — Bot share (B, H, X%, K)
- [x] **File**: `src/metrics/first-review-bot-share.ts`
- **Depends on**: Task 5.2
- **Description**:
  - Export `computeBotShare(input: { prs: PrAggregate[]; reviewSyncedRepoIds: Set<string> }): { botReviewCount: number; humanReviewCount: number; firstReviewByBotCount: number } | null`. Note: bot-vs-human review counts (B, H) and the K denominator are pre-computed into `PrAggregate` by Task 5.1 (specifically `anyQualifyingReviewCount` plus a new field — see below). The Task 5.1 aggregate must also expose per-PR `qualifyingHumanReviewCount` and `qualifyingBotReviewCount` plus a boolean `firstQualifyingReviewIsBot` so this module needs no raw review rows. **Add these three fields to `PrAggregate` in the Core Types — internal block.**
  - B: count of qualifying bot reviews across PRs in N.
  - H: count of qualifying human reviews across PRs in N.
  - K: count of PRs in N that have ≥1 qualifying review where the earliest such review (any kind) is bot-authored.
  - Returns `null` when B = 0 (signal: omit side stat).
- **Releasable**: bot-share values computable.
- **Tests (TDD)** — `tests/metrics/first-review-bot-share.test.ts`:
  - Unit: `bot_share_denominator_includes_bots` — X% denominator is B + H.
  - Unit: `first_review_by_bot_count_K` — K counts PRs where earliest qualifying review is bot.
  - Unit: `K_excludes_prs_with_zero_qualifying_reviews` — zero-review PRs not in K.
  - Unit: `bot_share_returns_null_when_B_zero` — B=0 → null.
  - Unit: `bot_share_uses_N_population_only` — bot reviews on unsynced-repo PRs excluded.
  - Checkpoint: `npm run test -- tests/metrics/first-review-bot-share.test.ts`

#### Task 5.4 — Weekly trend and previous-period comparison
- [x] **File**: `src/metrics/first-review-time.ts`
- **Depends on**: Task 5.2
- **Description**:
  - Export `getFirstReviewWeeklyTrend(prs: PrAggregate[], range: DateRange): WeeklyMedianPoint[]` — 8 buckets, null for empty weeks. Operates over `PrAggregate.firstQualifyingHumanReviewAt` and `openedAt`.
  - Export `compareFirstReviewPeriods(input: { currentMedian: number | null; previousMedian: number | null; previousQualifyingPrCount: number }): { trendPercent: number | null; baselineStatus: 'available' | 'pending' }` — same gating shape as Phase 01.
  - Gate: trend `null` when `previousQualifyingPrCount < 3` OR `previousMedian == null` OR `previousMedian === 0`.
- **Releasable**: trend chart inputs computable.
- **Tests (TDD)** — `tests/metrics/first-review-trend.test.ts`:
  - Unit: `first_review_weekly_trend_renders_null_weeks` — 8 buckets, empty weeks null.
  - Unit: `trend_gate_three_qualifying_human_prs` — exactly 3 in previous → trend present.
  - Unit: `trend_gate_two_qualifying_human_prs` — 2 in previous → baseline_pending.
  - Unit: `trend_percent_null_when_previous_median_zero` — zero baseline → trend null.
  - (Note: `baseline_pending_team_with_only_bot_reviews_silent` is **moved** to Task 5.6 — it is an exception-builder assertion, not a trend-module assertion.)
  - Checkpoint: `npm run test -- tests/metrics/first-review-trend.test.ts`

#### Task 5.5 — Hygiene rule
- [x] **File**: `src/metrics/first-review-hygiene.ts`
- **Depends on**: Task 4.1 (review row + comment count shape), Task 4.4 (re-exports / wraps the `isMergeWithoutReview` predicate). This split keeps Tasks 5.1 and 5.5 non-circular — both consume the predicate from Task 4.4 (see MO-2).
- **Description**:
  - Import `isMergeWithoutReview` from `src/metrics/first-review-hygiene-predicate.ts` (Task 4.4) and **re-export** it from this module so `first-review-hygiene.ts` remains the public API surface for the hygiene rule. Callers should continue to import `isMergeWithoutReview` from `first-review-hygiene.ts`.
  - Wrap the re-exported predicate with the 7-minute merge-window check, exporting `matchesMergeWithoutReviewHygiene(pr: { openedAt: Date; mergedAt: Date; authorBotFlag: boolean; anyQualifyingReviewCount: number; preMergeCommentCount: number }): boolean` — returns `true` iff `isMergeWithoutReview(pr) === true` AND `(mergedAt - openedAt) < 7 minutes`.
  - Export `countMergeWithoutReviewByTeam(prs: PrAggregate[]): Map<string, number>` — consumes `PrAggregate[]` and filters on `mergeWithoutReviewMatchesHygieneRule` (already pre-computed by Task 5.1 via the Task 4.4 predicate plus the window check). This function does **not** re-run the predicate.
- **Releasable**: hygiene rule callable.
- **Tests (TDD)** — `tests/metrics/first-review-hygiene.test.ts`:
  - Unit: `merge_without_review_hygiene_rule` — positive case.
  - Unit: `bot_only_pr_not_auto_hygiene` — bot review present → not hygiene.
  - Unit: `hygiene_uses_any_qualifying_review_count_not_distinct_authors` — same human reviewer twice doesn't bypass.
  - Unit: `hygiene_seven_minute_threshold_boundary` — exactly 7 minutes → not hygiene; 6m59s → hygiene.
  - Unit: `hygiene_requires_zero_pre_merge_comments` — one comment → not hygiene.
  - Checkpoint: `npm run test -- tests/metrics/first-review-hygiene.test.ts`

#### Task 5.6 — Exception list builder
- [x] **File**: `src/metrics/first-review-exceptions.ts`
- **Depends on**: Task 5.0 (shared sort helper), Task 5.4, Task 5.5
- **Description**:
  - Export `buildFirstReviewExceptions(input: { teams: TeamFirstReviewAgg[]; prs: PrAggregate[] }): FirstReviewException[]`. The `prs` array is the same filtered-to-`reviewSyncedRepoIds` set already passed to Tasks 5.2–5.7 by the payload assembler (Task 6.2); it carries the PR-level fields (`prNumber`, `title`, `repoFullName`) needed to populate `prDetails` on `merge_without_review` exceptions.
  - Emit `review_latency_worsened` (`warning`) for teams with current human-median ≥ 25% higher than previous AND previous baseline available (previous qualifying PR count ≥ 3 AND previous median > 0).
  - Emit `merge_without_review` (`warning`) for teams with ≥1 merge-without-review PR in range.
  - Emit `review_baseline_pending` (`info`) for teams with current qualifying PR ≥ 1 AND previous qualifying PR < 3.
  - **Silent case (per brief §69).** Teams with current-period PRs but **zero qualifying human reviews** emit neither `review_latency_worsened` nor `review_baseline_pending`. If such a team also has zero hygiene matches it is intentionally silent (no Phase 02 exception). If it has a hygiene match, `merge_without_review` covers it.
  - Sort using the shared `sortExceptionsBySeverityThenMagnitude` helper from Task 5.0 (`src/metrics/exception-sort.ts`). The lookup callback resolves `trendPercent == null ? null : Math.abs(trendPercent)` from the matching `TeamFirstReviewAgg` row (returning `null` — not `0` — when absent; see Task 5.0 contract). **Do not** copy-paste the Phase 01 sort body.
  - **Populate `trendPercent` on every emitted exception** from the matching `TeamFirstReviewAgg.trendPercent` (or `null` if no aggregate row exists). For `review_latency_worsened` this is the worsening percent; for `merge_without_review` it is still populated for sort tie-breaking; for `review_baseline_pending` set `trendPercent: null` (no baseline by definition).
  - **Populate `prDetails` on `merge_without_review` exceptions** from the `prs: PrAggregate[]` input, filtered to rows where `mergeWithoutReviewMatchesHygieneRule === true` and grouped by team. Map each row to `{ prNumber: pr.prNumber, title: pr.title, repo: pr.repoFullName }` — never author, avatar, or reviewer info (brief no-surveillance rule). `prDetails` is omitted on other exception types.
  - Cap final result at 3 total.
- **Releasable**: Phase 02 exception list callable.
- **Tests (TDD)** — `tests/metrics/first-review-exceptions.test.ts`:
  - Unit: `review_latency_worsened_fires_at_25pct_threshold` — current/previous = 1.25 → emit.
  - Unit: `review_latency_worsened_does_not_fire_below_25pct_threshold` — 1.249 → no emit.
  - Unit: `review_latency_worsened_requires_previous_baseline` — previous PR count 2 → baseline_pending instead.
  - Unit: `merge_without_review_without_qualifying_reviews` — team with hygiene PR emits.
  - Unit: `review_baseline_pending_emitted` — eligible team emits info.
  - Unit: `baseline_pending_team_with_only_bot_reviews_silent` (relocated from Task 5.4) — team whose only current-period PRs are bot-only-reviewed has zero qualifying human reviews and emits **no** `review_baseline_pending` (and no `review_latency_worsened`). The team is silent unless it also trips hygiene.
  - Unit: `exceptions_sort_by_severity_then_magnitude_then_team_name` — full ordering via the shared helper.
  - Unit: `exceptions_capped_at_three_total_across_types` — N teams → max 3 results.
  - Unit: `exception_builder_populates_trend_percent_from_team_aggregate` — every emitted exception has `trendPercent` set: equal to `TeamFirstReviewAgg.trendPercent` for `review_latency_worsened` and `merge_without_review` (tie-break input); `null` for `review_baseline_pending`.
  - Unit: `merge_without_review_exception_populates_prDetails_with_title_repo_only` — `prDetails` is populated from `PrAggregate` rows matching the hygiene rule, each entry has exactly `prNumber`, `title`, `repo` and no author/avatar/reviewer fields.
  - Unit: `non_merge_without_review_exceptions_omit_prDetails` — `review_latency_worsened` and `review_baseline_pending` emit with `prDetails` undefined.
  - Checkpoint: `npm run test -- tests/metrics/first-review-exceptions.test.ts`

#### Task 5.7 — Team breakdown
- [x] **File**: `src/metrics/first-review-team-breakdown.ts`
- **Depends on**: Task 5.2, Task 5.5, Task 5.4
- **Description**:
  - Export `getFirstReviewTeamBreakdown(input: { teams: TeamFirstReviewAgg[] }): FirstReviewTeamRow[]`.
  - Population: any team with ≥1 merged PR in range from a review-synced repo (contributes to N).
  - `medianHours: null` (renders `—`) when team has no qualifying human-reviewed PRs.
  - `trendPercent: null` (renders `—`) when previous-period comparison unavailable.
  - `noReviewMergeCount: null` (renders `—`) when zero hygiene matches; non-null when ≥1.
- **Releasable**: Phase 02 team table data computable.
- **Tests (TDD)** — `tests/metrics/first-review-team-breakdown.test.ts`:
  - Unit: `first_review_team_column_em_dash_when_no_qualifying_pr` — null median for bot-only team.
  - Unit: `phase_02_team_table_includes_teams_with_only_bot_reviews_with_em_dash` — team appears with three `null`s.
  - Unit: `phase_02_team_table_no_review_merges_renders_em_dash_not_zero_when_no_hygiene_match` — null vs 0 distinction.
  - Unit: `team_with_qualifying_pr_has_median` — sanity.
  - Checkpoint: `npm run test -- tests/metrics/first-review-team-breakdown.test.ts`

### Phase 6 — Payload assembly
> **Releasable**: after this phase, `getDashboardData` returns the extended payload with correct presence/absence of `firstReview`, `reviewFreshness`, `reviewMetricsPending`.

#### Task 6.1 — Dashboard payload type additions
- [x] **File**: `src/metrics/pr-cycle-time-dashboard.ts`
- **Depends on**: Tasks 5.2–5.7
- **Description**:
  - Add `FirstReview`, `FirstReviewMetric`, `FirstReviewException`, `FirstReviewTeamRow`, `ReviewFreshness`, `ReviewMetricsPending` types per Core Types above.
  - Extend `PrCycleTimeDashboard` additively: `firstReview?: FirstReview`, `reviewFreshness?: ReviewFreshness`, `reviewMetricsPending?: ReviewMetricsPending`.
  - **Do not** modify any existing Phase 01 field shapes.
- **Releasable**: type system reflects payload extensions.
- **Tests (TDD)** — `tests/metrics/dashboard-types-phase-02.test.ts`:
  - Unit: `phase_01_freshness_type_shape_unchanged` — keys/types of `freshness` deep-equal a frozen snapshot of the Phase 01 type.
  - Unit: `phase_01_payload_fields_unchanged_regression` — keys/types of `range`, `metric`, `exceptions`, `weeklyTrend`, `teamBreakdown`, `freshness` deep-equal Phase 01 snapshot.
  - Unit: `phase_02_payload_fields_are_optional` — `firstReview`, `reviewFreshness`, `reviewMetricsPending` are optional.
  - Checkpoint: `npm run test -- tests/metrics/dashboard-types-phase-02.test.ts`

#### Task 6.2 — Dashboard payload assembly
- [x] **File**: `src/metrics/pr-cycle-time-dashboard.ts`
- **Depends on**: Task 0.1 (old nested `firstReview.freshness` already removed), Task 6.1
- **Description**:
  - **Explicit removal contract.** The existing nested `firstReview.freshness` block (with `reviewMetadataSyncedAt` and `reviewSyncErrors: number`) was already deleted in Task 0.1. This task **does not re-introduce** freshness fields nested under `firstReview`. Review freshness lives **only** in the new top-level siblings `reviewFreshness` and `reviewMetricsPending` per the Core Types section above and per brief §83.
  - Extend `getPrCycleTimeDashboard` to:
    1. Compute Phase 01 payload exactly as today (no behavior change).
    2. Query repositories for `lastReviewSyncedAt`. If **no** repo has a non-null value, add top-level `reviewMetricsPending: { hint: "Review metrics will appear after the next refresh" }` and return without `firstReview` and without `reviewFreshness`.
    3. Otherwise compute `firstReview` (without any nested `freshness` field) from `pull_request_reviews` joined with the existing PR aggregates, calling the Phase 5 modules. Build the per-PR `PrAggregate` records (Task 5.1) by joining each merged PR with its `pull_request_reviews` rows and its `pull_request_review_comments` rows filtered to `createdAt < mergedAt` (using the new `idx_pull_request_review_comments_pr_id` index). **Filter `PrAggregate[]` to `reviewSyncedRepoIds` (the set of repo IDs whose `lastReviewSyncedAt IS NOT NULL`) exactly once here, before passing the filtered array into Tasks 5.2–5.7.** All downstream metric/exception/team functions accept the already-filtered set — they do not re-apply the filter. For M (`qualifyingPrCount`), Task 5.2 narrows further by `firstQualifyingHumanReviewAt != null`; for N (`mergedPrCountInSyncedRepos`), it is `filteredPrAggregates.length`.
    4. Compute top-level `reviewFreshness.oldestReviewSyncAt` as MIN of `lastReviewSyncedAt` across repos with non-null values; collect top-level `reviewFreshness.reviewSyncErrors: SyncError[]` from `sync_errors` rows where `source = 'github_reviews'` AND `sync_run_id = <latest completed sync_run id>` (single SELECT, `sync_runs` ordered by `completed_at DESC LIMIT 1`). If no sync run has completed yet, `reviewSyncErrors` is an empty array. Each entry is a per-repo `SyncError` object — not a number. `reviewMetricsPending` is **omitted** in this state.
  - Phase 01 fields must remain byte-identical to current behavior in both states.
- **Releasable**: server function returns the extended payload.
- **Tests (TDD)** — `tests/metrics/dashboard-phase-02.test.ts` (integration):
  - Integration: `payload_omits_firstReview_key_before_first_sync` — repos exist, all `lastReviewSyncedAt` NULL → no `firstReview`.
  - Integration: `payload_includes_firstReview_after_first_sync` — one repo synced → `firstReview` present.
  - Integration: `payload_includes_reviewFreshness_when_phase02_visible` — `reviewFreshness.oldestReviewSyncAt` matches MIN.
  - Integration: `payload_includes_reviewMetricsPending_when_phase02_hidden` — hint present.
  - Integration: `freshness_shows_oldest_review_sync_across_synced_repos` — multi-repo MIN.
  - Integration: `phase_02_section_hidden_when_repositories_table_empty` — zero repos → no `firstReview`, pending present.
  - Integration: `phase_01_payload_byte_identical_in_hidden_state` — Phase 01 fields deep-equal Phase 01-only baseline.
  - Integration: `phase_01_payload_byte_identical_in_visible_state` — same when Phase 02 visible.
  - Integration: `review_freshness_includes_per_repo_sync_errors` — when Phase 02 is visible and the current sync run logged review-sync errors for two repos, `reviewFreshness.reviewSyncErrors` is a `SyncError[]` with two entries; each entry is a per-repo error object (not a count integer).
  - Integration: `payload_review_sync_errors_scope_latest_sync_run_only` — errors logged in an older sync run are NOT included; only errors from the latest completed `sync_run_id` appear.
  - Integration: `payload_omits_reviewMetricsPending_when_phase02_visible` — negative case at the payload layer: when at least one repo has `lastReviewSyncedAt IS NOT NULL`, the returned payload does **not** contain the `reviewMetricsPending` key at all.
  - Integration: `mixed_sync_state_excludes_unsynced_repo_prs_from_M_N_B_K_and_team_breakdown` — fixture with one synced repo and one un-synced repo with merged PRs: PRs from the un-synced repo contribute to neither M, N, B, K, nor the Phase 02 team table.
  - Checkpoint: `npm run test -- tests/metrics/dashboard-phase-02.test.ts`

### Phase 7 — UI
> **Releasable**: after this phase, the Phase 02 section renders correctly across all empty/visible states; Phase 01 UI is unchanged.

#### Task 7.1 — First Review section wrapper + layout
- [x] **File**: `src/components/dashboard/FirstReviewSection.tsx`, `src/components/dashboard/PrCycleTimeDashboard.tsx` (mount the section)
- **Depends on**: Task 6.2
- **Description**:
  - `<FirstReviewSection firstReview={...} />` returns `null` when `firstReview` is undefined.
  - When present, renders four children in mockup layout:
    - Row 1: `<FirstReviewCard>` and `<FirstReviewExceptionsPanel>` side-by-side (flex/grid container with `data-testid="phase02-row-1"`).
    - Row 2: `<FirstReviewTrendChart>` and `<FirstReviewTeamTable>` stacked vertically (in a container with `data-testid="phase02-row-2"`; child order: chart first, table second).
  - Mount the section in `PrCycleTimeDashboard.tsx` immediately after the Phase 01 viewport content; do not modify Phase 01 children.
- **Releasable**: section renders or is absent based on payload.
- **Tests (TDD)** — `tests/components/first-review-section.test.tsx`:
  - Component: `first_review_section_hidden_when_payload_lacks_firstReview` — undefined → no DOM nodes.
  - Component: `first_review_section_visible_when_payload_has_firstReview` — children render.
  - Component: `within_section_layout_card_and_exceptions_side_by_side` — `phase02-row-1` contains card and panel as direct children.
  - Component: `within_section_layout_trend_and_team_table_stacked_below_first_row` — `phase02-row-2` contains chart and table in order.
  - Component: `phase01_cycle_time_unchanged` — Phase 01 children DOM tree is unchanged (snapshot or assertion against a Phase 01-only render).
  - Checkpoint: `npm run test -- tests/components/first-review-section.test.tsx`

#### Task 7.2 — First Review card
- [x] **File**: `src/components/dashboard/FirstReviewCard.tsx`
- **Depends on**: Task 7.1
- **Description**:
  - Props: `metric: FirstReviewMetric`.
  - Title: `Median First Review Time`.
  - Subtitle: `PR opened to first human review`. **Suppressed** when `N === 0`; in that case the card body reads `No merged PRs in range`.
  - When `N > 0` and `M === 0`: body reads `No merged PRs with a human review in range`; coverage line still rendered as `0 of N merged PRs with a human review`.
  - Coverage line: `Median over M of N merged PRs with a human review`. Suppressed when `N === 0`.
  - Bot side stat: `Bots: B reviews (X% of qualifying reviews), first-review by bot on K PRs`. **Entirely omitted** when `metric.botShare === null` (B = 0).
- **Releasable**: card renders all defined states.
- **Tests (TDD)** — `tests/components/first-review-card.test.tsx`:
  - Component: `card_subtitle_reads_first_human_review` — subtitle text exact match when N > 0.
  - Component: `card_subtitle_and_coverage_suppressed_when_N_zero` — neither subtitle nor coverage rendered.
  - Component: `coverage_subtitle_renders_M_of_N` — exact string with values.
  - Component: `coverage_subtitle_omitted_when_N_zero` — duplicate angle of above.
  - Component: `bot_share_side_stat_renders` — side stat string with B, X%, K.
  - Component: `bot_share_side_stat_absent_when_B_zero` — botShare null → no side stat DOM.
  - Component: `card_shows_no_review_message_when_M_zero_N_positive` — body text exact.
  - Component: `first_review_card_body_renders_baseline_pending_text_when_status_pending` — when `metric.baselineStatus === 'pending'` and `qualifyingPrCount > 0`, the card body renders the `Baseline pending` text (per brief edge case).
  - Checkpoint: `npm run test -- tests/components/first-review-card.test.tsx`

#### Task 7.3 — Review-latency exceptions panel
- [x] **File**: `src/components/dashboard/FirstReviewExceptionsPanel.tsx`
- **Depends on**: Task 7.1
- **Description**:
  - Props: `exceptions: FirstReviewException[]`.
  - Renders one row per exception with `team`, `message`, severity badge.
  - Hides entirely (returns `null`) when array is empty.
- **Releasable**: panel renders or hides.
- **Tests (TDD)** — `tests/components/first-review-exceptions-panel.test.tsx`:
  - Component: `review_exceptions_panel_renders_capped_three` — 3 items render in order.
  - Component: `exceptions_panel_hidden_when_zero_qualifying_exceptions` — empty array → no DOM.
  - Component: `exceptions_panel_renders_all_three_types` — one of each type rendered with type-specific message.
  - Component: `no_review_merge_pr_detail_renders_title_and_repo_only_no_author` — for a `merge_without_review` exception with a PR detail, the rendered DOM contains the PR title and repo name and **does not** contain any author name, avatar `<img>`, or review-author identifier. Negative compliance test per brief §128.
  - Checkpoint: `npm run test -- tests/components/first-review-exceptions-panel.test.tsx`

#### Task 7.4 — Weekly trend chart
- [x] **File**: `src/components/dashboard/FirstReviewTrendChart.tsx`
- **Depends on**: Task 7.1
- **Description**:
  - Props: `weeklyTrend: WeeklyMedianPoint[]`.
  - Renders an 8-bucket chart (reuse Phase 01 chart component or styling if available; otherwise simple SVG/bar consistent with Phase 01).
  - Renders even when all 8 weeks are `null` (matches Phase 01 trend-chart convention).
- **Releasable**: chart renders.
- **Tests (TDD)** — `tests/components/first-review-trend-chart.test.tsx`:
  - Component: `trend_chart_renders_with_null_weeks_when_M_zero` — all-null input → chart still in DOM.
  - Component: `trend_chart_renders_eight_buckets` — exactly 8 weeks rendered.
  - Checkpoint: `npm run test -- tests/components/first-review-trend-chart.test.tsx`

#### Task 7.5 — Phase 02 team table
- [x] **File**: `src/components/dashboard/FirstReviewTeamTable.tsx`
- **Depends on**: Task 7.1
- **Description**:
  - Props: `rows: FirstReviewTeamRow[]`.
  - Columns: `Team`, `First Review`, `Review Trend`, `No-review Merges`.
  - Renders `—` for any `null` value in `medianHours`, `trendPercent`, `noReviewMergeCount`.
  - Renders an explicit numeric `0` is **not** valid — `noReviewMergeCount === null` renders `—`; any value `≥ 1` renders the number; the data layer never returns `0` (it returns `null` in that case).
- **Releasable**: Phase 02 team table renders.
- **Tests (TDD)** — `tests/components/first-review-team-table.test.tsx`:
  - Component: `phase_02_team_column` — table contains the four columns.
  - Component: `phase_02_team_table_includes_teams_with_only_bot_reviews_with_em_dash` — bot-only team row shows `—` × 3.
  - Component: `phase_02_team_table_no_review_merges_renders_em_dash_not_zero_when_no_hygiene_match` — team with human reviews but no hygiene → `—` in No-review Merges.
  - Component: `two_team_tables_render_independently` — Phase 01 table and Phase 02 table both render with their own columns.
  - Component: `first_review_team_table_renders_empty_state_when_no_team_rows` — empty `rows` array → renders an explicit empty-state message (e.g., `No team data in range`); does **not** render an empty `<tbody>` only.
  - Component: `phase02_dashboard_components_have_accessible_aria_labels_and_table_scope_headers` — Phase 02 team table column headers use `<th scope="col">`; the table itself has an accessible name (e.g., `aria-label` or `<caption>`); the First Review card and the exceptions panel are reachable as labelled regions. (This test may live in this file or a dedicated `tests/components/phase-02-accessibility.test.tsx`; pick one.)
  - Component: `phase_01_team_table_columns_unchanged_regression` — Phase 01 table header strings deep-equal the locked Phase 01 column array.
  - Checkpoint: `npm run test -- tests/components/first-review-team-table.test.tsx`

#### Task 7.6 — Freshness strip extraction + extension
- [x] **File**: `src/components/dashboard/FreshnessStrip.tsx` (NEW — extracted from existing inline footer in `PrCycleTimeDashboard.tsx` lines 622-693). _Implementation deviation: Phase 02 items appended inline in the existing freshness footer rather than extracted into a separate `FreshnessStrip.tsx` component, to preserve Phase 01 DOM byte-for-byte. Same flex container; items render immediately after Phase 01 items as required by spec._
- **Depends on**: Task 0.1, Task 6.2
- **Description**:
  - **Step 1 — Extraction.** No standalone `FreshnessStrip.tsx` exists today; the freshness footer is rendered inline in `PrCycleTimeDashboard.tsx`. Extract the existing Phase 01 freshness footer markup into a new component `src/components/dashboard/FreshnessStrip.tsx` with props `{ phase01: Phase01FreshnessProps; reviewFreshness?: ReviewFreshness; reviewMetricsPending?: ReviewMetricsPending }`. **Phase 01 behavior is unchanged** — the new component must render the same items in the same order with the same DOM structure. Replace the inline footer in `PrCycleTimeDashboard.tsx` with `<FreshnessStrip … />`.
  - **Step 2 — Extension.** Append a review-sync item showing `oldestReviewSyncAt` when `reviewFreshness` is provided; append the pending-hint item when `reviewMetricsPending` is provided. Items live in the same flex container so Phase 01 and Phase 02 items appear as one visual row.
  - **Do not** mutate the Phase 01 `freshness` prop type. **Do not** re-introduce any field nested under `firstReview.freshness` (the nested shape was removed in Task 0.1).
- **Releasable**: freshness strip renders combined Phase 01 + Phase 02 items.
- **Tests (TDD)** — `tests/components/freshness-strip-phase-02.test.tsx`:
  - Component: `freshness_shows_oldest_review_sync_across_synced_repos` — `oldestReviewSyncAt` rendered in expected format.
  - Component: `freshness_pending_hint_visible_in_phase01_strip_when_hidden` — hint item present when `reviewMetricsPending` provided.
  - Component: `freshness_pending_hint_absent_when_visible` — hint absent when `reviewFreshness` provided.
  - Component: `freshness_strip_renders_phase01_items_with_unchanged_dom_after_extraction` — Phase 01 items render with the same DOM structure (tag names, order, class names) as before the extraction. Existing Phase 01 dashboard tests must pass without modification.
  - Component: `freshness_strip_renders_phase02_items_adjacent_to_phase01` — Phase 02 items appear in the same flex container, immediately after the Phase 01 items.
  - Checkpoint: `npm run test -- tests/components/freshness-strip-phase-02.test.tsx`

### Phase 8 — Regression + E2E
> **Releasable**: after this phase, Phase 01 regression and Phase 02 e2e smoke pass.

#### Task 8.0 — E2E review fixture seeder
- [x] **File**: `tests/e2e/fixtures/phase-02-reviews.fixture.ts`
- **Depends on**: Task 2.2 (schema), Task 4.1 (review row shape)
- **Description**:
  - Provide a deterministic seeding function that populates a local test database with: two repositories (one with `lastReviewSyncedAt` set, one with `lastReviewSyncedAt = null`), N merged PRs distributed across two teams, mixed bot and human reviews on those PRs (covering qualifying-human-review, bot-only, and zero-review cases), and exactly one PR matching the `merge_without_review` hygiene rule.
  - Invoked by E2E specs (Task 8.2) **before** the existing `DASHBOARD_E2E_REFRESH_STUB` short-circuit fires. The stub continues to skip the live GitHub sync; the seeded data drives the dashboard read path directly.
  - Export both a seeding entrypoint and a reset entrypoint (clean up after each spec).
- **Releasable**: E2E specs can run hermetically without GitHub API access.
- **Tests (TDD)** — `tests/e2e/fixtures/phase-02-reviews.fixture.test.ts`:
  - Integration: `phase_02_fixture_seeds_expected_row_counts_in_local_db` — after seeding, `pull_requests`, `pull_request_reviews`, `pull_request_review_comments`, and `repositories.lastReviewSyncedAt` contain the documented counts and states.
  - Checkpoint: `npm run test -- tests/e2e/fixtures/phase-02-reviews.fixture.test.ts`

#### Task 8.1 — Phase 01 regression suite
- [x] **File**: `tests/regression/phase-01-unchanged.test.ts`
- **Depends on**: Tasks 6.2, 7.1–7.6
- **Description**:
  - Re-run/aggregate Phase 01 surface assertions: `metric`, `exceptions`, `weeklyTrend`, `teamBreakdown`, `freshness` types and computed values against fixtures known to Phase 01. Assert these did not change with Phase 02 changes loaded.
  - Assert Phase 01 team table column header set deep-equals the locked list.
  - Assert `no_future_metric_cards` against the dashboard with `firstReview` undefined (only PR Cycle Time visible).
- **Releasable**: regression suite green confirms Phase 01 stability.
- **Tests (TDD)** — this task **is** the regression test file:
  - Integration: `phase01_cycle_time_unchanged` — full dashboard payload against locked fixture.
  - Integration: `phase_01_team_table_columns_unchanged_regression`.
  - Integration: `no_future_metric_cards`.
  - Integration: `phase_01_freshness_type_shape_unchanged`.
  - Checkpoint: `npm run test -- tests/regression/phase-01-unchanged.test.ts && npm run verify:phase01`

#### Task 8.2 — Phase 02 e2e
- [x] **File**: `tests/e2e/phase-02.spec.ts`
- **Depends on**: Task 8.0, Task 8.1
- **Description**:
  - Tag each test with `@phase02` so `verify:phase02` can grep them.
  - Fixture: seeded local DB with two repos, one synced one unsynced, mixed bot/human reviews, one merge-without-review PR.
  - Tests:
    - `e2e_no_first_review_before_sync_fixture` — DB with no `lastReviewSyncedAt` → Phase 02 section absent, pending hint visible.
    - `e2e_first_sync_reveals_phase_02_section` — after triggering Refresh in the seeded fixture, section becomes visible.
    - `e2e_bot_only_pr_visible_in_hygiene_not_in_median` — fixture asserts hygiene panel shows the PR and median excludes it.
    - `e2e_phase_01_unchanged_under_phase_02_load` — Phase 01 card, trend, exceptions, team table render the locked Phase 01 fixture values.
    - `e2e_merge_without_review_visible` — explicit hygiene exception visible in panel.
- **Releasable**: full e2e smoke for Phase 02.
- **Tests (TDD)** — embedded above.
  - Checkpoint: `npx playwright test tests/e2e/phase-02.spec.ts --grep @phase02`

### Phase 9 — Verify script and final docs
> **Releasable**: after this phase, FEAT-002 is complete and verifiable end-to-end.

#### Task 9.1 — `verify:phase02` script
- [x] **File**: `package.json`, `vitest.config.phase02.ts` (or coverage scope helper file used by the script)
- **Depends on**: Tasks 1.1–8.2
- **Description**:
  - Add `"verify:phase02": "eslint && tsc --noEmit && vitest run --coverage --config vitest.config.phase02.ts && playwright test --grep @phase02"`.
  - `vitest.config.phase02.ts` (or coverage config block) restricts coverage scope to Phase 02 source files: `src/metrics/first-review-*.ts`, `src/collector/review-sync.ts`, `src/collector/review-store.ts`, `src/collector/bot-identity.ts`, `src/components/dashboard/FirstReview*.tsx`, `src/components/dashboard/FreshnessStrip.tsx`, and Phase 02 additions to `src/metrics/pr-cycle-time-dashboard.ts` and `src/collector/github-client.ts`.
  - Coverage threshold: aggregate ≥85% across these files; any single file in scope must have `>0` coverage.
  - Do not modify `verify:phase01`; both scripts must coexist.
- **Releasable**: `npm run verify:phase02` runs end-to-end.
- **Tests (TDD)** — `tests/scripts/verify-phase-02.test.ts`:
  - Unit: `verify_phase_02_script_exists` — `package.json` has the script with the locked command.
  - Unit: `verify_phase_01_script_unchanged` — `verify:phase01` command string matches the Phase 01 baseline.
  - Unit: `coverage_scope_includes_all_phase_02_source_files` — config glob covers the listed files.
  - Checkpoint: `npm run test -- tests/scripts/verify-phase-02.test.ts && npm run verify:phase02 && npm run verify:phase01`

#### Task 9.2 — Acceptance checklist + roadmap finalization
- [x] **File**: `Documentation/Roadmap/phases/phase-02-first-review-time.md`, `Documentation/Roadmap/trackable-roadmap.md`, `Documentation/README.md`
- **Depends on**: Task 9.1
- **Description**:
  - Tick Phase 02 acceptance checklist boxes in the phase doc to match what FEAT-002 delivered.
  - Update trackable roadmap row for Phase 02 to "Implemented".
  - Update README Next Step.
- **Releasable**: Phase 02 is documented as complete.
- **Tests (TDD)** — `tests/docs/feat-002-finalization.test.ts`:
  - Unit: `docs_phase_02_checklist_updated` — all acceptance criteria boxes ticked.
  - Unit: `docs_trackable_roadmap_marks_phase_02_implemented`.
  - Unit: `docs_readme_next_step_post_phase_02_updated`.
  - Checkpoint: `npm run test -- tests/docs/feat-002-finalization.test.ts`

---

## Known Minor Items

Items reviewed during Cycle 1 and intentionally not addressed in this plan. Listed here so they are not re-raised as findings:

- **Duplicate `coverage_subtitle_omitted_when_N_zero` listing in Task 7.2.** The duplicate is intentional: the test exists once in the consolidated Tests list under Component and is referenced from Task 7.2's local test list as the same test name. No second test file is created; the implementing agent writes the test once.
- **`vitest.config.phase02.ts` vs base config.** This config **extends** the base `vitest.config.ts` (does not stand alone); it overrides only the coverage scope. The implementing agent must not duplicate base settings.
- **`FreshnessStrip.tsx` coverage scope ownership.** `FreshnessStrip.tsx` is shared between Phase 01 and Phase 02. It is listed in the Phase 02 coverage scope (Task 9.1) because Phase 02 is the surface that touches it; this is acceptable and does not double-count.
- **Test naming `review_store_persists_pre_merge_comment_count` vs `review_comment_count_excludes_post_merge`.** Both exist intentionally — the former is a positive case (pre-merge counted), the latter is the negative boundary case (post-merge excluded). The names overlap semantically but cover distinct fixtures.
- **Phase 03 extensibility of `FirstReviewTeamRow`.** Phase 02 deliberately drops `reviewedPrs` and `previousMedianHours`; reintroducing per-team coverage or per-team previous median is a Phase 03+ decision. Phase 02 is scoped.
- **Storing `PENDING`/`DISMISSED` reviews wastes space.** The raw-storage choice (store everything GitHub returns) is preserved: it enables policy flips without re-syncing GitHub (e.g., counting `DISMISSED` if a future phase demands it). The small storage overhead is accepted.
