import type { SchemaFixture } from '@api/seeds/reviewed-provider-rates-seed.types';

/**
 * H3 Max Director is a fal realtime (WebRTC) session: fal publishes no
 * OpenAPI document for it and its platform API cannot address it by id. The
 * seed carries this hand-written schema, limited to the fields a live session
 * sends (fal model page llms.txt, 2026-10-15).
 */
const H3_MAX_DIRECTOR_OPENAPI: SchemaFixture['openapi'] = {
  components: {
    schemas: {
      Input: {
        properties: {
          prompt: { minLength: 1, type: 'string' },
          resolution: {
            description: '1080P bills at twice the standard rate.',
            enum: ['480P', '768P', '1080P'],
            type: 'string',
          },
        },
        required: ['prompt'],
        title: 'Input',
        type: 'object',
      },
      Output: {
        description:
          'A realtime session: video and audio stream to the client over WebRTC.',
        title: 'Output',
        type: 'object',
      },
    },
  },
  openapi: '3.1.0',
};

export const FAL_REALTIME_SCHEMA_FIXTURES: Readonly<
  Record<string, SchemaFixture>
> = {
  'minimax/h3-max/director': {
    openapi: H3_MAX_DIRECTOR_OPENAPI,
    schemaFamily: 'fal-realtime-session-v1',
  },
};
