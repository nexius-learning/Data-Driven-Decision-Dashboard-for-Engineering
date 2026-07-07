# Dev-mode image: runs `npm run dev` (Vite) inside the container.
FROM node:20-bookworm-slim

# Runtime deps:
#   git              — collector runs `git fetch` against /repos clones
#   ca-certificates  — HTTPS to github.com
#   cron             — schedules the dashboard refresh daily (see crontab)
#   tzdata           — required for $TZ below to actually resolve; without
#                      it glibc falls back to UTC even if TZ is set
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates cron tzdata \
    && rm -rf /var/lib/apt/lists/*

# Use Budapest local time so cron's `0 1 * * *` fires at local 01:00
# (CET/CEST) and timestamps in [clone-startup]/[refresh-cron] log lines match the dev's wall clock.
ENV TZ=Europe/Budapest

# Credential helper for HTTPS GitHub fetches. Reads $GITHUB_TOKEN from the
# environment at credential-request time (not at config time, because the
# single-quoted snippet is stored literally in git config and expanded by
# the helper shell when git invokes it). Scoped to github.com so it does
# not affect other hosts.
RUN git config --global credential.https://github.com.helper \
    '!f() { test "$1" = get && printf "%s\n" "username=x-access-token" "password=$GITHUB_TOKEN"; }; f'

# If $GITHUB_TOKEN is ever empty or wrong, the credential helper returns
# password=<empty>; without this, git would fall back to an interactive
# prompt on the TTY (which is allocated by `docker compose exec`) and
# the clone loop would hang silently.
ENV GIT_TERMINAL_PROMPT=0

WORKDIR /app

# Install deps first for better layer caching. Use `npm ci` rather than
# `npm install` so the image matches the committed package-lock.json
# exactly, without mutating the lockfile inside the image.
COPY package.json package-lock.json ./
RUN npm ci

# App source is bind-mounted at runtime via docker compose so edits hot-reload.
# We still copy here so the image is usable standalone.
COPY . .

# Install the cron schedule into /etc/cron.d/. Files there must be
# owned by root, mode 0644, with no dots in the filename. Scripts under
# /app/scripts/ are always invoked as `bash <path>`, so we do not need
# (and bind-mounting `.:/app` would clobber anyway) executable mode.
RUN install -m 0644 /app/scripts/docker/refresh-org-repos.cron /etc/cron.d/refresh-org-repos

EXPOSE 3000

# Entrypoint runs in order:
#   1. Dump container env to /etc/container.env so cron jobs (which run
#      with a stripped env) can re-source it.
#   2. Start cron in the foreground inside a backgrounded subshell so
#      its own diagnostic messages reach `docker compose logs` (prefixed
#      [crond]). Crontab has 0 1 (refresh) only — @reboot is
#      intentionally absent; the initial clone is launched directly
#      from the entrypoint instead because @reboot in /etc/cron.d/ is
#      unreliable across container restart-vs-recreate.
#   3. Apply DB migrations (synchronously, before forking long work).
#   4. Background the initial clone (idempotent; runs every container
#      start to cover newly-added org repos).
#   5. exec into Vite. Combined with `init: true` on the compose
#      service, tini stays PID 1 and forwards SIGTERM to npm/Node.
#
# Vite is pinned to 127.0.0.1 in vite.config.ts; override with --host
# 0.0.0.0 so the port is reachable from the host.
CMD ["bash", "/app/scripts/docker/container-entrypoint.sh"]
