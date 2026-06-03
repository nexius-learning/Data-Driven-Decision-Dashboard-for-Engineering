type Props = {
  team: string
  dotClassName: string
}

const UNASSIGNED_TEAM = 'Unassigned'

export function TeamLabel({ team, dotClassName }: Props) {
  const isUnassigned = team === UNASSIGNED_TEAM
  return (
    <span className="pr-dashboard__team-cell">
      <span
        className={isUnassigned ? 'pr-dashboard__team-dot pr-dashboard__team-dot--unassigned' : dotClassName}
        aria-hidden="true"
      />
      <span className="pr-dashboard__team-label-stack">
        <span>{team}</span>
        {isUnassigned ? (
          <span className="pr-dashboard__team-note" title="Repository is missing a team mapping">
            needs team mapping
          </span>
        ) : null}
      </span>
    </span>
  )
}
