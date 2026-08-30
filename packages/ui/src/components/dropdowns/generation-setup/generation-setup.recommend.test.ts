import { RouterPriority } from '@genfeedai/enums';
import type {
  GenerationSetupFieldKey,
  GenerationSetupRecommendationInput,
} from '@genfeedai/interfaces/studio/generation-setup.interface';
import type { StudioGenerateCapabilities } from '@genfeedai/interfaces/studio/studio-generate.interface';
import { describe, expect, it } from 'vitest';
import { recommendGenerationSetup } from './generation-setup.recommend';

const FULL_CAPABILITIES: StudioGenerateCapabilities = {
  hasAspectRatio: true,
  hasBrandEnrichment: true,
  hasDuration: true,
  hasIdentity: true,
  hasLook: true,
  hasModelSelection: true,
  hasOutputs: true,
  hasReferences: true,
  hasSpeech: true,
};

function buildInput(
  overrides: Partial<GenerationSetupRecommendationInput> = {},
): GenerationSetupRecommendationInput {
  return {
    capabilities: FULL_CAPABILITIES,
    prompt: 'a photo of a cat',
    type: 'image',
    ...overrides,
  };
}

describe('recommendGenerationSetup', () => {
  it('is deterministic for the same input', () => {
    const input = buildInput({ prompt: 'a cinematic story reel of a launch' });

    expect(recommendGenerationSetup(input)).toEqual(
      recommendGenerationSetup(input),
    );
  });

  it('gives every recommended key a non-empty reason string', () => {
    const { reasons, values } = recommendGenerationSetup(
      buildInput({ prompt: 'a quick cheap draft variation reel' }),
    );

    for (const key of Object.keys(values) as GenerationSetupFieldKey[]) {
      expect(typeof reasons[key]).toBe('string');
      expect((reasons[key] ?? '').length).toBeGreaterThan(0);
    }
  });

  describe('type', () => {
    it('never recommends type when the surface locks it', () => {
      const { reasons, values } = recommendGenerationSetup(
        buildInput({ lockedType: 'image', prompt: 'an animated film clip' }),
      );

      expect(values.type).toBeUndefined();
      expect(reasons.type).toBeUndefined();
    });

    it('still uses the locked type to resolve the aspect ratio default', () => {
      const { values } = recommendGenerationSetup(
        buildInput({ lockedType: 'video', prompt: 'a plain scene' }),
      );

      expect(values.aspectRatio).toBe('16:9');
    });

    it.each(['motion', 'animate', 'animation', 'clip', 'film', 'footage'])(
      'recommends video when the prompt says "%s"',
      (keyword) => {
        const { reasons, values } = recommendGenerationSetup(
          buildInput({ prompt: `please ${keyword} this` }),
        );

        expect(values.type).toBe('video');
        expect(reasons.type).toBeTruthy();
      },
    );

    it('defaults to image with a reason when no motion keyword is present', () => {
      const { reasons, values } = recommendGenerationSetup(
        buildInput({ prompt: 'a still shot of a mountain' }),
      );

      expect(values.type).toBe('image');
      expect(reasons.type).toBeTruthy();
    });
  });

  describe('aspectRatio', () => {
    it('is not recommended when the type has no aspect ratio capability', () => {
      const { values } = recommendGenerationSetup(
        buildInput({
          capabilities: { ...FULL_CAPABILITIES, hasAspectRatio: false },
        }),
      );

      expect(values.aspectRatio).toBeUndefined();
    });

    it.each(['story', 'reel', 'tiktok', 'vertical', 'portrait'])(
      'recommends 9:16 for "%s"',
      (keyword) => {
        const { values } = recommendGenerationSetup(
          buildInput({ prompt: `a ${keyword} about our launch` }),
        );
        expect(values.aspectRatio).toBe('9:16');
      },
    );

    it.each(['banner', 'wide', 'cinematic', 'landscape', 'thumbnail'])(
      'recommends 16:9 for "%s"',
      (keyword) => {
        const { values } = recommendGenerationSetup(
          buildInput({ prompt: `a ${keyword} shot` }),
        );
        expect(values.aspectRatio).toBe('16:9');
      },
    );

    it.each(['logo', 'avatar', 'icon', 'profile'])(
      'recommends 1:1 for "%s"',
      (keyword) => {
        const { values } = recommendGenerationSetup(
          buildInput({ prompt: `a ${keyword} picture` }),
        );
        expect(values.aspectRatio).toBe('1:1');
      },
    );

    it('falls back to the per-type default when no framing keyword matches', () => {
      const image = recommendGenerationSetup(
        buildInput({ lockedType: 'image', prompt: 'a cat' }),
      );
      const video = recommendGenerationSetup(
        buildInput({ lockedType: 'video', prompt: 'a cat' }),
      );

      expect(image.values.aspectRatio).toBe('1:1');
      expect(video.values.aspectRatio).toBe('16:9');
    });
  });

  describe('duration', () => {
    it('is not recommended for a non-video type', () => {
      const { values } = recommendGenerationSetup(
        buildInput({ lockedType: 'image', prompt: 'a quick loop' }),
      );

      expect(values.duration).toBeUndefined();
    });

    it('is not recommended when the type has no duration capability', () => {
      const { values } = recommendGenerationSetup(
        buildInput({
          capabilities: { ...FULL_CAPABILITIES, hasDuration: false },
          lockedType: 'video',
        }),
      );

      expect(values.duration).toBeUndefined();
    });

    it.each(['quick', 'loop', 'teaser'])(
      'recommends the short 4s duration for "%s"',
      (keyword) => {
        const { values } = recommendGenerationSetup(
          buildInput({ lockedType: 'video', prompt: `a ${keyword} clip` }),
        );
        expect(values.duration).toBe(4);
      },
    );

    it('defaults to 5s when no short-form keyword matches', () => {
      const { values } = recommendGenerationSetup(
        buildInput({ lockedType: 'video', prompt: 'a full scene' }),
      );

      expect(values.duration).toBe(5);
    });
  });

  describe('modelKey', () => {
    it('is not recommended when the type has no model selection', () => {
      const { values } = recommendGenerationSetup(
        buildInput({
          capabilities: { ...FULL_CAPABILITIES, hasModelSelection: false },
        }),
      );

      expect(values.modelKey).toBeUndefined();
      expect(values.prioritize).toBeUndefined();
    });

    it('always recommends Auto with a routing reason', () => {
      const { reasons, values } = recommendGenerationSetup(buildInput());

      expect(values.modelKey).toBe('');
      expect(reasons.modelKey).toBe(
        'Auto-routes to the best model for this prompt',
      );
    });
  });

  describe('prioritize', () => {
    it('forces cost priority on zero credits regardless of prompt wording', () => {
      const { values } = recommendGenerationSetup(
        buildInput({ hasZeroCredits: true, prompt: 'a photoreal portrait' }),
      );

      expect(values.prioritize).toBe(RouterPriority.COST);
    });

    it.each(['photoreal', 'photorealistic', 'product shot'])(
      'recommends quality priority for "%s"',
      (keyword) => {
        const { values } = recommendGenerationSetup(
          buildInput({ prompt: `a ${keyword} of the item` }),
        );
        expect(values.prioritize).toBe(RouterPriority.QUALITY);
      },
    );

    it.each(['cheap', 'budget'])(
      'recommends cost priority for "%s"',
      (keyword) => {
        const { values } = recommendGenerationSetup(
          buildInput({ prompt: `a ${keyword} option` }),
        );
        expect(values.prioritize).toBe(RouterPriority.COST);
      },
    );

    it.each(['draft', 'quick'])(
      'recommends speed priority for "%s"',
      (keyword) => {
        const { values } = recommendGenerationSetup(
          buildInput({ prompt: `a ${keyword} render` }),
        );
        expect(values.prioritize).toBe(RouterPriority.SPEED);
      },
    );

    it('defaults to balanced priority otherwise', () => {
      const { values } = recommendGenerationSetup(
        buildInput({ prompt: 'a cat on a chair' }),
      );

      expect(values.prioritize).toBe(RouterPriority.BALANCED);
    });
  });

  describe('outputs', () => {
    it('is not recommended when the type has no outputs capability', () => {
      const { values } = recommendGenerationSetup(
        buildInput({
          capabilities: { ...FULL_CAPABILITIES, hasOutputs: false },
        }),
      );

      expect(values.outputs).toBeUndefined();
    });

    it.each(['variations', 'variation', 'options', 'versions'])(
      'recommends 4 outputs for "%s"',
      (keyword) => {
        const { values } = recommendGenerationSetup(
          buildInput({ prompt: `give me some ${keyword}` }),
        );
        expect(values.outputs).toBe(4);
      },
    );

    it('defaults to a single output otherwise', () => {
      const { values } = recommendGenerationSetup(
        buildInput({ prompt: 'a single hero shot' }),
      );

      expect(values.outputs).toBe(1);
    });
  });

  describe('brandingMode', () => {
    it('is not recommended when the type has no brand enrichment', () => {
      const { values } = recommendGenerationSetup(
        buildInput({
          capabilities: { ...FULL_CAPABILITIES, hasBrandEnrichment: false },
        }),
      );

      expect(values.brandingMode).toBeUndefined();
    });

    it('recommends brand mode with a reason when enrichment is available', () => {
      const { reasons, values } = recommendGenerationSetup(buildInput());

      expect(values.brandingMode).toBe('brand');
      expect(reasons.brandingMode).toBeTruthy();
    });
  });

  describe('isPromptEnhanceEnabled', () => {
    it('always recommends enabling prompt enhancement', () => {
      const { reasons, values } = recommendGenerationSetup(
        buildInput({
          capabilities: { ...FULL_CAPABILITIES, hasBrandEnrichment: false },
        }),
      );

      expect(values.isPromptEnhanceEnabled).toBe(true);
      expect(reasons.isPromptEnhanceEnabled).toBeTruthy();
    });
  });
});
