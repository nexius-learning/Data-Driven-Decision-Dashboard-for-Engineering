# Scripts and CLI commands

Status: Current
Last updated: 2026-06-04

## Purpose

This page describes **shell scripts** under `scripts/` and **`npm` scripts** that operate the local stack, database migrations, and data collection. Run all commands from the **repository root** unless noted otherwise.

Prerequisites for database and GitHub commands are covered in **[Local onboarding](local-onboarding.md)** and **[GitHub token setup](github-token.md)**.

## Shell scripts

| Script | Command | What it does |
| ------ | ------- | ------------ |
| **Full dev session** | `./scripts/dev.sh` | Runs `dev-up.sh`, clears leaked E2E refresh stubs, then starts the Vite dev server (`npm run dev`). Blocks the terminal. Pressing **Ctrl+C** stops the frontend and automatically runs `dev-down.sh` to tear down Postgres. |
| Local stack bootstrap | `./scripts/dev-up.sh` | Same as `npm run stack:up`: runs `npm install`, creates `.env` from `.env.example` if missing, clears leaked E2E refresh stubs, sources `.env`, starts Postgres via Docker Compose (`--wait` until healthy), runs `npm run db:migrate`. Does **not** start the Vite dev server. |
| Stop Compose Postgres | `./scripts/dev-down.sh` | Same as `npm run stack:down`: runs `docker compose down`. The named volume keeps database data until you remove it manually (see script output). |
| Clone all org repos (full-Docker workflow) | `docker compose exec app bash scripts/docker/clone-github-org-repos.sh` | For the **optional full-Docker setup** (see [Local onboarding](local-onboarding.md#optional-full-docker-app--postgres-in-containers)). Thin delegate — invokes `npm run collector:refresh -- --clone-only` (below), which reads `GITHUB_TOKEN` / `GITHUB_SYNC_OWNER` / `DASHBOARD_REPO_ROOT` from the container env, filters via `config/team-mapping.json` include/exclude rules, and clones matching non-archived repos into `/repos` (bind-mounted to your host). Idempotent — re-running skips existing clones. Unlike the old standalone script, does not print a categorized breakdown of repos skipped by policy. |

Requirements: **Docker** with **Compose v2** for the stack scripts. Some explicit checks print short errors; delegated commands such as `npm install`, `docker compose`, and Drizzle may print their native errors.

## npm scripts (stack and database)

| Script | What it does |
| ------ | ------------ |
| `npm run stack:up` | Runs `./scripts/dev-up.sh`. |
| `npm run stack:down` | Runs `./scripts/dev-down.sh`. |
| `npm run db:up` | Runs `docker compose up -d --wait`. With only the base compose file this starts Postgres; with a local override it may also start the app service. Does not install deps or migrate. |
| `npm run db:down` | Stops the Compose stack (`docker compose down`). |
| `npm run db:ensure` | Creates the configured database if it is missing. Requires **`DATABASE_URL`** in the process environment. |
| `npm run db:generate` | Generates Drizzle migrations from schema changes. |
| `npm run db:migrate` | Applies SQL migrations from `drizzle/` using Drizzle Kit. Requires a valid **`DATABASE_URL`** in the process environment; direct `npm run db:migrate` does not load `.env` by itself. |

## npm scripts (data sync)

### `npm run collector:refresh`

Runs `tsx scripts/refresh.ts`, which calls **`refreshLocalData`** in application code.

- **Discovers** git repositories: immediate child directories of **`DASHBOARD_REPO_ROOT`** that contain `.git`.
- **Upserts** repository rows and applies **`GITHUB_SYNC_OWNER`**, **`config/team-mapping.json`** include/exclude rules, and team assignment.
- **Syncs** pull request metadata from the GitHub API only for repositories in **`ready`** status that match the configured org and mapping.
- **Syncs** review metadata for PR-sync-successful repos.
- **Syncs** PR size metadata from local git history and GitHub PR-detail fallback.
- Records sync runs, sync errors, missing Jira-key counts, remote identity warnings, and partial/failed status.

Use this for day-to-day syncing from your **local clone layout**.

Output: JSON **`RefreshSummary`** to stdout. Exit code **1** if the run status is **`failed`**, otherwise **0**.

**`--clone-only` flag:**

```bash
npm run collector:refresh -- --clone-only
```

Runs only the **cloning_repositories** phase (org listing, team-mapping filtering, clone/update/repair) and records a `sync_runs` row with `mode = clone_only`, skipping scanning and PR/review/size sync entirely. Intended for lightweight pre-warm triggers (e.g. container start) rather than day-to-day use.

- Mutually exclusive with a full refresh via the same single-flight guard: whichever starts second gets `AlreadyRunningError`, regardless of mode. This is the only cross-process guard — there is no separate file-based lock.
- If **some** repos clone successfully and some fail, the run finishes with status **`partial`** and **exits 0** — the failure is visible on the Sync Errors page, not as a non-zero exit code or in `docker compose logs`. Only a **total** clone failure (zero repos succeed) finishes **`failed`** and exits 1.
- Exits **0** when the failure is `AlreadyRunningError` (matching the old bash clone-cron's "skip cleanly" contract for a lock conflict) or when the run finishes `success`/`partial`; exits **1** when the run finishes `failed` for any other reason (a total clone failure).
- Does not appear as an attachable run on the live web dashboard's Refresh button (only full refreshes do).

### `npm run db:import-github`

Runs `tsx scripts/import-github-repos.ts`, which calls **`importGitHubRepositories`** with explicit **`owner/repo`** slugs (no local clones required for those repos).

**Examples:**

```bash
npm run db:import-github -- octocat/Hello-World my-org/my-service
npm run db:import-github -- --repo org/repo-a --repo org/repo-b
npm run db:import-github -- --help
```

**Environment** (same variables as the collector; usually set in `.env`):

| Variable | Role |
| -------- | ---- |
| `DATABASE_URL` | Required. Must be a **`postgresql://`** or **`postgres://`** URI (see local onboarding). |
| `GITHUB_TOKEN` | Optional for public repositories; recommended for rate limits and private repos. |
| `GITHUB_API_BASE_URL` | Optional; default `https://api.github.com`. |
| `DASHBOARD_INITIAL_SYNC_FROM` | Optional; lower bound for the **first** full PR fetch for a repository row that has never synced PRs. |
| `GITHUB_SYNC_CONCURRENCY` | Optional; default `2`. |
| `TEAM_MAPPING_PATH` | Optional; default `./config/team-mapping.json` — used only to assign **`team`** on imported rows. Explicit imports are **not** filtered out by include/exclude patterns. |

**Behaviour vs `collector:refresh`:**

- Imported repositories are stored with synthetic paths under a virtual root **`__github_import__`** (for example path `__github_import__/owner/repo`). The refresh job only syncs PRs for rows whose **`root_path`** equals **`DASHBOARD_REPO_ROOT`**, so import rows are **not** updated when you run `collector:refresh`.
- To refresh PR data for import rows, run **`db:import-github`** again for the same slugs.

Output: JSON summary with `reposTouched`, `prsSeen`, `prsMerged`, `prsOpen`, and `errors`. Exit code **1** if any repository sync failed (`errors` non-empty).

## Quick reference

| Goal | Command |
| ---- | ------- |
| Start full dev session (DB + frontend, one command) | `./scripts/dev.sh` |
| First-time local DB + migrations only | `./scripts/dev-up.sh` or `npm run stack:up` |
| Stop local Compose Postgres | `./scripts/dev-down.sh` or `npm run stack:down` |
| Apply migrations only | `npm run db:migrate` (with `DATABASE_URL` set) |
| Create the configured database if missing | `npm run db:ensure` (with `DATABASE_URL` set) |
| Sync from clones under `DASHBOARD_REPO_ROOT` | `npm run collector:refresh` |
| Load or update PRs for explicit GitHub repos | `npm run db:import-github -- owner/repo [...]` |

## Database backup and restore (Docker Compose Postgres)

To **save** the current `dddd_dev` database as a portable archive (custom `pg_dump` format), from the repo root with the default Compose credentials:

```bash
mkdir -p data/pg-backups
docker exec -e PGPASSWORD=dddd_local_dev dddd-postgres \
  pg_dump -h 127.0.0.1 -U dddd -d dddd_dev -Fc --no-owner --no-acl \
  -f /tmp/dddd_dev_snapshot.dump
docker cp dddd-postgres:/tmp/dddd_dev_snapshot.dump data/pg-backups/dddd_dev_github_sample.dump
```

`data/pg-backups/*.dump` is gitignored so dumps are not committed.

To **restore** into an empty database (destructive: drops and recreates objects in the target DB). Ensure Postgres is up (`npm run db:up`) and point `PGPASSWORD` at your `POSTGRES_PASSWORD` from `docker-compose.yml`:

```bash
# Replace the file name if you use a different dump.
docker cp data/pg-backups/dddd_dev_github_sample.dump dddd-postgres:/tmp/restore.dump
docker exec -e PGPASSWORD=dddd_local_dev dddd-postgres \
  pg_restore -h 127.0.0.1 -U dddd -d dddd_dev --clean --if-exists --no-owner --no-acl /tmp/restore.dump
```

If restore warns about existing connections, stop the app and retry, or use a fresh database name and update `DATABASE_URL` in `.env` to match.

## Related documentation

- [Local onboarding](local-onboarding.md) — PostgreSQL, `.env`, team mapping, repository layout.
- [GitHub token setup](github-token.md).
- [Developer guide](../Development/README.md) — full `npm` script list for dev, test, and build.
