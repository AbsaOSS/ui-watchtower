import { expect, named, openLab, press, test } from './lab';

test("on a shared channel, one tab's host leads for every tab, and another takes over when it closes", async ({
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
    await openLab(tab, 'web-fragment?channel=shared');
    await expect(tab.locator('web-fragment h1')).toHaveText('lab-fragment');
    await tab.locator('.lab-header-button').click();
    await expect(tab.locator('uwt-inspector')).toBeVisible();
  }
  const [first, second] = tabs;
  await expect(first.locator('.lab-header')).toContainText('channel: shared');

  // The second tab's fragment is heard by the first tab's host, the leader.
  await press(second.locator('web-fragment'), 'Track a BI event');
  await expect(first.locator('uwt-inspector')).toContainText(
    'fragment_button_clicked'
  );
  await expect(second.locator('uwt-inspector')).not.toContainText(
    'fragment_button_clicked'
  );

  // With the leader's tab gone, the second tab's host takes over.
  await first.close();
  await press(second.locator('web-fragment'), 'Run a scenario');
  await expect(second.locator('uwt-inspector')).toContainText(
    'fragment-journey'
  );
  const events = await backend.rumUntil(
    (e) => named(e, 'fragment-journey').length > 0
  );
  expect(named(events, 'fragment_button_clicked')).toHaveLength(1);
  expect(named(events, 'fragment-journey')).toHaveLength(1);
});
