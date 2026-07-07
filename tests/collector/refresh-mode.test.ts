import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { desc, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest'

import { GitHubClient } from '~/collector/github-client'
import * as prSizeSync from '~/collector/pr-size-sync'
import { refreshLocalData } from '~/collector/refresh'
import * as repoClone from '~/collector/repo-clone'
import { createDb, runMigrations } from '~/db/client'
import { pullRequests, repositories, syncErrors, syncRuns } from '~/db/schema'

const databaseUrl = process.env.DATABASE_URL?.trim()

const minimalMappingJson = JSON.stringify({
  teams: [{ name: 'TeamA', repoPatterns: ['s*', 'g*', 'b*'] }],
  includeRepoPatterns: ['*'],
})

async function writeMapping(dir: string): Promise<string> {
  const p = path.join(dir, 'team-mapping.json')
  await writeFile(p, minimalMappingJson, 'utf8')
  return p
}

describe('refresh mode', () => {
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
    vi.spyOn(prSizeSync, 'syncRepositoryPrSizes').mockResolvedValue({ ok: 0, skipped: 0, failed: 0 })
  })

  afterEach(async () => {
    listSpy.mockRestore()
    vi.restoreAllMocks()
    await db.delete(syncErrors)
    await db.delete(pullRequests)
    await db.delete(repositories)
    await db.delete(syncRuns)
  })

  it('refresh_persists_mode_full_by_default', async () => {
    const root = await mkdtemp(path.join(process.cwd(), '.tmp', 'refresh-mode-default-'))
    const mappingPath = await writeMapping(root)
    try {
      await refreshLocalData({
        databaseUrl: databaseUrl!,
        repoRoot: root,
        teamMappingPath: mappingPath,
        githubSyncOwner: 'gde-mit',
      })
      const [last] = await db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(1)
      expect(last?.mode).toBe('full')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refresh_full_run_failing_before_any_phase_keeps_mode_full', async () => {
    const root = await mkdtemp(path.join(process.cwd(), '.tmp', 'refresh-mode-early-fail-'))
    const missingMappingPath = path.join(root, 'does-not-exist.json')
    const summary = await refreshLocalData({
      databaseUrl: databaseUrl!,
      repoRoot: root,
      teamMappingPath: missingMappingPath,
      githubSyncOwner: 'gde-mit',
    })
    expect(summary.status).toBe('failed')
    const [last] = await db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(1)
    expect(last?.status).toBe('failed')
    expect(last?.mode).toBe('full')
    expect(last?.phaseTimings).toBeNull()
  })

  it('refresh_clone_only_clones_but_skips_scanning_and_sync_phases', async () => {
    const root = await mkdtemp(path.join(process.cwd(), '.tmp', 'refresh-mode-cloneonly-'))
    const mappingPath = await writeMapping(root)
    try {
      vi.spyOn(GitHubClient.prototype, 'listOrgRepositories').mockResolvedValue([
        { name: 'svc', archived: false },
      ])
      const cloneSpy = vi.spyOn(repoClone, 'cloneOrUpdateRepository').mockResolvedValue('cloned')

      const summary = await refreshLocalData(
        { databaseUrl: databaseUrl!, repoRoot: root, teamMappingPath: mappingPath, githubSyncOwner: 'org' },
        { mode: 'clone-only' },
      )

      expect(cloneSpy).toHaveBeenCalledWith(path.resolve(root), 'org', 'svc')
      expect(summary.status).toBe('success')
      expect(Object.keys(summary.phaseTimingsMs)).toEqual(['cloning_repositories'])
      // Scanning never ran: no repository rows were upserted from the clone.
      const repoRows = await db.select().from(repositories)
      expect(repoRows).toHaveLength(0)
      // pr_sync never ran.
      expect(listSpy).not.toHaveBeenCalled()

      const [last] = await db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(1)
      expect(last?.mode).toBe('clone_only')
      expect(last?.status).toBe('success')
      expect(Object.keys(last?.phaseTimings ?? {})).toEqual(['cloning_repositories'])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refresh_clone_only_partial_when_some_repos_fail_to_clone', async () => {
    const root = await mkdtemp(path.join(process.cwd(), '.tmp', 'refresh-mode-cloneonly-partial-'))
    const mappingPath = await writeMapping(root)
    try {
      vi.spyOn(GitHubClient.prototype, 'listOrgRepositories').mockResolvedValue([
        { name: 'good', archived: false },
        { name: 'bad', archived: false },
      ])
      vi.spyOn(repoClone, 'cloneOrUpdateRepository').mockImplementation(async (_root, _owner, name) => {
        if (name === 'bad') throw new Error('clone failed')
        return 'cloned'
      })

      const summary = await refreshLocalData(
        { databaseUrl: databaseUrl!, repoRoot: root, teamMappingPath: mappingPath, githubSyncOwner: 'org' },
        { mode: 'clone-only' },
      )

      expect(summary.status).toBe('partial')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refresh_clone_only_failed_when_all_repos_fail_to_clone', async () => {
    const root = await mkdtemp(path.join(process.cwd(), '.tmp', 'refresh-mode-cloneonly-failed-'))
    const mappingPath = await writeMapping(root)
    try {
      vi.spyOn(GitHubClient.prototype, 'listOrgRepositories').mockResolvedValue([
        { name: 'bad', archived: false },
      ])
      vi.spyOn(repoClone, 'cloneOrUpdateRepository').mockRejectedValue(new Error('clone failed'))

      const summary = await refreshLocalData(
        { databaseUrl: databaseUrl!, repoRoot: root, teamMappingPath: mappingPath, githubSyncOwner: 'org' },
        { mode: 'clone-only' },
      )

      expect(summary.status).toBe('failed')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refresh_e2e_stub_sets_mode_to_clone_only_when_simulating_clone_only', async () => {
    vi.stubEnv('DASHBOARD_E2E_REFRESH_STUB', '1')
    try {
      const summary = await refreshLocalData({ databaseUrl: databaseUrl! }, { mode: 'clone-only' })
      expect(summary.status).toBe('success')
      const stubRows = await db.select().from(syncRuns).where(eq(syncRuns.message, 'e2e_stub'))
      expect(stubRows.length).toBeGreaterThanOrEqual(1)
      expect(stubRows[0]?.mode).toBe('clone_only')
    } finally {
      await db.delete(syncRuns).where(eq(syncRuns.message, 'e2e_stub'))
      vi.unstubAllEnvs()
    }
  })

  it('refresh_e2e_stub_defaults_to_mode_full_when_simulating_a_full_refresh', async () => {
    vi.stubEnv('DASHBOARD_E2E_REFRESH_STUB', '1')
    try {
      await refreshLocalData({ databaseUrl: databaseUrl! })
      const stubRows = await db.select().from(syncRuns).where(eq(syncRuns.message, 'e2e_stub'))
      expect(stubRows.length).toBeGreaterThanOrEqual(1)
      expect(stubRows[0]?.mode).toBe('full')
    } finally {
      await db.delete(syncRuns).where(eq(syncRuns.message, 'e2e_stub'))
      vi.unstubAllEnvs()
    }
  })
})
