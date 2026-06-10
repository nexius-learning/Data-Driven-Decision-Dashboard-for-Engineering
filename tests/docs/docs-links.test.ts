import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.join(__dirname, '../..')

function readDoc(rel: string): string {
  return readFileSync(path.join(root, rel), 'utf8')
}

function expectDocPath(rel: string): void {
  expect(existsSync(path.join(root, rel)), `${rel} should exist`).toBe(true)
}

describe('documentation links and phase 01 status', () => {
  it('docs_link_phase_01_plan', () => {
    const body = readDoc('Documentation/Completed/phase-01-pr-cycle-time-mvp.md')
    expect(body).toMatch(/FEAT-001-pr-cycle-time-mvp-implementation-plan\.md/)
  })

  it('docs_trackable_roadmap_links_plan', () => {
    const body = readDoc('Documentation/Roadmap/trackable-roadmap.md')
    expect(body).toMatch(/FEAT-001-pr-cycle-time-mvp-implementation-plan\.md/)
  })

  it('docs_readme_links_trackable_roadmap', () => {
    const body = readDoc('Documentation/README.md')
    expect(body).toMatch(/Roadmap\/trackable-roadmap\.md/)
  })

  it('docs_phase_01_completion_requires_acceptance_criteria', () => {
    const body = readDoc('Documentation/Completed/phase-01-pr-cycle-time-mvp.md')
    const after = body.split('## Acceptance criteria checklist')[1]
    expect(after, 'phase-01 must include acceptance criteria checklist heading').toBeDefined()
    const section = after!.split('## Mockup alignment')[0]!
    expect(section).not.toMatch(/- \[ \]/)
  })

  it('docs_record_mockup_alignment_status', () => {
    const body = readDoc('Documentation/Completed/phase-01-pr-cycle-time-mvp.md')
    expect(body).toMatch(/## Mockup alignment/)
  })
})

describe('phase 02 first review time spec', () => {
  const phase02 = 'Documentation/Completed/phase-02-first-review-time.md'

  it('docs_phase_02_defines_metric_locks', () => {
    const body = readDoc(phase02)
    expect(body).toMatch(/## Metric definition \(locked\)/)
    expect(body).toMatch(/Qualifying human review/)
    expect(body).toMatch(/PENDING.*DISMISSED|DISMISSED.*PENDING/)
    expect(body).toMatch(/No qualifying human review/)
  })

  it('docs_phase_02_links_feat_002_placeholder', () => {
    const body = readDoc(phase02)
    expect(body).toMatch(/FEAT-002/)
    expect(body).toMatch(/FEAT-001-pr-cycle-time-mvp-implementation-plan\.md/)
  })

  it('docs_phase_02_requires_verification_and_tests', () => {
    const body = readDoc(phase02)
    expect(body).toMatch(/## Verification and tests/)
    expect(body).toMatch(/verify:phase02/)
  })

  it('docs_phase_02_exception_gating_documented', () => {
    const body = readDoc(phase02)
    expect(body).toMatch(/merge_without_review/)
    expect(body).toMatch(/qualifying reviews \*\*not\*\* required/)
    expect(body).toMatch(/Cap at 3/)
  })

  it('docs_phase_02_links_locked_mockup', () => {
    const body = readDoc(phase02)
    expect(body).toMatch(/04-pr-cycle-time-and-first-review\.png/)
    expect(body).toMatch(/Review-latency exceptions/)
    expect(body).toMatch(/No-review Merges/)
  })

  it('docs_trackable_roadmap_links_phase_02', () => {
    const body = readDoc('Documentation/Roadmap/trackable-roadmap.md')
    expect(body).toMatch(/phase-02-first-review-time\.md/)
    expect(body).toMatch(/04-pr-cycle-time-and-first-review\.png/)
  })

  it('docs_fix005_roadmap_links_are_valid', () => {
    const body = readDoc('Documentation/Roadmap/trackable-roadmap.md')
    expect(body).toMatch(/FIX-005-stale-open-pr-exceptions\.md/)
    expect(body).toMatch(/stale-open-pr-exceptions-brief\.md/)
  })

  it('docs_fix005_brief_and_mockup_links_are_valid', () => {
    const readme = readDoc('Documentation/README.md')
    const brief = readDoc('Documentation/Backlog/stale-open-pr-exceptions-brief.md')
    const plan = readDoc('Documentation/Backlog/FIX-005-stale-open-pr-exceptions.md')

    expect(readme).toMatch(/FIX-005-stale-open-pr-exceptions\.md/)
    expect(readme).toMatch(/stale-open-pr-exceptions-brief\.md/)
    expect(brief).toMatch(/Status: Planned/)
    expect(brief).toMatch(/\.\.\/Assets\/mockups\/06-orphaned-prs-exceptions\.html/)
    expect(plan).toMatch(/stale-open-pr-exceptions-brief\.md/)
    expect(plan).toMatch(/\.\.\/Assets\/mockups\/06-orphaned-prs-exceptions\.html/)
    expectDocPath('Documentation/Backlog/FIX-005-stale-open-pr-exceptions.md')
    expectDocPath('Documentation/Backlog/stale-open-pr-exceptions-brief.md')
    expectDocPath('Documentation/Assets/mockups/06-orphaned-prs-exceptions.html')
  })
})

describe('one-page metric layout rule', () => {
  it('docs_define_one_page_scroll_layout_rule', () => {
    const roadmap = readDoc('Documentation/Roadmap/data-driven-decision-dashboard-roadmap.md')
    expect(roadmap).toMatch(/## One-Page Scroll Layout Rule/)
    expect(roadmap).toMatch(/single-page dashboard/)
    expect(roadmap).toMatch(/appending a new vertical section/)
    expect(roadmap).toMatch(/Do not crowd new metric cards into the first viewport/)
  })

  it('docs_current_mockup_links_phase_03_scroll_reference', () => {
    const readme = readDoc('Documentation/README.md')
    const trackable = readDoc('Documentation/Roadmap/trackable-roadmap.md')
    expect(readme).toMatch(/05-pr-cycle-time-first-review-and-pr-size\.png/)
    expect(trackable).toMatch(/05-pr-cycle-time-first-review-and-pr-size\.png/)
  })

  it('docs_phase_03_appends_pr_size_below_first_review', () => {
    const body = readDoc('Documentation/Completed/phase-03-pr-size.md')
    expect(body).toMatch(/PR Size.*section below the First Review Time section/s)
    expect(body).toMatch(/PR Cycle Time remains first/)
    expect(body).toMatch(/First Review Time remains second/)
    expect(body).toMatch(/PR Size is appended below First Review Time/)
  })
})
