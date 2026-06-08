import type { PrSize } from '~/metrics/pr-cycle-time-dashboard'
import { PrSizeCard } from './PrSizeCard'
import { PrSizeExceptionsPanel } from './PrSizeExceptionsPanel'
import { PrSizeTeamTable } from './PrSizeTeamTable'
import { PrSizeTrendChart } from './PrSizeTrendChart'

type Props = {
  prSize: PrSize | undefined
  activeTeam?: string
}

export function PrSizeSection({ prSize, activeTeam }: Props) {
  if (prSize === undefined) return null
  return (
    <section className="pr-dashboard__phase-section" data-testid="phase03-section" aria-label="PR Size">
      <div className="pr-dashboard__section-header">
        <h2 className="pr-dashboard__section-title">PR Size</h2>
        <p className="pr-dashboard__section-subtitle">Oversized pull request patterns for merged PRs</p>
      </div>
      <div data-testid="phase03-row-1" className="phase03-row-1 pr-dashboard__section-grid">
        <PrSizeCard metric={prSize.metric} />
        <PrSizeExceptionsPanel exceptions={prSize.exceptions} />
      </div>
      <div data-testid="phase03-row-2" className="phase03-row-2 pr-dashboard__section-grid">
        <PrSizeTrendChart weeklyTrend={prSize.weeklyTrend} />
        <PrSizeTeamTable rows={prSize.teamBreakdown} activeTeam={activeTeam} />
      </div>
    </section>
  )
}
