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
const BEN = '9b2d1c6e-7a53-4d0e-8f3b-2c1a5e6d7f80';

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

test('signing in as someone else moves the next events to them', async ({
  page,
  backend
}) => {
  await press(page, 'Sign in as Ben');
  await expect(page.locator('.lab-status')).toContainText(BEN);

  await navigate(page, 'BI events');
  await press(page, 'Track a click');
  const events = await backend.rumUntil((e) => tracked(e).length > 0);
  expect(tracked(events)[0].user.userId).toBe(BEN);
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
    await expect(page.locator('.lab-header')).toContainText('Signed out');

    // Signing out again, with nobody signed in, changes nothing.
    const after = await sessionStarted(page);
    await press(page, signOut);
    await page.waitForTimeout(1500);
    await expect(page.locator('.lab-status')).toContainText(after);

    await navigate(page, 'BI events');
    await press(page, 'Track a click');
    const events = await backend.rumUntil((e) => tracked(e).length > 0);
    expect(tracked(events)[0].user.userId).not.toBe(ANNA);
    expect(tracked(events)[0].metadata.signedIn).toBe(false);
  });
}

test('the header shows who is signed in, from any page, and is no link', async ({
  page
}) => {
  await navigate(page, 'BI events');
  const user = page.locator('.lab-header .lab-user');
  await expect(user).toHaveText('Signed in');
  await user.hover();
  await expect(page.locator('.cps-tooltip-content')).toHaveText(
    `Signed in as Anna (${ANNA})`
  );
  await expect(page.locator('.lab-header').getByRole('link')).toHaveCount(0);
});
