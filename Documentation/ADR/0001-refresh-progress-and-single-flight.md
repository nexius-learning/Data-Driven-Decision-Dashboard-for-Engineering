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
- **Shared `kind` is the sole cross-process mutex.** Every `sync_runs` row — full or
  `clone_only` — is inserted with `kind = 'collector_refresh'`, so the unique partial index
  makes a full run and a clone-only run mutually exclusive exactly like two full runs. A prior
  file-based lock (`src/collector/clone-lock.ts`) once backstopped the clone phase independently
  of this guard; it was retired (NIM-4) once the bash and TypeScript implementations were
  consolidated onto this single guard (NIM-1..NIM-3). Giving clone-only a distinct `kind` in a
  future change would let a clone-only run and a full run both hold a `running` row
  simultaneously and both clone into `repoRoot` concurrently, with nothing left to prevent the
  resulting `.git` corruption — this invariant must hold for as long as the file lock stays gone.
- **The DB guard alone does not make a concurrent fresh clone or repair into the same directory
  safe; the filesystem layer does that independently — but this does not extend to `git fetch`
  on an already-healthy clone.** `cloneOrUpdateRepository` (`src/collector/repo-clone.ts`) clones
  or repairs into a temp directory under `repoRoot/.clone-tmp` and atomically renames the result
  into place, rather than writing directly at the final path. This means even if the
  single-flight guard is ever bypassed — e.g. a zombie reclaim (heartbeat older than
  `ZOMBIE_TTL_SECONDS`) racing a still-alive writer whose orphaned `git` child process keeps
  writing after its own process crashed — two concurrent fresh-clone or repair writers targeting
  the same repo can still never produce a half-written `.git` directory; whichever finishes
  first wins the rename and the other's temp clone is discarded. The steady-state `git fetch`
  path (an already-healthy clone being updated, the common case once a repo is warm) still
  writes directly into the final `target` and relies entirely on git's own internal locking
  (per-ref lockfiles, content-addressed objects) rather than this rename scheme — a residual,
  lower-probability risk (e.g. concurrent `auto-gc` pruning an object an in-flight fetch
  references) that the deleted file lock used to also cover and that a future change would need
  to address explicitly if it becomes a real problem.
