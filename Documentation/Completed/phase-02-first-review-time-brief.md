# Feature Brief: Phase 02 — First Review Time

Source spec: [phase-02-first-review-time.md](phase-02-first-review-time.md)
Mockup: [04-pr-cycle-time-and-first-review.png](../Assets/mockups/04-pr-cycle-time-and-first-review.png)
Refined: 2026-05-16
Status: Implemented as FEAT-002; later chart presentation updated by FIX-004.

> Current follow-up note: FEAT-002 shipped the human-review semantics and hidden-until-synced behavior described here. FIX-004 later changed the visible First Review trend from the original 8-week single-series presentation to the shared comparison presentation.

## Problem

Leadership can see PR cycle time (Phase 01) but has no visibility into how long PRs sit waiting for a first human review, and no signal for PRs that get merged with no review at all. Slow first reviews and review-skipping are the two most common review-health failures, and both are invisible today.

## Goal

After a sync, the dashboard shows a Phase 02 section below the Phase 01 viewport containing: median First Review Time, a trend, a per-team breakdown, a review-latency exceptions panel, and a merge-without-review hygiene signal. Median measures **first human review** only; bot review activity is shown as honest context, not folded into the metric. Phase 01 surface is unchanged.

## Users & Context

Engineering leads and managers reviewing weekly delivery health on a local dashboard. They scroll: viewport 1 is Phase 01 (the existing primary decision surface); viewport 2 is the new review-latency section. They want one number per metric, a trend, a per-team view, and a small set of ranked exceptions. They are explicitly *not* doing individual author performance review.

## Terminology (used consistently below)

These terms are the source of truth where this brief and the spec disagree.

- **Qualifying review** — a GitHub pull request review with `state ∈ {APPROVED, CHANGES_REQUESTED, COMMENTED}` and `submitted_at` non-null and `submitted_at < mergedAt`. Author identity does not affect this definition.
- **Qualifying human review** — a qualifying review whose author is **not** a bot.
- **Bot author** — GitHub user where `user.type === "Bot"` **or** `user.login.endsWith("[bot]")` (GitHub Apps; literal suffix match, not glob). When the review object's `user` is **null** (deleted account) or `user.type` is null/unknown (mannequin accounts), the author is treated as **human** (fail-open: do not silently inflate bot share, and avoid runtime errors from `user.type` access on null).
- **Qualifying PR** — a merged PR in range with at least one **qualifying human review** (not just any qualifying review). This is the population for First Review median, trend, baseline, and team breakdown.
- **Hygiene-eligible PR** — any merged PR in range, regardless of review state.

## Overrides to the locked spec

This brief intentionally overrides parts of [phase-02-first-review-time.md](phase-02-first-review-time.md). FEAT-002 must implement the brief's version where they conflict:

| Spec rule (overridden) | Brief replacement | Reason |
|---|---|---|
| "Bot-submitted reviews do count" (spec line 34) | Median, trend, baseline use **qualifying human reviews only**. Bot reviews surfaced as a side stat. | Bot auto-approvals defeat the metric's intent (human attention latency). |
| Single full-width team table with review columns added to the Phase 01 table (spec line 80) | Two team tables: Phase 01 table unchanged, Phase 02 table is separate with its own columns. | Stacked-section model; protects Phase 01 surface guarantee. |
| Card subtitle is `PR opened to first submitted review` (spec line 58) | Card subtitle reads `PR opened to first human review`. Card also carries a coverage line and a bot-share side stat. | Subtitle must match what the metric actually measures (humans only); otherwise the label lies. |
| Phase 02 section always present (implicit in mockup) | Phase 02 section is hidden until at least one repo has `lastReviewSyncedAt IS NOT NULL`. | Avoid half-empty cards on first run. |
| Team table column `Reviewed PRs` (spec line 63) | Dropped from the Phase 02 team table. The mockup is authoritative; FEAT-002 does not re-open this. | The coverage subtitle on the card conveys this globally; per-team reviewed-PR counts are deferred to a future phase. |
| Hygiene check `distinctReviewAuthors === 0` (spec line 49) | Hygiene checks `anyQualifyingReviewCount === 0` (no qualifying review of any kind by any author before merge). Derivable as `humanQualifyingReviewCount + botQualifyingReviewCount` in either storage shape. | Spec's column is a distinct-author count; the rule we want is "zero reviews at all," which is what the spec text describes but the column name implements imprecisely. |

Inside the Phase 02 section, the within-section arrangement still follows the mockup (card and exceptions side-by-side; trend and team table stacked vertically). "Stacked" in this brief refers to **section-level** stacking only.

## Core Flow

1. User runs `Refresh` on the dashboard.
2. Collector runs Phase 01 PR sync (unchanged), then a new review sync step that fetches reviews and review comments for merged PRs in scope (global concurrency, per-repo error isolation, `lastReviewSyncedAt` updated only on full-repo success).
3. Metrics layer computes First Review Time per qualifying PR as `firstHumanReviewSubmittedAt − openedAt`, aggregates median, previous-period comparison, trend, and per-team breakdown.
4. Metrics layer flags merge-without-review hygiene PRs (no qualifying review **by any author** before merge, zero pre-merge review comments, merged in under 7 minutes) per team.
5. Dashboard re-renders. If at least one repo has `lastReviewSyncedAt IS NOT NULL`, the Phase 02 section appears below Phase 01:
   - **Median First Review Time** card with subtitle `PR opened to first human review`, a coverage line `Median over M of N merged PRs with a human review` (subtitle and coverage line both suppressed when N = 0; card body then reads `No merged PRs in range`), and a side stat `Bots: B reviews (X% of qualifying reviews), first-review by bot on K PRs` (entire side stat omitted when B = 0).
   - **Review-latency exceptions** panel (capped at 3, severity-then-magnitude sorted; panel hides entirely when zero exceptions qualify, matching Phase 01 convention).
   - **8-week First Review weekly trend** chart (always renders once the section is shown, even when current-period M = 0; empty weeks render as null data points, same as Phase 01). Trend percent label on the card is independently gated by ≥3 qualifying PRs in the previous period and previous median > 0.
   - **Phase 02 team table** with columns: Team, First Review, Review Trend, No-review Merges.
   - A new top-level `reviewFreshness` payload object (sibling of `firstReview`, **not** part of Phase 01 freshness) carries `oldestReviewSyncAt` and per-repo `reviewSyncErrors`; the existing Phase 01 freshness strip renders both Phase 01 and Phase 02 items as one visual row but the type for Phase 01 freshness is **not** mutated (this preserves the Phase 01 unchanged guarantee).
6. If no repo has `lastReviewSyncedAt IS NOT NULL`, the Phase 02 section is hidden entirely; the payload's new `reviewMetricsPending` object (also a top-level sibling of `firstReview`, separate from Phase 01 freshness) carries `hint: "Review metrics will appear after the next refresh"` and the freshness strip renders it as a hint item.

## Computed quantities — exact definitions

To eliminate the "two engineers, two implementations" risk, every quantity surfaced in the UI is defined here:

- **Median First Review Time** — median over all qualifying PRs in range of `firstHumanReviewSubmittedAt − openedAt` (hours).
- **M (coverage numerator)** — count of qualifying PRs in range (PRs with at least one qualifying human review).
- **N (coverage denominator)** — count of merged PRs in range whose owning repo has `lastReviewSyncedAt IS NOT NULL` at render time. PRs from repos that have never successfully review-synced are excluded from N (they are also excluded from M). This keeps coverage honest: it reports against the population we actually have review data for.
- **B (bot review count)** — count of bot-authored qualifying reviews on merged PRs in range whose owning repo has `lastReviewSyncedAt IS NOT NULL` (same population as N).
- **X% (bot share)** — `B / (B + H)` where H is human-authored qualifying review count over the same population. Uses the broad "qualifying review" definition (bots included in denominator), not "qualifying human review."
- **K (first-review-by-bot count)** — count of PRs in N **that have at least one qualifying review** where the earliest such review is bot-authored. PRs in N with zero qualifying reviews do not contribute to K.
- **Trend percent** — shown only when previous period has **≥3 qualifying PRs** (human-reviewed, per the brief's redefinition) and previous median > 0. The "≥3" gate uses the brief's qualifying-PR definition consistently.
- **review_baseline_pending exception** — emitted when current period has ≥1 qualifying PR and previous period has <3 qualifying PRs. A team with current-period PRs but **zero** qualifying human reviews emits neither this nor `review_latency_worsened`; if it also fails hygiene, `merge_without_review` covers it. Teams with only bot-reviewed PRs and no hygiene match are intentionally silent — this is acceptable because they have neither a latency story nor a hygiene story to tell.

## In Scope

- Drizzle migration extending `pull_requests` and `repositories` to support the **human/bot split**. Spec's three aggregate columns are not sufficient on their own. Exact shape (added denormalized columns vs. a new `pull_request_reviews` table) is a planning decision in FEAT-002, but the storage must support: per-PR earliest human-qualifying-review timestamp, per-PR earliest qualifying-review-of-any-kind timestamp, per-PR human qualifying-review count, per-PR bot qualifying-review count (sum = `anyQualifyingReviewCount` used by hygiene), per-PR `firstReviewIsBot` flag, and per-PR pre-merge review-comment count. A `pull_request_reviews` table is the recommended path because it future-proofs policy flips (e.g., reverting to "bots count") without re-syncing GitHub. If the table path is chosen, the migration **must drop** the spec's three denormalized columns (`firstReviewSubmittedAt`, `distinctReviewAuthors`, `reviewCommentCount`) in the same migration — do not leave them as a second source of truth. Land all schema changes in one migration; no second migration in Phase 02.
- `repositories.lastReviewSyncedAt` (nullable timestamptz) — net-new.
- Review sync step in the collector: reviews endpoint + comments endpoint per merged PR, global semaphore reusing `GITHUB_SYNC_CONCURRENCY`, recompute-from-full-response on each sync, incremental gating on `githubUpdatedAt > lastReviewSyncedAt`, per-repo error isolation, `sync_errors.source = github_reviews`. Review sync for a repo runs only when **this invocation's** Phase 01 PR sync for that repo succeeded; a transient PR-sync failure skips review sync for that repo this run and lets the next run retry both. Accepted limitation: review-comment edits that do not bump `githubUpdatedAt` may leave `pre-merge review-comment count` stale; this is a known low-probability inaccuracy.
- Bot identification via GitHub `user.type === "Bot"` plus `[bot]` login suffix; unknown/null user.type defaults to **human**.
- First Review Time metric on qualifying human reviews only; coverage subtitle; bot-share side stat.
- 8-week previous-period comparison, trend percent gated by ≥3 **qualifying PRs** (brief's definition) and previous median > 0.
- Merge-without-review hygiene rule and exception (`merge_without_review`), team-level No-review Merges count, PR-level detail shows title + repo only (no author names). Hygiene uses the broad "qualifying review" check (`anyQualifyingReviewCount === 0`), not human-only — so a PR with only bot reviews does **not** trigger hygiene unless it also has zero review comments and merged in <7 minutes.
- Three exception types in the Phase 02 panel: `review_latency_worsened`, `merge_without_review`, `review_baseline_pending`. Per-type gating per spec. Cap at 3, sorted by severity, then trend magnitude, then team name. Sorting reuses or generalizes the Phase 01 `sortExceptions` helper rather than copy-pasting.
- Phase 02 section UI: card + exceptions panel + weekly trend chart + Phase 02 team table, all hidden until the gate condition above is met.
- Extension of the dashboard payload type with a nested `firstReview` object. When the gate is not met the API **omits** the `firstReview` key entirely (does not return null with stub fields and does not run review aggregations). Phase 01 fields remain flat and unchanged.
- Two new top-level payload siblings of `firstReview`: (a) `reviewFreshness?: { oldestReviewSyncAt: string; reviewSyncErrors: SyncError[] }` present when Phase 02 is visible, (b) `reviewMetricsPending?: { hint: string }` present only when Phase 02 is hidden. Both are separate from Phase 01's `freshness` object — the Phase 01 freshness type is **not** mutated, preserving the unchanged guarantee. The freshness strip component reads from both and renders them as one visual row.
- `verify:phase02` script mirroring `verify:phase01`. Explicit composition: `eslint && tsc --noEmit && vitest run --coverage && playwright test --grep @phase02`. Coverage threshold: aggregate ≥85% over all Phase 02 source files (collector review sync module, first-review-time metric module, dashboard payload extensions, new UI components); aggregate is computed only over these files (a Phase 01 file with high coverage cannot mask a Phase 02 file with zero coverage). Any Phase 02 source file must have non-zero coverage.

## Out of Scope

- Splitting hygiene into a later phase — rejected; ship together for one coherent migration.
- Merging the Phase 01 and Phase 02 exceptions into a single panel — rejected; keeps Phase 01 untouched.
- Adding Phase 02 columns to the Phase 01 team table — rejected; we use a second, dedicated Phase 02 team table to reinforce section boundaries.
- Author-level breakdowns or rankings — explicit non-goal (no surveillance).
- Range selector, Jira data, auth, cloud sync, PR size — Phase 03+.
- Heuristic bot detection beyond GitHub's own `user.type`/`[bot]` suffix — not needed; GitHub flags bots reliably.
- Detecting stale reviews on force-pushed PRs (review submitted on a since-replaced commit). Accepted as inherent inaccuracy; GitHub does not auto-dismiss these unless repo settings demand it.

## Key Decisions

- **Ship both metrics in one phase**: First Review Time + merge-without-review hygiene.
- **Section-level stacked layout**: Phase 01 viewport unchanged; Phase 02 as a section below. Within-section layout follows the mockup.
- **Median = first qualifying human review only**: honest measurement of human attention latency; explicit override of the spec.
- **Bot activity surfaced as a side stat**: B count, X% bot share, K first-by-bot PRs. Keeps the metric honest while making bot influence visible.
- **Coverage subtitle** with explicit denominator (`N = merged PRs whose repo has been review-synced`): prevents the median from misleading when many PRs lack a human review and prevents unsynced-repo PRs from inflating denominator.
- **Two separate team tables**, one per section.
- **Separate review-latency exceptions panel**, capped at 3 independently of Phase 01.
- **Hide Phase 02 section entirely** until at least one repo has `lastReviewSyncedAt IS NOT NULL`; payload omits `firstReview` key in that state.
- **Storage extension required**: spec's aggregate-only columns cannot back the bot-share side stat; FEAT-002 must add either denormalized human/bot columns or a `pull_request_reviews` table (recommended).
- **`merge_without_review` hygiene gating intentionally diverges from Phase 01 `long_open_prs`**: Phase 01 requires the team to have a median; hygiene requires only ≥1 merged PR. This is deliberate — hygiene must fire for teams that merge without ever reviewing.

## Edge Cases & Constraints

- **PR with only bot reviews before merge**: excluded from First Review median, M, and the qualifying-PR population; included in N if the repo has been review-synced. Bot reviews count toward B and X% but the PR is **not** automatically a hygiene case (hygiene needs `anyQualifyingReviewCount === 0` plus the comment and time gates).
- **PR with a bot review first, then a human review, both before merge**: median uses the human review's `submitted_at`. Bot review counts toward B and X%. PR contributes to K (first-by-bot).
- **PR with a human review first, then a bot review**: median uses the human review's `submitted_at`. Bot review counts toward B and X%. PR does **not** contribute to K.
- **PR opened by a bot (e.g. Dependabot) and reviewed by a human**: counts normally; PR author identity does not affect any rule.
- **Author self-review (human author reviewing own PR)**: counts (rare but happens; no author filtering).
- **Reviewer with unknown `user.type` (deleted or mannequin account)**: treated as human. Documented fail-open; rare and not worth a UI affordance.
- **Reviews with `submitted_at` after `mergedAt`**: ignored for first-review time, participation counts, and hygiene.
- **`PENDING` and `DISMISSED` review states**: never qualify.
- **No qualifying human reviews in range (M = 0, N > 0)**: card body shows `No merged PRs with a human review in range`; median, trend, and team medians omitted; coverage subtitle reads `0 of N merged PRs with a human review`; bot-share side stat still renders if B > 0; hygiene signal still computes.
- **N = 0 (no review-synced repo has merged PRs in range)**: Phase 02 section still renders (gate already passed), but card shows `No merged PRs in range` and coverage subtitle is omitted.
- **`reviewMetadataSyncedAt` aggregation across repos**: footer surfaces the **minimum** (oldest) `lastReviewSyncedAt` **across repos where `lastReviewSyncedAt IS NOT NULL`** — staleness, not recency. Repos that have never review-synced are excluded from the aggregation (not coerced to epoch). If no repos qualify, the Phase 02 section is hidden (per the gate above) and this value is not surfaced.
- **Per-PR sync failure within a synced repo**: a repo whose review sync pass completes (so `lastReviewSyncedAt` advances) may still have individual PRs whose review fetch failed and were logged to `sync_errors`. Those PRs are included in N (their repo is synced) but have stale or empty review fields. Accepted as known small inaccuracy; the per-repo error surface flags the failure so leadership can interpret coverage with context.
- **Phase 02 team table population**: a team appears in the Phase 02 table if it has **at least one merged PR in range from a review-synced repo** (i.e., contributes to N). First Review and Review Trend show `—` for teams with no qualifying human-reviewed PRs; No-review Merges shows `—` (not `0`) for teams with no merge-without-review hygiene matches. A team with only bot-reviewed PRs and no hygiene matches appears with all three columns as `—`.
- **Exception cap (3) and intra-type dominance**: a single exception type (commonly `merge_without_review`, all `warning` severity) may consume all three slots if its trend magnitudes dominate. This is intentional — the cap is a noise budget, not a diversity quota; teams should see the loudest signals first. Future iterations may revisit if hygiene exceptions starve latency exceptions in practice.
- **Baseline pending**: previous-period had <3 qualifying PRs (brief's definition) or previous median == 0. Card shows `Baseline pending`; `review_baseline_pending` exception emitted for affected teams that meet the current-period gate.
- **Per-repo review sync failure**: error logged to `sync_errors` with `source: github_reviews`; `lastReviewSyncedAt` not updated for that repo; other repos unaffected; footer surfaces per-repo errors.
- **Rate limit hit mid-sync**: stop starting new review fetches, record error, leave `lastReviewSyncedAt` unchanged for affected repos.
- **Merge-without-review PR detail surface**: PR title + repo only. No author name, no avatar, no review-author info.
- **Phase 01 regression safety**: `firstReview` is a nested optional on the dashboard payload; Phase 01 fields stay flat. `npm run verify:phase01` must remain green. Phase 01 team table column set is asserted unchanged by an explicit regression test (see below).

## Test additions on top of the spec matrix

These extend FEAT-002's locked test list. Each new behavior in this brief maps to at least one named test.

| Area | Required tests (in addition to spec matrix) |
|------|---------------------------------------------|
| Metric unit | `human_only_median_excludes_bot_reviews`; `bot_first_then_human_uses_human_timestamp`; `human_first_then_bot_uses_human_timestamp`; `bot_only_pr_excluded_from_median_and_M`; `null_user_object_treated_as_human` (review where the `user` field itself is null); `null_user_type_treated_as_human` (user object present, `user.type` null); `coverage_subtitle_m_of_n_population`; `coverage_subtitle_n_excludes_unsynced_repo_prs`; `bot_share_denominator_includes_bots`; `first_review_by_bot_count_K`; `K_excludes_prs_with_zero_qualifying_reviews`; `trend_gate_three_qualifying_human_prs`; `baseline_pending_team_with_only_bot_reviews_silent`; `bot_login_endswith_bracket_bot_literal_suffix` |
| Hygiene unit | `bot_only_pr_not_auto_hygiene`; `hygiene_uses_any_qualifying_review_count_not_distinct_authors` |
| Exceptions unit | `review_latency_worsened_fires_at_25pct_threshold` (current median exactly 25% above previous → emit); `review_latency_worsened_does_not_fire_below_25pct_threshold` (24.9% → no emit); `review_latency_worsened_requires_previous_baseline` (no previous baseline → no emit, baseline_pending instead); `exceptions_sort_by_severity_then_magnitude_then_team_name`; `exceptions_capped_at_three_total_across_types` |
| Sync integration | `review_sync_skipped_when_pr_sync_failed_same_run`; `null_user_falls_back_to_human_classification`; `pull_request_reviews_table_path_drops_spec_denormalized_columns` (only if table path chosen) |
| Schema / migration | `migration_supports_human_bot_split` (column or table form per FEAT-002 choice); `migration_single_file_no_second_migration` |
| Dashboard component | `phase_02_section_hidden_when_no_repo_review_synced`; `phase_02_section_hidden_when_repositories_table_empty`; `phase_02_section_visible_after_first_repo_sync`; `freshness_pending_hint_visible_in_phase01_strip_when_hidden`; `freshness_pending_hint_absent_when_visible`; `freshness_shows_oldest_review_sync_across_synced_repos`; `two_team_tables_render_independently`; `phase_02_team_table_includes_teams_with_only_bot_reviews_with_em_dash`; `phase_02_team_table_no_review_merges_renders_em_dash_not_zero_when_no_hygiene_match` (separate from the all-dashes case: team has human reviews but no hygiene hits); `phase_01_team_table_columns_unchanged_regression` (assertion shape: exact ordered list of header strings deep-equal to the locked Phase 01 column set — not a snapshot, not a length check); `bot_share_side_stat_renders`; `bot_share_side_stat_absent_when_B_zero`; `card_subtitle_reads_first_human_review`; `card_subtitle_and_coverage_suppressed_when_N_zero`; `coverage_subtitle_renders_M_of_N`; `coverage_subtitle_omitted_when_N_zero`; `exceptions_panel_hidden_when_zero_qualifying_exceptions`; `trend_chart_renders_with_null_weeks_when_M_zero`; `within_section_layout_card_and_exceptions_side_by_side`; `within_section_layout_trend_and_team_table_stacked_below_first_row` |
| Payload contract | `payload_omits_firstReview_key_before_first_sync`; `payload_includes_firstReview_after_first_sync`; `payload_includes_reviewFreshness_when_phase02_visible`; `payload_includes_reviewMetricsPending_when_phase02_hidden`; `phase_01_freshness_type_shape_unchanged` |
| Route / e2e | `e2e_first_sync_reveals_phase_02_section`; `e2e_bot_only_pr_visible_in_hygiene_not_in_median`; `e2e_phase_01_unchanged_under_phase_02_load` |
| Verify | `verify:phase02` covers all of the above plus the spec matrix |

## Open Questions

- **Bot-share side stat visual treatment**: in-card vs. tooltip vs. below-card placement. Mockup doesn't show it. Wording is locked in this brief; placement is a planning-stage UX decision and does not block FEAT-002 from starting.
- **Storage shape**: denormalized columns vs. `pull_request_reviews` table. Brief recommends the table; FEAT-002 chooses. Either way the migration is a single file (no second migration in Phase 02); if the table path is chosen, the spec's three denormalized columns must be dropped in that same migration.

## Future Iterations

- **Review depth / quality signals**: comments-per-review, rounds of `CHANGES_REQUESTED`, time-to-approval after changes.
- **Per-repo or per-PR-size First Review breakdowns**.
- **Reviewer load distribution** (anonymized) — needs privacy review.
- **Range selector** shared across Phase 01 and Phase 02.
- **Notifications / alerts** when a team trips `review_latency_worsened` or `merge_without_review` for two consecutive periods.
- **Per-team Reviewed PRs column** if FEAT-002 demand surfaces.
- **Force-push-aware stale review detection** for repos that don't auto-dismiss on push.

## Recommendation

This is the right next feature: First Review Time is the highest-signal review-health metric and the hygiene signal is the natural companion. The refinements here (human-only median with explicit spec override, bot side stat with named denominators, coverage subtitle with a defined denominator, section-level stacked layout, hide-until-synced gate, storage extension for human/bot split) make the metric honest and the implementation unambiguous.

The hardest part is the review sync architecture plus the storage decision: the spec's aggregate-only columns cannot back the bot-share side stat, so FEAT-002 must extend the schema in one migration. Get this wrong and either the side stat is unimplementable or a second migration follows.

What must not be compromised: (1) Phase 01 surface stays pixel-identical and `verify:phase01` stays green; (2) the median measures human attention latency, never bot activity; (3) the hygiene surface shows no author identity, ever.
