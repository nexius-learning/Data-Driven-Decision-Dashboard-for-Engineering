export type ActiveSyncRun = {
  currentPhase: string | null
  phaseDone: number | null
  phaseTotal: number | null
  inFlightRepos: string[] | null
  errorCount: number
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
  scanning_repositories: 'Scanning repositories…',
  pr_sync: 'Syncing pull requests',
  review_sync: 'Syncing reviews',
  pr_size_sync: 'Syncing PR sizes',
}

export function deriveRefreshButtonState(
  activeRun: ActiveSyncRun | null,
  _nowMs: number,
  _ttlMs: number,
): RefreshButtonState {
  if (activeRun === null) return { status: 'idle' }
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
