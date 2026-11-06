import { readFile } from 'node:fs/promises';
import { expect, openLab, Page, press, showKind, test } from './lab';

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

const timeline = (page: Page) => page.locator('uwt-inspector-timeline');
/** The timeline's rows, without an open row's detail. */
const rows = (page: Page) =>
  timeline(page).locator('tbody tr:not(.cps-table-row-expanded-content)');

/** Opens the Export menu and chooses one of its items. */
async function exportAs(
  page: Page,
  item: 'Copy JSON' | 'Download JSON'
): Promise<void> {
  await timeline(page).getByRole('button', { name: 'Export' }).click();
  await page.getByRole('menuitem', { name: new RegExp(`^${item}`) }).click();
  // cps-menu ignores the button while it is still closing.
  await expect(page.getByRole('menu')).toBeHidden();
}

test('pause holds new events back until Resume, and Clear empties it', async ({
  page
}) => {
  await openInspector(page);
  const inspector = page.locator('uwt-inspector');
  const events = timeline(page);

  await page
    .locator('cps-switch', { hasText: 'Pause live updates' })
    .locator('label.cps-switch')
    .click();
  await press(page, 'An unknown event type');
  await expect(inspector).toContainText('1 new event held back while paused.');
  await expect(events).not.toContainText('com.example.custom');

  await press(page, 'Resume');
  await expect(events).toContainText('com.example.custom');

  await page.getByRole('button', { name: 'Clear captured events' }).click();
  await expect(inspector).toContainText('Capturing from now.');
  await expect(events).not.toContainText('com.example.custom');
});

test('one search and set of filters narrow every kind, until cleared; the kind toggle narrows to one', async ({
  page
}) => {
  await openInspector(page);
  await press(page, 'One of each kind');
  await press(page, 'An unknown event type');
  const events = timeline(page);
  await expect(events).toContainText('com.example.custom');
  await expect(events).toContainText('lab-happy-path');

  const search = page.getByRole('textbox', { name: 'Search events' });
  await search.fill('each-kind');
  await expect(events).not.toContainText('com.example.custom');
  await expect(events).toContainText('lab_button_clicked');
  await search.fill('');
  await expect(events).toContainText('com.example.custom');

  await page.getByRole('button', { name: 'Add filter' }).click();
  const builder = page.getByRole('group', { name: 'New filter' });
  await builder.getByRole('combobox', { name: 'Field' }).click();
  await page.getByRole('option', { name: 'eventType', exact: true }).click();
  await builder.getByRole('textbox', { name: 'Value' }).fill('com.example');
  await builder.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(events).not.toContainText('lab_button_clicked');
  await expect(events).not.toContainText('lab-happy-path');
  await expect(events).toContainText('com.example.custom');

  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(events).toContainText('lab_button_clicked');

  await showKind(page, 'Scenarios');
  await expect(rows(page)).toHaveCount(1);
  await expect(events).toContainText('lab-happy-path');
  await showKind(page, 'All');
  await expect(events).toContainText('lab_button_clicked');
});

test('Export saves every kind, or the kind shown, as a versioned file', async ({
  page
}) => {
  await openInspector(page);
  await press(page, 'One of each kind');
  await expect(timeline(page)).toContainText('lab_button_clicked');

  let download = page.waitForEvent('download');
  await exportAs(page, 'Download JSON');
  let file = await download;
  expect(file.suggestedFilename()).toMatch(
    /^ngx-ui-watchtower-events-watchtower-lab-all-\d{8}-\d{6}\.json$/
  );
  const all = JSON.parse(await readFile(await file.path(), 'utf8'));
  expect(all).toMatchObject({ formatVersion: 2, section: 'all' });
  expect(all.count.captured).toBeGreaterThan(1);

  await showKind(page, 'BI');
  download = page.waitForEvent('download');
  await exportAs(page, 'Download JSON');
  file = await download;
  expect(file.suggestedFilename()).toContain('-bi-');
  const bi = JSON.parse(await readFile(await file.path(), 'utf8'));
  expect(bi).toMatchObject({
    formatVersion: 2,
    section: 'bi',
    count: { captured: 1, droppedOldest: 0 }
  });
  expect(bi.events[0].payload.eventName).toBe('lab_button_clicked');
});

test('Copy JSON puts the kind shown on the clipboard', async ({
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
  await expect(timeline(page)).toContainText('lab_button_clicked');

  await showKind(page, 'BI');
  await exportAs(page, 'Copy JSON');
  await expect(
    timeline(page).getByRole('button', { name: 'Copied' })
  ).toBeVisible();
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
  const events = timeline(page);
  await expect(rows(page)).toHaveCount(25);

  await events.getByRole('button', { name: /next page/i }).click();
  // Once the burst is no longer new, so only the next event counts.
  await expect(events).not.toContainText('new at the top', { timeout: 5000 });
  await press(page, 'An unknown event type');
  await expect(events).toContainText('1 new at the top of the list.');
  await events.getByRole('button', { name: 'Go to newest' }).click();
  await expect(rows(page).first()).toContainText('com.example.custom');
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
  await rows(page)
    .filter({ hasText: '→ RUM' })
    .getByRole('button', { name: 'Expand row' })
    .click();
  await expect(timeline(page)).toContainText(/Mirrored from\s*log event #\d+/);
});
