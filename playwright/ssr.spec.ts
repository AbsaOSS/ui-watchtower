import { expect, named, openLab, press, sessionStarted, test } from './lab';

test('the server renders the page, and sends no telemetry itself', async ({
  request,
  backend
}) => {
  const html = await (await request.get('/bi')).text();

  expect(html).toMatch(/<h1[^>]*>BI events<\/h1>/);
  expect(html).toContain('class="lab-nav"');
  // Annotations for hydration: the browser reuses this DOM.
  expect(html).toMatch(/ngh="/);
  // What the render asked of the lab's destinations, kept on the server
  // rather than sent: nothing. A page still sending from the last test
  // sends from the browser, and doesn't count.
  expect((await backend.state()).serverSends).toEqual([]);
});

test('the browser hydrates the rendered page, and telemetry starts there', async ({
  page,
  backend
}) => {
  const messages: string[] = [];
  page.on('console', (m) => messages.push(m.text()));

  await openLab(page, 'bi');
  await sessionStarted(page);
  // Angular reports, in development builds, what it hydrated.
  await expect
    .poll(() => messages.find((m) => m.startsWith('Angular hydrated')))
    .toBeTruthy();

  await press(page, 'Track a click');
  await backend.rumUntil((e) => named(e, 'lab_button_clicked').length > 0);
});
