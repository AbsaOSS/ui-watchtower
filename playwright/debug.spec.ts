import { expect, navigate, openLab, press, test } from './lab';

test('debug flags print what is sent, without a reload', async ({ page }) => {
  const lines: string[] = [];
  page.on('console', (m) => lines.push(m.text()));
  await openLab(page, 'settings');
  for (const flag of ['debugScenario', 'debugBI', 'debugLogger']) {
    await page
      .locator('cps-switch', { hasText: flag })
      .locator('label.cps-switch')
      .click();
    await expect
      .poll(() => page.evaluate((f) => localStorage.getItem(f), flag))
      .toBe('true');
  }

  await navigate(page, 'BI events');
  await press(page, 'Track a click');
  await navigate(page, 'Scenarios');
  await press(page, 'Complete, with 3 steps');
  await navigate(page, 'Logging');
  await press(page, 'warn');

  await expect
    .poll(() => lines)
    .toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^\[watchtower-lab\]\[bi\] lab_button_clicked -> com\.uwt\.bi/
        ),
        expect.stringMatching(
          /^\[watchtower-lab\]\[scenario\] lab-happy-path .*-> com\.uwt\.scenario/
        ),
        expect.stringMatching(/^\[watchtower-lab\]\[lab\] A lab warning/)
      ])
    );
});

test('debugLogger with a list prints only those loggers', async ({ page }) => {
  const lines: string[] = [];
  page.on('console', (m) => lines.push(m.text()));
  await page.addInitScript(() => localStorage.setItem('debugLogger', 'noisy'));
  await openLab(page, 'logging');

  await press(page, 'warn');
  await press(page, 'warn (written)');
  await expect
    .poll(() => lines)
    .toContainEqual(
      expect.stringMatching(/^\[watchtower-lab\]\[noisy\] A noisy warning/)
    );
  expect(lines.some((l) => l.includes('A lab warning'))).toBe(false);
});
