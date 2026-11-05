import { readFile } from 'node:fs/promises';
import { expect, openLab, Page, press, test } from './lab';

/** Opens the lab's Event Inspector page, and the inspector in `dock`. */
async function openInspector(page: Page, dock = 'right'): Promise<void> {
  // Only the first time: a reload keeps what the inspector remembered.
  await page.addInitScript((d) => {
    const key = 'ngx-ui-watchtower.eventInspector';
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify({ dock: d }));
    }
  }, dock);
  await openLab(page, 'inspector');
  await page.locator('.lab-header-button').click();
  await expect(page.locator('uwt-inspector')).toBeVisible();
}

const section = (page: Page, title: string) =>
  page.locator('uwt-inspector-section').filter({ hasText: title });

test('pause holds new events back until Resume, and Clear empties it', async ({
  page
}) => {
  await openInspector(page);
  const inspector = page.locator('uwt-inspector');
  const bi = section(page, 'BI telemetry');

  await page
    .locator('cps-switch', { hasText: 'Pause live updates' })
    .locator('label.cps-switch')
    .click();
  await press(page, 'An unknown event type');
  await expect(inspector).toContainText('1 new event held back while paused.');
  await expect(bi).not.toContainText('com.example.custom');

  await press(page, 'Resume');
  await expect(bi).toContainText('com.example.custom');

  await page.getByRole('button', { name: 'Clear captured events' }).click();
  await expect(inspector).toContainText('Capturing from now.');
  await expect(bi).not.toContainText('com.example.custom');
});

test('search and field filters narrow a section, until cleared', async ({
  page
}) => {
  await openInspector(page);
  await press(page, 'One of each kind');
  await press(page, 'An unknown event type');
  const bi = section(page, 'BI telemetry');
  await expect(bi).toContainText('com.example.custom (unrecognised type)');

  const search = page.getByRole('textbox', {
    name: 'Search BI telemetry events'
  });
  await search.fill('each-kind');
  await expect(bi).not.toContainText('com.example.custom');
  await expect(bi).toContainText('lab_button_clicked');
  await search.fill('');
  await expect(bi).toContainText('com.example.custom');

  await page
    .getByRole('button', { name: 'Add a filter to BI telemetry' })
    .click();
  const builder = page.getByRole('group', {
    name: 'New filter for BI telemetry'
  });
  await builder.getByRole('combobox', { name: 'Field' }).click();
  await page.getByRole('option', { name: 'eventType', exact: true }).click();
  await builder.getByRole('textbox', { name: 'Value' }).fill('com.example');
  await builder.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(bi).not.toContainText('lab_button_clicked');
  await expect(bi).toContainText('com.example.custom');

  await page
    .getByRole('button', { name: 'Clear filters for BI telemetry' })
    .click();
  await expect(bi).toContainText('lab_button_clicked');
});

test('Download JSON saves a section as a versioned file', async ({ page }) => {
  await openInspector(page);
  await press(page, 'One of each kind');
  const bi = section(page, 'BI telemetry');
  await expect(bi).toContainText('lab_button_clicked');

  const download = page.waitForEvent('download');
  await bi
    .getByRole('button', { name: /^Download BI telemetry events as JSON/ })
    .click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(
    /^ngx-ui-watchtower-events-watchtower-lab-bi-\d{8}-\d{6}\.json$/
  );
  const exported = JSON.parse(await readFile(await file.path(), 'utf8'));
  expect(exported).toMatchObject({
    formatVersion: 1,
    section: 'bi',
    count: { captured: 1, droppedOldest: 0 }
  });
  expect(exported.events[0].payload.eventName).toBe('lab_button_clicked');
});

test('Copy JSON puts a section on the clipboard', async ({
  page,
  context,
  browserName
}) => {
  test.skip(
    browserName !== 'chromium',
    'Playwright grants clipboard access in Chromium only'
  );
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openInspector(page);
  await press(page, 'One of each kind');
  const bi = section(page, 'BI telemetry');
  await expect(bi).toContainText('lab_button_clicked');

  await bi
    .getByRole('button', { name: 'Copy BI telemetry events as JSON' })
    .click();
  await expect(bi).toContainText('Copied');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(JSON.parse(copied)).toMatchObject({
    section: 'bi',
    count: { captured: 1, droppedOldest: 0 }
  });
});

test('pages 25 rows at a time, and offers the newest when more arrive', async ({
  page
}) => {
  await openInspector(page);
  await press(page, 'A burst of 600 BI events');
  const bi = section(page, 'BI telemetry');
  await expect(bi.locator('tbody tr')).toHaveCount(25);

  await bi.getByRole('button', { name: /next page/i }).click();
  await press(page, 'An unknown event type');
  await expect(bi).toContainText('1 new on the first page.');
  await bi.getByRole('button', { name: 'Go to newest' }).click();
  await expect(bi.locator('tbody tr').first()).toContainText(
    'com.example.custom'
  );
});

test('the transparency slider makes the dialog see-through', async ({
  page
}) => {
  await openInspector(page, 'dialog');
  const dialog = page.locator('.cps-dialog');
  await page.getByRole('slider', { name: 'Transparency' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(() => dialog.evaluate((e) => getComputedStyle(e).opacity))
    .toBe('0.95');
});

test('a pane resizes by keyboard and by drag, and keeps its size', async ({
  page
}) => {
  await openInspector(page);
  const pane = page.locator('uwt-inspector-pane');
  const width = async () => Math.round((await pane.boundingBox())!.width);
  const start = await width();

  const edge = page.getByRole('separator', {
    name: 'Resize the Event Inspector'
  });
  await edge.focus();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(width).toBe(start + 32);

  const box = (await edge.boundingBox())!;
  const y = box.y + 200;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 100, y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(width).toBe(start + 132);

  await page.reload();
  await page.locator('.lab-header-button').click();
  await expect.poll(width).toBe(start + 132);
});

test('a blocked window falls back to the dialog, and says so once', async ({
  page
}) => {
  const warnings: string[] = [];
  page.on('console', (m) => m.type() === 'warning' && warnings.push(m.text()));
  await page.addInitScript(() => {
    window.open = () => null;
  });
  await openLab(page, 'inspector');

  await press(page, 'Separate window');
  await expect(page.locator('.cps-dialog uwt-inspector')).toBeVisible();
  expect(
    warnings.filter((w) => w.includes('blocked the Event Inspector window'))
  ).toHaveLength(1);
});

test('a mirrored error links back to its log event', async ({ page }) => {
  await openInspector(page);
  await press(page, 'One of each kind');
  const logging = section(page, 'Logging');
  await logging
    .locator('tbody tr', { hasText: 'error → RUM' })
    .getByRole('button', { name: 'Expand row' })
    .click();
  await expect(logging).toContainText(/Mirrored from\s*log event #\d+/);
});
