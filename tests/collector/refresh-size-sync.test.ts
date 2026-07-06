import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
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
import * as reviewSync from '~/collector/review-sync'
import { createDb, runMigrations } from '~/db/client'
import { pullRequests, repositories, syncErrors, syncRuns } from '~/db/schema'

const execFileAsync = promisify(execFile)

const databaseUrl = process.env.DATABASE_URL?.trim()

const mappingJson = JSON.stringify({
  teams: [{ name: 'TeamA', repoPatterns: ['svc', 'other'] }],
  includeRepoPatterns: ['*'],
})

async function writeMapping(dir: string): Promise<string> {
  const p = path.join(dir, 'team-mapping.json')
  await writeFile(p, mappingJson, 'utf8')
  return p
}

async function initGitRepoWithOrigin(root: string, name: string, remoteUrl: string) {
  const rootPath = path.resolve(root)
  const repoPath = path.join(rootPath, name)
  await mkdir(repoPath, { recursive: true })
  await execFileAsync('git', ['init'], { cwd: repoPath })
  await execFileAsync('git', ['remote', 'add', 'origin', remoteUrl], { cwd: repoPath })
  return repoPath
}

const samplePr = {
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
}

describe('refresh size sync integration', () => {
  let db: ReturnType<typeof createDb>
  let listSpy: MockInstance
  let reviewsSpy: MockInstance
  let sizeSyncSpy: MockInstance
  let reviewSyncSpy: MockInstance

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
    reviewsSpy = vi.spyOn(GitHubClient.prototype, 'listPullRequestReviews').mockResolvedValue([])
    vi.spyOn(GitHubClient.prototype, 'listPullRequestReviewComments').mockResolvedValue([])
    vi.spyOn(GitHubClient.prototype, 'listOrgRepositories').mockResolvedValue([])
    reviewSyncSpy = vi.spyOn(reviewSync, 'syncRepositoryReviews').mockResolvedValue({
      status: 'success',
      perPrErrors: [],
      prsAttempted: 0,
      prsSucceeded: 0,
    })
    sizeSyncSpy = vi.spyOn(prSizeSync, 'syncRepositoryPrSizes').mockResolvedValue({
      ok: 0,
      skipped: 0,
      failed: 0,
    })
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await db.delete(syncErrors)
    await db.delete(pullRequests)
    await db.delete(repositories)
    await db.delete(syncRuns)
  })

  it('refresh_runs_size_sync_after_pr_sync', async () => {
    const root = await mkdtemp(path.join(process.cwd(), '.tmp', 'refresh-size-'))
    const mappingPath = await writeMapping(root)
    try {
      await initGitRepoWithOrigin(root, 'svc', 'https://github.com/gde-mit/svc.git')
      listSpy.mockResolvedValue([samplePr])

      await refreshLocalData({
        databaseUrl: databaseUrl!,
        repoRoot: root,
        teamMappingPath: mappingPath,
        githubSyncOwner: 'gde-mit',
      })

      expect(sizeSyncSpy).toHaveBeenCalledTimes(1)
      const [call] = sizeSyncSpy.mock.calls
      expect(call?.[0]).toMatchObject({
        repositoryId: expect.any(String),
        owner: 'gde-mit',
        repo: 'svc',
        repoPath: path.join(root, 'svc'),
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refresh_runs_size_sync_after_review_sync', async () => {
    const root = await mkdtemp(path.join(process.cwd(), '.tmp', 'refresh-size-'))
    const mappingPath = await writeMapping(root)
    try {
      await initGitRepoWithOrigin(root, 'svc', 'https://github.com/gde-mit/svc.git')
      await initGitRepoWithOrigin(root, 'other', 'https://github.com/gde-mit/other.git')
      listSpy.mockResolvedValue([samplePr])

      const sequence: Array<'review' | 'size'> = []
      reviewSyncSpy.mockImplementation(async () => {
        sequence.push('review')
        return {
          status: 'success' as const,
          perPrErrors: [],
          prsAttempted: 0,
          prsSucceeded: 0,
        }
      })
      sizeSyncSpy.mockImplementation(async () => {
        sequence.push('size')
        return { ok: 0, skipped: 0, failed: 0 }
      })

      await refreshLocalData({
        databaseUrl: databaseUrl!,
        repoRoot: root,
        teamMappingPath: mappingPath,
        githubSyncOwner: 'gde-mit',
        githubSyncConcurrency: 1,
      })

      expect(reviewSyncSpy).toHaveBeenCalledTimes(2)
      expect(sizeSyncSpy).toHaveBeenCalledTimes(2)
      const reviewSteps = sequence.map((s, i) => (s === 'review' ? i : -1)).filter((i) => i >= 0)
      const sizeSteps = sequence.map((s, i) => (s === 'size' ? i : -1)).filter((i) => i >= 0)
      expect(Math.max(...reviewSteps)).toBeLessThan(Math.min(...sizeSteps))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refresh_skips_size_sync_for_failed_pr_sync_repos', async () => {
    const root = await mkdtemp(path.join(process.cwd(), '.tmp', 'refresh-size-'))
    const mappingPath = await writeMapping(root)
    try {
      await initGitRepoWithOrigin(root, 'svc', 'https://github.com/gde-mit/svc.git')
      listSpy.mockRejectedValue(new Error('pr sync fails'))

      await refreshLocalData({
        databaseUrl: databaseUrl!,
        repoRoot: root,
        teamMappingPath: mappingPath,
        githubSyncOwner: 'gde-mit',
      })

      expect(reviewsSpy).not.toHaveBeenCalled()
      expect(sizeSyncSpy).not.toHaveBeenCalled()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refresh_adds_size_sync_errors_to_summary', async () => {
    const root = await mkdtemp(path.join(process.cwd(), '.tmp', 'refresh-size-'))
    const mappingPath = await writeMapping(root)
    try {
      await initGitRepoWithOrigin(root, 'svc', 'https://github.com/gde-mit/svc.git')
      listSpy.mockResolvedValue([samplePr])
      sizeSyncSpy.mockResolvedValue({ ok: 1, skipped: 0, failed: 2 })

      const summary = await refreshLocalData({
        databaseUrl: databaseUrl!,
        repoRoot: root,
        teamMappingPath: mappingPath,
        githubSyncOwner: 'gde-mit',
      })

      expect(summary.sizeSyncErrors).toBe(2)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
