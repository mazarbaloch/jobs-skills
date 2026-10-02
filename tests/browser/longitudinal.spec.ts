import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { buildFixture } from '../fixture-build.mjs';
let root: string;
test.beforeAll(() => {
  root = buildFixture('browser').root;
});
test('one real snapshot has a dormant Trends page and an archive', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByLabel('Snapshot period')).toHaveValue('2026-Q4');
  await page.getByRole('navigation').getByRole('button', { name: 'Trends', exact: true }).click();
  await expect(
    page.getByText(
      'Trend analysis becomes available when at least two comparable snapshots have been collected.',
    ),
  ).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Research Archive', exact: true }).click();
  await page.getByRole('button', { name: 'View report', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Original Research Report' })).toBeVisible();
});
async function fixtureRoutes(page: import('@playwright/test').Page) {
  await page.route(/\/(data|research)\//, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const relative = path.slice(path.search(/\/(data|research)\//) + 1);
    const base = resolve(root, 'public'),
      file = resolve(base, relative);
    if (!file.startsWith(base + sep) || !existsSync(file)) {
      await route.fulfill({ status: 404, body: 'Missing fixture asset' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: file.endsWith('.json')
        ? 'application/json'
        : file.endsWith('.csv')
          ? 'text/csv'
          : 'text/plain',
      body: readFileSync(file),
    });
  });
}
test('second quarter is discovered, becomes latest, and activates trends without app changes', async ({
  page,
}) => {
  await fixtureRoutes(page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await expect(page.getByLabel('Snapshot period')).toHaveValue('2027-Q1');
  await expect(page.getByText('4 jobs selected', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Snapshot period').locator('option')).toHaveCount(2);
  await page.getByLabel('Region', { exact: true }).selectOption('Finland');
  await expect(page.getByText('2 jobs selected', { exact: true })).toBeVisible();
  await page.getByLabel('Snapshot period').selectOption('2026-Q4');
  await expect(page.getByText('2 jobs selected', { exact: true })).toBeVisible();
  await page.getByLabel('Region', { exact: true }).selectOption('Finland');
  await expect(page.getByText('1 jobs selected', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'Trends', exact: true }).click();
  await page.getByLabel('Trend competency').selectOption('AGT');
  await expect(
    page.locator('.trend-table').getByRole('button', { name: '1 / 2', exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('.trend-table').getByRole('button', { name: '1 / 4', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Trend competency').selectOption('SYNTH');
  await expect(
    page.getByText('This competency was not yet in the taxonomy for this snapshot.'),
  ).toBeVisible();
  await page.locator('.trend-table').getByRole('button', { name: '1 / 4', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Job records' })).toBeVisible();
  await expect(page.getByText('1 jobs selected', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Synthetic New Competency Engineer' })).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Data & Downloads', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download every snapshot as ZIP' }).click();
  expect(await (await download).failure()).toBeNull();
  await page.getByRole('navigation').getByRole('button', { name: 'Research Archive', exact: true }).click();
  await expect(page.getByRole('button', { name: 'View report', exact: true })).toHaveCount(2);
  expect(errors).toEqual([]);
});
test('production asset paths, reload and snapshot download paths respect repository base', async ({
  page,
  request,
}) => {
  const failures: string[] = [];
  page.on('response', (r) => {
    if (r.url().startsWith('http://127.0.0.1:4173') && r.status() >= 400) failures.push(r.url());
  });
  await page.goto('./');
  await expect(page.getByLabel('Snapshot period')).toBeVisible();
  await page.reload();
  await expect(page.getByText('87 jobs selected', { exact: true })).toBeVisible();
  const prefix = process.env.VITE_BASE_PATH || './';
  const scripts = await page
    .locator('script[src],link[rel=stylesheet]')
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('src') || n.getAttribute('href') || ''));
  if (prefix.startsWith('/')) expect(scripts.every((path) => path.startsWith(prefix))).toBe(true);
  const rootURL = new URL(page.url());
  const catalog = await request.get(
    new URL(`${prefix === './' ? '/' : prefix}data/catalog.json`, rootURL).href,
  );
  expect(catalog.ok()).toBe(true);
  for (const s of (await catalog.json()).snapshots)
    for (const path of [s.bundle_path, s.report_path, s.validation_path]) {
      const response = await request.get(new URL(`${prefix === './' ? '/' : prefix}${path}`, rootURL).href);
      expect(response.ok()).toBe(true);
    }
  expect(failures).toEqual([]);
});
