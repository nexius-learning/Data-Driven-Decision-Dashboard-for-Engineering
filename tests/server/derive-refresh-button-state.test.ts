import { describe, expect, it } from 'vitest'
import type { ActiveSyncRun } from '~/server/derive-refresh-button-state'
import { deriveRefreshButtonState } from '~/server/derive-refresh-button-state'

const NOW_MS = 1_700_000_000_000
const TTL_MS = 120_000

function running(overrides: Partial<ActiveSyncRun> = {}): ActiveSyncRun {
  return {
    currentPhase: null,
    phaseDone: null,
    phaseTotal: null,
    inFlightRepos: null,
    errorCount: 0,
    heartbeatAt: null,
    ...overrides,
  }
}

describe('deriveRefreshButtonState', () => {
  it('derive_idle_when_no_active_run', () => {
    expect(deriveRefreshButtonState(null, NOW_MS, TTL_MS)).toEqual({ status: 'idle' })
  })

  it('derive_running_scanning_repositories_label', () => {
    const state = deriveRefreshButtonState(running({ currentPhase: 'scanning_repositories' }), NOW_MS, TTL_MS)
    expect(state.status).toBe('running')
    if (state.status === 'running') {
      expect(state.phaseLabel).toBe('Scanning repositories…')
    }
  })

  it('derive_running_pr_sync_label', () => {
    const state = deriveRefreshButtonState(running({ currentPhase: 'pr_sync' }), NOW_MS, TTL_MS)
    if (state.status === 'running') expect(state.phaseLabel).toBe('Syncing pull requests')
  })

  it('derive_running_review_sync_label', () => {
    const state = deriveRefreshButtonState(running({ currentPhase: 'review_sync' }), NOW_MS, TTL_MS)
    if (state.status === 'running') expect(state.phaseLabel).toBe('Syncing reviews')
  })

  it('derive_running_pr_size_sync_label', () => {
    const state = deriveRefreshButtonState(running({ currentPhase: 'pr_size_sync' }), NOW_MS, TTL_MS)
    if (state.status === 'running') expect(state.phaseLabel).toBe('Syncing PR sizes')
  })

  it('derive_running_counters', () => {
    const state = deriveRefreshButtonState(running({ phaseDone: 3, phaseTotal: 11 }), NOW_MS, TTL_MS)
    if (state.status === 'running') {
      expect(state.done).toBe(3)
      expect(state.total).toBe(11)
    }
  })

  it('derive_running_done_reaches_total', () => {
    const state = deriveRefreshButtonState(running({ phaseDone: 11, phaseTotal: 11 }), NOW_MS, TTL_MS)
    if (state.status === 'running') {
      expect(state.done).toBe(11)
      expect(state.total).toBe(11)
    }
  })

  it('derive_running_error_count_included', () => {
    const state = deriveRefreshButtonState(running({ errorCount: 2 }), NOW_MS, TTL_MS)
    if (state.status === 'running') expect(state.errorCount).toBe(2)
  })

  it('derive_running_error_count_zero_by_default', () => {
    const state = deriveRefreshButtonState(running(), NOW_MS, TTL_MS)
    if (state.status === 'running') expect(state.errorCount).toBe(0)
  })

  it('derive_running_in_flight_repos', () => {
    const repos = ['repo-a', 'repo-b']
    const state = deriveRefreshButtonState(running({ inFlightRepos: repos }), NOW_MS, TTL_MS)
    if (state.status === 'running') expect(state.inFlightRepos).toEqual(repos)
  })

  it('derive_running_defaults_null_counters_to_zero', () => {
    const state = deriveRefreshButtonState(running(), NOW_MS, TTL_MS)
    if (state.status === 'running') {
      expect(state.done).toBe(0)
      expect(state.total).toBe(0)
      expect(state.inFlightRepos).toEqual([])
    }
  })

  it('derive_running_unknown_phase_returns_raw_string', () => {
    const state = deriveRefreshButtonState(running({ currentPhase: 'future_phase' }), NOW_MS, TTL_MS)
    if (state.status === 'running') expect(state.phaseLabel).toBe('future_phase')
  })

  it('derive_running_null_phase_returns_empty_string', () => {
    const state = deriveRefreshButtonState(running({ currentPhase: null }), NOW_MS, TTL_MS)
    if (state.status === 'running') expect(state.phaseLabel).toBe('')
  })

  it('derive_idle_for_stale_heartbeat', () => {
    const staleRun = running({ heartbeatAt: new Date(NOW_MS - TTL_MS - 1) })
    expect(deriveRefreshButtonState(staleRun, NOW_MS, TTL_MS)).toEqual({ status: 'idle' })
  })

  it('derive_running_when_heartbeat_is_live', () => {
    const liveRun = running({ heartbeatAt: new Date(NOW_MS - TTL_MS + 1) })
    expect(deriveRefreshButtonState(liveRun, NOW_MS, TTL_MS).status).toBe('running')
  })

  it('derive_running_when_heartbeat_is_null', () => {
    const run = running({ heartbeatAt: null })
    expect(deriveRefreshButtonState(run, NOW_MS, TTL_MS).status).toBe('running')
  })
})
