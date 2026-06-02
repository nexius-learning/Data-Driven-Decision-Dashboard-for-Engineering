import { describe, expect, it } from 'vitest'

import {
  assertDisposableFix004Database,
  resetRemainingDashboardTrendExpansion,
  seedRemainingDashboardTrendExpansion,
} from '../e2e/fixtures/remaining-dashboard-trend-expansion.fixture'

describe('remaining dashboard trend expansion fixture safety', () => {
  it('fixture_rejects_destructive_reset_against_local_development_database', () => {
    expect(() =>
      assertDisposableFix004Database('postgresql://dddd:dddd_local_dev@127.0.0.1:54332/dddd_dev'),
    ).toThrow(/disposable test database/)
  })

  it('fixture_accepts_explicit_disposable_test_database', () => {
    expect(() =>
      assertDisposableFix004Database('postgresql://dddd:dddd_local_dev@127.0.0.1:54332/dddd_test'),
    ).not.toThrow()
  })

  it('fixture_reset_rejects_before_deleting_local_development_data', async () => {
    const previous = process.env.DATABASE_URL
    process.env.DATABASE_URL = 'postgresql://dddd:dddd_local_dev@127.0.0.1:54332/dddd_dev'

    try {
      await expect(resetRemainingDashboardTrendExpansion({} as never)).rejects.toThrow(
        /disposable test database/,
      )
    } finally {
      process.env.DATABASE_URL = previous
    }
  })

  it('fixture_seed_rejects_before_writing_local_development_data', async () => {
    const previous = process.env.DATABASE_URL
    process.env.DATABASE_URL = 'postgresql://dddd:dddd_local_dev@127.0.0.1:54332/dddd_dev'

    try {
      await expect(
        seedRemainingDashboardTrendExpansion({} as never, { scenario: 'pr-size-completed-only' }),
      ).rejects.toThrow(/disposable test database/)
    } finally {
      process.env.DATABASE_URL = previous
    }
  })
})
