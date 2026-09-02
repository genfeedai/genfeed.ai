import { ByokProvider, ModelProvider } from '@genfeedai/contracts';

const MODEL_PROVIDER_TO_BYOK: Record<string, ByokProvider> = {
  [ModelProvider.REPLICATE]: ByokProvider.REPLICATE,
  [ModelProvider.FAL]: ByokProvider.FAL,
  [ModelProvider.OPENROUTER]: ByokProvider.OPENROUTER,
  [ModelProvider.GENFEED_AI]: ByokProvider.REPLICATE,
};

/**
 * Map ModelProvider enum → ByokProvider.
 * Used when a model document has a `provider` field.
 */
export function modelProviderToByokProvider(
  modelProvider: string,
): ByokProvider | undefined {
  return MODEL_PROVIDER_TO_BYOK[modelProvider];
}

/**
 * ModelKey prefix → ByokProvider mapping.
 * Ordered longest-prefix-first so "fal-ai/" matches before "fal".
 */
const AUTHORITATIVE_MODEL_KEY_PREFIX_TO_BYOK: Array<[string, ByokProvider]> = [
  ['higgsfield-ai/', ByokProvider.HIGGSFIELD],
  ['kling-video/', ByokProvider.HIGGSFIELD],
];

const MODEL_KEY_PREFIX_TO_BYOK: Array<[string, ByokProvider]> = [
  ['argil/', ByokProvider.ARGIL],
  ['anthropic/', ByokProvider.ANTHROPIC],
  ['openai/', ByokProvider.OPENAI],
  ['heygen/', ByokProvider.HEYGEN],
  ['hedra', ByokProvider.HEDRA],
  ...AUTHORITATIVE_MODEL_KEY_PREFIX_TO_BYOK,
  ['klingai', ByokProvider.KLINGAI],
  ['leonardoai', ByokProvider.LEONARDOAI],
  ['fal-ai/', ByokProvider.FAL],
  ['x-ai/', ByokProvider.OPENROUTER],
  ['genfeed-ai/', ByokProvider.REPLICATE],
];

/**
 * Resolve ByokProvider from a modelKey string (e.g. "heygen/avatar" → HEYGEN).
 * Falls back to undefined if no prefix matches.
 */
export function modelKeyToByokProvider(
  modelKey: string,
): ByokProvider | undefined {
  for (const [prefix, provider] of MODEL_KEY_PREFIX_TO_BYOK) {
    if (modelKey.startsWith(prefix)) {
      return provider;
    }
  }
  return undefined;
}

/**
 * Resolve the credential provider used by a concrete model route.
 *
 * Dedicated Higgsfield routes are authoritative because their catalog rows
 * currently retain Replicate as a fallback provider. Other routes preserve
 * catalog precedence so proxied keys such as `anthropic/*` through OpenRouter
 * do not get mistaken for direct-provider BYOK.
 */
export function resolveModelByokProvider(
  modelKey?: string,
  modelProvider?: string,
): ByokProvider | undefined {
  const authoritativeProvider = modelKey
    ? AUTHORITATIVE_MODEL_KEY_PREFIX_TO_BYOK.find(([prefix]) =>
        modelKey.startsWith(prefix),
      )?.[1]
    : undefined;

  return (
    authoritativeProvider ??
    (modelProvider ? modelProviderToByokProvider(modelProvider) : undefined) ??
    (modelKey ? modelKeyToByokProvider(modelKey) : undefined)
  );
}
