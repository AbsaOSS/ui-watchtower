import { expect, openLab, press, sessionStarted, test } from './lab';

const PAGES = [
  'scenarios',
  'bi',
  'logging',
  'identity',
  'privacy',
  'lifecycle',
  'fragment',
  'web-fragment',
  'inspector',
  'wire',
  'settings'
];

test('a page lists what it sent beside its buttons, ticked once it arrives, and says so', async ({
  page
}) => {
  await openLab(page, 'bi');
  await sessionStarted(page);
  const results = page.locator('lab-results');
  await expect(results).toContainText('Nothing yet.');

  await press(page, 'Track a click');
  const sent = results.locator('li', { hasText: 'lab_button_clicked' });
  await expect(sent).toContainText('BI');
  await expect(sent).toContainText('✓ received', { timeout: 10_000 });
  await expect(results.getByRole('status')).toHaveText(
    'BI lab_button_clicked: received.'
  );

  // Beside the buttons, not below them.
  const button = (await page
    .getByRole('button', { name: 'Track a click' })
    .boundingBox())!;
  const column = (await results.boundingBox())!;
  expect(column.x).toBeGreaterThan(button.x + button.width);
  expect(column.y).toBeLessThan(button.y + button.height);
});

test('a narrower header folds its chips behind Run settings', async ({
  page
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await openLab(page, 'bi');
  const header = page.locator('.lab-header');
  const panel = header.locator('.lab-run-settings__panel');
  await expect(header.locator('.lab-chips')).toBeHidden();
  await expect(panel).toBeHidden();

  await header.getByText('Run settings').click();
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('broker: ok');
});

test('under 900px the nav folds behind a button naming the page', async ({
  page
}) => {
  await page.setViewportSize({ width: 800, height: 700 });
  await openLab(page, 'bi');
  const fold = page.getByRole('button', { name: /^Pages/ });
  const links = page.locator('.lab-nav').getByRole('link');
  await expect(fold).toContainText('BI events');
  await expect(links.first()).toBeHidden();

  await fold.click();
  await expect(fold).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(links.first()).toBeHidden();
  await expect(fold).toBeFocused();

  await fold.click();
  await page.locator('.lab-nav').getByRole('link', { name: 'Logging' }).click();
  await expect(page.locator('lab-root main h1')).toHaveText('Logging');
  await expect(links.first()).toBeHidden();
  await expect(fold).toContainText('Logging');
});

test('the status bar stays on one line, as label and value pairs', async ({
  page
}) => {
  await page.setViewportSize({ width: 800, height: 700 });
  await openLab(page, 'bi');
  const status = page.locator('.lab-status');
  for (const label of [
    'RUM events:',
    'from the library:',
    'batches:',
    'logs:',
    'session:',
    'user:'
  ]) {
    await expect(status).toContainText(label);
  }
  expect((await status.boundingBox())!.height).toBe(36);
});

test('at phone width, no page is wider than the screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of PAGES) {
    await openLab(page, path);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
      path
    ).toBeLessThanOrEqual(390);
  }
});
