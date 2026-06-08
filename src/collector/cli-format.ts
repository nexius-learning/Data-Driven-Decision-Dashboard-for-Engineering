import type { ProgressEvent, RefreshSummary } from '~/collector/refresh'

export function formatProgressLine(event: ProgressEvent, timestamp: string): string {
  if (event.type === 'phase_start') {
    return `[${timestamp}] phase_start: ${event.phase} (${event.total} repos)`
  }
  const errors = event.errorCount > 0 ? ` (${event.errorCount} error${event.errorCount === 1 ? '' : 's'})` : ''
  return `[${timestamp}] repo_done: ${event.repo} [${event.phase} ${event.done}/${event.total}]${errors}`
}

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
