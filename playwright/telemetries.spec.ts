import {
  expect,
  openLab,
  press,
  RumEvent,
  sessionStarted,
  Telemetry,
  test
} from './lab';

const ALL: Telemetry[] = [
  'errors',
  'performance',
  'interaction',
  'http',
  'replay'
];

const types = (events: RumEvent[]) =>
  [...new Set(events.map((e) => e.type.replace('com.amazon.rum.', '')))].sort();

const cases: {
  name: string;
  telemetries: Telemetry[] | null;
  chip: string;
  expected: (types: string[]) => void;
}[] = [
  {
    name: "the library's default",
    telemetries: null,
    chip: 'default',
    expected: (t) => {
      expect(t).toEqual(
        expect.arrayContaining([
          'performance_navigation_event',
          'xray_trace_event'
        ])
      );
      expect(t).not.toContain('dom_event');
      expect(t).not.toContain('rrweb_event');
    }
  },
  {
    name: 'none',
    telemetries: [],
    chip: 'none',
    // Only RUM's session start and page views: without 'errors', RUM rejects
    // the mirrored error, so no error event is sent either.
    expected: (t) =>
      expect(t.filter((type) => !/session_start|page_view/.test(type))).toEqual(
        []
      )
  },
  {
    name: 'all five',
    telemetries: ALL,
    chip: ALL.join(', '),
    expected: (t) =>
      expect(t).toEqual(expect.arrayContaining(['dom_event', 'rrweb_event']))
  }
];

for (const { name, telemetries, chip, expected } of cases) {
  test(`RUM telemetries, ${name}: as set, quiet while idle, errors mirrored only with 'errors'`, async ({
    page,
    backend
  }) => {
    await backend.setTelemetries(telemetries);
    await openLab(page, 'logging');
    const session = await sessionStarted(page);
    await expect(page.locator('.lab-header')).toContainText(
      `rum telemetries: ${chip}`
    );
    const mine = async () =>
      (await backend.rum()).filter((e) => e.user.sessionId === session);

    // Replay sends its opening snapshot about 5 s in; after that, nothing
    // should arrive while nobody uses the page — the lab's own polling least
    // of all.
    await page.waitForTimeout(8000);
    const loaded = (await mine()).length;
    await page.waitForTimeout(6000);
    expect((await mine()).length).toBe(loaded);

    await press(page, 'error, with an Error');
    const mirrored = async () =>
      (await mine()).some(
        (e) =>
          e.type === 'com.amazon.rum.js_error_event' &&
          JSON.stringify(e.details).includes('Connection reset')
      );
    if (telemetries === null || telemetries.includes('errors')) {
      await expect.poll(mirrored).toBe(true);
    } else {
      // RUM rejects the error without its 'errors' telemetry; give it time.
      await page.waitForTimeout(2000);
      expect(await mirrored()).toBe(false);
    }

    const events = await mine();
    expect(events.filter((e) => JSON.stringify(e).includes('/__lab/'))).toEqual(
      []
    );
    expected(types(events));
  });
}

test('Settings switches between the default and a list to edit, set on Apply', async ({
  page,
  backend
}) => {
  await openLab(page, 'settings/rum-broker');
  const telemetriesList = page.locator('cps-select[label="Telemetries"]');
  const useDefault = page
    .locator('cps-switch', { hasText: "The library's default" })
    .locator('label.cps-switch');
  await expect(telemetriesList).toHaveCount(0);

  await useDefault.click();
  await expect(telemetriesList).toBeVisible();
  await press(page, 'Apply and reload');
  await expect(page.locator('.lab-header')).toContainText(
    'rum telemetries: errors, performance, http'
  );
  expect((await backend.state()).telemetries).toEqual([
    'errors',
    'performance',
    'http'
  ]);

  await useDefault.click();
  await expect(telemetriesList).toHaveCount(0);
  await press(page, 'Apply and reload');
  await expect(page.locator('.lab-header')).toContainText(
    'rum telemetries: default'
  );
  expect((await backend.state()).telemetries).toBeNull();
});
