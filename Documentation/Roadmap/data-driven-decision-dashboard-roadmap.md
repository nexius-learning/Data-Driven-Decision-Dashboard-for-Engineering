# Data Driven Decision Dashboard Roadmap

Status: Active
Last updated: 2026-06-04

## Strategy

Ship the dashboard metric by metric. Each phase adds one new data capability and only then extends the UI. The product should never show fake placeholders for metrics that are not collected and computed yet.

Current UI reference: [PR Cycle Time, First Review, and PR Size](../Assets/mockups/05-pr-cycle-time-first-review-and-pr-size.png)

Execution checklist: [Trackable roadmap checklist](trackable-roadmap.md)

Design history:

- [Expanded dashboard concept](../Assets/mockups/01-expanded-dashboard-concept.png) - superseded, too broad for MVP.
- [Seven-metric MVP concept](../Assets/mockups/02-seven-metric-mvp-concept.png) - superseded, still too broad for first release.
- [PR Cycle Time first increment](../Assets/mockups/03-pr-cycle-time-first-increment.png) - Phase 01 reference.
- [PR Cycle Time and First Review](../Assets/mockups/04-pr-cycle-time-and-first-review.png) - Phase 02 reference.
- [PR Cycle Time, First Review, and PR Size](../Assets/mockups/05-pr-cycle-time-first-review-and-pr-size.png) - Phase 03 reference and current one-page layout pattern.

## Phase Roadmap

| Phase | Name | Release Goal |
| --- | --- | --- |
| 00 | Product refinement and UI | Save decisions, mockups, and scope |
| 01 | PR Cycle Time MVP | Release the first useful local dashboard |
| 02 | First Review Time | Add review-latency visibility |
| 03 | PR Size | Add oversized PR detection |
| 04 | Jira Flow Metrics | Add WIP, throughput, and Jira cycle time |
| 05 | Quality and Cloud Readiness | Add quality signals and prepare cloud migration |

## Incremental UI Rule

- Show a metric only when its source data is collected and its calculation exists.
- Hide future metrics entirely.
- Keep data freshness visible at all times.
- Keep exceptions tied only to available metrics.
- Avoid individual performance scoring.

## One-Page Scroll Layout Rule

The metric surface is a **single-page dashboard** with vertical scrolling. Do not add top-level pages, tabs, route changes, or side navigation for new metrics unless the roadmap explicitly changes this rule. Source/provenance drill-down routes may exist to explain collected data and sync state; they do not change the one-page metric-section rule.

Each new metric phase extends the same page by appending a new vertical section **after the previous metric section**, matching the ordering in the latest mockup. Users scroll down to later metrics:

1. Phase 01: PR Cycle Time remains the first viewport and primary top section.
2. Phase 02: First Review Time appears below PR Cycle Time.
3. Phase 03: PR Size appears below First Review Time.
4. Future metric phases continue below the last implemented metric section.

When a new mockup is generated, implement it by preserving the existing sections above and adding the new metric as the next scroll section at the bottom. Do not crowd new metric cards into the first viewport.

## Phase Links

- [Phase 00: Product refinement and UI](../Completed/phase-00-product-refinement-and-ui.md)
- [Phase 01: PR Cycle Time MVP](../Completed/phase-01-pr-cycle-time-mvp.md)
- [Phase 02: First Review Time](../Completed/phase-02-first-review-time.md)
- [Phase 03: PR Size](../Completed/phase-03-pr-size.md)
- [Phase 04: Jira Flow Metrics](../Backlog/phase-04-jira-flow-metrics.md)
- [Phase 05: Quality and Cloud Readiness](../Backlog/phase-05-quality-and-cloud-readiness.md)

## Current Priority

Continue with Phase 04. The next release should add Jira API configuration, issue and status-history sync, PR-to-issue linking, and Jira-backed flow metrics (WIP, throughput, cycle time, and Jira-backed issue-link hygiene) while preserving the Phase 01-03 sections above them. The existing PR-title missing Jira key signal remains a GitHub PR metadata hygiene item until Phase 04 explicitly reconciles it with Jira issue data.

Track implementation status in [Trackable roadmap checklist](trackable-roadmap.md). The detailed next-step file is [Phase 04: Jira Flow Metrics](../Backlog/phase-04-jira-flow-metrics.md).
