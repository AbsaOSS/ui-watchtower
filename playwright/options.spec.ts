import { expect, openLab, Page, press, test } from './lab';

/** Records every request this page makes to the RUM broker or dataplane. */
function rumRequests(page: Page): string[] {
  const seen: string[] = [];
  page.on('request', (r) => {
    if (/\/rum\/init|\/appmonitors\//.test(r.url())) {
      seen.push(r.url());
    }
  });
  return seen;
}

const inspector = (page: Page) => page.locator('uwt-inspector');

test('?telemetry=off: no RUM requests at all, and the header says so', async ({
  page
}) => {
  const seen = rumRequests(page);
  await openLab(page, 'bi?telemetry=off');
  await press(page, 'Track a click');
  await page.waitForTimeout(3000);

  expect(seen).toEqual([]);
  await expect(page.locator('.lab-header')).toContainText('telemetry: off');
});

test('?destination=noop: no RUM requests; the Event Inspector still shows events', async ({
  page
}) => {
  const seen = rumRequests(page);
  await openLab(page, 'bi?destination=noop');
  await page.locator('.lab-header-button').click();
  await press(page, 'Track a click');
  await page.waitForTimeout(3000);

  expect(seen).toEqual([]);
  await expect(inspector(page)).toContainText('lab_button_clicked');
});

test('?inspector=off: the Event Inspector never opens', async ({ page }) => {
  await openLab(page, 'bi?inspector=off');
  await page.locator('.lab-header-button').click();
  await page.keyboard.down('Shift');
  await page.keyboard.press('KeyE');
  await page.keyboard.press('KeyI');
  await page.keyboard.up('Shift');

  await page.waitForTimeout(500);
  await expect(inspector(page)).toHaveCount(0);
});

test('?inspector=noshortcut: the shortcut does nothing, the header button opens it', async ({
  page
}) => {
  await openLab(page, 'bi?inspector=noshortcut');
  await page.keyboard.down('Shift');
  await page.keyboard.press('KeyE');
  await page.keyboard.press('KeyI');
  await page.keyboard.up('Shift');
  await page.waitForTimeout(500);
  await expect(inspector(page)).toHaveCount(0);

  await page.locator('.lab-header-button').click();
  await expect(inspector(page)).toBeVisible();
});
