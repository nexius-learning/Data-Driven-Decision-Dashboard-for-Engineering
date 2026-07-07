#!/usr/bin/env bash
# Startup wrapper for scripts/docker/clone-github-org-repos.sh.
#
# Invoked by container-entrypoint.sh at container start (NOT by cron — the
# 00:00 clone cron was retired; the 01:00 full-sync cron clones as its own
# first phase). It sources the container env dump produced by
# container-entrypoint.sh so GITHUB_TOKEN and friends are available even if
# this is ever wired into a stripped-env context, then invokes the clone
# script. Output is tagged with [clone-startup] so it stands out in
# `docker compose logs`.

set -uo pipefail

if [[ ! -r /etc/container.env ]]; then
  echo "[clone-startup] $(date -Iseconds) FATAL: /etc/container.env missing or unreadable" >&2
  exit 2
fi
# shellcheck disable=SC1091
. /etc/container.env

cd /app

echo "[clone-startup] $(date -Iseconds) starting clone-github-org-repos.sh"
# Tag the inner script's verbose output with the same prefix so a single
# `docker compose logs | grep '[clone-startup]'` catches per-repo progress
# too. pipefail (set above) lets the `if` see the script's exit code
# through the sed pipe.
if bash /app/scripts/docker/clone-github-org-repos.sh 2>&1 | sed 's/^/[clone-startup]   /'; then
  echo "[clone-startup] $(date -Iseconds) finished ok"
else
  rc=$?
  echo "[clone-startup] $(date -Iseconds) finished rc=$rc"
fi
