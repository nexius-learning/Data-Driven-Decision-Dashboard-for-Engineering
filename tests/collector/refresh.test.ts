import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { desc, eq } from 'drizzle-orm'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest'

import { GitHubClient } from '~/collector/github-client'
import * as prSizeSync from '~/collector/pr-size-sync'
import { refreshLocalData } from '~/collector/refresh'
import { createDb, runMigrations } from '~/db/client'
import { pullRequests, repositories, syncErrors, syncRuns } from '~/db/schema'

const execFileAsync = promisify(execFile)

const databaseUrl = process.env.DATABASE_URL?.trim()

const defaultMappingJson = JSON.stringify({
  teams: [
    {
      name: 'TeamA',
      repoPatterns: ['a*', 'b*', 'c*', 'g*', 'l*', 'o*', 'r*', 's*', 'x*', 'z*'],
    },
  ],
  includeRepoPatterns: ['*'],
})

async function writeMapping(dir: string): Promise<string> {
  const p = path.join(dir, 'team-mapping.json')
  await writeFile(p, defaultMappingJson, 'utf8')
  return p
}

async function initGitRepoWithOrigin(root: string, name: string, remoteUrl: string): Promise<string> {
  const rootPath = path.resolve(root)
  const repoPath = path.join(rootPath, name)
  await mkdir(repoPath, { recursive: true })
  await execFileAsync('git', ['init'], { cwd: repoPath })
  await execFileAsync('git', ['remote', 'add', 'origin', remoteUrl], { cwd: repoPath })
  return repoPath
}

describe('refresh', () => {
  let db: ReturnType<typeof createDb>
  let listSpy: MockInstance

  beforeAll(async () => {
    await mkdir(path.join(process.cwd(), '.tmp'), { recursive: true })
    await runMigrations(databaseUrl)
    db = createDb(databaseUrl!)
  })

  afterAll(async () => {
    await db.$client.end({ timeout: 5 })
  })

  beforeEach(() => {
    listSpy = vi.spyOn(GitHubClient.prototype, 'listPullRequests').mockResolvedValue([])
    vi.spyOn(GitHubClient.prototype, 'listPullRequestReviews').mockResolvedValue([])
    vi.spyOn(GitHubClient.prototype, 'listPullRequestReviewComments').mockResolvedValue([])
    vi.spyOn(GitHubClient.prototype, 'listOrgRepositories').mockResolvedValue([])
    vi.spyOn(prSizeSync, 'syncRepositoryPrSizes').mockResolvedValue({
      ok: 0,
      skipped: 0,
      failed: 0,
    })
  })

  afterEach(async () => {
    listSpy.mockRestore()
    vi.restoreAllMocks()
    // Clean shared sync tables and repositories so tests are order-independent.
    await db.delete(syncErrors)
    await db.delete(pullRequests)
    await db.delete(repositories)
    await db.delete(syncRuns)
  })

  it('refresh_discovers_and_syncs_repositories', async () => {
    const root = await mkdtemp(path.join(process.cwd(), '.tmp', 'refresh-sync-'))
    const mappingPath = await writeMapping(root)
    try {
      await initGitRepoWithOrigin(root, 'svc', 'https://github.com/gde-mit/svc.git')
      listSpy.mockResolvedValue([
        {
          githubNodeId: 'n1',
          number: 1,
          title: 'JIRA-1 ok',
          state: 'closed' as const,
          isDraft: false,
          openedAt: new Date('2024-01-01T00:00:00.000Z'),
          updatedAt: new Date('2024-01-02T00:00:00.000Z'),
          mergedAt: new Date('2024-01-02T00:00:00.000Z'),
          mergeCommitSha: null,
          url: 'https://github.com/gde-mit/svc/pull/1',
        },
      ])

      const summary = await refreshLocalData({
        databaseUrl: databaseUrl!,
        repoRoot: root,
        teamMappingPath: mappingPath,
        githubSyncOwner: 'gde-mit',
      })

      expect(summary.reposScanned).toBe(1)
      expect(summary.reposIncluded).toBe(1)
      expect(summary.prsSeen).toBe(1)
      expect(summary.status).toBe('success')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refresh_skips_excluded_repositories', async () => {
    const root = await mkdtemp(path.join(process.cwd(), '.tmp', 'refresh-excl-'))
    const mappingPath = path.join(root, 'map.json')
    await writeFile(
      mappingPath,
      JSON.stringify({
        teams: [{ name: 'T', repoPatterns: ['other'] }],
        includeRepoPatterns: ['only-this'],
      }),
      'utf8',
    )
    try {
      await initGitRepoWithOrigin(root, 'other', 'https://github.com/gde-mit/other.git')
      const summary = await refreshLocalData({
        databaseUrl: databaseUrl!,
        repoRoot: root,
        teamMappingPath: mappingPath,
        githubSyncOwner: 'gde-mit',
      })
      expect(summary.reposIncluded).toBe(0)
      expect(listSpy).not.toHaveBeenCalled()
      expect(summary.status).toBe('success')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refresh_skips_wrong_github_owner_repositories', async () => {
    const root = await mkdtemp(path.join(process.cwd(), '.tmp', 'refresh-owner-'))
    const mappingPath = await writeMapping(root)
    try {
      await initGitRepoWithOrigin(root, 'x', 'https://github.com/other-org/x.git')
      const summary = await refreshLocalData({
        databaseUrl: databaseUrl!,
        repoRoot: root,
        teamMappingPath: mappingPath,
        githubSyncOwner: 'gde-mit',
      })
      expect(summary.reposIncluded).toBe(0)
      expect(listSpy).not.toHaveBeenCalled()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refresh_uses_initial_sync_from_for_fresh_database', async () => {
    const root = await mkdtemp(path.join(process.cwd(), '.tmp', 'refresh-init-'))
    const mappingPath = await writeMapping(root)
    try {
      await initGitRepoWithOrigin(root, 'a', 'https://github.com/gde-mit/a.git')
      const initial = new Date('2025-06-01T00:00:00.000Z')
      await refreshLocalData({
        databaseUrl: databaseUrl!,
        repoRoot: root,
        teamMappingPath: mappingPath,
        githubSyncOwner: 'gde-mit',
        initialSyncFrom: initial,
      })
      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          initialSyncFrom: initial,
        }),
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refresh_respects_github_sync_concurrency', async () => {
    const root = await mkdtemp(path.join(process.cwd(), '.tmp', 'refresh-conc-'))
    const mappingPath = await writeMapping(root)
    try {
      for (const name of ['r1', 'r2', 'r3']) {
        await initGitRepoWithOrigin(root, name, `https://github.com/gde-mit/${name}.git`)
      }
      let inFlight = 0
      let maxInFlight = 0
      listSpy.mockImplementation(async () => {
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        await new Promise((res) => setTimeout(res, 25))
        inFlight -= 1
        return []
      })
      await refreshLocalData({
        databaseUrl: databaseUrl!,
        repoRoot: root,
        teamMappingPath: mappingPath,
        githubSyncOwner: 'gde-mit',
        githubSyncConcurrency: 2,
      })
      expect(maxInFlight).toBeLessThanOrEqual(2)
      expect(maxInFlight).toBeGreaterThanOrEqual(2)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refresh_continues_after_repo_error', async () => {
    const root = await mkdtemp(path.join(process.cwd(), '.tmp', 'refresh-cont-'))
    const mappingPath = await writeMapping(root)
    try {
      await initGitRepoWithOrigin(root, 'good', 'https://github.com/gde-mit/good.git')
      await initGitRepoWithOrigin(root, 'bad', 'https://github.com/gde-mit/bad.git')
      listSpy.mockImplementation(async (input: { owner: string; repo: string }) => {
        if (input.repo === 'bad') {
          throw new Error('github down')
        }
        return []
      })
      const summary = await refreshLocalData({
        databaseUrl: databaseUrl!,
        repoRoot: root,
        teamMappingPath: mappingPath,
        githubSyncOwner: 'gde-mit',
        githubSyncConcurrency: 1,
      })
      expect(summary.status).toBe('partial')
      expect(summary.syncErrors).toBeGreaterThanOrEqual(1)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refresh_records_sync_run_status', async () => {
    const root = await mkdtemp(path.join(process.cwd(), '.tmp', 'refresh-run-'))
    const mappingPath = await writeMapping(root)
    try {
      await initGitRepoWithOrigin(root, 'z', 'https://github.com/gde-mit/z.git')
      await refreshLocalData({
        databaseUrl: databaseUrl!,
        repoRoot: root,
        teamMappingPath: mappingPath,
        githubSyncOwner: 'gde-mit',
      })
      const [last] = await db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(1)
      expect(last?.status).toBe('success')
      expect(last?.finishedAt).not.toBeNull()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refresh_records_invalid_lifecycle_sync_error', async () => {
    const root = await mkdtemp(path.join(process.cwd(), '.tmp', 'refresh-life-'))
    const mappingPath = await writeMapping(root)
    try {
      await initGitRepoWithOrigin(root, 'life', 'https://github.com/gde-mit/life.git')
      listSpy.mockResolvedValue([
        {
          githubNodeId: 'bad',
          number: 9,
          title: 'x',
          state: 'closed' as const,
          isDraft: false,
          openedAt: new Date('2024-02-02T00:00:00.000Z'),
          updatedAt: new Date('2024-02-02T00:00:00.000Z'),
          mergedAt: new Date('2024-02-01T00:00:00.000Z'),
          mergeCommitSha: null,
          url: 'https://github.com/gde-mit/life/pull/9',
        },
      ])
      const summary = await refreshLocalData({
        databaseUrl: databaseUrl!,
        repoRoot: root,
        teamMappingPath: mappingPath,
        githubSyncOwner: 'gde-mit',
      })
      expect(summary.status).toBe('partial')
      const errs = await db.select().from(syncErrors).where(eq(syncErrors.source, 'invalid_pr_lifecycle'))
      expect(errs.length).toBeGreaterThanOrEqual(1)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refresh_updates_last_pr_synced_at_after_success', async () => {
    const root = await mkdtemp(path.join(process.cwd(), '.tmp', 'refresh-cursor-'))
    const mappingPath = await writeMapping(root)
    try {
      const repoPath = await initGitRepoWithOrigin(root, 'cur', 'https://github.com/gde-mit/cur.git')
      const u = new Date('2024-03-03T12:00:00.000Z')
      listSpy.mockResolvedValue([
        {
          githubNodeId: 'c1',
          number: 1,
          title: 'K-1',
          state: 'closed' as const,
          isDraft: false,
          openedAt: new Date('2024-03-01T00:00:00.000Z'),
          updatedAt: u,
          mergedAt: new Date('2024-03-02T00:00:00.000Z'),
          mergeCommitSha: null,
          url: 'https://github.com/gde-mit/cur/pull/1',
        },
      ])
      await refreshLocalData({
        databaseUrl: databaseUrl!,
        repoRoot: root,
        teamMappingPath: mappingPath,
        githubSyncOwner: 'gde-mit',
      })
      const [row] = await db.select().from(repositories).where(eq(repositories.path, repoPath))
      expect(row?.lastPrSyncedAt?.toISOString()).toBe(u.toISOString())
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refresh_uses_max_persisted_github_updated_at_as_cursor', async () => {
    const root = await mkdtemp(path.join(process.cwd(), '.tmp', 'refresh-stop-'))
    const mappingPath = await writeMapping(root)
    try {
      await initGitRepoWithOrigin(root, 'stop', 'https://github.com/gde-mit/stop.git')
      const stopAt = new Date('2024-04-04T10:00:00.000Z')
      listSpy.mockResolvedValueOnce([
        {
          githubNodeId: 's1',
          number: 1,
          title: 'K-1',
          state: 'closed' as const,
          isDraft: false,
          openedAt: new Date('2024-04-01T00:00:00.000Z'),
          updatedAt: stopAt,
          mergedAt: new Date('2024-04-02T00:00:00.000Z'),
          mergeCommitSha: null,
          url: 'https://github.com/gde-mit/stop/pull/1',
        },
      ])
      await refreshLocalData({
        databaseUrl: databaseUrl!,
        repoRoot: root,
        teamMappingPath: mappingPath,
        githubSyncOwner: 'gde-mit',
      })
      listSpy.mockClear()
      await refreshLocalData({
        databaseUrl: databaseUrl!,
        repoRoot: root,
        teamMappingPath: mappingPath,
        githubSyncOwner: 'gde-mit',
      })
      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          stopAfterUpdatedAt: stopAt,
        }),
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refresh_last_pr_synced_at_never_decreases', async () => {
    const root = await mkdtemp(path.join(process.cwd(), '.tmp', 'refresh-hwm-'))
    const mappingPath = await writeMapping(root)
    try {
      const repoPath = await initGitRepoWithOrigin(root, 'hwm', 'https://github.com/gde-mit/hwm.git')
      const tHigh = new Date('2024-06-01T00:00:00.000Z')
      const tLow = new Date('2024-04-01T00:00:00.000Z') // older than tHigh

      // First run: establishes lastPrSyncedAt = tHigh
      listSpy.mockResolvedValueOnce([
        {
          githubNodeId: 'h1',
          number: 1,
          title: 'K-1',
          state: 'closed' as const,
          isDraft: false,
          openedAt: new Date('2024-05-01T00:00:00.000Z'),
          updatedAt: tHigh,
          mergedAt: new Date('2024-05-15T00:00:00.000Z'),
          mergeCommitSha: null,
          url: 'https://github.com/gde-mit/hwm/pull/1',
        },
      ])
      await refreshLocalData({
        databaseUrl: databaseUrl!,
        repoRoot: root,
        teamMappingPath: mappingPath,
        githubSyncOwner: 'gde-mit',
      })

      // Second run: mock returns a PR with an older updatedAt (simulates edge case)
      listSpy.mockResolvedValueOnce([
        {
          githubNodeId: 'h2',
          number: 2,
          title: 'K-2',
          state: 'closed' as const,
          isDraft: false,
          openedAt: new Date('2024-03-01T00:00:00.000Z'),
          updatedAt: tLow,
          mergedAt: new Date('2024-03-15T00:00:00.000Z'),
          mergeCommitSha: null,
          url: 'https://github.com/gde-mit/hwm/pull/2',
        },
      ])
      await refreshLocalData({
        databaseUrl: databaseUrl!,
        repoRoot: root,
        teamMappingPath: mappingPath,
        githubSyncOwner: 'gde-mit',
      })

      const [row] = await db.select().from(repositories).where(eq(repositories.path, repoPath))
      // Advance-only: lastPrSyncedAt must not decrease below tHigh
      expect(row?.lastPrSyncedAt?.getTime()).toBeGreaterThanOrEqual(tHigh.getTime())
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refresh_records_remote_identity_change_warning', async () => {
    const root = await mkdtemp(path.join(process.cwd(), '.tmp', 'refresh-id-'))
    const mappingPath = await writeMapping(root)
    try {
      const repoPath = await initGitRepoWithOrigin(root, 'same', 'https://github.com/gde-mit/repo-one.git')
      await refreshLocalData({
        databaseUrl: databaseUrl!,
        repoRoot: root,
        teamMappingPath: mappingPath,
        githubSyncOwner: 'gde-mit',
      })
      await execFileAsync('git', ['remote', 'set-url', 'origin', 'https://github.com/gde-mit/repo-two.git'], {
        cwd: repoPath,
      })
      const summary = await refreshLocalData({
        databaseUrl: databaseUrl!,
        repoRoot: root,
        teamMappingPath: mappingPath,
        githubSyncOwner: 'gde-mit',
      })
      expect(summary.syncWarnings).toBeGreaterThanOrEqual(1)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refresh_status_success_when_zero_ready_repos', async () => {
    const root = await mkdtemp(path.join(process.cwd(), '.tmp', 'refresh-zero-'))
    const mappingPath = await writeMapping(root)
    try {
      const summary = await refreshLocalData({
        databaseUrl: databaseUrl!,
        repoRoot: root,
        teamMappingPath: mappingPath,
        githubSyncOwner: 'gde-mit',
      })
      expect(summary.reposIncluded).toBe(0)
      expect(summary.status).toBe('success')
      expect(summary.syncErrors).toBe(0)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refresh_e2e_stub_writes_finished_sync_run', async () => {
    vi.stubEnv('DASHBOARD_E2E_REFRESH_STUB', '1')
    try {
      const summary = await refreshLocalData({ databaseUrl: databaseUrl! })
      expect(summary.status).toBe('success')
      expect(summary.reposScanned).toBe(0)
      const stubRows = await db.select().from(syncRuns).where(eq(syncRuns.message, 'e2e_stub'))
      expect(stubRows.length).toBeGreaterThanOrEqual(1)
      expect(stubRows[0]!.finishedAt).not.toBeNull()
    } finally {
      await db.delete(syncRuns).where(eq(syncRuns.message, 'e2e_stub'))
      vi.unstubAllEnvs()
    }
  })
})
