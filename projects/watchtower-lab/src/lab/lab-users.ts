/** RUM user ids must be UUIDs. */
export const ANNA = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
export const BEN = '9b2d1c6e-7a53-4d0e-8f3b-2c1a5e6d7f80';
export const CARLA = '5c8e2f14-1b7d-4a96-9e3c-8d2b7f4a6c10';

/**
 * The people the lab signs in, by id. Carla signs in from the fragment, a
 * separate app that keeps its own copy of her id.
 */
export const LAB_USER_NAMES: Record<string, string> = {
  [ANNA]: 'Anna',
  [BEN]: 'Ben',
  [CARLA]: 'Carla'
};
