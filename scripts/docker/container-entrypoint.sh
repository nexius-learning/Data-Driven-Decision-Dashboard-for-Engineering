#!/usr/bin/env bash
# Container entrypoint for the dev image. Brings up the supporting bits
# (env dump, cron daemon, initial org clone, db migrations) before
# exec'ing into Vite.
#
# Why this script exists:
#   - cron jobs do NOT inherit the container's environment. They start
#     with a minimal env (PATH, HOME, ...). We dump the keys the clone
#     and refresh scripts need into /etc/container.env, and the cron
#     wrappers source that file before running.
#   - cron daemonises itself, so we can start it here and then `exec`
#     into Vite without losing it.
#   - The initial org clone runs from here (in the background) rather
#     than via cron's `@reboot`, which is unreliable in containers.
#   - `exec npm run dev` chains into Vite; combined with `init: true`
#     on the compose service (tini as PID 1), SIGTERM from
#     `docker compose down` reaches Node cleanly.

set -euo pipefail

# 1. Dump the env keys the clone + refresh scripts need into a sourceable
#    file. Single-quote values so embedded special chars survive (GitHub
#    PATs are [A-Za-z0-9_] and our other values have no quotes today;
#    revisit if values ever contain single quotes). Mode 0600 is
#    defense-in-depth for any future image that adds a non-root user —
#    the container today runs as root so it offers no protection now.
umask 077
{
  printf "export GITHUB_TOKEN='%s'\n"               "${GITHUB_TOKEN:-}"
  printf "export GITHUB_SYNC_OWNER='%s'\n"          "${GITHUB_SYNC_OWNER:-}"
  printf "export GITHUB_API_BASE_URL='%s'\n"        "${GITHUB_API_BASE_URL:-https://api.github.com}"
  printf "export GITHUB_SYNC_CONCURRENCY='%s'\n"    "${GITHUB_SYNC_CONCURRENCY:-2}"
  printf "export DASHBOARD_REPO_ROOT='%s'\n"        "${DASHBOARD_REPO_ROOT:-/repos}"
  printf "export DASHBOARD_DEFAULT_RANGE_WEEKS='%s'\n" "${DASHBOARD_DEFAULT_RANGE_WEEKS:-8}"
  printf "export DASHBOARD_INITIAL_SYNC_FROM='%s'\n" "${DASHBOARD_INITIAL_SYNC_FROM:-2026-01-01}"
  printf "export DATABASE_URL='%s'\n"               "${DATABASE_URL:-}"
  printf "export TEST_DATABASE_URL='%s'\n"          "${TEST_DATABASE_URL:-}"
  printf "export TEAM_MAPPING_PATH='%s'\n"          "${TEAM_MAPPING_PATH:-./config/team-mapping.json}"
  printf "export TZ='%s'\n"                         "${TZ:-UTC}"
  printf "export PATH='%s'\n"                       "${PATH}"
} > /etc/container.env
umask 022

# 2. Start cron in the foreground inside a backgrounded subshell so its
#    own diagnostic messages (job-start lines, exec errors) are visible
#    in `docker compose logs app` instead of being swallowed by a syslog
#    socket that does not exist in this container. -L 15 maxes out
#    cron's own verbosity.
( cron -f -L 15 2>&1 | sed 's/^/[crond] /' ) &

# 3. Apply DB migrations before forking the long-running initial clone.
#    A migration failure here aborts the entrypoint cleanly (via set -e)
#    instead of leaving a half-finished clone on the bind-mount that
#    the next startup would then have to repair.
npm run db:migrate

# 4. Kick off the initial org clone in the background. This replaces
#    cron's `@reboot` entry (unreliable across container
#    restart-vs-recreate). Runs every container start; the clone script
#    is idempotent so existing clones are skipped. Invoke via `bash`
#    explicitly — host bind-mount can override the script's mode bits
#    on platforms where git's core.filemode is true.
( bash /app/scripts/docker/run-clone-at-startup.sh ) &

# 5. Hand off to Vite. exec replaces the shell with npm; combined with
#    `init: true` on the compose service, tini stays PID 1 and forwards
#    signals to npm → Node. --host 0.0.0.0 overrides vite.config.ts's
#    127.0.0.1 pin.
exec npm run dev -- --host 0.0.0.0
