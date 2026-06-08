# Refresh progress and single-flight derive from polled, DB-persisted sync-run state

## Context

A Refresh takes many minutes on a real workspace, but gave no progress (UI showed only
"Refreshing…", the CLI printed nothing until a single end-of-run JSON summary). Nothing stopped
two Refreshes running at once (UI + CLI, or two tabs), wasting shared GitHub rate limit and
producing half-updated dashboard state. The `lastPrSyncedAt` high-water mark is already
monotonic (recomputed as `max(githubUpdatedAt)`), so concurrency is a rate-limit/UX problem,
not a correctness one.

## Decision

Both progress reporting and single-flight derive from one source of truth: the `running`
`sync_runs` row, enriched with denormalized progress columns (`current_phase`, `phase_done`,
`phase_total`, `in_flight_repos`, `phase_timings`, a heartbeat timestamp) and the existing
`error_count`. The Refresh is the sole writer (guaranteed by single-flight), so plain columns
need no contention handling.

- **Progress transport: DB-polling, not streaming.** The UI starts the run, then polls a light
  GET (~2s) and renders progress on the existing Refresh button (`{phase} {done}/{total}`,
  spinner, in-flight repos in a tooltip, `(N errors)` suffix). It survives tab reload and lets a
  second tab or a CLI run be "attached" to for free. The CLI prints human-readable progress to
  stdout via an `onProgress` callback on `refreshLocalData()`.
- **Single-flight: unique partial index + heartbeat, not an advisory lock.** A unique partial
  index on `sync_runs (kind) WHERE status='running'` makes two running rows a constraint
  violation. Starting a Refresh expires stale rows (heartbeat older than 120s, written every
  10s) then inserts; the race loser hits the unique violation. The heartbeat is required anyway
  to tell a live run from a zombie for the attach UX.
- **Conflict behaviour: UI attaches, CLI refuses.** A second UI client shows the live run; the
  CLI aborts with a message and non-zero exit. A zombie `running` row on mount shows a plain
  `Refresh` and is taken over on the next click.

## Considered alternatives

- **Streaming (SSE) over the POST** — rejected: dies on tab reload, doesn't help a second
  client, fights TanStack Start's server-fn model, needs a separate persistence path anyway.
- **Postgres session advisory lock** — rejected: pins a pooled connection open for minutes and
  still needs the leftover `running` row reconciled, so it doesn't remove the heartbeat work.
- **A `sync_run_steps` table** — rejected for the MVP: per-repo timing history wasn't worth the
  extra table; live "which repo is slow" is covered by the in-flight tooltip and post-hoc needs
  are met by per-phase totals.
- **Reject the second caller everywhere** — rejected for the UI, where attaching to the in-flight
  run is the better experience.

## Consequences

- Post-run insight is per-phase totals only; there is no persisted per-repo timing history.
- The CLI no longer prints a machine-readable JSON summary (no known consumer parsed it; exit
  codes are unchanged).
