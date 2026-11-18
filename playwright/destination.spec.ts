import { expect, navigate, openLab, press, test } from './lab';

test('a custom destination is started once, given every event classified, and RUM never loads', async ({
  page,
  backend
}) => {
  const rum: string[] = [];
  page.on('request', (r) => {
    if (/\/rum\/init|\/appmonitors\//.test(r.url())) {
      rum.push(r.url());
    }
  });
  await openLab(page, 'bi?destination=custom');
  await expect(page.locator('.lab-header')).toContainText(
    'destination: custom'
  );

  await press(page, 'Track a click');
  await navigate(page, 'Scenarios');
  await press(page, 'Fail with an error');
  await navigate(page, 'Logging');
  await press(page, 'error, with an Error');

  await expect
    .poll(async () => (await backend.custom()).map((e) => e.kind).sort())
    .toEqual(['bi', 'error', 'init', 'scenario']);
  const types = (await backend.custom()).map((e) => e.eventType);
  expect(types).toContain('com.uwt.bi');
  expect(types).toContain('com.uwt.scenario');
  // Logs keep their own route.
  expect((await backend.logs()).map((r) => r.message)).toEqual([
    'Saving the order failed'
  ]);
  expect(rum).toEqual([]);
});

test('a custom destination still gets the scenario abandoned as the page goes', async ({
  page,
  backend
}) => {
  await openLab(page, 'lifecycle?destination=custom');
  await press(page, 'Start a scenario and reload');
  await expect
    .poll(
      async () =>
        (await backend.custom()).find(
          (e) => e.payload?.scenarioName === 'lab-abandoned'
        )?.payload
    )
    .toMatchObject({ status: 'abandoned' });
});
