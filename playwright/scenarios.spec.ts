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
    application: 'watchtower-lab',
    // RUM's session cookie dates the session's start.
    sessionElapsed: expect.any(Number)
  });
});

test('a failing scenario arrives as a failure, with its error and status code', async ({
  page,
  backend
}) => {
  await press(page, 'Fail with an error');
  const events = await backend.rumUntil(
    (e) => named(e, 'lab-failure').length > 0
  );
  expect(named(events, 'lab-failure')[0].details).toMatchObject({
    status: 'failure',
    statusCode: 503,
    error: { name: 'Error', message: 'The backend said no' }
  });
});

test('cancel, incomplete and a timeout each settle with their own status', async ({
  page,
  backend
}) => {
  await press(page, 'Cancel');
  await press(page, 'Incomplete');
  await press(page, 'Time out after 1.5 s');

  const events = await backend.rumUntil(
    (e) => named(e, 'lab-timeout').length > 0
  );
  expect(named(events, 'lab-cancel')[0].details).toMatchObject({
    status: 'abandoned',
    metadata: { abandonedBy: 'caller' }
  });
  expect(named(events, 'lab-incomplete')[0].details.status).toBe('incomplete');
  expect(named(events, 'lab-timeout')[0].details).toMatchObject({
    status: 'timeout',
    message: 'Scenario did not settle within 1500ms'
  });
});

test('a backdated start and aggregated batches count in the timing', async ({
  page,
  backend
}) => {
  await press(page, 'Backdated by 1.5 s');
  await press(page, '5 aggregated batches');

  const events = await backend.rumUntil(
    (e) => named(e, 'lab-aggregates').length > 0
  );
  expect(
    named(events, 'lab-backdated')[0].details.delta
  ).toBeGreaterThanOrEqual(1500);
  const [batch] = named(events, 'lab-aggregates')[0].details.aggregates;
  expect(batch).toMatchObject({ name: 'batch', callCount: 5 });
  expect(batch.elapsed).toBeGreaterThanOrEqual(150);
});

test('HTTP scenarios settle through traceScenario, a failed request as a failure', async ({
  page,
  backend
}) => {
  await press(page, 'Request (600 ms)');
  await press(page, 'Request that fails (500)');
  const events = await backend.rumUntil(
    (e) =>
      named(e, 'lab-http').length > 0 && named(e, 'lab-http-error').length > 0
  );
  expect(named(events, 'lab-http')[0].details.status).toBe('success');
  const failed = named(events, 'lab-http-error')[0].details;
  expect(failed.status).toBe('failure');
  expect(failed.error.name).toBe('HttpErrorResponse');
  expect(failed.error.message).toContain('500');
});

test('toRecord() shows a running scenario; completing it sends it once', async ({
  page,
  backend
}) => {
  const readout = page.locator('.lab-readout').first();
  await press(page, 'Start');
  await expect(readout).toContainText('"scenarioName": "lab-happy-path"');
  const running = JSON.parse((await readout.textContent())!);
  expect(running.status).toBeUndefined();
  expect(running.steps.map((s: { name: string }) => s.name)).toContain('fetch');
  expect(named(await backend.rum(), 'lab-happy-path')).toHaveLength(0);

  await press(page, 'Complete it');
  const events = await backend.rumUntil(
    (e) => named(e, 'lab-happy-path').length > 0
  );
  expect(named(events, 'lab-happy-path')).toHaveLength(1);
  expect(named(events, 'lab-happy-path')[0].details).toMatchObject({
    status: 'success',
    stepCount: 1
  });
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
