# Trackable Roadmap Checklist

Status: Active
Last updated: 2026-05-30

## How To Use This File

This is the execution checklist for humans and LLM agents.

- Work from top to bottom.
- Only one phase should be active at a time.
- Mark an item as complete only when the related behavior is implemented and verified.
- Use the linked phase file as the detailed source of truth for each phase.
- Do not add UI for a metric until its data is collected, stored, and computed.
- Keep the app as a one-page scrolling dashboard. Add each new metric as the next vertical section after the last implemented metric section.
- When implementing from a new mockup, preserve existing sections above it and append the new metric section below; do not create a new page, tab, or first-viewport card cluster unless the roadmap explicitly changes.

## Current Next Step

Scheduled stabilization gate before the next feature phase: **FIX-004: Remaining Dashboard 16-Week Trend Expansion**

FIX-004 plan: [FIX-004-remaining-dashboard-16-week-trend-expansion.md](../Backlog/FIX-004-remaining-dashboard-16-week-trend-expansion.md)

FIX-004 authoritative brief: [remaining-dashboard-16-week-trend-expansion-brief.md](../Backlog/remaining-dashboard-16-week-trend-expansion-brief.md)

Next feature phase: **Phase 04: Jira Flow Metrics**

Phase 04 detailed file: [phase-04-jira-flow-metrics.md](../Backlog/phase-04-jira-flow-metrics.md)

Phase 01 (complete): [phase-01-pr-cycle-time-mvp.md](../Completed/phase-01-pr-cycle-time-mvp.md) — implementation plan [FEAT-001-pr-cycle-time-mvp-implementation-plan.md](../Completed/FEAT-001-pr-cycle-time-mvp-implementation-plan.md).

Phase 02 (implemented): [phase-02-first-review-time.md](../Completed/phase-02-first-review-time.md) — implementation plan [FEAT-002-first-review-time-implementation-plan.md](../Completed/FEAT-002-first-review-time-implementation-plan.md).

Phase 03 (implemented): [phase-03-pr-size.md](../Backlog/phase-03-pr-size.md) — implementation plan [FEAT-003-pr-size-implementation-plan.md](../Backlog/FEAT-003-pr-size-implementation-plan.md).

Current UI reference: [PR Cycle Time, First Review, and PR Size](../Assets/mockups/05-pr-cycle-time-first-review-and-pr-size.png)

## Phase 00: Product Refinement And UI

Detailed file: [phase-00-product-refinement-and-ui.md](../Completed/phase-00-product-refinement-and-ui.md)

- [x] Save product brief.
- [x] Save roadmap.
- [x] Save phase files.
- [x] Save mockups inside the project.
- [x] Mark broad mockups as superseded.
- [x] Mark PR Cycle Time-only mockup as current MVP reference.
- [x] Lock the one-page scroll layout rule for future metric phases.

## Phase 01: PR Cycle Time MVP

Detailed file: [phase-01-pr-cycle-time-mvp.md](../Completed/phase-01-pr-cycle-time-mvp.md)

Implementation plan: [FEAT-001-pr-cycle-time-mvp-implementation-plan.md](../Completed/FEAT-001-pr-cycle-time-mvp-implementation-plan.md)

Goal: release the first local dashboard with one metric: PR Cycle Time.

- [x] Initialize the local app project.
- [x] Add local database setup with **PostgreSQL** and Drizzle schema/migrations.
- [x] Add repository discovery for `/Users/manczg/Documents/work/development`.
- [x] Store discovered repositories and scan status.
- [x] Add repository-to-team mapping config.
- [x] Add GitHub PR metadata sync for opened and merged timestamps.
- [x] Store PR lifecycle metadata locally.
- [x] Compute PR Cycle Time per merged PR.
- [x] Compute median PR Cycle Time for the selected range.
- [x] Compute previous-period comparison when enough data exists.
- [x] Compute PR Cycle Time exceptions.
- [x] Build the MVP dashboard using only PR Cycle Time.
- [x] Show data freshness: repos scanned, PR metadata sync time, missing Jira keys, sync errors.
- [x] Handle empty states: no merged PRs, missing baseline, sync errors.
- [x] Verify the dashboard renders no future metric cards.
- [x] Verify the current MVP mockup is still aligned or update the mockup/doc if the UI intentionally changes.

## Phase 02: First Review Time (Implemented)

Detailed file: [phase-02-first-review-time.md](../Completed/phase-02-first-review-time.md)

Implementation plan: [FEAT-002-first-review-time-implementation-plan.md](../Completed/FEAT-002-first-review-time-implementation-plan.md)

UI reference: [PR Cycle Time and First Review](../Assets/mockups/04-pr-cycle-time-and-first-review.png)

Goal: add review-latency visibility after PR Cycle Time is working.

- [x] Sync GitHub review event metadata.
- [x] Store first review timestamp per PR.
- [x] Compute First Review Time.
- [x] Add scroll-below-Phase-01 First Review Time section.
- [x] Add First Review metric card.
- [x] Add review-latency exceptions.
- [x] Add separate Review team breakdown.
- [x] Add First Review weekly trend.
- [x] Show review metadata freshness and review sync errors.
- [x] Verify PR Cycle Time behavior remains unchanged.

## Phase 03: PR Size (Implemented)

Detailed file: [phase-03-pr-size.md](../Backlog/phase-03-pr-size.md)

Implementation plan: [FEAT-003-pr-size-implementation-plan.md](../Backlog/FEAT-003-pr-size-implementation-plan.md)

UI reference: [PR Cycle Time, First Review, and PR Size](../Assets/mockups/05-pr-cycle-time-first-review-and-pr-size.png)

Goal: detect oversized PR patterns.

- [x] Sync changed-line and file-count metadata per PR.
- [x] Store PR size metadata locally.
- [x] Compute median PR size.
- [x] Add PR Size section below First Review Time.
- [x] Add PR Size metric card.
- [x] Add oversized PR exceptions.
- [x] Add separate Size team breakdown.
- [x] Add PR Size weekly trend.
- [x] Distinguish completed-week trend from current-week-so-far with confidence notes and detached current marker.
- [x] Show size metadata freshness.
- [x] Verify the UI does not rank or shame individual authors.

## FIX-004: Remaining Dashboard 16-Week Trend Expansion (Scheduled Stabilization Gate)

Implementation plan: [FIX-004-remaining-dashboard-16-week-trend-expansion.md](../Backlog/FIX-004-remaining-dashboard-16-week-trend-expansion.md)

Authoritative brief: [remaining-dashboard-16-week-trend-expansion-brief.md](../Backlog/remaining-dashboard-16-week-trend-expansion-brief.md)

Goal: stabilize the existing dashboard trends before Phase 04 begins. Jira Flow Metrics remains the next feature phase.

- [ ] Complete the scheduled FIX-004 dashboard stabilization work.

## Phase 04: Jira Flow Metrics

Detailed file: [phase-04-jira-flow-metrics.md](../Backlog/phase-04-jira-flow-metrics.md)

Goal: add Jira-backed flow metrics after GitHub PR metrics are stable.

- [ ] Add Jira API configuration.
- [ ] Sync Jira issues.
- [ ] Sync Jira status history.
- [ ] Link Jira issues to PRs by issue key.
- [ ] Compute WIP.
- [ ] Compute throughput.
- [ ] Compute Jira cycle time.
- [ ] Compute missing Jira key hygiene.
- [ ] Add Jira-backed metric cards only after each calculation exists.
- [ ] Add Jira data freshness and data-quality issues.

## Phase 05: Quality And Cloud Readiness

Detailed file: [phase-05-quality-and-cloud-readiness.md](../Backlog/phase-05-quality-and-cloud-readiness.md)

Goal: add quality signals and prepare the cloud path after the local dashboard is useful.

- [ ] Decide first quality source of truth.
- [ ] Add reopen rate if source data is reliable.
- [ ] Add rework rate if source data is reliable.
- [ ] Add bug escape proxy if source data is reliable.
- [ ] Add change failure rate only after incident or deployment data exists.
- [ ] Review database portability for Cloudflare D1 and later Supabase/Postgres.
- [ ] Keep collector separate from deployed runtime assumptions.
- [ ] Document cloud migration options after local MVP proves useful.
