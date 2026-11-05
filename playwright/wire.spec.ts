import {
  expect,
  navigate,
  openLab,
  Page,
  press,
  sessionStarted,
  test
} from './lab';

/** Picks the option starting with `option` in the select labelled `label`. */
async function choose(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: new RegExp(`^${option}`) }).click();
}

test.beforeEach(async ({ page }) => {
  await openLab(page, 'wire');
});

test('the broker select sets how the next /rum/init is answered', async ({
  page,
  backend
}) => {
  await choose(page, 'Answer the next /rum/init with', 'null —');
  await expect
    .poll(async () => (await backend.state()).brokerMode)
    .toBe('null');
  await expect(page.locator('.lab-header')).toContainText('broker: null');
});

test('the telemetries list sets what the broker names', async ({
  page,
  backend
}) => {
  await page
    .locator('cps-switch', { hasText: "The library's default" })
    .click();
  await choose(page, 'Telemetries', 'replay');
  await expect
    .poll(async () => (await backend.state()).telemetries)
    .toEqual(['errors', 'performance', 'http', 'replay']);
});

test('Reload to apply loads the page again', async ({ page }) => {
  await page.evaluate(() => ((window as { labMark?: number }).labMark = 1));
  await press(page, 'Reload to apply');
  await expect
    .poll(() => page.evaluate(() => (window as { labMark?: number }).labMark))
    .toBeUndefined();
});

test("the tables show what arrived, RUM's own events on request, until Reset empties them", async ({
  page,
  backend
}) => {
  await sessionStarted(page);
  await navigate(page, 'BI events');
  await press(page, 'Track a click');
  await navigate(page, 'Logging');
  await press(page, 'warn');
  await navigate(page, 'On the wire');
  const rumTable = page.locator('.lab-card', { hasText: 'RUM events (' });
  const logTable = page.locator('.lab-card', { hasText: 'Log records (' });

  await expect(rumTable).toContainText('lab_button_clicked');
  await expect(rumTable).not.toContainText('com.amazon.rum.page_view_event');
  await expect(logTable).toContainText('A lab warning');

  const libraryOnly = page.locator('cps-switch', {
    hasText: 'Library events only'
  });
  await libraryOnly.click();
  await expect(rumTable).toContainText('com.amazon.rum.page_view_event');
  await libraryOnly.click();

  // RUM's own events can still arrive after it; the library's can't.
  await press(page, 'Reset the mock backend');
  await expect(rumTable.locator('h2')).toHaveText('RUM events (0)');
  await expect(logTable.locator('h2')).toHaveText('Log records (0)');
  expect(await backend.logs()).toEqual([]);
});

test('the overlay field sets what is laid over the broker config, and refuses what is not JSON', async ({
  page,
  backend
}) => {
  const field = page.getByRole('textbox', {
    name: 'Laid over the app monitor config (JSON)'
  });
  await field.fill('{ "sessionSampleRate": 0 }');
  await press(page, 'Set the overlay');
  await expect
    .poll(async () => (await backend.state()).brokerConfig)
    .toEqual({ sessionSampleRate: 0 });
  // After a reload, the field shows the overlay in force.
  await press(page, 'Reload to apply');
  await expect(field).toHaveValue('{"sessionSampleRate":0}');

  await field.fill('[1, 2]');
  await press(page, 'Set the overlay');
  await expect(page.locator('lab-wire-page')).toContainText(
    'Not a JSON object.'
  );
  expect((await backend.state()).brokerConfig).toEqual({
    sessionSampleRate: 0
  });
});
