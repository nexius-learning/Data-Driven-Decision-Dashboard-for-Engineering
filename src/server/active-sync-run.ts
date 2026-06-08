import { eq } from 'drizzle-orm'
import type { AppDb } from '~/db/client'
import { syncRuns } from '~/db/schema'
import type { ActiveSyncRun } from '~/server/derive-refresh-button-state'

export async function getActiveSyncRun({ db }: { db: AppDb }): Promise<ActiveSyncRun | null> {
  const [row] = await db
    .select({
      currentPhase: syncRuns.currentPhase,
      phaseDone: syncRuns.phaseDone,
      phaseTotal: syncRuns.phaseTotal,
      inFlightRepos: syncRuns.inFlightRepos,
      errorCount: syncRuns.errorCount,
      heartbeatAt: syncRuns.heartbeat,
    })
    .from(syncRuns)
    .where(eq(syncRuns.status, 'running'))
    .limit(1)

  return row ?? null
}
