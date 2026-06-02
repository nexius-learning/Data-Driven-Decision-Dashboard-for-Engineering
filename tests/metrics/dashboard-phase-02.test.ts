import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises'

import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { RepositoryCandidate } from '~/collector/repo-discovery'
import { upsertRepositories } from '~/collector/repository-store'
import { getDashboardDateRanges } from '~/config/env'
import type { TeamMappingConfig } from '~/config/team-mapping'
import { createDb, runMigrations } from '~/db/client'
import { getPrCycleTimeDashboard } from '~/metrics/pr-cycle-time-dashboard'
import {
  pullRequestReviewComments,
  pullRequestReviews,
  pullRequests,
  repositories,
  syncErrors,
  syncRuns,
} from '~/db/schema'

const databaseUrl = process.env.DATABASE_URL?.trim()

describe('dashboard phase 02 integration', () => {
  let db: ReturnType<typeof createDb>
  let mappingPath: string
  let repoRoot: string

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
    await db.delete(pullRequestReviews)
    await db.delete(pullRequestReviewComments)
    await db.delete(pullRequests)
    await db.delete(repositories)
    await db.delete(syncRuns)

    repoRoot = await mkdtemp(path.join(process.cwd(), '.tmp', 'phase02-'))
    process.env.DASHBOARD_REPO_ROOT = repoRoot
    mappingPath = path.join(repoRoot, 'team-mapping.json')
    const mapping: TeamMappingConfig = { teams: [{ name: 'TeamX', repoPatterns: ['svc'] }] }
    await writeFile(mappingPath, JSON.stringify(mapping), 'utf8')
    process.env.TEAM_MAPPING_PATH = mappingPath
  })

  async function makeRepo(syncedAt: Date | null, repo = 'svc') {
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
    if (syncedAt) {
      await db
        .update(repositories)
        .set({ lastReviewSyncedAt: syncedAt })
        .where(eq(repositories.id, r.id))
    }
    return r
  }

  async function insertReviewedPr(
    repositoryId: string,
    input: {
      mergedAt: Date
      openedAt?: Date
      reviewHours?: number[]
      number?: number
    },
  ) {
    const number = input.number ?? 1
    const openedAt = input.openedAt ?? new Date(input.mergedAt.getTime() - 24 * 60 * 60 * 1000)
    const [pr] = await db
      .insert(pullRequests)
      .values({
        repositoryId,
        githubNodeId: `node-${randomUUID()}`,
        number,
        title: `PR ${number}`,
        state: 'merged',
        openedAt,
        githubUpdatedAt: input.mergedAt,
        mergedAt: input.mergedAt,
        url: `https://github.com/gde-mit/svc/pull/${number}`,
        missingJiraKey: false,
      })
      .returning()
    for (const [index, hours] of (input.reviewHours ?? [2]).entries()) {
      await db.insert(pullRequestReviews).values({
        pullRequestId: pr.id,
        githubReviewId: index + 1,
        state: 'APPROVED',
        submittedAt: new Date(openedAt.getTime() + hours * 60 * 60 * 1000),
        authorLogin: `reviewer-${index}`,
        authorType: 'User',
        isBot: false,
      })
    }
  }

  it('payload_omits_firstReview_key_before_first_sync', async () => {
    await makeRepo(null)
    const out = await getPrCycleTimeDashboard({ db, now: new Date('2026-04-30T00:00:00Z') })
    expect(out.firstReview).toBeUndefined()
    expect(out.reviewMetricsPending).toBeDefined()
  })

  it('payload_includes_firstReview_after_first_sync', async () => {
    await makeRepo(new Date('2026-04-28T00:00:00Z'))
    const out = await getPrCycleTimeDashboard({ db, now: new Date('2026-04-30T00:00:00Z') })
    expect(out.firstReview).toBeDefined()
    expect(out.reviewMetricsPending).toBeUndefined()
  })

  it('payload_includes_reviewFreshness_when_phase02_visible', async () => {
    const syncedAt = new Date('2026-04-28T10:00:00Z')
    await makeRepo(syncedAt)
    const out = await getPrCycleTimeDashboard({ db, now: new Date('2026-04-30T00:00:00Z') })
    expect(out.reviewFreshness?.oldestReviewSyncAt).toBe(syncedAt.toISOString())
    expect(Array.isArray(out.reviewFreshness?.reviewSyncErrors)).toBe(true)
  })

  it('phase_01_payload_byte_identical_in_hidden_state', async () => {
    await makeRepo(null)
    const out = await getPrCycleTimeDashboard({ db, now: new Date('2026-04-30T00:00:00Z') })
    expect(out.freshness.reposScanned).toBeGreaterThanOrEqual(1)
  })

  it('payload_omits_reviewMetricsPending_when_phase02_visible', async () => {
    await makeRepo(new Date('2026-04-28T00:00:00Z'))
    const out = await getPrCycleTimeDashboard({ db, now: new Date('2026-04-30T00:00:00Z') })
    expect(Object.prototype.hasOwnProperty.call(out, 'reviewMetricsPending')).toBe(false)
  })

  it('freshness_shows_oldest_review_sync_across_synced_repos', async () => {
    const older = new Date('2026-04-25T00:00:00Z')
    const newer = new Date('2026-04-28T00:00:00Z')
    // two synced repos
    const cands: RepositoryCandidate[] = [
      {
        name: 'svc',
        path: path.join(repoRoot, `svc1-${randomUUID()}`),
        rootPath: repoRoot,
        remoteUrl: 'https://github.com/gde-mit/svc.git',
        owner: 'gde-mit',
        repo: 'svc',
      },
      {
        name: 'svc',
        path: path.join(repoRoot, `svc2-${randomUUID()}`),
        rootPath: repoRoot,
        remoteUrl: 'https://github.com/gde-mit/svc2.git',
        owner: 'gde-mit',
        repo: 'svc2',
      },
    ]
    for (const c of cands) await mkdir(c.path, { recursive: true })
    await upsertRepositories(
      db,
      repoRoot,
      cands,
      { teams: [{ name: 'TeamX', repoPatterns: ['svc', 'svc2'] }] },
      'gde-mit',
    )
    const allRepos = await db.select().from(repositories)
    await db
      .update(repositories)
      .set({ lastReviewSyncedAt: older })
      .where(eq(repositories.id, allRepos[0].id))
    await db
      .update(repositories)
      .set({ lastReviewSyncedAt: newer })
      .where(eq(repositories.id, allRepos[1].id))
    const out = await getPrCycleTimeDashboard({ db, now: new Date('2026-04-30T00:00:00Z') })
    expect(out.reviewFreshness?.oldestReviewSyncAt).toBe(older.toISOString())
  })

  it('phase_02_section_hidden_when_repositories_table_empty', async () => {
    const out = await getPrCycleTimeDashboard({ db, now: new Date('2026-04-30T00:00:00Z') })
    expect(out.firstReview).toBeUndefined()
    expect(out.reviewMetricsPending).toBeDefined()
  })

  it('dashboard_first_review_exposes_default_16_point_comparison', async () => {
    await makeRepo(new Date('2026-04-28T00:00:00Z'))
    const out = await getPrCycleTimeDashboard({ db, now: new Date('2026-04-30T00:00:00Z') })
    expect(out.firstReview?.comparisonWeeklyTrend).toHaveLength(16)
    expect(out.firstReview?.comparisonWeeklyTrend.map((p) => p.period)).toEqual([
      ...Array(8).fill('previous'),
      ...Array(8).fill('current'),
    ])
    expect(out.firstReview?.comparisonWeeklyTrend.map((p) => p.bucketIndex)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 1, 2, 3, 4, 5, 6, 7, 8,
    ])
  })

  it('dashboard_first_review_exposes_8_point_comparison_for_four_week_range', async () => {
    await makeRepo(new Date('2026-04-28T00:00:00Z'))
    const out = await getPrCycleTimeDashboard({
      db,
      now: new Date('2026-04-30T00:00:00Z'),
      weeks: 4,
    })
    expect(out.firstReview?.comparisonWeeklyTrend).toHaveLength(8)
  })

  it('dashboard_first_review_weekly_trend_matches_current_comparison_half', async () => {
    await makeRepo(new Date('2026-04-28T00:00:00Z'))
    const out = await getPrCycleTimeDashboard({ db, now: new Date('2026-04-30T00:00:00Z') })
    expect(out.firstReview?.weeklyTrend).toEqual(
      out.firstReview?.comparisonWeeklyTrend.slice(8).map((point) => ({
        weekStart: point.bucketLabel,
        medianHours: point.medianHours,
      })),
    )
  })

  it('dashboard_first_review_comparison_excludes_unsynced_repositories', async () => {
    const now = new Date('2026-04-30T00:00:00Z')
    const { current } = getDashboardDateRanges(now, 8)
    const syncedRepo = await makeRepo(new Date('2026-04-28T00:00:00Z'), 'svc-synced')
    const unsyncedRepo = await makeRepo(null, 'svc-unsynced')
    await db
      .update(repositories)
      .set({ active: true, scanStatus: 'ready' })
      .where(eq(repositories.id, syncedRepo.id))
    await insertReviewedPr(unsyncedRepo.id, {
      mergedAt: new Date(current.from.getTime() + 12 * 60 * 60 * 1000),
      reviewHours: [7],
    })
    const out = await getPrCycleTimeDashboard({ db, now })
    expect(out.firstReview?.comparisonWeeklyTrend.every((p) => p.medianHours === null)).toBe(true)
  })

  it('dashboard_first_review_comparison_uses_first_qualifying_human_review', async () => {
    const now = new Date('2026-04-30T00:00:00Z')
    const { current } = getDashboardDateRanges(now, 8)
    const repo = await makeRepo(new Date('2026-04-28T00:00:00Z'))
    await insertReviewedPr(repo.id, {
      mergedAt: new Date(current.from.getTime() + 12 * 60 * 60 * 1000),
      reviewHours: [9, 3],
    })
    const out = await getPrCycleTimeDashboard({ db, now })
    expect(out.firstReview?.comparisonWeeklyTrend[8]?.medianHours).toBe(3)
  })
})
