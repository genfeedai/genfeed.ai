import type { SourceTool } from '../../../interfaces/source-tool.interface';

const id = {
  type: 'string',
  minLength: 1,
  maxLength: 255,
  pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$',
};

export const MCP_MODELS3D_TOOLS: SourceTool[] = [
  {
    creditCost: 77,
    description:
      'Render a photo as a 3D model. First makes a 3x3 angle sheet of the subject, and with build=true also turns it into a GLB. Holds 50 credits for the sheet plus 27 for a standard build (77 total, or 184 with quality=high), refunded if a step fails. Returns the render id and status; poll get_model3d until it is ready. This is a side output, not a Studio generation.',
    name: 'render_3d',
    parameters: {
      additionalProperties: false,
      properties: {
        build: {
          description:
            'Also build the GLB after the angle sheet. Defaults to false (sheet only).',
          type: 'boolean',
        },
        imageUrl: {
          description: 'HTTPS URL of the source photo',
          maxLength: 2048,
          type: 'string',
        },
        prompt: {
          description: 'Optional description of the subject',
          maxLength: 500,
          minLength: 1,
          type: 'string',
        },
        quality: {
          description:
            'Build tier. standard (default) uses TRELLIS at 27 credits; high uses Rodin Gen-2 at 134 credits for the best geometry and textures.',
          enum: ['standard', 'high'],
          type: 'string',
        },
      },
      required: ['imageUrl'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Read a 3D render: status (sheet_pending, sheet_ready, building, ready, failed), the angle sheet URL and, once ready, the GLB URL. Does not charge credits.',
    name: 'get_model3d',
    parameters: {
      additionalProperties: false,
      properties: { id },
      required: ['id'],
      type: 'object',
    },
    requiredRole: 'user',
  },
];
