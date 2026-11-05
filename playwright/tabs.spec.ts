import { expect, named, openLab, press, test } from './lab';

test("two tabs: each fragment reaches its own tab's shell, over that tab's channel", async ({
  context,
  backend
}) => {
  // Both Event Inspectors open as panes, beside their fragments.
  await context.addInitScript(() =>
    localStorage.setItem(
      'ngx-ui-watchtower.eventInspector',
      JSON.stringify({ dock: 'right' })
    )
  );
  const tabs = [await context.newPage(), await context.newPage()];
  for (const tab of tabs) {
    await openLab(tab, 'web-fragment');
    await expect(tab.locator('web-fragment h1')).toHaveText('lab-fragment');
    await tab.locator('.lab-header-button').click();
    await expect(tab.locator('uwt-inspector')).toBeVisible();
  }
  const [first, second] = tabs;

  await press(second.locator('web-fragment'), 'Track a BI event');

  // The fragment found its shell's channel on `window.top`, from inside the
  // Web Fragment's hidden iframe: only its own tab saw the event.
  await expect(second.locator('uwt-inspector')).toContainText(
    'fragment_button_clicked'
  );
  const events = await backend.rumUntil(
    (e) => named(e, 'fragment_button_clicked').length > 0
  );
  expect(named(events, 'fragment_button_clicked')).toHaveLength(1);
  await expect(first.locator('uwt-inspector')).not.toContainText(
    'fragment_button_clicked'
  );
});
