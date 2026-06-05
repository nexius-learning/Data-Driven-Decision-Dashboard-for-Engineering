# Phase 04: Jira Flow Metrics

Status: Draft
Last updated: 2026-06-04

## Goal

Add Jira-backed flow metrics after GitHub PR metrics are stable.

## Metrics

- WIP.
- Throughput.
- Jira cycle time.
- Jira-backed issue-link hygiene.

The dashboard already has a GitHub PR-title missing Jira key signal. Phase 04 must decide whether Jira-backed issue linking replaces, augments, or reconciles that existing freshness item.

## UI Changes

- Add metric cards only for implemented Jira metrics.
- Add Jira data freshness.
- Add Jira-related data-quality issues.
- Keep PR metrics visible.

## Data

Required data:

- Jira issues.
- Status history.
- Sprint or timebox metadata if available.
- Jira issue keys linked to PRs.

## Acceptance Criteria

- Jira metrics do not appear until sync and computation are implemented.
- WIP reflects active Jira work, not GitHub PR count.
- Jira-backed issue-link hygiene is shown as a data-quality issue, clearly distinguished from the existing PR-title missing-key signal.
