export function isMergeableRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Drops keys whose value is `undefined`.
 *
 * Nest's `plainToInstance` materializes every declared DTO field as an own
 * property holding `undefined` when the request body omitted it. Prisma rejects
 * those keys, so write paths must never forward them.
 */
export function omitUndefinedFields(
  input: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}

/**
 * Copies the defined keys of `incoming` over `current`.
 *
 * `undefined` has to be skipped here for the same reason it is skipped at the
 * top level: spreading a class instance would write `undefined` over each
 * stored value the caller never mentioned.
 */
export function mergeDefinedKeys(
  current: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...current };

  for (const [key, value] of Object.entries(incoming)) {
    if (value !== undefined) {
      merged[key] = value;
    }
  }

  return merged;
}
