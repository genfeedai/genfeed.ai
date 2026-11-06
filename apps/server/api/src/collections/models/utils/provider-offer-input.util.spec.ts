import { KIE_KLING_INPUT_SCHEMA } from '@api/seeds/model-provider-offers.seed';
import { describe, expect, it } from 'vitest';
import falKlingSchemas from './fixtures/fal-kling-v3-input-schemas.json';
import { mapProviderOfferInput } from './provider-offer-input.util';

const schema = {
  type: 'object',
  properties: {
    prompt: { type: 'string' },
    sound: { type: 'boolean' },
    duration: { type: 'number', minimum: 3, maximum: 15 },
  },
  required: ['prompt', 'duration', 'sound'],
  additionalProperties: false,
};
describe('provider offer input mapping', () => {
  it('maps reviewed Kling fields without changing its mode, audio, duration or frame order', () => {
    expect(
      mapProviderOfferInput(KIE_KLING_INPUT_SCHEMA, {
        providerInput: {
          prompt: 'Sunrise',
          mode: 'standard',
          generate_audio: true,
          duration: 8,
          start_image: 'https://example.com/start.png',
          end_image: 'https://example.com/end.png',
        },
      }),
    ).toEqual({
      prompt: 'Sunrise',
      mode: 'std',
      sound: true,
      duration: '8',
      image_urls: [
        'https://example.com/start.png',
        'https://example.com/end.png',
      ],
      multi_shots: false,
    });
  });

  it('maps provider spellings without changing the requested audio or duration', () => {
    expect(
      mapProviderOfferInput(schema, {
        providerInput: {
          prompt: 'Sunrise',
          generate_audio: false,
          duration: 8,
        },
      }),
    ).toEqual({ prompt: 'Sunrise', sound: false, duration: 8 });
  });
  it('maps a Replicate video quality to the provider resolution only when the values match', () => {
    const resolutionSchema = {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        resolution: { type: 'string', enum: ['360p', '540p', '720p', '1080p'] },
      },
      required: ['prompt'],
      additionalProperties: false,
    };
    expect(
      mapProviderOfferInput(resolutionSchema, {
        providerInput: { prompt: 'Sunrise', quality: '720p' },
      }),
    ).toEqual({ prompt: 'Sunrise', resolution: '720p' });
    expect(
      mapProviderOfferInput(resolutionSchema, {
        providerInput: { prompt: 'Sunrise', quality: 'high' },
      }),
    ).toBeNull();
  });
  it('refuses missing or unknown fields', () => {
    expect(
      mapProviderOfferInput(schema, {
        providerInput: {
          prompt: 'Sunrise',
          sound: true,
          duration: 8,
          unsupported: 'requested',
        },
      }),
    ).toBeNull();
    expect(
      mapProviderOfferInput(schema, {
        providerInput: { prompt: 'Sunrise', duration: 8 },
      }),
    ).toBeNull();
  });
  it('refuses unsupported quantities and schemas', () => {
    expect(
      mapProviderOfferInput(schema, {
        providerInput: { prompt: 'Sunrise', duration: 20, sound: true },
      }),
    ).toBeNull();
    expect(mapProviderOfferInput(null, {})).toBeNull();
  });
});

describe('fal Kling v3 offers', () => {
  const PRO_TEXT = 'fal-ai/kling-video/v3/pro/text-to-video';
  const PRO_IMAGE = 'fal-ai/kling-video/v3/pro/image-to-video';
  const STANDARD_TEXT = 'fal-ai/kling-video/v3/standard/text-to-video';
  const STANDARD_IMAGE = 'fal-ai/kling-video/v3/standard/image-to-video';
  const START = 'https://example.com/start.png';
  const END = 'https://example.com/end.png';

  /** What fal fills in on every request when the field is left unset. */
  const FAL_DEFAULTS = {
    cfg_scale: 0.5,
    enable_safety_checker: true,
    shot_type: 'customize',
  };

  function map(endpoint: string, providerInput: Record<string, unknown>) {
    return mapProviderOfferInput(
      falKlingSchemas[endpoint as keyof typeof falKlingSchemas],
      { providerInput },
      { endpoint },
    );
  }

  it.each([
    [
      'a pro text request (mode left to its default)',
      PRO_TEXT,
      { aspect_ratio: '9:16', duration: 5, prompt: 'Sunrise' },
      {
        ...FAL_DEFAULTS,
        aspect_ratio: '9:16',
        duration: '5',
        generate_audio: false,
        negative_prompt: '',
        prompt: 'Sunrise',
      },
    ],
    [
      'a pro image request with an end frame and audio',
      PRO_IMAGE,
      {
        aspect_ratio: '16:9',
        duration: 10,
        end_image: END,
        generate_audio: true,
        mode: 'pro',
        prompt: 'Sunrise',
        start_image: START,
      },
      {
        ...FAL_DEFAULTS,
        duration: '10',
        end_image_url: END,
        generate_audio: true,
        negative_prompt: '',
        prompt: 'Sunrise',
        start_image_url: START,
      },
    ],
    [
      'a standard text request with a negative prompt',
      STANDARD_TEXT,
      {
        aspect_ratio: '1:1',
        duration: 3,
        mode: 'standard',
        negative_prompt: 'text',
        prompt: 'Sunrise',
      },
      {
        ...FAL_DEFAULTS,
        aspect_ratio: '1:1',
        duration: '3',
        generate_audio: false,
        negative_prompt: 'text',
        prompt: 'Sunrise',
      },
    ],
    [
      'a standard image request',
      STANDARD_IMAGE,
      {
        aspect_ratio: '16:9',
        duration: 15,
        mode: 'standard',
        prompt: 'Sunrise',
        start_image: START,
      },
      {
        ...FAL_DEFAULTS,
        duration: '15',
        generate_audio: false,
        negative_prompt: '',
        prompt: 'Sunrise',
        start_image_url: START,
      },
    ],
  ])('maps %s', (_case, endpoint, providerInput, expected) => {
    expect(map(endpoint, providerInput)).toEqual(expected);
  });

  it.each([
    ['a standard request on a pro endpoint', PRO_TEXT, { mode: 'standard' }],
    ['a pro request on a standard endpoint', STANDARD_TEXT, { mode: 'pro' }],
    ['a 4k request', PRO_TEXT, { mode: '4k' }],
    ['a start image on a text endpoint', PRO_TEXT, { start_image: START }],
    ['no start image on an image endpoint', PRO_IMAGE, {}],
    ['an end frame without a start frame', PRO_IMAGE, { end_image: END }],
    ['a multi-shot prompt', PRO_TEXT, { multi_prompt: '[{"prompt":"a"}]' }],
    ['voice ids', PRO_TEXT, { voice_ids: ['voice-1'] }],
    ['a duration fal does not offer', PRO_TEXT, { duration: 20 }],
  ])('refuses %s', (_case, endpoint, overrides) => {
    expect(
      map(endpoint, { duration: 5, prompt: 'Sunrise', ...overrides }),
    ).toBeNull();
  });

  it('refuses a quote that carries no native input', () => {
    expect(
      mapProviderOfferInput(
        falKlingSchemas[PRO_TEXT],
        { duration: 5 },
        { endpoint: PRO_TEXT },
      ),
    ).toBeNull();
  });
});
