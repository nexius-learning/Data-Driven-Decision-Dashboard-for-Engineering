# Feature Brief: PR Size

## Problem
Engineering teams have no visibility into whether PRs are getting oversized — they can see cycle time and review latency, but not the code churn driving those delays or creating review bottlenecks.

## Goal
The dashboard shows median PR size (lines changed), an 8-week trend, team breakdown, and flags teams with oversized PR patterns — so leads can detect and address large-PR habits before they compound into slower cycles.

## Users & Context
Engineering leads and team managers reviewing the dashboard after sprint close or during a 1:1 prep. They already see cycle time and first review metrics above; PR Size gives them the third lever to investigate.

## Core Flow
1. User scrolls past PR Cycle Time and First Review Time sections.
2. The PR Size section appears below, showing a metric card with the overall median size (additions + deletions) and a trend vs. the prior period.
3. An exceptions panel alongside flags teams where ≥ 50% of PRs in the current 8-week window exceed 2× that team's rolling 8-week median (minimum 3 PRs required).
4. Below, an 8-week completed-week trend chart shows median PR size over time, plus a detached current-week-so-far point when current-week measured PRs exist.
5. A team breakdown table shows each team's median size, trend direction, and their largest recent PR (title + repo, no author).
6. If no size data has been collected yet, the section shows a "no data yet" state and disappears once data is available.

## In Scope
- `additions + deletions` as the headline "PR Size" value (total lines changed)
- File count stored in `changedFiles` column; displayed as a secondary line in the metric card (e.g., 'across N files'). No click-through or breakdown required.
- Median PR size metric card with period-over-period trend
- Oversized PR exceptions panel: teams with PRs exceeding 2× their rolling team median
- 8-week median size trend chart
- Team breakdown table: Team, PRs merged, Median size, Trend (↑ if current 8-week median exceeds prior 8-week median by >10%; ↓ if prior 8-week median exceeds current 8-week median by >10%; → otherwise; shown as '—' if fewer than 3 PRs in either the current or prior period), Largest PR (title + repo) (within the selected 8-week window)
- Trend confidence semantics: current-week-so-far notes include measured PR count and "This value may change"; `< 3` measured PRs are explicitly labeled low sample.
- Schema migration: add `additions`, `deletions`, `changedFiles`, `mergeCommitSha` columns to `pullRequests`
- Sync update: extract `merge_commit_sha` from the existing GitHub list PR response (already returned, zero extra API calls for merge and squash PRs; one API call per rebase-merged PR as fallback); run `git diff <sha>^1 <sha> --shortstat` against the local repo on disk; size computation (both `merge_commit_sha` extraction and `git diff` invocation) must be gated on `mergedAt !== null` — open and closed-unmerged PRs have a test-merge SHA that does not exist in the local clone. The file count from `--shortstat` output (e.g., `3 files changed, ...`) is stored in `changedFiles`. For the API fallback path, `changed_files` from the PR detail response is stored in `changedFiles`.
- Backfill: search local git history by PR number using two grep passes — `git log --all --grep="pull request #<N>"` for merge commits and `git log --all --fixed-strings --grep='(#<N>)'` for squash commits — and take the first match; post-filter merge commit results to those where the *first line* of the commit message matches the pattern `Merge pull request #<N> from ` (GitHub's default merge commit format); commits where the PR number appears only in the body are excluded; post-filter squash results to those where the *first line* of the commit message ends with `(#<N>)` — matching GitHub's squash format; commits where `(#<N>)` appears elsewhere (body, second line, etc.) are excluded; if multiple matches are found, use the one closest in date to `mergedAt`; if none match, the PR remains size-null. The two passes are run in sequence — the merge commit pass first, then the squash pass. If the merge commit pass returns results, the squash pass is skipped. The squash pass is only run if the merge commit pass returns nothing. Backfill commit must be an ancestor of the repository default branch (`git merge-base --is-ancestor <sha> origin/HEAD` falling back to `origin/main` then `origin/master` if `origin/HEAD` does not resolve; if none resolve, skip the ancestor check and accept the match with a warning logged to `syncErrors`); commits found only on unmerged branches are rejected.
- "No data yet" state when no size data exists for the selected period

## Out of Scope
- Author-level size metrics — acceptance criteria explicitly prohibit shaming individuals
- Separate additions vs. deletions breakdown in the UI — adds complexity without clear decision value
- Per-file or per-directory size analysis — disproportionate complexity for this phase
- Configurable oversized thresholds — a single team-relative rule (2× median) is sufficient and keeps the feature deterministic

## Key Decisions
- **Headline metric is `additions + deletions`**: Industry-standard definition of PR churn; file count stored but secondary. Chosen over file-count-first because lines changed is the better proxy for review effort.
- **Oversized threshold is 2× team rolling median**: Team-relative keeps the rule fair across repos with different norms (infra vs. frontend). Absolute thresholds would unfairly penalize high-churn codebases. Consistent with the "no author shaming" constraint.
- **Exceptions panel algorithm**: A team is flagged when ≥ 50% of its PRs within the rolling window exceed 2× the team's rolling median, with a minimum of 3 PRs in that window. The rolling window is the same 8-week window used for all other metrics. Note: this algorithm detects sudden spikes in PR size relative to a team's own norm — teams that consistently ship large PRs will not be flagged, because their rolling median adjusts to their pattern. This is intentional: the feature surfaces behavioral *changes*, not absolute size violations. The problem of chronically oversized teams is partially addressed by the team breakdown table, which surfaces median size directly and is sorted by median descending.
- **Size computed from local git, zero extra API calls for merge and squash PRs; one API call per rebase-merged PR as fallback**: `merge_commit_sha` is already present in the GitHub list PR response but not extracted. Storing it costs nothing. Size is then computed locally via `git diff <sha>^1 <sha> --shortstat` against the repo path already on disk. Note: `git diff <sha>^1 <sha> --shortstat` is correct for merge commits and squash commits. For rebase-and-merge PRs, `merge_commit_sha` points to the last rebased commit, so `<sha>^1` gives only the last commit's diff, not the full PR. For rebase merges, fall back to the GitHub PR detail API (`GET /repos/{owner}/{repo}/pulls/{number}`) which returns `additions`/`deletions` directly regardless of merge strategy. The sync pipeline must also run `git fetch --quiet` on each repo before computing size via `git diff`; without this, recently merged SHAs will not exist in the local clone, and `git diff` will fail with 'unknown revision' for every new PR. The `--shortstat` output format is `N files changed, X insertions(+), Y deletions(-)` where the insertions and/or deletions segments may be absent if zero. Parse with an approach that handles partial output (e.g., sum matches for both `insertions` and `deletions` patterns; default to 0 if absent). Run git with `LC_ALL=C` to prevent locale-dependent output.
- **Merge strategy detection**: Merge commits are identified by `git rev-list --parents -1 <sha>` returning two parent SHAs. For these, `git diff <sha>^1 <sha> --shortstat` gives the full PR diff correctly. For single-parent commits, squash and rebase must be distinguished to determine which code path to use: run `git log -1 --format=%s <sha>` (first line of commit message). If it ends with `(#<PR_NUMBER>)` — matching GitHub's default squash format — it is a squash commit and `git diff <sha>^1 <sha>` gives the correct full PR diff. If the commit message does NOT end with `(#<PR_NUMBER>)`, treat it as a rebase-merged PR and fall back to the GitHub PR detail API (`GET /repos/{owner}/{repo}/pulls/{number}`). This detection is deterministic, uses data already fetched, and handles the common rebase case correctly. Organizations using custom squash commit message templates that omit the `(#N)` suffix will see all their squash PRs go through the API fallback — harmless, since the API returns correct data for both strategies.
- **Team aggregation**: Team is resolved via `repositories.team` (from `team-mapping.json`). For the team breakdown table, all PRs across all repos belonging to the same team are aggregated into a single row. Repos with `team = null` are excluded from the team breakdown. The 'Largest PR' column shows the single largest PR across all the team's repos.
- **Section appears only when data exists**: Avoids a permanently empty section for repos with no synced size data yet.

## Edge Cases & Constraints
- **PRs merged before feature ships**: `merge_commit_sha` not yet stored. Backfill via local `git log --grep` is best-effort; PRs using squash or rebase merge strategies may not match the default merge commit format. These PRs show no size data until re-synced.
- **Rebase-and-merge PRs**: `git diff <sha>^1 <sha>` only captures the last commit's changes, not the full PR. Use the GitHub PR detail endpoint (`GET /repos/{owner}/{repo}/pulls/{number}`) as fallback for these PRs.
- **Unmerged PR SHAs**: GitHub sets `merge_commit_sha` to a temporary test-merge commit on open PRs. This SHA does not exist locally. Size computation must be skipped unless `mergedAt` is set.
- **Stale local clone**: If `git fetch` fails (network error, auth), all `git diff` calls for that repo will fail for new commits. Store nulls; log to `syncErrors` with reason `git-fetch-failed`. Log to `syncErrors` using the existing `source` column for the reason code (e.g., `source = 'git-fetch-failed'`) and the `message` column for error details. No schema change to `syncErrors` is required.
- **Baseline pending**: The first period with size data has no prior period to compare against. The metric card must handle this state (same "baseline pending" pattern as First Review Time).
- **Teams with < 3 PRs**: Too few samples for a meaningful median. Exceptions panel should suppress teams below this threshold to avoid false positives.
- **Repos not yet size-synced**: The team breakdown should only include teams that have at least one PR with size data in the selected window.
- **Very large diffs**: Git may time out or fail for extremely large diffs. Impose a 30-second timeout per `git diff` invocation. On timeout or non-zero exit code, store nulls for that PR. Log to `syncErrors` with reason `git-diff-failed` (using `source = 'git-diff-failed'` and `message` for error details; no schema change to `syncErrors` required). A single `git diff` failure does not fail the overall sync run; the sync run is marked `partial` only if ≥ 10% of PRs in a repo fail size computation.

## Acceptance Criteria

- **Metric card**: Shows median `additions + deletions` across all merged PRs with non-null size data in the selected 8-week window. Shows "baseline pending" instead of a trend arrow when fewer than 3 weeks of size data exist (raw median is still shown; only the trend comparison is suppressed). Shows period-over-period trend vs. the prior 8 weeks.
- **Exceptions panel**: Lists only teams with ≥ 3 PRs in the current window where ≥ 50% of PRs exceed 2× the team's 8-week rolling median. Sorted by flagged-PR ratio descending. Maximum 3 teams shown.
- **Trend chart**: Shows median PR size per week for the last 8 weeks. Weeks with 0 PRs show no data point (gap, not zero). The trend chart shows data points for all weeks in the 8-week window where PRs with size data exist, regardless of whether the metric card is in "baseline pending" state.
- **Team breakdown table**: Shows all teams with ≥ 1 PR with non-null size data in the selected window. Columns: Team, PRs merged (count with size data), Median size (lines), Trend (↑/↓/→ based on comparison to prior 8-week median; "—" if fewer than 3 PRs in either the current or prior period), Largest PR (title + repo link; within the selected window). Sorted by median size descending.
- **No data state**: The entire PR Size section is hidden if zero PRs have non-null `additions`/`deletions` in the selected window.
- **Size computation**: `additions + deletions` for merge and squash PRs is computed via `git diff <sha>^1 <sha> --shortstat`. For rebase-merged PRs, falls back to GitHub PR detail API. Binary files contribute 0 to the `additions + deletions` count (git excludes binary content from insertions/deletions in `--shortstat`), but ARE counted in the `changedFiles` file count. Merge strategy detection: merge commits (2 parents) always use git diff. Single-parent commits: if the commit message first line ends with `(#<PR_NUMBER>)`, treat as squash and use git diff. Otherwise treat as rebase and use the GitHub PR detail API fallback. File count is populated in `changedFiles` from the `--shortstat` file count for git-diff path, and from `changed_files` for the API fallback path.
- **Null handling**: PRs where size cannot be computed (fetch failure, timeout, rebase fallback API error) are excluded from all medians. They are not shown as zero.

## Future Iterations
- Per-author size trends (opt-in, with explicit consent framing) — intentionally deferred to respect the "no shaming" constraint in v1
- Configurable oversized threshold per team or repo
- Size-to-cycle-time correlation view (large PRs → longer cycles)
- Breakdown of additions vs. deletions to distinguish net-new code from refactoring

## Recommendation
This is the right next feature. The infrastructure is fully established (schema, sync, metric, UI patterns all templated by Phase 02), and PR Size is the natural third leg of the stool alongside cycle time and review latency. The implementation is cleaner than it first appeared — `merge_commit_sha` is free from the existing sync call, and local git handles merge and squash PRs with no API rate-limit exposure; rebase-merged PRs use a lightweight API fallback that stays well within rate limits. The "no author shaming" constraint is load-bearing — preserve it strictly in both the exceptions panel and the team table design.
