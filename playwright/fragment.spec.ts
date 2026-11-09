import {
  expect,
  FrameLocator,
  Locator,
  named,
  openLab,
  Page,
  press,
  sessionStarted,
  test
} from './lab';

const CARLA = '5c8e2f14-1b7d-4a96-9e3c-8d2b7f4a6c10';

/** The same fragment build, composed into the shell two ways. */
const COMPOSITIONS: {
  name: string;
  path: string;
  fragment: (page: Page) => FrameLocator | Locator;
}[] = [
  {
    name: 'in a plain iframe',
    path: 'fragment',
    fragment: (page) => page.frameLocator('iframe.lab-fragment')
  },
  {
    name: 'as a Web Fragment',
    path: 'web-fragment',
    // Its page is in the <web-fragment>'s shadow root, which locators pierce.
    fragment: (page) => page.locator('web-fragment')
  }
];

for (const { name, path, fragment: locate } of COMPOSITIONS) {
  test(`the fragment ${name} sends through the shell: once, under its own name, in the shell's session`, async ({
    page,
    backend
  }) => {
    // The Event Inspector opens as a pane, beside the fragment rather than on it.
    await page.addInitScript(() =>
      localStorage.setItem(
        'ngx-ui-watchtower.eventInspector',
        JSON.stringify({ dock: 'right' })
      )
    );
    await openLab(page, path);
    await sessionStarted(page);
    const fragment = locate(page);
    await expect(fragment.locator('h1')).toHaveText('lab-fragment');
    // Open first: the Event Inspector shows what arrives from then on.
    await page.locator('.lab-header-button').click();

    await press(fragment, 'Track a BI event');
    await press(fragment, 'Run a scenario');
    await press(fragment, 'Log a warning');

    const events = await backend.rumUntil(
      (e) =>
        named(e, 'fragment_button_clicked').length > 0 &&
        named(e, 'fragment-journey').length > 0
    );
    const clicked = named(events, 'fragment_button_clicked');
    expect(clicked).toHaveLength(1);
    expect(clicked[0].details.application).toBe('lab-fragment');
    expect(named(events, 'fragment-journey')[0].details.status).toBe('success');
    await expect(fragment.locator('p').first()).toContainText(
      clicked[0].user.sessionId!.slice(0, 8)
    );

    await expect
      .poll(async () => (await backend.logs()).map((r) => r.application))
      .toContain('lab-fragment');
    await press(fragment, 'Query its logs');
    await expect(fragment.locator('.lab-readout')).toContainText(
      /[1-9]\d* record\(s\), answered by the shell/
    );

    await expect(page.locator('uwt-inspector')).toContainText('↪ lab-fragment');

    // Its errors are mirrored to RUM by the shell, named for the fragment.
    await press(fragment, 'Log an error');
    await backend.rumUntil((e) =>
      e.some(
        (event) =>
          event.type === 'com.amazon.rum.js_error_event' &&
          JSON.stringify(event.details).includes('[lab-fragment] Error')
      )
    );

    // Signing in or out in the fragment applies to the shell.
    await press(fragment, 'Sign in as Carla');
    await expect(page.locator('.lab-status')).toContainText(CARLA);
    await press(fragment, 'Sign out');
    await expect(page.locator('.lab-status')).not.toContainText(CARLA);
  });
}

test('the fragment on its own, with no shell, carries on and sends nothing', async ({
  page
}) => {
  // Its own requests, not the backend's: a page that closed before this
  // test may still be sending.
  const sent: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST') {
      sent.push(r.url());
    }
  });
  await page.goto('/fragment-frame/');
  await expect(page.locator('h1')).toHaveText('lab-fragment');
  await press(page, 'Track a BI event');
  await press(page, 'Log a warning');

  await page.waitForTimeout(2000);
  await expect(page.locator('p').first()).toContainText('Session — · user —');
  expect(sent).toEqual([]);
});
