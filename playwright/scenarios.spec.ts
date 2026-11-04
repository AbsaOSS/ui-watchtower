import { expect, named, openLab, press, sessionStarted, test } from './lab';

test.beforeEach(async ({ page }) => {
  await openLab(page, 'scenarios');
  await sessionStarted(page);
});

test('a settled scenario arrives once, its steps packed inside, with the identity attributes', async ({
  page,
  backend
}) => {
  await press(page, 'Complete, with 3 steps');
  await expect(page.locator('.lab-readout').first()).toContainText(
    '"scenarioName": "lab-happy-path"'
  );

  const events = await backend.rumUntil(
    (e) => named(e, 'lab-happy-path').length > 0
  );
  const happy = named(events, 'lab-happy-path');
  expect(happy).toHaveLength(1);
  expect(happy[0].type).toBe('com.uwt.scenario');
  expect(happy[0].user.sessionId).toBeTruthy();
  expect(happy[0].details).toMatchObject({
    status: 'success',
    stepCount: 3,
    application: 'watchtower-lab'
  });
});

test('a failing scenario arrives as a failure', async ({ page, backend }) => {
  await press(page, 'Fail with an error');
  const events = await backend.rumUntil(
    (e) => named(e, 'lab-failure').length > 0
  );
  expect(named(events, 'lab-failure')[0].details.status).toBe('failure');
});

test('HTTP scenarios settle through traceScenario', async ({
  page,
  backend
}) => {
  await press(page, 'Request (600 ms)');
  const events = await backend.rumUntil((e) => named(e, 'lab-http').length > 0);
  expect(named(events, 'lab-http')[0].details.status).toBe('success');
});

test('switchMap supersession: earlier searches are abandoned by the caller, the last succeeds', async ({
  page,
  backend
}) => {
  for (let n = 0; n < 3; n++) {
    await press(page, 'Search');
  }
  const events = await backend.rumUntil(
    (e) => named(e, 'lab-superseded').length === 3
  );
  const settled = named(events, 'lab-superseded').map(
    (e) => `${e.details.status}:${e.details.metadata?.abandonedBy ?? ''}`
  );
  expect(settled.sort()).toEqual([
    'abandoned:caller',
    'abandoned:caller',
    'success:'
  ]);
});
