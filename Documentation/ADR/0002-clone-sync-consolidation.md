# Clone and sync consolidate onto one pipeline, discriminated by a `mode` column

## Context

Cloning and syncing GitHub repositories happened through two separate, hand-duplicated
implementations: a bash script (`scripts/docker/clone-github-org-repos.sh`) that listed the org,
filtered by team mapping, and cloned/repaired repos on its own, and the TypeScript pipeline
(`refreshLocalData` in `src/collector/refresh.ts`) that did the same as the first phase of a full
sync (since commit 162cfa3). Both could run concurrently — container start, a midnight
clone-only cron, the 01:00 full-sync cron, the web Refresh button, and the CLI all triggered one
or the other — with no shared redundancy guard between the two implementations.

Commit cc5a63f added a cross-process file lock (`src/collector/clone-lock.ts`, plus matching
`flock`/`mkdir` code in the bash script) to stop the two writers from corrupting each other's
clones. A 3-lens devil's-advocate review of that commit (lock correctness, duplication/
architecture, production blast radius) found the lock did not actually provide mutual exclusion —
a marker-write race, a TOCTOU stale-reclaim window, an unverified 2-hour staleness ceiling, and an
unverified assumption that `mkdir` is atomic over the production Azure Files SMB mount. The
review's verdict was "Rethink it": the dual implementation was the root cause of the race, not the
missing lock, so hardening the lock would have kept patching symptoms of running the same clone
logic twice.

## Decision

Consolidate clone and sync onto the single existing pipeline, `refreshLocalData`, extended with a
`mode: 'full' | 'clone-only'` option (default `'full'`, so every existing full-sync caller is
unchanged). In `'clone-only'` mode the function runs only the `cloning_repositories` phase and
finishes the run without entering `scanning_repositories`, `pr_sync`, `review_sync`, or
`pr_size_sync`. Every trigger — web, CLI, container start, cron — now calls this one function,
differing only by the mode flag:

- `scripts/refresh.ts` (the CLI) gained a `--clone-only` flag forwarding `mode: 'clone-only'`.
- `scripts/docker/clone-github-org-repos.sh` was rewritten as a thin delegate that sources the
  container env and execs `npm run collector:refresh -- --clone-only`, keeping its documented
  invocation (`docker compose exec app bash scripts/docker/clone-github-org-repos.sh`) working for
  existing runbooks and muscle memory. It no longer lists repos, filters by team mapping, clones,
  repairs, or acquires any lock of its own.
- `scripts/docker/clone-org-repos.cron` (the 00:00 clone-only cron) was deleted; only the 01:00
  full-sync cron remains, since it already clones as its own first phase.
- The file-based lock (`src/collector/clone-lock.ts`, `tests/collector/clone-lock.test.ts`, and
  the bash script's mkdir/`flock` code) was deleted outright rather than hardened. Removing the
  second writer removes the race the lock existed to guard against.

**Run-type discriminator: a `mode` column, not a `phase_timings` heuristic.** The pipeline needed
some way to tell a clone-only run apart from a full run, both to filter dashboard freshness
queries and to keep a clone-only run from attaching to the live Refresh button. The original plan
was to infer this from which keys `phase_timings` ended up with, adding no schema. A
devil's-advocate review found that heuristic unsound: `refresh.ts`'s catch-all failure handler
never writes `phase_timings`, so a full run that fails before finishing normally is structurally
indistinguishable from a clone-only run under that check — it would have hidden a real full-sync
failure from "last synced" instead of surfacing it. The fix was a `mode` column on `sync_runs`
(`text`, `'full' | 'clone_only'`, `NOT NULL DEFAULT 'full'`, matching the table's existing
`kind`/`status` text-column convention rather than a `pgEnum`), set once at claim time — the same
`INSERT` that creates the `running` row, before any phase logic runs. This records which mode was
*requested* as a fact independent of how far the run got or how it finished, which nothing derived
from `phase_timings` could do reliably.

**Shared `kind` is the sole cross-process mutex.** The existing single-flight guard — a unique
partial index on `sync_runs (kind) WHERE status = 'running'` — is unchanged and is *not* scoped by
`mode`. Every run, full or clone-only, is inserted with `kind = 'collector_refresh'`, so a
clone-only run and a full run are mutually exclusive exactly like two full runs would be. `mode` is
purely informational for query filtering and UI display; it plays no part in the mutex. **This is
a hard invariant now that the file lock is gone: giving clone-only a distinct `kind` in some future
change would let a clone-only run and a full run both hold a `running` row simultaneously and both
clone into `repoRoot` concurrently, with nothing left to catch the resulting `.git` corruption.**
A test (`tests/collector/single-flight.test.ts`) asserts a clone-only call and a full call started
concurrently produce exactly one `AlreadyRunningError`, documenting this as a correctness guarantee
rather than an incidental side effect.

Two dashboard queries were filtered to `mode = 'full'` so a clone-only run — which syncs no PR
metadata — can never be shown as "last synced": `getLatestSyncSource` in
`src/metrics/dashboard-sources.ts`, and the equivalent "latest finished run" query in
`src/metrics/pr-cycle-time-dashboard.ts` that drives the main dashboard's freshness banner (a
separate, unfiltered query a devil's-advocate review of the bash-delegate work found was missed by
the first filter). A clone-only run's own failures still need to be visible somewhere, though, so
`getSyncErrorsSource` was given an independent lookup (`getLatestReportableSyncRun`) rather than
reusing the now-filtered `getLatestSyncSource`. It selects the most recent finished run that is
either `mode = 'full'` **or** has `errorCount > 0` — a clone-only *failure* is still surfaced (the
reason clone-only runs are recorded in `sync_runs` at all), but a clean clone-only pre-warm
(`mode = 'clone_only'`, zero errors) is skipped so it can never bury a prior full run's errors and
leave the freshness banner reporting errors the errors page can't display. `SyncRunSource` exposes
`mode` so the Sync Errors page can still flag when the run it's showing isn't `'full'` and may not
match the "last synced" panel.

Removing the file lock alone would have reopened a `.git` corruption path independent of the
`sync_runs` guard: a crashed writer's orphaned `git` process can keep writing to a repo directory
after its row is reclaimed as a zombie by another run. `cloneOrUpdateRepository`
(`src/collector/repo-clone.ts`) was hardened to clone/repair into a temp directory under
`repoRoot/.clone-tmp` and atomically rename the result into place, so two concurrent writers
targeting the same repo can never produce half-written content regardless of whether the DB guard
is ever bypassed. Two follow-ups keep that "holds even under bypass" claim honest: (1) the
start-of-phase staging reclaim (`clearCloneTmpDir`) removes only entries older than the zombie TTL
instead of wiping the whole shared `.clone-tmp`, so it can never delete a concurrent live run's
in-flight clone; and (2) a run's own `sync_runs` writes (heartbeat, finalize, the failure handler)
are gated on `status = 'running'`, so a run reclaimed as a zombie by a peer surrenders its lease and
aborts rather than continuing to write `/repos` and clobbering the reclaim marker (which would have
hidden the double-run). `isRenameRaceLoss` fingerprints `target/.git` rather than mere existence, so
a genuine permission fault is not laundered into a benign "race loss." This is filesystem- and
lease-level defense in depth, not a replacement for the single-flight guard; see
[ADR 0001](0001-refresh-progress-and-single-flight.md) for the full detail and its residual scope
(it does not extend to the steady-state `git fetch` path on an already-healthy clone, which still
relies on git's own internal locking).

## Considered alternatives

- **Harden the existing file lock** (fix the marker-write race, the TOCTOU stale-reclaim window,
  verify the staleness ceiling and `mkdir` atomicity over SMB) — rejected. The devil's-advocate
  review that started this work found the dual implementation itself was the root cause of the
  race, not the lock's bugs; hardening it would have kept two independent clone code paths in sync
  forever instead of removing the need for a second lock at all.
- **Infer clone-only vs. full from `phase_timings` contents, adding no schema** — rejected. Sound
  on the success path, but a full run that fails before completing any phase never writes
  `phase_timings`, making it indistinguishable from a clone-only run and silently hiding real
  full-sync failures from "last synced." The `mode` column replaces this with a plain equality
  check set at claim time, correct regardless of how a run finishes.
- **Reject a second caller everywhere while a run is active** — rejected for the UI, where
  attaching to an in-flight run is the better experience (see ADR 0001), and rejected for a
  clone-only run too: the Refresh button attaches to a running clone-only run and shows its live
  "Cloning repositories" progress rather than rejecting it. (This originally went the other way — a
  clone-only run was hidden from the attachable "active run" view via a `mode = 'full'` filter on
  `getActiveSyncRun`. See the amendment below.)

## Consequences

- The clone-then-sync flow exists in one place (`refreshLocalData`); a bug fix or behavior change
  to cloning, filtering, or repair now applies to every trigger automatically instead of needing to
  be ported across a bash and a TypeScript implementation.
- The bash script lost its categorized "repos skipped and why" diagnostic (archived /
  excluded-by-pattern / not-included breakdown) — that lived only in the independent listing code
  this consolidation replaced, and has no equivalent in the CLI's clone-only mode.
- Exit-code semantics for the bash-triggered pre-warm changed: previously any single clone failure
  exited 1; delegating to the CLI's clone-only mode means only a total clone failure (`status =
  'failed'`) exits non-zero, and a partial failure exits 0 with the failure visible on the Sync
  Errors page instead of in container logs.
- `sync_runs.mode` is a permanent, small schema addition — a deliberate exception to this work's
  original "no schema change" goal, made because no zero-migration heuristic could correctly
  distinguish "clone-only" from "a full run that failed early."
- The shared-`kind` invariant above is now the only thing standing between a future change and
  reintroduced concurrent-clone corruption; it must be treated as load-bearing, not incidental,
  by anyone adding a new run kind or mode to `sync_runs`.

## Amendment: clone-only runs are visible to the live-progress view

The `mode = 'full'` filter on `getActiveSyncRun` was removed. Hiding clone-only runs from the
attachable "active run" view was inconsistent with the collision-attach behavior added afterward
(ADR 0001's "attach to the other run on a Refresh collision"): because the single-flight mutex is
shared across modes, the collision a user hits on Refresh is almost always with the container's
clone-only startup job — the exact run the filter excluded. The attach lookup returned `null`, so
the button fell through to an "A refresh is already in progress" error with no visible cause,
instead of showing the clone's live progress. `getActiveSyncRun` now returns the running run
regardless of `mode`, so both mount and refresh-click collisions display "Cloning repositories
X/Y". The freshness / "last synced" queries above remain `mode = 'full'` — a clone-only run still
syncs no PR metadata and must never appear as "last synced"; only the live-progress lookup changed.
