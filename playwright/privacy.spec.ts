import { expect, named, openLab, press, sessionStarted, test } from './lab';

/** Personal values the Privacy page sends, none of which may arrive. */
const PERSONAL = [
  'anna.smith@example.com',
  '4111 1111',
  'hunter2',
  'eyJhbGci',
  '10.1.2.3',
  '555 0123',
  '123-45-6789'
];

test('personal values never reach RUM or the log backend', async ({
  page,
  backend
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'ngx-ui-watchtower.eventInspector',
      JSON.stringify({ dock: 'right' })
    )
  );
  await openLab(page, 'privacy');
  await sessionStarted(page);
  await page.locator('.lab-header-button').click();
  await press(page, 'As BI metadata');
  await press(page, 'In a log message');
  await press(page, 'In a failing scenario');

  const events = await backend.rumUntil(
    (e) =>
      named(e, 'lab_privacy_checked').length > 0 &&
      named(e, 'lab-privacy').length > 0
  );
  await expect
    .poll(async () => (await backend.logs()).length)
    .toBeGreaterThan(0);
  const sent = JSON.stringify([events, await backend.logs()]);

  expect(PERSONAL.filter((value) => sent.includes(value))).toEqual([]);
  expect(sent).toContain('[redacted]');
  expect(named(events, 'lab_privacy_checked')).toHaveLength(1);

  // Nor in what the Event Inspector shows.
  const shown = await page.locator('uwt-inspector').textContent();
  expect(PERSONAL.filter((value) => shown!.includes(value))).toEqual([]);
});

test('errors of any shape are normalized: a string scrubbed, an object reduced to its type, an HTTP error without its query', async ({
  page,
  backend
}) => {
  await openLab(page, 'privacy');
  await press(page, 'An error as a string');
  await press(page, 'An error as a plain object');
  await press(page, 'An HttpErrorResponse');

  await expect.poll(async () => (await backend.logs()).length).toBe(3);
  const errors = Object.fromEntries(
    (await backend.logs()).map((r) => [r.message, r.error])
  );
  expect(errors['The string error']).toEqual({
    name: 'Error',
    message: 'Lookup failed for [redacted]'
  });
  expect(errors['The object error']).toEqual({
    name: 'UnknownError',
    message: '[redacted]'
  });
  const http = errors['The http error']!;
  expect(http.name).toBe('HttpErrorResponse');
  expect(http.message).toContain('https://shop.example/api/customers');
  expect(http.message).toContain('404 Not Found');
  expect(http.message).not.toContain('?email');
});

test('the scrub playground shows what the library makes of any text', async ({
  page
}) => {
  await openLab(page, 'privacy');
  await page
    .getByRole('textbox', { name: 'Text to scrub' })
    .fill('Call +27 82 555 0123 about https://shop.example/a?session=1');
  const scrubbed = page.locator('.lab-scrubbed');
  await expect(scrubbed).toContainText(
    '"uwtScrubString": "Call [redacted] about https://shop.example/a"'
  );
  await expect(scrubbed).toContainText('"password": "[redacted]"');
  await expect(scrubbed).not.toContainText('555 0123');
});
