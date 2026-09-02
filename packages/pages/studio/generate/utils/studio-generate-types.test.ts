import { IngredientCategory, ModelCategory } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import type { StudioGenerateType } from '../types';
import {
  getStudioGenerateTypeConfig,
  listStudioGenerateTypeConfigs,
  resolveStudioGenerateType,
  STUDIO_GENERATE_TYPES,
} from './studio-generate-types';

describe('STUDIO_GENERATE_TYPES', () => {
  it('covers every asset kind the playground generates', () => {
    expect([...STUDIO_GENERATE_TYPES]).toEqual([
      'image',
      'video',
      'music',
      'avatar',
      'voice',
    ]);
  });

  it('exposes a config for every registered type', () => {
    for (const type of STUDIO_GENERATE_TYPES) {
      expect(getStudioGenerateTypeConfig(type).type).toBe(type);
    }
    expect(listStudioGenerateTypeConfigs()).toHaveLength(
      STUDIO_GENERATE_TYPES.length,
    );
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
      hasLook: false,
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

  it('waits on the videos collection for a finished avatar clip', () => {
    // `POST /videos/avatar` persists a video ingredient and publishes
    // `WebSocketPaths.video(id)`; `/avatars` holds the source portraits.
    expect(getStudioGenerateTypeConfig('avatar').resourceSegment).toBe(
      'videos',
    );
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

describe('resolveStudioGenerateType', () => {
  it('accepts every registered type', () => {
    for (const type of STUDIO_GENERATE_TYPES) {
      expect(resolveStudioGenerateType(type)).toBe(type);
    }
  });

  it.each([undefined, null, '', 'gif', 'IMAGE '])(
    'falls back to image for %p',
    (value) => {
      expect(resolveStudioGenerateType(value as StudioGenerateType)).toBe(
        'image',
      );
    },
  );
});
