import AxeBuilder from '@axe-core/playwright';
import { expect, openLab, Page, press, test } from './lab';

/** WCAG 2.2 at levels A and AA. */
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const PAGES = [
  'scenarios',
  'bi',
  'logging',
  'identity',
  'privacy',
  'lifecycle',
  'fragment',
  'web-fragment',
  'inspector',
  'wire',
  'settings'
];

/** Each violation as its rule and where it was found. */
async function violations(page: Page, include?: string): Promise<string[]> {
  const builder = new AxeBuilder({ page }).withTags(WCAG);
  const { violations } = await (
    include ? builder.include(include) : builder
  ).analyze();
  return violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`
  );
}

/** The text-to-background contrast of the first element `selector` finds. */
function contrastOf(page: Page, selector: string): Promise<number> {
  return page
    .locator(selector)
    .first()
    .evaluate((el) => {
      const rgb = (color: string) =>
        (color.match(/[\d.]+/g) ?? []).map(Number).slice(0, 4);
      let bg: number[] = [255, 255, 255];
      for (let node: Element | null = el; node; node = node.parentElement) {
        const [r, g, b, a = 1] = rgb(getComputedStyle(node).backgroundColor);
        if (a > 0.5) {
          bg = [r, g, b];
          break;
        }
      }
      const luminance = ([r, g, b]: number[]) =>
        [r, g, b]
          .map((v) => v / 255)
          .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
          .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
      const [l1, l2] = [
        luminance(rgb(getComputedStyle(el).color)),
        luminance(bg)
      ];
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    });
}

for (const path of PAGES) {
  test(`${path}: no WCAG 2.2 A or AA violations`, async ({ page }) => {
    await openLab(page, path);
    expect(await violations(page)).toEqual([]);
  });
}

test('the Event Inspector with events, rows open, a filter being built with its help, and the Export menu open: no violations, and readable colours', async ({
  page
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'ngx-ui-watchtower.eventInspector',
      JSON.stringify({ dock: 'right' })
    )
  );
  await openLab(page, 'inspector');
  await page.locator('.lab-header-button').click();
  await press(page, 'One of each kind');
  await press(page, 'An unknown event type');
  await press(page, 'A 300,000-character payload');
  const timeline = page.locator('uwt-inspector-timeline');
  for (const row of ['lab_huge_payload', '→ RUM']) {
    await timeline
      .locator('tbody tr', { hasText: row })
      .getByRole('button', { name: 'Expand row' })
      .click();
  }
  await page.getByRole('button', { name: 'Add filter' }).click();
  await page.getByText('How filters work').click();
  await expect(timeline).toContainText('Large payload: showing the first');
  await expect(timeline).toContainText('Mirrored from');
  // Past the new-row tint, so contrast is measured on the usual rows.
  await expect(page.locator('.uwt-inspector-timeline__fresh')).toHaveCount(0, {
    timeout: 10_000
  });

  expect(await violations(page, 'uwt-inspector-pane')).toEqual([]);
  // axe can't always settle contrast on striped rows; measured directly.
  for (const tone of ['success', 'warn', 'error']) {
    expect(
      await contrastOf(page, `.uwt-inspector-timeline__tone--${tone}`)
    ).toBeGreaterThanOrEqual(4.5);
  }
  for (const text of [
    '.uwt-inspector-json__notice',
    '.uwt-inspector-timeline__link',
    '.uwt-inspector-filter-bar__help summary'
  ]) {
    expect(await contrastOf(page, text)).toBeGreaterThanOrEqual(4.5);
  }

  await timeline.getByRole('button', { name: 'Export' }).click();
  // Once it has faded in: mid-fade, its text is too faint to measure.
  await expect(page.locator('.cps-menu-container')).toHaveCSS('opacity', '1');
  expect(await violations(page, '.cps-menu-container')).toEqual([]);
});
