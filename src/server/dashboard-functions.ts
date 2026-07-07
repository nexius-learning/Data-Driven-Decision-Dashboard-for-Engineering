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

/**
 * Maps a refreshLocalData failure to the message shown on the dashboard. An
 * already-running collision gets a fixed, friendly message instead of the raw
 * error text — the caller may be hidden from the live "active run" state (a
 * concurrent clone-only run), so the raw "already running" text would appear
 * with no visible cause.
 */
export function formatRefreshFailureMessage(e: unknown, isAlreadyRunning: boolean): string {
  if (isAlreadyRunning) {
    return 'A refresh is already in progress. Try refreshing again in a moment.'
  }
  const raw = e instanceof Error ? e.message : 'Refresh failed'
  return raw.replace(/\s+/g, ' ').trim().slice(0, 280) || 'Refresh failed'
}

/** Server function that triggers a local data refresh and returns the outcome. */
export const refreshLocalDataFn = createServerFn({ method: 'POST' }).handler(
  async (): Promise<RefreshLocalDataResult> => {
    const { refreshLocalData, AlreadyRunningError } = await import('~/collector/refresh')
    try {
      const summary = await refreshLocalData()
      return { ok: true, summary }
    } catch (e) {
      return { ok: false, message: formatRefreshFailureMessage(e, e instanceof AlreadyRunningError) }
    }
  },
)
