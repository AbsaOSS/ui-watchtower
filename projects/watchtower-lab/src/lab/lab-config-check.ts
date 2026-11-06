/** A value's type as the check names it: `array`, `object`, `number`… */
function typeOf(value: unknown): string {
  return Array.isArray(value)
    ? 'array'
    : value === null
      ? 'null'
      : typeof value;
}

/**
 * What's wrong with a `?config=` overlay, or `''`: a section the lab doesn't
 * take, a setting the section doesn't have, or a value of another type than
 * the setting's. `known` holds each section's settings, with values of the
 * types they take — the settings in effect will do.
 */
export function labCheckConfig(
  overlay: Record<string, unknown>,
  known: Record<string, Record<string, unknown>>
): string {
  for (const [section, settings] of Object.entries(overlay)) {
    const valid = known[section];
    if (!valid) {
      return `"${section}" isn't a section; use ${Object.keys(known).join(', ')}.`;
    }
    if (typeOf(settings) !== 'object') {
      return `"${section}" should be an object.`;
    }
    for (const [key, value] of Object.entries(
      settings as Record<string, unknown>
    )) {
      if (!(key in valid)) {
        return `"${section}.${key}" isn't a setting; ${section} has ${Object.keys(valid).join(', ')}.`;
      }
      // Patterns, written as text, sit in arrays: checked as arrays.
      const expected = typeOf(valid[key]);
      if (typeOf(value) !== expected) {
        return `"${section}.${key}" should be ${expected === 'array' || expected === 'object' ? 'an' : 'a'} ${expected}.`;
      }
    }
  }
  return '';
}
