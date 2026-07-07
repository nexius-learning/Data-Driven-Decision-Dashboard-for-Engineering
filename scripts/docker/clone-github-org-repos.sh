#!/usr/bin/env bash
# Thin delegate: clones every repo the configured GitHub org exposes
# (per config/team-mapping.json) into $DASHBOARD_REPO_ROOT.
#
# All org-listing, pattern-filtering, cloning, broken-clone repair, and
# concurrency-locking logic lives in `refreshLocalData` (mode:
# 'clone-only'), invoked here via `npm run collector:refresh --
# --clone-only` — this script no longer duplicates any of it. See
# Documentation/Setup/scripts.md for the full `--clone-only` contract
# (exit codes, AlreadyRunningError handling, sync_runs recording).
#
# Designed to run INSIDE the docker container:
#   docker compose exec app bash scripts/docker/clone-github-org-repos.sh
#
# Inherits GITHUB_TOKEN, GITHUB_SYNC_OWNER, DASHBOARD_REPO_ROOT,
# DATABASE_URL, and friends from the container environment — already
# present for a manual `docker compose exec` shell, or sourced from
# /etc/container.env by run-clone-in-cron.sh when this script is
# triggered by cron or container start.
#
# Unlike the old standalone implementation, this script no longer
# prints a categorized breakdown of repos skipped by policy (archived /
# excluded / not-included) at the end of the run — that diagnostic
# lived only in the independent listing/filtering code replaced here
# and has no equivalent in the CLI's clone-only mode.

set -euo pipefail

# Script lives in scripts/docker/; the project root is two levels up.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

exec npm run --silent collector:refresh -- --clone-only
