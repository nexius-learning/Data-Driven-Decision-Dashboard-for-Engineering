import { and, desc, eq } from 'drizzle-orm'
import type { AppDb } from '~/db/client'
import { syncRuns } from '~/db/schema'
import type { ActiveSyncRun } from '~/server/derive-refresh-button-state'

/**
 * Queries the database for the currently running collector_refresh sync run, or
 * returns null if none is active. Not scoped by `mode`: a clone-only run is a
 * real, progressing run that also holds the shared single-flight slot, so the
 * Refresh button must be able to attach to it and show its live "Cloning
 * repositories" progress on both mount and refresh-click collisions — otherwise
 * a collision with the container's clone-only startup job would surface as an
 * "already in progress" error with no visible cause. Freshness / "last synced"
 * queries stay `mode = 'full'` (see getLatestSyncSource); this live-progress
 * lookup deliberately does not.
 */
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
