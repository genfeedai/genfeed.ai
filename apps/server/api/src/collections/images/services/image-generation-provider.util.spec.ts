import {
  REPLICATE_IMAGE_MODELS,
  resolveImageGenerationProvider,
} from '@api/collections/images/services/image-generation-provider.util';
import { ModelProvider } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';

describe('resolveImageGenerationProvider', () => {
  it.each([
    ['genfeed-ai/org/model', 'genfeedai'],
    [MODEL_KEYS.KLINGAI_V2, 'klingai'],
    [MODEL_KEYS.HIGGSFIELD_SOUL, 'higgsfield'],
    [MODEL_KEYS.FAL_FLUX_DEV, 'fal'],
    ['fal/partner/endpoint', 'fal'],
    [MODEL_KEYS.LEONARDOAI, 'leonardo'],
    [MODEL_KEYS.REPLICATE_OPENAI_GPT_IMAGE_2, 'replicate'],
    [MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDREAM_4_5, 'replicate'],
    ['owner/model:version', 'replicate'],
    [MODEL_KEYS.SDXL, 'sdxl'],
  ])('resolves %s to %s in dispatch order', (model, provider) => {
    expect(resolveImageGenerationProvider(model)).toBe(provider);
  });

  it('keeps the explicit Replicate image endpoints on Replicate', () => {
    for (const model of REPLICATE_IMAGE_MODELS) {
      expect(resolveImageGenerationProvider(model)).toBe('replicate');
    }
  });

  it('honours an explicit provider hint for Fal and Replicate rows', () => {
    expect(
      resolveImageGenerationProvider('owner/model', ModelProvider.FAL),
    ).toBe('fal');
    expect(
      resolveImageGenerationProvider(
        'fal-ai/flux/dev',
        ModelProvider.REPLICATE,
      ),
    ).toBe('replicate');
    expect(
      resolveImageGenerationProvider('owner/model', ModelProvider.OPENROUTER),
    ).toBeNull();
  });

  it('returns null for keys no image adapter dispatches', () => {
    expect(resolveImageGenerationProvider('not a model key')).toBeNull();
    expect(resolveImageGenerationProvider('')).toBeNull();
  });
});
