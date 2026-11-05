import {
  expect,
  LogRecord,
  named,
  navigate,
  openLab,
  Page,
  press,
  sessionStarted,
  test
} from './lab';

/** The Event Inspector opens as a pane, beside the page's buttons. */
const asPane = (page: Page) =>
  page.addInitScript(() =>
    localStorage.setItem(
      'ngx-ui-watchtower.eventInspector',
      JSON.stringify({ dock: 'right' })
    )
  );

/** Waits for the log backend to hold one record, and returns it. */
async function onlyLog(backend: {
  logs(): Promise<LogRecord[]>;
}): Promise<LogRecord> {
  await expect.poll(async () => (await backend.logs()).length).toBe(1);
  return (await backend.logs())[0];
}

test('the Settings page applies an overlay, shows it in effect, and goes back', async ({
  page
}) => {
  await openLab(page, 'settings');
  await expect(page.locator('.lab-header')).not.toContainText('config:');

  await page
    .getByRole('textbox', { name: '?config= (JSON)' })
    .fill('{ "bi": { "dedupWindowMs": 0 } }');
  await press(page, 'Apply and reload');
  await expect(page.locator('.lab-header')).toContainText('config: custom');
  await expect(page.locator('.lab-readout')).toContainText(
    '"dedupWindowMs": 0'
  );

  await press(page, "Back to the lab's settings");
  await expect(page.locator('.lab-header')).not.toContainText('config:');
  await expect(page.locator('.lab-readout')).toContainText(
    '"dedupWindowMs": 400'
  );
});

test('eventNamespace renames the event types, and the inspector still sorts them', async ({
  page,
  backend
}) => {
  await asPane(page);
  await openLab(page, 'bi', { identity: { eventNamespace: 'com.acme' } });
  await sessionStarted(page);
  await page.locator('.lab-header-button').click();
  await press(page, 'Track a click');

  await backend.rumUntil((e) =>
    e.some(
      (event) =>
        event.type === 'com.acme.bi' &&
        event.details.eventName === 'lab_button_clicked'
    )
  );
  await expect(
    page.locator('uwt-inspector-section').filter({ hasText: 'BI telemetry' })
  ).toContainText('lab_button_clicked');
});

test('scenario settings: step events, user timings, and a step limit', async ({
  page,
  backend
}) => {
  // The library clears each measure once made; an observer still sees it.
  await page.addInitScript(() => {
    const seen: string[] = ((window as { labMeasures?: string[] }).labMeasures =
      []);
    new PerformanceObserver((list) =>
      seen.push(...list.getEntries().map((e) => e.name))
    ).observe({ entryTypes: ['measure'] });
  });
  await openLab(page, 'scenarios', {
    scenarios: { emitLifecycleEvents: true, userTimings: true, maxSteps: 2 }
  });
  await sessionStarted(page);
  await press(page, 'Complete, with 3 steps');

  const events = await backend.rumUntil((e) =>
    named(e, 'lab-happy-path').some((x) => x.type === 'com.uwt.scenario')
  );
  const happy = named(events, 'lab-happy-path');
  const of = (type: string) => happy.filter((e) => e.type === type);
  expect(of('com.uwt.scenario')[0].details).toMatchObject({
    stepCount: 3,
    exceededStepsLimit: true
  });
  // Only stored steps are sent on their own: two, not three.
  expect(of('com.uwt.scenario.step').map((e) => e.details.name)).toEqual([
    'fetch',
    'validate'
  ]);
  expect(
    await page.evaluate(
      () => (window as { labMeasures?: string[] }).labMeasures
    )
  ).toContain('lab-happy-path [fetch]');
});

test('BI dedup can be switched off', async ({ page, backend }) => {
  await openLab(page, 'bi', { bi: { dedupWindowMs: 0 } });
  await sessionStarted(page);
  await press(page, 'Fire twice at once');
  await press(page, 'Track a click');
  const events = await backend.rumUntil(
    (e) => named(e, 'lab_button_clicked').length > 0
  );
  expect(named(events, 'lab_double_fired')).toHaveLength(2);
});

test('logging settings: a higher floor, and errors not mirrored to RUM', async ({
  page,
  backend
}) => {
  await openLab(page, 'logging', {
    logging: { minLevel: 'warn', mirrorErrorsToRum: false }
  });
  await sessionStarted(page);
  await press(page, 'log');
  await press(page, 'warn');
  await press(page, 'error, with an Error');
  await expect
    .poll(async () => (await backend.logs()).map((r) => r.level).sort())
    .toEqual(['error', 'warn']);

  // Tracked after the error, so a mirror would have arrived by now.
  await navigate(page, 'BI events');
  await press(page, 'Track a click');
  const events = await backend.rumUntil(
    (e) => named(e, 'lab_button_clicked').length > 0
  );
  expect(events.map((e) => e.type)).not.toContain(
    'com.amazon.rum.js_error_event'
  );
});

test('redaction: a value transform, a length cap, and no stacks', async ({
  page,
  backend
}) => {
  await openLab(page, 'logging', {
    redaction: {
      extraValueTransforms: ['mask-order-ids'],
      maxStringLength: 12,
      includeStack: false
    }
  });
  await press(page, 'error, with an Error');
  const record = await onlyLog(backend);
  expect(record.metadata).toEqual({ orderId: 'A-****' });
  // Twelve characters kept, then the ellipsis.
  expect(record.message).toBe('Saving the o…');
  expect(record.error!.message).toBe('Connection r…');
  expect(record.error!.stack).toBeUndefined();
});

test('redaction: extra key and value patterns', async ({ page, backend }) => {
  await openLab(page, 'logging', {
    redaction: {
      extraKeyPatterns: ['^orderId$'],
      extraValuePatterns: ['Connection \\w+']
    }
  });
  await press(page, 'error, with an Error');
  const record = await onlyLog(backend);
  expect(record.metadata).toEqual({ orderId: '[redacted]' });
  expect(record.error!.message).not.toContain('Connection reset');
});

test('redaction: URL queries kept when stripUrlQuery is off', async ({
  page,
  backend
}) => {
  await openLab(page, 'scenarios', { redaction: { stripUrlQuery: false } });
  await sessionStarted(page);
  await press(page, 'Request that fails (500)');
  const events = await backend.rumUntil(
    (e) => named(e, 'lab-http-error').length > 0
  );
  expect(named(events, 'lab-http-error')[0].details.error.message).toContain(
    '?status=500'
  );
});

test('redact: false for logging stops its value scan only; BI still scans, and key names always redact', async ({
  page,
  backend
}) => {
  await openLab(page, 'privacy', { logging: { redact: false } });
  await sessionStarted(page);
  await press(page, 'As BI metadata');
  await press(page, 'In a log message');

  const record = await onlyLog(backend);
  expect(record.message).toContain('anna.smith@example.com');
  expect(record.metadata!.password).toBe('[redacted]');

  const events = await backend.rumUntil(
    (e) => named(e, 'lab_privacy_checked').length > 0
  );
  expect(JSON.stringify(named(events, 'lab_privacy_checked'))).not.toContain(
    'anna.smith@example.com'
  );
});

test('inspector settings: a custom shortcut, a smaller section, a smaller view', async ({
  page
}) => {
  await asPane(page);
  await openLab(page, 'inspector', {
    inspector: {
      maxEventsPerSection: 10,
      maxPayloadCharsInView: 1000,
      shortcuts: [{ code: 'F9', label: 'F9' }]
    }
  });
  const inspector = page.locator('uwt-inspector');

  await page.keyboard.down('Shift');
  await page.keyboard.press('KeyE');
  await page.keyboard.press('KeyI');
  await page.keyboard.up('Shift');
  await expect(inspector).toHaveCount(0);

  await page.keyboard.press('F9');
  await expect(inspector).toBeVisible();
  await expect(inspector).toContainText('Shortcut: F9');

  await press(page, 'A burst of 600 BI events');
  await expect(inspector).toContainText(/BI telemetry · 10 ·/);

  await press(page, 'A 300,000-character payload');
  const bi = page
    .locator('uwt-inspector-section')
    .filter({ hasText: 'BI telemetry' });
  await bi
    .locator('tbody tr', { hasText: 'lab_huge_payload' })
    .getByRole('button', { name: 'Expand row' })
    .click();
  await expect(bi).toContainText(/showing the first 1,?000 characters/);
});
