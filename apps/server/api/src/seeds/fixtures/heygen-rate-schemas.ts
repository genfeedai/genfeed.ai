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

/**
 * The avatar video fields that price a request. HeyGen bills Avatar IV and
 * Avatar V per output second by the look's `avatar_type`, so that selector is
 * the only pricing dimension. `resolution` is deliberately absent: the sheet
 * carries no resolution band, and declaring it would make every quote demand
 * one. `avatar_type` lists only the types with a verified price; `image` and
 * `prompt` stay unpriced and are refused.
 */
function avatarOpenapi(
  avatarTypes: readonly string[],
): SchemaFixture['openapi'] {
  return {
    components: {
      schemas: {
        Input: {
          properties: {
            aspect_ratio: { enum: ['16:9', '9:16', '1:1'], type: 'string' },
            audio_url: { format: 'uri', type: 'string' },
            avatar_id: { type: 'string' },
            avatar_type: { enum: [...avatarTypes], type: 'string' },
            duration: {
              description: 'Output seconds HeyGen bills for the clip.',
              minimum: 0,
              type: 'number',
            },
            script: { type: 'string' },
            voice_id: { type: 'string' },
          },
          required: ['avatar_id', 'avatar_type'],
          title: 'Input',
          type: 'object',
        },
        Output: {
          properties: {
            duration: { type: 'number' },
            status: {
              enum: ['waiting', 'pending', 'processing', 'completed', 'failed'],
              type: 'string',
            },
            video_id: { type: 'string' },
            video_url: { format: 'uri', type: 'string' },
          },
          required: ['video_id'],
          title: 'Output',
          type: 'object',
        },
      },
    },
    openapi: '3.1.0',
  };
}

export const HEYGEN_SCHEMA_FIXTURES: Readonly<Record<string, SchemaFixture>> = {
  'heygen/avatar-iv': {
    openapi: avatarOpenapi(['photo_avatar', 'digital_twin', 'studio_avatar']),
    schemaFamily: 'heygen-avatar-v3',
  },
  'heygen/avatar-v': {
    openapi: avatarOpenapi(['digital_twin']),
    schemaFamily: 'heygen-avatar-v3',
  },
  'heygen/heygen-voice-1': {
    openapi: SPEECH_OPENAPI,
    schemaFamily: 'heygen-speech-v1',
  },
};
