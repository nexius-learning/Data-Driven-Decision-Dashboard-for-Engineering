# Developer guide

Status: Current
Last updated: 2026-06-04

This document is for engineers working on the **Data Driven Decision Dashboard** codebase. Product direction and phased scope live under [Documentation/README.md](../README.md), the [trackable roadmap](../Roadmap/trackable-roadmap.md), and the active backlog phase.

## Prerequisites

- **Node.js** 20.19 or newer, or 22.12 or newer (the stack uses Vite 8 and modern ESM).
- **npm** (package manager for this repo).
- **PostgreSQL** and environment configuration as described in [Local onboarding](../Setup/local-onboarding.md).

## Stack

| Area        | Choice                          |
| ----------- | ------------------------------- |
| App runtime | TanStack Start (React, TypeScript) |
| Bundler     | Vite 8                          |
| Unit / component tests | Vitest, React Testing Library, jsdom |
| E2E         | Playwright (`tests/e2e/`)       |
| Lint        | ESLint 9 (flat config)          |

Application source lives under **`src/`** (routes, router, generated `routeTree.gen.ts`). Tests live under **`tests/`**.

## First-time setup

```bash
git clone <repository-url>
cd dddd
./scripts/dev.sh   # starts Postgres + Vite dev server; Ctrl+C stops both
```

`dev.sh` runs `npm install`, creates `.env` from `.env.example` if missing, starts Postgres via Docker Compose, applies migrations, then launches the Vite dev server. For Homebrew or other Postgres setups, see [Local onboarding](../Setup/local-onboarding.md).

Copy `config/team-mapping.example.json` → `config/team-mapping.json` when you work on discovery or sync features that need team mapping.

The dashboard route requires **`DATABASE_URL`** in `.env` (or the process environment) so server functions can open PostgreSQL.

## npm scripts

| Script        | Purpose |
| ------------- | ------- |
| `npm run dev` | Run `scripts/dev.ts`, load local env, clear leaked E2E refresh stubs, then start the Vite dev server (default **http://localhost:3000**). |
| `npm run build` | Production client + SSR build, then `tsc --noEmit`. |
| `npm run test` | Run all Vitest tests once (`vitest run`). |
| `npm run test -- tests/app/app-shell.test.tsx` | Run a single test file (example). |
| `npm run test:e2e` | Fixture-backed Playwright smoke tests under `tests/e2e/`. Uses **`TEST_DATABASE_URL`** or the default `dddd_test` database, starts the dev server via `scripts/e2e-web-server.sh`, and sets `DASHBOARD_E2E_REFRESH_STUB=1` so refresh does not call GitHub. Run **`npx playwright install chromium`** once after installing dependencies. |
| `npm run test:e2e:live` / `npm run test:e2e:live:current` | Live Playwright guards for the real GitHub sync path. They use the configured live **`DATABASE_URL`**, `GITHUB_TOKEN`, `DASHBOARD_REPO_ROOT`, and `TEAM_MAPPING_PATH`; no mocks or refresh stub. |
| `npm run verify:phase01` | Phase 01 gate: `lint`, `typecheck`, `build`, Vitest with coverage, then `test:e2e`. |
| `npm run verify:phase02` | Phase 02 gate: `lint`, `typecheck`, Phase 02 coverage config, then `@phase02` Playwright tests. |
| `npm run verify:phase03` | Phase 03 gate: `lint`, `typecheck`, PR Size UTC-boundary regression, Phase 03 coverage config, then `@phase03` Playwright tests. |
| `npm run verify:fix004` | Stabilization gate: diff check, lint/typecheck/build, full coverage, FIX-004 E2E, then Phase 01-03 gates. |
| `npm run lint` | ESLint with **zero warnings** allowed. |
| `npm run typecheck` | TypeScript check without emit. |
| `npm run stack:up` | Same as `./scripts/dev-up.sh` — install deps, `.env`, Postgres, migrations. |
| `npm run stack:down` | Same as `./scripts/dev-down.sh` — stop Compose Postgres. |
| `npm run db:up` | Run `docker compose up -d --wait`. With only the base compose file this starts Postgres; with a local override it may also start the app service. |
| `npm run db:down` | Stop the Compose Postgres service (named volume keeps data). |
| `npm run db:migrate` | Apply SQL migrations from `drizzle/` (requires `DATABASE_URL`). |
| `npm run collector:refresh` | Run the collector: scan `DASHBOARD_REPO_ROOT`, upsert repos, sync PR metadata, reviews, and PR sizes for eligible clones, then record sync status/errors. |
| `npm run db:import-github` | Import or update PRs for explicit `owner/repo` slugs without local clones (see [Scripts guide](../Setup/scripts.md)). |

For behaviour, environment variables, and when to use refresh vs GitHub import, see **[Scripts and CLI commands](../Setup/scripts.md)**.

## Running a second instance from a git worktree

Git worktrees are fully independent — two worktrees can run side by side with no
interference at the git level. The friction is purely about ports and Docker
container names.

### Host-side dev server (no Docker app container)

```bash
# In the worktree directory:
npm install          # node_modules are NOT shared between worktrees
npm run dev -- --port 3001   # avoid clashing with the main instance on 3000
```

`scripts/dev.ts` constructs the Vite binary path from `process.cwd()`, so you
must run the command **from the worktree directory** (or use `npm run` which sets
the cwd automatically).

### Full Docker stack alongside an already-running stack

The main stack occupies container names `dddd-app` / `dddd-postgres` and ports
`3000` / `54332`. A worktree stack needs different names and ports.

**Option A — own Postgres** (fully isolated databases):

```yaml
# docker-compose.override.yml in the worktree (gitignored)
services:
  postgres:
    container_name: dddd-postgres-td
    ports:
      - '54333:5432'   # must use a *new* key, not replace — compose merges arrays
  app:
    build: .
    container_name: dddd-app-td
    init: true
    depends_on:
      postgres:
        condition: service_healthy
    env_file: .env
    environment:
      DATABASE_URL: postgresql://dddd:dddd_local_dev@postgres:5432/dddd_dev
      TEST_DATABASE_URL: postgresql://dddd:dddd_local_dev@postgres:5432/dddd_test
      DASHBOARD_REPO_ROOT: /repos
    ports:
      - '3001:3000'
    volumes:
      - .:/app
      - /app/node_modules
      - 'd:\Downloaded\dddd_repos:/repos'
```

> **Gotcha**: `ports` in an override file is **appended**, not replaced. Writing
> `- '54333:5432'` alongside the base file's `- '54332:5432'` gives the container
> *both* bindings — the 54332 conflict still fires. Use a distinct host-port that
> doesn't clash, or use Option B.

**Option B — share the running Postgres** (same data, saves a container):

```yaml
# docker-compose.override.yml in the worktree
services:
  postgres:
    profiles:
      - skip   # prevents compose from starting a second Postgres

  app:
    build: .
    container_name: dddd-app-td
    init: true
    # no depends_on — postgres is external
    env_file: .env
    environment:
      DATABASE_URL: postgresql://dddd:dddd_local_dev@host.docker.internal:54332/dddd_dev
      TEST_DATABASE_URL: postgresql://dddd:dddd_local_dev@host.docker.internal:54332/dddd_test
      DASHBOARD_REPO_ROOT: /repos
    ports:
      - '3001:3000'
    volumes:
      - .:/app
      - /app/node_modules
      - 'd:\Downloaded\dddd_repos:/repos'
```

`host.docker.internal` is the Docker Desktop magic hostname that resolves to the
host machine from inside a container (works on Windows and macOS Docker Desktop).

Then start with:

```bash
docker compose up --build -d --wait
```

The image is tagged after the worktree directory name (e.g. `team_dropdown-app`),
so it doesn't collide with the main `dddd-app` image either.

## Testing conventions

- Prefer **tests first** for new behaviour (see the implementation plan per task).
- **Unit / component**: Vitest + Testing Library; shared DOM matchers are loaded from **`tests/setup.ts`**.
- **E2E**: Playwright configuration is **`playwright.config.ts`** at the repo root; specs go under **`tests/e2e/`**. `npm run test:e2e` uses a disposable test database (`TEST_DATABASE_URL`, default `dddd_test`), starts the dev server via **`scripts/e2e-web-server.sh`**, applies migrations, and runs the dashboard smoke flow using a no-network refresh stub (`DASHBOARD_E2E_REFRESH_STUB`). `npm run test:e2e:live` and `npm run test:e2e:live:current` are intentionally separate: they use the real GitHub API and real configured database/repository mapping, and fail if the latest live collector run is `failed`, if GitHub PR sync records auth/access errors, or if no merged PRs are in range. After a fresh `npm install`, run **`npx playwright install chromium`** once so the browser binary exists.

## Source drill-down routes

The home route keeps metric sections on one scrolling dashboard. The app also exposes local source/provenance routes linked from the dashboard freshness and metric surfaces:

- `/sources/merged-prs`
- `/sources/repos`
- `/sources/sync`
- `/sources/sync-errors`

## Useful links

- [Local onboarding](../Setup/local-onboarding.md) — `DATABASE_URL`, repo root, GitHub token, team mapping.
- [GitHub token setup](../Setup/github-token.md).
- [Trackable roadmap checklist](../Roadmap/trackable-roadmap.md) — execution status vs phases.
