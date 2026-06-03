import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.join(__dirname, '../..')

function readDoc(rel: string): string {
  return readFileSync(path.join(root, rel), 'utf8')
}

describe('FEAT-003 documentation links', () => {
  it('docs_phase_03_links_feat_003', () => {
    const body = readDoc('Documentation/Completed/phase-03-pr-size.md')
    expect(body).toMatch(/FEAT-003-pr-size-implementation-plan\.md/)
    expect(body).toMatch(/Status: Implemented/)
  })

  it('docs_trackable_roadmap_links_feat_003', () => {
    const body = readDoc('Documentation/Roadmap/trackable-roadmap.md')
    const phase03Section = body.split('## Phase 03: PR Size')[1]?.split('## Phase 04')[0]
    expect(phase03Section, 'phase 03 section exists in trackable roadmap').toBeDefined()
    expect(phase03Section!).toMatch(/FEAT-003-pr-size-implementation-plan\.md/)
  })

  it('docs_readme_next_step_points_at_phase_04', () => {
    const body = readDoc('Documentation/README.md')
    const nextStep = body.split('## Next Step')[1]
    expect(nextStep, 'README contains Next Step section').toBeDefined()
    expect(nextStep!).toMatch(/phase-04-jira-flow-metrics\.md/)
    expect(nextStep!).toMatch(/FEAT-003-pr-size-implementation-plan\.md/)
  })
})
