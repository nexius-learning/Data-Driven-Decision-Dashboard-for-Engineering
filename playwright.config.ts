import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'
import { loadEnv } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, '.')
const DEFAULT_TEST_DATABASE_URL = 'postgresql://dddd:dddd_local_dev@127.0.0.1:54332/dddd_test'

const fromFiles = loadEnv(process.env.NODE_ENV ?? 'development', repoRoot, '')
delete process.env.NO_COLOR
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? fromFiles.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL
if (!process.env.DATABASE_URL?.trim()) {
  process.env.DATABASE_URL = DEFAULT_TEST_DATABASE_URL
}
process.env.DASHBOARD_REPO_ROOT ??= path.join(repoRoot, '.tmp/e2e-empty-repo-root')
process.env.TEAM_MAPPING_PATH ??= path.join(repoRoot, 'config/team-mapping.example.json')

const testIgnore = ['**/live-github-sync.spec.ts', '**/live-current-server.spec.ts', '**/*.fixture.test.ts']

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  webServer: {
    command: 'DASHBOARD_E2E_PORT=3100 bash scripts/e2e-web-server.sh',
    cwd: repoRoot,
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://127.0.0.1:3100',
        trace: 'on-first-retry',
      },
    },
  ],
})
