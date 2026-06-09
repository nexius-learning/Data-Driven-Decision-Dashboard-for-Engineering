import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createDb, runMigrations } from '~/db/client'
import { syncRuns } from '~/db/schema'
import { getActiveSyncRun } from '~/server/active-sync-run'

const databaseUrl = process.env.DATABASE_URL?.trim()

describe('getActiveSyncRun', () => {
  let db: ReturnType<typeof createDb>

  beforeAll(async () => {
    await runMigrations(databaseUrl)
    db = createDb(databaseUrl!)
  })

  afterAll(async () => {
    await db.$client.end({ timeout: 5 })
  })

  afterEach(async () => {
    await db.delete(syncRuns)
  })

  it('getActiveSyncRun_returns_null_when_no_rows', async () => {
    const result = await getActiveSyncRun({ db })
    expect(result).toBeNull()
  })

  it('getActiveSyncRun_returns_null_when_no_running_row', async () => {
    await db.insert(syncRuns).values({
      kind: 'collector_refresh',
      status: 'success',
      startedAt: new Date(),
      finishedAt: new Date(),
      errorCount: 0,
    })
    const result = await getActiveSyncRun({ db })
    expect(result).toBeNull()
  })

  it('getActiveSyncRun_returns_running_row', async () => {
    await db.insert(syncRuns).values({
      kind: 'collector_refresh',
      status: 'running',
      startedAt: new Date(),
      errorCount: 0,
    })
    const result = await getActiveSyncRun({ db })
    expect(result).not.toBeNull()
    expect(result!.currentPhase).toBeNull()
    expect(result!.phaseDone).toBeNull()
    expect(result!.phaseTotal).toBeNull()
    expect(result!.inFlightRepos).toBeNull()
    expect(result!.heartbeatAt).toBeNull()
  })

  it('getActiveSyncRun_returns_progress_columns', async () => {
    await db.insert(syncRuns).values({
      kind: 'collector_refresh',
      status: 'running',
      startedAt: new Date(),
      errorCount: 1,
      currentPhase: 'pr_sync',
      phaseDone: 3,
      phaseTotal: 10,
      inFlightRepos: ['repo-a', 'repo-b'],
    })
    const result = await getActiveSyncRun({ db })
    expect(result?.currentPhase).toBe('pr_sync')
    expect(result?.phaseDone).toBe(3)
    expect(result?.phaseTotal).toBe(10)
    expect(result?.inFlightRepos).toEqual(['repo-a', 'repo-b'])
    expect(result?.errorCount).toBe(1)
  })

  it('getActiveSyncRun_ignores_failed_rows', async () => {
    await db.insert(syncRuns).values({
      kind: 'collector_refresh',
      status: 'failed',
      startedAt: new Date(),
      finishedAt: new Date(),
      errorCount: 5,
    })
    expect(await getActiveSyncRun({ db })).toBeNull()
  })
})
