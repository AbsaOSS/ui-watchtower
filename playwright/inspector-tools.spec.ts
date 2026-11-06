import { readFile } from 'node:fs/promises';
import { expect, Locator, openLab, Page, press, showKind, test } from './lab';

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
  await expect(inspector).toContainText('Use the app to generate events');
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
  await page.getByRole('option', { name: /^Event type/ }).click();
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

test('a mirrored error links to its log event, which links back', async ({
  page
}) => {
  await openInspector(page);
  await press(page, 'One of each kind');
  await rows(page)
    .filter({ hasText: '→ RUM' })
    .getByRole('button', { name: 'Expand row' })
    .click();
  const link = timeline(page).getByRole('button', {
    name: /^log event #\d+$/
  });
  const log = (await link.textContent())!.match(/\d+/)![0];

  await link.click();
  await expect(
    page.getByRole('region', { name: `Payload of event #${log}` })
  ).toBeFocused();
  await expect(timeline(page)).toContainText(/Mirrored to RUM as\s*event #\d+/);
});

test('an open row filters by its own values; the builder names fields, finds them by path, explains itself and closes on Add', async ({
  page
}) => {
  await openInspector(page);
  await press(page, 'One of each kind');
  const events = timeline(page);
  await rows(page)
    .filter({ hasText: 'lab_button_clicked' })
    .getByRole('button', { name: 'Expand row' })
    .click();
  await page
    .getByRole('group', { name: 'Filter by' })
    .getByRole('button', { name: 'Event name: lab_button_clicked' })
    .click();
  await expect(
    page.getByRole('button', {
      name: 'Remove filter eventName equals "lab_button_clicked"'
    })
  ).toBeVisible();
  await expect(events).not.toContainText('lab-happy-path');
  await page.getByRole('button', { name: 'Clear filters' }).click();

  await page.getByRole('button', { name: 'Add filter' }).click();
  const builder = page.getByRole('group', { name: 'New filter' });
  await builder.getByRole('combobox', { name: 'Field' }).click();
  await page.keyboard.type('scenarioName');
  // Found by its path, shown by its name.
  await page.getByRole('option', { name: /^Scenario/ }).click();
  await builder.getByRole('textbox', { name: 'Value' }).fill('happy');

  await page.getByText('How filters work').click();
  await expect(page.getByText('shows that event only')).toBeVisible();

  await builder.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(builder).toBeHidden();
  await expect(page.getByRole('button', { name: 'Add filter' })).toBeFocused();
  await expect(events).toContainText('lab-happy-path');
  await expect(events).not.toContainText('lab_button_clicked');
});

test('captureBeforeOpen shows what was sent before opening, and keeps on while closed, until Clear', async ({
  page
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'ngx-ui-watchtower.eventInspector',
      JSON.stringify({ dock: 'right' })
    )
  );
  await openLab(page, 'inspector', { inspector: { captureBeforeOpen: 50 } });
  await press(page, 'One of each kind');

  await page.locator('.lab-header-button').click();
  await expect(timeline(page)).toContainText('lab_button_clicked');

  await press(page, 'Close');
  await press(page, 'An unknown event type');
  await page.locator('.lab-header-button').click();
  await expect(timeline(page)).toContainText('com.example.custom');
  await expect(timeline(page)).toContainText('lab_button_clicked');

  await page.getByRole('button', { name: 'Clear captured events' }).click();
  await press(page, 'Close');
  await page.locator('.lab-header-button').click();
  await expect(page.locator('uwt-inspector')).toContainText('0 events');
});

test('in forced colours, the dock, the kind shown, Pause and solid buttons keep their state and edges', async ({
  page,
  browserName
}) => {
  test.skip(
    browserName !== 'chromium',
    'Playwright emulates forced colours in Chromium only'
  );
  await page.emulateMedia({ forcedColors: 'active' });
  await openInspector(page);
  const css = (locator: Locator, property: string, pseudo?: string) =>
    locator.evaluate(
      (e, [p, ps]) => getComputedStyle(e, ps).getPropertyValue(p as string),
      [property, pseudo] as const
    );

  // The system's selection colour, as this page resolves it.
  const highlight = await page.evaluate(() => {
    const probe = document.body.appendChild(document.createElement('div'));
    probe.style.cssText = 'forced-color-adjust: none; background: Highlight';
    const colour = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return colour;
  });

  const dock = (side: string) => page.locator(`[data-dock="${side}"]`);
  expect(await css(dock('right'), 'background-color')).toBe(highlight);
  expect(await css(dock('left'), 'background-color')).not.toBe(highlight);
  const kinds = page.locator('uwt-inspector cps-button-toggle label');
  expect(await css(kinds.nth(0), 'background-color')).toBe(highlight);
  expect(await css(kinds.nth(1), 'background-color')).not.toBe(highlight);
  const knob = page.locator('uwt-inspector .cps-switch-slider');
  expect(parseFloat(await css(knob, 'border-top-width', '::before'))).toBe(7);

  await page.getByRole('button', { name: 'Add filter' }).click();
  const add = page
    .getByRole('group', { name: 'New filter' })
    .getByRole('button', { name: 'Add', exact: true });
  expect(parseFloat(await css(add, 'border-top-width'))).toBeGreaterThan(0);
});
