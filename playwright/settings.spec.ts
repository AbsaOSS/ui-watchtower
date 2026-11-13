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

/** Picks the option starting with `option` in the select labelled `label`, from the keyboard. */
async function choose(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label }).press('ArrowDown');
  await page.getByRole('option', { name: new RegExp(`^${option}`) }).click();
}

const toggle = (page: Page, label: string) =>
  page
    .locator('cps-switch', { hasText: label })
    .locator('label.cps-switch')
    .click();

const fill = (page: Page, label: string, value: string) =>
  page.locator('cps-input', { hasText: label }).locator('input').fill(value);

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

test('Settings checks the overlay against the library: no unknown setting, no wrong type', async ({
  page
}) => {
  await openLab(page, 'settings');
  const overlay = page.getByRole('textbox', { name: '?config= (JSON)' });
  const settings = page.locator('lab-settings-page');

  await overlay.fill('{ "bi": { "dedupWindow": 0 } }');
  await press(page, 'Apply and reload');
  await expect(settings).toContainText(`"bi.dedupWindow" isn't a setting`);

  await overlay.fill('{ "bi": { "dedupWindowMs": "0" } }');
  await press(page, 'Apply and reload');
  await expect(settings).toContainText(
    '"bi.dedupWindowMs" should be a number.'
  );

  await overlay.fill('{ "scenario": {} }');
  await press(page, 'Apply and reload');
  await expect(settings).toContainText(`"scenario" isn't a section`);

  // Own settings only: what every object inherits is none.
  await overlay.fill('{ "toString": {} }');
  await press(page, 'Apply and reload');
  await expect(settings).toContainText(`"toString" isn't a section`);
  // Never applied.
  await expect(page.locator('.lab-header')).not.toContainText('config:');
});

test('Settings checks types against the library, not a wrong value in effect', async ({
  page
}) => {
  await openLab(page, 'settings', { bi: { dedupWindowMs: '500' } });
  const overlay = page.getByRole('textbox', { name: '?config= (JSON)' });

  await overlay.fill('{ "bi": { "dedupWindowMs": 600 } }');
  await press(page, 'Apply and reload');
  // Applied: the page reloads with it.
  await expect
    .poll(() => new URL(page.url()).searchParams.get('config'))
    .toBe('{"bi":{"dedupWindowMs":600}}');
});

test('Settings controls write the common options into the overlay', async ({
  page
}) => {
  await openLab(page, 'settings');
  const overlay = page.getByRole('textbox', { name: '?config= (JSON)' });
  await expect(overlay).toHaveValue('{}');

  await page
    .locator('cps-switch', { hasText: 'Lifecycle step events' })
    .locator('label.cps-switch')
    .click();
  await expect(overlay).toHaveValue(/"emitLifecycleEvents": true/);
  await page
    .locator('cps-input', { hasText: 'BI dedup window' })
    .locator('input')
    .fill('250');
  await expect(overlay).toHaveValue(/"dedupWindowMs": 250/);

  await press(page, 'Apply and reload');
  const effective = page.locator('.lab-readout');
  await expect(effective).toContainText('"emitLifecycleEvents": true');
  await expect(effective).toContainText('"dedupWindowMs": 250');
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
  await expect(page.locator('uwt-inspector-timeline')).toContainText(
    'lab_button_clicked'
  );
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

test('Settings sets the startup options, and applying them reloads with them', async ({
  page
}) => {
  await openLab(page, 'settings');
  await choose(page, 'Destination', 'noop');
  await choose(page, 'Broadcast channel', 'shared');
  await choose(page, 'Event Inspector', 'noshortcut');
  await toggle(page, 'Telemetry');

  // Nothing changes until applied.
  expect(new URL(page.url()).searchParams.get('destination')).toBeNull();

  await press(page, 'Apply and reload');
  await expect(page).toHaveURL(/destination=noop/);

  const params = new URL(page.url()).searchParams;
  expect(params.get('destination')).toBe('noop');
  expect(params.get('channel')).toBe('shared');
  expect(params.get('inspector')).toBe('noshortcut');
  expect(params.get('telemetry')).toBe('off');
  const header = page.locator('.lab-header');
  await expect(header).toContainText('destination: noop');
  await expect(header).toContainText('telemetry: off');
  await expect(header).toContainText('channel: shared');
});

test("every area's settings are controls on the page, and apply as set", async ({
  page
}) => {
  await openLab(page, 'settings');
  const overlay = page.getByRole('textbox', { name: '?config= (JSON)' });

  await fill(page, 'Event namespace', 'acme');
  await fill(page, 'Default timeout', '12345');
  await fill(page, 'Step limit', '7');
  await fill(page, 'Mark cleanup fallback', '999');
  await toggle(page, 'Redact scenario payloads');
  await choose(page, 'Minimum level', 'warn');
  await toggle(page, 'Mirror errors to RUM');
  await toggle(page, 'Redact log values');
  await fill(page, 'BI dedup keys kept', '77');
  await toggle(page, 'Redact BI payloads');
  await fill(page, 'Longest string', '321');
  await fill(page, 'Most keys', '9');
  await fill(page, 'Longest stack', '456');
  await toggle(page, 'Include stacks');
  await toggle(page, 'Strip URL queries');
  await fill(page, 'Events kept per kind', '25');
  await fill(page, 'Payload characters shown', '1234');
  await fill(page, 'Keep events from before opening', '5');
  await toggle(page, 'Batch logs');

  // Each control writes into the overlay, which shows it.
  await expect(overlay).toHaveValue(/"eventNamespace": "acme"/);
  await expect(overlay).toHaveValue(/"minLevel": "warn"/);
  await expect(overlay).toHaveValue(/"captureBeforeOpen": 5/);
  await expect(overlay).toHaveValue(/"logBatching": true/);

  await press(page, 'Apply and reload');

  const effective = page.locator('.lab-readout');
  for (const line of [
    '"eventNamespace": "acme"',
    '"defaultTimeoutMs": 12345',
    '"maxSteps": 7',
    '"markCleanupFallbackMs": 999',
    '"minLevel": "warn"',
    '"mirrorErrorsToRum": false',
    '"dedupMaxKeys": 77',
    '"maxStringLength": 321',
    '"maxKeys": 9',
    '"maxStackLength": 456',
    '"includeStack": false',
    '"stripUrlQuery": false',
    '"maxEventsPerSection": 25',
    '"maxPayloadCharsInView": 1234',
    '"captureBeforeOpen": 5'
  ]) {
    await expect(effective).toContainText(line);
  }
  // The three `redact` switches each turned their own concern's scrubbing off.
  await expect(overlay).toHaveValue(/"scenarios": \{[^}]*"redact": false/);
  await expect(overlay).toHaveValue(/"logging": \{[^}]*"redact": false/);
  await expect(overlay).toHaveValue(/"bi": \{[^}]*"redact": false/);
});

test('redaction lists are picked from, and written as lines of RegExp sources', async ({
  page
}) => {
  await openLab(page, 'settings');
  const overlay = page.getByRole('textbox', { name: '?config= (JSON)' });

  // The five value patterns start picked; ipv4 is left out, a transform added.
  const patterns = page.getByRole('combobox', {
    name: 'Value patterns scanned'
  });
  await patterns.press('ArrowDown');
  await page.getByRole('option', { name: /^ipv4/ }).click();
  await page.keyboard.press('Escape');
  await expect(overlay).toHaveValue(/"scanValuePatterns": \[[^\]]*"email"/);
  await expect(overlay).not.toHaveValue(/"ipv4"/);
  await choose(page, 'Value transforms', 'mask-order-ids');
  await expect(overlay).toHaveValue(
    /"extraValueTransforms": \[\s*"mask-order-ids"/
  );

  await page
    .getByRole('textbox', { name: /^Extra key patterns/ })
    .fill('^acct_\nsecret');
  await page
    .getByRole('textbox', { name: /^Extra value patterns/ })
    .fill('ORD-\\d+');
  await expect(overlay).toHaveValue(
    /"extraKeyPatterns": \[\s*"\^acct_",\s*"secret"/
  );
  await expect(overlay).toHaveValue(/"extraValuePatterns": \[\s*"ORD-\\\\d\+"/);

  await press(page, 'Apply and reload');

  const effective = page.locator('.lab-readout');
  await expect(effective).toContainText('"email"');
  await expect(effective).not.toContainText('"ipv4"');
  await expect(effective).toContainText('ƒ mask-order-ids');
  await expect(effective).toContainText('/^acct_/i');
  // The readout is JSON: the backslash of `\d` shows doubled.
  await expect(effective).toContainText('/ORD-\\\\d+/');
});

test('loggers each have a level, added and removed one at a time', async ({
  page
}) => {
  await openLab(page, 'settings');
  const overlay = page.getByRole('textbox', { name: '?config= (JSON)' });
  // The lab starts with one: noisy, at warn.
  await expect(page.getByText('noisy', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Remove logger noisy' }).click();
  await fill(page, 'Logger name', 'orders');
  await choose(page, 'Level for a new logger', 'error');
  await press(page, 'Add logger');

  await expect(overlay).toHaveValue(/"levels": \{\s*"orders": "error"\s*\}/);
  await expect(
    page.getByRole('button', { name: 'Remove logger orders' })
  ).toBeVisible();

  await press(page, 'Apply and reload');
  const effective = page.locator('.lab-readout');
  await expect(effective).toContainText('"orders": "error"');
  await expect(effective).not.toContainText('"noisy"');
});

test("the Event Inspector's shortcuts are listed, removed and added", async ({
  page
}) => {
  await openLab(page, 'settings');
  const overlay = page.getByRole('textbox', { name: '?config= (JSON)' });
  await expect(
    page.getByRole('button', { name: 'Remove shortcut Shift+E+I' })
  ).toBeVisible();

  await page.getByRole('button', { name: 'Remove shortcut Shift+E+I' }).click();
  await fill(page, 'Key (KeyboardEvent.code)', 'F9');
  await press(page, 'Add shortcut');
  await expect(overlay).toHaveValue(
    /"shortcuts": \[\s*\{\s*"code": "F9"\s*\}\s*\]/
  );

  await press(page, 'Apply and reload');
  const inspector = page.locator('uwt-inspector');
  await page.keyboard.down('Shift');
  await page.keyboard.press('KeyE');
  await page.keyboard.press('KeyI');
  await page.keyboard.up('Shift');
  await expect(inspector).toHaveCount(0);
  await page.keyboard.press('F9');
  await expect(inspector).toBeVisible();
});

test('inspector settings: a custom shortcut, a smaller section, a smaller view', async ({
  page
}) => {
  await asPane(page);
  await openLab(page, 'inspector', {
    inspector: {
      maxEventsPerSection: 10,
      maxPayloadCharsInView: 1000,
      shortcuts: [{ code: 'F9' }]
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

  await press(page, 'A burst of 600 BI events');
  await expect(inspector).toContainText('10 events · 590 oldest dropped');
  await expect(inspector.locator('cps-button-toggle')).toContainText('BI 10');

  await press(page, 'A 300,000-character payload');
  const timeline = page.locator('uwt-inspector-timeline');
  await timeline
    .locator('tbody tr', { hasText: 'lab_huge_payload' })
    .getByRole('button', { name: 'Expand row' })
    .click();
  await expect(timeline).toContainText(/showing the first 1,?000 characters/);
});

test('a pattern that is not a RegExp is left out with a warning, and the lab still starts', async ({
  page,
  backend
}) => {
  const warnings: string[] = [];
  page.on('console', (m) => m.type() === 'warning' && warnings.push(m.text()));
  await openLab(page, 'logging', {
    redaction: { extraKeyPatterns: ['(', '^orderId$'] }
  });
  await press(page, 'error, with an Error');
  expect((await onlyLog(backend)).metadata).toEqual({ orderId: '[redacted]' });
  expect(warnings).toContainEqual(
    expect.stringContaining('"(" isn\'t a RegExp')
  );
});

test('the start page keeps the startup options', async ({ page }) => {
  await page.goto('/?destination=noop');
  await expect(page).toHaveURL(/\/scenarios\?destination=noop$/);
});

test('in-app links keep the startup options, and so does applying an overlay', async ({
  page
}) => {
  await openLab(page, 'bi?destination=noop');
  await navigate(page, 'Settings');
  expect(new URL(page.url()).searchParams.get('destination')).toBe('noop');
  await page
    .getByRole('textbox', { name: '?config= (JSON)' })
    .fill('{ "bi": { "dedupWindowMs": 0 } }');
  await press(page, 'Apply and reload');

  await expect(page.locator('.lab-header')).toContainText('config: custom');
  await expect(page.locator('.lab-header')).toContainText('destination: noop');
  expect(new URL(page.url()).searchParams.get('destination')).toBe('noop');
});
