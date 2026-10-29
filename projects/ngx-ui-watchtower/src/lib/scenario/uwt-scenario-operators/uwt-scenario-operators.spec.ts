import {
  defer,
  EMPTY,
  first,
  type Observable,
  firstValueFrom,
  lastValueFrom,
  of,
  retry,
  Subject,
  switchMap,
  take,
  throwError
} from 'rxjs';
import { UWT_DEFAULT_TELEMETRY_CONFIG } from '../../config/uwt-telemetry-common.config/uwt-telemetry-common.config';
import { UwtScenarioRecord } from '../../models/uwt-scenario.models/uwt-scenario.models';
import { UwtNoopTelemetrySink } from '../../sinks/uwt-telemetry/uwt-noop-telemetry.sink/uwt-noop-telemetry.sink';
import { UWT_DEFAULT_REDACT_CONFIG } from '../../utils/uwt-telemetry-redact.util/uwt-telemetry-redact.util';
import { UwtScenario } from '../uwt-scenario/uwt-scenario';
import { traceScenario } from './uwt-scenario-operators';

describe('traceScenario operator', () => {
  let scenario: jest.Mocked<UwtScenario>;

  beforeEach(() => {
    scenario = {
      complete: jest.fn(),
      fail: jest.fn(),
      cancel: jest.fn(),
      isSettled: false
    } as unknown as jest.Mocked<UwtScenario>;
  });

  it('should complete scenario on successful stream completion', (done) => {
    of(['user1', 'user2'])
      .pipe(traceScenario(scenario))
      .subscribe({
        next: (val) => {
          expect(val).toEqual(['user1', 'user2']);
        },
        complete: () => {
          expect(scenario.complete).toHaveBeenCalledWith(undefined);
          expect(scenario.fail).not.toHaveBeenCalled();
          done();
        }
      });
  });

  it('should complete scenario with mapped outcome using function argument', (done) => {
    of(['item1', 'item2', 'item3'])
      .pipe(
        traceScenario(scenario, (items) => ({
          metadata: { itemCount: items.length }
        }))
      )
      .subscribe({
        complete: () => {
          expect(scenario.complete).toHaveBeenCalledWith({
            metadata: { itemCount: 3 }
          });
          done();
        }
      });
  });

  it('should complete scenario with mapped outcome using options object', (done) => {
    of({ status: 200, data: 'ok' })
      .pipe(
        traceScenario(scenario, {
          outcome: (res) => ({
            statusCode: res.status,
            metadata: { result: res.data }
          })
        })
      )
      .subscribe({
        complete: () => {
          expect(scenario.complete).toHaveBeenCalledWith({
            statusCode: 200,
            metadata: { result: 'ok' }
          });
          done();
        }
      });
  });

  it('should complete scenario with no outcome when the stream completes with no emissions', (done) => {
    EMPTY.pipe(
      traceScenario(scenario, () => ({ metadata: { unreachable: true } }))
    ).subscribe({
      complete: () => {
        expect(scenario.complete).toHaveBeenCalledWith(undefined);
        expect(scenario.fail).not.toHaveBeenCalled();
        done();
      }
    });
  });

  it('should fail scenario when the stream errors and re-throw the error', (done) => {
    const error = new Error('network down');
    throwError(() => error)
      .pipe(traceScenario(scenario))
      .subscribe({
        error: (err) => {
          expect(err).toBe(error);
          expect(scenario.fail).toHaveBeenCalledWith({ error });
          expect(scenario.complete).not.toHaveBeenCalled();
          done();
        }
      });
  });

  it('should still settle the scenario when the outcome mapper throws', (done) => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    of('value')
      .pipe(
        traceScenario(scenario, () => {
          throw new Error('mapper is broken');
        })
      )
      .subscribe({
        complete: () => {
          expect(scenario.complete).toHaveBeenCalledWith(undefined);
          expect(scenario.fail).not.toHaveBeenCalled();
          expect(consoleError).toHaveBeenCalledWith(
            expect.stringContaining('failed'),
            expect.any(Error)
          );
          consoleError.mockRestore();
          done();
        }
      });
  });

  it('should not leak lastValue/hasValue into a resubscription of the same piped observable', (done) => {
    let subscriptionCount = 0;
    const source = defer(() => {
      subscriptionCount++;
      return subscriptionCount === 1 ? of('a') : EMPTY;
    });

    const traced$ = source.pipe(
      traceScenario(scenario, (value) => ({ metadata: { value } }))
    );

    traced$.subscribe({
      complete: () => {
        expect(scenario.complete).toHaveBeenNthCalledWith(1, {
          metadata: { value: 'a' }
        });

        traced$.subscribe({
          complete: () => {
            expect(scenario.complete).toHaveBeenNthCalledWith(2, undefined);
            done();
          }
        });
      }
    });
  });

  describe('teardown without a source complete/error', () => {
    it('should cancel the scenario on a manual unsubscribe', () => {
      const source = new Subject<string>();
      const subscription = source.pipe(traceScenario(scenario)).subscribe();

      subscription.unsubscribe();

      expect(scenario.cancel).toHaveBeenCalledTimes(1);
      expect(scenario.complete).not.toHaveBeenCalled();
      expect(scenario.fail).not.toHaveBeenCalled();
    });

    it('should cancel a superseded scenario when switchMap moves to the next inner observable', () => {
      const supersededScenario = {
        complete: jest.fn(),
        fail: jest.fn(),
        cancel: jest.fn(),
        isSettled: false
      } as unknown as jest.Mocked<UwtScenario>;
      const pendingFirstRequest = new Subject<string>();
      const secondRequest = of('b');
      const trigger = new Subject<number>();

      trigger
        .pipe(
          switchMap((n) =>
            (n === 1 ? pendingFirstRequest : secondRequest).pipe(
              traceScenario(n === 1 ? supersededScenario : scenario)
            )
          )
        )
        .subscribe();

      trigger.next(1); // subscribes traceScenario(supersededScenario), still pending
      trigger.next(2); // switchMap unsubscribes it before it ever settles

      expect(supersededScenario.cancel).toHaveBeenCalledTimes(1);
      expect(supersededScenario.complete).not.toHaveBeenCalled();
      expect(supersededScenario.fail).not.toHaveBeenCalled();
      expect(scenario.complete).toHaveBeenCalledWith(undefined);
    });

    it('should cancel with the configured cancelOutcome on unsubscribe', () => {
      const source = new Subject<string>();
      const subscription = source
        .pipe(
          traceScenario(scenario, { cancelOutcome: { reason: 'superseded' } })
        )
        .subscribe();

      subscription.unsubscribe();

      expect(scenario.cancel).toHaveBeenCalledWith({ reason: 'superseded' });
    });

    it('should accept cancelOutcome as a function, evaluated at unsubscribe time', () => {
      const source = new Subject<string>();
      const subscription = source
        .pipe(
          traceScenario(scenario, {
            cancelOutcome: () => ({ reason: 'superseded' })
          })
        )
        .subscribe();

      subscription.unsubscribe();

      expect(scenario.cancel).toHaveBeenCalledWith({ reason: 'superseded' });
    });

    it('should still cancel, with no outcome, when cancelOutcome throws', () => {
      const consoleError = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const source = new Subject<string>();
      const subscription = source
        .pipe(
          traceScenario(scenario, {
            cancelOutcome: () => {
              throw new Error('cancelOutcome is broken');
            }
          })
        )
        .subscribe();

      subscription.unsubscribe();

      expect(scenario.cancel).toHaveBeenCalledWith(undefined);
      consoleError.mockRestore();
    });

    it('should record a reason for a switchMap-superseded scenario, not just a bare cancel', () => {
      const supersededScenario = {
        complete: jest.fn(),
        fail: jest.fn(),
        cancel: jest.fn(),
        isSettled: false
      } as unknown as jest.Mocked<UwtScenario>;
      const pendingFirstRequest = new Subject<string>();
      const secondRequest = of('b');
      const trigger = new Subject<number>();

      trigger
        .pipe(
          switchMap((n) =>
            (n === 1 ? pendingFirstRequest : secondRequest).pipe(
              traceScenario(n === 1 ? supersededScenario : scenario, {
                cancelOutcome: { reason: 'superseded' }
              })
            )
          )
        )
        .subscribe();

      trigger.next(1);
      trigger.next(2);

      expect(supersededScenario.cancel).toHaveBeenCalledWith({
        reason: 'superseded'
      });
    });

    it('should not cancel a scenario that already completed normally', (done) => {
      of('value')
        .pipe(traceScenario(scenario))
        .subscribe({
          complete: () => {
            (scenario as unknown as { isSettled: boolean }).isSettled = true;
            expect(scenario.cancel).not.toHaveBeenCalled();
            done();
          }
        });
    });

    it('should not cancel a scenario that already failed', (done) => {
      const error = new Error('boom');
      throwError(() => error)
        .pipe(traceScenario(scenario))
        .subscribe({
          error: () => {
            (scenario as unknown as { isSettled: boolean }).isSettled = true;
            expect(scenario.cancel).not.toHaveBeenCalled();
            done();
          }
        });
    });
  });

  describe('with a real scenario', () => {
    let settled: UwtScenarioRecord[];

    const countRows = (rows: string[]) => ({
      metadata: { count: rows.length }
    });

    function createScenario(name = 'load-customers'): UwtScenario {
      return new UwtScenario(
        { name },
        {
          identity: {
            application: 'test-app',
            environment: 'test',
            version: '1.0.0'
          },
          scenarioTelemetryConfig: {
            ...UWT_DEFAULT_TELEMETRY_CONFIG.scenario
          },
          redact: UWT_DEFAULT_REDACT_CONFIG,
          sink: new UwtNoopTelemetrySink(),
          onSettled: (_id, record) => settled.push(record)
        }
      );
    }

    beforeEach(() => {
      settled = [];
    });

    describe('single-value sources', () => {
      it('should settle as success with subscribe()', () => {
        const real = createScenario();

        of(['a', 'b']).pipe(traceScenario(real, countRows)).subscribe();

        expect(real.status).toBe('success');
        expect(settled[0].metadata).toEqual({ count: 2 });
      });

      it('should settle as success with lastValueFrom', async () => {
        const real = createScenario();

        await lastValueFrom(
          of(['a', 'b']).pipe(traceScenario(real, countRows))
        );

        expect(real.status).toBe('success');
        expect(settled[0].metadata).toEqual({ count: 2 });
      });

      it('should settle as success with firstValueFrom', async () => {
        const real = createScenario();

        const rows = await firstValueFrom(
          of(['a', 'b']).pipe(traceScenario(real, countRows))
        );

        expect(rows).toEqual(['a', 'b']);
        expect(real.status).toBe('success');
        expect(settled[0].metadata).toEqual({ count: 2 });
      });

      it('should settle as success with take(1) after the operator', () => {
        const real = createScenario();

        of(['a', 'b'])
          .pipe(traceScenario(real, countRows), take(1))
          .subscribe();

        expect(real.status).toBe('success');
        expect(settled[0].metadata).toEqual({ count: 2 });
      });

      it('should settle as success with first() after the operator', () => {
        const real = createScenario();

        of(['a', 'b'])
          .pipe(traceScenario(real, countRows), first())
          .subscribe();

        expect(real.status).toBe('success');
        expect(settled[0].metadata).toEqual({ count: 2 });
      });

      it('should settle as success with take(1) before the operator', () => {
        const real = createScenario();

        of(['a', 'b'])
          .pipe(take(1), traceScenario(real, countRows))
          .subscribe();

        expect(real.status).toBe('success');
        expect(settled[0].metadata).toEqual({ count: 2 });
      });

      it('should settle as success with take(1) before the operator under firstValueFrom', async () => {
        const real = createScenario();

        await firstValueFrom(
          of(['a', 'b']).pipe(take(1), traceScenario(real, countRows))
        );

        expect(real.status).toBe('success');
        expect(settled[0].metadata).toEqual({ count: 2 });
      });
    });

    describe('switchMap superseding an inner stream', () => {
      it('should abandon a stream superseded before it emitted', () => {
        const superseded = createScenario('superseded');
        const latest = createScenario('latest');
        const pendingFirstRequest = new Subject<string[]>();
        const trigger = new Subject<number>();

        trigger
          .pipe(
            switchMap((n) =>
              n === 1
                ? pendingFirstRequest.pipe(traceScenario(superseded))
                : of(['b']).pipe(traceScenario(latest))
            )
          )
          .subscribe();

        trigger.next(1);
        trigger.next(2);

        expect(superseded.status).toBe('abandoned');
        expect(latest.status).toBe('success');
      });

      it('should settle as success a stream superseded after it emitted', () => {
        const superseded = createScenario('superseded');
        const latest = createScenario('latest');
        const firstRequest = new Subject<string[]>();
        const trigger = new Subject<number>();

        trigger
          .pipe(
            switchMap((n) =>
              n === 1
                ? firstRequest.pipe(traceScenario(superseded, countRows))
                : of(['b']).pipe(traceScenario(latest))
            )
          )
          .subscribe();

        trigger.next(1);
        firstRequest.next(['a']); // emitted, but never completed
        trigger.next(2);

        expect(superseded.status).toBe('success');
        expect(superseded.toRecord().metadata).toEqual({ count: 1 });
        expect(latest.status).toBe('success');
      });
    });

    it("should abandon a stream torn down after a value with valueThenTeardown: 'cancel'", () => {
      const real = createScenario('poll-status');

      of(['a'], ['b'])
        .pipe(traceScenario(real, { valueThenTeardown: 'cancel' }), take(1))
        .subscribe();

      expect(real.status).toBe('abandoned');
    });

    describe('retry placement', () => {
      function failOnce(): Observable<string[]> {
        let attempts = 0;
        return defer(() =>
          attempts++ === 0
            ? throwError(() => new Error('transient'))
            : of(['a'])
        );
      }

      it('should settle as success when retry() comes before the operator', () => {
        const real = createScenario();

        failOnce().pipe(retry(1), traceScenario(real)).subscribe();

        expect(real.status).toBe('success');
      });

      it('should settle as failure when retry() comes after the operator, even if the retry succeeds', () => {
        const real = createScenario();

        failOnce().pipe(traceScenario(real), retry(1)).subscribe();

        // Documented limitation: the first error settles the scenario and
        // the operator cannot see the downstream retry.
        expect(real.status).toBe('failure');
      });
    });
  });
});
