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

test('clicking again within 400 ms adds nothing; after it, a second event', async ({
  page,
  backend
}) => {
  // Two clicks, milliseconds apart.
  await page
    .getByRole('button', { name: 'Track a click', exact: true })
    .dblclick();
  await page.waitForTimeout(600);
  await press(page, 'Track a click');
  // Tracked last, so once this arrives the clicks have had their chance.
  await press(page, 'Fire twice at once');

  const events = await backend.rumUntil(
    (e) => named(e, 'lab_double_fired').length > 0
  );
  expect(named(events, 'lab_button_clicked')).toHaveLength(2);
});

test('an event tied to a feature and a scenario carries both', async ({
  page,
  backend
}) => {
  await press(page, 'Feature, tied to a scenario');
  const events = await backend.rumUntil(
    (e) =>
      named(e, 'lab_feature_used').length > 0 &&
      named(e, 'lab-happy-path').length > 0
  );
  expect(named(events, 'lab_feature_used')[0].details).toMatchObject({
    feature: 'theme-switcher',
    scenarioId: named(events, 'lab-happy-path')[0].details.scenarioId,
    metadata: { theme: 'dark' }
  });
});
