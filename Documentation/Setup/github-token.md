# GitHub Token Setup

Status: Current
Last updated: 2026-06-04

## Purpose

The dashboard collector uses GitHub access to fetch pull request metadata, review metadata, review comments, PR-detail fallback data for PR size, and private-clone git history for size sync. Private repositories require a token.

## Recommended Token Type

Use a fine-grained personal access token when possible.

GitHub docs:

- [Managing your personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
- [Creating a fine-grained personal access token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-fine-grained-personal-access-token)
- [Permissions required for fine-grained personal access tokens](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens)

## Minimum Access

For repositories you want to analyze, grant read access for pull request
metadata **and** repository contents.

Recommended fine-grained token setup:

- Resource owner: the organization or user that owns the repositories.
- Repository access: selected repositories, not all repositories, when possible.
- Repository permissions:
  - Pull requests: Read-only
  - Metadata: Read-only
  - Contents: Read-only

For the local dashboard's default `gde-mit` setup, **Resource owner must be
`gde-mit`**, and the **Selected repositories** list must include every repository
matched by `GITHUB_SYNC_OWNER`, `config/team-mapping.json`, and
`DASHBOARD_REPO_ROOT`. The permission names above are sufficient for the app's
REST calls and for `git fetch` against the local clones (used by PR-size sync):

- `GET /repos/{owner}/{repo}/pulls` accepts `pull_requests=read`.
- `GET /repos/{owner}/{repo}/pulls/{pull_number}` accepts `pull_requests=read`.
- `GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews` accepts `pull_requests=read`.
- `GET /repos/{owner}/{repo}/pulls/{pull_number}/comments` accepts `pull_requests=read`.
- The full-Docker clone helper also calls the org repos endpoint for `GITHUB_SYNC_OWNER`.
- `git clone` / `git fetch` over HTTPS accepts `contents=read`.

If only the API permissions are granted, REST sync will succeed but the
PR-size git-history step can log fetch-related sync errors and leave size data
incomplete when it runs `git fetch` against private clones.

If GitHub returns `404 Not Found` for private repositories even though the token
owner is correct, the token is not allowed to see those repositories. Check that:

- The token was created with resource owner `gde-mit`, or the value configured in `GITHUB_SYNC_OWNER`, not the user's own account.
- The selected repository list includes the target repositories, or repository
  access is set to all repositories for `gde-mit`.
- Any organization-required fine-grained PAT approval has completed.
- The user account that created the token can access those repositories through
  the GitHub API, not only through an SSH key.

## Add Token Locally

Edit `.env`:

```env
GITHUB_TOKEN=github_pat_your_token_here
```

Do not commit `.env`. It is gitignored.

## Verify Access

Use the app refresh flow, `npm run collector:refresh`, `npm run db:import-github`,
or the live E2E guards to verify access. If GitHub returns an auth or rate-limit
error, the dashboard should surface a sync error instead of failing silently.

Quick local verification, without printing the token:

```bash
env -u GITHUB_TOKEN node --input-type=module <<'NODE'
import fs from 'node:fs'

function readToken() {
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const match = /^\s*GITHUB_TOKEN\s*=\s*(.*)\s*$/.exec(line)
    if (!match) continue
    let value = match[1] ?? ''
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    return value.trim()
  }
  return ''
}

const headers = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'dddd-token-check',
  Authorization: `Bearer ${readToken()}`,
}

const owner = 'gde-mit'
const repo = 'replace-with-selected-repo'

for (const url of [
  'https://api.github.com/user',
  `https://api.github.com/repos/${owner}/${repo}/pulls?state=all&per_page=1`,
]) {
  const response = await fetch(url, { headers })
  const body = await response.json().catch(() => ({}))
  console.log({
    url,
    status: response.status,
    login: body.login,
    message: body.message,
    acceptedPermissions: response.headers.get('x-accepted-github-permissions'),
  })
}
NODE
```

Expected result:

- `/user` returns the intended GitHub login.
- Pull-request calls for a selected repository return `200`.
- `404 Not Found` means the token cannot see that repository, even if the
  permission names are correct.

For full-Docker org clone checks, also verify that the token can list repositories
for `GITHUB_SYNC_OWNER`; the clone helper uses that list before cloning matching
repositories into the bind-mounted repo root.

## Rotation

If the token is exposed or no longer needed:

1. Revoke it in GitHub token settings.
2. Generate a new token.
3. Replace `GITHUB_TOKEN` in `.env`.
