import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { eq, inArray } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { getDashboardDateRanges } from '~/config/env'
import { createDb, runMigrations } from '~/db/client'
import { pullRequests, repositories, syncErrors, syncRuns } from '~/db/schema'
import {
  DASHBOARD_UNASSIGNED_TEAM,
  getPrCycleTimeDashboard,
} from '~/metrics/pr-cycle-time-dashboard'

const databaseUrl = process.env.DATABASE_URL?.trim()

async function writeTeamMapping(dir: string, content: unknown): Promise<string> {
  const p = path.join(dir, 'team-mapping.json')
  await writeFile(p, JSON.stringify(content), 'utf8')
  return p
}

describe('pr-cycle-time-dashboard', () => {
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
    testRoot = path.join('/tmp', `dash-${randomUUID()}`)
    mappingDir = path.join('/tmp', `dash-map-${randomUUID()}`)
    await mkdir(mappingDir, { recursive: true })
    mappingPath = await writeTeamMapping(mappingDir, {
      teams: [
        { name: 'Alpha', repoPatterns: ['alpha-*'] },
        { name: 'Beta', repoPatterns: ['beta-*'] },
      ],
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

  async function insertRepo(overrides: Partial<typeof repositories.$inferInsert> = {}): Promise<string> {
    const id = randomUUID()
    await db.insert(repositories).values({
      id,
      name: overrides.name ?? 'r',
      path: overrides.path ?? path.join(testRoot, `repo-${id.slice(0, 8)}`),
      rootPath: testRoot,
      scanStatus: 'ready',
      active: true,
      team: 'Alpha',
      owner: 'gde-mit',
      repo: 'alpha-svc',
      remoteUrl: 'https://github.com/gde-mit/alpha-svc.git',
      ...overrides,
    })
    return id
  }

  async function insertPr(
    repositoryId: string,
    overrides: Partial<typeof pullRequests.$inferInsert> = {},
  ): Promise<void> {
    const n = overrides.number ?? 1
    await db.insert(pullRequests).values({
      repositoryId,
      githubNodeId: `node-${n}-${repositoryId}`,
      number: n,
      title: overrides.title ?? 'PR',
      state: overrides.state ?? 'merged',
      openedAt: overrides.openedAt ?? new Date('2026-01-01T10:00:00.000Z'),
      githubUpdatedAt: overrides.githubUpdatedAt ?? new Date('2026-01-02T10:00:00.000Z'),
      mergedAt: overrides.mergedAt ?? new Date('2026-01-03T10:00:00.000Z'),
      url: overrides.url ?? 'https://github.com/o/r/pull/1',
      missingJiraKey: overrides.missingJiraKey ?? false,
      ...overrides,
    })
  }

  it('dashboard_returns_single_metric_contract', async () => {
    const now = new Date('2026-05-14T15:00:00.000')
    const { current } = getDashboardDateRanges(now, 8)
    const rid = await insertRepo()
    const merged = new Date(current.from.getTime() + 2 * 24 * 60 * 60 * 1000)
    const opened = new Date(merged.getTime() - 24 * 60 * 60 * 1000)
    await insertPr(rid, { number: 1, openedAt: opened, mergedAt: merged })

    const d = await getPrCycleTimeDashboard({ db, now, weeks: 8 })
    expect(d.range.weeks).toBe(8)
    expect(typeof d.range.from).toBe('string')
    expect(d.metric).toMatchObject({
      mergedPrCount: 1,
      medianHours: 24,
      baselineStatus: expect.any(String),
    })
    expect(Array.isArray(d.weeklyTrend)).toBe(true)
    expect(d.weeklyTrend).toHaveLength(8)
    expect(Array.isArray(d.teamBreakdown)).toBe(true)
    expect(Array.isArray(d.exceptions)).toBe(true)
    expect(['success', 'partial', 'failed', 'never_run']).toContain(d.freshness.latestSyncStatus)
    expect(typeof d.freshness.reposScanned).toBe('number')
  })

  it('dashboard_filters_current_range_by_merged_at', async () => {
    const now = new Date('2026-05-14T15:00:00.000')
    const { current, previous } = getDashboardDateRanges(now, 8)
    const rid = await insertRepo()
    const inRange = new Date(current.from.getTime() + 3 * 24 * 60 * 60 * 1000)
    const tooOld = new Date(previous.from.getTime() - 2 * 24 * 60 * 60 * 1000)
    const future = new Date(current.to.getTime() + 2 * 60 * 60 * 1000)
    await insertPr(rid, { number: 1, openedAt: new Date(inRange.getTime() - 48 * 3600000), mergedAt: inRange })
    await insertPr(rid, {
      number: 2,
      openedAt: new Date(tooOld.getTime() - 24 * 3600000),
      mergedAt: tooOld,
    })
    await insertPr(rid, {
      number: 3,
      openedAt: new Date(future.getTime() - 48 * 3600000),
      mergedAt: future,
    })
    const d = await getPrCycleTimeDashboard({ db, now, weeks: 8 })
    expect(d.metric.mergedPrCount).toBe(1)
  })

  it('dashboard_isolates_previous_period_boundaries', async () => {
    const now = new Date('2026-05-14T15:00:00.000')
    const { current, previous } = getDashboardDateRanges(now, 8)
    const rid = await insertRepo()
    const atCurrentStart = new Date(current.from)
    const inPrevious = new Date(previous.to.getTime() - 60 * 60 * 1000)
    await insertPr(rid, {
      number: 1,
      openedAt: new Date(atCurrentStart.getTime() - 24 * 3600000),
      mergedAt: atCurrentStart,
    })
    await insertPr(rid, {
      number: 2,
      openedAt: new Date(inPrevious.getTime() - 24 * 3600000),
      mergedAt: inPrevious,
    })
    const d = await getPrCycleTimeDashboard({ db, now, weeks: 8 })
    expect(d.metric.mergedPrCount).toBe(1)
  })

  it('dashboard_shows_persisted_sync_failed_state', async () => {
    const syncId = randomUUID()
    const latestFinished = new Date('2099-01-15T12:00:00.000Z')
    await db.insert(syncRuns).values({
      id: syncId,
      kind: 'collector_refresh',
      status: 'failed',
      startedAt: new Date('2099-01-15T11:00:00.000Z'),
      finishedAt: latestFinished,
      errorCount: 2,
    })
    const rid = await insertRepo()
    await insertPr(rid, {
      number: 99,
      openedAt: new Date('2026-05-01T10:00:00.000Z'),
      mergedAt: new Date('2026-05-10T10:00:00.000Z'),
    })
    const d = await getPrCycleTimeDashboard({ db, now: new Date('2026-05-14T15:00:00.000'), weeks: 8 })
    expect(d.freshness.latestSyncStatus).toBe('failed')
    expect(d.freshness.syncErrors).toBe(2)
    expect(d.freshness.prMetadataSyncedAt).toBeTruthy()
    await db.delete(syncRuns).where(eq(syncRuns.id, syncId))
  })

  it('team_breakdown_computes_per_team_medians', async () => {
    const now = new Date('2026-05-14T15:00:00.000')
    const { current } = getDashboardDateRanges(now, 8)
    const merged = new Date(current.from.getTime() + 4 * 24 * 60 * 60 * 1000)
    const ra = await insertRepo({ team: 'Alpha', path: path.join(testRoot, 'a'), repo: 'alpha-a' })
    const rb = await insertRepo({ team: 'Beta', path: path.join(testRoot, 'b'), repo: 'beta-b' })
    await insertPr(ra, {
      number: 1,
      openedAt: new Date(merged.getTime() - 10 * 3600000),
      mergedAt: merged,
    })
    await insertPr(ra, {
      number: 2,
      openedAt: new Date(merged.getTime() - 20 * 3600000),
      mergedAt: merged,
    })
    await insertPr(rb, {
      number: 1,
      openedAt: new Date(merged.getTime() - 100 * 3600000),
      mergedAt: merged,
    })
    const d = await getPrCycleTimeDashboard({ db, now, weeks: 8 })
    const a = d.teamBreakdown.find((t) => t.team === 'Alpha')
    const b = d.teamBreakdown.find((t) => t.team === 'Beta')
    expect(a?.medianHours).toBe(15)
    expect(b?.medianHours).toBe(100)
    expect(d.metric.medianHours).not.toBe(a?.medianHours)
  })

  it('team_breakdown_computes_per_team_previous_trends', async () => {
    const now = new Date('2026-05-14T15:00:00.000')
    const { current, previous } = getDashboardDateRanges(now, 8)
    const rid = await insertRepo({ team: 'Alpha' })
    const prevMerged = new Date(previous.from.getTime() + 2 * 24 * 60 * 60 * 1000)
    const curMerged = new Date(current.from.getTime() + 2 * 24 * 60 * 60 * 1000)
    for (let i = 0; i < 3; i += 1) {
      await insertPr(rid, {
        number: 10 + i,
        openedAt: new Date(prevMerged.getTime() - 40 * 3600000),
        mergedAt: prevMerged,
      })
    }
    for (let i = 0; i < 3; i += 1) {
      await insertPr(rid, {
        number: 20 + i,
        openedAt: new Date(curMerged.getTime() - 20 * 3600000),
        mergedAt: curMerged,
      })
    }
    const d = await getPrCycleTimeDashboard({ db, now, weeks: 8 })
    const row = d.teamBreakdown.find((t) => t.team === 'Alpha')
    expect(row?.trendPercent).toBe(-50)
    expect(row?.previousMedianHours).toBe(40)
    expect(row?.medianHours).toBe(20)
  })

  it('dashboard_exposes_previous_period_medians', async () => {
    const now = new Date('2026-05-14T15:00:00.000')
    const { current, previous } = getDashboardDateRanges(now, 8)
    const rid = await insertRepo()
    const prevMerged = new Date(previous.from.getTime() + 2 * 24 * 60 * 60 * 1000)
    const curMerged = new Date(current.from.getTime() + 2 * 24 * 60 * 60 * 1000)
    for (let i = 0; i < 3; i += 1) {
      await insertPr(rid, {
        number: 50 + i,
        openedAt: new Date(prevMerged.getTime() - 6 * 60 * 60 * 1000),
        mergedAt: prevMerged,
      })
    }
    for (let i = 0; i < 3; i += 1) {
      await insertPr(rid, {
        number: 60 + i,
        openedAt: new Date(curMerged.getTime() - 12 * 60 * 60 * 1000),
        mergedAt: curMerged,
      })
    }
    const d = await getPrCycleTimeDashboard({ db, now, weeks: 8 })
    expect(d.metric.previousMedianHours).toBe(6)
    expect(d.metric.medianHours).toBe(12)
    expect(d.metric.trendPercent).toBe(100)
  })

  it('dashboard_exposes_pr_cycle_time_comparison_weekly_trend', async () => {
    const now = new Date('2026-05-14T15:00:00.000')
    const { current, previous } = getDashboardDateRanges(now, 8)
    const rid = await insertRepo()
    await insertPr(rid, {
      number: 501,
      openedAt: new Date(previous.from.getTime() - 24 * 3600000),
      mergedAt: previous.from,
    })
    await insertPr(rid, {
      number: 502,
      openedAt: new Date(current.from.getTime() - 48 * 3600000),
      mergedAt: current.from,
    })

    const d = await getPrCycleTimeDashboard({ db, now, weeks: 8 })

    expect(d.comparisonWeeklyTrend).toHaveLength(16)
    expect(d.comparisonWeeklyTrend.slice(0, 8).every((p) => p.period === 'previous')).toBe(true)
    expect(d.comparisonWeeklyTrend.slice(8).every((p) => p.period === 'current')).toBe(true)
    expect(d.comparisonWeeklyTrend[0]).toMatchObject({
      bucketIndex: 1,
      bucketStart: previous.from.toISOString(),
      bucketLabel: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      medianHours: 24,
    })
    expect(d.comparisonWeeklyTrend[8]).toMatchObject({
      bucketIndex: 1,
      bucketStart: current.from.toISOString(),
      medianHours: 48,
    })
  })

  it('dashboard_comparison_trend_matches_requested_range_week_count', async () => {
    const now = new Date('2026-05-14T15:00:00.000')
    const { current, previous } = getDashboardDateRanges(now, 4)
    const rid = await insertRepo()
    await insertPr(rid, {
      number: 506,
      openedAt: new Date(previous.from.getTime() - 24 * 3600000),
      mergedAt: previous.from,
    })
    await insertPr(rid, {
      number: 507,
      openedAt: new Date(current.from.getTime() - 48 * 3600000),
      mergedAt: current.from,
    })

    const d = await getPrCycleTimeDashboard({ db, now, weeks: 4 })

    expect(d.range.weeks).toBe(4)
    expect(d.comparisonWeeklyTrend).toHaveLength(8)
    expect(d.comparisonWeeklyTrend.slice(0, 4).every((p) => p.period === 'previous')).toBe(true)
    expect(d.comparisonWeeklyTrend.slice(4).every((p) => p.period === 'current')).toBe(true)
    expect(d.comparisonWeeklyTrend[3].bucketEnd).toBe(current.from.toISOString())
    expect(d.comparisonWeeklyTrend[4].bucketStart).toBe(current.from.toISOString())
  })

  it('dashboard_comparison_trend_has_non_null_previous_context', async () => {
    const now = new Date('2026-05-14T15:00:00.000')
    const { previous } = getDashboardDateRanges(now, 8)
    const rid = await insertRepo()
    const merged = new Date(previous.from)
    merged.setDate(merged.getDate() + 14)
    await insertPr(rid, {
      number: 511,
      openedAt: new Date(merged.getTime() - 36 * 3600000),
      mergedAt: merged,
    })

    const d = await getPrCycleTimeDashboard({ db, now, weeks: 8 })

    expect(d.comparisonWeeklyTrend.slice(0, 8).some((p) => p.medianHours === 36)).toBe(true)
    expect(d.weeklyTrend.every((p) => p.medianHours === null)).toBe(true)
  })

  it('dashboard_comparison_trend_does_not_change_metric_card_values', async () => {
    const now = new Date('2026-05-14T15:00:00.000')
    const { current, previous } = getDashboardDateRanges(now, 8)
    const rid = await insertRepo()
    const prevMerged = new Date(previous.from.getTime() + 2 * 24 * 60 * 60 * 1000)
    const curMerged = new Date(current.from.getTime() + 2 * 24 * 60 * 60 * 1000)
    for (let i = 0; i < 3; i += 1) {
      await insertPr(rid, {
        number: 520 + i,
        openedAt: new Date(prevMerged.getTime() - 10 * 3600000),
        mergedAt: prevMerged,
      })
    }
    for (let i = 0; i < 3; i += 1) {
      await insertPr(rid, {
        number: 530 + i,
        openedAt: new Date(curMerged.getTime() - 15 * 3600000),
        mergedAt: curMerged,
      })
    }

    const d = await getPrCycleTimeDashboard({ db, now, weeks: 8 })

    expect(d.metric).toMatchObject({
      medianHours: 15,
      previousMedianHours: 10,
      mergedPrCount: 3,
      trendPercent: 50,
      baselineStatus: 'available',
    })
  })

  it('dashboard_comparison_trend_includes_current_to_boundary', async () => {
    const now = new Date('2026-05-14T15:00:00.000')
    const { current } = getDashboardDateRanges(now, 8)
    const rid = await insertRepo()
    await insertPr(rid, {
      number: 541,
      openedAt: new Date(current.to.getTime() - 11 * 3600000),
      mergedAt: current.to,
    })

    const d = await getPrCycleTimeDashboard({ db, now, weeks: 8 })

    expect(d.comparisonWeeklyTrend[15].medianHours).toBe(11)
  })

  it('dashboard_existing_weekly_trend_remains_8_points', async () => {
    const d = await getPrCycleTimeDashboard({ db, now: new Date('2026-05-14T15:00:00.000'), weeks: 8 })

    expect(d.weeklyTrend).toHaveLength(8)
  })

  it('team_breakdown_groups_unassigned_repositories_at_bottom', async () => {
    const now = new Date('2026-05-14T15:00:00.000')
    const { current } = getDashboardDateRanges(now, 8)
    const merged = new Date(current.from.getTime() + 2 * 24 * 60 * 60 * 1000)
    const assignedRid = await insertRepo({ team: 'Alpha', path: path.join(testRoot, 'assigned') })
    const rid = await insertRepo({ team: null, path: path.join(testRoot, 'orphan') })
    await insertPr(assignedRid, {
      number: 2,
      openedAt: new Date(merged.getTime() - 2 * 3600000),
      mergedAt: merged,
    })
    await insertPr(rid, {
      number: 1,
      openedAt: new Date(merged.getTime() - 10 * 3600000),
      mergedAt: merged,
    })
    const d = await getPrCycleTimeDashboard({ db, now, weeks: 8 })
    expect(d.teamBreakdown.some((t) => t.team === DASHBOARD_UNASSIGNED_TEAM)).toBe(true)
    expect(d.teamBreakdown.at(-1)?.team).toBe(DASHBOARD_UNASSIGNED_TEAM)
  })

  it('exceptions_detect_worsening_team', async () => {
    const now = new Date('2026-05-14T15:00:00.000')
    const { current, previous } = getDashboardDateRanges(now, 8)
    const rid = await insertRepo({ team: 'Alpha' })
    const prevMerged = new Date(previous.from.getTime() + 3 * 24 * 60 * 60 * 1000)
    const curMerged = new Date(current.from.getTime() + 3 * 24 * 60 * 60 * 1000)
    for (let i = 0; i < 3; i += 1) {
      await insertPr(rid, {
        number: 30 + i,
        openedAt: new Date(prevMerged.getTime() - 40 * 3600000),
        mergedAt: prevMerged,
      })
    }
    for (let i = 0; i < 3; i += 1) {
      await insertPr(rid, {
        number: 40 + i,
        openedAt: new Date(curMerged.getTime() - 60 * 3600000),
        mergedAt: curMerged,
      })
    }
    const d = await getPrCycleTimeDashboard({ db, now, weeks: 8 })
    expect(d.exceptions.some((e) => e.type === 'team_worsened' && e.team === 'Alpha')).toBe(true)
  })

  it('exceptions_team_worsened_not_emitted_when_baseline_pending', async () => {
    const now = new Date('2026-05-14T15:00:00.000')
    const { current, previous } = getDashboardDateRanges(now, 8)
    const rid = await insertRepo({ team: 'Alpha' })
    const prevMerged = new Date(previous.from.getTime() + 3 * 24 * 60 * 60 * 1000)
    const curMerged = new Date(current.from.getTime() + 3 * 24 * 60 * 60 * 1000)
    for (let i = 0; i < 2; i += 1) {
      await insertPr(rid, {
        number: 50 + i,
        openedAt: new Date(prevMerged.getTime() - 40 * 3600000),
        mergedAt: prevMerged,
      })
    }
    for (let i = 0; i < 3; i += 1) {
      await insertPr(rid, {
        number: 60 + i,
        openedAt: new Date(curMerged.getTime() - 100 * 3600000),
        mergedAt: curMerged,
      })
    }
    const d = await getPrCycleTimeDashboard({ db, now, weeks: 8 })
    expect(d.exceptions.some((e) => e.type === 'baseline_pending')).toBe(true)
    expect(d.exceptions.some((e) => e.type === 'team_worsened')).toBe(false)
  })

  it('exceptions_sort_order_is_deterministic', async () => {
    const now = new Date('2026-05-14T15:00:00.000')
    const { current, previous } = getDashboardDateRanges(now, 8)
    const prevMerged = new Date(previous.from.getTime() + 5 * 24 * 60 * 60 * 1000)
    const curMerged = new Date(current.from.getTime() + 5 * 24 * 60 * 60 * 1000)

    const makeTeam = async (team: string, prevH: number, curH: number, n0: number) => {
      const rid = await insertRepo({ team, path: path.join(testRoot, team) })
      for (let i = 0; i < 3; i += 1) {
        await insertPr(rid, {
          number: n0 + i,
          openedAt: new Date(prevMerged.getTime() - prevH * 3600000),
          mergedAt: prevMerged,
        })
      }
      for (let i = 0; i < 3; i += 1) {
        await insertPr(rid, {
          number: n0 + 10 + i,
          openedAt: new Date(curMerged.getTime() - curH * 3600000),
          mergedAt: curMerged,
        })
      }
    }

    await makeTeam('Alice', 10, 25, 100)
    await makeTeam('Bob', 20, 35, 200)
    await insertRepo({ team: 'Charlie', path: path.join(testRoot, 'Charlie') })
    const rc = (await db.select().from(repositories).where(eq(repositories.path, path.join(testRoot, 'Charlie'))))[0]!
    await insertPr(rc.id, {
      number: 1,
      state: 'open',
      openedAt: new Date(now.getTime() - 500 * 3600000),
      mergedAt: null,
    })
    await insertPr(rc.id, {
      number: 2,
      openedAt: new Date(curMerged.getTime() - 5 * 3600000),
      mergedAt: curMerged,
    })

    const d = await getPrCycleTimeDashboard({ db, now, weeks: 8 })
    const worsened = d.exceptions.filter((e) => e.type === 'team_worsened')
    expect(worsened.length).toBeGreaterThanOrEqual(2)
    const aliceIdx = d.exceptions.findIndex((e) => e.team === 'Alice' && e.type === 'team_worsened')
    const bobIdx = d.exceptions.findIndex((e) => e.team === 'Bob' && e.type === 'team_worsened')
    expect(aliceIdx).toBeLessThan(bobIdx)
  })

  it('exceptions_detect_long_open_prs', async () => {
    const now = new Date('2026-05-14T15:00:00.000')
    const { current } = getDashboardDateRanges(now, 8)
    const merged = new Date(current.from.getTime() + 2 * 24 * 60 * 60 * 1000)
    const rid = await insertRepo({ team: 'Alpha' })
    await insertPr(rid, {
      number: 1,
      openedAt: new Date(merged.getTime() - 5 * 3600000),
      mergedAt: merged,
    })
    await insertPr(rid, {
      number: 2,
      state: 'open',
      openedAt: new Date(now.getTime() - 200 * 3600000),
      mergedAt: null,
    })
    await insertPr(rid, {
      number: 3,
      state: 'open',
      openedAt: new Date(now.getTime() - 100 * 3600000),
      mergedAt: null,
    })
    const d = await getPrCycleTimeDashboard({ db, now, weeks: 8 })
    const ex = d.exceptions.find((e) => e.type === 'long_open_prs' && e.team === 'Alpha')
    expect(ex).toBeTruthy()
    expect(ex?.count).toBe(2)
    expect(ex?.teamMedianHours).toBe(5)
    expect(ex?.averageOpenPrAgeHours).toBe(150)
    expect(ex?.percentOverTeamMedian).toBe(2900)
  })

  it('exceptions_suppress_long_open_prs_without_team_median', async () => {
    const now = new Date('2026-05-14T15:00:00.000')
    const rid = await insertRepo({ team: 'Alpha' })
    await insertPr(rid, {
      number: 2,
      state: 'open',
      openedAt: new Date(now.getTime() - 500 * 3600000),
      mergedAt: null,
    })
    const d = await getPrCycleTimeDashboard({ db, now, weeks: 8 })
    expect(d.exceptions.some((e) => e.type === 'long_open_prs')).toBe(false)
  })

  it('exceptions_include_baseline_pending', async () => {
    const now = new Date('2026-05-14T15:00:00.000')
    const { current } = getDashboardDateRanges(now, 8)
    const merged = new Date(current.from.getTime() + 2 * 24 * 60 * 60 * 1000)
    const rid = await insertRepo({ team: 'Alpha' })
    await insertPr(rid, {
      number: 1,
      openedAt: new Date(merged.getTime() - 10 * 3600000),
      mergedAt: merged,
    })
    const d = await getPrCycleTimeDashboard({ db, now, weeks: 8 })
    expect(d.exceptions.some((e) => e.type === 'baseline_pending')).toBe(true)
  })

  it('dashboard_excludes_inactive_repositories', async () => {
    const now = new Date('2026-05-14T15:00:00.000')
    const { current } = getDashboardDateRanges(now, 8)
    const merged = new Date(current.from.getTime() + 2 * 24 * 60 * 60 * 1000)
    const activeId = await insertRepo({ path: path.join(testRoot, 'active'), active: true })
    const inactiveId = await insertRepo({
      path: path.join(testRoot, 'inactive'),
      active: false,
      team: 'Beta',
    })
    await insertPr(activeId, {
      number: 1,
      openedAt: new Date(merged.getTime() - 10 * 3600000),
      mergedAt: merged,
    })
    await insertPr(inactiveId, {
      number: 1,
      openedAt: new Date(merged.getTime() - 200 * 3600000),
      mergedAt: merged,
    })
    const d = await getPrCycleTimeDashboard({ db, now, weeks: 8 })
    expect(d.metric.mergedPrCount).toBe(1)
  })

  it('dashboard_freshness_reports_repos_scanned_count', async () => {
    const now = new Date('2026-05-14T15:00:00.000')
    await insertRepo({ path: path.join(testRoot, 'r1'), scanStatus: 'ready' })
    await insertRepo({ path: path.join(testRoot, 'r2'), scanStatus: 'excluded' })
    await insertRepo({ path: path.join(testRoot, 'r3'), scanStatus: 'missing' })
    const d = await getPrCycleTimeDashboard({ db, now, weeks: 8 })
    expect(d.freshness.reposScanned).toBe(2)
  })

  it('dashboard_team_breakdown_reports_longest_open_pr_hours', async () => {
    const now = new Date('2026-05-14T15:00:00.000')
    const rid = await insertRepo({ team: 'Alpha' })
    await insertPr(rid, {
      number: 1,
      state: 'open',
      openedAt: new Date(now.getTime() - 50 * 3600000),
      mergedAt: null,
    })
    await insertPr(rid, {
      number: 2,
      state: 'open',
      openedAt: new Date(now.getTime() - 150 * 3600000),
      mergedAt: null,
    })
    const d = await getPrCycleTimeDashboard({ db, now, weeks: 8 })
    const row = d.teamBreakdown.find((t) => t.team === 'Alpha')
    expect(row?.longestOpenPrHours).toBeCloseTo(150, 0)
  })

  it('exceptions_are_limited_to_three', async () => {
    const now = new Date('2026-05-14T15:00:00.000')
    const { current } = getDashboardDateRanges(now, 8)
    const merged = new Date(current.from.getTime() + 2 * 24 * 60 * 60 * 1000)
    const teams = ['T1', 'T2', 'T3', 'T4']
    for (const [i, team] of teams.entries()) {
      const rid = await insertRepo({
        team,
        path: path.join(testRoot, `x${i}`),
        repo: `repo-${i}`,
      })
      await insertPr(rid, {
        number: 1,
        openedAt: new Date(merged.getTime() - 5 * 3600000),
        mergedAt: merged,
      })
    }
    const d = await getPrCycleTimeDashboard({ db, now, weeks: 8 })
    expect(d.exceptions.length).toBe(3)
    expect(d.exceptions.every((e) => e.type === 'baseline_pending')).toBe(true)
  })

  it('team_filter_scopes_median_and_weekly_trend_to_requested_team', async () => {
    const now = new Date('2026-05-14T15:00:00.000')
    const { current } = getDashboardDateRanges(now, 8)
    const merged = new Date(current.from.getTime() + 2 * 24 * 60 * 60 * 1000)

    const alphaRid = await insertRepo({ team: 'Alpha', path: path.join(testRoot, 'alpha'), repo: 'alpha-svc' })
    const betaRid = await insertRepo({ team: 'Beta', path: path.join(testRoot, 'beta'), repo: 'beta-svc' })

    // Alpha: 10-hour cycle time
    await insertPr(alphaRid, {
      number: 1,
      openedAt: new Date(merged.getTime() - 10 * 3600000),
      mergedAt: merged,
    })
    // Beta: 100-hour cycle time
    await insertPr(betaRid, {
      number: 2,
      openedAt: new Date(merged.getTime() - 100 * 3600000),
      mergedAt: merged,
    })

    const d = await getPrCycleTimeDashboard({ db, now, weeks: 8, team: 'Alpha' })
    expect(d.metric.mergedPrCount).toBe(1)
    expect(d.metric.medianHours).toBe(10)
    expect(d.weeklyTrend.every((w) => w.medianHours === null || w.medianHours <= 10)).toBe(true)
  })

  it('team_filter_falls_back_to_all_teams_for_unrecognised_team', async () => {
    const now = new Date('2026-05-14T15:00:00.000')
    const { current } = getDashboardDateRanges(now, 8)
    const merged = new Date(current.from.getTime() + 2 * 24 * 60 * 60 * 1000)

    const rid = await insertRepo({ team: 'Alpha', path: path.join(testRoot, 'alpha'), repo: 'alpha-svc' })
    await insertPr(rid, {
      number: 1,
      openedAt: new Date(merged.getTime() - 10 * 3600000),
      mergedAt: merged,
    })

    const d = await getPrCycleTimeDashboard({ db, now, weeks: 8, team: 'NonExistentTeam' })
    expect(d.metric.mergedPrCount).toBe(1)
  })

  it('no_team_filter_teamBreakdown_contains_all_teams', async () => {
    const now = new Date('2026-05-14T15:00:00.000')
    const { current } = getDashboardDateRanges(now, 8)
    const merged = new Date(current.from.getTime() + 2 * 24 * 60 * 60 * 1000)

    const alphaRid = await insertRepo({ team: 'Alpha', path: path.join(testRoot, 'alpha'), repo: 'alpha-svc' })
    const betaRid = await insertRepo({ team: 'Beta', path: path.join(testRoot, 'beta'), repo: 'beta-svc' })

    await insertPr(alphaRid, { number: 1, openedAt: new Date(merged.getTime() - 10 * 3600000), mergedAt: merged })
    await insertPr(betaRid, { number: 2, openedAt: new Date(merged.getTime() - 100 * 3600000), mergedAt: merged })

    const d = await getPrCycleTimeDashboard({ db, now, weeks: 8 })
    expect(d.teamBreakdown).toHaveLength(2)
    expect(d.teamBreakdown.map((t) => t.team)).toContain('Alpha')
    expect(d.teamBreakdown.map((t) => t.team)).toContain('Beta')
  })

  it('allTeams_always_contains_all_teams_regardless_of_filter', async () => {
    const now = new Date('2026-05-14T15:00:00.000')
    const { current } = getDashboardDateRanges(now, 8)
    const merged = new Date(current.from.getTime() + 2 * 24 * 60 * 60 * 1000)

    const alphaRid = await insertRepo({ team: 'Alpha', path: path.join(testRoot, 'alpha'), repo: 'alpha-svc' })
    const betaRid = await insertRepo({ team: 'Beta', path: path.join(testRoot, 'beta'), repo: 'beta-svc' })

    await insertPr(alphaRid, { number: 1, openedAt: new Date(merged.getTime() - 10 * 3600000), mergedAt: merged })
    await insertPr(betaRid, { number: 2, openedAt: new Date(merged.getTime() - 100 * 3600000), mergedAt: merged })

    const d = await getPrCycleTimeDashboard({ db, now, weeks: 8, team: 'Alpha' })
    expect(d.allTeams).toContain('Alpha')
    expect(d.allTeams).toContain('Beta')
    expect(d.teamBreakdown).toHaveLength(1)
  })

  it('team_filter_teamBreakdown_shows_only_active_team', async () => {
    const now = new Date('2026-05-14T15:00:00.000')
    const { current } = getDashboardDateRanges(now, 8)
    const merged = new Date(current.from.getTime() + 2 * 24 * 60 * 60 * 1000)

    const alphaRid = await insertRepo({ team: 'Alpha', path: path.join(testRoot, 'alpha'), repo: 'alpha-svc' })
    const betaRid = await insertRepo({ team: 'Beta', path: path.join(testRoot, 'beta'), repo: 'beta-svc' })

    await insertPr(alphaRid, { number: 1, openedAt: new Date(merged.getTime() - 10 * 3600000), mergedAt: merged })
    await insertPr(betaRid, { number: 2, openedAt: new Date(merged.getTime() - 100 * 3600000), mergedAt: merged })

    const d = await getPrCycleTimeDashboard({ db, now, weeks: 8, team: 'Alpha' })
    expect(d.teamBreakdown).toHaveLength(1)
    expect(d.teamBreakdown[0].team).toBe('Alpha')
    expect(d.teamBreakdown[0].medianHours).toBe(10)
  })

  it('team_filter_prSize_teamBreakdown_shows_only_active_team', async () => {
    const now = new Date('2026-05-14T15:00:00.000')
    const { current } = getDashboardDateRanges(now, 8)
    const merged = new Date(current.from.getTime() + 2 * 24 * 60 * 60 * 1000)

    const alphaRid = await insertRepo({ team: 'Alpha', path: path.join(testRoot, 'alpha'), repo: 'alpha-svc' })
    const betaRid = await insertRepo({ team: 'Beta', path: path.join(testRoot, 'beta'), repo: 'beta-svc' })

    // PRs with size data so prSize section is populated
    await insertPr(alphaRid, { number: 1, mergedAt: merged, openedAt: new Date(merged.getTime() - 1 * 3600000), additions: 50, deletions: 10, changedFiles: 3 })
    await insertPr(alphaRid, { number: 2, mergedAt: merged, openedAt: new Date(merged.getTime() - 1 * 3600000), additions: 60, deletions: 5, changedFiles: 2 })
    await insertPr(alphaRid, { number: 3, mergedAt: merged, openedAt: new Date(merged.getTime() - 1 * 3600000), additions: 40, deletions: 20, changedFiles: 4 })
    await insertPr(betaRid, { number: 4, mergedAt: merged, openedAt: new Date(merged.getTime() - 1 * 3600000), additions: 200, deletions: 50, changedFiles: 10 })
    await insertPr(betaRid, { number: 5, mergedAt: merged, openedAt: new Date(merged.getTime() - 1 * 3600000), additions: 210, deletions: 60, changedFiles: 12 })
    await insertPr(betaRid, { number: 6, mergedAt: merged, openedAt: new Date(merged.getTime() - 1 * 3600000), additions: 190, deletions: 40, changedFiles: 8 })

    const d = await getPrCycleTimeDashboard({ db, now, weeks: 8, team: 'Alpha' })
    expect(d.prSize).toBeDefined()
    expect(d.prSize!.teamBreakdown).toHaveLength(1)
    expect(d.prSize!.teamBreakdown[0].team).toBe('Alpha')
  })

  it('team_filter_scopes_exceptions_to_selected_team', async () => {
    const now = new Date('2026-05-14T15:00:00.000')
    const { current } = getDashboardDateRanges(now, 8)
    const merged = new Date(current.from.getTime() + 2 * 24 * 60 * 60 * 1000)

    const alphaRid = await insertRepo({ team: 'Alpha', path: path.join(testRoot, 'alpha'), repo: 'alpha-svc' })
    const betaRid = await insertRepo({ team: 'Beta', path: path.join(testRoot, 'beta'), repo: 'beta-svc' })

    // One PR per team in current period, none in previous → baseline_pending for both
    await insertPr(alphaRid, { number: 1, openedAt: new Date(merged.getTime() - 10 * 3600000), mergedAt: merged })
    await insertPr(betaRid, { number: 2, openedAt: new Date(merged.getTime() - 100 * 3600000), mergedAt: merged })

    const d = await getPrCycleTimeDashboard({ db, now, weeks: 8, team: 'Alpha' })
    expect(d.exceptions.length).toBeGreaterThan(0)
    expect(d.exceptions.every((e) => e.team === 'Alpha')).toBe(true)
  })
})
