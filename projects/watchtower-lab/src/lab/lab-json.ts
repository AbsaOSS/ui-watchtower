/**
 * `text` as a JSON object, or `undefined` for anything else: not JSON, an
 * array, a number. The lab's JSON fields all take objects.
 */
export function parseJsonObject(
  text: string
): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}
