import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { eq, inArray } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { GitHubClient } from '~/collector/github-client'
import { AlreadyRunningError, refreshLocalData } from '~/collector/refresh'
import { createDb, runMigrations } from '~/db/client'
import { pullRequests, repositories, syncErrors, syncRuns } from '~/db/schema'
import {
  formatRefreshFailureMessage,
  getDashboardData,
  parseDashboardWeeksInput,
  refreshLocalDataFn,
} from '~/server/dashboard-functions'
import { loadDashboardPayload } from '~/server/load-dashboard-payload'

describe('dashboard server exports', () => {
  it('exports_createServerFn_wrappers', () => {
    expect(typeof getDashboardData).toBe('function')
    expect(typeof refreshLocalDataFn).toBe('function')
  })
})

describe('parseDashboardWeeksInput', () => {
  it('dashboard_server_function_rejects_invalid_weeks', () => {
    expect(() => parseDashboardWeeksInput({ weeks: 0 })).toThrow(/positive integer/)
    expect(() => parseDashboardWeeksInput({ weeks: -2 })).toThrow(/positive integer/)
    expect(() => parseDashboardWeeksInput({ weeks: 2.5 })).toThrow(/positive integer/)
  })

  it('accepts_positive_integer_or_empty', () => {
    expect(parseDashboardWeeksInput({})).toEqual({})
    expect(parseDashboardWeeksInput({ weeks: 4 })).toEqual({ weeks: 4 })
  })

  it('accepts_team_string', () => {
    expect(parseDashboardWeeksInput({ team: 'Alpha' })).toEqual({ team: 'Alpha' })
    expect(parseDashboardWeeksInput({ weeks: 4, team: 'Beta' })).toEqual({ weeks: 4, team: 'Beta' })
  })

  it('rejects_non_string_team', () => {
    expect(() => parseDashboardWeeksInput({ team: 42 })).toThrow(/team must be a string/)
    expect(() => parseDashboardWeeksInput({ team: true })).toThrow(/team must be a string/)
  })

  it('rejects_blank_team', () => {
    expect(() => parseDashboardWeeksInput({ team: '' })).toThrow(/team must be a non-empty string/)
    expect(() => parseDashboardWeeksInput({ team: '   ' })).toThrow(/team must be a non-empty string/)
  })
})

const databaseUrl = process.env.DATABASE_URL?.trim()

describe('dashboard server integration', () => {
  let db: ReturnType<typeof createDb>
  let testRoot: string
  let mappingDir: string
  let mappingPath: string

  beforeAll(async () => {
    await mkdir(path.join(process.cwd(), '.tmp'), { recursive: true })
    await runMigrations(databaseUrl)
    db = createDb(databaseUrl!)
  })

  afterAll(async () => {
    await db.$client.end({ timeout: 5 })
  })

  beforeEach(async () => {
    testRoot = path.join('/tmp', `srv-dash-${randomUUID()}`)
    await mkdir(testRoot, { recursive: true })
    mappingDir = path.join('/tmp', `srv-map-${randomUUID()}`)
    await mkdir(mappingDir, { recursive: true })
    mappingPath = path.join(mappingDir, 'team-mapping.json')
    await writeFile(
      mappingPath,
      JSON.stringify({
        teams: [{ name: 'Alpha', repoPatterns: ['alpha-*'] }],
        includeRepoPatterns: ['*'],
      }),
      'utf8',
    )
    vi.stubEnv('DASHBOARD_REPO_ROOT', testRoot)
    vi.stubEnv('TEAM_MAPPING_PATH', mappingPath)
    vi.spyOn(GitHubClient.prototype, 'listOrgRepositories').mockResolvedValue([])
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

  it('dashboard_server_function_returns_serializable_data', async () => {
    const { getDashboardDateRanges } = await import('~/config/env')
    const now = new Date('2026-05-14T15:00:00.000')
    const { current } = getDashboardDateRanges(now, 8)
    const id = randomUUID()
    await db.insert(repositories).values({
      id,
      name: 'r',
      path: path.join(testRoot, 'repo'),
      rootPath: testRoot,
      scanStatus: 'ready',
      active: true,
      team: 'Alpha',
      owner: 'gde-mit',
      repo: 'alpha-svc',
      remoteUrl: 'https://github.com/gde-mit/alpha-svc.git',
    })
    const merged = new Date(current.from.getTime() + 2 * 24 * 60 * 60 * 1000)
    await db.insert(pullRequests).values({
      repositoryId: id,
      githubNodeId: 'n1',
      number: 1,
      title: 'T',
      state: 'merged',
      openedAt: new Date(merged.getTime() - 10 * 3600000),
      githubUpdatedAt: merged,
      mergedAt: merged,
      url: 'https://github.com/o/r/1',
    })

    const payload = await loadDashboardPayload(8, now)
    expect(() => JSON.stringify(payload)).not.toThrow()
    expect(payload.metric.mergedPrCount).toBe(1)
  })

  it('refresh_server_function_runs_collector', async () => {
    const summary = await refreshLocalData()
    expect(summary.reposScanned).toBeGreaterThanOrEqual(0)
    expect(['success', 'partial', 'failed']).toContain(summary.status)
  })

  it('an_already_running_error_from_refresh_local_data_is_recognized_by_the_dashboard_handler', async () => {
    // Proves the actual wiring refreshLocalDataFn relies on: an AlreadyRunningError
    // thrown by a real refreshLocalData() call satisfies `instanceof AlreadyRunningError`
    // at the catch site, and feeds formatRefreshFailureMessage the friendly text —
    // not just that the pure function works when handed a hand-picked boolean.
    await db.insert(syncRuns).values({
      kind: 'collector_refresh',
      status: 'running',
      startedAt: new Date(Date.now() - 5000),
      heartbeat: new Date(),
    })

    let caught: unknown
    try {
      await refreshLocalData()
    } catch (e) {
      caught = e
    }

    expect(caught).toBeInstanceOf(AlreadyRunningError)
    const message = formatRefreshFailureMessage(caught, caught instanceof AlreadyRunningError)
    expect(message).toBe('A refresh is already in progress. Try refreshing again in a moment.')
  })
})

describe('formatRefreshFailureMessage', () => {
  it('returns_a_fixed_friendly_message_for_an_already_running_collision', () => {
    // Simulates the Story-3 collision: getActiveSyncRun hides a clone-only run (mode
    // filter), so the button shows idle, but the single-flight guard (keyed on kind,
    // not mode) still rejects a concurrent full refresh with AlreadyRunningError.
    const raw = new Error('A refresh is already running (started 12s ago, status: running). Aborting.')
    const message = formatRefreshFailureMessage(raw, true)
    expect(message).toBe('A refresh is already in progress. Try refreshing again in a moment.')
  })

  it('returns_the_raw_truncated_error_message_for_other_failures', () => {
    const message = formatRefreshFailureMessage(new Error('boom'), false)
    expect(message).toBe('boom')
  })

  it('falls_back_to_a_generic_message_for_non_error_throws', () => {
    const message = formatRefreshFailureMessage('not an error', false)
    expect(message).toBe('Refresh failed')
  })
})
