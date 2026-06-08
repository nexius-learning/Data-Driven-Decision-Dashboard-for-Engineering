import { expect, test } from '@playwright/test'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

import { createDb, runMigrations } from '~/db/client'
import {
  pullRequestReviewComments,
  pullRequestReviews,
  pullRequests,
  repositories,
  syncErrors,
  syncRuns,
} from '~/db/schema'

test.describe.configure({ mode: 'serial' })

const databaseUrl = process.env.DATABASE_URL?.trim()
const repoRoot = process.env.DASHBOARD_REPO_ROOT ?? path.join(process.cwd(), '.tmp/e2e-empty-repo-root')

test.beforeEach(async () => {
  await runMigrations(databaseUrl)
  const db = createDb(databaseUrl)
  try {
    await db.delete(syncErrors)
    await db.delete(syncRuns)
    await db.delete(pullRequestReviewComments)
    await db.delete(pullRequestReviews)
    await db.delete(pullRequests)
    await db.delete(repositories)

    const backendRepoId = randomUUID()
    const frontendRepoId = randomUUID()

    await db.insert(repositories).values([
      {
        id: backendRepoId,
        name: 'backend-api',
        path: path.join(repoRoot, 'backend-api'),
        rootPath: repoRoot,
        remoteUrl: 'https://github.com/gde-mit/backend-api.git',
        owner: 'gde-mit',
        repo: 'backend-api',
        remoteIdentity: 'github:gde-mit/backend-api',
        team: 'Backend',
        scanStatus: 'ready',
        active: true,
        lastScannedAt: new Date(),
        lastPrSyncedAt: new Date(),
      },
      {
        id: frontendRepoId,
        name: 'frontend-app',
        path: path.join(repoRoot, 'frontend-app'),
        rootPath: repoRoot,
        remoteUrl: 'https://github.com/gde-mit/frontend-app.git',
        owner: 'gde-mit',
        repo: 'frontend-app',
        remoteIdentity: 'github:gde-mit/frontend-app',
        team: 'Frontend',
        scanStatus: 'ready',
        active: true,
        lastScannedAt: new Date(),
        lastPrSyncedAt: new Date(),
      },
    ])

    await db.insert(syncRuns).values({
      id: randomUUID(),
      kind: 'collector_refresh',
      status: 'success',
      startedAt: new Date(),
      finishedAt: new Date(),
      message: 'e2e_seed',
      errorCount: 0,
    })

    const now = Date.now()
    const mergedAt = new Date(now - 7 * 24 * 60 * 60 * 1000)

    // Backend PRs: 24 h cycle time → median 24 h (1 day)
    await db.insert(pullRequests).values(
      [1, 2, 3].map((n) => ({
        repositoryId: backendRepoId,
        githubNodeId: `e2e-backend-${randomUUID()}`,
        number: n,
        title: `Backend PR ${n}`,
        state: 'merged',
        openedAt: new Date(mergedAt.getTime() - 24 * 60 * 60 * 1000),
        githubUpdatedAt: mergedAt,
        mergedAt,
        additions: 50,
        deletions: 10,
        changedFiles: 3,
        url: `https://github.com/gde-mit/backend-api/pull/${n}`,
      })),
    )

    // Frontend PRs: 96 h cycle time → median 96 h (4 days)
    await db.insert(pullRequests).values(
      [4, 5, 6].map((n) => ({
        repositoryId: frontendRepoId,
        githubNodeId: `e2e-frontend-${randomUUID()}`,
        number: n,
        title: `Frontend PR ${n}`,
        state: 'merged',
        openedAt: new Date(mergedAt.getTime() - 96 * 60 * 60 * 1000),
        githubUpdatedAt: mergedAt,
        mergedAt,
        additions: 120,
        deletions: 30,
        changedFiles: 6,
        url: `https://github.com/gde-mit/frontend-app/pull/${n}`,
      })),
    )
  } finally {
    await db.$client.end({ timeout: 5 })
  }
})

async function waitForHydration(page: import('@playwright/test').Page) {
  await page.waitForLoadState('networkidle')
}

test('team_filter_dropdown_is_visible_in_toolbar', async ({ page }) => {
  await page.goto('/')
  await waitForHydration(page)
  await expect(page.getByRole('combobox', { name: 'Filter by team' })).toBeVisible()
})

test('team_filter_selecting_team_updates_url_and_headline_metric', async ({ page }) => {
  await page.goto('/')
  await waitForHydration(page)

  await page.selectOption('select[aria-label="Filter by team"]', 'Backend')

  await expect(page).toHaveURL(/[?&]team=Backend/, { timeout: 10_000 })
  // Wait for the loader to re-run and re-render the filtered metric (Backend: 24h cycle time)
  await expect(page.getByTestId('median-pr-cycle-time')).toContainText('24h', { timeout: 10_000 })
})

test('team_filter_table_shows_only_active_team_when_selected', async ({ page }) => {
  await page.goto('/')
  await waitForHydration(page)
  await page.selectOption('select[aria-label="Filter by team"]', 'Backend')
  await expect(page).toHaveURL(/[?&]team=Backend/, { timeout: 10_000 })

  const table = page.getByRole('table', { name: /^Team breakdown$/ })
  await expect(table.getByRole('row', { name: /Backend/ })).toBeVisible()
  await expect(table.getByRole('row', { name: /Frontend/ })).not.toBeVisible()
})

test('team_filter_selected_team_row_is_highlighted', async ({ page }) => {
  await page.goto('/')
  await waitForHydration(page)
  await page.selectOption('select[aria-label="Filter by team"]', 'Backend')
  await expect(page).toHaveURL(/[?&]team=Backend/, { timeout: 10_000 })

  const highlighted = page.locator('tr.pr-dashboard__team-row--active')
  await expect(highlighted).not.toHaveCount(0)
  // All highlighted rows must be the selected team
  for (const row of await highlighted.all()) {
    await expect(row).toContainText('Backend')
  }
  // No Frontend row is highlighted
  await expect(page.locator('tr.pr-dashboard__team-row--active', { hasText: 'Frontend' })).toHaveCount(0)
})

test('team_filter_all_teams_restores_aggregate_and_removes_highlight', async ({ page }) => {
  await page.goto('/')
  await waitForHydration(page)

  // Filter to Backend, wait for data, then restore
  await page.selectOption('select[aria-label="Filter by team"]', 'Backend')
  await expect(page).toHaveURL(/[?&]team=Backend/, { timeout: 10_000 })
  await expect(page.getByTestId('median-pr-cycle-time')).toContainText('24h', { timeout: 10_000 })

  await page.selectOption('select[aria-label="Filter by team"]', '')
  await expect(page).not.toHaveURL(/[?&]team=/, { timeout: 10_000 })
  // Aggregate of Backend(24h×3) + Frontend(96h×3) = median 60h = 2.5 days
  await expect(page.getByTestId('median-pr-cycle-time')).toContainText('2.5 days', { timeout: 10_000 })

  await expect(page.locator('tr.pr-dashboard__team-row--active')).toHaveCount(0, { timeout: 5_000 })
})
