import type { ImageGenerationProvider } from '@api/collections/images/services/image-generation.types';
import {
  isFalDestination,
  isGenfeedAiDestination,
  isReplicateDestination,
} from '@api/collections/models/utils/model-key.util';
import type { ModelProvider } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';

/** Replicate image endpoints that do not match the generic `owner/model` key shape. */
export const REPLICATE_IMAGE_MODELS: readonly string[] = [
  MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3,
  MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4,
  MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4_FAST,
  MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4_ULTRA,
];

type ImageProviderMatcher = {
  matches(model: string, provider?: ModelProvider | string): boolean;
  provider: ImageGenerationProvider;
};

/**
 * Ordered dispatch table. The first matching provider wins, exactly as the
 * adapter registry has always resolved it.
 */
const IMAGE_PROVIDER_MATCHERS: readonly ImageProviderMatcher[] = [
  { matches: (model) => isGenfeedAiDestination(model), provider: 'genfeedai' },
  { matches: (model) => model === MODEL_KEYS.KLINGAI_V2, provider: 'klingai' },
  {
    matches: (model) => model === MODEL_KEYS.HIGGSFIELD_SOUL,
    provider: 'higgsfield',
  },
  {
    matches: (model, provider) => isFalDestination(model, provider),
    provider: 'fal',
  },
  { matches: (model) => model === MODEL_KEYS.LEONARDOAI, provider: 'leonardo' },
  {
    matches: (model, provider) =>
      provider
        ? isReplicateDestination(model, provider)
        : !isFalDestination(model) &&
          !isGenfeedAiDestination(model) &&
          (REPLICATE_IMAGE_MODELS.includes(model) ||
            isReplicateDestination(model)),
    provider: 'replicate',
  },
  { matches: (model) => model === MODEL_KEYS.SDXL, provider: 'sdxl' },
];

/**
 * #4813 Single source for "which provider executes this image model". The
 * dispatch registry and the shared credit calculator (fan-out semantics) both
 * resolve through here so a quote can never assume a different provider than
 * the charge.
 */
export function resolveImageGenerationProvider(
  model: string,
  provider?: ModelProvider | string,
): ImageGenerationProvider | null {
  return (
    IMAGE_PROVIDER_MATCHERS.find((matcher) => matcher.matches(model, provider))
      ?.provider ?? null
  );
}
