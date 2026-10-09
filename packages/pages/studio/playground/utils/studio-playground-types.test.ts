import { IngredientCategory, ModelCategory } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';
import type { StudioPlaygroundType } from '../types';
import {
  getStudioPlaygroundTypeConfig,
  listStudioPlaygroundTypeConfigs,
  resolveStudioPlaygroundCapabilities,
  resolveStudioPlaygroundType,
  STUDIO_PLAYGROUND_TYPES,
} from './studio-playground-types';

describe('STUDIO_PLAYGROUND_TYPES', () => {
  it('covers every asset kind the playground generates', () => {
    expect([...STUDIO_PLAYGROUND_TYPES]).toEqual([
      'image',
      'image-edit',
      'video',
      'music',
      'avatar',
      'voice',
    ]);
  });

  it('exposes a config for every registered type', () => {
    for (const type of STUDIO_PLAYGROUND_TYPES) {
      expect(getStudioPlaygroundTypeConfig(type).type).toBe(type);
    }
    expect(listStudioPlaygroundTypeConfigs()).toHaveLength(
      STUDIO_PLAYGROUND_TYPES.length,
    );
  });
});

describe('lyrics/instrumental/style capabilities', () => {
  it('are only offered for music', () => {
    for (const type of STUDIO_PLAYGROUND_TYPES) {
      const { hasInstrumentalToggle, hasLyrics, hasStyle } =
        getStudioPlaygroundTypeConfig(type).capabilities;
      expect(hasInstrumentalToggle).toBe(type === 'music');
      expect(hasLyrics).toBe(type === 'music');
      expect(hasStyle).toBe(type === 'music');
    }
  });
});

describe('resolveStudioPlaygroundCapabilities', () => {
  it('keeps the static per-type capabilities for non-music types regardless of modelKey', () => {
    const capabilities = resolveStudioPlaygroundCapabilities(
      'video',
      MODEL_KEYS.REPLICATE_META_MUSICGEN,
    );
    expect(capabilities).toEqual(
      getStudioPlaygroundTypeConfig('video').capabilities,
    );
  });

  it('hides model-specific controls when no model is resolved yet', () => {
    const capabilities = resolveStudioPlaygroundCapabilities(
      'music',
      undefined,
    );
    expect(capabilities).toMatchObject({
      hasDuration: false,
      hasInstrumentalToggle: false,
      hasLyrics: false,
    });
  });

  it('hides model-specific controls in auto-select mode', () => {
    const capabilities = resolveStudioPlaygroundCapabilities('music', 'auto');
    expect(capabilities.hasInstrumentalToggle).toBe(false);
    expect(capabilities.hasLyrics).toBe(false);
  });

  it('hides both instrumental and lyrics controls for MusicGen (no vocal support)', () => {
    const capabilities = resolveStudioPlaygroundCapabilities(
      'music',
      MODEL_KEYS.REPLICATE_META_MUSICGEN,
    );
    expect(capabilities.hasInstrumentalToggle).toBe(false);
    expect(capabilities.hasLyrics).toBe(false);
  });

  it('offers both controls for a model that supports vocals and lyrics (Eleven Music)', () => {
    const capabilities = resolveStudioPlaygroundCapabilities(
      'music',
      MODEL_KEYS.FAL_ELEVENLABS_MUSIC,
    );
    expect(capabilities.hasInstrumentalToggle).toBe(true);
    expect(capabilities.hasLyrics).toBe(true);
  });

  it('leaves every other capability flag untouched', () => {
    const capabilities = resolveStudioPlaygroundCapabilities(
      'music',
      MODEL_KEYS.REPLICATE_META_MUSICGEN,
    );
    const staticCapabilities =
      getStudioPlaygroundTypeConfig('music').capabilities;
    expect(capabilities.hasDuration).toBe(staticCapabilities.hasDuration);
    expect(capabilities.hasModelSelection).toBe(
      staticCapabilities.hasModelSelection,
    );
    expect(capabilities.hasOutputs).toBe(staticCapabilities.hasOutputs);
  });
});

describe('getStudioPlaygroundTypeConfig', () => {
  it('maps image to the image ingredient + model catalog', () => {
    const config = getStudioPlaygroundTypeConfig('image');

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
    const config = getStudioPlaygroundTypeConfig('video');

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
    const config = getStudioPlaygroundTypeConfig('music');

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
    const config = getStudioPlaygroundTypeConfig('avatar');

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
    expect(getStudioPlaygroundTypeConfig('avatar').resourceSegment).toBe(
      'videos',
    );
  });

  it('picks a catalog voice instead of a router model', () => {
    const config = getStudioPlaygroundTypeConfig('voice');

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

describe('resolveStudioPlaygroundType', () => {
  it('accepts every registered type', () => {
    for (const type of STUDIO_PLAYGROUND_TYPES) {
      expect(resolveStudioPlaygroundType(type)).toBe(type);
    }
  });

  it.each([undefined, null, '', 'gif', 'IMAGE '])(
    'falls back to image for %p',
    (value) => {
      expect(resolveStudioPlaygroundType(value as StudioPlaygroundType)).toBe(
        'image',
      );
    },
  );
});
