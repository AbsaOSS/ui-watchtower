import { expect, openLab, Page, press, test } from './lab';

/** Holds Shift and presses `keys` — by default the shortcut, Shift+E+I. */
async function shortcut(page: Page, keys = ['KeyE', 'KeyI']): Promise<void> {
  await page.keyboard.down('Shift');
  for (const key of keys) {
    await page.keyboard.press(key);
  }
  await page.keyboard.up('Shift');
}

/** The value of one of the pane's inset variables on `<html>`. */
const inset = (page: Page, side: string) =>
  page.evaluate(
    (s) =>
      getComputedStyle(document.documentElement).getPropertyValue(
        `--uwt-inspector-inset-${s}`
      ),
    side
  );

test.beforeEach(async ({ page }) => {
  await openLab(page, 'inspector');
});

test('opens from the header as a dialog, with the mark and the transparency slider', async ({
  page
}) => {
  await page.locator('.lab-header-button').click();
  const dialog = page.locator('.cps-dialog');
  await expect(dialog.locator('uwt-inspector')).toBeVisible();
  await expect(
    dialog.locator('.cps-dialog-header-icon uwt-inspector-logo')
  ).toHaveCount(1);
  await expect(dialog.locator('cps-slider')).toBeVisible();
});

test('the Dialog button moves it from a pane to the dialog', async ({
  page
}) => {
  await press(page, 'Right pane');
  await expect(page.locator('uwt-inspector-pane')).toBeVisible();

  await press(page, 'Dialog');
  await expect(page.locator('.cps-dialog uwt-inspector')).toBeVisible();
  await expect(page.locator('uwt-inspector-pane')).toHaveCount(0);
});

test('Shift+E+I opens it, brings focus back, and closes it from inside — never while typing', async ({
  page
}) => {
  const inspector = page.locator('uwt-inspector');
  await shortcut(page, ['KeyI']);
  await shortcut(page, ['KeyE', 'KeyX', 'KeyI']);
  await expect(inspector).toHaveCount(0);

  await shortcut(page);
  await expect(inspector).toBeVisible();

  // Focus lands in its search field, where Shift+E+I is typing.
  const search = page.locator('.uwt-inspector-search input').first();
  await expect(search).toBeFocused();
  await shortcut(page);
  await expect(search).toHaveValue('EI');
  await expect(inspector).toBeVisible();

  // From the app, it brings focus back.
  await page.mouse.click(300, 100);
  await expect(search).not.toBeFocused();
  await shortcut(page);
  await expect(search).toBeFocused();

  // From a button inside, it closes.
  await page.locator('.cps-dialog cps-button button').first().focus();
  await shortcut(page);
  await expect(inspector).toHaveCount(0);
});

for (const { label, side } of [
  { label: 'Left pane', side: 'left' },
  { label: 'Right pane', side: 'right' },
  { label: 'Bottom pane', side: 'bottom' }
]) {
  test(`${label}: its own header, no slider, and its size published as --uwt-inspector-inset-${side}`, async ({
    page
  }) => {
    await press(page, label);
    const pane = page.locator('uwt-inspector-pane');
    await expect(pane).toBeVisible();
    await expect(
      pane.locator('.uwt-inspector__brand uwt-inspector-logo')
    ).toHaveCount(1);
    await expect(pane.locator('cps-slider')).toHaveCount(0);

    const box = (await pane.boundingBox())!;
    const size = side === 'bottom' ? box.height : box.width;
    expect(Math.round(parseFloat(await inset(page, side)))).toBe(
      Math.round(size)
    );

    await press(page, 'Close');
    await expect(pane).toHaveCount(0);
    expect(await inset(page, side)).toBe('');
  });
}

test('the lab opts its fixed header and status bar in to the insets, and out', async ({
  page
}) => {
  const right = async (selector: string) => {
    const box = (await page.locator(selector).boundingBox())!;
    return Math.round(box.x + box.width);
  };

  await press(page, 'Right pane');
  const paneLeft = Math.round(
    (await page.locator('uwt-inspector-pane').boundingBox())!.x
  );
  expect(await right('.lab-header')).toBe(paneLeft);

  await page.locator('lab-inspector-page cps-switch').click();
  await expect
    .poll(() => right('.lab-header'))
    .toBe(page.viewportSize()!.width);

  await page.locator('lab-inspector-page cps-switch').click();
  await press(page, 'Bottom pane');
  const paneTop = Math.round(
    (await page.locator('uwt-inspector-pane').boundingBox())!.y
  );
  const status = (await page.locator('.lab-status').boundingBox())!;
  expect(Math.round(status.y + status.height)).toBe(paneTop);
});

test('a separate window, with its own header and no slider', async ({
  page
}) => {
  const popup = page.waitForEvent('popup');
  await press(page, 'Separate window');
  const window = await popup;

  await expect(
    window.locator('.uwt-inspector__brand uwt-inspector-logo')
  ).toHaveCount(1);
  await expect(window).toHaveTitle('Event Inspector · watchtower-lab');
  await expect(window.locator('cps-slider')).toHaveCount(0);
});

test('reopens where it was last, after a reload', async ({ page }) => {
  await press(page, 'Right pane');
  await expect(page.locator('uwt-inspector-pane')).toBeVisible();

  await page.reload();
  await page.locator('.lab-header-button').click();
  const pane = (await page.locator('uwt-inspector-pane').boundingBox())!;
  expect(Math.round(pane.x + pane.width)).toBe(page.viewportSize()!.width);
});

test('lists what is sent, keeping the newest 500 events per section', async ({
  page
}) => {
  // A pane, so the page's buttons stay clear of it.
  await press(page, 'Right pane');
  await press(page, 'One of each kind');
  await press(page, 'A burst of 600 BI events');
  await press(page, 'A 300,000-character payload');
  await press(page, 'Odd shapes');
  await press(page, 'An unknown event type');

  await expect(page.locator('uwt-inspector')).toContainText(
    /BI telemetry · 500 · last [\d:]{8} · oldest \d+ dropped/
  );
});

test('sorts each kind into its section, and shows any shape — an unrecognised type, odd values, a huge payload cut short', async ({
  page
}) => {
  const section = (title: string) =>
    page.locator('uwt-inspector-section').filter({ hasText: title });
  const bi = section('BI telemetry');

  await press(page, 'Right pane');
  await press(page, 'One of each kind');
  await press(page, 'An unknown event type');
  await press(page, 'Odd shapes');

  await expect(section('Scenario telemetry')).toContainText('lab-happy-path');
  await expect(section('Logging')).toContainText(
    'A warning, from the Event Inspector page'
  );
  await expect(section('Logging')).toContainText('error → RUM');
  await expect(bi).toContainText('com.example.custom (unrecognised type)');

  const expand = (eventName: string) =>
    bi
      .locator('tbody tr', { hasText: eventName })
      .getByRole('button', { name: 'Expand row' })
      .click();

  await expand('lab_odd_shapes');
  await expect(bi).toContainText('Zürich · 東京 · 🚀');
  await expect(bi.locator('.uwt-inspector-section__error')).toHaveCount(0);

  await press(page, 'A 300,000-character payload');
  await expand('lab_huge_payload');
  await expect(bi).toContainText('Large payload: showing the first');
});
