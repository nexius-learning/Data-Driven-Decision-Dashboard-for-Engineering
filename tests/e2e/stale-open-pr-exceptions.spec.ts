import path from 'node:path'

import { expect, test, type Locator, type Page } from '@playwright/test'

import { createDb, runMigrations } from '~/db/client'
import {
  pullRequestReviewComments,
  pullRequestReviews,
  pullRequests,
  repositories,
  syncErrors,
  syncRuns,
} from '~/db/schema'

const databaseUrl = process.env.DATABASE_URL?.trim()
const repoRoot = process.env.DASHBOARD_REPO_ROOT ?? path.join(process.cwd(), '.tmp/e2e-empty-repo-root')
const alphaRepoId = '11111111-1111-4111-8111-111111111111'

function hoursAgo(now: Date, hours: number): Date {
  return new Date(now.getTime() - hours * 3600000)
}

function exceptionsCard(page: Page): Locator {
  return page.locator('section', {
    has: page.getByRole('heading', { level: 2, name: 'PR cycle time exceptions' }),
  })
}

async function resetStaleOpenPrFixture(): Promise<void> {
  const db = createDb(databaseUrl)
  try {
    await db.delete(syncErrors)
    await db.delete(syncRuns)
    await db.delete(pullRequestReviewComments)
    await db.delete(pullRequestReviews)
    await db.delete(pullRequests)
    await db.delete(repositories)
  } finally {
    await db.$client.end({ timeout: 5 })
  }
}

async function seedStaleOpenPrFixture(options: { staleCount: number }): Promise<void> {
  const now = new Date()
  const db = createDb(databaseUrl)
  try {
    await resetStaleOpenPrFixture()
    await db.insert(repositories).values({
      id: alphaRepoId,
      name: 'alpha-svc',
      path: path.join(repoRoot, 'alpha-svc'),
      rootPath: repoRoot,
      remoteUrl: 'https://github.com/gde-mit/alpha-svc.git',
      owner: 'gde-mit',
      repo: 'alpha-svc',
      team: 'Alpha',
      scanStatus: 'ready',
      active: true,
      lastPrSyncedAt: now,
    })
    await db.insert(syncRuns).values({
      kind: 'collector_refresh',
      status: 'success',
      startedAt: hoursAgo(now, 1),
      finishedAt: now,
      message: 'fix005-e2e-seed',
      errorCount: 0,
    })
    await db.insert(pullRequests).values([
      {
        repositoryId: alphaRepoId,
        githubNodeId: 'fix005-merged-current',
        number: 1,
        title: 'PROJ-1 establishes Alpha median',
        state: 'merged',
        openedAt: hoursAgo(now, 24 * 8),
        githubUpdatedAt: hoursAgo(now, 24 * 7),
        mergedAt: hoursAgo(now, 24 * 7),
        url: 'https://github.com/gde-mit/alpha-svc/pull/1',
        missingJiraKey: false,
      },
      ...Array.from({ length: options.staleCount }, (_, index) => {
        const number = 10 + index
        return {
          repositoryId: alphaRepoId,
          githubNodeId: `fix005-open-${number}`,
          number,
          title: `PROJ-${number} stale open PR`,
          state: 'open',
          openedAt: hoursAgo(now, 120 + index * 12),
          githubUpdatedAt: now,
          mergedAt: null,
          url: `https://github.com/gde-mit/alpha-svc/pull/${number}`,
          missingJiraKey: false,
        }
      }),
      {
        repositoryId: alphaRepoId,
        githubNodeId: 'fix005-open-threshold',
        number: 99,
        title: 'PROJ-99 below threshold',
        state: 'open',
        openedAt: hoursAgo(now, 48),
        githubUpdatedAt: now,
        mergedAt: null,
        url: 'https://github.com/gde-mit/alpha-svc/pull/99',
        missingJiraKey: false,
      },
    ])
  } finally {
    await db.$client.end({ timeout: 5 })
  }
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  await runMigrations(databaseUrl)
})

test.afterAll(async () => {
  await resetStaleOpenPrFixture()
})

test('all_teams_shows_three_stale_open_pr_details', async ({ page }) => {
  await seedStaleOpenPrFixture({ staleCount: 4 })
  await page.goto('/')

  const card = exceptionsCard(page)
  await expect(card.getByText('Alpha stale open PRs')).toBeVisible()
  await expect(card.getByText('4 PRs older than 72h')).toBeVisible()
  await expect(card.locator('.pr-dashboard__stale-pr-row')).toHaveCount(3)
  await expect(card.getByRole('link', { name: /#13 PROJ-13 stale open PR/ })).toBeVisible()
  await expect(card.getByText('PROJ-99 exactly at threshold')).toHaveCount(0)
  await expect(page.getByRole('columnheader', { name: 'Longest Open PR' })).toBeVisible()
})

test('all_teams_stale_open_pr_details_remain_compact', async ({ page }) => {
  await seedStaleOpenPrFixture({ staleCount: 4 })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/')

  const rows = exceptionsCard(page).locator('.pr-dashboard__stale-pr-details')
  await expect(rows.locator('.pr-dashboard__stale-pr-row')).toHaveCount(3)
  const box = await rows.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.height).toBeLessThan(200)
})
