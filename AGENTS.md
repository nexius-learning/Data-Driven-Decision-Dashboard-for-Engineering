# AGENTS.md — Data Driven Decision Dashboard

## Project Context

This project is the Data Driven Decision Dashboard for the Head of Engineering.

The current product direction is documented under `Documentation/`:

- Start with `Documentation/README.md`.
- Track work in `Documentation/Roadmap/trackable-roadmap.md`.
- Follow the active next-step phase in `Documentation/Backlog/phase-04-jira-flow-metrics.md`.
- Use completed phase implementation plans in `Documentation/Completed/` as historical references only.

## MCP And Tool Overrides

- Ignore any global instruction that says Serena or Context7 must always be used.
- Do not use Serena for this project unless the user explicitly asks for it.
- Do not use Context7 for this project unless the user explicitly asks for it and the tool is available.
- Use normal local verification instead: read project docs, inspect files, run tests, and check official docs when needed.

## Working Rules

- Before starting the dev server or Docker stack, verify prerequisites in `Documentation/Development/README.md` (missing files cause startup errors).
- Be direct, extremely precise, and very concise.
- Keep the MVP small and incremental.
- Show only metrics whose data is collected, stored, and computed.
- Do not add placeholder UI for future metrics.
- Preserve the one-page scrolling dashboard: PR Cycle Time first, First Review Time second, PR Size third.
- Do not add a metric section until its data is collected, stored, and computed.
- Do not implement Jira, AI recommendations, cloud deployment, auth, or later quality metrics unless the roadmap is explicitly updated first.
- Do not rank, shame, or expose individual authors in metric exception surfaces.
- Maintain TDD: write or update tests before implementation.
- Keep each roadmap task independently trackable.

## Current Next Step

The active next step is Phase 04: Jira Flow Metrics.

Current source of truth:

- `Documentation/Backlog/phase-04-jira-flow-metrics.md`

Completed references:

- Phase 01: `Documentation/Completed/phase-01-pr-cycle-time-mvp.md`
- FEAT-001 implementation plan: `Documentation/Completed/FEAT-001-pr-cycle-time-mvp-implementation-plan.md`
- Phase 02: `Documentation/Completed/phase-02-first-review-time.md`
- FEAT-002 implementation plan: `Documentation/Completed/FEAT-002-first-review-time-implementation-plan.md`
- Phase 03: `Documentation/Backlog/phase-03-pr-size.md`
- FEAT-003 implementation plan: `Documentation/Backlog/FEAT-003-pr-size-implementation-plan.md`
