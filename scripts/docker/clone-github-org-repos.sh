#!/usr/bin/env bash
# Clone every repo from the configured GitHub org ($GITHUB_SYNC_OWNER) that
# is NOT excluded by config/team-mapping.json (and not archived) into
# $DASHBOARD_REPO_ROOT. GitHub-only: uses the GitHub REST API and clones
# over https://github.com/.
#
# Designed to run INSIDE the docker container:
#   docker compose exec app bash scripts/docker/clone-github-org-repos.sh
#
# Requires git, curl, node — all present in the dev image. Inherits
# $GITHUB_TOKEN, $GITHUB_SYNC_OWNER, $DASHBOARD_REPO_ROOT from the
# container environment (loaded from .env / docker-compose overrides).
#
# Idempotent: existing clones are skipped. Uses --filter=blob:none for a
# blobless clone (full ref history, lazy blob fetch on demand).
#
# Authentication uses the credential helper configured globally in the
# Dockerfile (reads $GITHUB_TOKEN at fetch time). Token never lands in
# argv or .git/config on disk.
#
# At the end, prints a categorized summary of every repo visible to the
# token but NOT cloned, with the reason: archived, excluded by pattern
# (and which pattern), or not matched by includeRepoPatterns.

set -euo pipefail

# Script lives in scripts/docker/; the project root is two levels up.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

# Serialise concurrent invocations. Two clones into the same repo root
# (e.g. the entrypoint's initial clone + cron's 00:00 entry racing across
# a midnight boundary) can corrupt half-cloned `.git` directories. Use
# a non-blocking flock so the second caller exits cleanly instead of
# queueing up behind a long-running first run.
#
# `bash` (this script's interpreter) honours `|| true` after an `exec`
# with redirection — verified for our base image. The fallback path
# (lockdir doesn't exist or `flock` is missing) proceeds without
# serialisation rather than aborting; the broken-clone repair logic
# below is the backstop if two clones do race.
LOCKFILE="${CLONE_LOCKFILE:-/var/lock/clone-github-org-repos.lock}"
LOCKDIR="$(dirname "$LOCKFILE")"
if [[ -d "$LOCKDIR" ]] && exec 9>"$LOCKFILE" 2>/dev/null \
   && command -v flock >/dev/null 2>&1; then
  if ! flock -n 9; then
    echo "==> another clone is already running (lockfile $LOCKFILE held); exiting cleanly"
    exit 0
  fi
else
  echo "==> note: clone lockfile unavailable at $LOCKFILE; proceeding without serialisation" >&2
fi

: "${GITHUB_TOKEN:?GITHUB_TOKEN missing from environment}"
: "${GITHUB_SYNC_OWNER:?GITHUB_SYNC_OWNER missing from environment}"
: "${DASHBOARD_REPO_ROOT:?DASHBOARD_REPO_ROOT missing from environment}"
: "${GITHUB_API_BASE_URL:=https://api.github.com}"

REPO_ROOT="${DASHBOARD_REPO_ROOT%/}"
mkdir -p "$REPO_ROOT"

echo "==> clone target: $REPO_ROOT"
echo "==> org:          $GITHUB_SYNC_OWNER"
echo "==> api:          $GITHUB_API_BASE_URL"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "==> fetching org repo list"
page=1
while :; do
  http_code=$(curl -sS -o "$WORK/p$page.json" -w '%{http_code}' \
    -H "Authorization: Bearer $GITHUB_TOKEN" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    -H "User-Agent: dddd-clone-org-repos" \
    "$GITHUB_API_BASE_URL/orgs/$GITHUB_SYNC_OWNER/repos?per_page=100&type=all&page=$page")

  if [[ "$http_code" != "200" ]]; then
    echo "error: GitHub API returned $http_code on page $page" >&2
    sed 's/^/      /' "$WORK/p$page.json" >&2 || true
    exit 1
  fi

  count=$(node -e "const a=JSON.parse(require('fs').readFileSync('$WORK/p$page.json','utf8'));process.stdout.write(String(Array.isArray(a)?a.length:0));")
  if [[ "$count" -lt 100 ]]; then break; fi
  page=$((page + 1))
  if [[ "$page" -gt 20 ]]; then
    echo "error: more than 20 pages of repos, aborting to avoid runaway" >&2
    exit 1
  fi
done

echo "==> filtering against ${TEAM_MAPPING_PATH:-./config/team-mapping.json}"
node -e "
const fs = require('fs');
const path = require('path');
const cfg = JSON.parse(fs.readFileSync('${TEAM_MAPPING_PATH:-./config/team-mapping.json}','utf8'));
const files = fs.readdirSync('$WORK').filter(f=>f.startsWith('p') && f.endsWith('.json')).sort();
let all = [];
for (const f of files) {
  const arr = JSON.parse(fs.readFileSync(path.join('$WORK', f),'utf8'));
  if (Array.isArray(arr)) all = all.concat(arr);
}
function match(name, pat){
  if (pat === '*') return true;
  if (!pat.includes('*')) return name === pat;
  if (pat.startsWith('*')) return name.endsWith(pat.slice(1));
  return name.startsWith(pat.slice(0, -1));
}
const excl = cfg.excludeRepoPatterns || [];
const incl = cfg.includeRepoPatterns;
function firstMatchingPattern(name, pats){
  for (const p of pats) if (match(name, p)) return p;
  return null;
}
const want = [];
const skipped = []; // {name, reason, detail}
for (const r of all) {
  if (r.archived) {
    skipped.push({ name: r.name, reason: 'archived', detail: '' });
    continue;
  }
  const exclP = firstMatchingPattern(r.name, excl);
  if (exclP !== null) {
    skipped.push({ name: r.name, reason: 'excluded', detail: exclP });
    continue;
  }
  if (incl && !incl.some(p => match(r.name, p))) {
    skipped.push({ name: r.name, reason: 'not-included', detail: '' });
    continue;
  }
  want.push(r);
}
fs.writeFileSync('$WORK/repos.txt', want.map(r => r.name).sort().join('\n') + '\n');
fs.writeFileSync(
  '$WORK/skipped.tsv',
  skipped
    .sort((a,b) => a.reason.localeCompare(b.reason) || a.name.localeCompare(b.name))
    .map(s => [s.name, s.reason, s.detail].join('\t')).join('\n') + (skipped.length ? '\n' : '')
);
console.log('to clone:', want.length, '/ skipped:', skipped.length, '/ total:', all.length);
"

total=$(grep -c . "$WORK/repos.txt" || true)
echo "==> cloning $total repos into $REPO_ROOT"
echo

skipped=0
cloned=0
failed=0
repaired=0
i=0

while IFS= read -r name; do
  [[ -z "$name" ]] && continue
  i=$((i + 1))
  target="$REPO_ROOT/$name"

  # A `.git` directory exists from the very first HTTP roundtrip of git
  # clone, well before objects/refs are populated. Treat a clone as
  # "complete" only if HEAD resolves; otherwise rm -rf and re-clone so
  # half-finished clones from a previous `docker compose down` don't
  # stick forever.
  if [[ -d "$target/.git" ]]; then
    if git -C "$target" rev-parse --verify --quiet HEAD >/dev/null 2>&1; then
      printf '  [%d/%d] skip  %s\n' "$i" "$total" "$name"
      skipped=$((skipped + 1))
      continue
    fi
    printf '  [%d/%d] repair %s (broken clone — re-cloning)\n' "$i" "$total" "$name"
    if ! rm -rf "$target" 2>"$WORK/rm.err"; then
      echo "error: failed to remove broken clone at $target:" >&2
      sed 's/^/      /' "$WORK/rm.err" >&2 || true
      exit 1
    fi
    repaired=$((repaired + 1))
  fi

  printf '  [%d/%d] clone %s ... ' "$i" "$total" "$name"
  # Authentication is handled by the credential helper configured in the
  # Dockerfile, which reads $GITHUB_TOKEN from the environment. The token
  # therefore never appears in argv (avoids `ps` / `docker top` leak) and
  # is never written to the cloned repo's .git/config.
  if git clone --quiet --filter=blob:none \
      "https://github.com/${GITHUB_SYNC_OWNER}/${name}.git" "$target" \
      2>"$WORK/clone.err"; then
    echo "ok"
    cloned=$((cloned + 1))
  else
    echo "FAILED"
    sed 's/^/        /' "$WORK/clone.err" >&2 || true
    failed=$((failed + 1))
  fi
done < "$WORK/repos.txt"

echo
echo "==> done. cloned=$cloned already-cloned=$skipped repaired=$repaired failed=$failed total=$total"

if [[ -s "$WORK/skipped.tsv" ]]; then
  echo
  echo "==> repos visible to the token but NOT cloned by policy:"
  for reason in archived excluded not-included; do
    matches=$(awk -F '\t' -v r="$reason" '$2==r {print}' "$WORK/skipped.tsv")
    [[ -z "$matches" ]] && continue
    count=$(printf '%s\n' "$matches" | wc -l | tr -d ' ')
    case "$reason" in
      archived)     header="archived on GitHub";;
      excluded)     header="manually excluded (matches a pattern in excludeRepoPatterns)";;
      not-included) header="not matched by includeRepoPatterns";;
    esac
    echo
    echo "  [$reason] $count repos — $header"
    if [[ "$reason" == "excluded" ]]; then
      printf '%s\n' "$matches" | awk -F '\t' '{ printf "    %-50s  (matched: %s)\n", $1, $3 }'
    else
      printf '%s\n' "$matches" | awk -F '\t' '{ printf "    %s\n", $1 }'
    fi
  done
fi

if [[ "$failed" -gt 0 ]]; then
  exit 1
fi
