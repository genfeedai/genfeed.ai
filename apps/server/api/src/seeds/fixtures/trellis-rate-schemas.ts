import type { SchemaFixture } from '@api/seeds/reviewed-provider-rates-seed.types';

/**
 * Replicate publishes no version for `firtoz/trellis` on the public model
 * endpoint, so the seed carries the fields we send and read. TRELLIS bills a
 * flat price per prediction, so the schema declares no pricing selector.
 */
export const TRELLIS_SCHEMA_FIXTURES: Readonly<Record<string, SchemaFixture>> =
  {
    'firtoz/trellis': {
      openapi: {
        components: {
          schemas: {
            Input: {
              properties: {
                generate_model: { default: false, type: 'boolean' },
                images: {
                  items: { format: 'uri', type: 'string' },
                  type: 'array',
                },
                mesh_simplify: { maximum: 0.98, minimum: 0.9, type: 'number' },
                randomize_seed: { type: 'boolean' },
                seed: { type: 'integer' },
                texture_size: { maximum: 2048, minimum: 512, type: 'integer' },
              },
              required: ['images'],
              title: 'Input',
              type: 'object',
            },
            Output: {
              properties: {
                color_video: { format: 'uri', type: 'string' },
                combined_video: { format: 'uri', type: 'string' },
                gaussian_ply: { format: 'uri', type: 'string' },
                model_file: { format: 'uri', type: 'string' },
                no_background_images: {
                  items: { format: 'uri', type: 'string' },
                  type: 'array',
                },
                normal_video: { format: 'uri', type: 'string' },
              },
              title: 'Output',
              type: 'object',
            },
          },
        },
        openapi: '3.1.0',
      },
      schemaFamily: 'replicate-trellis-v1',
    },
  };
