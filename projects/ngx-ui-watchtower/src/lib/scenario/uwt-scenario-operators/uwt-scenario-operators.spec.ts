import { isDevMode } from '@angular/core';
import { of } from 'rxjs';
import {
  UWT_DEFAULT_REDACT_CONFIG,
  UWT_DEFAULT_TELEMETRY_CONFIG,
  UwtNoopTelemetrySink,
  UwtScenario
} from '@absaoss-cps/ui-watchtower';
import { traceScenario } from './uwt-scenario-operators';

jest.mock('@angular/core', () => ({
  ...jest.requireActual('@angular/core'),
  isDevMode: jest.fn(() => true)
}));

const isDevModeMock = isDevMode as jest.Mock;

/** The operator itself is tested in the core; this is what this package adds. */
describe('traceScenario, as this package exports it', () => {
  const throwingMapper = (): never => {
    throw new Error('mapper broke');
  };
  let consoleError: jest.SpyInstance;

  function scenario(): UwtScenario {
    return new UwtScenario(
      { name: 'load-customers' },
      {
        identity: { application: 'app', environment: 'test', version: '1' },
        scenarioTelemetryConfig: { ...UWT_DEFAULT_TELEMETRY_CONFIG.scenario },
        redact: UWT_DEFAULT_REDACT_CONFIG,
        sink: new UwtNoopTelemetrySink(),
        onSettled: () => undefined
      }
    );
  }

  beforeEach(() => {
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    isDevModeMock.mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should report a throwing outcome mapper on the console, prefixed, in development mode', () => {
    const traced = scenario();

    of(1).pipe(traceScenario(traced, throwingMapper)).subscribe();

    expect(traced.status).toBe('success');
    expect(consoleError).toHaveBeenCalledWith(
      '[ngx-ui-watchtower] scenario.traceOutcome failed',
      expect.any(Error)
    );
  });

  it('should stay silent in production mode', () => {
    isDevModeMock.mockReturnValue(false);

    of(1).pipe(traceScenario(scenario(), throwingMapper)).subscribe();

    expect(consoleError).not.toHaveBeenCalled();
  });
});
