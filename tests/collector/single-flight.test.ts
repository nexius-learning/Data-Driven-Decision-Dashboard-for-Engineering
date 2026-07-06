import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'

import { AlreadyRunningError, refreshLocalData } from '~/collector/refresh'
import { GitHubClient } from '~/collector/github-client'
import * as prSizeSync from '~/collector/pr-size-sync'
import { createDb, runMigrations } from '~/db/client'
import { syncErrors, syncRuns } from '~/db/schema'

const execFileAsync = promisify(execFile)
const databaseUrl = process.env.DATABASE_URL?.trim()

const minimalMappingJson = JSON.stringify({
  teams: [{ name: 'TeamA', repoPatterns: ['svc*', 'a*'] }],
  includeRepoPatterns: ['*'],
})

async function makeRepoWithOrigin(root: string, name: string, remoteUrl: string): Promise<void> {
  const repoPath = path.join(root, name)
  await mkdir(repoPath, { recursive: true })
  await execFileAsync('git', ['init'], { cwd: repoPath })
  await execFileAsync('git', ['remote', 'add', 'origin', remoteUrl], { cwd: repoPath })
}

describe('single-flight guard', () => {
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
    vi.spyOn(GitHubClient.prototype, 'listPullRequestReviews').mockResolvedValue([])
    vi.spyOn(GitHubClient.prototype, 'listPullRequestReviewComments').mockResolvedValue([])
    vi.spyOn(GitHubClient.prototype, 'listOrgRepositories').mockResolvedValue([])
    vi.spyOn(prSizeSync, 'syncRepositoryPrSizes').mockResolvedValue({ ok: 0, skipped: 0, failed: 0 })
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await db.delete(syncErrors)
    await db.delete(syncRuns)
  })

  it('refresh_updates_heartbeat_during_run', async () => {
    const root = await mkdtemp(path.join(process.cwd(), '.tmp', 'sf-hb-'))
    const mappingPath = path.join(root, 'mapping.json')
    await writeFile(mappingPath, minimalMappingJson, 'utf8')
    try {
      await makeRepoWithOrigin(root, 'svc', 'https://github.com/gde-mit/svc.git')

      // Hold listPullRequests so the refresh stays "running" during the heartbeat window
      let releasePrList!: () => void
      vi.spyOn(GitHubClient.prototype, 'listPullRequests').mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (): any => new Promise((resolve) => { releasePrList = () => resolve([]) }),
      )

      const refreshPromise = refreshLocalData(
        { databaseUrl: databaseUrl!, repoRoot: root, teamMappingPath: mappingPath, githubSyncOwner: 'gde-mit' },
        { heartbeatIntervalMs: 50 },
      )

      // Wait for at least 3 heartbeat cycles (50ms each) to have fired and committed
      await new Promise((r) => setTimeout(r, 300))
      const allRows = await db.select().from(syncRuns)
      const runningRow = allRows.find(r => r.status === 'running')
      expect(runningRow?.heartbeat).not.toBeNull()

      releasePrList()
      await refreshPromise
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refresh_expires_zombie_and_proceeds', async () => {
    const zombieStartedAt = new Date(Date.now() - 200_000) // 200s ago > 120s TTL
    const staleHeartbeat = new Date(Date.now() - 130_000)  // stale heartbeat
    const [zombie] = await db
      .insert(syncRuns)
      .values({
        kind: 'collector_refresh',
        status: 'running',
        startedAt: zombieStartedAt,
        heartbeat: staleHeartbeat,
      })
      .returning({ id: syncRuns.id })

    vi.spyOn(GitHubClient.prototype, 'listPullRequests').mockResolvedValue([])
    // Should not throw AlreadyRunningError — proceeds with a new run (which fails for other reasons)
    const result = await refreshLocalData({ databaseUrl: databaseUrl! })
    expect(result).not.toBeInstanceOf(Error)

    const zombieRow = await db.select().from(syncRuns).where(eq(syncRuns.id, zombie!.id))
    expect(zombieRow[0]?.status).toBe('failed')
    expect(zombieRow[0]?.message).toBe('zombie_expired')
  })

  it('refresh_backs_off_when_fresh_running_row_exists', async () => {
    const startedAt = new Date(Date.now() - 5000) // 5 seconds ago — not a zombie
    await db.insert(syncRuns).values({
      kind: 'collector_refresh',
      status: 'running',
      startedAt,
      heartbeat: new Date(),
    })

    const listSpy = vi.spyOn(GitHubClient.prototype, 'listPullRequests').mockResolvedValue([])
    await expect(refreshLocalData({ databaseUrl: databaseUrl! })).rejects.toThrow(AlreadyRunningError)
    expect(listSpy).not.toHaveBeenCalled()
  })
})
