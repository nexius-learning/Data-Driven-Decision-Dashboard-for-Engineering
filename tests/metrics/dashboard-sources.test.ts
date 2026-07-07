import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { eq, inArray } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDb, runMigrations } from '~/db/client'
import { pullRequests, repositories, syncErrors, syncRuns } from '~/db/schema'
import { getLatestSyncSource, getMergedPrsSource, getReposSource, getSyncErrorsSource } from '~/metrics/dashboard-sources'

const databaseUrl = process.env.DATABASE_URL?.trim()

async function writeTeamMapping(dir: string, content: unknown): Promise<string> {
  const p = path.join(dir, 'team-mapping.json')
  await writeFile(p, JSON.stringify(content), 'utf8')
  return p
}

describe('dashboard-sources', () => {
  let db: ReturnType<typeof createDb>
  let testRoot: string
  let mappingPath: string
  let mappingDir: string

  beforeAll(async () => {
    await mkdir(path.join(process.cwd(), '.tmp'), { recursive: true })
    await runMigrations(databaseUrl)
    db = createDb(databaseUrl!)
  })

  afterAll(async () => {
    await db.$client.end({ timeout: 5 })
  })

  beforeEach(async () => {
    testRoot = path.join('/tmp', `dash-src-${randomUUID()}`)
    mappingDir = path.join('/tmp', `dash-src-map-${randomUUID()}`)
    await mkdir(mappingDir, { recursive: true })
    mappingPath = await writeTeamMapping(mappingDir, {
      teams: [{ name: 'Alpha', repoPatterns: ['alpha-*'] }],
      includeRepoPatterns: ['*'],
    })
    vi.stubEnv('DASHBOARD_REPO_ROOT', testRoot)
    vi.stubEnv('TEAM_MAPPING_PATH', mappingPath)
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    // Clean shared sync tables and this file's repos so tests are order-independent.
    await db.delete(syncErrors)
    await db.delete(syncRuns)
    const repoRows = await db.select({ id: repositories.id }).from(repositories).where(eq(repositories.rootPath, testRoot))
    const ids = repoRows.map((r) => r.id)
    if (ids.length > 0) {
      await db.delete(pullRequests).where(inArray(pullRequests.repositoryId, ids))
      await db.delete(repositories).where(inArray(repositories.id, ids))
    }
    await rm(mappingDir, { recursive: true, force: true })
  })

  it('merged_prs_source_lists_current_range_merged_prs', async () => {
    const repoId = randomUUID()
    await db.insert(repositories).values({
      id: repoId,
      name: 'alpha-svc',
      path: path.join(testRoot, 'alpha-svc'),
      rootPath: testRoot,
      scanStatus: 'ready',
      active: true,
      team: 'Alpha',
      owner: 'gde-mit',
      repo: 'alpha-svc',
      remoteUrl: 'https://github.com/gde-mit/alpha-svc.git',
    })

    const now = new Date('2026-05-14T12:00:00.000Z')
    await db.insert(pullRequests).values({
      repositoryId: repoId,
      githubNodeId: 'node-1',
      number: 1,
      title: 'Feature A',
      state: 'merged',
      openedAt: new Date('2026-05-01T10:00:00.000Z'),
      githubUpdatedAt: new Date('2026-05-10T10:00:00.000Z'),
      mergedAt: new Date('2026-05-10T12:00:00.000Z'),
      url: 'https://github.com/gde-mit/alpha-svc/pull/1',
      missingJiraKey: false,
    })

    const result = await getMergedPrsSource({ db, weeks: 8, now })
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]?.title).toBe('Feature A')
    expect(result.rows[0]?.url).toContain('/pull/1')
  })

  it('repos_source_lists_scanned_repositories', async () => {
    await db.insert(repositories).values({
      id: randomUUID(),
      name: 'alpha-svc',
      path: path.join(testRoot, 'alpha-svc'),
      rootPath: testRoot,
      scanStatus: 'ready',
      active: true,
      team: 'Alpha',
    })

    const result = await getReposSource({ db })
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]?.includedInMetrics).toBe(true)
  })

  it('sync_errors_source_lists_latest_run_errors', async () => {
    const runId = randomUUID()
    await db.insert(syncRuns).values({
      id: runId,
      kind: 'collector_refresh',
      status: 'partial',
      startedAt: new Date('2026-05-14T10:00:00.000Z'),
      finishedAt: new Date('2026-05-14T10:05:00.000Z'),
      errorCount: 1,
    })
    await db.insert(syncErrors).values({
      syncRunId: runId,
      repositoryId: null,
      source: 'github_api',
      message: 'rate limit exceeded',
    })

    const result = await getSyncErrorsSource({ db })
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]?.message).toBe('rate limit exceeded')
  })

  it('latest_sync_source_ignores_a_clone_only_run_that_finished_after_a_full_run', async () => {
    const fullRunId = randomUUID()
    await db.insert(syncRuns).values({
      id: fullRunId,
      kind: 'collector_refresh',
      status: 'success',
      mode: 'full',
      startedAt: new Date('2026-05-14T10:00:00.000Z'),
      finishedAt: new Date('2026-05-14T10:05:00.000Z'),
      errorCount: 0,
    })
    await db.insert(syncRuns).values({
      id: randomUUID(),
      kind: 'collector_refresh',
      status: 'success',
      mode: 'clone_only',
      startedAt: new Date('2026-05-14T11:00:00.000Z'),
      finishedAt: new Date('2026-05-14T11:05:00.000Z'),
      errorCount: 0,
    })

    const result = await getLatestSyncSource({ db })
    expect(result?.id).toBe(fullRunId)
  })

  it('latest_sync_source_returns_a_full_run_that_finished_after_a_clone_only_run', async () => {
    await db.insert(syncRuns).values({
      id: randomUUID(),
      kind: 'collector_refresh',
      status: 'success',
      mode: 'clone_only',
      startedAt: new Date('2026-05-14T09:00:00.000Z'),
      finishedAt: new Date('2026-05-14T09:05:00.000Z'),
      errorCount: 0,
    })
    const fullRunId = randomUUID()
    await db.insert(syncRuns).values({
      id: fullRunId,
      kind: 'collector_refresh',
      status: 'success',
      mode: 'full',
      startedAt: new Date('2026-05-14T10:00:00.000Z'),
      finishedAt: new Date('2026-05-14T10:05:00.000Z'),
      errorCount: 0,
    })

    const result = await getLatestSyncSource({ db })
    expect(result?.id).toBe(fullRunId)
  })

  it('latest_sync_source_surfaces_a_full_run_that_failed_before_finishing_any_phase', async () => {
    await db.insert(syncRuns).values({
      id: randomUUID(),
      kind: 'collector_refresh',
      status: 'success',
      mode: 'clone_only',
      startedAt: new Date('2026-05-14T09:00:00.000Z'),
      finishedAt: new Date('2026-05-14T09:05:00.000Z'),
      errorCount: 0,
    })
    const failedFullRunId = randomUUID()
    await db.insert(syncRuns).values({
      id: failedFullRunId,
      kind: 'collector_refresh',
      status: 'failed',
      mode: 'full',
      startedAt: new Date('2026-05-14T10:00:00.000Z'),
      finishedAt: new Date('2026-05-14T10:00:05.000Z'),
      message: 'connect ETIMEDOUT',
      errorCount: 1,
    })

    const result = await getLatestSyncSource({ db })
    expect(result?.id).toBe(failedFullRunId)
    expect(result?.status).toBe('failed')
  })

  it('sync_errors_source_uses_the_latest_run_of_any_mode_not_just_full_runs', async () => {
    await db.insert(syncRuns).values({
      id: randomUUID(),
      kind: 'collector_refresh',
      status: 'success',
      mode: 'full',
      startedAt: new Date('2026-05-14T10:00:00.000Z'),
      finishedAt: new Date('2026-05-14T10:05:00.000Z'),
      errorCount: 0,
    })
    const cloneOnlyRunId = randomUUID()
    await db.insert(syncRuns).values({
      id: cloneOnlyRunId,
      kind: 'collector_refresh',
      status: 'failed',
      mode: 'clone_only',
      startedAt: new Date('2026-05-14T11:00:00.000Z'),
      finishedAt: new Date('2026-05-14T11:05:00.000Z'),
      errorCount: 1,
    })
    await db.insert(syncErrors).values({
      syncRunId: cloneOnlyRunId,
      repositoryId: null,
      source: 'repo_clone',
      message: 'repository not found',
    })

    const result = await getSyncErrorsSource({ db })
    expect(result.syncRun?.id).toBe(cloneOnlyRunId)
    expect(result.syncRun?.mode).toBe('clone_only')
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]?.message).toBe('repository not found')
  })

  it('sync_errors_source_prefers_a_full_run_with_errors_over_a_later_clean_clone_only_run', async () => {
    // A clean clone-only pre-warm finishing after a full run that had errors
    // must not bury those errors: the errors page would then show "no errors"
    // while the freshness banner (driven by the full run) still reports them.
    const fullRunId = randomUUID()
    await db.insert(syncRuns).values({
      id: fullRunId,
      kind: 'collector_refresh',
      status: 'partial',
      mode: 'full',
      startedAt: new Date('2026-05-14T10:00:00.000Z'),
      finishedAt: new Date('2026-05-14T10:05:00.000Z'),
      errorCount: 1,
    })
    await db.insert(syncErrors).values({
      syncRunId: fullRunId,
      repositoryId: null,
      source: 'github_sync',
      message: 'boom',
    })
    await db.insert(syncRuns).values({
      id: randomUUID(),
      kind: 'collector_refresh',
      status: 'success',
      mode: 'clone_only',
      startedAt: new Date('2026-05-14T11:00:00.000Z'),
      finishedAt: new Date('2026-05-14T11:05:00.000Z'),
      errorCount: 0,
    })

    const result = await getSyncErrorsSource({ db })
    expect(result.syncRun?.id).toBe(fullRunId)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]?.message).toBe('boom')
  })
})
