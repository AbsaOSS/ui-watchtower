import { expect, openLab, Page, press, showKind, test } from './lab';

/** Holds Shift and presses `keys` — by default the shortcut, Shift+E+I. */
async function shortcut(page: Page, keys = ['KeyE', 'KeyI']): Promise<void> {
  await page.keyboard.down('Shift');
  for (const key of keys) {
    await page.keyboard.press(key);
  }
  await page.keyboard.up('Shift');
}

/** The value of one of the pane's inset variables on `<html>`. */
const inset = (page: Page, side: string) =>
  page.evaluate(
    (s) =>
      getComputedStyle(document.documentElement).getPropertyValue(
        `--uwt-inspector-inset-${s}`
      ),
    side
  );

test.beforeEach(async ({ page }) => {
  await openLab(page, 'inspector');
});

test('opens from the header as a dialog, with the mark and the transparency slider', async ({
  page
}) => {
  await page.locator('.lab-header-button').click();
  const dialog = page.locator('.cps-dialog');
  await expect(dialog.locator('uwt-inspector')).toBeVisible();
  await expect(
    dialog.locator('.cps-dialog-header-icon uwt-inspector-logo')
  ).toHaveCount(1);
  await expect(dialog.locator('cps-slider')).toBeVisible();

  // The title sits by the mark on the left, as in a pane or the window.
  const header = (await dialog.locator('.cps-dialog-header').boundingBox())!;
  const title = (await dialog
    .locator('.cps-dialog-header-title')
    .boundingBox())!;
  expect(title.x - header.x).toBeLessThan(header.width / 4);
});

test("Escape closes the dialog from inside it, and leaves it open for the app's own", async ({
  page
}) => {
  await page.locator('.lab-header-button').click();
  const inspector = page.locator('.cps-dialog uwt-inspector');
  await expect(inspector).toBeVisible();

  await page.locator('.lab-nav a').first().focus();
  await page.keyboard.press('Escape');
  await expect(inspector).toBeVisible();

  await inspector.locator('.uwt-inspector-search input').focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('uwt-inspector')).toHaveCount(0);
});

test('a phone-sized screen offers only the dialog and the window, and opens a remembered pane as a dialog', async ({
  page
}) => {
  await press(page, 'Right pane');
  await expect(page.locator('uwt-inspector-pane')).toBeVisible();
  await press(page, 'Close');

  await page.setViewportSize({ width: 390, height: 844 });
  await shortcut(page);
  await expect(page.locator('.cps-dialog uwt-inspector')).toBeVisible();
  await expect(page.locator('uwt-inspector-pane')).toHaveCount(0);
  // Too narrow for the buttons: a menu, with the same two to offer.
  await page.locator('.uwt-inspector-dock__trigger').click();
  await expect(page.locator('[role="menuitemradio"]')).toHaveCount(2);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.locator('uwt-inspector')).toHaveCount(0);

  // Kept for a wider screen.
  await page.setViewportSize({ width: 1280, height: 720 });
  await shortcut(page);
  await expect(page.locator('uwt-inspector-pane')).toBeVisible();
});

test('the Where it opens buttons show where it is, with Close apart', async ({
  page
}) => {
  const lab = page.locator('lab-inspector-page');
  const pressed = lab.locator('[aria-pressed="true"]');
  const close = lab.getByRole('button', { name: 'Close', exact: true });
  await expect(pressed).toHaveCount(0);
  await expect(close).toBeDisabled();

  await press(page, 'Right pane');
  await expect(pressed).toHaveText('Right pane');
  await expect(close).toBeEnabled();

  // Moved from the inspector's own Dock buttons, the page follows.
  await page.locator('uwt-inspector [data-dock="bottom"]').click();
  await expect(pressed).toHaveText('Bottom pane');

  await close.click();
  await expect(pressed).toHaveCount(0);
});

test('the Dialog button moves it from a pane to the dialog', async ({
  page
}) => {
  await press(page, 'Right pane');
  await expect(page.locator('uwt-inspector-pane')).toBeVisible();

  await press(page, 'Dialog');
  await expect(page.locator('.cps-dialog uwt-inspector')).toBeVisible();
  await expect(page.locator('uwt-inspector-pane')).toHaveCount(0);
});

test('the inspector focused by the shortcut shows the focus ring, not the browser default outline', async ({
  page
}) => {
  await shortcut(page);
  const inspector = page.locator('.cps-dialog uwt-inspector');
  await expect(inspector).toBeFocused();

  const look = await inspector.evaluate((el) => {
    const style = getComputedStyle(el);
    const ring = getComputedStyle(el, '::before');
    return {
      outline: style.outlineStyle,
      ring: ring.content !== 'none' && parseFloat(ring.borderTopWidth) > 0
    };
  });
  expect(look).toEqual({ outline: 'none', ring: true });

  // The ring spans the inspector, and must leave its controls clickable.
  await inspector.getByRole('button', { name: 'Clear' }).click();
});

test('Shift+E+I opens it, brings focus back, and closes it from inside — never while typing', async ({
  page
}) => {
  const inspector = page.locator('uwt-inspector');
  await shortcut(page, ['KeyI']);
  await shortcut(page, ['KeyE', 'KeyX', 'KeyI']);
  await expect(inspector).toHaveCount(0);

  await shortcut(page);
  await expect(inspector).toBeVisible();

  // Focus lands on the inspector itself, not a field, so it closes next.
  const dialog = page.locator('.cps-dialog uwt-inspector');
  await expect(dialog).toBeFocused();
  await shortcut(page);
  await expect(inspector).toHaveCount(0);

  // In its search field, Shift+E+I is typing.
  await shortcut(page);
  const search = page.locator('.uwt-inspector-search input').first();
  await search.focus();
  await shortcut(page);
  await expect(search).toHaveValue('EI');
  await expect(inspector).toBeVisible();

  // From the app, it brings focus back, and then closes.
  await page.mouse.click(300, 100);
  await expect(dialog).not.toBeFocused();
  await shortcut(page);
  await expect(dialog).toBeFocused();
  await shortcut(page);
  await expect(inspector).toHaveCount(0);
});

for (const { label, side } of [
  { label: 'Left pane', side: 'left' },
  { label: 'Right pane', side: 'right' },
  { label: 'Bottom pane', side: 'bottom' }
]) {
  test(`${label}: its own header, no slider, and its size published as --uwt-inspector-inset-${side}`, async ({
    page
  }) => {
    await press(page, label);
    const pane = page.locator('uwt-inspector-pane');
    await expect(pane).toBeVisible();
    await expect(
      pane.locator('.uwt-inspector__brand uwt-inspector-logo')
    ).toHaveCount(1);
    await expect(pane.locator('cps-slider')).toHaveCount(0);

    const box = (await pane.boundingBox())!;
    const size = side === 'bottom' ? box.height : box.width;
    expect(Math.round(parseFloat(await inset(page, side)))).toBe(
      Math.round(size)
    );

    await press(page, 'Close');
    await expect(pane).toHaveCount(0);
    expect(await inset(page, side)).toBe('');
  });
}

test('the lab opts its fixed header and status bar in to the insets, and out', async ({
  page
}) => {
  const right = async (selector: string) => {
    const box = (await page.locator(selector).boundingBox())!;
    return Math.round(box.x + box.width);
  };

  await press(page, 'Right pane');
  const paneLeft = Math.round(
    (await page.locator('uwt-inspector-pane').boundingBox())!.x
  );
  expect(await right('.lab-header')).toBe(paneLeft);

  await page.locator('lab-inspector-page cps-switch').click();
  await expect
    .poll(() => right('.lab-header'))
    .toBe(page.viewportSize()!.width);

  await page.locator('lab-inspector-page cps-switch').click();
  await press(page, 'Bottom pane');
  const paneTop = Math.round(
    (await page.locator('uwt-inspector-pane').boundingBox())!.y
  );
  const status = (await page.locator('.lab-status').boundingBox())!;
  expect(Math.round(status.y + status.height)).toBe(paneTop);
});

test('a separate window, with its own header and no slider', async ({
  page
}) => {
  const popup = page.waitForEvent('popup');
  await press(page, 'Separate window');
  const window = await popup;

  await expect(
    window.locator('.uwt-inspector__brand uwt-inspector-logo')
  ).toHaveCount(1);
  await expect(window).toHaveTitle('Event Inspector · watchtower-lab');
  // Its own icon, which the browser can draw.
  const icon = window.locator('link[rel="icon"]');
  await expect(icon).toHaveCount(1);
  expect(
    await icon.evaluate(
      (link: HTMLLinkElement) =>
        new Promise<number>((resolve) => {
          const image = new Image();
          image.onload = () => resolve(image.naturalWidth);
          image.onerror = () => resolve(0);
          image.src = link.href;
        })
    )
  ).toBeGreaterThan(0);
  await expect(window.locator('cps-slider')).toHaveCount(0);
});

for (const dock of ['dialog', 'right pane', 'separate window']) {
  test(`${dock}: what it shows is said by an info icon in its header`, async ({
    page
  }) => {
    let where: Page = page;
    if (dock === 'dialog') {
      await shortcut(page);
    } else if (dock === 'right pane') {
      await press(page, 'Right pane');
    } else {
      const popup = page.waitForEvent('popup');
      await press(page, 'Separate window');
      where = await popup;
    }

    const icon = where
      .locator('.cps-dialog-header, .uwt-inspector__header')
      .getByTestId('cps-info-circle');
    await expect(icon).toBeVisible();
    await expect(where.locator('body')).not.toContainText(
      'telemetry destinations, after redaction'
    );

    await icon.hover();
    const tip = where.locator('.cps-tooltip-content');
    await expect(tip).toContainText('telemetry destinations, after redaction');
    await expect(tip).toContainText("RUM's own page views");
  });
}

test('a dialog opened after menus were used still shows its tooltips above itself', async ({
  page
}) => {
  await shortcut(page);
  // Before cps-ui-kit 21.33, each menu opened left its z-index counter
  // higher, and the next dialog was stacked above its tooltips, which sit at
  // a fixed 2000.
  const exportButton = page
    .locator('.cps-dialog')
    .getByRole('button', { name: /Export/ });
  for (let i = 0; i < 3; i++) {
    await exportButton.click();
    await expect(exportButton).toHaveAttribute('aria-expanded', 'true');
    // The kit listens for a click away only once the menu has opened.
    await expect(async () => {
      await page.locator('.cps-dialog-header-title').click();
      await expect(exportButton).toHaveAttribute('aria-expanded', 'false', {
        timeout: 500
      });
    }).toPass();
  }
  await page.getByRole('button', { name: 'Dock right' }).click();
  await expect(page.locator('uwt-inspector-pane')).toBeVisible();
  await expect(page.locator('.cps-dialog')).toHaveCount(0);
  await page
    .locator('uwt-inspector-pane')
    .getByRole('button', { name: 'Dialog', exact: true })
    .click();
  await expect(page.locator('.cps-dialog uwt-inspector')).toBeVisible();

  await page
    .locator('.cps-dialog-header')
    .getByTestId('cps-info-circle')
    .hover();
  await expect(page.locator('.cps-tooltip-content')).toBeVisible();
  // Seen, not just there: what is at its centre is the tooltip itself.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const rect = document
          .querySelector('.cps-tooltip')!
          .getBoundingClientRect();
        return !!document
          .elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
          ?.closest('.cps-tooltip');
      })
    )
    .toBe(true);
});

test("a key press after a click on the dialog's header leaves what is inside it clickable", async ({
  page
}) => {
  await page.locator('.lab-header-button').click();
  const dialog = page.locator('.cps-dialog');
  await expect(dialog.locator('uwt-inspector')).toBeVisible();

  // On the header's bare part, to the right of the title.
  await dialog
    .locator('.cps-dialog-header')
    .click({ position: { x: 350, y: 20 } });
  // A key press makes the dialog's focus a keyboard focus, and cps-dialog
  // draws a ring around it that would cover, and take the clicks of, all it
  // holds.
  await page.keyboard.press('ArrowDown');
  await expect(dialog).toBeFocused();

  await dialog
    .getByRole('button', { name: 'Dock right' })
    .click({ timeout: 3000 });
  await expect(page.locator('uwt-inspector-pane')).toBeVisible();
});

test('Esc closes the dialog from its header, not only from its content', async ({
  page
}) => {
  await page.locator('.lab-header-button').click();
  const dialog = page.locator('.cps-dialog');
  await expect(dialog.locator('uwt-inspector')).toBeVisible();

  await dialog
    .locator('.cps-dialog-header')
    .click({ position: { x: 350, y: 20 } });
  await expect(dialog).toBeFocused();
  await page.keyboard.press('Escape');

  await expect(page.locator('uwt-inspector')).toHaveCount(0);
});

test('an Esc that closes the inspector is marked handled, so notifications stay; one it leaves alone is not', async ({
  page
}) => {
  // What cps-ui-kit's notifications read: they close on an Esc that reaches
  // the window unhandled.
  await page.evaluate(() => {
    (window as unknown as { escapes: boolean[] }).escapes = [];
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        (window as unknown as { escapes: boolean[] }).escapes.push(
          e.defaultPrevented
        );
      }
    });
  });
  await page.locator('.lab-header-button').click();
  const dialog = page.locator('.cps-dialog');
  await expect(dialog.locator('uwt-inspector')).toBeVisible();

  // In the app, outside the inspector: left alone, still open.
  await page.locator('.lab-nav a').first().focus();
  await page.keyboard.press('Escape');
  await expect(dialog.locator('uwt-inspector')).toBeVisible();

  await dialog.locator('.uwt-inspector-search input').focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('uwt-inspector')).toHaveCount(0);

  expect(
    await page.evaluate(
      () => (window as unknown as { escapes: boolean[] }).escapes
    )
  ).toEqual([false, true]);
});

test('reloading a separate window reopens the inspector in it: the window stays, the history starts again', async ({
  page
}) => {
  const popup = page.waitForEvent('popup');
  await press(page, 'Separate window');
  const window = await popup;
  await press(page, 'One of each kind');

  const status = window.locator('.uwt-inspector__status');
  await expect(status).toContainText(/[1-9]\d* events?/);
  // The reload gives it a new, empty document; this mark does not survive it.
  await window.evaluate(() => (document.body.dataset.before = 'reload'));
  let closed = false;
  window.on('close', () => (closed = true));

  await window.evaluate(() => location.reload()).catch(() => undefined);

  await expect(window.locator('.uwt-inspector__header')).toBeVisible();
  await expect(window.locator('body')).not.toHaveAttribute('data-before', /./);
  // As closing it and opening it again: what it had captured is gone…
  await expect(status).toContainText(/\b0 events/);
  expect(closed).toBe(false);
  // …and it captures from here.
  await press(page, 'One of each kind');
  await expect(status).toContainText(/[1-9]\d* events?/);

  // Still the inspector's own window: closing it closes the inspector.
  await window.close();
  await expect(page.locator('uwt-inspector')).toHaveCount(0);
});

test('reopens where it was last, after a reload', async ({ page }) => {
  await press(page, 'Right pane');
  await expect(page.locator('uwt-inspector-pane')).toBeVisible();

  await page.reload();
  await page.locator('.lab-header-button').click();
  const pane = (await page.locator('uwt-inspector-pane').boundingBox())!;
  expect(Math.round(pane.x + pane.width)).toBe(page.viewportSize()!.width);
});

test('lists what is sent, keeping the newest 500 events of each kind', async ({
  page
}) => {
  // A pane, so the page's buttons stay clear of it.
  await press(page, 'Right pane');
  await press(page, 'One of each kind');
  await press(page, 'A burst of 600 BI events');
  await press(page, 'A 300,000-character payload');
  await press(page, 'Odd shapes');
  await press(page, 'An unknown event type');

  const inspector = page.locator('uwt-inspector');
  await expect(inspector).toContainText(/ · \d+ oldest dropped/);
  await expect(inspector.locator('cps-button-toggle')).toContainText('BI 500');
});

test('shows every kind in one timeline, and any shape — an unrecognised type, odd values, a huge payload cut short', async ({
  page
}) => {
  const timeline = page.locator('uwt-inspector-timeline');
  const row = (text: string) =>
    timeline.locator('tbody tr:not(.cps-table-row-expanded-content)', {
      hasText: text
    });

  await press(page, 'Right pane');
  await press(page, 'One of each kind');
  await press(page, 'An unknown event type');
  await press(page, 'Odd shapes');

  await expect(row('lab-happy-path')).toContainText('Scenario');
  await expect(row('A warning, from the Event Inspector page')).toContainText(
    'Log'
  );
  await expect(row('→ RUM')).toContainText('Error');
  await expect(row('com.example.custom')).toContainText(
    'unrecognised event type'
  );

  await showKind(page, 'Logs');
  await expect(timeline).not.toContainText('lab-happy-path');
  await expect(timeline).toContainText('→ RUM');
  await showKind(page, 'All');

  const expand = (eventName: string) =>
    row(eventName).getByRole('button', { name: 'Expand row' }).click();

  await expand('lab_odd_shapes');
  await expect(timeline).toContainText('Zürich · 東京 · 🚀');
  await expect(timeline.locator('.uwt-inspector-timeline__error')).toHaveCount(
    0
  );

  await press(page, 'A 300,000-character payload');
  await expand('lab_huge_payload');
  await expect(timeline).toContainText('Large payload: showing the first');
});

test('a pane at its default width shows the dock buttons; dragged narrow, a menu of them', async ({
  page
}) => {
  await press(page, 'Right pane');
  const pane = page.locator('uwt-inspector-pane');
  await expect(pane.locator('[data-dock]')).toHaveCount(5);
  await expect(pane.locator('.uwt-inspector-dock__trigger')).toHaveCount(0);

  // Down to its minimum, 30rem, by the keyboard: the handle's arrow away
  // from the app narrows it, and stops there.
  await pane.getByRole('separator').focus();
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('ArrowRight');
  }
  await expect
    .poll(async () => Math.round((await pane.boundingBox())!.width))
    .toBe(480);
  const trigger = pane.locator('.uwt-inspector-dock__trigger');
  await expect(trigger).toBeVisible();
  await expect(pane.locator('[data-dock]')).toHaveCount(0);
  await expect(trigger).toHaveAccessibleName('Dock position: Dock right');

  await trigger.click();
  const items = page.getByRole('menuitemradio');
  await expect(items).toHaveCount(5);
  await expect(
    page.getByRole('menuitemradio', { name: 'Dock right' })
  ).toHaveAttribute('aria-checked', 'true');

  await page.getByRole('menuitemradio', { name: 'Dock bottom' }).click();
  await expect(page.locator('uwt-inspector-pane')).toHaveAttribute(
    'class',
    /uwt-inspector-pane--bottom/
  );
});
