import { KIE_KLING_INPUT_SCHEMA } from '@api/seeds/model-provider-offers.seed';
import { describe, expect, it } from 'vitest';
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
