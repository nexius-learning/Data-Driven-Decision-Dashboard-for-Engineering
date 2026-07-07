import { AlreadyRunningError, type ProgressEvent, type RefreshSummary } from '~/collector/refresh'

/** Formats a single progress event as a timestamped CLI log line. */
export function formatProgressLine(event: ProgressEvent, timestamp: string): string {
  if (event.type === 'phase_start') {
    return `[${timestamp}] phase_start: ${event.phase} (${event.total} repos)`
  }
  const errors = event.errorCount > 0 ? ` (${event.errorCount} error${event.errorCount === 1 ? '' : 's'})` : ''
  return `[${timestamp}] repo_done: ${event.repo} [${event.phase} ${event.done}/${event.total}]${errors}`
}

/** Formats the completed refresh summary as a human-readable multi-line string. */
export function formatRunSummary(summary: RefreshSummary): string {
  const lines: string[] = []
  lines.push(`Refresh finished: ${summary.status}`)
  lines.push('')

  for (const [phase, ms] of Object.entries(summary.phaseTimingsMs)) {
    lines.push(`  ${phase}  ${(ms / 1000).toFixed(1)}s`)
  }

  lines.push('')
  lines.push(`Repos scanned:           ${summary.reposScanned}`)
  lines.push(`Repos included:          ${summary.reposIncluded}`)
  lines.push(`Repos excluded:          ${summary.reposExcluded}`)
  lines.push(`PRs seen:                ${summary.prsSeen}`)
  lines.push(`PRs merged:              ${summary.prsMerged}`)
  lines.push(`PRs missing Jira key:    ${summary.prsMissingJiraKey}`)
  lines.push(`Sync errors:             ${summary.syncErrors}`)
  lines.push(`Review sync errors:      ${summary.reviewSyncErrors}`)
  lines.push(`Size sync errors:        ${summary.sizeSyncErrors}`)

  return lines.join('\n')
}

/**
 * Decides the CLI process exit code for a completed or failed refresh run.
 * A finished run exits 1 only when its status is `failed` (e.g. a total clone
 * failure where no repo succeeded); a `partial` run — some repos failed, some
 * succeeded — exits 0, with the failures visible on the Sync Errors page rather
 * than as a non-zero exit code. `AlreadyRunningError` exits cleanly (0) only in
 * clone-only mode, matching the old bash clone-cron's "skip cleanly" contract
 * for a lock conflict; every other thrown error exits non-zero.
 */
export function decideRefreshExitCode(
  outcome: { ok: true; summary: RefreshSummary } | { ok: false; error: unknown },
  cloneOnly: boolean,
): number {
  if (outcome.ok) {
    return outcome.summary.status === 'failed' ? 1 : 0
  }
  if (cloneOnly && outcome.error instanceof AlreadyRunningError) {
    return 0
  }
  return 1
}
