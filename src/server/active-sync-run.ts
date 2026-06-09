import { and, desc, eq } from 'drizzle-orm'
import type { AppDb } from '~/db/client'
import { syncRuns } from '~/db/schema'
import type { ActiveSyncRun } from '~/server/derive-refresh-button-state'

/** Queries the database for the currently running collector_refresh sync run, or returns null if none is active. */
export async function getActiveSyncRun({ db }: { db: AppDb }): Promise<ActiveSyncRun | null> {
  const [row] = await db
    .select({
      currentPhase: syncRuns.currentPhase,
      phaseDone: syncRuns.phaseDone,
      phaseTotal: syncRuns.phaseTotal,
      inFlightRepos: syncRuns.inFlightRepos,
      errorCount: syncRuns.errorCount,
      heartbeatAt: syncRuns.heartbeat,
      startedAt: syncRuns.startedAt,
    })
    .from(syncRuns)
    .where(and(eq(syncRuns.status, 'running'), eq(syncRuns.kind, 'collector_refresh')))
    .orderBy(desc(syncRuns.heartbeat))
    .limit(1)

  return row ?? null
}
