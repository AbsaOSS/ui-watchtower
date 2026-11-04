import { expect, named, openLab, press, sessionStarted, test } from './lab';

test.beforeEach(async ({ page }) => {
  await openLab(page, 'bi');
  await sessionStarted(page);
});

test('a tracked event arrives as com.uwt.bi', async ({ page, backend }) => {
  await press(page, 'Track a click');
  const events = await backend.rumUntil(
    (e) => named(e, 'lab_button_clicked').length > 0
  );
  expect(named(events, 'lab_button_clicked')[0].type).toBe('com.uwt.bi');
});

test('two identical events at once arrive as one', async ({
  page,
  backend
}) => {
  await press(page, 'Fire twice at once');
  // Tracked after it, so once this arrives the pair has had its chance.
  await press(page, 'Track a click');
  const events = await backend.rumUntil(
    (e) => named(e, 'lab_button_clicked').length > 0
  );
  expect(named(events, 'lab_double_fired')).toHaveLength(1);
});
