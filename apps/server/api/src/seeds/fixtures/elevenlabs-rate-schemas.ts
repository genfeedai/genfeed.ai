import type { SchemaFixture } from '@api/seeds/reviewed-provider-rates-seed.types';

/**
 * Provider schemas for the ElevenLabs text-to-speech rate-sheet entries.
 * ElevenLabs publishes no Replicate-style prediction schema, so the seed
 * carries this hand-written one, limited to the fields we send and read
 * (ElevenLabs models overview, 2026-10-14).
 */
function speechOpenapi(
  modelId: string,
  maxCharacters: number,
): SchemaFixture['openapi'] {
  return {
    components: {
      schemas: {
        Input: {
          properties: {
            model_id: { const: modelId, type: 'string' },
            text: { maxLength: maxCharacters, minLength: 1, type: 'string' },
            voice_id: { type: 'string' },
          },
          required: ['model_id', 'voice_id', 'text'],
          title: 'Input',
          type: 'object',
        },
        Output: {
          properties: {
            audio_base64: { type: 'string' },
          },
          required: ['audio_base64'],
          title: 'Output',
          type: 'object',
        },
      },
    },
    openapi: '3.1.0',
  };
}

export const ELEVENLABS_SCHEMA_FIXTURES: Readonly<
  Record<string, SchemaFixture>
> = {
  'elevenlabs/eleven_flash_v2_5': {
    openapi: speechOpenapi('eleven_flash_v2_5', 40_000),
    schemaFamily: 'elevenlabs-speech-v1',
  },
  'elevenlabs/eleven_multilingual_v2': {
    openapi: speechOpenapi('eleven_multilingual_v2', 10_000),
    schemaFamily: 'elevenlabs-speech-v1',
  },
  'elevenlabs/eleven_v4': {
    openapi: speechOpenapi('eleven_v4', 10_000),
    schemaFamily: 'elevenlabs-speech-v1',
  },
};
