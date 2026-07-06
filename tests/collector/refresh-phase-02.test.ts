import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { eq } from 'drizzle-orm'
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

const mappingJson = JSON.stringify({
  teams: [{ name: 'TeamA', repoPatterns: ['svc'] }],
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

describe('refresh phase 02 integration', () => {
  let db: ReturnType<typeof createDb>
  let listSpy: MockInstance
  let reviewsSpy: MockInstance
  let commentsSpy: MockInstance

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
    commentsSpy = vi
      .spyOn(GitHubClient.prototype, 'listPullRequestReviewComments')
      .mockResolvedValue([])
    vi.spyOn(GitHubClient.prototype, 'listOrgRepositories').mockResolvedValue([])
    vi.spyOn(prSizeSync, 'syncRepositoryPrSizes').mockResolvedValue({
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

  it('review_sync_runs_when_pr_sync_succeeds', async () => {
    const root = await mkdtemp(path.join(process.cwd(), '.tmp', 'refresh-p02-'))
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

      await refreshLocalData({
        databaseUrl: databaseUrl!,
        repoRoot: root,
        teamMappingPath: mappingPath,
        githubSyncOwner: 'gde-mit',
      })

      expect(reviewsSpy).toHaveBeenCalled()
      expect(commentsSpy).toHaveBeenCalled()
      const [repoRow] = await db.select().from(repositories).where(eq(repositories.rootPath, root))
      expect(repoRow?.lastReviewSyncedAt).not.toBeNull()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('review_sync_skipped_when_pr_sync_failed_same_run', async () => {
    const root = await mkdtemp(path.join(process.cwd(), '.tmp', 'refresh-p02-'))
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
      expect(commentsSpy).not.toHaveBeenCalled()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refresh_summary_includes_review_sync_errors', async () => {
    const root = await mkdtemp(path.join(process.cwd(), '.tmp', 'refresh-p02-'))
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
      reviewsSpy.mockRejectedValue(new Error('reviews api down'))

      const summary = await refreshLocalData({
        databaseUrl: databaseUrl!,
        repoRoot: root,
        teamMappingPath: mappingPath,
        githubSyncOwner: 'gde-mit',
      })

      expect(summary.reviewSyncErrors).toBeGreaterThanOrEqual(1)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refresh_phase_01_summary_fields_unchanged', async () => {
    const root = await mkdtemp(path.join(process.cwd(), '.tmp', 'refresh-p02-'))
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
      expect(summary.prsMerged).toBe(1)
      expect(summary.status).toBe('success')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
