import {
  expect,
  navigate,
  openLab,
  press,
  RumEvent,
  sessionStarted,
  test
} from './lab';

const ANNA = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

const tracked = (events: RumEvent[]) =>
  events.filter((e) => e.details.eventName === 'lab_button_clicked');

test.beforeEach(async ({ page }) => {
  await openLab(page, 'identity');
  await sessionStarted(page);
  await press(page, 'Sign in as Anna');
  await expect(page.locator('.lab-status')).toContainText(ANNA);
});

test('after signing in, events carry the user and signedIn: true', async ({
  page,
  backend
}) => {
  await navigate(page, 'BI events');
  await press(page, 'Track a click');

  const events = await backend.rumUntil((e) => tracked(e).length > 0);
  expect(tracked(events)[0].user.userId).toBe(ANNA);
  expect(tracked(events)[0].metadata.signedIn).toBe(true);
  await expect(page.locator('.lab-header')).toContainText('Signed in');
});

for (const signOut of ['Sign out (undefined)', "Sign out ('')"]) {
  test(`${signOut}: a new session, and events no longer carry the user`, async ({
    page,
    backend
  }) => {
    const before = await sessionStarted(page);
    await press(page, signOut);
    await expect(page.locator('.lab-status')).not.toContainText(ANNA);
    await expect(page.locator('.lab-status')).not.toContainText(before);

    await navigate(page, 'BI events');
    await press(page, 'Track a click');
    const events = await backend.rumUntil((e) => tracked(e).length > 0);
    expect(tracked(events)[0].user.userId).not.toBe(ANNA);
    expect(tracked(events)[0].metadata.signedIn).toBe(false);
  });
}
