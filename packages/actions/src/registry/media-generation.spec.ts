import { describe, expect, it } from 'vitest';
import {
  findInapplicableMediaGenerationParameters,
  getMediaGenerationCreditFloor,
  getMediaGenerationType,
  getVisualMediaGenerationType,
  isMediaGenerationType,
  MEDIA_GENERATION_CREDIT_FLOORS,
  MEDIA_GENERATION_TOOL_NAME,
  MEDIA_GENERATION_TYPE_PARAMETERS,
  MEDIA_GENERATION_TYPES,
} from './media-generation';
import { getToolByName } from './tool-registry';

describe('media generation type parsing', () => {
  it('names the single generate tool and its four types', () => {
    expect(MEDIA_GENERATION_TOOL_NAME).toBe('generate');
    expect([...MEDIA_GENERATION_TYPES]).toEqual([
      'image',
      'video',
      'voice',
      'music',
    ]);
  });

  it.each(MEDIA_GENERATION_TYPES)(
    'reads type %s from a generate call',
    (type) => {
      expect(getMediaGenerationType('generate', { type })).toBe(type);
      expect(isMediaGenerationType(type)).toBe(true);
    },
  );

  it.each([
    ['another tool', 'generate_as_identity', { type: 'image' }],
    ['a removed per-kind tool', 'generate_image', { type: 'image' }],
    ['an unknown type', 'generate', { type: 'gif' }],
    ['a missing type', 'generate', {}],
    ['a non-string type', 'generate', { type: 1 }],
    ['null parameters', 'generate', null],
    ['string parameters', 'generate', 'image'],
    ['undefined parameters', 'generate', undefined],
  ])('returns undefined for %s', (_label, name, parameters) => {
    expect(getMediaGenerationType(name, parameters)).toBeUndefined();
  });

  it('rejects values that are not media generation types', () => {
    expect(isMediaGenerationType('IMAGE')).toBe(false);
    expect(isMediaGenerationType(undefined)).toBe(false);
    expect(isMediaGenerationType(null)).toBe(false);
  });

  it('narrows to visual types for image and video only', () => {
    expect(getVisualMediaGenerationType('generate', { type: 'image' })).toBe(
      'image',
    );
    expect(getVisualMediaGenerationType('generate', { type: 'video' })).toBe(
      'video',
    );
    expect(
      getVisualMediaGenerationType('generate', { type: 'voice' }),
    ).toBeUndefined();
    expect(
      getVisualMediaGenerationType('generate', { type: 'music' }),
    ).toBeUndefined();
    expect(
      getVisualMediaGenerationType('transform_media', { type: 'image' }),
    ).toBeUndefined();
  });
});

describe('media generation credit floors', () => {
  it.each(MEDIA_GENERATION_TYPES)(
    'uses the %s floor for a typed call',
    (type) => {
      expect(getMediaGenerationCreditFloor({ type })).toBe(
        MEDIA_GENERATION_CREDIT_FLOORS[type],
      );
    },
  );

  it.each([
    ['an unknown type', { type: 'gif' }],
    ['a missing type', {}],
    ['null parameters', null],
    ['undefined parameters', undefined],
  ])('falls back to the highest floor for %s', (_label, parameters) => {
    expect(getMediaGenerationCreditFloor(parameters)).toBe(
      Math.max(...Object.values(MEDIA_GENERATION_CREDIT_FLOORS)),
    );
    expect(getMediaGenerationCreditFloor(parameters)).toBe(
      MEDIA_GENERATION_CREDIT_FLOORS.video,
    );
  });

  it('keeps the generate tool credit cost at the cheapest floor', () => {
    expect(getToolByName('generate')?.creditCost).toBe(
      Math.min(...Object.values(MEDIA_GENERATION_CREDIT_FLOORS)),
    );
  });
});

describe('inapplicable media generation parameters', () => {
  it('flags a voice id on an image call', () => {
    expect(
      findInapplicableMediaGenerationParameters('image', {
        prompt: 'a cat',
        type: 'image',
        voiceId: 'voice-1',
      }),
    ).toEqual(['voiceId']);
  });

  it('flags image-only outputs on a video call', () => {
    expect(
      findInapplicableMediaGenerationParameters('video', {
        outputs: 2,
        prompt: 'a cat',
        type: 'video',
      }),
    ).toEqual(['outputs']);
  });

  it('returns every offender sorted', () => {
    expect(
      findInapplicableMediaGenerationParameters('voice', {
        prompt: 'hello',
        type: 'voice',
        voiceId: 'voice-1',
        resolution: '1k',
        aspectRatio: '1:1',
        duration: 5,
      }),
    ).toEqual(['aspectRatio', 'duration', 'resolution']);
  });

  it('accepts a model for music but not for voice', () => {
    expect(
      findInapplicableMediaGenerationParameters('music', {
        model: 'music-model-1',
        prompt: 'calm piano',
        type: 'music',
      }),
    ).toEqual([]);
    expect(
      findInapplicableMediaGenerationParameters('voice', {
        model: 'voice-model-1',
        prompt: 'hello',
        type: 'voice',
      }),
    ).toEqual(['model']);
  });

  it('ignores null and undefined values', () => {
    expect(
      findInapplicableMediaGenerationParameters('music', {
        outputs: null,
        prompt: 'calm piano',
        type: 'music',
        voiceId: undefined,
      }),
    ).toEqual([]);
  });

  it.each([
    ['image', { aspectRatio: '1:1', outputs: 2, prompt: 'a cat' }],
    ['video', { duration: 5, imageUrl: 'https://x.test/a.png', prompt: 'p' }],
    ['voice', { prompt: 'hello', voiceId: 'voice-1' }],
    ['music', { duration: 60, prompt: 'calm piano' }],
  ] as const)('accepts the declared %s parameters', (type, parameters) => {
    expect(
      findInapplicableMediaGenerationParameters(type, { ...parameters, type }),
    ).toEqual([]);
  });
});

describe('generate tool schema', () => {
  const tool = getToolByName('generate');

  it('requires type and prompt', () => {
    expect(tool?.parameters.required).toEqual(['type', 'prompt']);
    expect(tool?.parameters.properties.type).toMatchObject({
      enum: [...MEDIA_GENERATION_TYPES],
    });
  });

  it('declares every parameter in MEDIA_GENERATION_TYPE_PARAMETERS and nothing else', () => {
    const declared = new Set(Object.keys(tool?.parameters.properties ?? {}));
    const accepted = new Set(
      MEDIA_GENERATION_TYPES.flatMap((type) => [
        ...MEDIA_GENERATION_TYPE_PARAMETERS[type],
      ]),
    );

    expect([...declared].sort()).toEqual([...accepted].sort());
  });
});
