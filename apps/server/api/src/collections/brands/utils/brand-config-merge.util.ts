/**
 * `agentConfig` sub-objects that `updateAgentConfig` merges key-by-key instead
 * of replacing wholesale.
 *
 * These are partial-patch targets: the app's brand cards each own a slice of
 * `voice`/`strategy` and send only their own keys, and fields no UI surfaces at
 * all (`voice.taglines`, `voice.hashtags` — written during brand-kit extraction
 * and read back by `buildBrandContext`) would otherwise be dropped by the first
 * inline field save.
 *
 * `platformOverrides` is deliberately absent. It is an authoritative map, not a
 * patch target: the agent profile card rebuilds it from form state and omits
 * overrides the user cleared, so merging would resurrect deleted overrides.
 */
export const MERGEABLE_AGENT_CONFIG_KEYS: ReadonlySet<string> = new Set([
  'autoPublish',
  'prompting',
  'schedule',
  'strategy',
  'voice',
]);

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
