import { expect, named, openLab, press, sessionStarted, test } from './lab';

/** Personal values the Privacy page sends, none of which may arrive. */
const PERSONAL = [
  'anna.smith@example.com',
  '4111 1111',
  'hunter2',
  'eyJhbGci',
  '10.1.2.3',
  '7946 0958'
];

test('personal values never reach RUM or the log backend', async ({
  page,
  backend
}) => {
  await openLab(page, 'privacy');
  await sessionStarted(page);
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
  expect(named(events, 'lab_privacy_checked')).toHaveLength(1);
});
