import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.join(__dirname, '../..')
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8')

describe('FEAT-003 finalization docs', () => {
  it('docs_phase_03_checklist_updated', () => {
    const body = read('Documentation/Completed/phase-03-pr-size.md')
    const section = body.split('## Acceptance criteria checklist')[1]?.split('##')[0] ?? ''
    expect(section).not.toMatch(/- \[ \]/)
    expect(section).toMatch(/- \[x\]/)
    expect(section).toMatch(/verify:phase03/)
  })

  it('docs_trackable_roadmap_marks_phase_03_implemented', () => {
    const body = read('Documentation/Roadmap/trackable-roadmap.md')
    expect(body).toMatch(/Phase 03: PR Size \(Implemented\)/)
    const phase03Section = body.split('## Phase 03: PR Size')[1]?.split('## FIX-004')[0]
    expect(phase03Section, 'phase 03 section exists in trackable roadmap').toBeDefined()
    expect(phase03Section!).not.toMatch(/- \[ \]/)
  })

  it('docs_readme_next_step_post_phase_03_updated', () => {
    const body = read('Documentation/README.md')
    const nextStep = body.split('## Next Step')[1] ?? ''
    expect(nextStep).toMatch(/Phase 03 \(PR Size\) is implemented/)
    expect(nextStep).toMatch(/Phase 04/)
    expect(nextStep).toMatch(/FEAT-003-pr-size-implementation-plan\.md/)
  })

  it('docs_feat_003_task_10_1_complete', () => {
    const body = read('Documentation/Completed/FEAT-003-pr-size-implementation-plan.md')
    expect(body).toMatch(/\*\*Status\*\*: Done/)
    expect(body).toMatch(/#### Task 10\.1 — Final verification & documentation update\n- \[x\]/)
  })
})
