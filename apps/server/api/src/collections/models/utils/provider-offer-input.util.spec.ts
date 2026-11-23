import {
  KIE_KLING_INPUT_SCHEMA,
  KIE_MINIMAX_H3_IMAGE_INPUT_SCHEMA,
  KIE_MINIMAX_H3_TEXT_INPUT_SCHEMA,
  KIE_SEEDANCE_FAST_INPUT_SCHEMA,
  KIE_WAN_3_INPUT_SCHEMA,
} from '@api/seeds/model-provider-offers.seed';
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

describe('kie MiniMax H3 offers', () => {
  const TEXT = 'minimax-h3/text-to-video';
  const IMAGE = 'minimax-h3/image-to-video';
  const FIRST = 'https://example.com/first.png';
  const LAST = 'https://example.com/last.png';
  /** What the Replicate builder always sends, empty reference lists included. */
  const REPLICATE_BASE = {
    duration: 6,
    prompt: 'Sunrise',
    reference_audio_urls: [],
    reference_image_urls: [],
    reference_video_urls: [],
    resolution: '2K',
  };

  function map(endpoint: string, providerInput: Record<string, unknown>) {
    return mapProviderOfferInput(
      endpoint === TEXT
        ? KIE_MINIMAX_H3_TEXT_INPUT_SCHEMA
        : KIE_MINIMAX_H3_IMAGE_INPUT_SCHEMA,
      { providerInput },
      { endpoint },
    );
  }

  it('sends a text request to the text endpoint with kie field names', () => {
    expect(map(TEXT, { ...REPLICATE_BASE, ratio: '9:16' })).toEqual({
      aspect_ratio: '9:16',
      duration: 6,
      prompt: 'Sunrise',
      resolution: '2K',
    });
  });

  it('keeps a 768P request at 768P', () => {
    expect(
      map(TEXT, { ...REPLICATE_BASE, ratio: '16:9', resolution: '768P' }),
    ).toMatchObject({ resolution: '768P' });
  });

  it('sends first and last frames to the image endpoint and drops the ratio', () => {
    expect(
      map(IMAGE, {
        ...REPLICATE_BASE,
        first_frame_image: FIRST,
        last_frame_image: LAST,
        ratio: 'adaptive',
      }),
    ).toEqual({
      duration: 6,
      first_frame_url: FIRST,
      last_frame_url: LAST,
      prompt: 'Sunrise',
      resolution: '2K',
    });
  });

  it('accepts a last frame alone, as Replicate does', () => {
    expect(
      map(IMAGE, { ...REPLICATE_BASE, last_frame_image: LAST, ratio: '16:9' }),
    ).toMatchObject({ last_frame_url: LAST });
  });

  it('refuses the endpoint that does not match the start', () => {
    expect(
      map(TEXT, { ...REPLICATE_BASE, first_frame_image: FIRST }),
    ).toBeNull();
    expect(map(IMAGE, { ...REPLICATE_BASE, ratio: '16:9' })).toBeNull();
  });

  it.each([
    ['reference images', { reference_image_urls: [FIRST] }],
    [
      'reference videos',
      { reference_video_urls: ['https://example.com/a.mp4'] },
    ],
    [
      'reference audio',
      { reference_audio_urls: ['https://example.com/a.mp3'] },
    ],
  ])('leaves a request with %s on Replicate', (_name, extra) => {
    expect(
      map(TEXT, { ...REPLICATE_BASE, ratio: '16:9', ...extra }),
    ).toBeNull();
    expect(
      map(IMAGE, { ...REPLICATE_BASE, first_frame_image: FIRST, ...extra }),
    ).toBeNull();
  });

  it('refuses adaptive on the text endpoint and a missing duration', () => {
    expect(map(TEXT, { ...REPLICATE_BASE, ratio: 'adaptive' })).toBeNull();
    const { duration: _duration, ...withoutDuration } = REPLICATE_BASE;
    expect(map(TEXT, { ...withoutDuration, ratio: '16:9' })).toBeNull();
  });

  it('refuses a request with no native input', () => {
    expect(
      mapProviderOfferInput(
        KIE_MINIMAX_H3_TEXT_INPUT_SCHEMA,
        {},
        { endpoint: TEXT },
      ),
    ).toBeNull();
  });
});

describe('kie Wan 3.0 offer', () => {
  const ENDPOINT = 'wan/3-0-video';
  const IMAGE = 'https://example.com/first.png';

  function map(providerInput: Record<string, unknown>) {
    return mapProviderOfferInput(
      KIE_WAN_3_INPUT_SCHEMA,
      { providerInput },
      { endpoint: ENDPOINT },
    );
  }

  it('upper-cases the resolution and keeps the ratio, duration and seed', () => {
    expect(
      map({
        aspect_ratio: '9:16',
        duration: 8,
        prompt: 'Sunrise',
        resolution: '720p',
        seed: 7,
      }),
    ).toEqual({
      aspect_ratio: '9:16',
      duration: 8,
      prompt: 'Sunrise',
      resolution: '720P',
      seed: 7,
    });
  });

  it('applies the defaults both providers share', () => {
    expect(map({ prompt: 'Sunrise' })).toEqual({
      aspect_ratio: 'adaptive',
      duration: 5,
      prompt: 'Sunrise',
      resolution: '1080P',
    });
  });

  it('sends an image as the first frame and drops the ratio Replicate ignores', () => {
    expect(
      map({
        aspect_ratio: '16:9',
        duration: 5,
        image: IMAGE,
        prompt: 'Sunrise',
        resolution: '480p',
      }),
    ).toEqual({
      aspect_ratio: 'adaptive',
      duration: 5,
      first_frame_url: IMAGE,
      prompt: 'Sunrise',
      resolution: '480P',
    });
  });

  it('ignores an empty negative prompt and an enabled prompt expansion', () => {
    expect(
      map({
        enable_prompt_expansion: true,
        negative_prompt: '',
        prompt: 'Sunrise',
      }),
    ).toMatchObject({ prompt: 'Sunrise' });
  });

  it.each([
    ['a negative prompt', { negative_prompt: 'blur' }],
    ['prompt expansion turned off', { enable_prompt_expansion: false }],
    ['a ratio kie lacks', { aspect_ratio: '21:9' }],
    ['a resolution kie lacks', { resolution: '4k' }],
  ])('leaves a request with %s on Replicate', (_name, extra) => {
    expect(map({ prompt: 'Sunrise', ...extra })).toBeNull();
  });
});

describe('kie Seedance 2.0 Fast offer', () => {
  const ENDPOINT = 'bytedance/seedance-2-fast';
  const FIRST = 'https://example.com/first.png';
  const LAST = 'https://example.com/last.png';
  /** What the Replicate builder sends for a plain text request. */
  const TEXT = {
    aspect_ratio: '9:16',
    duration: 6,
    generate_audio: false,
    prompt: 'Sunrise',
    resolution: '480p',
  };

  function map(providerInput: Record<string, unknown>) {
    return mapProviderOfferInput(
      KIE_SEEDANCE_FAST_INPUT_SCHEMA,
      { providerInput },
      { endpoint: ENDPOINT },
    );
  }

  it('keeps a text request as it is', () => {
    expect(map(TEXT)).toEqual(TEXT);
  });

  it('sends the start and end frames under kie names', () => {
    expect(map({ ...TEXT, image: FIRST, last_frame: LAST })).toEqual({
      ...TEXT,
      first_frame_url: FIRST,
      last_frame_url: LAST,
    });
    expect(
      map({ ...TEXT, image: FIRST, last_frame_image: LAST }),
    ).toMatchObject({ last_frame_url: LAST });
  });

  it('ignores empty reference lists', () => {
    expect(
      map({ ...TEXT, reference_audios: [], reference_images: [] }),
    ).toEqual(TEXT);
  });

  it.each([
    ['reference images', { reference_images: [FIRST] }],
    ['reference videos', { reference_videos: ['https://example.com/a.mp4'] }],
    ['reference audio', { reference_audios: ['https://example.com/a.mp3'] }],
    ['a seed', { seed: 7 }],
    ['an end frame without a start frame', { last_frame: LAST }],
    ['a ratio kie lacks', { aspect_ratio: '21:9' }],
    ['a resolution kie lacks', { resolution: '1080p' }],
    ['a duration kie lacks', { duration: 20 }],
  ])('leaves a request with %s on Replicate', (_name, extra) => {
    expect(map({ ...TEXT, ...extra })).toBeNull();
  });
});
