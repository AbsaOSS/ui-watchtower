import {
  UwtDebugFlag,
  uwtDebugWrite as coreDebugWrite
} from '@absaoss-cps/ui-watchtower';
import { uwtDevModeReporter } from '../uwt-telemetry-safe.util/uwt-telemetry-safe.util';

/**
 * Writes a debug line to the console, but only when `flag` is on, and never
 * at the caller's expense: the core's, reporting a failing write through
 * {@link uwtDevModeReporter}.
 *
 * @param flag the debug switch that has to be on
 * @param write performs the console call; never runs when the flag is off
 * @param name the name to test against a list-valued flag, e.g. a logger
 * name for `debugLogger`
 */
export function uwtDebugWrite(
  flag: UwtDebugFlag,
  write: () => void,
  name?: string
): void {
  coreDebugWrite(flag, write, name, uwtDevModeReporter);
}
