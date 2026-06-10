import { expect, test } from '@playwright/test'
import path from 'node:path'

import { createDb, runMigrations } from '~/db/client'
import {
  expectedCompletedLowSampleConfidenceCopy,
  resetPhase03,
  seedPhase03,
} from './fixtures/phase-03-size.fixture'

type Box = { x: number; y: number; width: number; height: number }

function boxesOverlap(a: Box, b: Box): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  )
}

async function seedLowSampleConfidenceScenario(repoRoot: string): Promise<void> {
  const db = createDb(databaseUrl)
  try {
    await resetPhase03(db)
    await seedPhase03(db, { repoRoot, scenario: 'low-sample-confidence' })
  } finally {
    await db.$client.end({ timeout: 5 })
  }
}

test.describe.configure({ mode: 'serial' })

const databaseUrl = process.env.DATABASE_URL?.trim()
const repoRoot = process.env.DASHBOARD_REPO_ROOT ?? path.join(process.cwd(), '.tmp/e2e-empty-repo-root')

test.beforeEach(async () => {
  await runMigrations(databaseUrl)
  const db = createDb(databaseUrl)
  try {
    await resetPhase03(db)
    await seedPhase03(db, { repoRoot, scenario: 'with-exceptions' })
  } finally {
    await db.$client.end({ timeout: 5 })
  }
})

test('phase03_pr_size_section_visible_when_data_exists @phase03', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('phase03-section')).toBeVisible({ timeout: 5000 })
})

test('phase03_pr_size_section_hidden_when_no_data @phase03', async ({ page }) => {
  const db = createDb(databaseUrl)
  try {
    await resetPhase03(db)
    await seedPhase03(db, { repoRoot, scenario: 'no-size-data' })
  } finally {
    await db.$client.end({ timeout: 5 })
  }
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Engineering Decision Dashboard' })).toBeVisible()
  await expect(page.getByTestId('phase03-section')).not.toBeVisible()
})

test('phase03_pr_size_card_shows_median @phase03', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('pr-size-card')).toBeVisible({ timeout: 5000 })
  // Median of [20, 20, 71, 71, 150, 300] = (71+71)/2 = 71
  await expect(page.getByTestId('median-pr-size')).toContainText('71 lines')
})

test('phase03_team_table_renders @phase03', async ({ page }) => {
  await page.goto('/')
  const prSizeTable = page.getByTestId('pr-size-team-table')
  await expect(prSizeTable).toBeVisible({ timeout: 5000 })
  await expect(prSizeTable.getByRole('cell', { name: 'TeamAlpha' })).toBeVisible()
})

test('phase03_exceptions_panel_shows_empty_state_when_no_exceptions @phase03', async ({ page }) => {
  const db = createDb(databaseUrl)
  try {
    await resetPhase03(db)
    await seedPhase03(db, { repoRoot, scenario: 'no-exceptions' })
  } finally {
    await db.$client.end({ timeout: 5 })
  }
  await page.goto('/')
  await expect(page.getByTestId('phase03-section')).toBeVisible({ timeout: 5000 })
  await expect(page.getByTestId('pr-size-exceptions')).toBeVisible()
  await expect(page.getByText('No oversized PR patterns in this range')).toBeVisible()
})

test('phase03_phase01_still_visible @phase03', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Median PR Cycle Time' })).toBeVisible()
  await expect(page.getByTestId('phase03-section')).toBeVisible({ timeout: 5000 })
})

test('phase03_phase02_still_visible @phase03', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('phase02-section')).toBeVisible({ timeout: 5000 })
  await expect(page.getByTestId('phase03-section')).toBeVisible({ timeout: 5000 })
})

test('phase03_pr_size_trend_shows_completed_low_sample_confidence_note @phase03', async ({
  page,
}) => {
  await seedLowSampleConfidenceScenario(repoRoot)
  await page.goto('/')

  await expect(page.getByTestId('phase03-section')).toBeVisible({ timeout: 5000 })
  const confidence = page.getByTestId('pr-size-trend-confidence')
  await expect(confidence).toBeVisible()
  await expect(confidence).toHaveText(expectedCompletedLowSampleConfidenceCopy())
  await expect(confidence).toHaveClass(/pr-dashboard__chart-confidence--low-sample/)
  await expect(confidence).not.toHaveAttribute('role', 'alert')
})

test('phase03_pr_size_confidence_layout_preserves_dashboard_order @phase03', async ({ page }) => {
  await seedLowSampleConfidenceScenario(repoRoot)

  const viewports = [
    { width: 375, height: 800 },
    { width: 1280, height: 900 },
  ] as const

  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await page.goto('/')

    const cycleTime = page.getByRole('heading', { name: 'Median PR Cycle Time' })
    const firstReview = page.getByRole('heading', { name: 'First Review Time', exact: true })
    const prSize = page.getByRole('heading', { name: 'PR Size', exact: true })

    await expect(cycleTime).toBeVisible({ timeout: 5000 })
    await expect(firstReview).toBeVisible()
    await expect(prSize).toBeVisible()
    await expect(page.getByTestId('phase03-section')).toBeVisible()

    const cycleBox = await cycleTime.boundingBox()
    const firstReviewBox = await firstReview.boundingBox()
    const prSizeBox = await prSize.boundingBox()
    expect(cycleBox).not.toBeNull()
    expect(firstReviewBox).not.toBeNull()
    expect(prSizeBox).not.toBeNull()
    expect(cycleBox!.y).toBeLessThan(firstReviewBox!.y)
    expect(firstReviewBox!.y).toBeLessThan(prSizeBox!.y)

    const confidence = page.getByTestId('pr-size-trend-confidence')
    await expect(confidence).toBeVisible()
    const confidenceBox = await confidence.boundingBox()
    const chartBox = await page.getByTestId('pr-size-trend').locator('svg').boundingBox()
    const tableBox = await page.getByTestId('pr-size-team-table').boundingBox()
    expect(confidenceBox).not.toBeNull()
    expect(chartBox).not.toBeNull()
    expect(tableBox).not.toBeNull()
    expect(boxesOverlap(confidenceBox!, chartBox!)).toBe(false)
    expect(boxesOverlap(confidenceBox!, tableBox!)).toBe(false)
  }
})
