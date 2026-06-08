import { createServerFn } from '@tanstack/react-start'

import type { RefreshSummary } from '~/collector/refresh'

/** Validates and normalises raw loader input into typed dashboard query params. */
export function parseDashboardWeeksInput(raw: unknown): { weeks?: number; team?: string } {
  if (raw === undefined || raw === null) {
    return {}
  }
  if (typeof raw !== 'object') {
    throw new Error('Invalid input')
  }
  const data = raw as { weeks?: number; team?: unknown }
  const result: { weeks?: number; team?: string } = {}
  if (data.weeks !== undefined) {
    if (typeof data.weeks !== 'number' || !Number.isInteger(data.weeks) || data.weeks <= 0) {
      throw new Error('weeks must be a positive integer')
    }
    result.weeks = data.weeks
  }
  if (data.team !== undefined) {
    if (typeof data.team !== 'string') {
      throw new Error('team must be a string')
    }
    if (data.team.trim().length === 0) {
      throw new Error('team must be a non-empty string')
    }
    result.team = data.team
  }
  return result
}

export type { PrCycleTimeDashboard } from '~/metrics/pr-cycle-time-dashboard'

/** Server function that loads the full dashboard payload for the given weeks and optional team filter. */
export const getDashboardData = createServerFn({ method: 'GET' })
  .inputValidator((raw: unknown) => parseDashboardWeeksInput(raw ?? {}))
  .handler(async ({ data }) => {
    const { loadDashboardPayload } = await import('~/server/load-dashboard-payload')
    return loadDashboardPayload(data.weeks, undefined, data.team)
  })

export type RefreshLocalDataResult =
  | { ok: true; summary: RefreshSummary }
  | { ok: false; message: string }

/** Server function that triggers a local data refresh and returns the outcome. */
export const refreshLocalDataFn = createServerFn({ method: 'POST' }).handler(
  async (): Promise<RefreshLocalDataResult> => {
    try {
      const { refreshLocalData } = await import('~/collector/refresh')
      const summary = await refreshLocalData()
      return { ok: true, summary }
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'Refresh failed'
      const message = raw.replace(/\s+/g, ' ').trim().slice(0, 280) || 'Refresh failed'
      return { ok: false, message }
    }
  },
)
