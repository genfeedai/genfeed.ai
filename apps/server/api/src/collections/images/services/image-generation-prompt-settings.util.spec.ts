import {
  buildImageQuoteProviderInput,
  resolveImageDispatchQuality,
} from '@api/collections/images/services/image-generation-prompt-settings.util';
import type { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { describe, expect, it, vi } from 'vitest';

const SUNBURST = MODEL_KEYS.REPLICATE_OPENAI_GPT_IMAGE_2_5_SUNBURST;

describe('resolveImageDispatchQuality', () => {
  it('keeps a quality the model offers', () => {
    expect(resolveImageDispatchQuality(SUNBURST, 'high')).toBe('high');
  });

  it('falls back to the catalog default when none or an unknown one is asked for', () => {
    expect(resolveImageDispatchQuality(SUNBURST, undefined)).toBe('max');
    expect(resolveImageDispatchQuality(SUNBURST, 'standard')).toBe('max');
  });

  it('passes the request through for a model without quality tiers', () => {
    expect(
      resolveImageDispatchQuality(
        MODEL_KEYS.REPLICATE_QWEN_QWEN_IMAGE,
        undefined,
      ),
    ).toBeUndefined();
  });
});

describe('buildImageQuoteProviderInput', () => {
  function builderSpy() {
    const buildPrompt = vi.fn().mockResolvedValue({ input: {} });
    return {
      buildPrompt,
      builder: { buildPrompt } as unknown as PromptBuilderService,
    };
  }

  it('prices the tier a request without quality is dispatched at', async () => {
    const { buildPrompt, builder } = builderSpy();

    await buildImageQuoteProviderInput(builder, SUNBURST, {});

    expect(buildPrompt).toHaveBeenCalledWith(
      SUNBURST,
      expect.objectContaining({ quality: 'max' }),
    );
  });

  it('prices the quality that was asked for', async () => {
    const { buildPrompt, builder } = builderSpy();

    await buildImageQuoteProviderInput(builder, SUNBURST, { quality: 'high' });

    expect(buildPrompt).toHaveBeenCalledWith(
      SUNBURST,
      expect.objectContaining({ quality: 'high' }),
    );
  });
});
