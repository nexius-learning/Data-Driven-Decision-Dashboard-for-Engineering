# Feature Brief: Stale Open PR Exceptions

Status: Planned

Mockup: [Stale open PR exception mockup](../Assets/mockups/06-orphaned-prs-exceptions.html)

## Problem

The dashboard already flags teams with long-open pull requests, but the exception is too summary-level. A user can see that a team has stale open PRs, yet still has to leave the dashboard and search GitHub to find which PRs need action.

Open PRs that sit for days or weeks can later inflate PR Cycle Time when they merge. They are also a useful early warning signal because they are still actionable before they become completed cycle-time damage.

## Goal

Make the existing PR Cycle Time exception actionable by showing the oldest stale open PRs inside the PR cycle time exceptions card.

This should help engineering leads identify stuck work quickly without adding a new metric section or exposing individual-author rankings.

## Users & Context

Engineering leads use the one-page dashboard to spot delivery bottlenecks. When the PR Cycle Time exception card says a team has long-open PRs, the next useful question is: which open PRs should be unblocked, split, or closed?

The current dashboard already has:

- a PR Cycle Time exceptions card;
- a `long_open_prs` exception type;
- a Team Breakdown `Longest Open PR` column.

This feature refines those existing surfaces instead of creating a new dashboard area.

## Core Flow

1. User opens the dashboard.
2. User sees the PR Cycle Time exceptions card.
3. If a team has stale open PRs, the existing long-open exception expands with a list of the oldest stale PRs.
4. Each row shows PR number, title, repository, link, and open age.
5. User opens GitHub from the PR link and decides whether to unblock, split, or close the PR.

## In Scope

- Keep stale open PRs inside the existing PR Cycle Time exceptions card.
- Keep the Team Breakdown `Longest Open PR` column as the compact team-level signal.
- Add stale PR details only for the `long_open_prs` exception.
- Show only PR number, PR title, repository, PR URL, and age.
- Sort stale PR details by age descending.
- Cap stale PR details to the oldest 3 per exception in all-teams mode.
- When a single team is selected in the dashboard team filter, return and show up to the oldest 10 stale PR details for that team.
- Keep the existing global exception cap unless an implementation plan explicitly changes it.
- Use a threshold that catches truly stale work while avoiding noisy team-specific false positives.
- Add tests for data contract, sorting, cap behavior, rendering, and privacy constraints.

## Out of Scope

- A new dashboard metric section.
- A separate orphaned PR dashboard page.
- Author names, assignee names, reviewer rankings, or individual performance surfaces.
- GitHub write actions such as closing, commenting, assigning, or requesting review.
- Jira, AI recommendations, cloud deployment, auth, or later quality metrics.
- Configurable user thresholds in the first iteration.

## Key Decisions

- Treat this as a PR Cycle Time refinement, not a new metric, because stale open PRs are a leading indicator for future PR cycle-time inflation.
- Use the existing exceptions card because that is already where the dashboard explains cycle-time risks.
- Keep the Team Breakdown table compact. It should continue to show the oldest open PR age, while the exception card shows concrete PR details only when a threshold is crossed.
- Do not show author-level data. The dashboard should identify stuck work, not rank or shame people.
- Prefer a hybrid threshold: a stale open PR is older than `max(72h, team median PR cycle time)`.
- If a team has no current median PR cycle time, fall back to `72h` so open-only teams can still surface stale PRs.
- Use `stale open PRs` in product UI instead of `orphaned PRs`, because it is precise, measurable, and less judgmental.
- In all-teams mode, keep the exception card compact by showing the oldest 3 stale PRs per exception.
- In team-filtered mode, expand the selected team's stale PR detail list to the oldest 10 stale PRs so the user can inspect more stale PRs without adding a new dashboard section.
- Apply the detail cap in the dashboard payload builder, because the team filter is already part of the server-side dashboard query.

## Threshold Contract

A stale open PR is an open pull request whose age is greater than:

```text
max(72 hours, team current median PR cycle time)
```

When the team current median is unavailable:

```text
72 hours
```

Rationale:

- A fixed 72-hour threshold is simple and catches PRs left untouched for several working days.
- A team median threshold alone can be too sensitive for teams with very short cycle times.
- The hybrid threshold avoids flagging a 30-hour PR for a fast team while still catching week-old abandoned PRs.

## Data Contract

Extend the `long_open_prs` exception payload with optional PR details:

```ts
type StaleOpenPrDetail = {
  prNumber: number
  title: string
  repo: string
  url: string
  ageHours: number
}
```

Add to `PrCycleTimeException`:

```ts
prDetails?: StaleOpenPrDetail[]
staleThresholdHours?: number
```

Rules:

- `prDetails` is present only for `long_open_prs`.
- `prDetails` contains at most 3 items in all-teams mode.
- `prDetails` contains at most 10 items in team-filtered mode for the selected team.
- Items are sorted by `ageHours` descending.
- `repo` should be a repository display name or full name already available from collected repository metadata.
- The payload must remain serializable.
- The implementation must not add author, assignee, or reviewer fields.

## UX Requirements

- Exception title: `{Team} stale open PRs`.
- Metric text: `{N} PRs older than {threshold}`.
- Recommendation: `Unblock, split, or close stale work before it inflates cycle time.`
- In all-teams mode, the detail list shows at most 3 rows.
- In team-filtered mode, the selected team's detail list shows at most 10 rows.
- Detail row format:
  - primary: `#{number} {title}`
  - secondary: `{repo}`
  - right side: `{age} open`
- Long titles must truncate cleanly on desktop and mobile.
- PR rows must be links when `url` is available.
- The list must remain compact enough to preserve the first dashboard viewport.
- The card must still render cleanly when there are no `prDetails`.

## Acceptance Criteria

- The PR Cycle Time exceptions card can show concrete stale open PR details for a `long_open_prs` exception.
- The Team Breakdown table keeps `Longest Open PR` as a compact age signal.
- The stale threshold uses `max(72h, team median PR cycle time)` when a team median exists.
- The stale threshold falls back to `72h` when no team median exists.
- The exception count includes all stale open PRs for the team, not only the visible capped detail rows.
- All-teams mode shows the oldest 3 stale PRs by open age.
- Team-filtered mode shows up to the oldest 10 stale PR details for the selected team.
- Each visible stale PR row includes PR number, title, repository, URL, and age.
- No author, assignee, reviewer, or individual-ranking field is added to the payload or UI.
- Existing `team_worsened` and `baseline_pending` exception behavior remains unchanged.
- Existing PR Cycle Time median, trend, weekly chart, Team Breakdown, First Review, and PR Size calculations remain unchanged.
- Desktop and mobile rendering keep the exception card readable without text overlap.

## Test Requirements

- Metric/unit: emits `long_open_prs` details for open PRs older than `max(72h, team median)`.
- Metric/unit: falls back to `72h` when the team has no median.
- Metric/unit: does not include open PRs below or equal to the stale threshold.
- Metric/unit: sorts stale PR details by age descending.
- Metric/unit: caps stale PR details at 3 in all-teams mode while preserving total stale count.
- Metric/unit: returns up to 10 stale PR details when filtering to a single team.
- Metric/unit: does not expose author, assignee, or reviewer fields.
- Component: renders stale PR rows under the PR Cycle Time exception.
- Component: renders the expanded team-filtered stale PR detail list without introducing a new metric section.
- Component: handles long PR titles without layout overflow.
- Component: renders the existing summary-only state when `prDetails` is absent.
- Regression: existing PR Cycle Time exception tests remain valid for `team_worsened` and `baseline_pending`.
- Regression: First Review and PR Size sections remain unchanged.

## Edge Cases

- Team has open PRs but no current merged PR median: use the 72-hour threshold.
- Team has a very high median, such as 5 days: do not flag 72-hour PRs unless they exceed the team median.
- Team has many stale PRs: show total count, list the oldest 3.
- Team has many stale PRs and that team is selected: show up to the oldest 10 stale PRs for that selected team while preserving total count.
- PR title is very long: truncate the title, keep repo and age readable.
- PR URL is missing: render the row as text without breaking the card.
- Open PR age is negative because of bad source data: ignore it for stale detection.

## Open Questions

- None for the first implementation.

## Future Iterations

- Add a source/provenance route for stale open PR details if the exception card becomes too dense.
- Consider a configurable stale threshold only after users validate the default.

## Recommendation

Ship this as a small PR Cycle Time refinement before Phase 04, only if the roadmap explicitly allows a pre-Phase-04 dashboard polish item. It is valuable because it turns an existing warning into an actionable list, but it should stay narrow: no new metric section, no author-level exposure, and no GitHub write actions.
