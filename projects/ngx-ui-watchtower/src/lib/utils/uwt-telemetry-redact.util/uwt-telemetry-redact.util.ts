import {
  UWT_DEFAULT_REDACT_CONFIG,
  uwtNormalizeError as coreNormalizeError,
  UwtRedactConfig,
  uwtRedactMetadata as coreRedactMetadata,
  uwtScrubString as coreScrubString,
  UwtTelemetryError,
  UwtTelemetryMetadata
} from '@absaoss-cps/ui-watchtower';
import { uwtDevModeReporter } from '../uwt-telemetry-safe.util/uwt-telemetry-safe.util';

/*
 * The redaction functions this package has always exported: the core's, with
 * their warnings reported on the console in development mode, as before.
 */

/**
 * Strips URL query strings/fragments, scans for opted-in PII shapes, runs
 * `extraValueTransforms`, then caps length — in that order, so value
 * scanning also catches PII embedded in a URL path segment.
 *
 * @param value the string to clean
 * @param config redaction settings
 * @returns the cleaned, length-capped string
 *
 * @group Utils
 */
export function uwtScrubString(value: string, config: UwtRedactConfig): string {
  return coreScrubString(value, config, uwtDevModeReporter);
}

/**
 * Produces a telemetry-safe attribute bag: flat primitives only (enforcing
 * at runtime what {@link UwtTelemetryMetadata} states at compile time),
 * denylisted keys redacted, strings scrubbed via {@link uwtScrubString},
 * non-finite numbers and objects/functions/symbols dropped, and the
 * attribute count capped (warns once via `console.warn` in dev mode).
 *
 * @param value the candidate attributes
 * @param config redaction settings
 * @returns a safe attribute bag, or `undefined` when nothing survives
 *
 * @group Utils
 */
export function uwtRedactMetadata(
  value: unknown,
  config: UwtRedactConfig = UWT_DEFAULT_REDACT_CONFIG
): UwtTelemetryMetadata | undefined {
  return coreRedactMetadata(value, config, uwtDevModeReporter);
}

/**
 * Converts a thrown value into a bounded, telemetry-safe shape — only the
 * constructor name, scrubbed message and (optionally) a capped stack; never
 * the raw error object.
 *
 * @param error any thrown value, including non-`Error` values
 * @param config redaction settings
 * @returns the normalized error, or `undefined` when there is nothing to report
 *
 * @group Utils
 */
export function uwtNormalizeError(
  error: unknown,
  config: UwtRedactConfig = UWT_DEFAULT_REDACT_CONFIG
): UwtTelemetryError | undefined {
  return coreNormalizeError(error, config, uwtDevModeReporter);
}
