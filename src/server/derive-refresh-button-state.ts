export type ActiveSyncRun = {
  currentPhase: string | null
  phaseDone: number | null
  phaseTotal: number | null
  inFlightRepos: string[] | null
  errorCount: number
  heartbeatAt: Date | null
  startedAt: Date
}

export type RefreshButtonState =
  | { status: 'idle' }
  | {
      status: 'running'
      phaseLabel: string
      done: number
      total: number
      inFlightRepos: string[]
      errorCount: number
    }

const PHASE_LABELS: Record<string, string> = {
  cloning_repositories: 'Cloning repositories…',
  scanning_repositories: 'Scanning repositories…',
  pr_sync: 'Syncing pull requests',
  review_sync: 'Syncing reviews',
  pr_size_sync: 'Syncing PR sizes',
}

/**
 * Derives the UI state for the Refresh button from the active sync run.
 * Returns idle if there is no active run or if the heartbeat has exceeded ttlMs (zombie guard).
 */
export function deriveRefreshButtonState(
  activeRun: ActiveSyncRun | null,
  nowMs: number,
  ttlMs: number,
): RefreshButtonState {
  if (activeRun === null) return { status: 'idle' }
  if (activeRun.heartbeatAt !== null && nowMs - activeRun.heartbeatAt.getTime() > ttlMs)
    return { status: 'idle' }
  if (activeRun.heartbeatAt === null && nowMs - activeRun.startedAt.getTime() > ttlMs)
    return { status: 'idle' }
  const raw = activeRun.currentPhase
  const phaseLabel = raw ? (PHASE_LABELS[raw] ?? raw) : ''
  return {
    status: 'running',
    phaseLabel,
    done: activeRun.phaseDone ?? 0,
    total: activeRun.phaseTotal ?? 0,
    inFlightRepos: activeRun.inFlightRepos ?? [],
    errorCount: activeRun.errorCount,
  }
}
