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
    await expect(fragment.locator('p').first()).toContainText(
      clicked[0].user.sessionId!.slice(0, 8)
    );

    await expect
      .poll(async () => (await backend.logs()).map((r) => r.application))
      .toContain('lab-fragment');
    await press(fragment, 'Query its logs');
    await expect(fragment.locator('.lab-readout')).toContainText(
      'answered by the shell'
    );

    await expect(page.locator('uwt-inspector')).toContainText('↪ lab-fragment');
  });
}
