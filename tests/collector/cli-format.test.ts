import { describe, expect, it } from 'vitest'

import { decideRefreshExitCode, formatProgressLine, formatRunSummary } from '~/collector/cli-format'
import { AlreadyRunningError, type RefreshSummary } from '~/collector/refresh'

const baseSummary: RefreshSummary = {
  reposScanned: 10,
  reposIncluded: 8,
  reposExcluded: 2,
  prsSeen: 100,
  prsMerged: 40,
  prsMissingJiraKey: 5,
  syncErrors: 0,
  syncWarnings: 0,
  status: 'success',
  reviewSyncErrors: 0,
  sizeSyncErrors: 0,
  phaseTimingsMs: { pr_sync: 12400, review_sync: 8100 },
}

describe('formatProgressLine', () => {
  it('phase_start_includes_phase_name_and_repo_count', () => {
    const line = formatProgressLine(
      { type: 'phase_start', phase: 'pr_sync', total: 5 },
      '2026-06-08 14:32:05',
    )
    expect(line).toContain('pr_sync')
    expect(line).toContain('5')
  })

  it('repo_done_includes_repo_name_and_progress', () => {
    const line = formatProgressLine(
      {
        type: 'repo_done',
        phase: 'pr_sync',
        repo: 'my-service',
        done: 3,
        total: 5,
        inFlightRepos: [],
        errorCount: 0,
      },
      '2026-06-08 14:32:08',
    )
    expect(line).toContain('my-service')
    expect(line).toContain('3/5')
    expect(line).toContain('pr_sync')
  })

  it('every_line_is_prefixed_with_timestamp', () => {
    const ts = '2026-06-08 14:32:05'
    const line = formatProgressLine({ type: 'phase_start', phase: 'pr_sync', total: 3 }, ts)
    expect(line).toMatch(/^\[2026-06-08 14:32:05\]/)
  })

  it('repo_done_with_errors_shows_error_count', () => {
    const line = formatProgressLine(
      {
        type: 'repo_done',
        phase: 'pr_sync',
        repo: 'broken-service',
        done: 4,
        total: 5,
        inFlightRepos: [],
        errorCount: 2,
      },
      '2026-06-08 14:32:09',
    )
    expect(line).toContain('2')
    expect(line).toMatch(/error/i)
  })
})

describe('formatRunSummary', () => {
  it('shows_refresh_status', () => {
    const text = formatRunSummary(baseSummary)
    expect(text).toMatch(/success/i)
  })

  it('shows_per_phase_timings_in_human_readable_form', () => {
    const text = formatRunSummary(baseSummary)
    expect(text).toContain('pr_sync')
    expect(text).toContain('12.4s')
    expect(text).toContain('review_sync')
    expect(text).toContain('8.1s')
  })

  it('shows_repo_and_pr_counts', () => {
    const text = formatRunSummary(baseSummary)
    expect(text).toContain('10')  // reposScanned
    expect(text).toContain('100') // prsSeen
    expect(text).toContain('40')  // prsMerged
  })

  it('shows_error_counts', () => {
    const summary = { ...baseSummary, syncErrors: 3, reviewSyncErrors: 1 }
    const text = formatRunSummary(summary)
    expect(text).toContain('3')
    expect(text).toMatch(/error/i)
  })

  it('contains_no_json', () => {
    const text = formatRunSummary(baseSummary)
    expect(text).not.toMatch(/^\s*\{/)
    expect(text).not.toContain('"reposScanned"')
  })
})

describe('decideRefreshExitCode', () => {
  it('exits_zero_on_a_successful_run', () => {
    expect(decideRefreshExitCode({ ok: true, summary: baseSummary }, false)).toBe(0)
  })

  it('exits_one_when_the_run_status_is_failed', () => {
    expect(decideRefreshExitCode({ ok: true, summary: { ...baseSummary, status: 'failed' } }, false)).toBe(1)
  })

  it('exits_one_when_the_run_status_is_failed_in_clone_only_mode_too', () => {
    // A real clone failure must still surface as a non-zero exit in clone-only mode,
    // matching the CLI's contract for every other failure mode (AC10).
    expect(decideRefreshExitCode({ ok: true, summary: { ...baseSummary, status: 'failed' } }, true)).toBe(1)
  })

  it('exits_zero_on_already_running_only_in_clone_only_mode', () => {
    const error = new AlreadyRunningError(new Date())
    expect(decideRefreshExitCode({ ok: false, error }, true)).toBe(0)
    expect(decideRefreshExitCode({ ok: false, error }, false)).toBe(1)
  })

  it('exits_one_for_any_other_thrown_error_regardless_of_mode', () => {
    expect(decideRefreshExitCode({ ok: false, error: new Error('boom') }, true)).toBe(1)
    expect(decideRefreshExitCode({ ok: false, error: new Error('boom') }, false)).toBe(1)
  })
})
