import path from 'node:path'
import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { GitHubSyncError } from '~/collector/github-client'
import { syncRepositoryReviews } from '~/collector/review-sync'
import type { RepositoryCandidate } from '~/collector/repo-discovery'
import { upsertRepositories } from '~/collector/repository-store'
import type { TeamMappingConfig } from '~/config/team-mapping'
import { createDb, runMigrations } from '~/db/client'
import {
  pullRequestReviews,
  pullRequests,
  repositories,
  syncErrors,
  syncRuns,
} from '~/db/schema'

const databaseUrl = process.env.DATABASE_URL?.trim()

type ClientStub = {
  listPullRequestReviews: ReturnType<typeof vi.fn>
  listPullRequestReviewComments: ReturnType<typeof vi.fn>
}

function makeClient(overrides: Partial<ClientStub> = {}): ClientStub {
  return {
    listPullRequestReviews: overrides.listPullRequestReviews ?? vi.fn(async () => []),
    listPullRequestReviewComments:
      overrides.listPullRequestReviewComments ?? vi.fn(async () => []),
  }
}

describe('review-sync integration', () => {
  let db: ReturnType<typeof createDb>

  beforeAll(async () => {
    await runMigrations(databaseUrl)
    db = createDb(databaseUrl)
  })

  afterAll(async () => {
    await db.$client.end({ timeout: 5 })
  })

  async function setupRepoWithPrs(prCount: number) {
    const root = path.join('/tmp', `review-sync-${randomUUID()}`)
    const cand: RepositoryCandidate = {
      name: 'repo',
      path: path.join(root, 'repo'),
      rootPath: root,
      remoteUrl: 'https://github.com/gde-mit/example.git',
      owner: 'gde-mit',
      repo: `example-${randomUUID().slice(0, 8)}`,
    }
    const map: TeamMappingConfig = { teams: [{ name: 'T', repoPatterns: ['example'] }] }
    await upsertRepositories(db, root, [cand], map, 'gde-mit')
    const [repoRow] = await db.select().from(repositories).where(eq(repositories.path, cand.path))
    if (!repoRow) throw new Error('repo not found')
    const mergedAt = new Date('2026-04-05T12:00:00Z')
    const updatedAt = new Date('2026-04-05T13:00:00Z')
    const prRows = []
    for (let i = 0; i < prCount; i++) {
      const [pr] = await db
        .insert(pullRequests)
        .values({
          repositoryId: repoRow.id,
          githubNodeId: `node-${randomUUID()}`,
          number: 100 + i,
          title: `PROJ-${i} t`,
          state: 'merged',
          openedAt: new Date('2026-04-01T08:00:00Z'),
          githubUpdatedAt: updatedAt,
          mergedAt,
          url: `https://example.com/pr/${i}`,
        })
        .returning({ id: pullRequests.id, number: pullRequests.number })
      prRows.push(pr)
    }
    return { repoRow, prRows }
  }

  async function setupSyncRun() {
    const [run] = await db
      .insert(syncRuns)
      .values({
        kind: `test_review_${crypto.randomUUID()}`,
        status: 'running',
        startedAt: new Date(),
      })
      .returning({ id: syncRuns.id })
    return run.id
  }

  beforeEach(async () => {
    // Each test owns fresh data via random repo paths / PR numbers; no global cleanup needed.
  })

  it('review_sync_runs_when_pr_sync_succeeded', async () => {
    const { repoRow, prRows } = await setupRepoWithPrs(1)
    const client = makeClient({
      listPullRequestReviews: vi.fn(async () => [
        {
          id: 1,
          state: 'APPROVED' as const,
          submittedAt: new Date('2026-04-04T10:00:00Z'),
          user: { login: 'alice', type: 'User' as const },
        },
      ]),
    })
    const runId = await setupSyncRun()
    const result = await syncRepositoryReviews(
      db,
      { client: client as never, now: new Date('2026-04-06T00:00:00Z'), syncRunId: runId },
      {
        id: repoRow.id,
        owner: repoRow.owner,
        repo: repoRow.repo,
        lastReviewSyncedAt: repoRow.lastReviewSyncedAt,
      },
    )
    expect(result.status).toBe('success')
    const reviews = await db
      .select()
      .from(pullRequestReviews)
      .where(eq(pullRequestReviews.pullRequestId, prRows[0].id))
    expect(reviews).toHaveLength(1)
  })

  it('per_repo_review_sync_error_isolated', async () => {
    const { repoRow } = await setupRepoWithPrs(1)
    const client = makeClient({
      listPullRequestReviews: vi.fn(async () => {
        throw new Error('boom')
      }),
    })
    const runId = await setupSyncRun()
    const result = await syncRepositoryReviews(
      db,
      { client: client as never, now: new Date('2026-04-06T00:00:00Z'), syncRunId: runId },
      {
        id: repoRow.id,
        owner: repoRow.owner,
        repo: repoRow.repo,
        lastReviewSyncedAt: repoRow.lastReviewSyncedAt,
      },
    )
    expect(result.status).toBe('partial')
    expect(result.perPrErrors).toHaveLength(1)
  })

  it('per_pr_review_sync_error_does_not_block_other_prs', async () => {
    const { repoRow, prRows } = await setupRepoWithPrs(2)
    let call = 0
    const client = makeClient({
      listPullRequestReviews: vi.fn(async () => {
        call += 1
        if (call === 1) throw new Error('boom')
        return [
          {
            id: 99,
            state: 'APPROVED' as const,
            submittedAt: new Date('2026-04-04T10:00:00Z'),
            user: { login: 'alice', type: 'User' as const },
          },
        ]
      }),
    })
    const runId = await setupSyncRun()
    const result = await syncRepositoryReviews(
      db,
      { client: client as never, now: new Date('2026-04-06T00:00:00Z'), syncRunId: runId },
      {
        id: repoRow.id,
        owner: repoRow.owner,
        repo: repoRow.repo,
        lastReviewSyncedAt: repoRow.lastReviewSyncedAt,
      },
    )
    expect(result.prsAttempted).toBe(2)
    expect(result.prsSucceeded).toBe(1)
    const secondPrReviews = await db
      .select()
      .from(pullRequestReviews)
      .where(eq(pullRequestReviews.pullRequestId, prRows[1].id))
    expect(secondPrReviews).toHaveLength(1)
    const errs = await db.select().from(syncErrors).where(eq(syncErrors.syncRunId, runId))
    expect(errs.length).toBeGreaterThanOrEqual(1)
    expect(errs[0]?.source).toBe('github_reviews')
  })

  it('last_review_synced_at_on_success_only', async () => {
    const { repoRow } = await setupRepoWithPrs(1)
    const client = makeClient()
    const runId = await setupSyncRun()
    const now = new Date('2026-04-06T00:00:00Z')
    await syncRepositoryReviews(
      db,
      { client: client as never, now, syncRunId: runId },
      {
        id: repoRow.id,
        owner: repoRow.owner,
        repo: repoRow.repo,
        lastReviewSyncedAt: repoRow.lastReviewSyncedAt,
      },
    )
    const [updated] = await db.select().from(repositories).where(eq(repositories.id, repoRow.id))
    expect(updated?.lastReviewSyncedAt?.getTime()).toBe(now.getTime())
  })

  it('last_review_synced_at_unchanged_on_failure', async () => {
    const { repoRow } = await setupRepoWithPrs(1)
    const client = makeClient({
      listPullRequestReviews: vi.fn(async () => {
        throw new Error('boom')
      }),
    })
    const runId = await setupSyncRun()
    await syncRepositoryReviews(
      db,
      { client: client as never, now: new Date('2026-04-06T00:00:00Z'), syncRunId: runId },
      {
        id: repoRow.id,
        owner: repoRow.owner,
        repo: repoRow.repo,
        lastReviewSyncedAt: repoRow.lastReviewSyncedAt,
      },
    )
    const [updated] = await db.select().from(repositories).where(eq(repositories.id, repoRow.id))
    expect(updated?.lastReviewSyncedAt).toBeNull()
  })

  it('incremental_gating_on_github_updated_at', async () => {
    const { repoRow } = await setupRepoWithPrs(1)
    const lastReview = new Date('2026-04-06T00:00:00Z')
    await db
      .update(repositories)
      .set({ lastReviewSyncedAt: lastReview })
      .where(eq(repositories.id, repoRow.id))
    const client = makeClient()
    const runId = await setupSyncRun()
    const result = await syncRepositoryReviews(
      db,
      { client: client as never, now: new Date(), syncRunId: runId },
      { id: repoRow.id, owner: repoRow.owner, repo: repoRow.repo, lastReviewSyncedAt: lastReview },
    )
    expect(result.prsAttempted).toBe(0)
    expect(client.listPullRequestReviews).not.toHaveBeenCalled()
  })

  it('review_sync_rate_limit_stops_starting_new_fetches', async () => {
    const { repoRow } = await setupRepoWithPrs(3)
    const client = makeClient({
      listPullRequestReviews: vi.fn(async () => {
        throw new GitHubSyncError({ code: 'rate_limited', message: 'rate' })
      }),
    })
    const runId = await setupSyncRun()
    const result = await syncRepositoryReviews(
      db,
      { client: client as never, now: new Date('2026-04-06T00:00:00Z'), syncRunId: runId },
      {
        id: repoRow.id,
        owner: repoRow.owner,
        repo: repoRow.repo,
        lastReviewSyncedAt: repoRow.lastReviewSyncedAt,
      },
    )
    expect(result.status).toBe('partial')
    expect(result.prsAttempted).toBe(1)
    const [updated] = await db.select().from(repositories).where(eq(repositories.id, repoRow.id))
    expect(updated?.lastReviewSyncedAt).toBeNull()
  })
})
