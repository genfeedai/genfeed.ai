import { IngredientCategory, ModelCategory } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';
import type { StudioGenerateType } from '../types';
import {
  getStudioGenerateTypeConfig,
  resolveStudioGenerateCapabilities,
  STUDIO_GENERATE_TYPES,
} from './studio-generate-types';

describe('lyrics/instrumental/style capabilities', () => {
  it('are only offered for music', () => {
    for (const type of STUDIO_GENERATE_TYPES) {
      const { hasInstrumentalToggle, hasLyrics, hasStyle } =
        getStudioGenerateTypeConfig(type).capabilities;
      expect(hasInstrumentalToggle).toBe(type === 'music');
      expect(hasLyrics).toBe(type === 'music');
      expect(hasStyle).toBe(type === 'music');
    }
  });
});

describe('resolveStudioGenerateCapabilities', () => {
  it('leaves every other capability flag untouched', () => {
    const capabilities = resolveStudioGenerateCapabilities(
      'music',
      MODEL_KEYS.REPLICATE_META_MUSICGEN,
    );
    const staticCapabilities =
      getStudioGenerateTypeConfig('music').capabilities;
    expect(capabilities.hasDuration).toBe(staticCapabilities.hasDuration);
    expect(capabilities.hasModelSelection).toBe(
      staticCapabilities.hasModelSelection,
    );
    expect(capabilities.hasOutputs).toBe(staticCapabilities.hasOutputs);
  });
});

describe('getStudioGenerateTypeConfig', () => {
  it('maps image to the image ingredient + model catalog', () => {
    const config = getStudioGenerateTypeConfig('image');

    expect(config.ingredientCategory).toBe(IngredientCategory.IMAGE);
    expect(config.modelCategory).toBe(ModelCategory.IMAGE);
    expect(config.resourceSegment).toBe('images');
    expect(config.capabilities).toMatchObject({
      hasAspectRatio: true,
      hasBrandEnrichment: true,
      hasDuration: false,
      hasLook: true,
      hasOutputs: true,
      hasSpeech: false,
    });
  });

  it('gives video duration but neither speech nor an output multiplier', () => {
    const config = getStudioGenerateTypeConfig('video');

    expect(config.ingredientCategory).toBe(IngredientCategory.VIDEO);
    expect(config.modelCategory).toBe(ModelCategory.VIDEO);
    expect(config.capabilities).toMatchObject({
      hasAspectRatio: true,
      hasBrandEnrichment: true,
      hasDuration: true,
      hasOutputs: false,
      // A video prompt describes a scene; spoken scripts are the Avatar type.
      hasSpeech: false,
    });
  });

  it('gives music duration without look controls', () => {
    const config = getStudioGenerateTypeConfig('music');

    expect(config.ingredientCategory).toBe(IngredientCategory.MUSIC);
    expect(config.modelCategory).toBe(ModelCategory.MUSIC);
    expect(config.capabilities).toMatchObject({
      hasAspectRatio: false,
      hasBrandEnrichment: false,
      hasDuration: true,
      hasInstrumentalToggle: true,
      hasLook: false,
      hasLyrics: true,
      hasReferences: false,
    });
  });

  it('routes avatar through identity with no router model catalog', () => {
    const config = getStudioGenerateTypeConfig('avatar');

    expect(config.ingredientCategory).toBe(IngredientCategory.AVATAR);
    expect(config.modelCategory).toBeNull();
    expect(config.capabilities).toMatchObject({
      hasBrandEnrichment: false,
      hasIdentity: true,
      hasModelSelection: false,
      hasSpeech: true,
    });
  });

  it('picks a catalog voice instead of a router model', () => {
    const config = getStudioGenerateTypeConfig('voice');

    expect(config.ingredientCategory).toBe(IngredientCategory.VOICE);
    expect(config.modelCategory).toBeNull();
    expect(config.capabilities).toMatchObject({
      hasBrandEnrichment: false,
      hasIdentity: true,
      hasLook: false,
      hasModelSelection: false,
      hasSpeech: true,
    });
  });
});
