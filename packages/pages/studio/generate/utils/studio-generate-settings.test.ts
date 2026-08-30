import {
  ContentTemplateKey,
  IngredientFormat,
  RouterPriority,
} from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';
import { buildBaseGenerationPayload } from './generation-payloads';
import {
  buildStudioPromptData,
  getDefaultStudioGenerateSettings,
  getStudioAspectRatios,
  getStudioDurations,
  getStudioResolutions,
  resolveAspectDimensions,
  resolveIngredientFormat,
  STUDIO_ASPECT_RATIOS,
} from './studio-generate-settings';

describe('resolveAspectDimensions', () => {
  it('keeps the long edge and derives the short edge', () => {
    expect(resolveAspectDimensions('16:9', 1024)).toEqual({
      height: 576,
      width: 1024,
    });
    expect(resolveAspectDimensions('9:16', 1024)).toEqual({
      height: 1024,
      width: 576,
    });
    expect(resolveAspectDimensions('1:1', 1024)).toEqual({
      height: 1024,
      width: 1024,
    });
  });

  it('snaps derived edges to a multiple of 8', () => {
    const { height, width } = resolveAspectDimensions('4:5', 1024);

    expect(height).toBe(1024);
    expect(width % 8).toBe(0);
  });

  it('falls back to a square for an unparseable ratio', () => {
    expect(resolveAspectDimensions('nonsense', 1024)).toEqual({
      height: 1024,
      width: 1024,
    });
  });
});

describe('resolveIngredientFormat', () => {
  it('classifies orientation from the ratio', () => {
    expect(resolveIngredientFormat('16:9')).toBe(IngredientFormat.LANDSCAPE);
    expect(resolveIngredientFormat('9:16')).toBe(IngredientFormat.PORTRAIT);
    expect(resolveIngredientFormat('1:1')).toBe(IngredientFormat.SQUARE);
  });
});

describe('getDefaultStudioGenerateSettings', () => {
  it('turns brand enrichment on by default for every type', () => {
    for (const type of [
      'image',
      'video',
      'music',
      'avatar',
      'voice',
    ] as const) {
      expect(getDefaultStudioGenerateSettings(type).brandingMode).toBe('brand');
    }
  });

  it('gives image a square 1K default with a single output', () => {
    const settings = getDefaultStudioGenerateSettings('image');

    expect(settings).toMatchObject({
      aspectRatio: '1:1',
      outputs: 1,
      prioritize: RouterPriority.BALANCED,
      resolution: '1K',
    });
    expect(settings.duration).toBeUndefined();
  });

  it('gives video a widescreen default with a duration', () => {
    const settings = getDefaultStudioGenerateSettings('video');

    expect(settings.aspectRatio).toBe('16:9');
    expect(settings.resolution).toBe('720p');
    expect(settings.duration).toBe(5);
  });

  it('gives music a duration and no aspect-driven look', () => {
    expect(getDefaultStudioGenerateSettings('music').duration).toBe(10);
  });
});

describe('option lists', () => {
  it('offers the full aspect ladder to image and video only', () => {
    expect(getStudioAspectRatios('image')).toEqual(STUDIO_ASPECT_RATIOS);
    expect(getStudioAspectRatios('video')).toEqual(STUDIO_ASPECT_RATIOS);
    expect(getStudioAspectRatios('music')).toEqual([]);
  });

  it('offers pixel tiers to image and named tiers to video', () => {
    expect(
      getStudioResolutions('image').map((option) => option.value),
    ).toContain('2K');
    expect(
      getStudioResolutions('video', 'bytedance/seedance-2.5').map(
        (option) => option.value,
      ),
    ).toEqual(['480p', '720p']);
    expect(getStudioResolutions('voice')).toEqual([]);
  });

  it('waits for an explicit video model instead of posting an illegal generic resolution', () => {
    expect(getStudioResolutions('video')).toEqual([]);
  });

  it('offers durations only where the provider bills by length', () => {
    expect(getStudioDurations('video').length).toBeGreaterThan(0);
    expect(getStudioDurations('music').length).toBeGreaterThan(0);
    expect(getStudioDurations('image')).toEqual([]);
  });
});

describe('buildStudioPromptData', () => {
  it('carries every Look field into the prompt schema', () => {
    const settings = {
      ...getDefaultStudioGenerateSettings('image'),
      blacklist: ['watermark'],
      camera: 'macro',
      lighting: 'golden hour',
      modelKey: 'flux-dev',
      mood: 'serene',
      scene: 'rooftop',
      style: 'cinematic',
      tags: ['launch'],
    };

    const promptData = buildStudioPromptData({
      brandId: 'brand-1',
      promptText: 'A product on marble',
      settings,
      type: 'image',
    });

    expect(promptData).toMatchObject({
      autoSelectModel: false,
      blacklist: ['watermark'],
      brand: 'brand-1',
      brandingMode: 'brand',
      camera: 'macro',
      isBrandingEnabled: true,
      isValid: true,
      lighting: 'golden hour',
      models: ['flux-dev'],
      mood: 'serene',
      scene: 'rooftop',
      style: 'cinematic',
      tags: ['launch'],
      text: 'A product on marble',
    });
  });

  it('marks auto routing when no explicit model is picked', () => {
    const promptData = buildStudioPromptData({
      brandId: 'brand-1',
      promptText: 'anything',
      settings: getDefaultStudioGenerateSettings('image'),
      type: 'image',
    });

    expect(promptData.autoSelectModel).toBe(true);
    expect(promptData.models).toEqual([]);
  });

  it('derives dimensions and format from aspect ratio and resolution', () => {
    const promptData = buildStudioPromptData({
      brandId: 'brand-1',
      promptText: 'anything',
      settings: {
        ...getDefaultStudioGenerateSettings('image'),
        aspectRatio: '16:9',
        resolution: '2K',
      },
      type: 'image',
    });

    expect(promptData.width).toBe(2048);
    expect(promptData.height).toBe(1152);
    expect(promptData.format).toBe(IngredientFormat.LANDSCAPE);
  });

  it('drops resolution for auto-routed video and normalizes a stale explicit value', () => {
    const auto = buildStudioPromptData({
      brandId: 'brand-1',
      promptText: 'A product reveal',
      settings: getDefaultStudioGenerateSettings('video'),
      type: 'video',
    });
    expect(auto.resolution).toBeUndefined();

    const explicit = buildStudioPromptData({
      brandId: 'brand-1',
      promptText: 'A product reveal',
      settings: {
        ...getDefaultStudioGenerateSettings('video'),
        modelKey: 'bytedance/seedance-2.5',
        resolution: 'illegal-stale-value',
      },
      type: 'video',
    });
    expect(explicit.resolution).toBe('720p');
  });

  it('is invalid without prompt text', () => {
    expect(
      buildStudioPromptData({
        brandId: 'brand-1',
        promptText: '   ',
        settings: getDefaultStudioGenerateSettings('image'),
        type: 'image',
      }).isValid,
    ).toBe(false);
  });

  it('stays valid for avatar when speech carries the script', () => {
    const promptData = buildStudioPromptData({
      brandId: 'brand-1',
      promptText: '',
      settings: {
        ...getDefaultStudioGenerateSettings('avatar'),
        avatarPhotoUrl: 'https://cdn.genfeed.test/portrait.png',
        speech: 'Hello from Genfeed',
        voiceId: 'voice-1',
      },
      type: 'avatar',
    });

    expect(promptData.isValid).toBe(true);
    // `avatarId` on the avatar endpoint means a HeyGen catalog id we never
    // hold; Genfeed portraits travel as `photoUrl` instead.
    expect(promptData.avatarId).toBeUndefined();
    expect(promptData.voiceId).toBe('voice-1');
  });
});

describe('studio prompt data feeding the Genfeed enrichment payload', () => {
  it('restores template + brand enrichment that the agent path drops', () => {
    const promptData = buildStudioPromptData({
      brandId: 'brand-1',
      promptText: 'A founder at a desk',
      settings: {
        ...getDefaultStudioGenerateSettings('image'),
        mood: 'confident',
        promptTemplate: 'product-photo',
        style: 'editorial',
      },
      type: 'image',
    });

    const payload = buildBaseGenerationPayload(
      promptData,
      'flux-dev',
      'brand-1',
    );

    expect(payload).toMatchObject({
      brand: 'brand-1',
      brandingMode: 'brand',
      isBrandingEnabled: true,
      mood: 'confident',
      promptTemplate: ContentTemplateKey.IMAGE_PRODUCT,
      style: 'editorial',
      useTemplate: true,
    });
  });

  it('honours brand enrichment switched off', () => {
    const promptData = buildStudioPromptData({
      brandId: 'brand-1',
      promptText: 'A founder at a desk',
      settings: {
        ...getDefaultStudioGenerateSettings('image'),
        brandingMode: 'off',
      },
      type: 'image',
    });

    const payload = buildBaseGenerationPayload(
      promptData,
      'flux-dev',
      'brand-1',
    );

    expect(payload.brandingMode).toBe('off');
    expect(payload.isBrandingEnabled).toBe(false);
  });

  it('never claims enrichment on a type whose payload cannot carry it', () => {
    // Music, avatar, and voice reach their providers without the brand
    // fields, so an enabled Brand switch there would be a lie.
    const promptData = buildStudioPromptData({
      brandId: 'brand-1',
      promptText: 'Lo-fi loop',
      settings: {
        ...getDefaultStudioGenerateSettings('music'),
        brandingMode: 'brand',
      },
      type: 'music',
    });

    expect(promptData.isBrandingEnabled).toBe(false);
  });
});
