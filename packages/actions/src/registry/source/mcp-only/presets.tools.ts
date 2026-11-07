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
          additionalProperties: true,
          description:
            'Cinematic short only: subject, setting and titleText are required; tagline, sealText, runtimeSeconds, fps, styleByFeel, soundSpec, paletteArc, shots, extraNegatives, qaPassLimit and deliveryFormat are optional.',
          type: 'object',
        },
      },
      required: ['key'],
      type: 'object',
    },
    requiredRole: 'user',
  },
];
