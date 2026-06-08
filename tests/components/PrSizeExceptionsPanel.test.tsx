import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import type { PrSizeException } from '~/metrics/pr-cycle-time-dashboard'
import { PrSizeExceptionsPanel } from '~/components/dashboard/PrSizeExceptionsPanel'

afterEach(cleanup)

function ex(overrides: Partial<PrSizeException> = {}): PrSizeException {
  return {
    type: 'oversized_pr_pattern',
    severity: 'warning',
    team: 'alpha',
    message: '2 of 4 PRs exceed 2× team median',
    flaggedPrCount: 2,
    totalPrCount: 4,
    ...overrides,
  }
}

describe('PrSizeExceptionsPanel', () => {
  it('panel_shows_empty_state_when_no_exceptions', () => {
    render(<PrSizeExceptionsPanel exceptions={[]} />)
    expect(screen.getByText('No oversized PR patterns in this range')).toBeTruthy()
  })

  it('panel_shows_team_and_description', () => {
    render(<PrSizeExceptionsPanel exceptions={[ex({ team: 'platform' })]} />)
    expect(screen.getByText('platform oversized PRs')).toBeTruthy()
    expect(screen.getByText('2 PRs above team median')).toBeTruthy()
    expect(screen.getByText('Split large work before review starts')).toBeTruthy()
  })

  it('panel_shows_multiple_exceptions', () => {
    render(
      <PrSizeExceptionsPanel
        exceptions={[
          ex({ team: 'alpha' }),
          ex({ team: 'beta', flaggedPrCount: 3 }),
          ex({ team: 'gamma', flaggedPrCount: 2 }),
        ]}
      />,
    )
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(screen.getByText('alpha oversized PRs')).toBeTruthy()
    expect(screen.getByText('beta oversized PRs')).toBeTruthy()
    expect(screen.getByText('gamma oversized PRs')).toBeTruthy()
  })
})
