import type { SchemaFixture } from '@api/seeds/reviewed-provider-rates-seed.types';

/**
 * Provider schemas for the HeyGen rate-sheet entries. HeyGen publishes no
 * Replicate-style prediction schema, so the seed carries this hand-written one,
 * limited to the fields we send and read (HeyGen API notes, 2026-10-10).
 */
const SPEECH_OPENAPI: SchemaFixture['openapi'] = {
  components: {
    schemas: {
      Input: {
        properties: {
          expressiveness_boost: {
            description: 'Instant voices only.',
            maximum: 1,
            minimum: 0,
            type: 'number',
          },
          language: { type: 'string' },
          model: { const: 'heygen-voice-1', type: 'string' },
          text: { maxLength: 5000, minLength: 1, type: 'string' },
          voice_id: { type: 'string' },
        },
        required: ['model', 'voice_id', 'text'],
        title: 'Input',
        type: 'object',
      },
      Output: {
        properties: {
          audio_url: { format: 'uri', type: 'string' },
          duration: { type: 'number' },
        },
        required: ['audio_url'],
        title: 'Output',
        type: 'object',
      },
    },
  },
  openapi: '3.1.0',
};

export const HEYGEN_SCHEMA_FIXTURES: Readonly<Record<string, SchemaFixture>> = {
  'heygen/heygen-voice-1': {
    openapi: SPEECH_OPENAPI,
    schemaFamily: 'heygen-speech-v1',
  },
};
