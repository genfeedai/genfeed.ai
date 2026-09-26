/**
 * Cross-family rule (#4921 judge policy): a judge never shares a model family
 * with any generator it scores. The model registry has no family column, so
 * the family is read off the registry key — `vendor/model` for every LLM and
 * media key — with vendor aliases folded together. Aggregator and router
 * prefixes name a route, not a model family, so they cannot be proven
 * cross-family and are rejected rather than guessed.
 */

import type { CrossFamilyCheckInput } from './contracts';

const VENDOR_FAMILY_ALIASES: Record<string, string> = {
  'deepseek-ai': 'deepseek',
  'meta-llama': 'meta',
  mistralai: 'mistral',
  'x-ai': 'xai',
};

/** Prefixes that route to many families; `local/<name>` is resolved by name. */
const UNRESOLVABLE_PREFIXES = new Set([
  'fal',
  'fal-ai',
  'genfeed-ai',
  'openrouter',
  'replicate',
]);

/** Self-hosted `local/` models carry the upstream family in the model name. */
const LOCAL_MODEL_FAMILIES: Array<[prefix: string, family: string]> = [
  ['deepseek', 'deepseek'],
  ['gemma', 'google'],
  ['llama', 'meta'],
  ['mistral', 'mistral'],
  ['qwen', 'qwen'],
];

export class CrossFamilyViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CrossFamilyViolationError';
  }
}

export function resolveModelFamily(registryKey: string): string | null {
  const [prefix, name] = registryKey.trim().toLowerCase().split('/', 2);
  if (!prefix || !name) {
    return null;
  }

  if (prefix === 'local') {
    return (
      LOCAL_MODEL_FAMILIES.find(([localPrefix]) =>
        name.startsWith(localPrefix),
      )?.[1] ?? null
    );
  }

  if (UNRESOLVABLE_PREFIXES.has(prefix)) {
    return null;
  }

  return VENDOR_FAMILY_ALIASES[prefix] ?? prefix;
}

/** Family for a key the cross-family check has already accepted. */
export function requireModelFamily(registryKey: string): string {
  const family = resolveModelFamily(registryKey);
  if (!family) {
    throw new CrossFamilyViolationError(
      `Cannot resolve a model family for "${registryKey}"; use a vendor/model registry key, not a router`,
    );
  }

  return family;
}

/** Runs before any provider call; throws on the first violation. */
export function assertCrossFamily({
  generatorRegistryKeys,
  judgeRegistryKeys,
}: CrossFamilyCheckInput): void {
  const generatorFamilies = new Map(
    generatorRegistryKeys.map((key) => [key, requireModelFamily(key)]),
  );

  for (const judgeKey of judgeRegistryKeys) {
    const judgeFamily = requireModelFamily(judgeKey);
    for (const [generatorKey, generatorFamily] of generatorFamilies) {
      if (generatorFamily === judgeFamily) {
        throw new CrossFamilyViolationError(
          `Judge "${judgeKey}" and generator "${generatorKey}" are both in the "${judgeFamily}" family; pick a judge from another family`,
        );
      }
    }
  }
}
