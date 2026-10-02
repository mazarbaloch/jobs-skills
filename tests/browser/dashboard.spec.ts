import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('filters, core/preferred, evidence drill-down and all sections', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await expect(page.getByLabel('Snapshot period')).toBeVisible();
  await page.screenshot({ path: 'test-results/overview-desktop.png' });
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(accessibility.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual(
    [],
  );
  await expect(page.getByText('87 jobs selected', { exact: true })).toBeVisible();
  await page.getByLabel('Region', { exact: true }).selectOption('Finland');
  await expect(page.getByText('31 jobs selected', { exact: true })).toBeVisible();
  await page.getByLabel('Role family', { exact: true }).selectOption('AI Engineering');
  await page.getByRole('button', { name: 'More filters' }).click();
  await page.getByLabel('Individual skill', { exact: true }).selectOption('AGT');
  await expect(page.getByText('9 jobs selected', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await page.getByRole('button', { name: 'Agentic AI', exact: true }).click();
  await page.getByRole('button', { name: /Agent capability in requirements/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByText('25 records', { exact: true })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'AI Developer – LLM Applications' }).click();
  await expect(page.getByRole('heading', { name: 'Exact core evidence' })).toBeVisible();
  await expect(page.getByText('turn7search0', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Close evidence' }).click();
  for (const name of [
    'Job titles',
    'Role explorer',
    'Role × skill',
    'Regions',
    'AI Engineering',
    'GenAI & LLMs',
    'Skill signals',
    'Skill combinations',
    'Seniority',
    'Job records',
    'Data & Downloads',
    'Data Quality',
    'Original Research Report',
    'Methodology & Limitations',
  ]) {
    await page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
  }
  expect(errors).toEqual([]);
});
test('zero results and preferred filters are meaningful', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'More filters' }).click();
  await page.getByLabel('Company', { exact: true }).selectOption('Norrin');
  await page.getByLabel('Individual skill', { exact: true }).selectOption('AGT');
  await page.getByLabel('Requirement type', { exact: true }).selectOption('preferred');
  await expect(page.getByText('1 jobs selected', { exact: true })).toBeVisible();
  await page.getByLabel('Region', { exact: true }).selectOption('USA');
  await expect(page.getByText('0 jobs selected', { exact: true })).toBeVisible();
  await expect(page.getByText('No matching evidence').first()).toBeVisible();
});
test('static downloads and browser ZIP work from production', async ({ page, request }) => {
  await page.goto('./');
  await page.getByRole('navigation').getByRole('button', { name: 'Data & Downloads', exact: true }).click();
  const links = await page
    .locator('a[download]')
    .evaluateAll((nodes) => nodes.map((n) => (n as HTMLAnchorElement).href));
  for (const url of links) {
    const response = await request.get(url);
    expect(response.status()).toBe(200);
    expect((await response.body()).length).toBeGreaterThan(0);
  }
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download all as ZIP' }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe('job-market-evidence.zip');
  expect(await file.failure()).toBeNull();
});
test('responsive layout and keyboard navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.screenshot({ path: 'test-results/overview-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'Job records', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Job records' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'AI/ML Engineer', exact: true }).first().focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});
