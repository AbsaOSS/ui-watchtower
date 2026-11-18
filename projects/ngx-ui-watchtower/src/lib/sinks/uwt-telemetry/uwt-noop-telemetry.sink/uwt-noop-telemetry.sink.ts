import { Injectable } from '@angular/core';
import { UwtNoopTelemetrySink as CoreNoopTelemetrySink } from '@absaoss-cps/ui-watchtower';

/**
 * Sink that discards everything.
 *
 * Selected with `provideUwtTelemetrySink('noop')` — never a default. Debug
 * flags, logging and scenario mechanics all still work, with no AWS account
 * or `aws-rum-web` dependency needed.
 *
 * @group Services
 */
@Injectable()
export class UwtNoopTelemetrySink extends CoreNoopTelemetrySink {}
