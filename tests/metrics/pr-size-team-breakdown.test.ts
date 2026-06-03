import { describe, expect, it } from 'vitest'

import { getPrSizeTeamBreakdown } from '~/metrics/pr-size-team-breakdown'
import type { PrSizeRecord } from '~/metrics/pr-size-types'

let seq = 0

function pr(overrides: Partial<PrSizeRecord> = {}): PrSizeRecord {
  seq += 1
  return {
    id: `pr-${seq}`,
    number: seq,
    title: `PR ${seq}`,
    url: `https://github.com/o/r/pull/${seq}`,
    repositoryId: 'repo-1',
    repoFullName: 'o/r',
    team: 'alpha',
    mergedAt: new Date('2026-02-15T12:00:00.000Z'),
    additions: 50,
    deletions: 0,
    changedFiles: 1,
    ...overrides,
  }
}

const currentWindow = {
  from: new Date('2026-01-01T00:00:00.000Z'),
  to: new Date('2026-03-31T23:59:59.999Z'),
}

const priorWindow = {
  from: new Date('2025-10-01T00:00:00.000Z'),
  to: new Date('2025-12-31T23:59:59.999Z'),
}

function breakdown(
  prs: PrSizeRecord[],
  cur = currentWindow,
  prior = priorWindow,
) {
  return getPrSizeTeamBreakdown(prs, cur, prior)
}

function sizedLines(additions: number, deletions = 0): Partial<PrSizeRecord> {
  return { additions, deletions }
}

describe('getPrSizeTeamBreakdown', () => {
  it('excludes_teams_with_no_size_data', () => {
    const rows = breakdown([
      pr({ team: 'alpha', additions: null, deletions: null }),
      pr({ team: 'beta', ...sizedLines(100) }),
    ])
    expect(rows.map((r) => r.team)).toEqual(['beta'])
  })

  it('includes_configured_team_with_no_current_size_data', () => {
    const rows = getPrSizeTeamBreakdown(
      [pr({ team: 'alpha', ...sizedLines(100) })],
      currentWindow,
      priorWindow,
      ['Tartalomeloállitas'],
    )
    const configured = rows.find((r) => r.team === 'Tartalomeloállitas')
    expect(configured).toMatchObject({
      prCount: 0,
      medianLines: null,
      medianChangedFiles: null,
      trend: '—',
    })
  })

  it('trend_up_when_current_exceeds_prior_by_10pct', () => {
    const rows = breakdown([
      pr({ ...sizedLines(37), mergedAt: new Date('2026-02-01') }),
      pr({ ...sizedLines(37), mergedAt: new Date('2026-02-02') }),
      pr({ ...sizedLines(37), mergedAt: new Date('2026-02-03') }),
      pr({ ...sizedLines(33), mergedAt: new Date('2025-11-01') }),
      pr({ ...sizedLines(33), mergedAt: new Date('2025-11-02') }),
      pr({ ...sizedLines(34), mergedAt: new Date('2025-11-03') }),
    ])
    expect(rows[0]?.trend).toBe('↑')
  })

  it('trend_up_at_exact_10pct_boundary', () => {
    const rows = breakdown([
      pr({ ...sizedLines(37), mergedAt: new Date('2026-02-01') }),
      pr({ ...sizedLines(37), mergedAt: new Date('2026-02-02') }),
      pr({ ...sizedLines(36), mergedAt: new Date('2026-02-03') }),
      pr({ ...sizedLines(33), mergedAt: new Date('2025-11-01') }),
      pr({ ...sizedLines(33), mergedAt: new Date('2025-11-02') }),
      pr({ ...sizedLines(34), mergedAt: new Date('2025-11-03') }),
    ])
    expect(rows[0]?.trend).toBe('↑')
  })

  it('trend_down_when_prior_exceeds_current_by_10pct', () => {
    const rows = breakdown([
      pr({ ...sizedLines(29), mergedAt: new Date('2026-02-01') }),
      pr({ ...sizedLines(30), mergedAt: new Date('2026-02-02') }),
      pr({ ...sizedLines(30), mergedAt: new Date('2026-02-03') }),
      pr({ ...sizedLines(33), mergedAt: new Date('2025-11-01') }),
      pr({ ...sizedLines(34), mergedAt: new Date('2025-11-02') }),
      pr({ ...sizedLines(33), mergedAt: new Date('2025-11-03') }),
    ])
    expect(rows[0]?.trend).toBe('↓')
  })

  it('trend_down_at_exact_10pct_boundary', () => {
    const rows = breakdown([
      pr({ ...sizedLines(30), mergedAt: new Date('2026-02-01') }),
      pr({ ...sizedLines(30), mergedAt: new Date('2026-02-02') }),
      pr({ ...sizedLines(30), mergedAt: new Date('2026-02-03') }),
      pr({ ...sizedLines(33), mergedAt: new Date('2025-11-01') }),
      pr({ ...sizedLines(34), mergedAt: new Date('2025-11-02') }),
      pr({ ...sizedLines(33), mergedAt: new Date('2025-11-03') }),
    ])
    expect(rows[0]?.trend).toBe('↓')
  })

  it('trend_flat_within_10pct', () => {
    const rows = breakdown([
      pr({ ...sizedLines(35), mergedAt: new Date('2026-02-01') }),
      pr({ ...sizedLines(35), mergedAt: new Date('2026-02-02') }),
      pr({ ...sizedLines(35), mergedAt: new Date('2026-02-03') }),
      pr({ ...sizedLines(33), mergedAt: new Date('2025-11-01') }),
      pr({ ...sizedLines(34), mergedAt: new Date('2025-11-02') }),
      pr({ ...sizedLines(33), mergedAt: new Date('2025-11-03') }),
    ])
    expect(rows[0]?.trend).toBe('→')
  })

  it('trend_dash_when_fewer_than_3_prs_in_current', () => {
    const rows = breakdown([
      pr({ ...sizedLines(100), mergedAt: new Date('2026-02-01') }),
      pr({ ...sizedLines(100), mergedAt: new Date('2026-02-02') }),
      pr({ ...sizedLines(50), mergedAt: new Date('2025-11-01') }),
      pr({ ...sizedLines(50), mergedAt: new Date('2025-11-02') }),
      pr({ ...sizedLines(50), mergedAt: new Date('2025-11-03') }),
    ])
    expect(rows[0]?.trend).toBe('—')
  })

  it('trend_dash_when_fewer_than_3_prs_in_prior', () => {
    const rows = breakdown([
      pr({ ...sizedLines(100), mergedAt: new Date('2026-02-01') }),
      pr({ ...sizedLines(100), mergedAt: new Date('2026-02-02') }),
      pr({ ...sizedLines(100), mergedAt: new Date('2026-02-03') }),
      pr({ ...sizedLines(50), mergedAt: new Date('2025-11-01') }),
      pr({ ...sizedLines(50), mergedAt: new Date('2025-11-02') }),
    ])
    expect(rows[0]?.trend).toBe('—')
  })

  it('prior_window_median_computed_from_prior_prs_only', () => {
    const rows = breakdown([
      pr({ ...sizedLines(100), mergedAt: new Date('2026-02-01') }),
      pr({ ...sizedLines(100), mergedAt: new Date('2026-02-02') }),
      pr({ ...sizedLines(100), mergedAt: new Date('2026-02-03') }),
      pr({ ...sizedLines(100), mergedAt: new Date('2026-02-04') }),
      pr({ ...sizedLines(50), mergedAt: new Date('2025-11-01') }),
      pr({ ...sizedLines(50), mergedAt: new Date('2025-11-02') }),
      pr({ ...sizedLines(50), mergedAt: new Date('2025-11-03') }),
      pr({ ...sizedLines(50), mergedAt: new Date('2025-11-04') }),
      pr({ ...sizedLines(50), mergedAt: new Date('2025-11-05') }),
    ])
    expect(rows[0]?.medianLines).toBe(100)
    expect(rows[0]?.trend).toBe('↑')
  })

  it('largest_pr_selected_correctly_across_repos', () => {
    const rows = breakdown([
      pr({
        ...sizedLines(50),
        title: 'Small',
        repoFullName: 'org/small-repo',
        url: 'https://github.com/org/small-repo/pull/1',
        repositoryId: 'repo-small',
      }),
      pr({
        ...sizedLines(200),
        title: 'Big',
        repoFullName: 'org/big-repo',
        url: 'https://github.com/org/big-repo/pull/2',
        repositoryId: 'repo-big',
      }),
      pr({ ...sizedLines(80), mergedAt: new Date('2025-11-01') }),
      pr({ ...sizedLines(80), mergedAt: new Date('2025-11-02') }),
      pr({ ...sizedLines(80), mergedAt: new Date('2025-11-03') }),
    ])
    expect(rows[0]).toMatchObject({
      largestPrTitle: 'Big',
      largestPrRepo: 'org/big-repo',
      largestPrUrl: 'https://github.com/org/big-repo/pull/2',
      largestPrLines: 200,
    })
  })

  it('largest_pr_excludes_null_size_prs', () => {
    const rows = breakdown([
      pr({ additions: null, deletions: null, title: 'Null size' }),
      pr({ ...sizedLines(30), title: 'Small sized' }),
      pr({ ...sizedLines(80), title: 'Large sized' }),
      pr({ ...sizedLines(50), mergedAt: new Date('2025-11-01') }),
      pr({ ...sizedLines(50), mergedAt: new Date('2025-11-02') }),
      pr({ ...sizedLines(50), mergedAt: new Date('2025-11-03') }),
    ])
    expect(rows[0]?.largestPrLines).toBe(80)
    expect(rows[0]?.largestPrTitle).toBe('Large sized')
  })

  it('sorted_by_median_descending', () => {
    const rows = breakdown([
      pr({ team: 'low', ...sizedLines(50) }),
      pr({ team: 'low', ...sizedLines(50), mergedAt: new Date('2025-11-01') }),
      pr({ team: 'low', ...sizedLines(50), mergedAt: new Date('2025-11-02') }),
      pr({ team: 'low', ...sizedLines(50), mergedAt: new Date('2025-11-03') }),
      pr({ team: 'high', ...sizedLines(200) }),
      pr({ team: 'high', ...sizedLines(200), mergedAt: new Date('2025-11-01') }),
      pr({ team: 'high', ...sizedLines(200), mergedAt: new Date('2025-11-02') }),
      pr({ team: 'high', ...sizedLines(200), mergedAt: new Date('2025-11-03') }),
      pr({ team: 'mid', ...sizedLines(100) }),
      pr({ team: 'mid', ...sizedLines(100), mergedAt: new Date('2025-11-01') }),
      pr({ team: 'mid', ...sizedLines(100), mergedAt: new Date('2025-11-02') }),
      pr({ team: 'mid', ...sizedLines(100), mergedAt: new Date('2025-11-03') }),
    ])
    expect(rows.map((r) => r.team)).toEqual(['high', 'mid', 'low'])
  })

  it('null_team_repos_grouped_as_unassigned_at_bottom', () => {
    const rows = breakdown([
      pr({ team: null, ...sizedLines(500) }),
      pr({ team: 'alpha', ...sizedLines(10) }),
      pr({ ...sizedLines(10), mergedAt: new Date('2025-11-01') }),
      pr({ ...sizedLines(10), mergedAt: new Date('2025-11-02') }),
      pr({ ...sizedLines(10), mergedAt: new Date('2025-11-03') }),
    ])
    expect(rows.map((r) => r.team)).toEqual(['alpha', 'Unassigned'])
  })
})
