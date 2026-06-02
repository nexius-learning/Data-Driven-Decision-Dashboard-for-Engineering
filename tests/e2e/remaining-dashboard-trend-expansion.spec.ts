import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import { expect, test, type Locator, type Page } from '@playwright/test'

import { createDb, runMigrations } from '~/db/client'
import {
  resetRemainingDashboardTrendExpansion,
  seedRemainingDashboardTrendExpansion,
  type RemainingDashboardTrendExpansionScenario,
} from './fixtures/remaining-dashboard-trend-expansion.fixture'

type Box = { x: number; y: number; width: number; height: number }
type Viewport = { name: 'desktop' | 'mobile'; width: number; height: number }

const databaseUrl = process.env.DATABASE_URL?.trim()
const repoRoot = process.env.DASHBOARD_REPO_ROOT ?? path.join(process.cwd(), '.tmp/e2e-empty-repo-root')
const screenshotDir = path.join(process.cwd(), 'test-results/fix004')
const viewports: Viewport[] = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]

function boxesOverlap(a: Box, b: Box): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  )
}

function expectInsideBounds(inner: Box, outer: Box): void {
  expect(inner.x).toBeGreaterThanOrEqual(outer.x)
  expect(inner.y).toBeGreaterThanOrEqual(outer.y)
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width)
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height)
}

async function requiredBox(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  return box!
}

async function assertSvgLabelsInsideBounds(svg: Locator): Promise<void> {
  const svgBox = await requiredBox(svg)
  const labels = svg.locator('text:visible')
  for (let index = 0; index < (await labels.count()); index += 1) {
    const label = labels.nth(index)
    const labelBox = await requiredBox(label)
    const message = `SVG label "${await label.textContent()}" remains inside SVG bounds`
    expect.soft(labelBox.x, message).toBeGreaterThanOrEqual(svgBox.x)
    expect.soft(labelBox.y, message).toBeGreaterThanOrEqual(svgBox.y)
    expect.soft(labelBox.x + labelBox.width, message).toBeLessThanOrEqual(svgBox.x + svgBox.width)
    expect.soft(labelBox.y + labelBox.height, message).toBeLessThanOrEqual(svgBox.y + svgBox.height)
  }
}

async function assertAdjacentXAxisLabelsDoNotOverlap(svg: Locator): Promise<void> {
  const labels = svg.locator('text[y="208"]:visible')
  expect(await labels.count()).toBeGreaterThan(1)
  for (let index = 1; index < (await labels.count()); index += 1) {
    const previous = await requiredBox(labels.nth(index - 1))
    const current = await requiredBox(labels.nth(index))
    expect.soft(boxesOverlap(previous, current), `x-axis labels ${index - 1} and ${index} do not overlap`).toBe(false)
  }
}

async function assertConfidenceDoesNotOverlapChartOrTable(page: Page): Promise<void> {
  const confidence = page.getByTestId('pr-size-trend-confidence')
  await expect(confidence).toBeVisible()
  const confidenceBox = await requiredBox(confidence)
  expect(boxesOverlap(confidenceBox, await requiredBox(page.getByTestId('pr-size-trend').locator('svg')))).toBe(false)
  expect(boxesOverlap(confidenceBox, await requiredBox(page.getByTestId('pr-size-team-table')))).toBe(false)
}

async function assertPrSizeComparisonPresentation(page: Page, svg: Locator): Promise<void> {
  await expect(page.getByRole('heading', { level: 3, name: '16-week PR Size comparison trend' })).toBeVisible()
  await expect(svg.getByTestId('comparison-boundary-divider')).toBeAttached()
  await expect(svg.getByTestId('comparison-label-previous')).toHaveText('Previous')
  await expect(svg.getByTestId('comparison-label-current')).toHaveText('Latest')
  expect(
    boxesOverlap(
      await requiredBox(svg.getByTestId('comparison-label-previous')),
      await requiredBox(svg.getByTestId('comparison-label-current')),
    ),
  ).toBe(false)
}

async function assertDetachedLayoutInsideSvg(svg: Locator, overflow: boolean): Promise<void> {
  const detached = svg.locator('.pr-dashboard__chart-point--detached')
  await expect(detached).toBeVisible()
  await expect(detached).toHaveAttribute('data-detached-overflow', String(overflow))

  const viewBox = (await svg.getAttribute('viewBox'))!.split(' ').map(Number)
  const svgBounds = { x: viewBox[0]!, y: viewBox[1]!, width: viewBox[2]!, height: viewBox[3]! }
  for (const attribute of ['data-layout-marker-bounds', 'data-layout-label-bounds'] as const) {
    const values = (await detached.getAttribute(attribute))!.split(',').map(Number)
    expectInsideBounds({ x: values[0]!, y: values[1]!, width: values[2]!, height: values[3]! }, svgBounds)
  }
}

async function seedScenario(scenario: RemainingDashboardTrendExpansionScenario): Promise<void> {
  const db = createDb(databaseUrl)
  try {
    await resetRemainingDashboardTrendExpansion(db)
    await seedRemainingDashboardTrendExpansion(db, { repoRoot, scenario, now: new Date() })
  } finally {
    await db.$client.end({ timeout: 5 })
  }
}

async function captureScreenshot(page: Page, scenario: RemainingDashboardTrendExpansionScenario, viewport: Viewport): Promise<void> {
  await page.screenshot({
    fullPage: true,
    path: path.join(screenshotDir, `${scenario}-${viewport.name}.png`),
  })
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  await runMigrations(databaseUrl)
  await mkdir(screenshotDir, { recursive: true })
})

test('first_review_comparison_responsive_layout', async ({ page }) => {
  await seedScenario('first-review-comparison')
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await page.goto('/')

    const svg = page.getByTestId('first-review-trend').locator('svg')
    await expect(svg).toBeVisible()
    await captureScreenshot(page, 'first-review-comparison', viewport)
    await assertSvgLabelsInsideBounds(svg)
    await assertAdjacentXAxisLabelsDoNotOverlap(svg)
    expect(
      boxesOverlap(
        await requiredBox(svg.getByTestId('comparison-label-previous')),
        await requiredBox(svg.getByTestId('comparison-label-current')),
      ),
    ).toBe(false)
  }
})

test('pr_size_completed_only_responsive_layout', async ({ page }) => {
  await seedScenario('pr-size-completed-only')
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await page.goto('/')

    const svg = page.getByTestId('pr-size-trend').locator('svg')
    await expect(svg).toBeVisible()
    await captureScreenshot(page, 'pr-size-completed-only', viewport)
    await assertSvgLabelsInsideBounds(svg)
    await assertAdjacentXAxisLabelsDoNotOverlap(svg)
    await assertPrSizeComparisonPresentation(page, svg)
    await expect(svg.locator('.pr-dashboard__chart-point--detached')).toHaveCount(0)
    await assertConfidenceDoesNotOverlapChartOrTable(page)
  }
})

test('pr_size_detached_partial_responsive_layout', async ({ page }) => {
  await seedScenario('pr-size-detached-partial')
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await page.goto('/')

    const svg = page.getByTestId('pr-size-trend').locator('svg')
    await expect(svg).toBeVisible()
    await captureScreenshot(page, 'pr-size-detached-partial', viewport)
    await assertSvgLabelsInsideBounds(svg)
    await assertAdjacentXAxisLabelsDoNotOverlap(svg)
    await assertPrSizeComparisonPresentation(page, svg)
    await assertDetachedLayoutInsideSvg(svg, false)
    await assertConfidenceDoesNotOverlapChartOrTable(page)
  }
})

test('pr_size_detached_overflow_responsive_layout', async ({ page }) => {
  await seedScenario('pr-size-detached-overflow')
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await page.goto('/')

    const svg = page.getByTestId('pr-size-trend').locator('svg')
    await expect(svg).toBeVisible()
    await captureScreenshot(page, 'pr-size-detached-overflow', viewport)
    await assertSvgLabelsInsideBounds(svg)
    await assertAdjacentXAxisLabelsDoNotOverlap(svg)
    await assertPrSizeComparisonPresentation(page, svg)
    await assertDetachedLayoutInsideSvg(svg, true)
    await assertConfidenceDoesNotOverlapChartOrTable(page)
  }
})
