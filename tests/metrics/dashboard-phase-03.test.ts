import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'

import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { RepositoryCandidate } from '~/collector/repo-discovery'
import { upsertRepositories } from '~/collector/repository-store'
import type { TeamMappingConfig } from '~/config/team-mapping'
import { getDashboardDateRanges } from '~/config/env'
import { createDb, runMigrations } from '~/db/client'
import { pullRequests, repositories, syncErrors } from '~/db/schema'
import {
  getPrCycleTimeDashboard,
  PR_SIZE_COMPLETED_TREND_WEEKS,
} from '~/metrics/pr-cycle-time-dashboard'
import { isoWeekStart } from '~/metrics/pr-size-metric'

const databaseUrl = process.env.DATABASE_URL?.trim()

describe('dashboard phase 03 integration', () => {
  let db: ReturnType<typeof createDb>
  let mappingPath: string
  let repoRoot: string
  const now = new Date('2026-04-30T12:00:00.000Z')

  beforeAll(async () => {
    await runMigrations(databaseUrl)
    db = createDb(databaseUrl)
  })

  afterAll(async () => {
    await rm(repoRoot, { recursive: true, force: true })
    await db.$client.end({ timeout: 5 })
  })

  beforeEach(async () => {
    await db.delete(syncErrors)
    await db.delete(pullRequests)
    await db.delete(repositories)

    repoRoot = await mkdtemp(path.join(process.cwd(), '.tmp', 'phase03-'))
    process.env.DASHBOARD_REPO_ROOT = repoRoot
    mappingPath = path.join(repoRoot, 'team-mapping.json')
    const mapping: TeamMappingConfig = { teams: [{ name: 'TeamX', repoPatterns: ['svc'] }] }
    await writeFile(mappingPath, JSON.stringify(mapping), 'utf8')
    process.env.TEAM_MAPPING_PATH = mappingPath
  })

  async function makeRepo(reviewSyncedAt: Date | null = null, repo = 'svc') {
    const cand: RepositoryCandidate = {
      name: repo,
      path: path.join(repoRoot, `${repo}-${randomUUID()}`),
      rootPath: repoRoot,
      remoteUrl: `https://github.com/gde-mit/${repo}.git`,
      owner: 'gde-mit',
      repo,
    }
    await mkdir(cand.path, { recursive: true })
    await upsertRepositories(
      db,
      repoRoot,
      [cand],
      { teams: [{ name: 'TeamX', repoPatterns: ['svc'] }] },
      'gde-mit',
    )
    const [r] = await db.select().from(repositories).where(eq(repositories.path, cand.path))
    if (reviewSyncedAt) {
      await db
        .update(repositories)
        .set({ lastReviewSyncedAt: reviewSyncedAt })
        .where(eq(repositories.id, r.id))
    }
    return r
  }

  async function insertMergedPr(
    repoId: string,
    overrides: {
      mergedAt: Date
      openedAt?: Date
      additions?: number | null
      deletions?: number | null
      changedFiles?: number | null
      number?: number
    },
  ) {
    const openedAt =
      overrides.openedAt ?? new Date(overrides.mergedAt.getTime() - 24 * 60 * 60 * 1000)
    await db.insert(pullRequests).values({
      repositoryId: repoId,
      githubNodeId: `node-${randomUUID()}`,
      number: overrides.number ?? 1,
      title: `PR ${overrides.number ?? 1}`,
      state: 'merged',
      openedAt,
      githubUpdatedAt: overrides.mergedAt,
      mergedAt: overrides.mergedAt,
      url: `https://github.com/gde-mit/svc/pull/${overrides.number ?? 1}`,
      missingJiraKey: false,
      additions: overrides.additions ?? null,
      deletions: overrides.deletions ?? null,
      changedFiles: overrides.changedFiles ?? null,
    })
  }

  function currentMergedAt(dayOffsetFromStart: number): Date {
    const { current } = getDashboardDateRanges(now, 8)
    return new Date(current.from.getTime() + dayOffsetFromStart * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000)
  }

  it('dashboard_includes_pr_size_when_sized_prs_exist', async () => {
    const repo = await makeRepo()
    await insertMergedPr(repo.id, {
      mergedAt: currentMergedAt(3),
      additions: 100,
      deletions: 50,
      changedFiles: 4,
    })
    const out = await getPrCycleTimeDashboard({ db, now })
    expect(out.prSize).toBeDefined()
    expect(out.prSize?.metric.qualifyingPrCount).toBe(1)
    expect(out.prSize?.metric.medianLines).toBe(150)
  })

  it('dashboard_omits_pr_size_when_no_sized_prs', async () => {
    const repo = await makeRepo()
    await insertMergedPr(repo.id, {
      mergedAt: currentMergedAt(3),
      additions: null,
      deletions: null,
    })
    const out = await getPrCycleTimeDashboard({ db, now })
    expect(out.prSize).toBeUndefined()
  })

  it('dashboard_pr_size_metric_matches_expected_median', async () => {
    const repo = await makeRepo()
    const mergedAt = currentMergedAt(5)
    await insertMergedPr(repo.id, {
      mergedAt,
      number: 1,
      additions: 40,
      deletions: 10,
      changedFiles: 2,
    })
    await insertMergedPr(repo.id, {
      mergedAt,
      number: 2,
      additions: 100,
      deletions: 0,
      changedFiles: 5,
    })
    await insertMergedPr(repo.id, {
      mergedAt,
      number: 3,
      additions: 60,
      deletions: 40,
      changedFiles: 3,
    })
    const out = await getPrCycleTimeDashboard({ db, now })
    expect(out.prSize?.metric.medianLines).toBe(100)
    expect(out.prSize?.metric.medianChangedFiles).toBe(3)
  })

  it('dashboard_computes_median_over_sized_prs_only', async () => {
    const repo = await makeRepo()
    const mergedAt = currentMergedAt(4)
    for (const [n, lines] of [
      [1, 100],
      [2, 200],
      [3, 300],
    ] as const) {
      await insertMergedPr(repo.id, {
        mergedAt,
        number: n,
        additions: lines,
        deletions: 0,
        changedFiles: 1,
      })
    }
    for (const n of [4, 5]) {
      await insertMergedPr(repo.id, {
        mergedAt,
        number: n,
        additions: null,
        deletions: null,
      })
    }
    const out = await getPrCycleTimeDashboard({ db, now })
    expect(out.prSize).toBeDefined()
    expect(out.prSize?.metric.medianLines).toBe(200)
    expect(out.prSize?.metric.qualifyingPrCount).toBe(3)
  })

  it('dashboard_phase01_shape_unchanged', async () => {
    const repo = await makeRepo()
    const mergedAt = currentMergedAt(10)
    for (const [n, cycleHours] of [
      [1, 24],
      [2, 48],
      [3, 72],
    ] as const) {
      await insertMergedPr(repo.id, {
        mergedAt,
        openedAt: new Date(mergedAt.getTime() - cycleHours * 60 * 60 * 1000),
        number: n,
        additions: 10,
        deletions: 0,
      })
    }
    const out = await getPrCycleTimeDashboard({ db, now })
    expect(out.metric.medianHours).toBe(48)
    expect(out.metric.mergedPrCount).toBe(3)
    expect(Array.isArray(out.exceptions)).toBe(true)
    expect(out.weeklyTrend.length).toBeGreaterThan(0)
    expect(out.teamBreakdown.length).toBeGreaterThan(0)
  })

  it('dashboard_phase02_shape_unchanged', async () => {
    const syncedAt = new Date('2026-04-28T00:00:00Z')
    await makeRepo(syncedAt)
    const out = await getPrCycleTimeDashboard({ db, now })
    expect(out.firstReview).toBeDefined()
    expect(out.reviewFreshness).toBeDefined()
    expect(out.reviewMetricsPending).toBeUndefined()
    expect(out.firstReview?.metric).toMatchObject({
      qualifyingPrCount: expect.any(Number),
      mergedPrCountInSyncedRepos: expect.any(Number),
    })
  })

  it('dashboard_pr_size_trend_returns_16_completed_weeks_for_default_range', async () => {
    const repo = await makeRepo()
    await insertMergedPr(repo.id, {
      mergedAt: currentMergedAt(4),
      additions: 80,
      deletions: 20,
      changedFiles: 2,
    })
    const out = await getPrCycleTimeDashboard({ db, now })
    expect(out.prSize).toBeDefined()
    const trend = out.prSize!.weeklyTrend
    expect(trend).toHaveLength(PR_SIZE_COMPLETED_TREND_WEEKS)
    expect(trend.every((p) => p.isPartialWeek === false)).toBe(true)
    for (const p of trend) {
      expect(p.weekStart).toEqual(expect.any(String))
      expect(p.medianLines === null || typeof p.medianLines === 'number').toBe(true)
      expect(p.measuredPrCount).toEqual(expect.any(Number))
      expect(p.isPartialWeek).toBe(false)
    }
    expect(trend.some((p) => p.measuredPrCount > 0)).toBe(true)
  })

  it('dashboard_pr_size_trend_returns_16_completed_weeks_for_four_week_dashboard_range', async () => {
    const repo = await makeRepo()
    const { current } = getDashboardDateRanges(now, 4)
    await insertMergedPr(repo.id, {
      mergedAt: new Date(current.from.getTime() + 4 * 24 * 60 * 60 * 1000),
      additions: 80,
      deletions: 20,
      changedFiles: 2,
    })
    const out = await getPrCycleTimeDashboard({ db, now, weeks: 4 })
    expect(out.range.weeks).toBe(4)
    expect(out.prSize?.weeklyTrend).toHaveLength(PR_SIZE_COMPLETED_TREND_WEEKS)
    expect(out.prSize?.weeklyTrend.every((p) => p.isPartialWeek === false)).toBe(true)
  })

  it('dashboard_pr_size_trend_appends_at_most_one_current_partial_point', async () => {
    const repo = await makeRepo()
    await insertMergedPr(repo.id, {
      mergedAt: now,
      number: 1,
      additions: 40,
      deletions: 10,
      changedFiles: 2,
    })
    const withCurrent = await getPrCycleTimeDashboard({ db, now })
    expect(withCurrent.prSize).toBeDefined()
    const currentTrend = withCurrent.prSize!.weeklyTrend
    expect(currentTrend).toHaveLength(PR_SIZE_COMPLETED_TREND_WEEKS + 1)
    expect(currentTrend.at(-1)?.isPartialWeek).toBe(true)
    expect(currentTrend.at(-1)?.measuredPrCount).toBe(1)
    expect(currentTrend.filter((p) => !p.isPartialWeek)).toHaveLength(PR_SIZE_COMPLETED_TREND_WEEKS)
    expect(currentTrend.filter((p) => p.isPartialWeek)).toHaveLength(1)

    await db.delete(pullRequests)
    await insertMergedPr(repo.id, {
      mergedAt: currentMergedAt(4),
      additions: 80,
      deletions: 20,
      changedFiles: 2,
    })
    const historicalOnly = await getPrCycleTimeDashboard({ db, now })
    expect(historicalOnly.prSize?.weeklyTrend).toHaveLength(PR_SIZE_COMPLETED_TREND_WEEKS)
    expect(historicalOnly.prSize?.weeklyTrend.every((p) => p.isPartialWeek === false)).toBe(true)
  })

  it('dashboard_pr_size_future_row_exclusion_remains_intact', async () => {
    const repo = await makeRepo()
    const baselineMergedAt = currentMergedAt(5)
    await insertMergedPr(repo.id, {
      mergedAt: baselineMergedAt,
      number: 1,
      additions: 50,
      deletions: 50,
      changedFiles: 2,
    })
    const futureMergedAt = new Date(now.getTime() + 2 * 60 * 60 * 1000)
    await insertMergedPr(repo.id, {
      mergedAt: futureMergedAt,
      number: 2,
      additions: 9000,
      deletions: 9000,
      changedFiles: 99,
    })
    const out = await getPrCycleTimeDashboard({ db, now })
    expect(out.prSize).toBeDefined()
    expect(out.prSize?.metric.medianLines).toBe(100)
    expect(out.prSize?.metric.qualifyingPrCount).toBe(1)
    const teamRow = out.prSize?.teamBreakdown.find((r) => r.team === 'TeamX')
    expect(teamRow?.prCount).toBe(1)
    expect(teamRow?.medianLines).toBe(100)
    expect(out.prSize?.exceptions).toHaveLength(0)
    expect(out.prSize?.weeklyTrend.every((p) => p.isPartialWeek === false)).toBe(true)
    const maxMeasured = Math.max(...out.prSize!.weeklyTrend.map((p) => p.measuredPrCount))
    expect(maxMeasured).toBeLessThanOrEqual(1)
  })

  it('dashboard_pr_size_includes_merged_at_now_and_excludes_one_ms_after_now', async () => {
    const repo = await makeRepo()
    await insertMergedPr(repo.id, {
      mergedAt: now,
      number: 1,
      additions: 40,
      deletions: 10,
      changedFiles: 2,
    })
    await insertMergedPr(repo.id, {
      mergedAt: new Date(now.getTime() + 1),
      number: 2,
      additions: 800,
      deletions: 800,
      changedFiles: 20,
    })
    const out = await getPrCycleTimeDashboard({ db, now })
    expect(out.prSize).toBeDefined()
    expect(out.prSize?.metric.medianLines).toBe(50)
    expect(out.prSize?.metric.qualifyingPrCount).toBe(1)
    const teamRow = out.prSize?.teamBreakdown.find((r) => r.team === 'TeamX')
    expect(teamRow?.prCount).toBe(1)
    expect(teamRow?.medianLines).toBe(50)
    expect(out.prSize?.exceptions).toHaveLength(0)
  })

  it('dashboard_pr_size_non_trend_surfaces_keep_selected_dashboard_range', async () => {
    const repo = await makeRepo()
    const { current } = getDashboardDateRanges(now, 8)
    await insertMergedPr(repo.id, {
      mergedAt: currentMergedAt(6),
      number: 1,
      additions: 100,
      deletions: 0,
      changedFiles: 1,
    })
    const oldestCompletedMonday = isoWeekStart(now)
    oldestCompletedMonday.setUTCDate(
      oldestCompletedMonday.getUTCDate() - PR_SIZE_COMPLETED_TREND_WEEKS * 7,
    )
    let trendOnlyMergedAt = new Date(
      oldestCompletedMonday.getTime() + 2 * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000,
    )
    if (trendOnlyMergedAt.getTime() >= current.from.getTime()) {
      trendOnlyMergedAt = new Date(current.from.getTime() - 12 * 60 * 60 * 1000)
    }
    expect(trendOnlyMergedAt.getTime()).toBeLessThan(current.from.getTime())
    expect(isoWeekStart(trendOnlyMergedAt).getTime()).toBe(oldestCompletedMonday.getTime())

    await insertMergedPr(repo.id, {
      mergedAt: trendOnlyMergedAt,
      number: 2,
      additions: 900,
      deletions: 0,
      changedFiles: 10,
    })
    const out = await getPrCycleTimeDashboard({ db, now })
    expect(out.prSize).toBeDefined()
    expect(out.prSize?.metric.medianLines).toBe(100)
    expect(out.prSize?.metric.qualifyingPrCount).toBe(1)
    const teamRow = out.prSize?.teamBreakdown.find((r) => r.team === 'TeamX')
    expect(teamRow?.prCount).toBe(1)
    expect(teamRow?.medianLines).toBe(100)

    const y = oldestCompletedMonday.getUTCFullYear()
    const m = String(oldestCompletedMonday.getUTCMonth() + 1).padStart(2, '0')
    const d = String(oldestCompletedMonday.getUTCDate()).padStart(2, '0')
    const priorWeekKey = `${y}-${m}-${d}`
    const priorTrendPoint = out.prSize?.weeklyTrend.find((p) => p.weekStart === priorWeekKey)
    expect(priorTrendPoint?.medianLines).toBe(900)
    expect(priorTrendPoint?.measuredPrCount).toBe(1)
    expect(out.prSize?.weeklyTrend.every((p) => p.isPartialWeek === false)).toBe(true)
  })

  it('dashboard_pr_size_team_breakdown_includes_ready_team_with_no_current_size_prs', async () => {
    const sizedRepo = await makeRepo()
    const emptyRepo = await makeRepo(null, 'svc-tartalom')
    await db
      .update(repositories)
      .set({ active: true, scanStatus: 'ready' })
      .where(eq(repositories.id, sizedRepo.id))
    await db
      .update(repositories)
      .set({ team: 'Tartalomeloállitas', active: true, scanStatus: 'ready' })
      .where(eq(repositories.id, emptyRepo.id))
    await insertMergedPr(sizedRepo.id, {
      mergedAt: currentMergedAt(4),
      number: 1,
      additions: 80,
      deletions: 20,
      changedFiles: 2,
    })

    const out = await getPrCycleTimeDashboard({ db, now })
    const row = out.prSize?.teamBreakdown.find((r) => r.team === 'Tartalomeloállitas')
    expect(row).toMatchObject({
      prCount: 0,
      medianLines: null,
      medianChangedFiles: null,
      trendPercent: null,
      trend: '—',
    })
  })
})
