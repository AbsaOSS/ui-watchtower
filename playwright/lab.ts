import {
  APIRequestContext,
  expect,
  FrameLocator,
  Locator,
  Page,
  test as base
} from '@playwright/test';

/** One RUM event as the mock dataplane received it, with its batch's user. */
export interface RumEvent {
  batch: number;
  user: { sessionId?: string; userId?: string };
  type: string;
  metadata: Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  details: Record<string, any>;
}

/** One log record as the mock log backend stored it. */
export interface LogRecord {
  application: string;
  logger: string;
  level: string;
  message: string;
  context?: string;
  metadata?: Record<string, unknown>;
  error?: { name: string; message: string; stack?: string };
}

export type BrokerMode =
  | 'ok'
  | 'null'
  | 'fail'
  | 'short-expiry'
  | 'flaky'
  | 'invalid'
  | 'null-on-refresh'
  | 'no-credentials-on-refresh';
export type Telemetry =
  'errors' | 'performance' | 'interaction' | 'http' | 'replay';

/** The lab's mock backend: what it received, and how its broker answers. */
export class LabBackend {
  private readonly request: APIRequestContext;

  constructor(request: APIRequestContext) {
    this.request = request;
  }

  async rum(): Promise<RumEvent[]> {
    return (await (await this.request.get('/__lab/rum')).json()).events;
  }

  async logs(): Promise<LogRecord[]> {
    return (await this.request.get('/__lab/logs')).json();
  }

  /** What the lab's custom sink was given, with `?destination=custom`. */
  async custom(): Promise<
    { kind: string; eventType?: string; payload?: Record<string, unknown> }[]
  > {
    return (await this.request.get('/__lab/custom')).json();
  }

  async state(): Promise<{
    brokerMode: BrokerMode;
    brokerCalls: number;
    brokerConfig: Record<string, unknown>;
    telemetries: Telemetry[] | null;
  }> {
    return (await this.request.get('/__lab/state')).json();
  }

  /** Waits until the RUM events received satisfy `done`, and returns them. */
  async rumUntil(
    done: (events: RumEvent[]) => boolean,
    timeout = 10_000
  ): Promise<RumEvent[]> {
    let events: RumEvent[] = [];
    await expect
      .poll(async () => done((events = await this.rum())), { timeout })
      .toBe(true);
    return events;
  }

  async reset(): Promise<void> {
    await this.request.post('/__lab/reset');
  }

  /** How the broker answers the next `/rum/init`. */
  async setBrokerMode(mode: BrokerMode): Promise<void> {
    await this.request.post('/__lab/broker-mode', { data: { mode } });
  }

  /** Laid over the broker's app monitor config. */
  async setBrokerConfig(config: Record<string, unknown>): Promise<void> {
    await this.request.post('/__lab/broker-config', { data: { config } });
  }

  /** RUM's own telemetries the broker names; `null` for the library's default. */
  async setTelemetries(telemetries: Telemetry[] | null): Promise<void> {
    await this.request.post('/__lab/telemetries', { data: { telemetries } });
  }
}

/** The library's events for one scenario or BI event name. */
export function named(events: RumEvent[], name: string): RumEvent[] {
  return events.filter(
    (e) =>
      e.type.startsWith('com.uwt.') &&
      (e.details.scenarioName === name || e.details.eventName === name)
  );
}

export const test = base.extend<{
  backend: LabBackend;
  errors: string[];
}>({
  // Every test starts from the broker's defaults and an empty backend.
  backend: [
    async ({ request }, use) => {
      const backend = new LabBackend(request);
      await backend.setBrokerMode('ok');
      await backend.setBrokerConfig({});
      await backend.setTelemetries(null);
      await backend.reset();
      await use(backend);
    },
    { auto: true }
  ],

  // Page and console errors fail the test — a test's other tabs too, once
  // given to watchErrors.
  errors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      watchErrors(page, errors);
      await use(errors);
      expect(errors, 'page and console errors').toEqual([]);
    },
    { auto: true }
  ]
});

/**
 * Collects `page`'s errors into `errors`. A failed request isn't one: the
 * `fail` broker answers with an error on purpose.
 */
export function watchErrors(page: Page, errors: string[]): void {
  page.on('pageerror', (e) => errors.push(`page: ${e.message}`));
  page.on('console', (m) => {
    if (
      m.type() === 'error' &&
      !m.text().startsWith('Failed to load resource')
    ) {
      errors.push(`console: ${m.text()}`);
    }
  });
}

export { expect };
export type { FrameLocator, Locator, Page };

/**
 * Opens a lab page by its address, e.g. `'bi?telemetry=off'`, with `config` as
 * its `?config=` overlay, and waits until it has hydrated: the server's page
 * shows before it answers clicks.
 */
export async function openLab(
  page: Page,
  address: string,
  config?: object
): Promise<void> {
  const overlay = config
    ? `${address.includes('?') ? '&' : '?'}config=${encodeURIComponent(JSON.stringify(config))}`
    : '';
  await page.goto(`/${address}${overlay}`);
  await expect(page.locator('html[data-lab-ready]')).toHaveCount(1);
  await expect(page.locator('lab-root main h1').first()).toBeVisible();
}

/** Waits until RUM has started a session, as the status bar shows; its id. */
export async function sessionStarted(page: Page): Promise<string> {
  const status = page.locator('.lab-status');
  await expect(status).toContainText(/session: [0-9a-f]{8}/, {
    timeout: 15_000
  });
  return (await status.textContent())!.match(/session: ([0-9a-f-]{36})/)![1];
}

/** Moves to another lab page within the app, keeping its state. */
export async function navigate(page: Page, label: string): Promise<void> {
  await page.locator('.lab-nav').getByRole('link', { name: label }).click();
  await expect(page.locator('lab-root main h1').first()).toHaveText(label);
}

/** Presses the lab's button with exactly this label. */
export async function press(
  where: Page | FrameLocator | Locator,
  label: string
): Promise<void> {
  await where.getByRole('button', { name: label, exact: true }).first().click();
}
