import type { SourceTool } from '../../../interfaces/source-tool.interface';

const presetKinds = [
  'image',
  'image-edit',
  'video',
  'storyboard',
  'ad',
  'playbook',
  'cinematic-short',
];

export const MCP_PRESET_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description:
      'List the presets you can use for images, videos, storyboards, ads, playbooks and cinematic shorts. Each row has a key, a kind, a label and a one-line description. Read only; spends no credits.',
    name: 'get_presets',
    parameters: {
      additionalProperties: false,
      properties: {
        kind: {
          description: 'Only presets of this kind.',
          enum: presetKinds,
          type: 'string',
        },
        search: {
          description: 'Match against the key, label and description.',
          maxLength: 100,
          minLength: 1,
          type: 'string',
        },
      },
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Read one preset by key: its fields and, for a cinematic short, the slots to fill and a worked example. Pass slots on a cinematic short to also get the compiled prompt, timed shot plan, negative prompt and sound spec. Read only; nothing is generated. Pass the compiled prompt to generate.',
    name: 'get_preset',
    parameters: {
      additionalProperties: false,
      properties: {
        brandName: {
          description: 'Brand name to write into the compiled film prompt.',
          maxLength: 160,
          minLength: 1,
          type: 'string',
        },
        key: {
          description: 'Preset key from get_presets.',
          maxLength: 160,
          minLength: 1,
          type: 'string',
        },
        slots: {
          additionalProperties: false,
          description:
            'Cinematic short only: the values to fill in. subject, setting and titleText are required; the rest override the preset.',
          properties: {
            deliveryFormat: {
              description: 'Output format.',
              enum: ['mp4', 'html'],
              type: 'string',
            },
            extraNegatives: {
              description: 'Extra things the film must not show.',
              items: { maxLength: 200, minLength: 1, type: 'string' },
              maxItems: 20,
              type: 'array',
            },
            fps: {
              description: 'Frames per second.',
              maximum: 60,
              minimum: 12,
              type: 'integer',
            },
            paletteArc: {
              description: 'Colour palette by time, replacing the preset arc.',
              items: {
                additionalProperties: false,
                properties: {
                  fromSecond: {
                    description: 'Second this palette starts.',
                    maximum: 600,
                    minimum: 0,
                    type: 'number',
                  },
                  name: {
                    description: 'Palette name.',
                    maxLength: 100,
                    minLength: 1,
                    type: 'string',
                  },
                  palette: {
                    description: 'Palette description.',
                    maxLength: 300,
                    minLength: 1,
                    type: 'string',
                  },
                },
                required: ['fromSecond', 'name', 'palette'],
                type: 'object',
              },
              maxItems: 8,
              minItems: 1,
              type: 'array',
            },
            qaPassLimit: {
              description: 'Most QA passes to run.',
              maximum: 5,
              minimum: 1,
              type: 'integer',
            },
            runtimeSeconds: {
              description: 'Film length in seconds, up to the preset maximum.',
              exclusiveMinimum: 0,
              maximum: 600,
              type: 'number',
            },
            sealText: {
              description: 'Text on the closing seal.',
              maxLength: 20,
              minLength: 1,
              type: 'string',
            },
            setting: {
              description: 'Where the film takes place.',
              maxLength: 600,
              minLength: 1,
              type: 'string',
            },
            shots: {
              description: 'Shot list replacing the preset shots.',
              items: {
                additionalProperties: false,
                properties: {
                  action: {
                    description: 'What happens in the shot.',
                    maxLength: 1200,
                    minLength: 1,
                    type: 'string',
                  },
                  camera: {
                    description: 'Camera move.',
                    maxLength: 600,
                    minLength: 1,
                    type: 'string',
                  },
                  endSeconds: {
                    description: 'Second the shot ends.',
                    exclusiveMinimum: 0,
                    maximum: 600,
                    type: 'number',
                  },
                  key: {
                    description: 'Unique lowercase shot key.',
                    pattern: '^[a-z][a-z0-9-]{0,39}$',
                    type: 'string',
                  },
                  sound: {
                    description: 'Sound for the shot.',
                    maxLength: 600,
                    minLength: 1,
                    type: 'string',
                  },
                  startSeconds: {
                    description: 'Second the shot starts.',
                    maximum: 600,
                    minimum: 0,
                    type: 'number',
                  },
                  title: {
                    description: 'Shot title.',
                    maxLength: 100,
                    minLength: 1,
                    type: 'string',
                  },
                },
                required: [
                  'key',
                  'title',
                  'startSeconds',
                  'endSeconds',
                  'camera',
                  'action',
                  'sound',
                ],
                type: 'object',
              },
              maxItems: 24,
              minItems: 1,
              type: 'array',
            },
            soundSpec: {
              description: 'Sound design for the whole film.',
              maxLength: 1200,
              minLength: 1,
              type: 'string',
            },
            styleByFeel: {
              description:
                'Visual style described by feel. Naming a studio, artist or film is rejected.',
              maxLength: 1200,
              minLength: 1,
              type: 'string',
            },
            subject: {
              description: 'Who or what the film is about.',
              maxLength: 400,
              minLength: 1,
              type: 'string',
            },
            tagline: {
              description: 'Tagline on the title card.',
              maxLength: 200,
              minLength: 1,
              type: 'string',
            },
            titleText: {
              description: 'Title card text.',
              maxLength: 120,
              minLength: 1,
              type: 'string',
            },
          },
          required: ['subject', 'setting', 'titleText'],
          type: 'object',
        },
      },
      required: ['key'],
      type: 'object',
    },
    requiredRole: 'user',
  },
];
