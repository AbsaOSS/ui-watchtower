import { expect, Locator, openLab, press, sessionStarted, test } from './lab';

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

test('an error is ticked once it arrives, not for an earlier one with the same message', async ({
  page
}) => {
  await openLab(page, 'logging');
  await sessionStarted(page);
  const error = page.locator('lab-results li', {
    hasText: 'Connection reset'
  });
  await press(page, 'error, with an Error');
  await expect(error).toContainText('✓ received', { timeout: 10_000 });

  // Now nothing leaves the page, so the same error is sent, never received.
  await openLab(page, 'logging?destination=noop');
  await press(page, 'error, with an Error');
  await expect(error).toContainText('sent');
  await page.waitForTimeout(3000);
  await expect(error).not.toContainText('✓ received');
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

test('Escape folds the nav without taking focus from a field elsewhere', async ({
  page
}) => {
  await page.setViewportSize({ width: 800, height: 700 });
  await openLab(page, 'logging');
  await page.getByRole('button', { name: /^Pages/ }).click();
  const field = page.locator('lab-logging-page textarea').first();
  await field.focus();

  await page.keyboard.press('Escape');
  await expect(page.locator('.lab-nav').getByRole('link').first()).toBeHidden();
  await expect(field).toBeFocused();
});

test('on the narrowest phone, the header and Run settings stay on the screen', async ({
  page,
  backend
}) => {
  await backend.setTelemetries([
    'errors',
    'performance',
    'interaction',
    'http'
  ]);
  await page.setViewportSize({ width: 320, height: 700 });
  await openLab(page, 'bi');
  const right = async (locator: Locator) => {
    const box = (await locator.boundingBox())!;
    return box.x + box.width;
  };

  expect(await right(page.locator('.lab-header-button'))).toBeLessThanOrEqual(
    320
  );
  await page.locator('.lab-run-settings > summary').click();
  expect(
    await right(page.locator('.lab-run-settings__panel'))
  ).toBeLessThanOrEqual(320);
});

test('with the custom destination, what the page sent is ticked once its sink has it', async ({
  page
}) => {
  await openLab(page, 'bi?destination=custom');
  await press(page, 'Track a click');
  await expect(
    page.locator('lab-results li', { hasText: 'lab_button_clicked' })
  ).toContainText('✓ received', { timeout: 10_000 });
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
  await sessionStarted(page);
  // Every pair on the one line, and inside the bar: the ids give way first.
  const bar = (await status.boundingBox())!;
  const pairs = await status
    .locator('span')
    .evaluateAll((spans) =>
      spans.map((s) => s.getBoundingClientRect()).map((r) => [r.top, r.right])
    );
  for (const [top, right] of pairs) {
    expect(top).toBeCloseTo(pairs[0][0], 0);
    expect(right).toBeLessThanOrEqual(bar.x + bar.width + 0.5);
  }
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
