# Local Onboarding

Status: Current
Last updated: 2026-06-04

## Purpose

This guide prepares the local configuration needed to run the dashboard against real repositories.

## Web application (UI)

The dashboard runs as a **TanStack Start** app on **Vite** (dev server default **http://localhost:3000**).

1. Install [Node.js](https://nodejs.org/) 20.19 or newer, or 22.12 or newer, and clone this repository.
2. From the repository root: `npm install`, then `npm run dev`.
3. For day-to-day engineering commands (tests, lint, build), see **[Developer guide](../Development/README.md)**. For stack, migrations, and sync CLIs, see **[Scripts and CLI commands](scripts.md)**.

The dashboard home route opens PostgreSQL through server functions, so normal local app usage requires **`DATABASE_URL`** in `.env` or the process environment. Use `./scripts/dev.sh` for the simplest DB + frontend session.

## PostgreSQL (required)

The dashboard stores sync data and computed metric inputs in **PostgreSQL** on your machine (or in Docker).

### Quick path: Docker Compose (recommended)

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or another engine with Compose v2).
2. From the repository root: **`./scripts/dev.sh`** — starts Postgres (via `dev-up.sh`: `npm install`, creates `.env` from `.env.example` if missing, migrations) then launches the Vite dev server. **Ctrl+C** stops the frontend and tears down Postgres automatically.

The default `DATABASE_URL` in `.env.example` matches Compose (`postgresql://dddd:dddd_local_dev@127.0.0.1:54332/dddd_dev`). **Change the Compose password** in `docker-compose.yml` and `.env` if anything beyond localhost can reach host port **54332**.

If you prefer to manage the dev server separately: run `./scripts/dev-up.sh` (or `npm run stack:up`) to bring up the stack, then `npm run dev` in a second terminal. Stop Postgres with `./scripts/dev-down.sh` (or `npm run stack:down`) when done.

### Optional: full Docker (app + Postgres in containers)

If you'd rather run the **Vite dev server in a container** too (single
`docker compose up`, nothing on the host Node toolchain), the repo ships
`Dockerfile`, `.dockerignore`, and `docker-compose.override.yml.example`
for that workflow:

1. `cp docker-compose.override.yml.example docker-compose.override.yml`
   (if your local copy is older than the example, diff them first —
   recent updates may have added settings like `init: true` that you'd
   want carried over).
2. Edit `docker-compose.override.yml`: replace the placeholder bind-mount
   path under `app.volumes` with the absolute path on your host where you
   keep local clones (mapped to `/repos` inside the container).
3. Edit `.env`: `scripts/local-env.ts` detects `/.dockerenv` (and
   `/run/.containerenv` for Podman) and lets the compose env block win
   over `.env` for `DASHBOARD_REPO_ROOT`, `DATABASE_URL`, and
   `TEST_DATABASE_URL`, so the container works regardless of whether
   those keys are set in `.env`. Removing/commenting them is cosmetic —
   recommended to avoid the file looking misleading, not required.
4. `docker compose up --build` — starts Postgres, runs migrations,
   launches Vite on `http://localhost:3000`.
5. Clone the configured org's repos into the bind-mounted directory:
   `docker compose exec app bash scripts/docker/clone-github-org-repos.sh`
6. Trigger the first sync via the **Refresh** button in the UI or
   `docker compose exec app npm run collector:refresh`.

The Dockerfile installs `git` and a credential helper scoped to
`github.com` that reads `$GITHUB_TOKEN` at fetch time, so the PR-size
step of refresh (`git fetch` inside private clones) authenticates without
the token landing on disk.

#### Scheduled jobs (cron inside the `app` container)

The full-Docker image runs a cron daemon that re-runs the dashboard
refresh nightly at **01:00** local TZ (clones any newly-added org
repos as its own first phase, then syncs PR metadata + reviews + PR
sizes). A lightweight clone-only pre-warm also fires once at container
startup from `scripts/docker/container-entrypoint.sh`, not from cron —
so newly-added repos show up even on container recreate without
waiting for the nightly refresh.

The startup pre-warm and the 01:00 refresh share one single-flight
guard (both are `kind = collector_refresh`). If a container happens to
start just before 01:00 and its pre-warm is still cloning when cron
fires, the nightly **full** refresh sees a run already in progress and
skips that tick (logged as `rc=1` under `[refresh-cron]`) rather than
running two writers against `/repos` — it is **not** retried until the
next 01:00. This window is narrow (a warm cache pre-warms in seconds)
but on an unlucky cold start it means dashboard PR data can stay stale
until the following night; click **Refresh** in the UI or run
`docker compose exec app npm run collector:refresh` to force it sooner.

Troubleshooting:

- Cron daemon alive: `docker compose exec app pgrep -a cron`
- View schedule: `docker compose exec app cat /etc/cron.d/refresh-org-repos`
- Force a clone now: `docker compose exec app bash scripts/docker/clone-github-org-repos.sh`
- Force a refresh now: `docker compose exec app npm run collector:refresh`
- See job output (includes cron daemon's own messages): `docker compose logs app | grep -E '\[(crond|clone-startup|refresh-cron)\]'`

If your host is asleep at 01:00 the missed run does not backfill. The
next container start re-runs the clone-only pre-warm, and the
following 01:00 resumes the refresh schedule.

If you start the container **after** 01:00 (e.g. `docker compose up` at
09:00), the daily refresh will not run until tomorrow 01:00 — the
container only catches the next scheduled tick, not the missed one. The
initial clone always runs at startup, but the dashboard data stays
stale until you either click **Refresh** in the UI or run
`docker compose exec app npm run collector:refresh`.

### Manual install (Homebrew, Postgres.app, or your own server)

1. Install PostgreSQL (e.g. [Homebrew](https://formulae.brew.sh/formula/postgresql@16), [Postgres.app](https://postgresapp.com/), or official [Docker image](https://hub.docker.com/_/postgres)).
2. Create a database for this project, for example `dddd_dev`. If you need a dedicated application user, create a login role (`CREATE ROLE ... LOGIN PASSWORD '...'`) and grant it `CONNECT` on the database (and ownership or table privileges as needed for migrations).
3. Ensure the DB user can **connect** to that database (`CONNECT`) and run migrations and app queries—typically `CREATE` on the database (if creating tables as owner), plus `SELECT`, `INSERT`, `UPDATE`, `DELETE` on application tables (exact `GRANT`s depend on whether migrations use the same role as the app; for solo local dev, making the user **owner** of the database is acceptable).
4. Set `DATABASE_URL` in `.env` to a standard URI, for example:
   `postgresql://USER:PASSWORD@localhost:5432/dddd_dev`
5. Apply database migrations once the URI is set (creates the dashboard schema):

   ```bash
   npm run db:migrate
   ```

   This uses `drizzle.config.ts` and SQL under `drizzle/`. The same migrations run in integration tests via `runMigrations` in application code.

6. Use TLS and managed hosts when you deploy later; for local dev, `localhost` without SSL is typical.

## Automated tests and CI

Vitest loads `.env` through the repo config, then points database-backed tests at **`TEST_DATABASE_URL`** when set, otherwise the default local `dddd_test` database. Keep fixture/test DBs separate from `dddd_dev`. Easiest local option: start Postgres with `npm run db:up` or `./scripts/dev-up.sh`, then run `npm run test`.

Playwright fixture E2E (`npm run test:e2e`) does **not** use the live dashboard database. It reads **`TEST_DATABASE_URL`** when set and otherwise defaults to `postgresql://dddd:dddd_local_dev@127.0.0.1:54332/dddd_test`. The harness creates that database if missing, applies migrations, and sets **`DASHBOARD_E2E_REFRESH_STUB=1`** (see `scripts/e2e-web-server.sh`) so the refresh button exercises the server path without calling GitHub.

For the no-mock live guards, run **`npm run test:e2e:live`** or **`npm run test:e2e:live:current`**. They refuse `DASHBOARD_E2E_REFRESH_STUB=1`, require real `DATABASE_URL`, `GITHUB_TOKEN`, `DASHBOARD_REPO_ROOT`, and `TEAM_MAPPING_PATH`, call GitHub, write the configured live Postgres database, and fail if the latest collector run is `failed`, if GitHub PR sync records auth/access errors such as `Not Found`, `token lacks access`, `401`, or `403`, or if there are no merged PRs in the default dashboard range. Real transient per-repo network errors may still produce a `partial` run.

## Files

- `.env.example` is the tracked template with default values.
- `.env` is the local editable file and is gitignored.
- `docker-compose.yml` defines the optional local Postgres service used by `npm run db:up` and **`./scripts/dev-up.sh`**.
- `Dockerfile` + `.dockerignore` define the optional dev image for the **full-Docker workflow** (Vite + Postgres in containers).
- `docker-compose.override.yml.example` is the tracked template for the full-Docker workflow; copy it to `docker-compose.override.yml` (gitignored) and edit the bind-mount path. Compose auto-merges the override on top of the base file.
- **`scripts/dev.sh`** — one-command dev session: starts DB stack then frontend; Ctrl+C stops both.
- **`scripts/dev-up.sh`** / **`scripts/dev-down.sh`** — bring the local DB stack up or down independently (see [PostgreSQL](#postgresql-required)).
- `scripts/dev.ts` and the local env helpers load local env values for dev commands and clear leaked E2E refresh stubs before normal local runs.
- **[Scripts and CLI commands](scripts.md)** — `npm run` wrappers, `collector:refresh`, and `db:import-github`.
- `config/team-mapping.example.json` is the tracked repository/team selection template.
- `config/team-mapping.json` is the local editable config and is gitignored.
- `data/` may hold optional local exports or scratch files; the **database server** holds Postgres data, not files under `data/` by default.

## Default Local Values

```env
DASHBOARD_REPO_ROOT=/Users/manczg/Documents/work/development
DATABASE_URL=postgresql://dddd:dddd_local_dev@127.0.0.1:54332/dddd_dev
TEST_DATABASE_URL=postgresql://dddd:dddd_local_dev@127.0.0.1:54332/dddd_test
TEAM_MAPPING_PATH=./config/team-mapping.json
GITHUB_API_BASE_URL=https://api.github.com
GITHUB_TOKEN=
GITHUB_SYNC_OWNER=gde-mit
DASHBOARD_DEFAULT_RANGE_WEEKS=8
DASHBOARD_INITIAL_SYNC_FROM=2026-01-01
GITHUB_SYNC_CONCURRENCY=2
```

## Repository Selection

The collector discovers immediate child directories of `DASHBOARD_REPO_ROOT` that contain `.git`.

### GitHub org filter

`GITHUB_SYNC_OWNER` (default `gde-mit`) is compared to the GitHub **owner** parsed from `git remote get-url origin`. Repositories whose remote owner does not match are **skipped** for PR sync and dashboard metrics (same outcome as excluded-by-config: stored on scan but not active for metrics). Unparseable remotes stay `metadata_incomplete` as today.

### Team mapping file

After discovery and org filter, `config/team-mapping.json` decides which remaining repositories are synced:

- `includeRepoPatterns` limits the synced set. If omitted, every discovered repository is included.
- `excludeRepoPatterns` removes repositories from sync and metrics.
- `teams[].repoPatterns` maps repositories to teams (first matching team wins; put narrower patterns before broad ones such as `bd-*`).
- `defaultTeam` is used when no team pattern matches.

Example:

```json
{
  "includeRepoPatterns": ["*"],
  "excludeRepoPatterns": ["*-archive", "experiment-*"],
  "defaultTeam": "Unassigned",
  "teams": [
    { "name": "Chat", "repoPatterns": ["nexiusai-hermes", "sd-agentic-chatbot"] },
    { "name": "DPA / Lecke", "repoPatterns": ["sd-dpa", "nexiusai-dpa-*"] },
    { "name": "Platform", "repoPatterns": ["aws-*", "sd-pe-*"] }
  ]
}
```

## First Real Test Checklist

1. Install and start PostgreSQL; create `dddd_dev` (or your chosen DB name) and set `DATABASE_URL` in `.env`.
2. Confirm repositories exist under `/Users/manczg/Documents/work/development`, or use `npm run db:import-github -- owner/repo [...]` for explicit GitHub repo imports without local clones.
3. Edit `.env` and set `GITHUB_TOKEN`.
4. Edit `config/team-mapping.json` to include only the repositories you want to test first.
5. Keep `DASHBOARD_INITIAL_SYNC_FROM=2026-01-01` for the first run unless you need older PR data.
6. Keep `GITHUB_SYNC_CONCURRENCY=2` for the first real run.
7. Start with a small include list, verify the dashboard, then widen the patterns.

## Notes

- A fresh database syncs PRs updated on or after `DASHBOARD_INITIAL_SYNC_FROM`.
- Later refreshes use the stored GitHub update cursor for incremental sync.
- Repositories excluded by patterns, or skipped because `origin` is not under `GITHUB_SYNC_OWNER`, are stored with excluded semantics and are not synced or included in metrics.
- The dashboard range stays independent from sync range. The default dashboard range is the last 8 weeks.
