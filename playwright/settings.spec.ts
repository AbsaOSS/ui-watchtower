import {
  applyAndReload,
  expect,
  LogRecord,
  named,
  navigate,
  openLab,
  Page,
  press,
  sessionStarted,
  settingsSection,
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

/** What the select labelled `label` shows as chosen. */
const shown = (page: Page, label: string) =>
  page
    .locator('cps-select', { hasText: label })
    .locator('[data-testid="cps-select-selected-value"]');

/** The bar listing the changes not applied yet. */
const pending = (page: Page) =>
  page.getByRole('region', { name: 'Changes not applied' });

/** The library's settings as JSON, in their own section. */
async function json(page: Page) {
  await settingsSection(page, 'Configuration as JSON');
  return page.getByRole('textbox', { name: 'Settings (JSON)' });
}

/** The settings in effect, in their own section. */
async function effective(page: Page) {
  await settingsSection(page, 'Effective configuration');
  return page.locator('.lab-readout');
}

/** Waits for the log backend to hold one record, and returns it. */
async function onlyLog(backend: {
  logs(): Promise<LogRecord[]>;
}): Promise<LogRecord> {
  await expect.poll(async () => (await backend.logs()).length).toBe(1);
  return (await backend.logs())[0];
}

test('Settings sits at the foot of the nav, apart from the pages, and opens on its overview', async ({
  page
}) => {
  await openLab(page, 'bi?destination=noop');
  const nav = page.locator('.lab-nav');
  await expect(
    nav.getByRole('list', { name: 'Tools' }).getByRole('link')
  ).toHaveText(['Event Inspector', 'On the wire']);
  const last = (await nav
    .getByRole('link', { name: 'On the wire' })
    .boundingBox())!;
  const settings = (await nav
    .getByRole('link', { name: 'Settings' })
    .boundingBox())!;
  // Well below the last page, just above the status bar.
  expect(settings.y).toBeGreaterThan(last.y + 3 * last.height);
  expect(settings.y + settings.height).toBeGreaterThan(
    page.viewportSize()!.height - 36 - 48
  );

  await navigate(page, 'Settings');
  await expect(page).toHaveURL(/\/settings\?destination=noop$/);
  await expect(page).toHaveTitle('Settings · Watchtower Lab');
});

test('each section of Settings is a page of its own, listed by area, saying how it applies', async ({
  page
}) => {
  await openLab(page, 'settings?destination=noop');
  const sections = page.getByRole('navigation', { name: 'Settings sections' });
  const areas = {
    Library: [
      'App identity',
      'Delivery',
      'Scenarios',
      'BI events',
      'Logging',
      'Privacy & redaction',
      'Event Inspector'
    ],
    'Mock backend': ['RUM broker', 'App monitor'],
    Diagnostics: ['Debug flags'],
    Advanced: ['Configuration as JSON', 'Effective configuration']
  };
  for (const [area, labels] of Object.entries(areas)) {
    await expect(
      sections.getByRole('list', { name: area }).getByRole('link')
    ).toHaveText(labels);
  }

  const main = page.locator('lab-root main');
  await settingsSection(page, 'Logging');
  await expect(page).toHaveURL(/\/settings\/logging\?destination=noop$/);
  await expect(page).toHaveTitle('Logging · Settings · Watchtower Lab');
  await expect(main).toContainText('Applies on reload');
  await settingsSection(page, 'RUM broker');
  await expect(main).toContainText('Applies on reload, in every tab');
  await settingsSection(page, 'Debug flags');
  await expect(main).toContainText('Applies at once, in this browser');
});

test('changes wait in one bar across the sections, marked in their list, until discarded', async ({
  page
}) => {
  await openLab(page, 'settings/logging');
  const bar = pending(page);
  await expect(bar).toHaveCount(0);

  await choose(page, 'Minimum level', 'warn');
  await expect(bar).toContainText('1 change not applied');
  await expect(bar).toContainText('Logging › Minimum level');
  await settingsSection(page, 'Scenarios');
  await toggle(page, 'Lifecycle step events');
  await expect(bar).toContainText('2 changes not applied');
  const sections = page.getByRole('navigation', { name: 'Settings sections' });
  await expect(
    sections.getByRole('link', { name: /changes not applied/ })
  ).toHaveCount(2);
  await expect(
    sections.getByRole('link', { name: 'Logging (changes not applied)' })
  ).toBeVisible();

  // Kept while the sections change.
  await settingsSection(page, 'Logging');
  await expect(shown(page, 'Minimum level')).toHaveText(
    'warn — warnings and errors'
  );

  await bar.getByRole('link', { name: 'Review' }).click();
  const review = page.locator('lab-settings-overview');
  await expect(review.locator('h1')).toHaveText('Settings');
  await expect(review).toContainText('Logging › Minimum level');
  await expect(review).toContainText('log → warn');
  await expect(review).toContainText('Scenarios › Lifecycle step events');
  await expect(review).toContainText('off → on');

  await press(page, 'Discard');
  await expect(bar).toHaveCount(0);
  await expect(review).toContainText('Nothing');
  await settingsSection(page, 'Logging');
  await expect(shown(page, 'Minimum level')).toHaveText('log — everything');
});

test('a setting set back as it was is no change', async ({ page }) => {
  await openLab(page, 'settings/scenarios');
  await toggle(page, 'Lifecycle step events');
  await expect(pending(page)).toBeVisible();
  await toggle(page, 'Lifecycle step events');
  await expect(pending(page)).toHaveCount(0);
});

test("JSON that isn't an object: its controls say why they're off, and Apply's bar shows the way to fix it", async ({
  page
}) => {
  await openLab(page, 'settings/json');
  await page.getByRole('textbox', { name: 'Settings (JSON)' }).fill('[1, 2]');
  await settingsSection(page, 'Logging');
  await expect(page.locator('lab-settings-section')).toContainText(
    "These controls are off while the JSON in Configuration as JSON isn't an object."
  );

  await press(page, 'Apply and reload');
  const problem = pending(page).getByRole('alert');
  await expect(problem).toContainText(
    'Configuration as JSON: Not a JSON object.'
  );
  await problem.getByRole('link', { name: 'Configuration as JSON' }).click();
  await expect(page.locator('lab-root main h1').first()).toHaveText(
    'Configuration as JSON'
  );
  await expect(page.locator('.lab-header')).not.toContainText('config:');
});

test('on a narrow screen, the sections of Settings fold into a picker', async ({
  page
}) => {
  await page.setViewportSize({ width: 800, height: 700 });
  await openLab(page, 'settings/logging');
  await expect(
    page.getByRole('navigation', { name: 'Settings sections' })
  ).toBeHidden();
  await expect(shown(page, 'Section')).toHaveText('Library › Logging');

  await choose(page, 'Section', 'Library › Scenarios');
  await expect(page).toHaveURL(/\/settings\/scenarios$/);
  await expect(page.locator('lab-root main h1').first()).toHaveText(
    'Scenarios'
  );
});

test('Settings applies an overlay, shows it in effect, and goes back', async ({
  page
}) => {
  await openLab(page, 'settings/json');
  const header = page.locator('.lab-header');
  await expect(header).not.toContainText('config:');

  await page
    .getByRole('textbox', { name: 'Settings (JSON)' })
    .fill('{ "bi": { "dedupWindowMs": 0 } }');
  await applyAndReload(page);
  await expect(header).toContainText('config: custom');
  await expect(await effective(page)).toContainText('"dedupWindowMs": 0');

  await settingsSection(page, 'Overview');
  await press(page, "Back to the lab's settings");
  await expect(header).not.toContainText('config:');
  await expect(await effective(page)).toContainText('"dedupWindowMs": 400');
});

test('Settings checks the overlay against the library: no unknown setting, no wrong type', async ({
  page
}) => {
  await openLab(page, 'settings/json');
  const overlay = page.getByRole('textbox', { name: 'Settings (JSON)' });
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
  await openLab(page, 'settings/json', { bi: { dedupWindowMs: '500' } });
  const overlay = page.getByRole('textbox', { name: 'Settings (JSON)' });

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
  await openLab(page, 'settings/json');
  await expect(
    page.getByRole('textbox', { name: 'Settings (JSON)' })
  ).toHaveValue('{}');

  await settingsSection(page, 'Scenarios');
  await toggle(page, 'Lifecycle step events');
  await settingsSection(page, 'BI events');
  await fill(page, 'BI dedup window', '250');
  const overlay = await json(page);
  await expect(overlay).toHaveValue(/"emitLifecycleEvents": true/);
  await expect(overlay).toHaveValue(/"dedupWindowMs": 250/);

  await applyAndReload(page);
  const readout = await effective(page);
  await expect(readout).toContainText('"emitLifecycleEvents": true');
  await expect(readout).toContainText('"dedupWindowMs": 250');
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
  await openLab(page, 'settings/delivery');
  await choose(page, 'Destination', 'noop');
  await choose(page, 'Broadcast channel', 'shared');
  await toggle(page, 'Telemetry');
  await settingsSection(page, 'Event Inspector');
  await choose(page, 'Availability', 'no shortcut');

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

test("every area's settings are controls in its section, and apply together as set", async ({
  page
}) => {
  await openLab(page, 'settings/app-identity');
  await fill(page, 'Event namespace', 'acme');
  await settingsSection(page, 'Scenarios');
  await fill(page, 'Default timeout', '12345');
  await fill(page, 'Step limit', '7');
  await fill(page, 'Mark cleanup fallback', '999');
  await toggle(page, 'Redact scenario payloads');
  await settingsSection(page, 'Logging');
  await choose(page, 'Minimum level', 'warn');
  await toggle(page, 'Mirror errors to RUM');
  await toggle(page, 'Redact log values');
  await settingsSection(page, 'BI events');
  await fill(page, 'BI dedup keys kept', '77');
  await toggle(page, 'Redact BI payloads');
  await settingsSection(page, 'Privacy & redaction');
  await fill(page, 'Longest string', '321');
  await fill(page, 'Most keys', '9');
  await fill(page, 'Longest stack', '456');
  await toggle(page, 'Include stacks');
  await toggle(page, 'Strip URL queries');
  await settingsSection(page, 'Event Inspector');
  await fill(page, 'Events kept per kind', '25');
  await fill(page, 'Payload characters shown', '1234');
  await fill(page, 'Keep events from before opening', '5');
  await settingsSection(page, 'Delivery');
  await toggle(page, 'Batch logs');

  // Each control writes into the overlay, which shows it.
  const overlay = await json(page);
  await expect(overlay).toHaveValue(/"eventNamespace": "acme"/);
  await expect(overlay).toHaveValue(/"minLevel": "warn"/);
  await expect(overlay).toHaveValue(/"captureBeforeOpen": 5/);
  await expect(overlay).toHaveValue(/"logBatching": true/);

  await applyAndReload(page);

  const readout = await effective(page);
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
    await expect(readout).toContainText(line);
  }
  // The three `redact` switches each turned their own concern's scrubbing off.
  const applied = await json(page);
  await expect(applied).toHaveValue(/"scenarios": \{[^}]*"redact": false/);
  await expect(applied).toHaveValue(/"logging": \{[^}]*"redact": false/);
  await expect(applied).toHaveValue(/"bi": \{[^}]*"redact": false/);
});

test('redaction lists are picked from, and written as lines of RegExp sources', async ({
  page
}) => {
  await openLab(page, 'settings/privacy');

  // The five value patterns start picked; ipv4 is left out, a transform added.
  const patterns = page.getByRole('combobox', {
    name: 'Value patterns scanned'
  });
  await patterns.press('ArrowDown');
  await page.getByRole('option', { name: /^ipv4/ }).click();
  await page.keyboard.press('Escape');
  await choose(page, 'Value transforms', 'mask-order-ids');
  await page
    .getByRole('textbox', { name: /^Extra key patterns/ })
    .fill('^acct_\nsecret');
  await page
    .getByRole('textbox', { name: /^Extra value patterns/ })
    .fill('ORD-\\d+');

  const overlay = await json(page);
  await expect(overlay).toHaveValue(/"scanValuePatterns": \[[^\]]*"email"/);
  await expect(overlay).not.toHaveValue(/"ipv4"/);
  await expect(overlay).toHaveValue(
    /"extraValueTransforms": \[\s*"mask-order-ids"/
  );
  await expect(overlay).toHaveValue(
    /"extraKeyPatterns": \[\s*"\^acct_",\s*"secret"/
  );
  await expect(overlay).toHaveValue(/"extraValuePatterns": \[\s*"ORD-\\\\d\+"/);

  await applyAndReload(page);

  const readout = await effective(page);
  await expect(readout).toContainText('"email"');
  await expect(readout).not.toContainText('"ipv4"');
  await expect(readout).toContainText('ƒ mask-order-ids');
  await expect(readout).toContainText('/^acct_/i');
  // The readout is JSON: the backslash of `\d` shows doubled.
  await expect(readout).toContainText('/ORD-\\\\d+/');
});

test('loggers each have a level, added and removed one at a time', async ({
  page
}) => {
  await openLab(page, 'settings/logging');
  // The lab starts with one: noisy, at warn.
  await expect(page.getByText('noisy', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Remove logger noisy' }).click();
  await fill(page, 'Logger name', 'orders');
  await choose(page, 'Level for a new logger', 'error');
  await press(page, 'Add logger');
  await expect(
    page.getByRole('button', { name: 'Remove logger orders' })
  ).toBeVisible();
  await expect(await json(page)).toHaveValue(
    /"levels": \{\s*"orders": "error"\s*\}/
  );

  await applyAndReload(page);
  const readout = await effective(page);
  await expect(readout).toContainText('"orders": "error"');
  await expect(readout).not.toContainText('"noisy"');
});

test("the Event Inspector's shortcuts are listed, removed and added", async ({
  page
}) => {
  await openLab(page, 'settings/event-inspector');
  await expect(
    page.getByRole('button', { name: 'Remove shortcut Shift+E+I' })
  ).toBeVisible();

  await page.getByRole('button', { name: 'Remove shortcut Shift+E+I' }).click();
  await fill(page, 'Key (KeyboardEvent.code)', 'F9');
  await press(page, 'Add shortcut');
  await expect(await json(page)).toHaveValue(
    /"shortcuts": \[\s*\{\s*"code": "F9"\s*\}\s*\]/
  );

  await applyAndReload(page);
  const inspector = page.locator('uwt-inspector');
  await page.keyboard.down('Shift');
  await page.keyboard.press('KeyE');
  await page.keyboard.press('KeyI');
  await page.keyboard.up('Shift');
  await expect(inspector).toHaveCount(0);
  await page.keyboard.press('F9');
  await expect(inspector).toBeVisible();
});

test("the application's identity is set from the page", async ({ page }) => {
  await openLab(page, 'settings/app-identity');

  await fill(page, 'Application name', 'acme-shop');
  await fill(page, 'Environment', 'qa');
  await fill(page, 'Version', '2.3.4');
  await applyAndReload(page);

  const readout = await effective(page);
  await expect(readout).toContainText('"application": "acme-shop"');
  await expect(readout).toContainText('"environment": "qa"');
  await expect(readout).toContainText('"version": "2.3.4"');
});

test("the mock broker's app monitor settings are controls, and apply with the rest", async ({
  page,
  backend
}) => {
  await openLab(page, 'settings/app-monitor');
  const config = page.getByRole('textbox', {
    name: 'Laid over the app monitor config (JSON)'
  });

  await fill(page, 'Session sample rate', '0.5');
  await fill(page, 'Session event limit', '25');
  await fill(page, 'Dispatch interval', '500');
  await toggle(page, 'Allow cookies');
  await toggle(page, 'X-Ray tracing');
  await toggle(page, 'Automatic page view');
  await toggle(page, 'Record resource URLs');
  await page
    .getByRole('textbox', { name: /^Pages to exclude/ })
    .fill('^/admin');
  await page
    .getByRole('textbox', { name: /^Pages to include/ })
    .fill('^/shop\n^/cart');

  // Each control writes into the overlay, which shows it.
  await expect(config).toHaveValue(/"sessionSampleRate":0.5/);
  await expect(config).toHaveValue(
    /"pagesToInclude":\["\^\/shop","\^\/cart"\]/
  );
  // Nothing is set until applied.
  expect((await backend.state()).brokerConfig).toEqual({});

  await press(page, 'Apply and reload');
  await expect
    .poll(async () => (await backend.state()).brokerConfig)
    .toEqual({
      sessionSampleRate: 0.5,
      sessionEventLimit: 25,
      dispatchInterval: 500,
      allowCookies: false,
      enableXRay: true,
      disableAutoPageView: true,
      recordResourceUrl: false,
      pagesToExclude: ['^/admin'],
      pagesToInclude: ['^/shop', '^/cart']
    });
});

test('the broker controls start at what the broker answers with', async ({
  page
}) => {
  await openLab(page, 'settings/app-monitor');
  const { config } = await (await page.request.get('/rum/init')).json();

  const shown = async (label: string) =>
    page.locator('cps-input', { hasText: label }).locator('input').inputValue();
  expect(await shown('Session sample rate')).toBe(
    String(config.sessionSampleRate)
  );
  expect(await shown('Session event limit')).toBe(
    String(config.sessionEventLimit)
  );
  expect(await shown('Dispatch interval')).toBe(
    String(config.dispatchInterval)
  );
  // On, as the broker's answer has it.
  await expect(
    page.locator('cps-switch', { hasText: 'Allow cookies' }).locator('input')
  ).toBeChecked({ checked: config.allowCookies });
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
  await (await json(page)).fill('{ "bi": { "dedupWindowMs": 0 } }');
  expect(new URL(page.url()).searchParams.get('destination')).toBe('noop');
  await press(page, 'Apply and reload');

  await expect(page.locator('.lab-header')).toContainText('config: custom');
  await expect(page.locator('.lab-header')).toContainText('destination: noop');
  expect(new URL(page.url()).searchParams.get('destination')).toBe('noop');
});
