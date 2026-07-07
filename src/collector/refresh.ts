import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { and, eq, max, sql } from 'drizzle-orm'

import { GitHubClient } from '~/collector/github-client'
import { discoverRepositories } from '~/collector/repo-discovery'
import { clearCloneTmpDir, cloneOrUpdateRepository } from '~/collector/repo-clone'
import { upsertPullRequests } from '~/collector/pull-request-store'
import { upsertRepositories } from '~/collector/repository-store'
import { isPrSizeSyncPartial, syncRepositoryPrSizes } from '~/collector/pr-size-sync'
import { syncRepositoryReviews } from '~/collector/review-sync'
import type { AppEnv } from '~/config/env'
import { getEnv } from '~/config/env'
import { loadTeamMapping, shouldSyncRepo } from '~/config/team-mapping'
import type { AppDb } from '~/db/client'
import { createDb } from '~/db/client'
import { pullRequests, repositories, syncErrors, syncRuns } from '~/db/schema'

/** Thrown when a second refresh is attempted while one is already running. */
export class AlreadyRunningError extends Error {
  override name = 'AlreadyRunningError'
  readonly startedAt: Date
  readonly elapsedSeconds: number

  constructor(startedAt: Date) {
    const elapsedSeconds = Math.floor((Date.now() - startedAt.getTime()) / 1000)
    super(`A refresh is already running (started ${elapsedSeconds}s ago, status: running). Aborting.`)
    this.startedAt = startedAt
    this.elapsedSeconds = elapsedSeconds
  }
}

export type ProgressEvent =
  | { type: 'phase_start'; phase: string; total: number }
  | {
      type: 'repo_done'
      phase: string
      repo: string
      done: number
      total: number
      inFlightRepos: string[]
      errorCount: number
    }

/** Returns true if the error represents a PostgreSQL unique-constraint violation (code 23505). */
function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const cause = (err as { cause?: unknown }).cause
  if (typeof cause === 'object' && cause !== null && 'code' in cause) {
    return String((cause as { code: unknown }).code) === '23505'
  }
  return 'code' in err && String((err as { code: unknown }).code) === '23505'
}

const HEARTBEAT_INTERVAL_MS = 10_000
const ZOMBIE_TTL_SECONDS = 120

export type RefreshSummary = {
  reposScanned: number
  reposIncluded: number
  reposExcluded: number
  prsSeen: number
  prsMerged: number
  prsMissingJiraKey: number
  syncErrors: number
  syncWarnings: number
  status: 'success' | 'partial' | 'failed'
  reviewSyncErrors: number
  sizeSyncErrors: number
  phaseTimingsMs: Record<string, number>
}

/** Merges optional AppEnv overrides into the current process.env, returning a new env object. */
function buildProcessEnvFromPartial(partial?: Partial<AppEnv>): NodeJS.ProcessEnv {
  const e: NodeJS.ProcessEnv = { ...process.env }
  if (!partial) {
    return e
  }
  if (partial.repoRoot !== undefined) e.DASHBOARD_REPO_ROOT = partial.repoRoot
  if (partial.databaseUrl !== undefined) e.DATABASE_URL = partial.databaseUrl
  if (partial.teamMappingPath !== undefined) e.TEAM_MAPPING_PATH = partial.teamMappingPath
  if (partial.githubToken !== undefined) {
    e.GITHUB_TOKEN = partial.githubToken
  }
  if (partial.githubApiBaseUrl !== undefined) e.GITHUB_API_BASE_URL = partial.githubApiBaseUrl
  if (partial.defaultRangeWeeks !== undefined) {
    e.DASHBOARD_DEFAULT_RANGE_WEEKS = String(partial.defaultRangeWeeks)
  }
  if (partial.initialSyncFrom !== undefined) {
    e.DASHBOARD_INITIAL_SYNC_FROM = partial.initialSyncFrom.toISOString()
  }
  if (partial.githubSyncConcurrency !== undefined) {
    e.GITHUB_SYNC_CONCURRENCY = String(partial.githubSyncConcurrency)
  }
  if (partial.githubSyncOwner !== undefined) e.GITHUB_SYNC_OWNER = partial.githubSyncOwner
  return e
}

/** Processes items with at most `limit` workers running concurrently. */
async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  if (items.length === 0) return
  const n = Math.max(1, Math.min(limit, items.length))
  let next = 0
  async function runWorker(): Promise<void> {
    for (;;) {
      const i = next
      next += 1
      if (i >= items.length) return
      await worker(items[i]!)
    }
  }
  await Promise.all(Array.from({ length: n }, () => runWorker()))
}

/** Counts the sync_errors rows recorded for a given run. */
async function countSyncErrors(db: AppDb, syncRunId: string): Promise<number> {
  const rows = await db.select({ id: syncErrors.id }).from(syncErrors).where(eq(syncErrors.syncRunId, syncRunId))
  return rows.length
}

/** Marks a sync run finished with the given status, message, and final error count. */
async function finalizeSyncRun(
  db: AppDb,
  syncRunId: string,
  phaseTimings: Record<string, number>,
  status: 'success' | 'partial' | 'failed',
  message: string | null,
  errorCount: number,
): Promise<void> {
  await db
    .update(syncRuns)
    .set({ finishedAt: new Date(), errorCount, status, message, phaseTimings })
    .where(eq(syncRuns.id, syncRunId))
}

/**
 * Scans local repositories, upserts metadata, syncs GitHub PRs for `ready`
 * repositories, and records sync run / error rows.
 */
export async function refreshLocalData(
  input?: Partial<AppEnv>,
  opts?: { mode?: 'full' | 'clone-only'; heartbeatIntervalMs?: number; onProgress?: (event: ProgressEvent) => void },
): Promise<RefreshSummary> {
  const mergedEnv = buildProcessEnvFromPartial(input)
  const env = getEnv(mergedEnv)
  const db = createDb(env.databaseUrl)
  const mode = opts?.mode ?? 'full'
  const dbMode = mode === 'clone-only' ? 'clone_only' : 'full'

  if (mergedEnv.DASHBOARD_E2E_REFRESH_STUB?.trim() === '1') {
    try {
      const startedAt = new Date()
      const newRunId = randomUUID()
      await db.insert(syncRuns).values({
        id: newRunId,
        kind: 'collector_refresh',
        status: 'success',
        mode: dbMode,
        startedAt,
        finishedAt: new Date(),
        message: 'e2e_stub',
        errorCount: 0,
      })
      return {
        reposScanned: 0,
        reposIncluded: 0,
        reposExcluded: 0,
        prsSeen: 0,
        prsMerged: 0,
        prsMissingJiraKey: 0,
        syncErrors: 0,
        syncWarnings: 0,
        status: 'success',
        reviewSyncErrors: 0,
        sizeSyncErrors: 0,
        phaseTimingsMs: {},
      }
    } finally {
      await db.$client.end({ timeout: 5 })
    }
  }

  const summary: RefreshSummary = {
    reposScanned: 0,
    reposIncluded: 0,
    reposExcluded: 0,
    prsSeen: 0,
    prsMerged: 0,
    prsMissingJiraKey: 0,
    syncErrors: 0,
    syncWarnings: 0,
    status: 'failed',
    reviewSyncErrors: 0,
    sizeSyncErrors: 0,
    phaseTimingsMs: {},
  }

  let syncRunId: string | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let localErrorCount = 0
  const phaseTimings: Record<string, number> = {}
  const inFlight = new Set<string>()

  const insertError = async (repositoryId: string | null, source: string, message: string) => {
    if (syncRunId === null) return
    await db.insert(syncErrors).values({
      syncRunId,
      repositoryId,
      source,
      message,
    })
    localErrorCount++
  }

  try {
    // Expire any zombie running rows (heartbeat stale or missing + old startedAt)
    const zombieTtlSql = sql.raw(`interval '${ZOMBIE_TTL_SECONDS} seconds'`)
    await db
      .update(syncRuns)
      .set({ status: 'failed', finishedAt: new Date(), message: 'zombie_expired' })
      .where(
        and(
          eq(syncRuns.kind, 'collector_refresh'),
          eq(syncRuns.status, 'running'),
          sql`(${syncRuns.heartbeat} < now() - ${zombieTtlSql} OR (${syncRuns.heartbeat} IS NULL AND ${syncRuns.startedAt} < now() - ${zombieTtlSql}))`,
        ),
      )

    // Claim the single-flight slot — unique partial index rejects a second running row
    const startedAt = new Date()
    const newRunId = randomUUID()
    try {
      await db.insert(syncRuns).values({
        id: newRunId,
        kind: 'collector_refresh',
        status: 'running',
        mode: dbMode,
        startedAt,
        finishedAt: null,
        message: null,
        errorCount: 0,
      })
    } catch (claimErr) {
      if (isUniqueViolation(claimErr)) {
        const [existing] = await db
          .select({ startedAt: syncRuns.startedAt })
          .from(syncRuns)
          .where(and(eq(syncRuns.kind, 'collector_refresh'), eq(syncRuns.status, 'running')))
        throw new AlreadyRunningError(existing?.startedAt ?? startedAt)
      }
      throw claimErr
    }
    syncRunId = newRunId

    // Keep heartbeat alive so we are not mistaken for a zombie
    const intervalMs = opts?.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS
    heartbeatTimer = setInterval(() => {
      db.update(syncRuns).set({ heartbeat: new Date() }).where(eq(syncRuns.id, syncRunId!)).catch(() => {})
    }, intervalMs)

    const mapping = await loadTeamMapping(env.teamMappingPath)
    const repoRoot = path.resolve(env.repoRoot)

    const client = new GitHubClient({
      token: env.githubToken,
      baseUrl: env.githubApiBaseUrl,
    })

    // Phase: cloning_repositories — runs directly under the pipeline's
    // existing single-flight guard (the sync_runs claim above); no
    // additional file-based lock layered on top. Shared kind
    // ('collector_refresh') across every mode is what makes that guard a
    // true cross-mode mutex — see Documentation/ADR/0001-refresh-progress-and-single-flight.md.
    // Clear any staging/stale directories a prior crashed run orphaned
    // under .clone-tmp before cloning anything — single-flight guarantees
    // we're the only run touching it right now.
    await clearCloneTmpDir(repoRoot)
    const cloneStart = Date.now()
    let phaseDone = 0
    const orgRepos = await client.listOrgRepositories(env.githubSyncOwner)
    const cloneTargets = orgRepos.filter((r) => !r.archived && shouldSyncRepo(r.name, mapping))
    const cloneTargetCount = cloneTargets.length

    await db
      .update(syncRuns)
      .set({ currentPhase: 'cloning_repositories', phaseTotal: cloneTargets.length, phaseDone: 0, inFlightRepos: [] })
      .where(eq(syncRuns.id, syncRunId))
    opts?.onProgress?.({ type: 'phase_start', phase: 'cloning_repositories', total: cloneTargets.length })

    await runWithConcurrency(cloneTargets, env.githubSyncConcurrency, async (repo) => {
      inFlight.add(repo.name)
      try {
        await cloneOrUpdateRepository(repoRoot, env.githubSyncOwner, repo.name)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await insertError(null, 'repo_clone', msg)
      } finally {
        phaseDone += 1
        inFlight.delete(repo.name)
        const snapshot = [...inFlight]
        await db
          .update(syncRuns)
          .set({ phaseDone, inFlightRepos: snapshot, errorCount: localErrorCount })
          .where(eq(syncRuns.id, syncRunId!))
        opts?.onProgress?.({
          type: 'repo_done',
          phase: 'cloning_repositories',
          repo: repo.name,
          done: phaseDone,
          total: cloneTargets.length,
          inFlightRepos: snapshot,
          errorCount: localErrorCount,
        })
      }
    })
    phaseTimings['cloning_repositories'] = Date.now() - cloneStart

    if (mode === 'clone-only') {
      const cloneOnlyErrorCount = await countSyncErrors(db, syncRunId)
      const cloneSuccessCount = cloneTargetCount - cloneOnlyErrorCount
      let cloneOnlyStatus: 'success' | 'partial' | 'failed' = 'success'
      if (cloneTargetCount > 0 && cloneSuccessCount === 0 && cloneOnlyErrorCount > 0) {
        cloneOnlyStatus = 'failed'
      } else if (cloneOnlyErrorCount > 0) {
        cloneOnlyStatus = 'partial'
      }

      await finalizeSyncRun(db, syncRunId, phaseTimings, cloneOnlyStatus, null, cloneOnlyErrorCount)
      summary.syncErrors = cloneOnlyErrorCount
      summary.status = cloneOnlyStatus
      summary.phaseTimingsMs = phaseTimings
      return summary
    }

    // Phase: scanning_repositories
    const scanStart = Date.now()
    const candidates = await discoverRepositories(repoRoot)
    await db
      .update(syncRuns)
      .set({ currentPhase: 'scanning_repositories', phaseTotal: candidates.length, phaseDone: 0, inFlightRepos: [] })
      .where(eq(syncRuns.id, syncRunId))
    opts?.onProgress?.({ type: 'phase_start', phase: 'scanning_repositories', total: candidates.length })

    const repoSync = await upsertRepositories(db, repoRoot, candidates, mapping, env.githubSyncOwner)
    phaseTimings['scanning_repositories'] = Date.now() - scanStart

    summary.reposScanned = repoSync.scanned
    summary.reposIncluded = repoSync.ready
    summary.reposExcluded = repoSync.excluded + repoSync.metadataIncomplete + repoSync.missing
    summary.syncWarnings = repoSync.remoteIdentityChanges

    const readyRows = await db
      .select()
      .from(repositories)
      .where(
        and(
          eq(repositories.scanStatus, 'ready'),
          eq(repositories.active, true),
          eq(repositories.rootPath, repoRoot),
        ),
      )

    const syncTargets = readyRows.filter((r) => r.owner && r.repo)

    let prSyncSuccesses = 0
    let prSyncAttempts = 0
    let sizeSyncPartial = false
    const reviewEligibleRepoIds = new Set<string>()

    // Phase: pr_sync
    phaseDone = 0
    const prSyncStart = Date.now()
    await db
      .update(syncRuns)
      .set({ currentPhase: 'pr_sync', phaseTotal: syncTargets.length, phaseDone: 0, inFlightRepos: [] })
      .where(eq(syncRuns.id, syncRunId))
    opts?.onProgress?.({ type: 'phase_start', phase: 'pr_sync', total: syncTargets.length })

    await runWithConcurrency(syncTargets, env.githubSyncConcurrency, async (repo) => {
      prSyncAttempts += 1
      inFlight.add(repo.name)
      try {
        const last = repo.lastPrSyncedAt
        const prs = await client.listPullRequests({
          owner: repo.owner!,
          repo: repo.repo!,
          state: 'all',
          ...(last === null ? { initialSyncFrom: env.initialSyncFrom } : { stopAfterUpdatedAt: last }),
        })

        const prSummary = await upsertPullRequests(db, repo.id, prs)
        summary.prsSeen += prSummary.seen
        summary.prsMerged += prSummary.merged
        summary.prsMissingJiraKey += prSummary.missingJiraKey

        for (const num of prSummary.invalidLifecyclePullNumbers) {
          await insertError(
            repo.id,
            'invalid_pr_lifecycle',
            `Pull request #${num} has mergedAt before openedAt`,
          )
        }

        const [maxRow] = await db
          .select({ m: max(pullRequests.githubUpdatedAt) })
          .from(pullRequests)
          .where(eq(pullRequests.repositoryId, repo.id))

        const maxUpdated = maxRow?.m ?? null
        if (maxUpdated !== null) {
          const maxUpdatedIso = maxUpdated.toISOString()
          await db.execute(
            sql`UPDATE repositories
                SET last_pr_synced_at = GREATEST(COALESCE(last_pr_synced_at, ${maxUpdatedIso}::timestamptz), ${maxUpdatedIso}::timestamptz),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ${repo.id}`,
          )
        }

        prSyncSuccesses += 1
        reviewEligibleRepoIds.add(repo.id)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await insertError(repo.id, 'github_sync', msg)
      } finally {
        phaseDone += 1
        inFlight.delete(repo.name)
        const snapshot = [...inFlight]
        await db
          .update(syncRuns)
          .set({ phaseDone, inFlightRepos: snapshot, errorCount: localErrorCount })
          .where(eq(syncRuns.id, syncRunId!))
        opts?.onProgress?.({
          type: 'repo_done',
          phase: 'pr_sync',
          repo: repo.name,
          done: phaseDone,
          total: syncTargets.length,
          inFlightRepos: snapshot,
          errorCount: localErrorCount,
        })
      }
    })
    phaseTimings['pr_sync'] = Date.now() - prSyncStart

    const reviewTargets = syncTargets.filter((r) => reviewEligibleRepoIds.has(r.id))

    // Phase: review_sync
    phaseDone = 0
    inFlight.clear()
    const reviewSyncStart = Date.now()
    await db
      .update(syncRuns)
      .set({ currentPhase: 'review_sync', phaseTotal: reviewTargets.length, phaseDone: 0, inFlightRepos: [] })
      .where(eq(syncRuns.id, syncRunId))
    opts?.onProgress?.({ type: 'phase_start', phase: 'review_sync', total: reviewTargets.length })

    if (reviewTargets.length > 0) {
      const reviewNow = new Date()
      await runWithConcurrency(reviewTargets, env.githubSyncConcurrency, async (repo) => {
        inFlight.add(repo.name)
        try {
          const result = await syncRepositoryReviews(
            db,
            { client, now: reviewNow, syncRunId: syncRunId! },
            {
              id: repo.id,
              owner: repo.owner,
              repo: repo.repo,
              lastReviewSyncedAt: repo.lastReviewSyncedAt,
            },
          )
          summary.reviewSyncErrors += result.perPrErrors.length
        } finally {
          phaseDone += 1
          inFlight.delete(repo.name)
          const snapshot = [...inFlight]
          await db
            .update(syncRuns)
            .set({ phaseDone, inFlightRepos: snapshot, errorCount: localErrorCount })
            .where(eq(syncRuns.id, syncRunId!))
          opts?.onProgress?.({
            type: 'repo_done',
            phase: 'review_sync',
            repo: repo.name,
            done: phaseDone,
            total: reviewTargets.length,
            inFlightRepos: snapshot,
            errorCount: localErrorCount,
          })
        }
      })
    }
    phaseTimings['review_sync'] = Date.now() - reviewSyncStart

    const sizeTargets = syncTargets.filter((r) => reviewEligibleRepoIds.has(r.id))

    // Phase: pr_size_sync
    phaseDone = 0
    inFlight.clear()
    const sizeSyncStart = Date.now()
    await db
      .update(syncRuns)
      .set({ currentPhase: 'pr_size_sync', phaseTotal: sizeTargets.length, phaseDone: 0, inFlightRepos: [] })
      .where(eq(syncRuns.id, syncRunId))
    opts?.onProgress?.({ type: 'phase_start', phase: 'pr_size_sync', total: sizeTargets.length })

    if (sizeTargets.length > 0) {
      await runWithConcurrency(sizeTargets, env.githubSyncConcurrency, async (repo) => {
        inFlight.add(repo.name)
        try {
          const counts = await syncRepositoryPrSizes({
            db,
            repoPath: repo.path,
            repositoryId: repo.id,
            owner: repo.owner!,
            repo: repo.repo!,
            syncRunId: syncRunId!,
            githubClient: client,
          })
          summary.sizeSyncErrors += counts.failed
          if (isPrSizeSyncPartial(counts)) {
            sizeSyncPartial = true
          }
        } finally {
          phaseDone += 1
          inFlight.delete(repo.name)
          const snapshot = [...inFlight]
          await db
            .update(syncRuns)
            .set({ phaseDone, inFlightRepos: snapshot, errorCount: localErrorCount })
            .where(eq(syncRuns.id, syncRunId!))
          opts?.onProgress?.({
            type: 'repo_done',
            phase: 'pr_size_sync',
            repo: repo.name,
            done: phaseDone,
            total: sizeTargets.length,
            inFlightRepos: snapshot,
            errorCount: localErrorCount,
          })
        }
      })
    }
    phaseTimings['pr_size_sync'] = Date.now() - sizeSyncStart

    const errorRowCount = await countSyncErrors(db, syncRunId)
    summary.syncErrors = errorRowCount

    let runStatus: 'success' | 'partial' | 'failed' = 'success'
    if (prSyncAttempts > 0 && prSyncSuccesses === 0 && errorRowCount > 0) {
      runStatus = 'failed'
    } else if (errorRowCount > 0 && prSyncSuccesses > 0) {
      runStatus = 'partial'
    } else if (errorRowCount > 0) {
      runStatus = 'failed'
    } else if (sizeSyncPartial) {
      runStatus = 'partial'
    } else {
      runStatus = 'success'
    }

    await finalizeSyncRun(db, syncRunId, phaseTimings, runStatus, null, errorRowCount)

    summary.status = runStatus
    summary.phaseTimingsMs = phaseTimings
    return summary
  } catch (err) {
    if (err instanceof AlreadyRunningError) throw err
    const msg = err instanceof Error ? err.message : String(err)
    if (syncRunId !== null) {
      await insertError(null, 'refresh_orchestration', msg)
      const errorRows = await db.select({ id: syncErrors.id }).from(syncErrors).where(eq(syncErrors.syncRunId, syncRunId))
      summary.syncErrors = errorRows.length
      await db
        .update(syncRuns)
        .set({
          finishedAt: new Date(),
          errorCount: errorRows.length,
          status: 'failed',
          message: msg,
        })
        .where(eq(syncRuns.id, syncRunId))
    }
    summary.status = 'failed'
    return summary
  } finally {
    if (heartbeatTimer !== null) clearInterval(heartbeatTimer)
    await db.$client.end({ timeout: 5 })
  }
}
