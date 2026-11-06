import {
  expect,
  navigate,
  openLab,
  Page,
  press,
  sessionStarted,
  test
} from './lab';

/**
 * Picks the option starting with `option` in the select labelled `label`,
 * opened from the keyboard: a click in a list's box can land on a chip's
 * Remove, wherever the fonts put the chips.
 */
async function choose(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label }).press('ArrowDown');
  await page.getByRole('option', { name: new RegExp(`^${option}`) }).click();
}

test('Settings sets the broker, all at once with Apply and reload; the header tells this load from the next', async ({
  page,
  backend
}) => {
  await openLab(page, 'settings');
  await choose(page, 'Answer /rum/init with', 'null —');
  await page
    .locator('cps-switch', { hasText: "The library's default" })
    .locator('label.cps-switch')
    .click();
  await choose(page, 'Telemetries', 'replay');
  const overlay = page.getByRole('textbox', {
    name: 'Laid over the app monitor config (JSON)'
  });
  await overlay.fill('{ "sessionSampleRate": 0 }');
  // Past the lab's next poll of the backend, the draft is still there.
  await page.waitForTimeout(2000);
  await expect(overlay).toHaveValue('{ "sessionSampleRate": 0 }');
  // Nothing is set until applied.
  expect((await backend.state()).brokerMode).toBe('ok');

  await press(page, 'Apply and reload');
  await expect(page.locator('.lab-header')).toContainText('broker: null');
  expect(await backend.state()).toMatchObject({
    brokerMode: 'null',
    telemetries: ['errors', 'performance', 'http', 'replay'],
    brokerConfig: { sessionSampleRate: 0 }
  });
  // After the reload, the fields show what is set.
  await expect(
    page.getByRole('textbox', {
      name: 'Laid over the app monitor config (JSON)'
    })
  ).toHaveValue('{"sessionSampleRate":0}');

  // Set elsewhere, for the next load: the header says so.
  await backend.setBrokerMode('ok');
  await expect(page.locator('.lab-header')).toContainText(
    'broker: null → ok after reload'
  );
});

test('a broker overlay that is not JSON stops Apply, and sets nothing', async ({
  page,
  backend
}) => {
  await openLab(page, 'settings');
  await page
    .getByRole('textbox', { name: 'Laid over the app monitor config (JSON)' })
    .fill('[1, 2]');
  await press(page, 'Apply and reload');
  await expect(page.locator('lab-settings-page')).toContainText(
    'Not a JSON object.'
  );
  expect((await backend.state()).brokerConfig).toEqual({});
});

test("the tables show what arrived, RUM's own events on request, until a confirmed Reset empties them", async ({
  page,
  backend
}) => {
  await openLab(page, 'wire');
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

  // The filter sits with the table it filters.
  const libraryOnly = rumTable.locator('cps-switch', {
    hasText: 'Library events only'
  });
  await libraryOnly.click();
  await expect(rumTable).toContainText('com.amazon.rum.page_view_event');
  await libraryOnly.click();

  // Asked first; declined, nothing goes.
  let asked = '';
  page.once('dialog', (dialog) => {
    asked = dialog.message();
    return dialog.dismiss();
  });
  await press(page, 'Reset the mock backend');
  await expect.poll(() => asked).toContain('Empty the mock backend?');
  expect((await backend.logs()).length).toBeGreaterThan(0);

  // RUM's own events can still arrive after it; the library's can't.
  page.once('dialog', (dialog) => dialog.accept());
  await press(page, 'Reset the mock backend');
  await expect(page.getByRole('status')).toContainText(
    'Reset: the mock backend is empty.'
  );
  await expect(rumTable.locator('h2')).toHaveText('RUM events (0)');
  await expect(logTable.locator('h2')).toHaveText('Log records (0)');
  expect(await backend.logs()).toEqual([]);
});
