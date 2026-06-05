# Phase 05: Quality And Cloud Readiness

Status: Draft
Last updated: 2026-06-04

## Goal

Add quality signals and prepare a cloud path after the local dashboard is useful.

## Quality Candidates

- Reopen rate.
- Rework rate.
- Bug escape proxy.
- Change failure rate, only after incident or deployment data exists.

## Cloud Readiness

- Keep PostgreSQL deployment portable (local instance today, managed Postgres later).
- Review the current PostgreSQL-specific schema/client assumptions before considering Cloudflare D1 or another non-Postgres database.
- Separate collector scheduling/runtime concerns from deployed web runtime assumptions where needed for cloud operation.
- Treat Cloudflare deployment as a later packaging, database-portability, and sync-scheduling problem, not a blocker for local MVP.

## Acceptance Criteria

- Quality metrics are added only when source data is reliable.
- Cloud migration does not require rewriting metric definitions.
- Local-first workflow remains usable.
