# Documentation Code Fact Check Report

Date: 2026-06-04

Scope: all Markdown files under `Documentation/`, checked against current code, tests, package scripts, schema, and config. Sub-agents audited one Markdown file at a time where practical; the main pass synthesized cross-document drift and code-backed missing documentation.

Remediation update: the first living-doc fix pass was applied on 2026-06-04 for `Documentation/README.md`, `Documentation/Development/README.md`, `Documentation/Setup/local-onboarding.md`, `Documentation/Setup/scripts.md`, `Documentation/Setup/github-token.md`, `Documentation/Roadmap/data-driven-decision-dashboard-roadmap.md`, `Documentation/Roadmap/trackable-roadmap.md`, `Documentation/Backlog/phase-04-jira-flow-metrics.md`, and `Documentation/Backlog/phase-05-quality-and-cloud-readiness.md`. The findings below are preserved as the original audit trail.

## Executive Summary

The documentation is broadly accurate about the product direction, but several living docs still describe a Phase 01 / PR Cycle Time-only world. Current code has advanced to a three-metric dashboard:

- PR Cycle Time
- First Review Time
- PR Size

The most important updates are in the living docs: `Documentation/README.md`, `Documentation/Roadmap/*`, `Documentation/Setup/*`, `Documentation/Development/README.md`, and the Phase 04/05 backlog docs. Most `Documentation/Completed/*` issues are historical-plan drift: the old phase plans remain useful, but they need clearer "historical baseline" wording and follow-up links to FIX-002, FIX-003, and FIX-004.

## Priority Fixes

### P1 - Living Docs Misstate Current Product State

1. `Documentation/README.md`
   - Line 34 says the first release shows one metric only, under "Current MVP".
   - Current code renders First Review and PR Size after PR Cycle Time in `src/components/dashboard/PrCycleTimeDashboard.tsx`.
   - The current UI reference is already the three-metric mockup at lines 44-46, so the section contradicts itself.
   - Also update line 30: implementation work is no longer tracked only in FEAT-001; FEAT-002, FEAT-003, FIX-002, FIX-003, and FIX-004 matter for current behavior.

2. `Documentation/Backlog/data-driven-decision-dashboard-brief.md`
   - Still frames the product as PR Cycle Time-only and First Review / PR Size as future work.
   - Treat this as the original feature brief or update it to summarize the implemented product through Phase 03.

3. `Documentation/Development/README.md`
   - Lines 6, 12, and 14 still point developers at FEAT-001 / Phase 01 as the main current reference.
   - Line 50 lists only `verify:phase01`; current scripts include `verify:phase02`, `verify:phase03`, and `verify:fix004`.
   - Line 58 says `collector:refresh` syncs PRs; current refresh also syncs reviews and PR sizes.

4. `Documentation/Setup/local-onboarding.md`
   - Lines 8, 18, 22, and 100 still frame setup as Phase 01 / PR Cycle Time MVP.
   - Line 18 says UI-only work may start without `.env`, but the home route now loads DB-backed dashboard data and `getEnv()` requires `DATABASE_URL`.
   - Line 112 says Vitest only reads process `DATABASE_URL`; current Vitest configs load `.env` and isolate DB tests via `TEST_DATABASE_URL` / `dddd_test`.

### P1 - Jira Hygiene Ambiguity

1. `Documentation/Backlog/phase-04-jira-flow-metrics.md`
   - Lines 15 and 37 frame "Missing Jira key hygiene" as Phase 04 work.
   - Current code already implements PR-title-based missing Jira key hygiene via `pull_requests.missing_jira_key`, collector detection, dashboard freshness count, and UI rendering.
   - Phase 04 should distinguish future Jira-backed issue linking from the existing PR-title hygiene signal.

2. `Documentation/Roadmap/trackable-roadmap.md`
   - Line 141 leaves "Compute missing Jira key hygiene" unchecked under Phase 04, but existing PR-title hygiene is implemented.
   - Clarify this as "Compute Jira-backed issue-link hygiene" or "Reconcile existing PR-title hygiene with Jira issue sync."

### P1 - Setup / Ops Docs Drift

1. `Documentation/Setup/scripts.md`
   - Line 29 says `npm run db:up` starts only Postgres. Current script is `docker compose up -d --wait` with no service name, so a local override can also start the app service.
   - Line 31 implies direct `npm run db:migrate` loads `.env`; it does not. `drizzle.config.ts` reads process env. `dev-up.sh` sources `.env`.
   - Line 64 lists `TEST_DATABASE_URL` for `db:import-github`; that script does not read it.
   - Missing: `db:ensure`, `db:generate`, `npm run dev` wrapper behavior, local env guard behavior, and the fact that `collector:refresh` syncs PR metadata, reviews, PR sizes, missing-key counts, sync runs, and errors.

2. `Documentation/Setup/github-token.md`
   - Line 8 frames the token as PR Cycle Time MVP / lifecycle metadata only; current refresh also uses reviews and PR-size paths.
   - Line 37 omits the implemented PR detail endpoint used for PR-size fallback: `GET /repos/{owner}/{repo}/pulls/{pull_number}`.
   - Line 40 lists `GET /repos/{owner}/{repo}`, but current app code does not call that endpoint.
   - Line 46 overstates fetch failure behavior; PR-size git fetch errors are logged/skipped and may produce partial runs rather than a hard collector failure.
   - Missing: `GITHUB_SYNC_OWNER`, `db:import-github` token behavior, full-Docker org repo listing, and live E2E token verification expectations.

### P1 - Phase 05 Cloud / Runtime Planning Drift

`Documentation/Backlog/phase-05-quality-and-cloud-readiness.md`

- Line 20 says to avoid database-specific assumptions, but current implementation is explicitly PostgreSQL-specific: Drizzle `pg-core`, `postgres` driver, and `dialect: 'postgresql'`.
- Line 21 says to keep collector separate from web runtime, but the UI refresh server function can invoke the collector, and the full-Docker app container runs clone/refresh cron plus Vite.
- The doc should reframe this as future separation / portability work, not an already-preserved property.

## Implemented Features Missing Or Under-Documented

- Source/provenance drill-down routes:
  - `/sources/merged-prs`
  - `/sources/repos`
  - `/sources/sync`
  - `/sources/sync-errors`
  - Evidence: `src/metrics/dashboard-source-paths.ts`, `src/routes/sources/*`, `src/routeTree.gen.ts`.

- UI refresh server action:
  - Dashboard refresh is wired through TanStack Start server functions and the local Refresh button, not only CLI refresh.

- FIX-004 trend stabilization:
  - PR Cycle Time and First Review use previous/current comparison trend presentation.
  - PR Size uses 16 completed UTC ISO weeks plus optional detached current-week-so-far marker.
  - `verify:fix004` exists and chains the relevant phase gates.

- Test and environment isolation:
  - Vitest and Playwright fixture paths use `TEST_DATABASE_URL` / `dddd_test` isolation.
  - Normal local commands clear leaked `DASHBOARD_E2E_REFRESH_STUB`.

- Full-Docker workflow:
  - Cron clone / refresh, startup clone, GitHub credential helper, and clone-script hardening are real behavior and only partially documented.

## Completed Docs That Need Historical Labels Or Follow-Up Links

These files are mostly useful as historical artifacts, but current-state wording can mislead future agents.

### Phase / FEAT Plans

- `Documentation/Completed/FEAT-001-pr-cycle-time-mvp-implementation-plan.md`
  - Still says `Status: To Do` and has unchecked acceptance criteria.
  - Uses "Current phase brief" / "Current UI reference" for Phase 01.
  - Embedded `PrCycleTimeDashboard` type omits current fields such as `comparisonWeeklyTrend`, `firstReview`, and `prSize`.

- `Documentation/Completed/FEAT-002-first-review-time-implementation-plan.md`
  - Still says `Status: To Do` and has unchecked acceptance criteria.
  - Contains stale `Documentation/Roadmap/phases/...` paths.
  - Says `Reviewed PRs` / some payload fields were removed, but current UI and types include them.
  - Mentions `FreshnessStrip.tsx`, which is not current.

- `Documentation/Completed/FEAT-003-pr-size-implementation-plan.md`
  - Status only mentions FIX-002, but FIX-004 later changed PR Size trend presentation.
  - Still describes an 8-week size trend and dashboard-range trend depth.
  - Team-breakdown inclusion and payload shape are stale.
  - `verify:phase03` text omits the UTC-boundary test now in `package.json`.

### Phase Docs And Briefs

- `Documentation/Completed/phase-00-product-refinement-and-ui.md`
  - Says `Status: Draft`.
  - Calls PR Cycle Time-only mockup "Current MVP".
  - One-page wording should be scoped to metric sections, because source drill-down routes exist.

- `Documentation/Completed/phase-01-pr-cycle-time-mvp.md`
  - "Current implementation reference" should be "Phase 01 historical implementation reference".
  - Still says 8-week PR Cycle Time trend; current PR Cycle Time trend is a comparison trend by default.

- `Documentation/Completed/phase-02-first-review-time.md`
  - Says `Status: Draft`.
  - Storage/schema claim about denormalized PR columns is wrong; current code uses review tables and `lastReviewSyncedAt`.
  - Describes an 8-week First Review trend; current UI uses comparison trend data.

- `Documentation/Completed/phase-02-first-review-time-brief.md`
  - Says `Reviewed PRs` was dropped; current First Review team table renders it.
  - Says 8-week trend; current chart defaults to 16-point comparison trend.
  - Desktop layout wording is stale.

- `Documentation/Completed/phase-03-pr-size.md`
  - Still says 8-week PR Size trend.
  - Should link FIX-002 and FIX-004 as follow-up behavior changes.

- `Documentation/Completed/phase-03-pr-size-brief.md`
  - Says 8-week trend; current PR Size trend is 16 completed weeks plus optional partial.
  - Says Largest PR is shown in the team table; current UI does not render those columns.
  - Says teams require current size data; current code includes configured ready teams with zero current PRs.
  - Says accept unverified backfill SHA with warning; current code skips candidates when ancestry cannot be verified.

### Fix Briefs / Plans

- `Documentation/Completed/dynamic-duration-trend-chart-brief.md`
  - 8-week/current-weekly-value wording is historical now; duration charts can use comparison series.
  - "shared formatter" future iteration is implemented.

- `Documentation/Completed/FIX-001-dynamic-duration-trend-chart.md`
  - Background says chart currently plots duration as days; should be historical.
  - Some test names no longer exist exactly.

- `Documentation/Completed/FIX-002-pr-size-trend-partial-week-confidence.md`
  - Says `Status: Draft`.
  - 8-week default trend wording is stale after FIX-004.
  - Title / ARIA expectations are stale; current title is `16-week PR Size comparison trend` for default completed-week data.

- `Documentation/Completed/FIX-003-pr-cycle-time-16-week-comparison-trend.md`
  - Acceptance checklist remains unchecked despite `Status: Complete`.
  - Top-level fixed 16-point / 8+8 wording is stale for non-default ranges; implementation now derives depth from `range.weeks`.
  - "First Review unchanged" and "PR Size unchanged" are historical-only after FIX-004.

- `Documentation/Completed/FIX-004-remaining-dashboard-16-week-trend-expansion.md`
  - Core claims are current.
  - Screenshot retention/sign-off claim is stale in this checkout: `test-results/fix004/*.png` is not currently present.
  - Mentions `phase_regression_gates` as a test name, but the real current gate is `verify:fix004`.

## Verification Notes

Read-only checks and sub-agent focused tests included several passing targeted suites, including docs-link tests, component trend tests, and Phase 01 regression tests. Several DB-backed suites could not run because local Postgres on `127.0.0.1:54332` was unavailable during the audit. No product docs were modified by this audit; this report and the `_review` scaffolding are the only new files.

## Suggested Fix Order

1. Fix living docs first:
   - `Documentation/README.md`
   - `Documentation/Development/README.md`
   - `Documentation/Setup/local-onboarding.md`
   - `Documentation/Setup/scripts.md`
   - `Documentation/Setup/github-token.md`
   - `Documentation/Roadmap/data-driven-decision-dashboard-roadmap.md`
   - `Documentation/Roadmap/trackable-roadmap.md`
   - `Documentation/Backlog/phase-04-jira-flow-metrics.md`
   - `Documentation/Backlog/phase-05-quality-and-cloud-readiness.md`

2. Add a short note to old completed docs:
   - "Historical baseline; later behavior changed by FIX-002 / FIX-003 / FIX-004."

3. Then clean status/checklist drift in Completed:
   - Change `Status: To Do` / `Draft` where the file is clearly completed.
   - Either check completed acceptance criteria or add a note that the checklist is original-plan traceability.

4. Finally, update stale embedded API/type snippets or mark them as historical examples.
