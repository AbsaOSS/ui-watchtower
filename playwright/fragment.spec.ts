import { expect, named, openLab, press, sessionStarted, test } from './lab';

test('the fragment sends through the shell: once, under its own name, in the shell session', async ({
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
  await openLab(page, 'fragment');
  await sessionStarted(page);
  const fragment = page.frameLocator('iframe.lab-fragment');
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
