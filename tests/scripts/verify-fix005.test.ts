import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.join(__dirname, '../..')

function readPkg(): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
}

describe('verify:fix005 wiring', () => {
  it('verify_fix005_script_exists', () => {
    const pkg = readPkg()
    const scripts = pkg.scripts as Record<string, string>
    const verify = scripts['verify:fix005']

    expect(verify).toBeDefined()
    expect(verify).toContain('git diff --check')
    expect(verify).toContain('npm run lint')
    expect(verify).toContain('npm run typecheck')
    expect(verify).toContain(
      'npm run test -- tests/metrics/pr-cycle-time-dashboard.test.ts tests/components/pr-cycle-time-dashboard.test.tsx',
    )
    expect(verify).toContain('npm run test:e2e -- tests/e2e/stale-open-pr-exceptions.spec.ts')
    expect(verify).toContain('npm run verify:phase01')
    expect(verify).toContain('npm run verify:phase02')
    expect(verify).toContain('npm run verify:phase03')
  })
})
