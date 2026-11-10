import type { SchemaFixture } from '@api/seeds/reviewed-provider-rates-seed.types';

/**
 * Replicate publishes no version for `firtoz/trellis` on the public model
 * endpoint, so the seed carries the fields we send and read. Rodin Gen-2
 * (`hyper3d/rodin`, the high quality tier) is published but is carried the
 * same way so its rate seeds without a live schema read. Both bill a flat
 * price per prediction, so neither schema declares a pricing selector.
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
    'hyper3d/rodin': {
      openapi: {
        components: {
          schemas: {
            Input: {
              properties: {
                geometry_file_format: {
                  default: 'glb',
                  enum: ['glb', 'usdz', 'fbx', 'obj', 'stl'],
                  type: 'string',
                },
                images: {
                  items: { format: 'uri', type: 'string' },
                  type: 'array',
                },
                material: {
                  default: 'PBR',
                  enum: ['PBR', 'Shaded', 'All'],
                  type: 'string',
                },
                mesh_mode: {
                  default: 'Quad',
                  enum: ['Quad', 'Raw'],
                  type: 'string',
                },
                prompt: { type: 'string' },
                quality: {
                  default: 'medium',
                  enum: ['high', 'medium', 'low', 'extra-low'],
                  type: 'string',
                },
                seed: { type: 'integer' },
                tier: { default: 'Gen-2', type: 'string' },
              },
              required: ['prompt'],
              title: 'Input',
              type: 'object',
            },
            Output: { format: 'uri', title: 'Output', type: 'string' },
          },
        },
        openapi: '3.1.0',
      },
      schemaFamily: 'replicate-rodin-v1',
    },
  };
