# FIX-005 — Stale Open PR Exceptions
**Purpose**: Make the existing PR Cycle Time long-open-PR exception actionable by showing concrete stale open PR details.
**Audience**: Head of Engineering, implementation agent, engineers maintaining the dashboard.
**Status**: Verified

---

## Background

The dashboard already computes PR Cycle Time exceptions and includes a `long_open_prs` exception type. Today that exception is summary-level: it can say a team has long-open PRs, and the Team Breakdown table can show the oldest still-open PR age, but the dashboard does not identify which open PRs need attention.

The feature brief is [stale-open-pr-exceptions-brief.md](stale-open-pr-exceptions-brief.md). The visual reference is [06-orphaned-prs-exceptions.html](../Assets/mockups/06-orphaned-prs-exceptions.html).

This is a focused PR Cycle Time refinement. Phase 04 Jira Flow Metrics remains the next feature phase unless the roadmap explicitly schedules this polish item first.

## Completion note

FIX-005 was implemented and verified on 2026-06-11 with `npm run verify:fix005`. The verification run covered the focused stale-open-PR metric, component, and E2E checks plus the Phase 01, Phase 02, and Phase 03 regression gates.

## Goal

When this plan is complete, the existing PR Cycle Time exceptions card shows stale open PR details for `long_open_prs`: oldest 3 in all-teams mode and oldest 10 when a single team is selected. The payload and UI expose PR number, title, repository, URL, and age only, with no author, assignee, reviewer, or individual-ranking fields.

---

## Scope

### In Scope

- Extend `PrCycleTimeException` with stale open PR detail data.
- Use the locked stale threshold: `max(72h, team current median PR cycle time)`, with `72h` fallback when the team has no current median.
- Ignore negative open PR ages.
- Populate `long_open_prs.prDetails` in the dashboard payload builder.
- Cap details to 3 in all-teams mode and 10 in team-filtered mode.
- Render stale PR detail rows inside the existing PR Cycle Time exceptions card.
- Keep the Team Breakdown `Longest Open PR` column as the compact team-level signal.
- Add focused metric, component, and E2E coverage.
- Register FIX-005 as a pre-Phase-04 refinement in docs if implemented before Phase 04.

### Out of Scope

- A new dashboard metric section.
- A separate orphaned/stale PR dashboard page.
- Author names, assignee names, reviewer names, reviewer rankings, or individual performance surfaces.
- GitHub write actions.
- Configurable stale thresholds.
- Jira, AI recommendations, cloud deployment, auth, or later quality metrics.

---

## Acceptance criteria

- [x] `long_open_prs` exceptions include `staleThresholdHours`, `percentOverStaleThreshold`, and optional `prDetails`.
- [x] All-teams mode returns at most the oldest 3 stale open PR details per `long_open_prs` exception.
- [x] Team-filtered mode returns at most the oldest 10 stale open PR details for the selected team.
- [x] Stale open PR detection uses `ageHours > max(72, teamMedianHours)` when a team median exists.
- [x] Stale open PR detection uses `ageHours > 72` when no team median exists.
- [x] Negative open PR ages are ignored.
- [x] Exception `count` includes all stale open PRs, not only visible detail rows.
- [x] The stale PR detail payload remains JSON-serializable.
- [x] Detail rows include PR number, title, repository, URL, and age.
- [x] No author, assignee, reviewer, or individual-ranking field is added to the payload or UI.
- [x] Existing `team_worsened` and `baseline_pending` exception behavior remains unchanged.
- [x] Existing PR Cycle Time median, trend, chart, Team Breakdown, First Review, and PR Size calculations remain unchanged.
- [x] Desktop and mobile UI show stale PR details without incoherent text overlap.
- [x] The all-teams exception list stays compact enough to preserve the first-dashboard-viewport intent from the brief.

---

## What does NOT change

- Dashboard order remains PR Cycle Time, First Review Time, then PR Size.
- The PR Cycle Time metric card calculation does not change.
- The PR Cycle Time comparison trend calculation and renderer do not change.
- The Team Breakdown `Longest Open PR` column remains an age-only compact signal.
- First Review and PR Size payloads, calculations, and UI do not change.
- Existing exception global cap remains 3 exceptions unless this plan explicitly states otherwise.
- No new environment variables or user settings are added.

---

## Known limitations / accepted trade-offs

- The first version uses fixed caps: 3 detail rows in all-teams mode and 10 in team-filtered mode.
- The stale threshold is not configurable. This keeps the first implementation simple and testable.
- If more than 10 stale PRs exist for a selected team, the dashboard preserves the full count but shows only the oldest 10.
- This feature identifies stale work, but it does not decide ownership or trigger GitHub actions.

---

## Architecture

- Extend `PrCycleTimeException` in `src/metrics/pr-cycle-time-dashboard.ts`:

```ts
export type StaleOpenPrDetail = {
  prNumber: number
  title: string
  repo: string
  url: string
  ageHours: number
}

export type PrCycleTimeException = {
  type: 'team_worsened' | 'long_open_prs' | 'baseline_pending'
  severity: 'warning' | 'info'
  team: string
  message: string
  count?: number
  teamMedianHours?: number
  staleThresholdHours?: number
  averageOpenPrAgeHours?: number
  percentOverStaleThreshold?: number
  prDetails?: StaleOpenPrDetail[]
}
```

- Add constants in `src/metrics/pr-cycle-time-dashboard.ts`:

```ts
const STALE_OPEN_PR_MIN_HOURS = 72
const STALE_OPEN_PR_DETAIL_LIMIT = 3
const STALE_OPEN_PR_TEAM_FILTER_DETAIL_LIMIT = 10
```

- Add exported helper in `src/metrics/pr-cycle-time-dashboard.ts`:

```ts
export function staleOpenPrThresholdHours(teamMedianHours: number | null): number
```

- In `getPrCycleTimeDashboard`, build stale details from open PRs for each team:
  - use `now - openedAt` in hours;
  - ignore negative ages;
  - stale when `ageHours > staleOpenPrThresholdHours(row.medianHours)`;
  - sort by `ageHours` descending, then repo, then PR number for deterministic ties;
  - use limit `10` when `input.team === row.team`, otherwise `3`;
  - set `count` to all stale PRs for that team;
  - set `prDetails` to the capped details.

- Repository display name should use `owner/repo` when both fields exist, otherwise `repositories.name`.

- In `src/components/dashboard/PrCycleTimeDashboard.tsx`, render `prDetails` only for `long_open_prs`.

- Add CSS in `src/components/dashboard/PrCycleTimeDashboard.css` for compact stale PR rows. Reuse existing exception-card visual language and keep row titles truncatable.

- No new routes, server functions, migrations, config keys, or environment variables.

---

## Tests

- **stale_open_pr_threshold_uses_max_72h_or_team_median** (unit): threshold helper returns the larger of 72 and team median.
- **stale_open_pr_threshold_falls_back_to_72h_without_team_median** (unit): null median threshold is 72h.
- **exceptions_detect_stale_open_prs_with_details** (integration): dashboard emits `long_open_prs` with count, threshold, average age, percent over threshold, and PR details.
- **exceptions_ignore_open_prs_at_or_below_stale_threshold** (integration): PRs with age equal to the threshold are not stale.
- **exceptions_ignore_negative_open_pr_age** (integration): bad future opened-at rows do not become stale details.
- **stale_open_pr_details_are_json_serializable** (unit): detail output survives JSON round-trip with required fields intact.
- **exceptions_stale_pr_details_sorted_and_capped_all_teams** (integration): all-teams mode returns oldest 3 details while count includes all stale PRs.
- **exceptions_stale_pr_details_expanded_for_team_filter** (integration): team-filtered mode returns oldest 10 details for the selected team.
- **exceptions_suppress_long_open_prs_without_stale_prs** (integration): open PRs below threshold do not emit `long_open_prs`.
- **exceptions_do_not_expose_people_fields** (integration): stale detail objects contain only PR number, title, repo, URL, and age.
- **dashboard_renders_stale_open_pr_details** (component): PR Cycle Time exceptions card renders detail rows with links and ages.
- **dashboard_renders_stale_open_pr_summary_without_details** (component): legacy/summary payload still renders without crashing.
- **dashboard_renders_expanded_team_filtered_stale_details** (component): component renders 10 supplied stale details in selected-team mode without a new section.
- **dashboard_stale_open_pr_title_truncates_long_text** (component): long title row remains structurally bounded.
- **team_filter_shows_expanded_stale_open_pr_details** (e2e): selecting a team shows more stale PR detail rows than all-teams mode.
- **all_teams_stale_open_pr_details_remain_compact** (e2e): all-teams mode preserves the first-dashboard-viewport intent.
- **stale_open_pr_details_mobile_layout** (e2e): mobile viewport keeps stale PR detail rows readable without overlap.
- **docs_fix005_links_are_valid** (unit/docs): docs link checks include FIX-005 and its mockup.

---

## Documentation update

- [x] `Documentation/Backlog/FIX-005-stale-open-pr-exceptions.md`, section: all, path: `Documentation/Backlog/FIX-005-stale-open-pr-exceptions.md`
- [x] `Documentation/Backlog/stale-open-pr-exceptions-brief.md`, section: status, path: `Documentation/Backlog/stale-open-pr-exceptions-brief.md`
- [x] `Documentation/Roadmap/trackable-roadmap.md`, section: Current Next Step / pre-Phase-04 refinements, path: `Documentation/Roadmap/trackable-roadmap.md`
- [x] `Documentation/README.md`, section: Next Step, path: `Documentation/README.md`

---

## Task breakdown

### Phase 0 — Scheduling Gate
> **Releasable**: when Task 0.2 is complete, FIX-005 is explicitly scheduled as a pre-Phase-04 refinement and implementation may begin without conflicting with the active Phase 04 roadmap.

#### Task 0.1 — Register FIX-005 before implementation
- [x] **File**: `Documentation/Roadmap/trackable-roadmap.md`
- **Depends on**: nothing
- **Description**:
  - Add FIX-005 as a scheduled pre-Phase-04 dashboard refinement before any payload, UI, or E2E implementation task begins.
  - Link this implementation plan and the brief.
  - Preserve Phase 04 as the next feature phase after this focused refinement.
  - Do not mark FIX-005 complete until implementation and verification are done.
- **Releasable**: after this task, the roadmap explicitly permits this polish item before Jira Flow Metrics work.
- **Tests (TDD)** — `tests/docs/docs-links.test.ts`:
  - Unit: `docs_fix005_roadmap_links_are_valid` — roadmap links to the brief and plan.
  - Checkpoint: `npm run test -- tests/docs/docs-links.test.ts`

#### Task 0.2 — Update brief status and README next-step note
- [x] **File**: `Documentation/Backlog/stale-open-pr-exceptions-brief.md`, `Documentation/README.md`
- **Depends on**: Task 0.1
- **Description**:
  - Update brief status from `Proposed` to `Planned`.
  - Add a short README note that FIX-005 is the scheduled pre-Phase-04 refinement.
  - Keep wording clear that Phase 04 remains the next feature phase after this focused refinement.
  - Do not update current mockup references unless the mockup becomes the new active UI reference.
- **Releasable**: after this task, docs reflect the scheduling decision without confusing Phase 04 ownership.
- **Tests (TDD)** — `tests/docs/docs-links.test.ts`:
  - Unit: `docs_fix005_brief_and_mockup_links_are_valid` — brief, plan, and mockup links resolve.
  - Checkpoint: `npm run test -- tests/docs/docs-links.test.ts`

### Phase 1 — Payload Contract And Stale Detection
> **Releasable**: when Task 1.4 is complete, the dashboard payload can identify and describe stale open PRs without UI changes.

#### Task 1.1 — Stale open PR types and threshold helper
- [x] **File**: `src/metrics/pr-cycle-time-dashboard.ts`
- **Depends on**: Task 0.2
- **Description**:
  - Add exported type:
    - `StaleOpenPrDetail = { prNumber: number; title: string; repo: string; url: string; ageHours: number }`
  - Extend `PrCycleTimeException` with:
    - `staleThresholdHours?: number`
    - `percentOverStaleThreshold?: number`
    - `prDetails?: StaleOpenPrDetail[]`
  - Add constants:
    - `STALE_OPEN_PR_MIN_HOURS = 72`
    - `STALE_OPEN_PR_DETAIL_LIMIT = 3`
    - `STALE_OPEN_PR_TEAM_FILTER_DETAIL_LIMIT = 10`
  - Add exported helper:
    - `function staleOpenPrThresholdHours(teamMedianHours: number | null): number`
  - Helper returns `72` when median is `null`, `NaN`, or `<= 0`; otherwise returns `Math.max(72, teamMedianHours)`.
  - Do not change runtime exception generation in this task.
- **Releasable**: after this task, stale threshold rules are encoded and unit-testable.
- **Tests (TDD)** — `tests/metrics/pr-cycle-time-dashboard.test.ts`:
  - Unit: `stale_open_pr_threshold_uses_max_72h_or_team_median` — median `24` returns `72`; median `120` returns `120`.
  - Unit: `stale_open_pr_threshold_falls_back_to_72h_without_team_median` — null, zero, and negative medians return `72`.
  - Checkpoint: `npm run test -- tests/metrics/pr-cycle-time-dashboard.test.ts`

#### Task 1.2 — Stale open PR detail selection
- [x] **File**: `src/metrics/pr-cycle-time-dashboard.ts`
- **Depends on**: Task 1.1
- **Description**:
  - Add exported helper:
    - `function repoDisplayName(repo: typeof repositories.$inferSelect): string`
    - returns `owner/repo` when both are present, otherwise `repo.name`.
  - Add exported helper:
    - `function buildStaleOpenPrDetails(input: { prs: PullRequestRecord[]; repoById: Map<string, typeof repositories.$inferSelect>; team: string; now: Date; thresholdHours: number; limit: number }): { count: number; averageAgeHours: number | null; prDetails: StaleOpenPrDetail[] }`
  - Include only PRs where:
    - `state === 'open'`;
    - repository exists in `repoById`;
    - `repoTeamLabel(repo) === team`;
    - `ageHours > thresholdHours`;
    - `ageHours >= 0`.
  - Sort details by `ageHours` descending, then `repo`, then `prNumber`.
  - Return `count` before capping.
  - Return capped `prDetails`.
  - Return `averageAgeHours` over all stale PR ages, not only capped details.
  - Return only numbers and strings in `prDetails`; do not return `Date`, `URL`, class instances, functions, or other non-JSON payload values.
  - Do not wire the helper into exceptions in this task.
- **Releasable**: after this task, stale PR selection is deterministic and isolated.
- **Tests (TDD)** — `tests/metrics/pr-cycle-time-dashboard.test.ts`:
  - Unit: `stale_open_pr_details_sorted_by_age_descending` — details are oldest first.
  - Unit: `stale_open_pr_details_use_repo_full_name_when_available` — repo display uses `owner/repo`.
  - Unit: `stale_open_pr_details_ignore_negative_open_age` — future opened-at PR is ignored.
  - Unit: `stale_open_pr_details_count_all_but_cap_details` — count includes all stale PRs while details obey limit.
  - Unit: `stale_open_pr_details_are_json_serializable` — detail output survives `JSON.stringify` / `JSON.parse` without losing required fields.
  - Checkpoint: `npm run test -- tests/metrics/pr-cycle-time-dashboard.test.ts`

#### Task 1.3 — All-teams stale open PR exception payload
- [x] **File**: `src/metrics/pr-cycle-time-dashboard.ts`
- **Depends on**: Task 1.2
- **Description**:
  - Replace the current `long_open_prs` detection that uses `ageH > row.medianHours`.
  - Use `staleOpenPrThresholdHours(row.medianHours)`.
  - In all-teams mode, pass `STALE_OPEN_PR_DETAIL_LIMIT`.
  - Emit `long_open_prs` when stale count is `> 0`, including:
    - `count`;
    - `teamMedianHours: row.medianHours ?? undefined`;
    - `staleThresholdHours`;
    - `averageOpenPrAgeHours`;
    - `percentOverStaleThreshold` computed against `staleThresholdHours`;
    - `prDetails`.
  - Message must describe stale open PRs and the threshold, not only team median.
  - Preserve exception sorting and global cap behavior.
  - Preserve `baseline_pending` and `team_worsened` behavior.
- **Releasable**: after this task, all-teams dashboard payload exposes compact stale PR details.
- **Tests (TDD)** — `tests/metrics/pr-cycle-time-dashboard.test.ts`:
  - Integration: `exceptions_detect_stale_open_prs_with_details` — emits count, threshold, details, average age, and percent over stale threshold.
  - Integration: `exceptions_ignore_open_prs_at_or_below_stale_threshold` — exactly-threshold PR does not emit.
  - Integration: `exceptions_stale_pr_details_sorted_and_capped_all_teams` — all-teams mode caps at 3 while count is larger.
  - Integration: `exceptions_do_not_expose_people_fields` — detail object keys are exactly `prNumber`, `title`, `repo`, `url`, `ageHours`.
  - Integration: `exceptions_existing_worsened_and_baseline_behavior_is_unchanged` — regression guard for other exception types.
  - Checkpoint: `npm run test -- tests/metrics/pr-cycle-time-dashboard.test.ts`

#### Task 1.4 — Team-filtered stale open PR expansion
- [x] **File**: `src/metrics/pr-cycle-time-dashboard.ts`
- **Depends on**: Task 1.3
- **Description**:
  - When `input.team === row.team`, pass `STALE_OPEN_PR_TEAM_FILTER_DETAIL_LIMIT`.
  - Preserve the existing server-side team-filter behavior for medians, trend, weekly trend, team rows, First Review, and PR Size.
  - Keep global exception cap at 3, but the selected team's `long_open_prs` detail list may contain up to 10 rows.
  - If `input.team` does not match a known team and the dashboard falls back to all metrics repos, do not apply the 10-row detail cap to unrelated teams.
- **Releasable**: after this task, selected-team payloads expose expanded stale PR details.
- **Tests (TDD)** — `tests/metrics/pr-cycle-time-dashboard.test.ts`:
  - Integration: `exceptions_stale_pr_details_expanded_for_team_filter` — `team: 'Alpha'` returns up to 10 details for Alpha.
  - Integration: `exceptions_team_filter_does_not_expand_other_teams` — unknown team filter fallback does not expand unrelated details to 10.
  - Integration: `team_filter_preserves_existing_median_and_weekly_trend_scope` — existing team-filter behavior remains scoped.
  - Checkpoint: `npm run test -- tests/metrics/pr-cycle-time-dashboard.test.ts`

### Phase 2 — Exception Card Rendering
> **Releasable**: when Task 2.3 is complete, users can see stale open PR details in the PR Cycle Time exceptions card.

#### Task 2.1 — Stale open PR detail UI rendering
- [x] **File**: `src/components/dashboard/PrCycleTimeDashboard.tsx`
- **Depends on**: Task 1.3
- **Description**:
  - Change `exceptionTitle` for `long_open_prs` to `{team} stale open PRs`.
  - Change `exceptionMetric` for `long_open_prs` to use `staleThresholdHours` when present:
    - `{count} PR(s) older than {formatted threshold}`.
  - Keep fallback rendering for legacy payloads without `staleThresholdHours`.
  - Change `exceptionRecommendation` for `long_open_prs` to:
    - `Unblock, split, or close stale work before it inflates cycle time.`
  - Render `e.prDetails` under the recommendation only for `long_open_prs`.
  - Each row renders:
    - link text `#{prNumber} {title}` when `url` is non-empty;
    - plain text when `url` is empty;
    - repo as secondary text;
    - age as right-side `{duration} open`.
  - Do not render author, assignee, or reviewer data.
  - Preserve `team_worsened` and `baseline_pending` rendering.
- **Releasable**: after this task, component markup can display stale PR detail rows.
- **Tests (TDD)** — `tests/components/pr-cycle-time-dashboard.test.tsx`:
  - Unit: `dashboard_renders_stale_open_pr_details` — rows render PR number, title, repo, link, and age.
  - Unit: `dashboard_renders_stale_open_pr_summary_without_details` — legacy summary payload still renders.
  - Unit: `dashboard_stale_open_pr_details_do_not_render_people_fields` — author/reviewer/assignee strings are absent.
  - Unit: `dashboard_existing_worsened_and_baseline_exceptions_still_render` — regression for existing types.
  - Checkpoint: `npm run test -- tests/components/pr-cycle-time-dashboard.test.tsx`

#### Task 2.2 — Stale open PR detail styling
- [x] **File**: `src/components/dashboard/PrCycleTimeDashboard.css`
- **Depends on**: Task 2.1
- **Description**:
  - Add classes:
    - `.pr-dashboard__stale-pr-details`
    - `.pr-dashboard__stale-pr-row`
    - `.pr-dashboard__stale-pr-main`
    - `.pr-dashboard__stale-pr-title`
    - `.pr-dashboard__stale-pr-repo`
    - `.pr-dashboard__stale-pr-age`
  - Use existing card border colors, warning tones, and the current dashboard card radius token.
  - Make title text truncatable with `min-width: 0`, `overflow: hidden`, `text-overflow: ellipsis`, and `white-space: nowrap`.
  - On narrow viewports, allow rows to wrap age below the title only if needed to avoid overlap.
  - Keep the all-teams 3-row layout compact enough to preserve the existing first-dashboard-viewport intent from the brief.
  - Do not introduce decorative gradients or new page sections.
- **Releasable**: after this task, stale PR rows are visually integrated with the dashboard.
- **Tests (TDD)** — `tests/components/pr-cycle-time-dashboard.test.tsx`:
  - Unit: `dashboard_stale_open_pr_title_truncates_long_text` — rendered title row has truncation class.
  - Unit: `dashboard_renders_expanded_team_filtered_stale_details` — 10 detail rows render without a new metric section.
  - Checkpoint: `npm run test -- tests/components/pr-cycle-time-dashboard.test.tsx`

#### Task 2.3 — Exception-card copy and accessibility
- [x] **File**: `src/components/dashboard/PrCycleTimeDashboard.tsx`
- **Depends on**: Task 2.2
- **Description**:
  - Update the PR cycle time exceptions `CardHowToRead` copy to mention stale open PRs crossing the attention threshold.
  - Add accessible text for each stale detail row that includes PR number, repo, and age.
  - Ensure links have discernible text and do not rely on age badge alone.
  - Preserve the card's existing heading and list semantics.
- **Releasable**: after this task, the exception card communicates the new stale open PR behavior accessibly.
- **Tests (TDD)** — `tests/components/pr-cycle-time-dashboard.test.tsx`:
  - Unit: `dashboard_exception_help_mentions_stale_open_pr_threshold` — copy names stale open PR threshold.
  - Unit: `dashboard_stale_open_pr_links_have_discernible_names` — PR links are queryable by role/name.
  - Checkpoint: `npm run test -- tests/components/pr-cycle-time-dashboard.test.tsx`

### Phase 3 — End-To-End Coverage And Verification Wiring
> **Releasable**: when Task 3.3 is complete, the feature is covered by focused browser and release-gate checks.

#### Task 3.1 — E2E stale open PR fixture and all-teams flow
- [x] **File**: `tests/e2e/stale-open-pr-exceptions.spec.ts`
- **Depends on**: Task 2.3
- **Description**:
  - Add a deterministic E2E fixture that seeds:
    - at least one team with current median below 72h;
    - at least 4 stale open PRs;
    - at least one open PR at or below threshold;
    - no author-level expectations.
  - Test all-teams mode renders the PR Cycle Time exceptions card with exactly 3 visible stale detail rows for that team.
  - Assert total count remains greater than visible rows.
  - Assert the Team Breakdown `Longest Open PR` column remains visible.
  - Assert the 3-row all-teams detail list stays compact enough to preserve the first-dashboard-viewport intent.
- **Releasable**: after this task, the default dashboard stale detail flow is covered in a browser.
- **Tests (TDD)** — `tests/e2e/stale-open-pr-exceptions.spec.ts`:
  - E2E: `all_teams_shows_three_stale_open_pr_details` — all-teams mode shows 3 details and preserves count.
  - E2E: `all_teams_stale_open_pr_details_remain_compact` — all-teams mode preserves the first-dashboard-viewport intent.
  - Checkpoint: `npm run test:e2e -- tests/e2e/stale-open-pr-exceptions.spec.ts`

#### Task 3.2 — E2E team-filter expansion and mobile layout
- [x] **File**: `tests/e2e/stale-open-pr-exceptions.spec.ts`
- **Depends on**: Task 3.1
- **Description**:
  - Extend the fixture to include at least 11 stale PRs for one selected team.
  - Select the team through the existing `Filter by team` combobox.
  - Assert the selected-team view shows 10 stale PR detail rows.
  - Assert no new metric section or page navigation appears.
  - Assert all-teams mode keeps the stale detail list compact enough to preserve the first-dashboard-viewport intent.
  - Run the stale exception card at desktop and mobile viewport sizes.
  - Use DOM bounding-box assertions to ensure visible stale detail title, repo, and age text do not overlap incoherently.
- **Releasable**: after this task, expanded selected-team behavior and mobile readability are browser-verified.
- **Tests (TDD)** — `tests/e2e/stale-open-pr-exceptions.spec.ts`:
  - E2E: `team_filter_shows_ten_stale_open_pr_details` — selected team shows 10 detail rows.
  - E2E: `stale_open_pr_details_mobile_layout` — mobile viewport keeps detail row text non-overlapping.
  - Checkpoint: `npm run test:e2e -- tests/e2e/stale-open-pr-exceptions.spec.ts`

#### Task 3.3 — FIX-005 verification script
- [x] **File**: `tests/scripts/verify-fix005.test.ts`, `package.json`
- **Depends on**: Task 3.2
- **Description**:
  - Add script:
    - `"verify:fix005": "git diff --check && npm run lint && npm run typecheck && npm run test -- tests/metrics/pr-cycle-time-dashboard.test.ts tests/components/pr-cycle-time-dashboard.test.tsx && npm run test:e2e -- tests/e2e/stale-open-pr-exceptions.spec.ts && npm run verify:phase01 && npm run verify:phase02 && npm run verify:phase03"`
  - Keep script focused on this feature plus regression gates.
  - Do not remove existing verify scripts.
- **Releasable**: after this task, maintainers have a single verification command for FIX-005.
- **Tests (TDD)** — `tests/scripts/verify-fix005.test.ts`, `package.json`:
  - Unit: `verify_fix005_script_exists` — assert the `verify:fix005` script is defined and includes the focused metric, component, E2E, and phase regression gates.
  - Checkpoint: `npm run verify:fix005`

### Phase 4 — Final Verification
> **Releasable**: after this phase, FIX-005 can be marked complete and moved to `Documentation/Completed/` with its brief if the team chooses to ship it.

#### Task 4.1 — Final verification and completion notes
- [x] **File**: `Documentation/Backlog/FIX-005-stale-open-pr-exceptions.md`
- **Depends on**: Task 3.3
- **Description**:
  - Run:
    - `npm run verify:fix005`
  - Review desktop and mobile E2E artifacts for stale PR detail readability.
  - Mark acceptance criteria complete only after verification passes.
  - If shipped, move this plan and the brief to `Documentation/Completed/` in the completion commit and repair links.
  - Record any intentional follow-up in `Future Iterations`, not as an open first-implementation question.
- **Releasable**: after this task, FIX-005 is verified and ready for completion bookkeeping.
- **Tests (TDD)** — `Documentation/Backlog/FIX-005-stale-open-pr-exceptions.md`:
  - Checkpoint: `npm run verify:fix005`
