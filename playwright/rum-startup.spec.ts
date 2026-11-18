import {
  expect,
  named,
  navigate,
  openLab,
  Page,
  press,
  RumEvent,
  sessionStarted,
  test
} from './lab';

const clicks = (events: RumEvent[]) => named(events, 'lab_button_clicked');

/** Console warnings, and the requests to RUM's dataplane, as they happen. */
function watch(page: Page): { warnings: string[]; sent: string[] } {
  const seen = { warnings: [] as string[], sent: [] as string[] };
  page.on('console', (m) => {
    if (m.type() === 'warning') {
      seen.warnings.push(m.text());
    }
  });
  page.on('request', (r) => {
    if (r.url().includes('/appmonitors/')) {
      seen.sent.push(r.url());
    }
  });
  return seen;
}

test('a broker that fails at first: RUM retries, then sends what was tracked meanwhile', async ({
  page,
  backend
}) => {
  const { warnings } = watch(page);
  await backend.setBrokerMode('flaky');
  await openLab(page, 'bi');
  await press(page, 'Track a click');

  await sessionStarted(page);
  const events = await backend.rumUntil((e) => clicks(e).length > 0);
  expect(clicks(events)).toHaveLength(1);
  expect((await backend.state()).brokerCalls).toBe(3);
  expect(warnings).toContainEqual(
    expect.stringContaining('RUM init failed, retrying')
  );
});

test('settings of the wrong type: RUM never starts, and the console says which', async ({
  page,
  backend
}) => {
  const { warnings, sent } = watch(page);
  await backend.setBrokerMode('invalid');
  await openLab(page, 'bi');
  await press(page, 'Track a click');

  await expect
    .poll(() => warnings)
    .toContainEqual(
      expect.stringContaining(
        'RUM not started, settings of the wrong type: pagesToExclude'
      )
    );
  // RUM would have sent within two of its 2-second dispatches.
  await page.waitForTimeout(4500);
  expect(sent).toEqual([]);
});

test('settings left null count as unset: RUM starts as usual', async ({
  page,
  backend
}) => {
  const { warnings } = watch(page);
  await backend.setBrokerConfig({
    pagesToInclude: null,
    sessionSampleRate: null,
    telemetries: null
  });
  await openLab(page, 'bi');
  await sessionStarted(page);
  await press(page, 'Track a click');
  await backend.rumUntil((e) => clicks(e).length > 0);
  expect(warnings.filter((w) => w.includes('RUM not started'))).toEqual([]);
});

test('a refresh answered with null turns RUM off for the page', async ({
  page,
  backend
}) => {
  await backend.setBrokerMode('null-on-refresh');
  await openLab(page, 'bi');
  await sessionStarted(page);
  await press(page, 'Track a click');
  await backend.rumUntil((e) => clicks(e).length > 0);

  await expect
    .poll(async () => (await backend.state()).brokerCalls, { timeout: 15_000 })
    .toBe(2);
  // RUM is off once the page has the null: no session any more.
  await expect(page.locator('.lab-status')).toContainText('session: —');
  await press(page, 'Fire twice at once');
  await page.waitForTimeout(4500);
  expect(named(await backend.rum(), 'lab_double_fired')).toEqual([]);
});

test("each page load is the broker's first call: a reload starts RUM again", async ({
  page,
  backend
}) => {
  await backend.setBrokerMode('null-on-refresh');
  await openLab(page, 'bi');
  const first = await sessionStarted(page);
  await page.reload();
  await expect(page.locator('html[data-lab-ready]')).toHaveCount(1);
  expect(await sessionStarted(page)).toBe(first);
});

test('a refresh without credentials keeps the old ones: events still arrive', async ({
  page,
  backend
}) => {
  const { warnings } = watch(page);
  await backend.setBrokerMode('no-credentials-on-refresh');
  await openLab(page, 'bi');
  await sessionStarted(page);

  await expect
    .poll(async () => (await backend.state()).brokerCalls, { timeout: 15_000 })
    .toBe(2);
  await expect
    .poll(() => warnings)
    .toContainEqual(expect.stringContaining('RUM credential refresh'));
  await press(page, 'Track a click');
  await backend.rumUntil((e) => clicks(e).length > 0);
});

test('a session sampled out sends nothing', async ({ page, backend }) => {
  const { sent } = watch(page);
  await backend.setBrokerConfig({ sessionSampleRate: 0 });
  await openLab(page, 'bi');
  await press(page, 'Track a click');
  await page.waitForTimeout(4500);
  expect(sent).toEqual([]);
});

test('without cookies, scenario records carry no sessionElapsed', async ({
  page,
  backend
}) => {
  await backend.setBrokerConfig({ allowCookies: false });
  await openLab(page, 'scenarios');
  await sessionStarted(page);
  await press(page, 'Complete, with 3 steps');
  const events = await backend.rumUntil(
    (e) => named(e, 'lab-happy-path').length > 0
  );
  expect(named(events, 'lab-happy-path')[0].details).not.toHaveProperty(
    'sessionElapsed'
  );
});

test('before the first setUserId, events carry no signedIn', async ({
  page,
  backend
}) => {
  await openLab(page, 'bi');
  await sessionStarted(page);
  await press(page, 'Track a click');
  const events = await backend.rumUntil((e) => clicks(e).length > 0);
  expect(clicks(events)[0].metadata).not.toHaveProperty('signedIn');
});

test('recordPageView adds a page view of its own', async ({
  page,
  backend
}) => {
  await openLab(page, 'lifecycle');
  await sessionStarted(page);
  await press(page, 'Record a page view');
  await backend.rumUntil((e) =>
    e.some(
      (event) =>
        event.type === 'com.amazon.rum.page_view_event' &&
        event.details.pageId === '/lab/virtual-page'
    )
  );
});

test('Flush now sends at once what would wait for the next batch', async ({
  page,
  backend
}) => {
  await backend.setBrokerConfig({ dispatchInterval: 60_000 });
  await openLab(page, 'bi');
  await sessionStarted(page);
  await press(page, 'Track a click');
  await page.waitForTimeout(3000);
  expect(clicks(await backend.rum())).toEqual([]);

  await navigate(page, 'Lifecycle');
  await press(page, 'Flush now');
  await backend.rumUntil((e) => clicks(e).length > 0, 3000);
});
