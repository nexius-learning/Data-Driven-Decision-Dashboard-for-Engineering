# Phase 00: Product Refinement And UI

Status: Implemented (historical Phase 00)
Last updated: 2026-05-16

> Historical note: this document locked the original product direction before implementation. The current dashboard UI reference is the Phase 03 mockup below, with FIX-003/FIX-004 trend refinements layered on top.

## Goal

Lock the product direction, save the design history, and make the first release scope unambiguous before implementation starts.

## Decisions

- The app is a local-first web dashboard.
- The user is the Head of Engineering.
- The dashboard is for weekly decision-making, not passive reporting.
- The first release shows only PR Cycle Time.
- Future metrics are added only after their data exists.
- The app is a one-page scrolling dashboard.
- Each new metric is added as a new vertical section below the last implemented metric section.
- New metric phases preserve earlier sections above them; they do not introduce tabs, new pages, or cram additional metric cards into the first viewport.
- AI is skipped for v1.

## Mockups

### Phase 01 MVP Reference

![PR Cycle Time first increment](../Assets/mockups/03-pr-cycle-time-first-increment.png)

### Phase 02 Reference

![PR Cycle Time and First Review](../Assets/mockups/04-pr-cycle-time-and-first-review.png)

### Phase 03 Reference

![PR Cycle Time, First Review, and PR Size](../Assets/mockups/05-pr-cycle-time-first-review-and-pr-size.png)

### Superseded Concepts

![Seven-metric MVP concept](../Assets/mockups/02-seven-metric-mvp-concept.png)

This version is superseded because it shows too many metrics before their data collection exists.

![Expanded dashboard concept](../Assets/mockups/01-expanded-dashboard-concept.png)

This version is superseded because it includes broader navigation, quality views, and decision areas beyond the MVP.

## Acceptance Criteria

- Product brief exists.
- Roadmap exists.
- Phase docs exist.
- Mockups are stored inside the project.
- One-page scroll layout rule is documented for future metric phases.
- Phase 01 can be implemented without re-deciding the MVP scope.
