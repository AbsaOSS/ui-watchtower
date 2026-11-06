import { expect, openLab, press, test } from './lab';

for (const mode of ['null', 'fail'] as const) {
  test(`broker "${mode}": the app carries on, and nothing reaches the dataplane`, async ({
    page,
    backend
  }) => {
    await backend.setBrokerMode(mode);
    const sent: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/appmonitors/')) {
        sent.push(r.url());
      }
    });

    await openLab(page, 'bi');
    await press(page, 'Track a click');
    // RUM would have sent within two of its 2-second dispatches.
    await page.waitForTimeout(4500);

    expect(sent).toEqual([]);
    await expect(page.locator('lab-root main h1')).toHaveText('BI events');
  });
}

test('broker "short-expiry": credentials are refreshed within seconds, without a tight loop', async ({
  page,
  backend
}) => {
  await backend.setBrokerMode('short-expiry');
  let inits = 0;
  page.on('request', (r) => {
    if (new URL(r.url()).pathname === '/rum/init') {
      inits++;
    }
  });

  await openLab(page, 'bi');
  await page.waitForTimeout(12_000);

  expect(inits).toBeGreaterThanOrEqual(2);
  expect(inits).toBeLessThanOrEqual(4);
});
