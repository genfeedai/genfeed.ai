import { ByokProvider, ModelProvider } from '@genfeedai/enums';

const MODEL_PROVIDER_TO_BYOK: Record<string, ByokProvider> = {
  [ModelProvider.REPLICATE]: ByokProvider.REPLICATE,
  [ModelProvider.FAL]: ByokProvider.FAL,
  [ModelProvider.GENFEED_AI]: ByokProvider.REPLICATE,
  [ModelProvider.HUGGINGFACE]: ByokProvider.REPLICATE,
};

/**
 * Map ModelProvider enum → ByokProvider.
 * Used when a model document has a `provider` field.
 */
export function modelProviderToByokProvider(
  modelProvider: ModelProvider,
): ByokProvider | undefined {
  return MODEL_PROVIDER_TO_BYOK[modelProvider];
}

/**
 * ModelKey prefix → ByokProvider mapping.
 * Ordered longest-prefix-first so "fal-ai/" matches before "fal".
 */
const MODEL_KEY_PREFIX_TO_BYOK: Array<[string, ByokProvider]> = [
  ['anthropic/', ByokProvider.ANTHROPIC],
  ['openai/', ByokProvider.OPENAI],
  ['heygen/', ByokProvider.HEYGEN],
  ['hedra', ByokProvider.HEDRA],
  ['klingai', ByokProvider.KLINGAI],
  ['leonardoai', ByokProvider.LEONARDOAI],
  ['fal-ai/', ByokProvider.FAL],
  ['x-ai/', ByokProvider.OPENROUTER],
  ['genfeed-ai/', ByokProvider.REPLICATE],
  ['hf/', ByokProvider.REPLICATE],
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
