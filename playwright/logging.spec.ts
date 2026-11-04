import { expect, openLab, press, sessionStarted, test } from './lab';

test.beforeEach(async ({ page }) => {
  await openLab(page, 'logging');
  await sessionStarted(page);
});

test('records reach the log backend, and the noisy logger drops its log line', async ({
  page,
  backend
}) => {
  await press(page, 'error, with an Error');
  await press(page, 'log (dropped)');
  await press(page, 'warn');

  await expect
    .poll(async () => (await backend.logs()).map((r) => r.level))
    .toEqual(expect.arrayContaining(['error', 'warn']));
  const logs = await backend.logs();
  expect(logs.some((r) => r.logger === 'lab' && r.level === 'error')).toBe(
    true
  );
  expect(logs.some((r) => r.message === 'Not written')).toBe(false);
});

test('query() reads records back from the backend', async ({ page }) => {
  await press(page, 'error, with an Error');
  await expect
    .poll(async () => {
      await press(page, "query({ logger: 'lab' })");
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
