import {
  HttpClient,
  HttpContextToken,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting
} from '@angular/common/http/testing';
import { DOCUMENT } from '@angular/common';
import { PLATFORM_ID, Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { retry } from 'rxjs';
import { UWT_TELEMETRY_ENABLED } from '../../config/uwt-telemetry-common.config/uwt-telemetry-common.config';
import { UwtScenario } from '../uwt-scenario/uwt-scenario';
import { traceScenario } from '../uwt-scenario-operators/uwt-scenario-operators';
import {
  UwtScenarioHeaderOptions,
  uwtScenarioContext,
  uwtScenarioHeaderInterceptor
} from './uwt-scenario-http';

function scenario(id: string): jest.Mocked<UwtScenario> {
  return {
    id,
    complete: jest.fn(),
    fail: jest.fn(),
    cancel: jest.fn(),
    isSettled: false
  } as unknown as jest.Mocked<UwtScenario>;
}

describe('uwtScenarioHeaderInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;

  function configure(
    options?: UwtScenarioHeaderOptions,
    ...providers: Provider[]
  ): void {
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        provideHttpClient(
          withInterceptors([uwtScenarioHeaderInterceptor(options)])
        ),
        provideHttpClientTesting(),
        ...providers
      ]
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  }

  afterEach(() => {
    backend.verify();
    jest.restoreAllMocks();
  });

  describe('with defaults', () => {
    beforeEach(() => configure());

    it('sends the scenario id on a same-origin request', () => {
      http
        .get('/api/customers', { context: uwtScenarioContext(scenario('s-1')) })
        .subscribe();

      const req = backend.expectOne('/api/customers');
      expect(req.request.headers.get('X-Uwt-Scenario-Id')).toBe('s-1');
      req.flush([]);
    });

    it('sends it on an absolute same-origin URL', () => {
      const url = `${document.location.origin}/api/customers`;
      http
        .get(url, { context: uwtScenarioContext(scenario('s-1')) })
        .subscribe();

      const req = backend.expectOne(url);
      expect(req.request.headers.get('X-Uwt-Scenario-Id')).toBe('s-1');
      req.flush([]);
    });

    it('sends nothing on a request without a scenario', () => {
      http.get('/api/customers').subscribe();

      const req = backend.expectOne('/api/customers');
      expect(req.request.headers.has('X-Uwt-Scenario-Id')).toBe(false);
      req.flush([]);
    });

    it('sends nothing on a cross-origin request', () => {
      http
        .get('https://api.example.com/customers', {
          context: uwtScenarioContext(scenario('s-1'))
        })
        .subscribe();

      const req = backend.expectOne('https://api.example.com/customers');
      expect(req.request.headers.has('X-Uwt-Scenario-Id')).toBe(false);
      req.flush([]);
    });

    it('keeps a header the request already carries', () => {
      http
        .get('/api/customers', {
          context: uwtScenarioContext(scenario('s-1')),
          headers: { 'x-uwt-scenario-id': 'set-by-app' }
        })
        .subscribe();

      const req = backend.expectOne('/api/customers');
      expect(req.request.headers.getAll('X-Uwt-Scenario-Id')).toEqual([
        'set-by-app'
      ]);
      req.flush([]);
    });

    it('takes other context tokens alongside the scenario', () => {
      const OTHER = new HttpContextToken(() => 'default');
      http
        .get('/api/customers', {
          context: uwtScenarioContext(scenario('s-1')).set(OTHER, 'kept')
        })
        .subscribe();

      const req = backend.expectOne('/api/customers');
      expect(req.request.context.get(OTHER)).toBe('kept');
      expect(req.request.headers.get('X-Uwt-Scenario-Id')).toBe('s-1');
      req.flush([]);
    });

    it('gives every call its own context, so none leaks into another request', () => {
      const s = scenario('s-1');

      expect(uwtScenarioContext(s)).not.toBe(uwtScenarioContext(s));
    });

    it('gives concurrent requests their own scenario ids', () => {
      http
        .get('/api/customers', { context: uwtScenarioContext(scenario('s-1')) })
        .subscribe();
      http
        .get('/api/orders', { context: uwtScenarioContext(scenario('s-2')) })
        .subscribe();

      const customers = backend.expectOne('/api/customers');
      const orders = backend.expectOne('/api/orders');
      expect(customers.request.headers.get('X-Uwt-Scenario-Id')).toBe('s-1');
      expect(orders.request.headers.get('X-Uwt-Scenario-Id')).toBe('s-2');
      customers.flush([]);
      orders.flush([]);
    });

    it('sends the same id on every retry attempt', () => {
      http
        .get('/api/customers', { context: uwtScenarioContext(scenario('s-1')) })
        .pipe(retry(1))
        .subscribe();

      const first = backend.expectOne('/api/customers');
      expect(first.request.headers.get('X-Uwt-Scenario-Id')).toBe('s-1');
      first.flush(null, { status: 503, statusText: 'Unavailable' });

      const second = backend.expectOne('/api/customers');
      expect(second.request.headers.get('X-Uwt-Scenario-Id')).toBe('s-1');
      second.flush([]);
    });

    it('passes an error through unchanged and leaves settling to the caller', () => {
      const s = scenario('s-1');
      let received: unknown;
      http
        .get('/api/customers', { context: uwtScenarioContext(s) })
        .subscribe({ error: (error) => (received = error) });

      backend
        .expectOne('/api/customers')
        .flush(null, { status: 500, statusText: 'Server Error' });

      expect(received).toBeInstanceOf(HttpErrorResponse);
      expect((received as HttpErrorResponse).status).toBe(500);
      expect(s.fail).not.toHaveBeenCalled();
      expect(s.complete).not.toHaveBeenCalled();
    });

    it('lets traceScenario fail the scenario on an error', () => {
      const s = scenario('s-1');
      http
        .get('/api/customers', { context: uwtScenarioContext(s) })
        .pipe(traceScenario(s))
        .subscribe({ error: () => undefined });

      backend
        .expectOne('/api/customers')
        .flush(null, { status: 500, statusText: 'Server Error' });

      expect(s.fail).toHaveBeenCalledTimes(1);
      expect(s.fail).toHaveBeenCalledWith({
        error: expect.any(HttpErrorResponse)
      });
    });

    it('quietly sends a request whose URL cannot be parsed', () => {
      const error = jest.spyOn(console, 'error');
      http
        .get('http://[bad', { context: uwtScenarioContext(scenario('s-1')) })
        .subscribe();

      const req = backend.expectOne('http://[bad');
      expect(req.request.headers.has('X-Uwt-Scenario-Id')).toBe(false);
      expect(error).not.toHaveBeenCalled();
      req.flush([]);
    });
  });

  it('uses a custom header name', () => {
    configure({ headerName: 'X-Journey-Id' });
    http
      .get('/api/customers', { context: uwtScenarioContext(scenario('s-1')) })
      .subscribe();

    const req = backend.expectOne('/api/customers');
    expect(req.request.headers.get('X-Journey-Id')).toBe('s-1');
    expect(req.request.headers.has('X-Uwt-Scenario-Id')).toBe(false);
    req.flush([]);
  });

  it('falls back to the default for an empty header name', () => {
    configure({ headerName: '' });
    http
      .get('/api/customers', { context: uwtScenarioContext(scenario('s-1')) })
      .subscribe();

    const req = backend.expectOne('/api/customers');
    expect(req.request.headers.get('X-Uwt-Scenario-Id')).toBe('s-1');
    req.flush([]);
  });

  it('sends nothing while telemetry is off', () => {
    configure(undefined, { provide: UWT_TELEMETRY_ENABLED, useValue: false });
    http
      .get('/api/customers', { context: uwtScenarioContext(scenario('s-1')) })
      .subscribe();

    const req = backend.expectOne('/api/customers');
    expect(req.request.headers.has('X-Uwt-Scenario-Id')).toBe(false);
    req.flush([]);
  });

  it('sends nothing during a server-side render', () => {
    configure(undefined, { provide: PLATFORM_ID, useValue: 'server' });
    http
      .get('/api/customers', { context: uwtScenarioContext(scenario('s-1')) })
      .subscribe();

    const req = backend.expectOne('/api/customers');
    expect(req.request.headers.has('X-Uwt-Scenario-Id')).toBe(false);
    req.flush([]);
  });

  it('compares against the realm’s own origin in an about:blank frame', () => {
    // An about:blank or srcdoc frame: its URL's origin is "null", but the
    // realm, and the base it resolves against, are its creator's.
    configure(undefined, {
      provide: DOCUMENT,
      useValue: {
        baseURI: document.baseURI,
        location: { origin: 'null' },
        defaultView: { origin: document.location.origin }
      }
    });
    http
      .get('/api/customers', { context: uwtScenarioContext(scenario('s-1')) })
      .subscribe();

    const req = backend.expectOne('/api/customers');
    expect(req.request.headers.get('X-Uwt-Scenario-Id')).toBe('s-1');
    req.flush([]);
  });
});
