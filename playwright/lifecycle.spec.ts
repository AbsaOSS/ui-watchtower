import { expect, named, openLab, press, sessionStarted, test } from './lab';

test('a scenario running when the page goes arrives abandoned, by beacon', async ({
  page,
  backend
}) => {
  await openLab(page, 'lifecycle');
  await sessionStarted(page);
  await press(page, 'Start a scenario and reload');
  await expect(page.locator('lab-root main h1')).toHaveText('Lifecycle');

  const events = await backend.rumUntil(
    (e) => named(e, 'lab-abandoned').length > 0
  );
  expect(named(events, 'lab-abandoned')[0].details).toMatchObject({
    status: 'abandoned',
    metadata: { abandonedBy: 'page-hidden' }
  });
});
