import { expect, LogRecord, openLab, press, sessionStarted, test } from './lab';

test.beforeEach(async ({ page }) => {
  await openLab(page, 'logging');
  await sessionStarted(page);
});

test('records reach the log backend, and the noisy logger writes only warnings and up', async ({
  page,
  backend
}) => {
  await press(page, 'log');
  await press(page, 'log (dropped)');
  await press(page, 'warn (written)');
  await press(page, 'error, with an Error');

  // Each record travels on its own request, so in any order.
  await expect
    .poll(async () =>
      (await backend.logs()).map((r) => `${r.logger}:${r.level}`).sort()
    )
    .toEqual(['lab:error', 'lab:log', 'noisy:warn']);
});

test('an error record carries its context, metadata and error', async ({
  page,
  backend
}) => {
  await press(page, 'error, with an Error');
  await expect.poll(async () => (await backend.logs()).length).toBe(1);
  expect((await backend.logs())[0]).toMatchObject({
    message: 'Saving the order failed',
    context: 'checkout',
    metadata: { orderId: 'A-1001' },
    error: { name: 'Error', message: 'Connection reset' }
  });
});

test('query() reads records back from the backend', async ({ page }) => {
  await press(page, 'error, with an Error');
  await expect
    .poll(async () => {
      await press(page, 'Run query');
      return page.locator('.lab-readout').last().textContent();
    })
    .toContain('Saving the order failed');
});

test('an error is mirrored to RUM', async ({ page, backend }) => {
  await press(page, 'error, with an Error');
  await backend.rumUntil((events) =>
    events.some(
      (e) =>
        e.type === 'com.amazon.rum.js_error_event' &&
        JSON.stringify(e.details).includes('Connection reset')
    )
  );
});

test('a query filter finds records by correlationId, by level and by time', async ({
  page,
  backend
}) => {
  await press(page, 'Log inside a scenario');
  await press(page, 'error, with an Error');
  await expect.poll(async () => (await backend.logs()).length).toBe(2);
  const readout = page.locator('.lab-readout').last();
  const found = async () =>
    (JSON.parse((await readout.textContent())!) as LogRecord[]).map(
      (r) => r.message
    );

  // The filter now names the scenario's id.
  await press(page, 'Run query');
  await expect(readout).toContainText('Inside a journey');
  expect(await found()).toEqual(['Inside a journey']);

  const filter = page.getByRole('textbox', { name: 'Query filter (JSON)' });
  await filter.fill('{ "minLevel": "error" }');
  await press(page, 'Run query');
  await expect(readout).toContainText('Saving the order failed');
  expect(await found()).toEqual(['Saving the order failed']);

  const later = new Date(Date.now() + 60_000).toISOString();
  await filter.fill(`{ "from": "${later}" }`);
  await press(page, 'Run query');
  await expect(readout).toHaveText('[]');
});

test('a batching log provider is flushed as the page is hidden', async ({
  page,
  backend
}) => {
  await openLab(page, 'logging', { lab: { logBatching: true } });
  await press(page, 'warn');
  await page.waitForTimeout(1500);
  expect(await backend.logs()).toEqual([]);

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden'
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  // Well before the provider's own 10-second batch.
  await expect
    .poll(async () => (await backend.logs()).length, { timeout: 3000 })
    .toBe(1);
});

test('a batching log provider is flushed as the page reloads, in every browser', async ({
  page,
  backend
}) => {
  await openLab(page, 'logging', { lab: { logBatching: true } });
  await press(page, 'warn');
  await page.reload();
  await expect
    .poll(async () => (await backend.logs()).length, { timeout: 4000 })
    .toBe(1);
});
