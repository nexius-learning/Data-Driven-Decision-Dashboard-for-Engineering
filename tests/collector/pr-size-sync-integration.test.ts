import path from 'node:path'
import { randomUUID } from 'node:crypto'

import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import type { GitHubClient } from '~/collector/github-client'
import {
  __setDetectMergeStrategyForTests,
  __setFetchRepoForTests,
  __setFindCommitForPrForTests,
  __setGitExecForTests,
  GitOpError,
  isPrSizeSyncPartial,
  syncRepositoryPrSizes,
  type GitExecFn,
} from '~/collector/pr-size-sync'
import type { RepositoryCandidate } from '~/collector/repo-discovery'
import { upsertRepositories } from '~/collector/repository-store'
import type { TeamMappingConfig } from '~/config/team-mapping'
import { createDb, runMigrations } from '~/db/client'
import { pullRequests, repositories, syncErrors, syncRuns } from '~/db/schema'

const databaseUrl = process.env.DATABASE_URL?.trim()

function createGitMock(
  handler: (gitArgs: readonly string[]) => string | Promise<string>,
): GitExecFn {
  return async (_repoPath, gitArgs) => {
    const result = handler(gitArgs)
    return result instanceof Promise ? result : result
  }
}

function makeGithubClient(overrides: Partial<GitHubClient> = {}): GitHubClient {
  return {
    getPullRequestDetail: vi.fn(async () => ({
      additions: 50,
      deletions: 25,
      changedFiles: 4,
    })),
    ...overrides,
  } as GitHubClient
}

describe('syncRepositoryPrSizes integration', () => {
  let db: ReturnType<typeof createDb>

  beforeAll(async () => {
    await runMigrations(databaseUrl)
    db = createDb(databaseUrl)
  })

  afterAll(async () => {
    await db.$client.end({ timeout: 5 })
  })

  afterEach(() => {
    __setGitExecForTests(null)
    __setFetchRepoForTests(null)
    __setDetectMergeStrategyForTests(null)
    __setFindCommitForPrForTests(null)
    vi.restoreAllMocks()
  })

  async function setupRepo() {
    const root = path.join('/tmp', `pr-size-sync-${randomUUID()}`)
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
    return { repoRow, repoPath: cand.path }
  }

  async function setupSyncRun() {
    const [run] = await db
      .insert(syncRuns)
      .values({
        kind: 'collector_refresh',
        status: 'running',
        startedAt: new Date(),
      })
      .returning({ id: syncRuns.id })
    return run.id
  }

  async function insertPr(
    repositoryId: string,
    values: {
      number: number
      mergedAt: Date | null
      mergeCommitSha?: string | null
      additions?: number | null
    },
  ) {
    const [pr] = await db
      .insert(pullRequests)
      .values({
        repositoryId,
        githubNodeId: `node-${randomUUID()}`,
        number: values.number,
        title: `PROJ-${values.number}`,
        state: values.mergedAt === null ? 'open' : 'merged',
        openedAt: new Date('2026-04-01T08:00:00Z'),
        githubUpdatedAt: new Date('2026-04-05T13:00:00Z'),
        mergedAt: values.mergedAt,
        mergeCommitSha: values.mergeCommitSha ?? null,
        additions: values.additions ?? null,
        url: `https://example.com/pr/${values.number}`,
      })
      .returning({
        id: pullRequests.id,
        number: pullRequests.number,
      })
    return pr
  }

  it('sync_sizes_computes_merge_commit_pr', async () => {
    const { repoRow, repoPath } = await setupRepo()
    const sha = 'merge-sha-111'
    const pr = await insertPr(repoRow.id, {
      number: 101,
      mergedAt: new Date('2026-04-05T12:00:00Z'),
      mergeCommitSha: sha,
    })
    const runId = await setupSyncRun()

    __setGitExecForTests(
      createGitMock((gitArgs) => {
        if (gitArgs[0] === 'fetch') return ''
        if (gitArgs[0] === 'rev-list') return `${sha} parent1 parent2\n`
        if (gitArgs[0] === 'diff') return '3 files changed, 10 insertions(+), 5 deletions(-)\n'
        throw new Error(`unexpected: ${gitArgs.join(' ')}`)
      }),
    )

    const counts = await syncRepositoryPrSizes({
      db,
      repoPath,
      repositoryId: repoRow.id,
      owner: repoRow.owner!,
      repo: repoRow.repo!,
      syncRunId: runId,
      githubClient: makeGithubClient(),
    })

    expect(counts).toEqual({ ok: 1, skipped: 0, failed: 0 })
    const [row] = await db
      .select({
        additions: pullRequests.additions,
        deletions: pullRequests.deletions,
        changedFiles: pullRequests.changedFiles,
      })
      .from(pullRequests)
      .where(eq(pullRequests.id, pr.id))
    expect(row).toEqual({ additions: 10, deletions: 5, changedFiles: 3 })
  })

  it('sync_sizes_falls_back_to_api_for_rebase_pr', async () => {
    const { repoRow, repoPath } = await setupRepo()
    const pr = await insertPr(repoRow.id, {
      number: 202,
      mergedAt: new Date('2026-04-05T12:00:00Z'),
      mergeCommitSha: 'abc123',
    })
    const runId = await setupSyncRun()
    const getPullRequestDetail = vi.fn(async () => ({
      additions: 99,
      deletions: 11,
      changedFiles: 7,
    }))
    __setDetectMergeStrategyForTests(async () => 'rebase')
    __setGitExecForTests(createGitMock((gitArgs) => (gitArgs[0] === 'fetch' ? '' : '')))

    const counts = await syncRepositoryPrSizes({
      db,
      repoPath,
      repositoryId: repoRow.id,
      owner: repoRow.owner!,
      repo: repoRow.repo!,
      syncRunId: runId,
      githubClient: makeGithubClient({ getPullRequestDetail }),
    })

    expect(counts.ok).toBe(1)
    expect(getPullRequestDetail).toHaveBeenCalledWith({
      owner: repoRow.owner,
      repo: repoRow.repo,
      pullNumber: pr.number,
    })
    const [row] = await db
      .select({
        additions: pullRequests.additions,
        deletions: pullRequests.deletions,
        changedFiles: pullRequests.changedFiles,
      })
      .from(pullRequests)
      .where(eq(pullRequests.id, pr.id))
    expect(row).toEqual({ additions: 99, deletions: 11, changedFiles: 7 })
  })

  it('sync_sizes_falls_back_to_api_when_stored_merge_sha_is_missing_locally', async () => {
    const { repoRow, repoPath } = await setupRepo()
    const pr = await insertPr(repoRow.id, {
      number: 211,
      mergedAt: new Date('2026-04-05T12:00:00Z'),
      mergeCommitSha: 'missing-sha',
    })
    const runId = await setupSyncRun()
    const getPullRequestDetail = vi.fn(async () => ({
      additions: 12,
      deletions: 3,
      changedFiles: 2,
    }))

    __setGitExecForTests(
      createGitMock((gitArgs) => {
        if (gitArgs[0] === 'fetch') return ''
        if (gitArgs[0] === 'rev-list') {
          throw new GitOpError('git rev-list failed: fatal: bad object missing-sha')
        }
        throw new Error(`unexpected: ${gitArgs.join(' ')}`)
      }),
    )

    const counts = await syncRepositoryPrSizes({
      db,
      repoPath,
      repositoryId: repoRow.id,
      owner: repoRow.owner!,
      repo: repoRow.repo!,
      syncRunId: runId,
      githubClient: makeGithubClient({ getPullRequestDetail }),
    })

    expect(counts).toEqual({ ok: 1, skipped: 0, failed: 0 })
    expect(getPullRequestDetail).toHaveBeenCalledWith({
      owner: repoRow.owner,
      repo: repoRow.repo,
      pullNumber: pr.number,
    })
    const [row] = await db
      .select({
        additions: pullRequests.additions,
        deletions: pullRequests.deletions,
        changedFiles: pullRequests.changedFiles,
      })
      .from(pullRequests)
      .where(eq(pullRequests.id, pr.id))
    expect(row).toEqual({ additions: 12, deletions: 3, changedFiles: 2 })
    const errs = await db.select().from(syncErrors).where(eq(syncErrors.syncRunId, runId))
    expect(errs).toHaveLength(0)
  })

  it('sync_sizes_backfills_pr_without_merge_commit_sha', async () => {
    const { repoRow, repoPath } = await setupRepo()
    const mergedAt = new Date('2026-04-05T12:00:00Z')
    const pr = await insertPr(repoRow.id, {
      number: 303,
      mergedAt,
      mergeCommitSha: null,
    })
    const foundSha = 'backfill-sha-303'
    const runId = await setupSyncRun()

    __setFindCommitForPrForTests(async () => foundSha)
    __setGitExecForTests(
      createGitMock((gitArgs) => {
        if (gitArgs[0] === 'fetch') return ''
        if (gitArgs[0] === 'rev-list') return `${foundSha} parent1\n`
        if (gitArgs[0] === 'log') return 'feat: ship (#303)\n'
        if (gitArgs[0] === 'diff') return '2 files changed, 20 insertions(+), 4 deletions(-)\n'
        throw new Error(`unexpected: ${gitArgs.join(' ')}`)
      }),
    )

    const counts = await syncRepositoryPrSizes({
      db,
      repoPath,
      repositoryId: repoRow.id,
      owner: repoRow.owner!,
      repo: repoRow.repo!,
      syncRunId: runId,
      githubClient: makeGithubClient(),
    })

    expect(counts.ok).toBe(1)
    const [row] = await db
      .select({
        additions: pullRequests.additions,
        deletions: pullRequests.deletions,
        changedFiles: pullRequests.changedFiles,
        mergeCommitSha: pullRequests.mergeCommitSha,
      })
      .from(pullRequests)
      .where(eq(pullRequests.id, pr.id))
    expect(row?.additions).toBe(20)
    expect(row?.mergeCommitSha).toBe(foundSha)
  })

  it('sync_sizes_skips_open_prs', async () => {
    const { repoRow, repoPath } = await setupRepo()
    await insertPr(repoRow.id, { number: 401, mergedAt: null })
    const mergedPr = await insertPr(repoRow.id, {
      number: 402,
      mergedAt: new Date('2026-04-05T12:00:00Z'),
      mergeCommitSha: 'open-test-sha',
    })
    const runId = await setupSyncRun()

    __setGitExecForTests(
      createGitMock((gitArgs) => {
        if (gitArgs[0] === 'fetch') return ''
        if (gitArgs[0] === 'rev-list') return 'open-test-sha parent1 parent2\n'
        if (gitArgs[0] === 'diff') return '1 file changed, 1 insertion(+)\n'
        throw new Error(`unexpected: ${gitArgs.join(' ')}`)
      }),
    )

    const counts = await syncRepositoryPrSizes({
      db,
      repoPath,
      repositoryId: repoRow.id,
      owner: repoRow.owner!,
      repo: repoRow.repo!,
      syncRunId: runId,
      githubClient: makeGithubClient(),
    })

    expect(counts.ok).toBe(1)
    const [openPr] = await db
      .select({ additions: pullRequests.additions })
      .from(pullRequests)
      .where(and(eq(pullRequests.repositoryId, repoRow.id), eq(pullRequests.number, 401)))
    expect(openPr?.additions).toBeNull()
    const [mergedRow] = await db
      .select({ additions: pullRequests.additions })
      .from(pullRequests)
      .where(eq(pullRequests.id, mergedPr.id))
    expect(mergedRow?.additions).toBe(1)
  })

  it('sync_sizes_logs_git_diff_failed_on_error', async () => {
    const { repoRow, repoPath } = await setupRepo()
    await insertPr(repoRow.id, {
      number: 501,
      mergedAt: new Date('2026-04-05T12:00:00Z'),
      mergeCommitSha: 'bad-sha',
    })
    const runId = await setupSyncRun()

    __setGitExecForTests(
      createGitMock((gitArgs) => {
        if (gitArgs[0] === 'fetch') return ''
        if (gitArgs[0] === 'rev-list') return 'bad-sha parent1 parent2\n'
        if (gitArgs[0] === 'diff') {
          throw new GitOpError('git diff failed: simulated')
        }
        throw new Error(`unexpected: ${gitArgs.join(' ')}`)
      }),
    )

    const counts = await syncRepositoryPrSizes({
      db,
      repoPath,
      repositoryId: repoRow.id,
      owner: repoRow.owner!,
      repo: repoRow.repo!,
      syncRunId: runId,
      githubClient: makeGithubClient(),
    })

    expect(counts.failed).toBe(1)
    const errs = await db.select().from(syncErrors).where(eq(syncErrors.syncRunId, runId))
    expect(errs.some((e) => e.source === 'git-diff-failed')).toBe(true)
  })

  it('sync_sizes_logs_failed_when_sha_not_found_after_fetch', async () => {
    const { repoRow, repoPath } = await setupRepo()
    await insertPr(repoRow.id, {
      number: 601,
      mergedAt: new Date('2026-04-05T12:00:00Z'),
      mergeCommitSha: 'deadbeef',
    })
    const runId = await setupSyncRun()

    __setFetchRepoForTests(async () => ({ ok: true }))
    __setGitExecForTests(
      createGitMock((gitArgs) => {
        if (gitArgs[0] === 'rev-list') return 'deadbeef parent1 parent2\n'
        if (gitArgs[0] === 'diff') {
          throw new GitOpError(
            'git diff failed: fatal: bad revision deadbeef^1 - unknown revision',
          )
        }
        throw new Error(`unexpected: ${gitArgs.join(' ')}`)
      }),
    )

    const counts = await syncRepositoryPrSizes({
      db,
      repoPath,
      repositoryId: repoRow.id,
      owner: repoRow.owner!,
      repo: repoRow.repo!,
      syncRunId: runId,
      githubClient: makeGithubClient(),
    })

    expect(counts.failed).toBe(1)
    const errs = await db.select().from(syncErrors).where(eq(syncErrors.syncRunId, runId))
    expect(errs.some((e) => e.source === 'git-diff-failed')).toBe(true)
  })

  it('sync_sizes_logs_error_when_backfill_sha_fails_strategy_detection', async () => {
    const { repoRow, repoPath } = await setupRepo()
    const mergedAt = new Date('2026-04-05T12:00:00Z')
    await insertPr(repoRow.id, {
      number: 701,
      mergedAt,
      mergeCommitSha: null,
    })
    const goodPr = await insertPr(repoRow.id, {
      number: 702,
      mergedAt,
      mergeCommitSha: 'good-sha-702',
    })
    const runId = await setupSyncRun()

    __setFindCommitForPrForTests(async () => 'sha-abc')
    let detectCalls = 0
    __setDetectMergeStrategyForTests(async (sha) => {
      detectCalls += 1
      if (detectCalls === 1) {
        throw new GitOpError('strategy detection failed')
      }
      if (sha === 'good-sha-702') return 'merge'
      return 'squash'
    })

    __setGitExecForTests(
      createGitMock((gitArgs) => {
        if (gitArgs[0] === 'fetch') return ''
        if (gitArgs[0] === 'rev-list' && gitArgs.includes('good-sha-702')) {
          return 'good-sha-702 parent1 parent2\n'
        }
        if (gitArgs[0] === 'diff') return '1 file changed, 5 insertions(+)\n'
        throw new Error(`unexpected: ${gitArgs.join(' ')}`)
      }),
    )

    const counts = await syncRepositoryPrSizes({
      db,
      repoPath,
      repositoryId: repoRow.id,
      owner: repoRow.owner!,
      repo: repoRow.repo!,
      syncRunId: runId,
      githubClient: makeGithubClient(),
    })

    expect(counts.failed).toBe(1)
    expect(counts.ok).toBe(1)
    const errs = await db.select().from(syncErrors).where(eq(syncErrors.syncRunId, runId))
    expect(errs.some((e) => e.source === 'git-diff-failed')).toBe(true)
    const [goodRow] = await db
      .select({ additions: pullRequests.additions })
      .from(pullRequests)
      .where(eq(pullRequests.id, goodPr.id))
    expect(goodRow?.additions).toBe(5)
  })

  it('sync_sizes_reports_partial_when_10pct_fail', async () => {
    const { repoRow, repoPath } = await setupRepo()
    const mergedAt = new Date('2026-04-05T12:00:00Z')
    for (let i = 0; i < 9; i++) {
      await insertPr(repoRow.id, {
        number: 800 + i,
        mergedAt,
        mergeCommitSha: `ok-sha-${i}`,
      })
    }
    await insertPr(repoRow.id, {
      number: 810,
      mergedAt,
      mergeCommitSha: 'fail-sha',
    })
    const runId = await setupSyncRun()

    __setGitExecForTests(
      createGitMock((gitArgs) => {
        if (gitArgs[0] === 'fetch') return ''
        if (gitArgs[0] === 'rev-list') {
          const sha = gitArgs[gitArgs.length - 1] ?? ''
          if (sha === 'fail-sha') return 'fail-sha parent1 parent2\n'
          return `${sha} parent1 parent2\n`
        }
        if (gitArgs[0] === 'diff') {
          const sha = gitArgs[1]?.replace(/\^1$/, '') ?? ''
          if (sha === 'fail-sha') {
            throw new GitOpError('git diff failed')
          }
          return '1 file changed, 1 insertion(+)\n'
        }
        throw new Error(`unexpected: ${gitArgs.join(' ')}`)
      }),
    )

    const counts = await syncRepositoryPrSizes({
      db,
      repoPath,
      repositoryId: repoRow.id,
      owner: repoRow.owner!,
      repo: repoRow.repo!,
      syncRunId: runId,
      githubClient: makeGithubClient(),
    })

    expect(counts).toEqual({ ok: 9, skipped: 0, failed: 1 })
    expect(isPrSizeSyncPartial(counts)).toBe(true)
  })

  it('sync_sizes_skips_repo_on_fetch_failure', async () => {
    const { repoRow, repoPath } = await setupRepo()
    const mergedAt = new Date('2026-04-05T12:00:00Z')
    await insertPr(repoRow.id, { number: 901, mergedAt, mergeCommitSha: 'sha-901' })
    await insertPr(repoRow.id, { number: 902, mergedAt, mergeCommitSha: 'sha-902' })
    const runId = await setupSyncRun()

    __setGitExecForTests(
      createGitMock((gitArgs) => {
        if (gitArgs[0] === 'fetch') {
          throw new GitOpError('git fetch failed: network down')
        }
        throw new Error(`unexpected: ${gitArgs.join(' ')}`)
      }),
    )

    const counts = await syncRepositoryPrSizes({
      db,
      repoPath,
      repositoryId: repoRow.id,
      owner: repoRow.owner!,
      repo: repoRow.repo!,
      syncRunId: runId,
      githubClient: makeGithubClient(),
    })

    expect(counts).toEqual({ ok: 0, skipped: 2, failed: 0 })
    const errs = await db.select().from(syncErrors).where(eq(syncErrors.syncRunId, runId))
    expect(errs.some((e) => e.source === 'git-fetch-failed')).toBe(true)
    const rows = await db
      .select({ additions: pullRequests.additions })
      .from(pullRequests)
      .where(eq(pullRequests.repositoryId, repoRow.id))
    expect(rows.every((r) => r.additions === null)).toBe(true)
  })
})
