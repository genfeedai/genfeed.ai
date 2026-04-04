import { IngredientFormat, RouterPriority } from '@genfeedai/enums';
import {
  buildBaseGenerationPayload,
  buildMusicPayload,
} from '@pages/studio/generate/utils/generation-payloads';
import { describe, expect, it } from 'vitest';

describe('generation-payloads', () => {
  it('buildBaseGenerationPayload omits model in auto mode and forwards prioritize', () => {
    const payload = buildBaseGenerationPayload(
      {
        autoSelectModel: true,
        blacklist: [],
        brand: 'brand-id',
        category: 'image',
        fontFamily: 'montserrat-black',
        format: IngredientFormat.PORTRAIT,
        height: 1920,
        isValid: true,
        models: [],
        outputs: 1,
        prioritize: RouterPriority.SPEED,
        quality: 'premium',
        sounds: [],
        style: '',
        tags: [],
        text: 'hello world',
        width: 1080,
      },
      'replicate/model-key',
      'brand-id',
    );

    expect(payload.autoSelectModel).toBe(true);
    expect(payload.model).toBeUndefined();
    expect(payload.prioritize).toBe(RouterPriority.SPEED);
  });

  it('buildBaseGenerationPayload keeps model when autoSelectModel is a non-boolean truthy value', () => {
    const payload = buildBaseGenerationPayload(
      {
        autoSelectModel: 'false' as unknown as boolean,
        blacklist: [],
        brand: 'brand-id',
        category: 'image',
        fontFamily: 'montserrat-black',
        format: IngredientFormat.PORTRAIT,
        height: 1920,
        isValid: true,
        models: [],
        outputs: 1,
        prioritize: RouterPriority.BALANCED,
        quality: 'premium',
        sounds: [],
        style: '',
        tags: [],
        text: 'hello world',
        width: 1080,
      },
      'replicate/model-key',
      'brand-id',
    );

    expect(payload.autoSelectModel).toBe(false);
    expect(payload.model).toBe('replicate/model-key');
  });

  it('buildMusicPayload includes prioritize and selected model in manual mode', () => {
    const payload = buildMusicPayload(
      {
        autoSelectModel: false,
        blacklist: [],
        brand: 'brand-id',
        category: 'music',
        fontFamily: 'montserrat-black',
        format: IngredientFormat.PORTRAIT,
        height: 1920,
        isValid: true,
        models: ['music/model-key'],
        outputs: 1,
        prioritize: RouterPriority.QUALITY,
        quality: 'premium',
        sounds: [],
        style: '',
        tags: [],
        text: 'cinematic music',
        width: 1080,
      },
      'music/model-key',
      12,
    );

    expect(payload.model).toBe('music/model-key');
    expect(payload.prioritize).toBe(RouterPriority.QUALITY);
    expect(payload.duration).toBe(12);
  });
});
