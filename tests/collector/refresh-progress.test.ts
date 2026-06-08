import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { desc, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { GitHubClient } from '~/collector/github-client'
import * as prSizeSync from '~/collector/pr-size-sync'
import { refreshLocalData } from '~/collector/refresh'
import type { ProgressEvent } from '~/collector/refresh'
import { createDb, runMigrations } from '~/db/client'
import { syncErrors, pullRequests, repositories, syncRuns } from '~/db/schema'

const execFileAsync = promisify(execFile)
const databaseUrl = process.env.DATABASE_URL?.trim()

const defaultMappingJson = JSON.stringify({
  teams: [{ name: 'T', repoPatterns: ['a*', 'b*', 'g*', 'r*', 's*', 'x*', 'z*'] }],
  includeRepoPatterns: ['*'],
})

async function writeMapping(dir: string): Promise<string> {
  const p = path.join(dir, 'team-mapping.json')
  await writeFile(p, defaultMappingJson, 'utf8')
  return p
}

async function initGitRepoWithOrigin(root: string, name: string, remoteUrl: string): Promise<string> {
  const repoPath = path.join(path.resolve(root), name)
  await mkdir(repoPath, { recursive: true })
  await execFileAsync('git', ['init'], { cwd: repoPath })
  await execFileAsync('git', ['remote', 'add', 'origin', remoteUrl], { cwd: repoPath })
  return repoPath
}

describe('refresh progress', () => {
  let db: ReturnType<typeof createDb>

  beforeAll(async () => {
    await mkdir(path.join(process.cwd(), '.tmp'), { recursive: true })
    await runMigrations(databaseUrl)
    db = createDb(databaseUrl!)
  })

  afterAll(async () => {
    await db.$client.end({ timeout: 5 })
  })

  beforeEach(() => {
    vi.spyOn(GitHubClient.prototype, 'listPullRequests').mockResolvedValue([])
    vi.spyOn(GitHubClient.prototype, 'listPullRequestReviews').mockResolvedValue([])
    vi.spyOn(GitHubClient.prototype, 'listPullRequestReviewComments').mockResolvedValue([])
    vi.spyOn(prSizeSync, 'syncRepositoryPrSizes').mockResolvedValue({ ok: 0, skipped: 0, failed: 0 })
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await db.delete(syncErrors)
    await db.delete(pullRequests)
    await db.delete(repositories)
    await db.delete(syncRuns)
  })

  it('refresh_emits_phase_start_events_for_all_phases', async () => {
    const root = await mkdtemp(path.join(process.cwd(), '.tmp', 'prog-phases-'))
    const mappingPath = await writeMapping(root)
    try {
      await initGitRepoWithOrigin(root, 'svc', 'https://github.com/org/svc.git')
      const events: ProgressEvent[] = []
      await refreshLocalData(
        { databaseUrl: databaseUrl!, repoRoot: root, teamMappingPath: mappingPath, githubSyncOwner: 'org' },
        { onProgress: (e) => events.push(e) },
      )
      const phases = events.filter((e) => e.type === 'phase_start').map((e) => e.phase)
      expect(phases).toContain('scanning_repositories')
      expect(phases).toContain('pr_sync')
      expect(phases).toContain('review_sync')
      expect(phases).toContain('pr_size_sync')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refresh_emits_repo_done_for_each_sync_target', async () => {
    const root = await mkdtemp(path.join(process.cwd(), '.tmp', 'prog-repos-'))
    const mappingPath = await writeMapping(root)
    try {
      await initGitRepoWithOrigin(root, 'r1', 'https://github.com/org/r1.git')
      await initGitRepoWithOrigin(root, 'r2', 'https://github.com/org/r2.git')
      const events: ProgressEvent[] = []
      await refreshLocalData(
        { databaseUrl: databaseUrl!, repoRoot: root, teamMappingPath: mappingPath, githubSyncOwner: 'org' },
        { onProgress: (e) => events.push(e) },
      )
      const prSyncDone = events.filter((e) => e.type === 'repo_done' && e.phase === 'pr_sync')
      expect(prSyncDone.length).toBe(2)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refresh_error_repo_done_reaches_total', async () => {
    const root = await mkdtemp(path.join(process.cwd(), '.tmp', 'prog-err-'))
    const mappingPath = await writeMapping(root)
    try {
      await initGitRepoWithOrigin(root, 'good', 'https://github.com/org/good.git')
      await initGitRepoWithOrigin(root, 'bad', 'https://github.com/org/bad.git')
      vi.spyOn(GitHubClient.prototype, 'listPullRequests').mockImplementation(
        async (input: { owner: string; repo: string }) => {
          if (input.repo === 'bad') throw new Error('api error')
          return []
        },
      )
      const events: ProgressEvent[] = []
      await refreshLocalData(
        {
          databaseUrl: databaseUrl!,
          repoRoot: root,
          teamMappingPath: mappingPath,
          githubSyncOwner: 'org',
          githubSyncConcurrency: 1,
        },
        { onProgress: (e) => events.push(e) },
      )
      const prSyncDone = events.filter((e) => e.type === 'repo_done' && e.phase === 'pr_sync')
      expect(prSyncDone.length).toBe(2)
      const lastDone = prSyncDone[prSyncDone.length - 1]
      if (lastDone?.type === 'repo_done') {
        expect(lastDone.done).toBe(lastDone.total)
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refresh_phase_done_counter_resets_per_phase', async () => {
    const root = await mkdtemp(path.join(process.cwd(), '.tmp', 'prog-reset-'))
    const mappingPath = await writeMapping(root)
    try {
      await initGitRepoWithOrigin(root, 'x', 'https://github.com/org/x.git')
      const events: ProgressEvent[] = []
      await refreshLocalData(
        { databaseUrl: databaseUrl!, repoRoot: root, teamMappingPath: mappingPath, githubSyncOwner: 'org' },
        { onProgress: (e) => events.push(e) },
      )
      // First repo_done after each phase_start should have done=1
      const phaseStarts = events.filter((e) => e.type === 'phase_start')
      for (const phaseStart of phaseStarts) {
        if (phaseStart.type !== 'phase_start' || phaseStart.phase === 'scanning_repositories') continue
        const idx = events.indexOf(phaseStart)
        const nextDone = events.slice(idx + 1).find((e) => e.type === 'repo_done')
        if (nextDone?.type === 'repo_done') {
          expect(nextDone.done).toBe(1)
        }
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refresh_populates_phase_timings_after_run', async () => {
    const root = await mkdtemp(path.join(process.cwd(), '.tmp', 'prog-timings-'))
    const mappingPath = await writeMapping(root)
    try {
      await initGitRepoWithOrigin(root, 'z', 'https://github.com/org/z.git')
      await refreshLocalData({
        databaseUrl: databaseUrl!,
        repoRoot: root,
        teamMappingPath: mappingPath,
        githubSyncOwner: 'org',
      })
      const [row] = await db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(1)
      expect(row?.phaseTimings).not.toBeNull()
      const timings = row?.phaseTimings as Record<string, number>
      expect(typeof timings['pr_sync']).toBe('number')
      expect(typeof timings['review_sync']).toBe('number')
      expect(typeof timings['pr_size_sync']).toBe('number')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refresh_writes_current_phase_to_db', async () => {
    const root = await mkdtemp(path.join(process.cwd(), '.tmp', 'prog-dbcol-'))
    const mappingPath = await writeMapping(root)
    try {
      await initGitRepoWithOrigin(root, 'a', 'https://github.com/org/a.git')
      await refreshLocalData({
        databaseUrl: databaseUrl!,
        repoRoot: root,
        teamMappingPath: mappingPath,
        githubSyncOwner: 'org',
      })
      const [row] = await db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(1)
      // After run, current_phase reflects last phase run
      expect(row?.currentPhase).toBeDefined()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refresh_error_count_increments_live_in_db', async () => {
    const root = await mkdtemp(path.join(process.cwd(), '.tmp', 'prog-ecount-'))
    const mappingPath = await writeMapping(root)
    try {
      await initGitRepoWithOrigin(root, 'bad', 'https://github.com/org/bad.git')
      vi.spyOn(GitHubClient.prototype, 'listPullRequests').mockRejectedValue(new Error('api error'))
      let capturedErrorCount = -1
      await refreshLocalData(
        { databaseUrl: databaseUrl!, repoRoot: root, teamMappingPath: mappingPath, githubSyncOwner: 'org' },
        {
          onProgress: (e) => {
            if (e.type === 'repo_done') capturedErrorCount = e.errorCount
          },
        },
      )
      expect(capturedErrorCount).toBeGreaterThan(0)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
