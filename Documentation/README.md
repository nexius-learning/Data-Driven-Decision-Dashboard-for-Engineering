# Data Driven Decision Dashboard Documentation

This directory contains the product brief, roadmap, phase plan, setup guides, and mockups for the Data Driven Decision Dashboard.

## Start Here

- [Feature brief](Backlog/data-driven-decision-dashboard-brief.md)
- [Roadmap](Roadmap/data-driven-decision-dashboard-roadmap.md)
- [Trackable roadmap checklist](Roadmap/trackable-roadmap.md)
- [Current one-page mockup](Assets/mockups/05-pr-cycle-time-first-review-and-pr-size.png)

## For users (running the product locally)

The app is a **local** web application. After [installing Node.js](https://nodejs.org/) (20 or newer), from the **repository root** (one level above this folder):

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env`, set **`DATABASE_URL`**, and follow [Local onboarding](Setup/local-onboarding.md) for Postgres and optional GitHub sync.
3. Start the UI: `npm run dev`
4. Open **http://localhost:3000** in a browser.

The home route renders a **one-page scrolling dashboard**. PR Cycle Time stays first, and each later metric is appended below the previous metric section once its data is collected and computed. Run the phase-specific verify command before release-style checks.

## For developers

- **[Developer guide](Development/README.md)** — stack, `npm` scripts, tests, and where code lives.
- **[Local onboarding](Setup/local-onboarding.md)** — Postgres, env vars, team mapping, and first real sync checklist.
- **[Scripts and CLI commands](Setup/scripts.md)** — `dev-up` / `dev-down`, migrations, `collector:refresh`, and `db:import-github`.
- **[GitHub token setup](Setup/github-token.md)** — authenticated GitHub API access.

Implementation work and task-level tests are tracked in **[FEAT-001 — PR Cycle Time MVP](Completed/FEAT-001-pr-cycle-time-mvp-implementation-plan.md)** (task list and test names).

## Current MVP

The first release shows one metric only: PR Cycle Time.

![PR Cycle Time first increment](Assets/mockups/03-pr-cycle-time-first-increment.png)

## Next Step

Phase 03 (PR Size) is implemented, including the PR Size trend confidence update (FIX-002): completed-week trend values are shown separately from current-week-so-far and low-sample confidence notes (see [FEAT-003-pr-size-implementation-plan.md](Backlog/FEAT-003-pr-size-implementation-plan.md)).

The explicitly scheduled [FIX-004 dashboard stabilization gate](Backlog/FIX-004-remaining-dashboard-16-week-trend-expansion.md) is complete, guided by its [authoritative brief](Backlog/remaining-dashboard-16-week-trend-expansion-brief.md). Phase 04 remains the next feature phase: [Phase 04: Jira Flow Metrics](Backlog/phase-04-jira-flow-metrics.md).

Current one-page UI reference:

![PR Cycle Time, First Review, and PR Size](Assets/mockups/05-pr-cycle-time-first-review-and-pr-size.png)

Completed phases:

- [Phase 01: PR Cycle Time MVP](Completed/phase-01-pr-cycle-time-mvp.md) — [FEAT-001](Completed/FEAT-001-pr-cycle-time-mvp-implementation-plan.md)
- [Phase 02: First Review Time](Completed/phase-02-first-review-time.md) — [FEAT-002](Completed/FEAT-002-first-review-time-implementation-plan.md)
- [Phase 03: PR Size](Backlog/phase-03-pr-size.md) — [FEAT-003](Backlog/FEAT-003-pr-size-implementation-plan.md)

Track progress in [Trackable roadmap checklist](Roadmap/trackable-roadmap.md).
