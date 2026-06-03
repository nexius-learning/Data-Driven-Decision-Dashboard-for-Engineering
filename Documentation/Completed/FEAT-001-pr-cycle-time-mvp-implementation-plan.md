# FEAT-001 — PR Cycle Time MVP
**Purpose**: Build the first local-first dashboard release with one trusted metric: PR Cycle Time.
**Audience**: Head of Engineering, future implementation agents, and engineers maintaining the dashboard.
**Status**: To Do

---

## Background

The Data Driven Decision Dashboard is a local-first engineering metrics product. The first release must ship quickly and avoid fake breadth. The only metric in scope is PR Cycle Time, measured from pull request opened time to merged time.

The dashboard must use cloned repositories under `/Users/manczg/Documents/work/development`, but local Git history alone does not reliably contain PR opened and merged lifecycle metadata. V1 therefore uses local repo discovery plus minimal GitHub metadata sync for PR lifecycle fields.

Current phase brief: [phase-01-pr-cycle-time-mvp.md](phase-01-pr-cycle-time-mvp.md)

Current UI reference: [PR Cycle Time first increment](../Assets/mockups/03-pr-cycle-time-first-increment.png)

---

## Goal

When this plan is complete, the user can run the app locally, refresh PR metadata for the configured repositories, and see a dashboard with exactly one metric: median PR Cycle Time for the last 8 weeks, previous-period trend when available, PR Cycle Time exceptions, team breakdown, and data freshness.

---

## Scope

### In Scope

- TanStack Start React app scaffold.
- Local **PostgreSQL** database (runs on the same machine as the app) using Drizzle schema and migrations.
- Local repository discovery from `/Users/manczg/Documents/work/development`.
- Repository-to-team mapping config.
- Minimal GitHub PR metadata sync for PR opened and merged timestamps.
- PR Cycle Time calculations.
- Dashboard UI that shows only PR Cycle Time.
- Tests first for each behavior.
- Documentation and roadmap checklist updates.

### Out of Scope

- Jira sync and Jira metrics, because Phase 01 only covers PR Cycle Time.
- AI recommendations, because deterministic rules are enough for the first release.
- First Review Time, because it is Phase 02.
- PR Size, because it is Phase 03.
- Cloud deployment, auth, and Supabase, because the MVP must work locally first.
- Individual engineer ranking, because the dashboard is for team-level leadership decisions.

---

## Acceptance criteria

- [ ] The app can be started locally.
- [ ] The database schema can be created from migrations.
- [ ] The collector discovers Git repositories under `/Users/manczg/Documents/work/development`.
- [ ] Only repositories whose `origin` GitHub owner matches `GITHUB_SYNC_OWNER` are synced and included in metrics.
- [ ] Repository scan status is stored locally.
- [ ] Repository-to-team mapping is read from config.
- [ ] GitHub PR metadata sync stores PR opened and merged timestamps.
- [ ] PR Cycle Time is computed per merged PR.
- [ ] Median PR Cycle Time is computed for the selected range.
- [ ] Previous-period comparison is computed when enough data exists.
- [ ] PR Cycle Time exceptions are computed deterministically.
- [ ] Dashboard renders exactly one metric card.
- [ ] Dashboard shows PR Cycle Time exceptions only.
- [ ] Dashboard shows 8-week PR Cycle Time trend.
- [ ] Dashboard shows team breakdown for PR Cycle Time only.
- [ ] Dashboard shows data freshness and sync errors.
- [ ] Empty states are explicit: no merged PRs, baseline pending, no repos, sync failed.
- [ ] No future metric placeholders are visible.
- [ ] Trackable roadmap checklist links to this implementation plan.

### Acceptance-to-test traceability

| Acceptance criterion | Task(s) | Primary test(s) / verification |
| --- | --- | --- |
| The app can be started locally. | 1.1, 7.1, 7.3 | `renders_app_title`, `dashboard_e2e_local_dev_server_starts`, `dashboard_e2e_local_refresh_flow`, `npm run build` |
| The database schema can be created from migrations. | 2.2, 2.3 | `db_migrations_create_schema`, `schema_timestamps_use_timestamptz`, migration duplicate constraint tests |
| The collector discovers Git repositories under `/Users/manczg/Documents/work/development`. | 3.1, 3.2 | `repo_discovery_finds_git_repositories`, `repo_discovery_ignores_non_repositories` |
| Only repositories whose `origin` owner matches `GITHUB_SYNC_OWNER` are synced and included in metrics. | 2.1, 3.4, 4.3 | `env_github_sync_owner_is_case_insensitive_default`, `repository_store_marks_wrong_github_owner_excluded`, `repository_store_respects_org_include_and_exclude_together`, `refresh_skips_wrong_github_owner_repositories` |
| Repository scan status is stored locally. | 3.4 | `repository_store_marks_metadata_incomplete`, `repository_store_marks_missing_repos_inactive`, `repository_store_only_marks_missing_within_scan_root` |
| Repository-to-team mapping is read from config. | 3.3, 3.4 | `team_mapping_loads_valid_config`, `repository_store_assigns_team` |
| GitHub PR metadata sync stores PR opened and merged timestamps. | 4.1, 4.2, 4.3 | `github_client_lists_prs`, `github_client_handles_pagination`, `pr_sync_stores_pr_metadata` |
| PR Cycle Time is computed per merged PR. | 5.1 | `cycle_time_calculates_hours`, `cycle_time_skips_unmerged_prs` |
| Median PR Cycle Time is computed for the selected range. | 5.2, 5.3 | `median_cycle_time_handles_odd_count`, `dashboard_returns_single_metric_contract` |
| Previous-period comparison is computed when enough data exists. | 5.2, 5.3 | `dashboard_computes_previous_period_trend`, `dashboard_baseline_pending_with_insufficient_previous_prs`, `dashboard_isolates_previous_period_boundaries` |
| PR Cycle Time exceptions are computed deterministically. | 5.3 | `exceptions_detect_worsening_team`, `exceptions_team_worsened_not_emitted_when_baseline_pending`, `exceptions_detect_long_open_prs`, `exceptions_include_baseline_pending`, `exceptions_sort_order_is_deterministic` |
| Dashboard renders exactly one metric card. | 6.2, 7.1 | `dashboard_renders_single_metric`, `dashboard_does_not_show_future_metrics` |
| Dashboard shows PR Cycle Time exceptions only. | 6.2 | `dashboard_renders_pr_cycle_time_exceptions_only` |
| Dashboard shows 8-week PR Cycle Time trend. | 5.2, 6.2 | `weekly_trend_includes_empty_weeks`, `dashboard_renders_8_week_trend_with_empty_weeks` |
| Dashboard shows team breakdown for PR Cycle Time only. | 5.3, 6.2 | `dashboard_renders_team_breakdown`, `dashboard_renders_unassigned_team`, `dashboard_team_breakdown_reports_longest_open_pr_hours` |
| Dashboard shows data freshness and sync errors. | 4.3, 5.3, 6.2 | `refresh_records_sync_run_status`, `refresh_status_success_when_zero_ready_repos`, `dashboard_shows_data_freshness`, `dashboard_freshness_reports_repos_scanned_count`, `dashboard_shows_persisted_sync_failed_state` |
| Empty states are explicit: no merged PRs, baseline pending, no repos, sync failed. | 5.3, 6.2, 6.3 | `dashboard_empty_state_no_merged_prs`, `dashboard_shows_baseline_pending`, `dashboard_empty_state_no_repos`, `dashboard_shows_persisted_sync_failed_state`, `route_shows_refresh_error` |
| No future metric placeholders are visible. | 6.2, 7.1 | `dashboard_does_not_show_future_metrics`, `dashboard_e2e_local_refresh_flow` |
| Trackable roadmap checklist links to this implementation plan. | 7.3 | `docs_trackable_roadmap_links_plan` |

---

## What does NOT change

- Existing roadmap phase documents remain the product source of truth.
- Superseded mockups remain saved as design history.
- Future phases stay unimplemented.
- The app must not collect Jira data in Phase 01.
- The app must not show individual contributor performance metrics.

---

## Known limitations / accepted trade-offs

- GitHub metadata sync is required because Git clones do not contain reliable PR opened/merged lifecycle data.
- Manual refresh is enough for v1; scheduled background sync is deferred.
- Team mapping starts as local config to avoid needing org/team API integration.
- Cloud deployment is intentionally deferred because local filesystem access is central to v1.
- PostgreSQL is the Phase 01 datastore; moving to managed Postgres (RDS, Supabase, Neon, etc.) is a configuration and ops change, not a metric rewrite—review connection pooling and migrations before production.
- Draft PRs are included in PR Cycle Time for Phase 01 because the metric is elapsed time from PR opened to PR merged; draft-specific analysis can be added later.
- Bots are included in Phase 01 unless excluded by repository selection config; individual author analytics are out of scope.
- `12 PRs missing Jira key` style freshness is implemented as PR title hygiene only; it must not call Jira in Phase 01.

---

## Implementation defaults locked for Phase 01

- Framework: TanStack Start, React, TypeScript.
- Package manager: npm.
- Test runner: Vitest for unit/component/integration tests, Playwright for e2e tests.
- Database library: Drizzle ORM targeting **PostgreSQL** (local instance).
- GitHub sync: GitHub REST API, not GraphQL and not `gh` CLI.
- GitHub auth: `GITHUB_TOKEN` environment variable first; unauthenticated mode may work for public repos but must surface rate/auth errors.
- GitHub sync concurrency: default `2`, configured by `GITHUB_SYNC_CONCURRENCY`.
- Team and repository selection config: checked-in example file at `config/team-mapping.example.json`; runtime default path is `./config/team-mapping.json`.
- Repo discovery rule: scan immediate child directories of `/Users/manczg/Documents/work/development` that contain `.git`; no recursive nested repo discovery in Phase 01.
- Repo sync inclusion rule: include discovered repositories whose parsed `origin` GitHub **owner** matches `GITHUB_SYNC_OWNER` (default `gde-mit`, case-insensitive), then match `includeRepoPatterns` and do not match `excludeRepoPatterns` in team mapping config. If `includeRepoPatterns` is omitted, include all discovered repositories that pass the org filter by default. **Precedence:** if the **repository name used for pattern matching** (`candidate.repo ?? candidate.name`, see Task 3.3) matches both an include and an exclude pattern, **exclude wins** (treat as not included for sync). Repositories with a parseable remote whose owner does not match, or repositories excluded by team mapping config, are stored with `scanStatus: excluded` and are not synced or included in metrics. Repositories with `scanStatus: metadata_incomplete` are not synced and do not contribute PRs to metrics (they may still appear in discovery counts).
- **PostgreSQL concurrency:** the database server handles concurrent writers; repository PR syncs may upsert in parallel up to `GITHUB_SYNC_CONCURRENCY` as long as each sync uses its own transaction boundaries and errors are isolated per repository. Tune concurrency primarily for **GitHub API rate limits**, not for local DB locking.
- Initial PR sync cutoff: fresh databases fetch PRs updated on or after `DASHBOARD_INITIAL_SYNC_FROM`; default is January 1 of the current calendar year in the local runtime timezone.
- Date range: default `Last 8 weeks`; current range is `[now - 8 weeks, now]`; previous range is the immediately preceding 8 weeks.
- Time-dependent metric functions accept an explicit `now` or `clock` input in tests and server functions so range boundaries are deterministic.
- Timezone: use local runtime timezone for display and ISO UTC timestamps for storage.
- Metric range filtering uses `mergedAt` for merged PR metrics and weekly trend buckets. Open PR age exceptions use `openedAt` plus `now`.
- Current range includes PRs with `mergedAt >= range.from` and `mergedAt <= range.to`; previous range includes `mergedAt >= previous.from` and `mergedAt < range.from`; future `mergedAt > range.to` is excluded.
- Weekly trend contains exactly 8 consecutive 7-day buckets for the default range. Bucket `weekStart` is the local-date ISO string for the bucket start; empty buckets return `medianHours: null`.
- Repositories missing from the latest scan are marked inactive and excluded from dashboard metric calculations until rediscovered.
- Exception thresholds:
  - `team_worsened`: current team median is at least 25% worse than previous period **and** that team’s previous-period baseline is **available** (same conditions as trend: at least 3 merged PRs in the previous period and previous median `> 0`). Do not emit when baseline is pending.
  - `long_open_prs`: among **active** repositories mapped to the team, there exists an **open** PR (`state === 'open'`) with age `now - openedAt` strictly greater than the team’s **current-period** merged-PR median hours; suppress when the team’s current median is `null`. (PRs opened before the current range are still evaluated—very old open work can legitimately trigger this.)
  - `baseline_pending`: team has current-range merged PRs but fewer than 3 merged PRs in the previous period.
  - Previous-period trend is available only when previous-period merged PR count is at least 3 and previous median is greater than 0; otherwise `trendPercent` is `null` and baseline is pending.
- Exception **severity** (for UI sort order): `team_worsened` → `warning`; `long_open_prs` → `warning`; `baseline_pending` → `info`. When limiting to 3 exceptions, sort **descending** by severity (`warning` before `info`). Within the same severity, sort **descending** by absolute `trendPercent`, **treating null `trendPercent` as less than any numeric value** (so `long_open_prs`/`baseline_pending` without a trend sort after `team_worsened`). When `trendPercent` ties, sort **alphabetically** by `team` name for stable ordering.

---

## Architecture

- App framework: TanStack Start with React and TypeScript.
- Database: Drizzle ORM with PostgreSQL schema and migrations.
- Collector: shared Node/TypeScript library with a CLI wrapper. The web runtime may call the library locally; the CLI exists for manual refresh and tests.
- UI data access: server functions read computed dashboard data from the local database.
- Source repo root: `/Users/manczg/Documents/work/development`.

### Modules

- `src/config/env.ts`
  - `getEnv(): AppEnv`
  - `getDashboardDateRanges(now: Date, weeks: number): DashboardDateRanges`
  - Reads runtime config and applies defaults.

- `src/config/team-mapping.ts`
  - `loadTeamMapping(path?: string): Promise<TeamMappingConfig>`
  - Reads repo-to-team mapping.

- `src/db/schema.ts`
  - Drizzle table definitions.

- `src/db/client.ts`
  - `createDb(databaseUrl?: string): AppDb`
  - Opens the local database.

- `src/collector/repo-discovery.ts`
  - `discoverRepositories(rootPath: string): Promise<RepositoryCandidate[]>`
  - Finds directories with `.git`.

- `src/collector/github-remote.ts`
  - `parseGitHubRemote(remoteUrl: string): { owner: string; repo: string } | null`
  - Normalizes supported GitHub remote URL forms.

- `src/collector/repository-store.ts`
  - `upsertRepositories(db: AppDb, rootPath: string, repositories: RepositoryCandidate[], mapping: TeamMappingConfig, githubSyncOwner: string): Promise<RepositorySyncSummary>`
  - Persists discovered repositories and scan status.

- `src/collector/github-client.ts`
  - `GitHubClient`
  - `GitHubClient.listPullRequests(input: { owner: string; repo: string; state: 'all'; initialSyncFrom?: Date; stopAfterUpdatedAt?: Date }): Promise<GitHubPullRequest[]>`
  - Fetches PR opened/merged metadata from GitHub.

- `src/collector/pull-request-store.ts`
  - `upsertPullRequests(db: AppDb, repositoryId: string, prs: GitHubPullRequest[]): Promise<PullRequestSyncSummary>`
  - Stores PR lifecycle metadata and reports invalid lifecycle rows.

- `src/collector/refresh.ts`
  - `refreshLocalData(input?: Partial<AppEnv>): Promise<RefreshSummary>`
  - Orchestrates local discovery, persistence, and PR sync.

- `src/metrics/pr-cycle-time.ts`
  - `calculatePrCycleTime(pr: PullRequestRecord): PrCycleTimeResult | null`

- `src/metrics/pr-cycle-time-summary.ts`
  - `median(values: number[]): number | null`
  - `getWeeklyMedianTrend(prs: PullRequestRecord[], range: DateRange): WeeklyMedianPoint[]`
  - `comparePeriods(input: { currentMedian: number | null; previousMedian: number | null; previousMergedPrCount: number }): { trendPercent: number | null; baselineStatus: 'available' | 'pending' }`

- `src/metrics/pr-cycle-time-dashboard.ts`
  - `getPrCycleTimeDashboard(input: PrCycleTimeDashboardInput): Promise<PrCycleTimeDashboard>`

- `src/routes/index.tsx`
  - Renders the dashboard from server-function data.

- `src/server/dashboard-functions.ts`
  - `getDashboardData`
  - `refreshLocalDataFn`

- `src/components/dashboard/PrCycleTimeDashboard.tsx`
  - Renders the single-metric PR Cycle Time dashboard.

### Config

- `DASHBOARD_REPO_ROOT`: string, default `/Users/manczg/Documents/work/development`.
- `DATABASE_URL`: string, PostgreSQL connection URI (see `.env.example` for shape). **No real credentials in the repo**—each developer copies `.env.example` to `.env` and substitutes values.
- `TEAM_MAPPING_PATH`: string, default `./config/team-mapping.json`.
- `GITHUB_TOKEN`: string, optional for authenticated GitHub API calls.
- `GITHUB_API_BASE_URL`: string, default `https://api.github.com`.
- `DASHBOARD_DEFAULT_RANGE_WEEKS`: number, default `8`.
- `DASHBOARD_INITIAL_SYNC_FROM`: ISO date string, optional; default is current-year January 1 in local timezone.
- `GITHUB_SYNC_CONCURRENCY`: positive integer, default `2`.
- `GITHUB_SYNC_OWNER`: string, default `gde-mit`. This is the GitHub **owner slug** from `GET /repos/{owner}/{repo}` (an organization or a user account), compared case-insensitively to the parsed `origin` owner. The name ends in `_OWNER` because GitHub’s field is `owner`, not because it must be a user.

### Core Types

```ts
export type AppEnv = {
  repoRoot: string
  databaseUrl: string
  teamMappingPath: string
  githubToken?: string
  githubApiBaseUrl: string
  defaultRangeWeeks: number
  initialSyncFrom: Date
  githubSyncConcurrency: number
  githubSyncOwner: string
}

export type AppDb = unknown

export type RepositoryCandidate = {
  name: string
  path: string
  rootPath: string
  remoteUrl: string | null
  owner: string | null
  repo: string | null
}

export type RepositorySyncSummary = {
  scanned: number
  ready: number
  metadataIncomplete: number
  excluded: number
  missing: number
  remoteIdentityChanges: number
}

export type GitHubPullRequest = {
  nodeId: string
  number: number
  title: string
  state: 'open' | 'closed' | 'merged'
  isDraft: boolean
  openedAt: Date
  updatedAt: Date
  mergedAt: Date | null
  url: string
}

export type PullRequestRecord = {
  id: string
  repositoryId: string
  githubNodeId: string
  number: number
  title: string
  state: 'open' | 'closed' | 'merged'
  isDraft: boolean
  openedAt: Date
  githubUpdatedAt: Date
  mergedAt: Date | null
  url: string
  missingJiraKey: boolean
}

export type PullRequestSyncSummary = {
  seen: number
  merged: number
  open: number
  missingJiraKey: number
  invalidLifecycle: number
}

export type PrCycleTimeResult = {
  /** Same value as `PullRequestRecord.id`. */
  pullRequestId: string
  cycleTimeHours: number
}

export type DateRange = {
  from: Date
  to: Date
  weeks: number
}

export type DashboardDateRanges = {
  current: DateRange
  previous: DateRange
}

export type WeeklyMedianPoint = {
  weekStart: string
  medianHours: number | null
}

export type PrCycleTimeException = {
  type: 'team_worsened' | 'long_open_prs' | 'baseline_pending'
  severity: 'warning' | 'info'
  team: string
  message: string
}

export type PrCycleTimeDashboardInput = {
  db: AppDb
  weeks?: number
  now?: Date
}

export type PrCycleTimeDashboard = {
  range: { from: string; to: string; weeks: number }
  metric: {
    medianHours: number | null
    mergedPrCount: number
    trendPercent: number | null
    baselineStatus: 'available' | 'pending'
  }
  exceptions: PrCycleTimeException[]
  weeklyTrend: Array<{ weekStart: string; medianHours: number | null }>
  teamBreakdown: Array<{
    team: string
    mergedPrs: number
    medianHours: number | null
    trendPercent: number | null
    longestOpenPrHours: number | null
  }>
  freshness: {
    reposScanned: number
    prMetadataSyncedAt: string | null
    prsMissingJiraKey: number
    syncErrors: number
    latestSyncStatus: 'success' | 'partial' | 'failed' | 'never_run'
  }
}

export type RefreshSummary = {
  reposScanned: number
  reposIncluded: number
  reposExcluded: number
  prsSeen: number
  prsMerged: number
  prsMissingJiraKey: number
  syncErrors: number
  syncWarnings: number
  status: 'success' | 'partial' | 'failed'
}
```

### Data Flow

1. User clicks `Refresh`.
2. Server function calls the shared local collector library.
3. Collector discovers immediate child git repositories and reads each `origin` URL (owner/repo parsing happens here as part of discovery output).
4. Collector upserts repository rows (applies `GITHUB_SYNC_OWNER`, team mapping include/exclude, assigns `scanStatus` / team).
5. Collector syncs PR metadata **only** for repositories in `ready` status, writing PR rows and sync metadata to **PostgreSQL**.
6. Dashboard server function reads computed PR Cycle Time data.
7. React UI renders only the available PR Cycle Time metric.

### Documentation References

- TanStack Start server functions: https://tanstack.com/start/latest/docs/framework/react/guide/server-functions
- Drizzle PostgreSQL setup: https://orm.drizzle.team/docs/get-started-postgresql
- Drizzle migrations: https://orm.drizzle.team/docs/migrations
- GitHub pull requests API: https://docs.github.com/en/rest/pulls/pulls

---

## Test highlights

The task breakdown below is the authoritative test list. This section highlights the main coverage areas.

- **env_defaults_are_loaded** (unit): verifies default local paths and range values; `DATABASE_URL` must be supplied by test harness.
- **env_rejects_missing_database_url** (unit): rejects absent `DATABASE_URL` for real `getEnv` calls.
- **env_rejects_invalid_database_url** (unit): rejects malformed database URIs.
- **env_rejects_invalid_range** (unit): rejects non-positive range weeks.
- **team_mapping_loads_valid_config** (unit): maps repo patterns to team names.
- **team_mapping_rejects_invalid_config** (unit): rejects missing teams or invalid patterns.
- **repo_discovery_finds_git_repositories** (unit): discovers only directories containing `.git`.
- **repo_discovery_parses_github_remote** (unit): extracts owner and repo from SSH and HTTPS GitHub remotes.
- **repository_store_respects_org_include_and_exclude_together** (integration): org allow-list interacts correctly with include/exclude patterns.
- **env_github_sync_owner_is_case_insensitive_default** (unit): owner comparison is case-insensitive.
- **repo_discovery_records_unparseable_remote** (unit): keeps repo with null owner/repo and marks metadata incomplete.
- **db_migrations_create_schema** (integration): applies migrations to a **disposable PostgreSQL database** (e.g. Docker ephemeral instance, testcontainers, or a dedicated `*_test` database wiped between runs).
- **schema_timestamps_use_timestamptz** (unit): PR/repository instants use `timestamptz`.
- **repository_upsert_is_idempotent** (integration): repeat scans update existing repos rather than duplicating.
- **github_client_lists_prs** (unit): fetches PR lifecycle data from mocked GitHub responses.
- **github_client_handles_rate_limit** (unit): returns structured sync error on rate limit.
- **pr_sync_stores_pr_metadata** (integration): stores opened and merged timestamps.
- **cycle_time_skips_unmerged_prs** (unit): open PRs do not contribute to median cycle time.
- **cycle_time_calculates_hours** (unit): merged PR cycle time is opened-to-merged hours.
- **median_cycle_time_handles_even_and_odd_counts** (unit): median is correct for both count shapes.
- **dashboard_baseline_pending_without_previous_data** (unit): trend is absent when baseline is unavailable.
- **dashboard_computes_previous_period_trend** (unit): trend percentage is correct.
- **exceptions_detect_worsening_team** (unit): worsening team exception is emitted.
- **exceptions_sort_order_is_deterministic** (unit): exception ordering matches locked tie-break rules.
- **dashboard_server_function_returns_serializable_data** (integration): dashboard data can cross server-function boundary.
- **refresh_server_function_runs_collector** (integration): refresh updates sync status.
- **dashboard_renders_single_metric** (component): UI shows only PR Cycle Time card.
- **dashboard_empty_state_no_merged_prs** (component): empty state renders instead of zero days.
- **dashboard_e2e_local_refresh_flow** (e2e): local page loads, refresh completes, dashboard updates.

---

## Documentation update

- [ ] Phase 01 plan link, section: `Implementation Plan`, path: `Documentation/Roadmap/phases/phase-01-pr-cycle-time-mvp.md`
- [ ] Trackable roadmap link, section: `Phase 01: PR Cycle Time MVP`, path: `Documentation/Roadmap/trackable-roadmap.md`
- [ ] README status, section: `Next Step`, path: `Documentation/README.md`

---

## Task breakdown

### Per-task execution rule

- Every task follows TDD: add or update the named tests before implementation.
- From Task 1.2 onward, every implementation task checkpoint includes the focused test command listed for that task and `npm run test -- --coverage` before the task can be committed.
- Docs-only tasks run their listed docs tests and do not need coverage unless they touch source code.
- If a task adds or changes scripts, lint, typecheck, build, or e2e behavior, its checkpoint must run the affected command before commit.

### Phase 1 — Project scaffold and test harness
> **Releasable**: after this phase, the project can run tests and display a blank local app shell.

#### Task 1.1 — TanStack Start app scaffold
- [x] **File**: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `tests/setup.ts`, `src/routes/index.tsx`
- **Depends on**: nothing
- **Description**:
  - Initialize a TanStack Start React TypeScript app.
  - Add scripts:
    - `dev`: starts local dev server.
    - `build`: builds the app.
    - `test`: runs unit/component tests.
    - `test:e2e`: runs Playwright tests.
    - `lint`: runs lint checks without warnings.
    - `typecheck`: runs TypeScript checks without warnings.
  - Defer `db:generate`, `db:migrate`, and `collector:refresh` scripts until their backing files exist in Tasks 2.3 and 4.3.
  - Configure the minimum Vitest + React Testing Library setup needed for the app-shell component test.
  - `src/routes/index.tsx` renders a minimal page title: `Engineering Decision Dashboard`.
  - No dashboard metrics yet.
- **Releasable**: after this task, the app shell can run locally.
- **Tests (TDD)** — `tests/app/app-shell.test.tsx`:
  - Component: `renders_app_title` — renders `Engineering Decision Dashboard`.
  - Checkpoint: `npm run test -- tests/app/app-shell.test.tsx`

#### Task 1.2 — Test setup hardening
- [x] **File**: `playwright.config.ts`
- **Depends on**: Task 1.1
- **Description**:
  - Configure Playwright for local e2e tests.
  - Ensure DOM matchers are loaded by the existing Vitest setup.
  - Add coverage configuration with an 85% minimum threshold.
  - Tests must run without network access by default.
- **Releasable**: after this task, unit/component/e2e test commands are available.
- **Tests (TDD)** — `tests/setup/smoke.test.ts`:
  - Unit: `test_vitest_setup_works` — verifies a basic assertion.
  - Component: `test_react_testing_library_setup_works` — renders a trivial component.
  - Unit: `test_coverage_threshold_configured` — verifies 85% coverage threshold config.
  - Checkpoint: `npm run test -- tests/setup/smoke.test.ts`

### Phase 2 — Configuration and database foundation
> **Releasable**: after this phase, the app can create and access a local **PostgreSQL** database via Drizzle. **Testing note:** integration tests in later phases assume a disposable Postgres reachable via `DATABASE_URL` (see **Automated tests and CI** in `Documentation/Setup/local-onboarding.md`).

#### Task 2.1 — Environment config loader
- [x] **File**: `src/config/env.ts`
- **Depends on**: Task 1.2
- **Description**:
  - Add `AppEnv` type.
  - Add `getEnv(source?: NodeJS.ProcessEnv): AppEnv`.
  - Add `getDashboardDateRanges(now: Date, weeks: number): DashboardDateRanges`.
  - Defaults (paths and tuning; **database credentials always come from `.env`**, never hard-coded):
    - `DASHBOARD_REPO_ROOT=/Users/manczg/Documents/work/development`
    - `DATABASE_URL` **must be supplied** via environment for real runs and integration tests (shape: `postgresql://USER:PASSWORD@HOST:PORT/DBNAME`; copy from `.env.example` and replace placeholders).
    - `TEAM_MAPPING_PATH=./config/team-mapping.json`
    - `GITHUB_API_BASE_URL=https://api.github.com`
    - `DASHBOARD_DEFAULT_RANGE_WEEKS=8`
    - `DASHBOARD_INITIAL_SYNC_FROM=<current-year>-01-01`
    - `GITHUB_SYNC_CONCURRENCY=2`
    - `GITHUB_SYNC_OWNER=gde-mit`
  - `GITHUB_TOKEN` is optional.
  - Throw `ConfigError` when `DASHBOARD_DEFAULT_RANGE_WEEKS` is not a positive integer.
  - Throw `ConfigError` when `DASHBOARD_INITIAL_SYNC_FROM` is not a valid ISO date.
  - Throw `ConfigError` when `GITHUB_SYNC_CONCURRENCY` is not a positive integer.
  - Throw `ConfigError` when `GITHUB_SYNC_OWNER` is empty or whitespace-only after trim.
  - Throw `ConfigError` when `DATABASE_URL` is missing, not a `postgresql://` or `postgres://` URI, or otherwise unparsable for the chosen driver.
  - `getEnv` returns validated configuration only; `getDashboardDateRanges` derives current and previous ranges from a provided `now`.
  - **Range boundaries:** `current.from` is `now - weeks * 7 days` truncated to **start of local calendar day**; `current.to` is `now` truncated to **end of local calendar day** (inclusive instants after truncation). `previous.from`/`previous.to` are the same-length window immediately before `current`, with **`previous.to` equal to the end of the local calendar day immediately before `current.from`**. PR filtering for the previous window still uses **`mergedAt < current.from`** (and `mergedAt >= previous.from`) as in the locked defaults; do **not** substitute `mergedAt <= previous.to` unless you prove equivalence to that half-open boundary.
- **Releasable**: after this task, every module can read validated runtime config.
- **Tests (TDD)** — `tests/config/env.test.ts`:
  - Unit: `env_defaults_are_loaded` — verifies non-secret defaults; **`DATABASE_URL` must be injected in test env** (not asserted as a committed default).
  - Unit: `env_reads_overrides` — verifies custom env values.
  - Unit: `env_rejects_invalid_range` — rejects `0`, negative, and non-number values.
  - Unit: `env_defaults_initial_sync_from_to_current_year_start` — default starts at current-year January 1.
  - Unit: `env_rejects_invalid_initial_sync_from` — rejects malformed dates.
  - Unit: `env_rejects_invalid_github_sync_concurrency` — rejects zero, negative, and non-number values.
  - Unit: `env_rejects_empty_github_sync_owner` — rejects empty `GITHUB_SYNC_OWNER`.
  - Unit: `env_rejects_missing_database_url` — rejects absent `DATABASE_URL` for non-test `getEnv`.
  - Unit: `env_rejects_invalid_database_url` — rejects non-`postgresql://` / non-`postgres://` URIs when strict validation is enabled.

#### Task 2.2 — Database schema
- [x] **File**: `src/db/schema.ts`
- **Depends on**: Task 2.1
- **Description**:
  - Define Drizzle **PostgreSQL** tables:
    - `repositories`: `id`, `name`, `path`, `rootPath`, `remoteUrl`, `owner`, `repo`, `remoteIdentity`, `team`, `scanStatus`, `active`, `lastScannedAt`, `lastPrSyncedAt`, `createdAt`, `updatedAt`.
    - `pullRequests`: `id`, `repositoryId`, `githubNodeId`, `number`, `title`, `state`, `isDraft`, `openedAt`, `githubUpdatedAt`, `mergedAt`, `url`, `missingJiraKey`, `createdAt`, `updatedAt`.
    - `syncRuns`: `id`, `kind`, `status`, `startedAt`, `finishedAt`, `message`, `errorCount`. Use `kind = 'collector_refresh'` for rows created by `refreshLocalData` (one row per refresh invocation unless subdivided later).
    - `syncErrors`: `id`, `syncRunId`, `repositoryId`, `source`, `message`, `createdAt`.
  - Use `timestamptz` (or Drizzle’s `timestamp` mapped to `timestamptz`) for all stored instants so timezone rules stay consistent with GitHub UTC timestamps.
  - `repositories.scanStatus` supports `ready`, `metadata_incomplete`, `excluded`, and `missing`.
  - `repositories.active` is false when a previously stored repository is missing from the latest scan.
  - `repositories.rootPath` scopes missing-repository detection to the configured scan root.
  - `repositories.remoteIdentity` is `${owner}/${repo}` when owner/repo are available, otherwise `null`.
  - `repositories.lastPrSyncedAt` stores the maximum `githubUpdatedAt` actually persisted for that repository, not sync wall-clock time.
  - Add unique constraints for repository path and pull request repository/number.
- **Releasable**: after this task, schema definitions are available for migration generation.
- **Tests (TDD)** — `tests/db/schema.test.ts`:
  - Unit: `schema_exports_required_tables` — verifies all table objects exist.
  - Unit: `schema_defines_unique_repository_path` — verifies repository path uniqueness metadata.
  - Unit: `schema_timestamps_use_timestamptz` — migration-generated columns for PR and repository instants use `timestamptz` (not plain `timestamp` without time zone).

#### Task 2.3 — Database client and migrations
- [x] **File**: `src/db/client.ts`, `drizzle.config.ts`, `drizzle/0000_initial.sql`
- **Depends on**: Task 2.2
- **Description**:
  - Add `createDb(databaseUrl?: string): AppDb`.
  - Add `runMigrations(databaseUrl?: string): Promise<void>` if migration execution is not handled only by CLI.
  - Use Drizzle with the **`postgres.js` driver** (Phase 01 default; matches Drizzle Postgres docs).
  - Document local Postgres bootstrap in `Documentation/Setup/local-onboarding.md` (create database role + database, set `DATABASE_URL`); do not commit secrets or production connection strings.
  - Migration creates all Phase 01 tables.
- **Releasable**: after this task, a local database can be initialized.
- **Tests (TDD)** — `tests/db/migrations.test.ts`:
  - Integration: `db_migrations_create_schema` — applies migrations to a temporary **PostgreSQL** database and verifies tables.
  - Integration: `db_client_executes_query` — runs a basic select.
  - Integration: `db_constraints_reject_duplicate_repository_path` — verifies migration-level uniqueness.
  - Integration: `db_constraints_reject_duplicate_pr_number_per_repository` — verifies migration-level uniqueness.
  - Checkpoint: `npm run test -- tests/db/migrations.test.ts`

### Phase 3 — Repository discovery and team mapping
> **Releasable**: after this phase, the collector can scan local repositories and persist their team assignment.

#### Task 3.1 — GitHub remote parser
- [x] **File**: `src/collector/github-remote.ts`
- **Depends on**: Task 1.2
- **Description**:
  - Add `parseGitHubRemote(remoteUrl: string): { owner: string; repo: string } | null`.
  - Support SSH remotes such as `git@github.com-gde:nexius-learning/repo-name.git`.
  - Support standard SSH remotes such as `git@github.com:owner/repo.git`.
  - Support HTTPS remotes such as `https://github.com/owner/repo.git`.
  - Strip trailing `.git`.
  - Return `null` for non-GitHub or malformed remotes.
- **Releasable**: after this task, repository discovery can normalize GitHub owner/repo values.
- **Tests (TDD)** — `tests/collector/github-remote.test.ts`:
  - Unit: `parses_standard_ssh_remote` — parses `git@github.com:owner/repo.git`.
  - Unit: `parses_ssh_host_alias_remote` — parses `git@github.com-gde:nexius-learning/repo.git`.
  - Unit: `parses_https_remote` — parses HTTPS URL.
  - Unit: `returns_null_for_non_github_remote` — returns null safely.
  - Checkpoint: `npm run test -- tests/collector/github-remote.test.ts`

#### Task 3.2 — Repository discovery
- [x] **File**: `src/collector/repo-discovery.ts`, `src/collector/git-remote-url.ts`
- **Depends on**: Task 3.1
- **Description**:
  - Add `discoverRepositories(rootPath: string): Promise<RepositoryCandidate[]>`.
  - Scan only immediate child directories of `rootPath`.
  - A repository is a directory containing `.git`.
  - Read `origin` remote with `git -C <path> remote get-url origin`.
  - If remote command fails, keep repository with `remoteUrl: null`, `owner: null`, `repo: null`.
  - Do not mutate repositories and do not run `git pull` in Phase 01.
- **Releasable**: after this task, the collector can list local cloned repos.
- **Tests (TDD)** — `tests/collector/repo-discovery.test.ts`:
  - Unit: `repo_discovery_finds_git_repositories` — finds directories containing `.git`.
  - Unit: `repo_discovery_ignores_non_repositories` — ignores folders without `.git`.
  - Unit: `repo_discovery_records_unparseable_remote` — keeps repo with null owner/repo.
  - Unit: `repo_discovery_does_not_mutate_repos` — verifies no pull/fetch command is called.
  - Checkpoint: `npm run test -- tests/collector/repo-discovery.test.ts`

#### Task 3.3 — Team mapping config
- [x] **File**: `src/config/team-mapping.ts`, `config/team-mapping.example.json`
- **Depends on**: Task 3.2
- **Description**:
  - Add `TeamMappingConfig` type with `teams: Array<{ name: string; repoPatterns: string[] }>`, optional `defaultTeam`, optional `includeRepoPatterns`, and optional `excludeRepoPatterns`.
  - Add `loadTeamMapping(path?: string): Promise<TeamMappingConfig>`.
  - Add `resolveTeamForRepo(repoName: string, config: TeamMappingConfig): string`.
  - Add `shouldSyncRepo(repoName: string, config: TeamMappingConfig): boolean`.
  - **`repoName` contract:** both `resolveTeamForRepo` and `shouldSyncRepo` receive the **same** canonical string as persistence: `candidate.repo ?? candidate.name` (GitHub repo name when `owner`/`repo` parse; otherwise local folder name).
  - Pattern matching supports exact name and `*` **only** as a single leading wildcard (`*-suffix`) or trailing wildcard (`prefix-*`); no mid-string `*` in Phase 01 unless explicitly added later. **Exception:** the literal pattern `*` alone in `includeRepoPatterns` means “match all repository names” (same effect as omitting includes).
  - `shouldSyncRepo` returns true when `includeRepoPatterns` is omitted or matched, and false when `excludeRepoPatterns` matches (**exclude overrides include** when both match).
  - If no mapping matches, return `defaultTeam` or `Unassigned`.
  - Checked-in `config/team-mapping.example.json` stays a generic placeholder (`Frontend`, `Backend`, `Platform`, `Data`, `Unassigned`). Real team names and `repoPatterns` live in local `config/team-mapping.json` (gitignored).
- **Releasable**: after this task, discovered repositories can be assigned to teams.
- **Tests (TDD)** — `tests/config/team-mapping.test.ts`:
  - Unit: `team_mapping_loads_valid_config` — loads valid JSON.
  - Unit: `team_mapping_rejects_invalid_config` — rejects empty teams and invalid patterns.
  - Unit: `resolve_team_exact_match` — exact repo name match.
  - Unit: `resolve_team_wildcard_match` — wildcard repo pattern match.
  - Unit: `resolve_team_falls_back_to_unassigned` — fallback behavior.
  - Unit: `should_sync_repo_defaults_to_include` — omitted include list includes discovered repos.
  - Unit: `should_sync_repo_respects_include_patterns` — only matching repos sync when includes exist.
  - Unit: `should_sync_repo_respects_exclude_patterns` — excludes override includes.
  - Unit: `should_sync_repo_exclude_overrides_include_when_both_match` — same repo name matches include and exclude patterns.
  - Unit: `team_mapping_rejects_invalid_patterns` — rejects empty pattern strings and patterns containing more than one `*`.
  - Checkpoint: `npm run test -- tests/config/team-mapping.test.ts`

#### Task 3.4 — Repository persistence
- [x] **File**: `src/collector/repository-store.ts`
- **Depends on**: Task 3.3
- **Description**:
  - Add `upsertRepositories(db: AppDb, rootPath: string, repositories: RepositoryCandidate[], mapping: TeamMappingConfig, githubSyncOwner: string): Promise<RepositorySyncSummary>`.
  - Upsert by repository path.
  - Store `rootPath` on every repository row.
  - Compute `remoteIdentity` from parsed `owner/repo`.
  - Store scan status:
    - `ready` when owner/repo are available, the owner matches `GITHUB_SYNC_OWNER` (case-insensitive), and team mapping does not exclude the repo.
    - `metadata_incomplete` when remote cannot be parsed.
    - `excluded` when repository selection config excludes the repo from sync and metrics, **or** when owner/repo are available but the parsed owner does not match `GITHUB_SYNC_OWNER`.
  - Update `lastScannedAt` on every scan.
  - Mark previously stored repositories under the provided `rootPath` as `scanStatus: "missing"` and `active: false` when they are absent from the latest scan.
  - Never mark repositories from a different `rootPath` missing.
  - Reactivate a missing repository when it appears in a later scan.
  - If the same `path` is rediscovered with a different `remoteIdentity`, keep the repository row, clear existing PR rows for that repository, reset `lastPrSyncedAt`, and increment `remoteIdentityChanges` so refresh can record a sync warning.
  - Return counts: `scanned`, `ready`, `metadataIncomplete`, `excluded`, `missing`, `remoteIdentityChanges`.
- **Releasable**: after this task, repository discovery results are durable.
- **Tests (TDD)** — `tests/collector/repository-store.test.ts`:
  - Integration: `repository_upsert_is_idempotent` — repeated upsert does not duplicate rows.
  - Integration: `repository_store_assigns_team` — applies team mapping.
  - Integration: `repository_store_prefers_canonical_github_repo_name_for_team_mapping` — remote repo name beats mismatched local folder name when available.
  - Integration: `repository_store_marks_metadata_incomplete` — stores incomplete status.
  - Integration: `repository_store_marks_excluded_repos` — excluded repos are not active metric inputs.
  - Integration: `repository_store_marks_wrong_github_owner_excluded` — parseable `origin` whose owner is not `GITHUB_SYNC_OWNER` is `excluded` and not synced.
  - Integration: `repository_store_respects_org_include_and_exclude_together` — owner matches `GITHUB_SYNC_OWNER` but include/exclude mapping still yields correct `ready` vs `excluded`.
  - Integration: `repository_store_marks_missing_repos_inactive` — stale repos are excluded from active dashboard inputs.
  - Integration: `repository_store_only_marks_missing_within_scan_root` — roots are isolated.
  - Integration: `repository_store_reactivates_rediscovered_repo` — rediscovered repos become active again.
  - Integration: `repository_store_resets_pr_sync_on_remote_identity_change` — same path with different owner/repo cannot keep old PR rows.
  - Checkpoint: `npm run test -- tests/collector/repository-store.test.ts`

### Phase 4 — GitHub PR metadata sync
> **Releasable**: after this phase, the local database contains PR opened and merged timestamps.

#### Task 4.1 — GitHub API client
- [x] **File**: `src/collector/github-client.ts`
- **Depends on**: Task 3.4
- **Description**:
  - Add `GitHubClient` class.
  - Constructor: `new GitHubClient(options: { token?: string; baseUrl: string; fetchImpl?: typeof fetch })`.
  - Add `listPullRequests(input: { owner: string; repo: string; state: 'all'; initialSyncFrom?: Date; stopAfterUpdatedAt?: Date }): Promise<GitHubPullRequest[]>`.
  - Fetch PRs from GitHub REST API `GET /repos/{owner}/{repo}/pulls` using `state=all`, `sort=updated`, `direction=desc`, and `per_page=100`.
  - Phase 01 does a full paginated PR metadata sync when a repository has no `lastPrSyncedAt`.
  - Fresh-database sync stops after pages where every PR has `updatedAt < initialSyncFrom`.
  - Always process and upsert PRs where `updatedAt >= initialSyncFrom`; older PRs are ignored until the config cutoff is moved earlier.
  - Subsequent refreshes page by `updated` descending and stop after a page where every PR has `updatedAt < stopAfterUpdatedAt`.
  - Always process and upsert PRs where `updatedAt === stopAfterUpdatedAt`; idempotent upsert is the tie-break that prevents equal-timestamp skips.
  - Range filtering happens locally from stored timestamps.
  - Normalize fields: node id, number, title, state, draft flag, openedAt, updatedAt, mergedAt, html URL.
  - Handle pagination.
  - On rate limit or auth failure, throw `GitHubSyncError` with `code`, `message`, and `retryAfterSeconds?: number`.
- **Releasable**: after this task, PR lifecycle metadata can be fetched from GitHub.
- **Tests (TDD)** — `tests/collector/github-client.test.ts`:
  - Unit: `github_client_lists_prs` — normalizes mocked GitHub PR response.
  - Unit: `github_client_handles_pagination` — follows `Link` headers.
  - Unit: `github_client_uses_supported_list_pr_parameters` — asserts no unsupported `since` query parameter is sent.
  - Unit: `github_client_stops_after_known_updated_page` — incremental refresh stops after already-known data.
  - Unit: `github_client_stops_at_initial_sync_cutoff` — fresh DB does not fetch older pages past the configured cutoff.
  - Unit: `github_client_keeps_equal_updated_at_boundary_prs` — equal cursor timestamps are still returned for idempotent upsert.
  - Unit: `github_client_handles_rate_limit` — returns structured error.
  - Unit: `github_client_sends_auth_header_when_token_exists` — verifies token header.
  - Checkpoint: `npm run test -- tests/collector/github-client.test.ts`

#### Task 4.2 — Pull request persistence
- [x] **File**: `src/collector/pull-request-store.ts`
- **Depends on**: Task 4.1
- **Description**:
  - Add `upsertPullRequests(db: AppDb, repositoryId: string, prs: GitHubPullRequest[]): Promise<PullRequestSyncSummary>`.
  - Upsert by `repositoryId` and PR number.
  - Convert timestamps to ISO strings.
  - Store `state` as `open`, `closed`, or `merged`.
  - Store `isDraft` but do not exclude draft PRs from Phase 01 metric calculations.
  - Store `githubUpdatedAt`.
  - Reject impossible lifecycle rows where `mergedAt < openedAt`; count them as `invalidLifecycle` and let refresh write `syncErrors`.
  - Set `missingJiraKey` using `/[A-Z][A-Z0-9]+-\d+/` against title.
  - Return counts: `seen`, `merged`, `open`, `missingJiraKey`, `invalidLifecycle`.
- **Releasable**: after this task, synced PR metadata is durable.
- **Tests (TDD)** — `tests/collector/pull-request-store.test.ts`:
  - Integration: `pr_sync_stores_pr_metadata` — stores opened and merged timestamps.
  - Integration: `pr_sync_is_idempotent` — repeat sync updates existing row.
  - Integration: `pr_sync_preserves_closed_unmerged_prs` — closed without `mergedAt` remains non-merged.
  - Integration: `pr_sync_rejects_invalid_lifecycle_timestamps` — impossible timestamps are counted for sync error recording.
  - Unit: `merged_draft_prs_contribute_to_cycle_time` — merged drafts are included.
  - Unit: `open_draft_prs_do_not_contribute_to_cycle_time` — open drafts stay excluded.
  - Unit: `detects_missing_jira_key` — marks title without issue key.
  - Unit: `accepts_jira_key_in_title` — does not mark title with issue key.
  - Checkpoint: `npm run test -- tests/collector/pull-request-store.test.ts`

#### Task 4.3 — Refresh collector orchestration
- [x] **File**: `src/collector/refresh.ts`, `scripts/refresh.ts`
- **Depends on**: Task 4.2
- **Description**:
  - Add `refreshLocalData(input?: Partial<AppEnv>): Promise<RefreshSummary>`.
  - Steps:
    1. Load env.
    2. Load team mapping.
    3. Discover repositories.
    4. Upsert repositories (pass `githubSyncOwner` from env so wrong-org clones are `excluded`).
    5. Sync PR metadata for repositories in `ready` status with owner/repo using at most `GITHUB_SYNC_CONCURRENCY` concurrent repository syncs. Use `lastPrSyncedAt` as the incremental overlap cursor when available; otherwise use `DASHBOARD_INITIAL_SYNC_FROM` as the fresh-database cutoff.
    6. Record `syncRuns`, `syncErrors`, and sync warnings, including invalid lifecycle rows returned by PR persistence and repository remote-identity changes.
    7. Update `lastPrSyncedAt` only after successful repository PR sync, using the maximum persisted `githubUpdatedAt`.
  - Add CLI entry script used by `npm run collector:refresh`.
  - Add the `collector:refresh` npm script now that the backing entry file exists.
  - Continue syncing other repositories when one repo fails.
  - Return counts: `reposScanned`, `reposIncluded`, `reposExcluded`, `prsSeen`, `prsMerged`, `prsMissingJiraKey`, `syncErrors`, `syncWarnings`.
  - **`RefreshSummary.status`**: `failed` if refresh aborts before finishing orchestration **or** every attempted repository PR sync records an error (zero successes). `partial` if at least one repository succeeds and at least one `syncErrors` row is written. `success` if the run completes with **no** `syncErrors` rows. **Vacuous case:** when **zero** repositories are in `ready` status (nothing to sync) but orchestration finished without fatal errors, treat as **`success`** if `syncErrors` is zero, else `failed` if a global failure was recorded.
- **Releasable**: after this task, local refresh can populate the database.
- **Tests (TDD)** — `tests/collector/refresh.test.ts`:
  - Integration: `refresh_discovers_and_syncs_repositories` — end-to-end with temp repos and mocked GitHub.
  - Integration: `refresh_skips_excluded_repositories` — excluded repos are not synced.
  - Integration: `refresh_skips_wrong_github_owner_repositories` — repos whose `origin` owner does not match `GITHUB_SYNC_OWNER` are not synced.
  - Integration: `refresh_uses_initial_sync_from_for_fresh_database` — first sync starts at configured cutoff.
  - Integration: `refresh_respects_github_sync_concurrency` — repository PR sync concurrency is capped.
  - Integration: `refresh_continues_after_repo_error` — records one repo error and continues.
  - Integration: `refresh_records_sync_run_status` — stores success/failure status.
  - Integration: `refresh_records_invalid_lifecycle_sync_error` — impossible PR timestamps are visible as sync errors.
  - Integration: `refresh_updates_last_pr_synced_at_after_success` — incremental cursor advances only on success.
  - Integration: `refresh_uses_max_persisted_github_updated_at_as_cursor` — cursor is not wall-clock sync finish time.
  - Integration: `refresh_records_remote_identity_change_warning` — changed owner/repo for same path is visible as a sync warning.
  - Integration: `refresh_status_success_when_zero_ready_repos` — no PR work still yields `success` when no errors.
  - Checkpoint: `npm run test -- tests/collector/refresh.test.ts`

### Phase 5 — PR Cycle Time calculations
> **Releasable**: after this phase, the app can compute all data required by the MVP dashboard.

#### Task 5.1 — PR Cycle Time primitive
- [x] **File**: `src/metrics/pr-cycle-time.ts`
- **Depends on**: Task 4.3
- **Description**:
  - Add `calculatePrCycleTime(pr: PullRequestRecord): PrCycleTimeResult | null`.
  - Return null when `mergedAt` is null.
  - Return null when `mergedAt < openedAt` (lifecycle anomaly is already counted at sync time).
  - On success, set `pullRequestId` to `pr.id` and `cycleTimeHours` to `(mergedAt - openedAt)` in hours.
- **Releasable**: after this task, a single PR cycle time can be computed.
- **Tests (TDD)** — `tests/metrics/pr-cycle-time.test.ts`:
  - Unit: `cycle_time_calculates_hours` — computes opened-to-merged hours.
  - Unit: `cycle_time_skips_unmerged_prs` — returns null for open PRs.
  - Unit: `cycle_time_skips_negative_duration` — returns null for invalid timestamps.
  - Checkpoint: `npm run test -- tests/metrics/pr-cycle-time.test.ts`

#### Task 5.2 — Median and weekly trend calculations
- [x] **File**: `src/metrics/pr-cycle-time-summary.ts`
- **Depends on**: Task 5.1
- **Description**:
  - Add `median(values: number[]): number | null`.
  - Add `getWeeklyMedianTrend(prs: PullRequestRecord[], range: DateRange): WeeklyMedianPoint[]`.
  - Ignore PRs with `mergedAt == null` when building weekly medians (open PRs are out of scope for this helper).
  - Use merged date to bucket PRs into weeks.
  - Include empty weeks with `medianHours: null`.
  - Generate exactly `range.weeks` 7-day buckets. For the default range this is exactly 8 buckets. **Bucket assignment:** bucket intervals are half-open `[weekStart, weekStart + 7d)` in local time; a merged PR belongs to the bucket whose interval contains `mergedAt` (instant). PRs exactly equal to `weekStart + 7d` fall into the next bucket.
  - Include PRs in the current range when `mergedAt >= range.from` and `mergedAt <= range.to`.
  - Include PRs in the previous range when `mergedAt >= previous.from` and `mergedAt < range.from`.
  - Exclude future PRs where `mergedAt > range.to`.
  - Add `comparePeriods(input: { currentMedian: number | null; previousMedian: number | null; previousMergedPrCount: number }): { trendPercent: number | null; baselineStatus: 'available' | 'pending' }`.
  - Return pending baseline when `previousMergedPrCount < 3`, `previousMedian` is `null`, or `previousMedian` is `0`.
  - Accept an explicit `now` or date range input in all tests that depend on relative time.
- **Releasable**: after this task, metric summary and trend data can be computed.
- **Tests (TDD)** — `tests/metrics/pr-cycle-time-summary.test.ts`:
  - Unit: `median_cycle_time_handles_odd_count` — median for odd array.
  - Unit: `median_cycle_time_handles_even_count` — median for even array.
  - Unit: `weekly_trend_includes_empty_weeks` — null point for empty week.
  - Unit: `weekly_trend_returns_exactly_8_buckets` — default range returns 8 buckets.
  - Unit: `range_filter_includes_current_start_and_end_boundaries` — current boundary behavior.
  - Unit: `range_filter_excludes_future_merged_prs` — future data is ignored.
  - Unit: `dashboard_baseline_pending_without_previous_data` — pending baseline.
  - Unit: `dashboard_baseline_pending_with_insufficient_previous_prs` — fewer than 3 previous PRs is pending.
  - Unit: `dashboard_baseline_pending_with_zero_previous_median` — avoids divide-by-zero trend.
  - Unit: `dashboard_computes_previous_period_trend` — percentage trend.
  - Checkpoint: `npm run test -- tests/metrics/pr-cycle-time-summary.test.ts`

#### Task 5.3 — Team breakdown and exceptions
- [x] **File**: `src/metrics/pr-cycle-time-dashboard.ts`
- **Depends on**: Task 5.2
- **Description**:
  - Add `getPrCycleTimeDashboard(input: PrCycleTimeDashboardInput): Promise<PrCycleTimeDashboard>`.
  - Query active repositories and PRs for the current and previous ranges.
  - Use `mergedAt` for current/previous merged PR metrics and weekly trend buckets.
  - Use `openedAt` and injected `now` for open PR age calculations.
  - Read latest `syncRuns`/`syncErrors` to expose persisted `latestSyncStatus` as `success`, `partial`, `failed`, or `never_run` (use the row with greatest `finishedAt`; ties broken by greatest `id`).
  - Compute overall median, previous trend, weekly trend, and team breakdown.
  - **`freshness.reposScanned`:** count repositories returned in the latest discovery pass for the configured `repoRoot` (all non-`missing` scan statuses), so operators see how many folders were inspected versus how many contribute metrics.
  - **`teamBreakdown.longestOpenPrHours`:** for each team, among **open** PRs (`state === 'open'`) on **active** repositories mapped to that team, compute `max(now - openedAt)` in hours; `null` when there are no open PRs.
  - Compute exceptions (must match locked **Exception thresholds** and **severity** rules above):
    - `team_worsened` only when previous baseline is available (≥3 previous merged PRs and previous median `> 0`) **and** current median regresses by ≥25%.
    - `long_open_prs` per the locked definition (open PR age vs current median; suppress when current median is `null`).
    - `baseline_pending` when the team has current merged PRs but `< 3` merged PRs in the previous window.
  - Limit exceptions to 3 using the locked sort order (severity, then absolute `trendPercent` with nulls last, then team name).
  - Return serializable strings and numbers only.
- **Releasable**: after this task, the dashboard data contract is complete.
- **Tests (TDD)** — `tests/metrics/pr-cycle-time-dashboard.test.ts`:
  - Integration: `dashboard_returns_single_metric_contract` — returns full dashboard object.
  - Integration: `dashboard_filters_current_range_by_merged_at` — excludes older and future merged PRs.
  - Integration: `dashboard_isolates_previous_period_boundaries` — previous range does not overlap current range.
  - Integration: `dashboard_shows_persisted_sync_failed_state` — latest failed sync is visible in dashboard freshness.
  - Unit: `team_breakdown_computes_per_team_medians` — team medians are not copied from the overall median.
  - Unit: `team_breakdown_computes_per_team_previous_trends` — team trends use team-specific previous medians.
  - Unit: `team_breakdown_groups_unassigned_repositories` — unmapped repos appear under `Unassigned`.
  - Unit: `exceptions_detect_worsening_team` — emits worsening exception.
  - Unit: `exceptions_team_worsened_not_emitted_when_baseline_pending` — suppresses worsening when previous baseline is pending.
  - Unit: `exceptions_sort_order_is_deterministic` — severity, `trendPercent` nulls-last, then team name tie-break.
  - Unit: `exceptions_detect_long_open_prs` — emits stale open PR exception.
  - Unit: `exceptions_suppress_long_open_prs_without_team_median` — no null-threshold exception.
  - Unit: `exceptions_include_baseline_pending` — emits baseline pending exception.
  - Unit: `dashboard_excludes_inactive_repositories` — missing repositories do not affect metrics.
  - Unit: `dashboard_freshness_reports_repos_scanned_count` — `freshness.reposScanned` matches latest discovery non-missing rows.
  - Unit: `dashboard_team_breakdown_reports_longest_open_pr_hours` — `longestOpenPrHours` matches max open PR age for the team.
  - Unit: `exceptions_are_limited_to_three` — caps exception list.
  - Checkpoint: `npm run test -- tests/metrics/pr-cycle-time-dashboard.test.ts`

### Phase 6 — Server functions and UI
> **Releasable**: after this phase, the MVP dashboard is usable locally.

#### Task 6.1 — Dashboard server functions
- [x] **File**: `src/server/dashboard-functions.ts`
- **Depends on**: Task 5.3
- **Description**:
  - Add `getDashboardData` using TanStack Start `createServerFn({ method: 'GET' })`.
  - Input: `{ weeks?: number }`.
  - Validate `weeks` as positive integer, default from env.
  - Return `PrCycleTimeDashboard`.
  - Add `refreshLocalDataFn` using `createServerFn({ method: 'POST' })`.
  - `refreshLocalDataFn` invokes collector orchestration and returns `RefreshSummary`.
  - Errors are caught and returned as user-safe messages.
- **Releasable**: after this task, the UI can fetch dashboard data and trigger refresh.
- **Tests (TDD)** — `tests/server/dashboard-functions.test.ts`:
  - Integration: `dashboard_server_function_returns_serializable_data` — fetches dashboard data.
  - Integration: `refresh_server_function_runs_collector` — invokes refresh orchestration.
  - Unit: `dashboard_server_function_rejects_invalid_weeks` — validates input.
  - Checkpoint: `npm run test -- tests/server/dashboard-functions.test.ts`

#### Task 6.2 — Dashboard UI components
- [x] **File**: `src/components/dashboard/PrCycleTimeDashboard.tsx`
- **Depends on**: Task 6.1
- **Description**:
  - Render:
    - Header with title, `Last 8 weeks`, `Local data`, and `Refresh`.
    - One metric card: `Median PR Cycle Time`.
    - Exception panel.
    - 8-week trend chart.
    - Team breakdown table.
    - Data freshness strip.
  - Do not render future KPI cards.
  - Show hours under 48h as hours and 48h+ as days with one decimal place.
  - Empty states:
    - No merged PRs: `No merged PRs in range`.
    - No baseline: `Baseline pending`.
    - No repos: `No repositories discovered`.
    - Sync failed: `Sync failed` when latest persisted sync status is `failed`.
    - Partial sync: show sync error count in data freshness when latest persisted sync status is `partial`.
- **Releasable**: after this task, component-level dashboard UI is complete.
- **Tests (TDD)** — `tests/components/pr-cycle-time-dashboard.test.tsx`:
  - Component: `dashboard_renders_single_metric` — exactly one metric card.
  - Component: `dashboard_empty_state_no_merged_prs` — renders empty state.
  - Component: `dashboard_shows_baseline_pending` — renders missing baseline.
  - Component: `dashboard_empty_state_no_repos` — renders no-repository state separately from no merged PRs.
  - Component: `dashboard_shows_data_freshness` — renders repos/sync/errors.
  - Component: `dashboard_shows_sync_failed_state` — renders persisted failed sync status.
  - Component: `dashboard_renders_8_week_trend_with_empty_weeks` — renders 8 trend points including empty weeks.
  - Component: `dashboard_renders_team_breakdown` — renders team rows, medians, and trends.
  - Component: `dashboard_renders_unassigned_team` — renders unmapped repositories as `Unassigned`.
  - Component: `dashboard_renders_pr_cycle_time_exceptions_only` — no future-metric exceptions.
  - Component: `dashboard_does_not_show_future_metrics` — no WIP, PR Size, First Review cards.
  - Checkpoint: `npm run test -- tests/components/pr-cycle-time-dashboard.test.tsx`

#### Task 6.3 — Route integration
- [x] **File**: `src/routes/index.tsx`
- **Depends on**: Task 6.2
- **Description**:
  - Load dashboard data through `getDashboardData`.
  - Render `PrCycleTimeDashboard`.
  - Refresh button calls `refreshLocalDataFn`, then reloads dashboard data.
  - Loading state: `Refreshing local data`.
  - Error state: user-safe message with retry affordance.
- **Releasable**: after this task, the local dashboard page is usable end to end.
- **Tests (TDD)** — `tests/app/dashboard-route.test.tsx`:
  - Integration: `route_renders_dashboard_data` — route renders loaded data.
  - Integration: `refresh_button_updates_dashboard` — refresh triggers data reload.
  - Integration: `route_shows_refresh_error` — displays safe error.
  - Checkpoint: `npm run test -- tests/app/dashboard-route.test.tsx`

### Phase 7 — End-to-end verification and docs
> **Releasable**: after this phase, Phase 01 is ready to mark complete in the trackable roadmap.

#### Task 7.1 — Local e2e smoke test
- [x] **File**: `tests/e2e/pr-cycle-time-dashboard.spec.ts`
- **Depends on**: Task 6.3
- **Description**:
  - Start the app pointed at a **seeded disposable PostgreSQL database** (same strategies as integration tests: local docker compose service, testcontainers, or a throwaway `*_e2e` database torn down after the run).
  - Configure Playwright `webServer` to start the app with `npm run dev`.
  - Visit dashboard.
  - Verify one metric card is visible.
  - Click refresh with mocked collector or fixture mode.
  - Verify data freshness updates.
  - Verify future metrics are absent.
- **Releasable**: after this task, the MVP user flow is covered by e2e test.
- **Tests (TDD)** — `tests/e2e/pr-cycle-time-dashboard.spec.ts`:
  - E2E: `dashboard_e2e_local_dev_server_starts` — Playwright reaches the local app started by `npm run dev`.
  - E2E: `dashboard_e2e_local_refresh_flow` — full local flow.
  - Checkpoint: `npm run test:e2e -- tests/e2e/pr-cycle-time-dashboard.spec.ts`

#### Task 7.2 — Final verification gate
- [x] **File**: `package.json`, verification docs if needed
- **Depends on**: Task 7.1
- **Description**:
  - Run the complete automated verification gate before marking Phase 01 complete.
  - Required commands:
    - `npm run build`
    - `npm run test -- --coverage`
    - `npm run test:e2e`
  - If lint or typecheck scripts exist, run them too; if they do not exist, add them before completion.
  - Coverage must be at least 85%.
  - Build, test, lint, typecheck, and e2e output must be warning-free.
  - Capture a local screenshot or Playwright artifact and compare it against the current MVP mockup at `Documentation/Assets/mockups/03-pr-cycle-time-first-increment.png`; update docs if intentional UI differences remain.
- **Releasable**: after this task, Phase 01 behavior has passed the final gate but docs are not marked complete yet.
- **Tests (TDD)**:
  - Checkpoint: `npm run build`
  - Checkpoint: `npm run test -- --coverage`
  - Checkpoint: `npm run test:e2e`

#### Task 7.3 — Documentation status update
- [x] **File**: `Documentation/Roadmap/trackable-roadmap.md`, `Documentation/Roadmap/phases/phase-01-pr-cycle-time-mvp.md`, `Documentation/README.md`
- **Depends on**: Task 7.2
- **Description**:
  - Preserve existing links from Phase 01, trackable roadmap, and README to this implementation plan.
  - Mark Phase 01 checklist items done only after Task 7.2 passes.
  - Keep next step pointer on Phase 01 until all Phase 01 acceptance criteria pass.
  - If UI intentionally differs from the mockup, update the phase doc with the reason.
- **Releasable**: after this task, docs describe the implemented state and next action. This task must make a non-empty status/checklist/mockup-alignment change; link-only verification is not enough because links already exist.
- **Tests (TDD)** — `tests/docs/docs-links.test.ts`:
  - Unit: `docs_link_phase_01_plan` — verifies Phase 01 links this plan.
  - Unit: `docs_trackable_roadmap_links_plan` — verifies checklist links this plan.
  - Unit: `docs_readme_links_trackable_roadmap` — verifies README next-step links.
  - Unit: `docs_phase_01_completion_requires_acceptance_criteria` — prevents marking Phase 01 complete before all acceptance criteria are checked.
  - Unit: `docs_record_mockup_alignment_status` — verifies mockup alignment or documented deviation is recorded.
  - Checkpoint: `npm run test -- tests/docs/docs-links.test.ts`
