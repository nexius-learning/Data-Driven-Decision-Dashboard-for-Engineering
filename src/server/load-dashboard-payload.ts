import { getEnv } from '~/config/env'
import { createDb } from '~/db/client'
import { getPrCycleTimeDashboard, type PrCycleTimeDashboard } from '~/metrics/pr-cycle-time-dashboard'

/** Opens a DB connection, runs the dashboard query for the given period and team, then closes the connection. */
export async function loadDashboardPayload(weeks?: number, now?: Date, team?: string): Promise<PrCycleTimeDashboard> {
  const env = getEnv()
  const db = createDb(env.databaseUrl)
  try {
    const w = weeks ?? env.defaultRangeWeeks
    return await getPrCycleTimeDashboard({ db, weeks: w, now, team })
  } finally {
    await db.$client.end({ timeout: 5 })
  }
}