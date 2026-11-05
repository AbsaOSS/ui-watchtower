import { expect, named, openLab, press, sessionStarted, test } from './lab';

test.beforeEach(async ({ page }) => {
  await openLab(page, 'scenarios');
  await sessionStarted(page);
});

test('steps carry their detail, a failed step leaves the scenario running, and the outcome lands on the record', async ({
  page,
  backend
}) => {
  await press(page, 'Steps with detail');
  const events = await backend.rumUntil(
    (e) => named(e, 'lab-detailed').length > 0
  );
  const record = named(events, 'lab-detailed')[0].details;
  expect(record).toMatchObject({
    status: 'success',
    statusCode: 200,
    message: 'Saved',
    reason: 'all-valid',
    metadata: { orders: 2, source: 'lab' },
    stepCount: 2
  });
  const step = (name: string) =>
    record.steps.find((s: { name: string }) => s.name === name);
  expect(step('fetch')).toMatchObject({
    status: 'success',
    message: 'Fetched',
    metadata: { rows: 3 }
  });
  expect(step('validate')).toMatchObject({
    status: 'failure',
    reason: 'validation',
    error: { message: 'Row 2 is invalid' }
  });
});

test('a child names its parent, with its feature, operation and route', async ({
  page,
  backend
}) => {
  await press(page, 'A parent and a child');
  const events = await backend.rumUntil(
    (e) => named(e, 'lab-parent').length > 0 && named(e, 'lab-child').length > 0
  );
  expect(named(events, 'lab-child')[0].details).toMatchObject({
    parentScenarioId: named(events, 'lab-parent')[0].details.scenarioId,
    feature: 'checkout',
    operation: 'pay',
    route: '/orders/:id'
  });
});

test("settle() settles with the status it's given", async ({
  page,
  backend
}) => {
  await press(page, "settle('incomplete')");
  const events = await backend.rumUntil(
    (e) => named(e, 'lab-settled').length > 0
  );
  expect(named(events, 'lab-settled')[0].details).toMatchObject({
    status: 'incomplete',
    reason: 'no-results'
  });
});

test('more than 50 active scenarios draws a warning in development', async ({
  page
}) => {
  const warnings: string[] = [];
  page.on('console', (m) => m.type() === 'warning' && warnings.push(m.text()));
  await press(page, '51 at once');
  await expect
    .poll(() => warnings)
    .toContainEqual(
      expect.stringContaining('High number of active scenarios (51)')
    );
});

test('the lookups find an active scenario, until it settles', async ({
  page,
  backend
}) => {
  const readout = page.locator('.lab-readout').last();
  const lookups = async () => JSON.parse((await readout.textContent())!);

  await press(page, 'Start a long one');
  await expect(readout).toContainText('"find": "lab-long"');
  const found = await lookups();
  expect(found.getActive).toContain('lab-long');
  expect(found.findByName).toHaveLength(1);
  expect(found.findByNameAndId).toBe(found.findByName[0]);

  await press(page, 'Cancel every active one');
  await expect(readout).toContainText('"getActive": []');
  const events = await backend.rumUntil((e) => named(e, 'lab-long').length > 0);
  expect(named(events, 'lab-long')[0].details.status).toBe('abandoned');
});

test("traceScenario's options: an outcome from the value, a cancel outcome, and a value then teardown", async ({
  page,
  backend
}) => {
  await press(page, 'outcome, from the response');
  await press(page, 'cancelOutcome, unsubscribed early');
  await press(page, "valueThenTeardown: 'cancel'");

  const events = await backend.rumUntil((e) =>
    ['lab-trace-outcome', 'lab-trace-cancel', 'lab-trace-teardown'].every(
      (name) => named(e, name).length > 0
    )
  );
  expect(named(events, 'lab-trace-outcome')[0].details).toMatchObject({
    status: 'success',
    statusCode: 200,
    message: 'Data arrived'
  });
  expect(named(events, 'lab-trace-cancel')[0].details).toMatchObject({
    status: 'abandoned',
    reason: 'navigated-away',
    metadata: { abandonedBy: 'caller' }
  });
  expect(named(events, 'lab-trace-teardown')[0].details).toMatchObject({
    status: 'abandoned',
    metadata: { abandonedBy: 'caller' }
  });
});
