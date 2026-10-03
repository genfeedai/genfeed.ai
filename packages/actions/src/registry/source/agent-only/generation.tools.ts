import type { SourceTool } from '../../../interfaces/source-tool.interface';

export const AGENT_GENERATION_TOOLS: SourceTool[] = [
  {
    name: 'edit_image',
    creditCost: 0,
    requiredRole: 'user',
    description:
      'Edit an existing Library image using an exact instruction. The original stays unchanged. imageId is the primary source; references adds up to four ordered images for Ideogram, or nine for FLUX.3. FLUX.3 supports one output, resolution and aspectRatio, with no mask or seed. Optional maskId must match the primary dimensions: black changes, white stays. Uses the image-editing category default, never the generation model. Do not enhance or rewrite the instruction.',
    parameters: {
      type: 'object',
      required: ['imageId', 'prompt'],
      additionalProperties: false,
      properties: {
        imageId: { type: 'string' },
        prompt: { type: 'string', minLength: 1, maxLength: 20000 },
        brandId: { type: 'string' },
        model: { type: 'string' },
        references: {
          type: 'array',
          maxItems: 9,
          uniqueItems: true,
          items: { type: 'string' },
        },
        resolution: {
          type: 'string',
          enum: ['768sq', '1k', '1.5k', '2k', '4k'],
          description: 'FLUX.3 only; default 1k.',
        },
        aspectRatio: {
          type: 'string',
          description:
            'FLUX.3 only; auto matches the first source aspect ratio.',
        },
        maskId: { type: 'string' },
        size: {
          type: 'string',
          enum: [
            'source',
            '1024x1024',
            '1280x896',
            '896x1280',
            '1344x768',
            '768x1344',
            '1536x640',
            '640x1536',
          ],
        },
        outputs: { type: 'integer', minimum: 1, maximum: 8 },
        seed: { type: 'integer', minimum: 0, maximum: 2147483647 },
      },
    },
  },
  {
    creditCost: 0,
    description:
      'Reframe an existing image to a new aspect ratio. Provide imageId and target aspect ratio.',
    name: 'reframe_image',
    parameters: {
      properties: {
        aspectRatio: {
          description: 'Target aspect ratio',
          enum: ['1:1', '16:9', '9:16', '4:3', '3:4'],
          type: 'string',
        },
        imageId: {
          description: 'ID of the existing image to reframe',
          type: 'string',
        },
      },
      required: ['imageId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Upscale an existing image to higher resolution. Provide the image URL or asset ID.',
    name: 'upscale_image',
    parameters: {
      properties: {
        imageUrl: {
          description: 'URL of the image to upscale',
          type: 'string',
        },
      },
      required: ['imageUrl'],
      type: 'object',
    },
    requiredRole: 'user',
  },
];
