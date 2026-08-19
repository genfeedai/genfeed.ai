import type { SourceTool } from '../../../interfaces/source-tool.interface.js';

export const AGENT_GENERATION_TOOLS: SourceTool[] = [
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
  {
    // Minimum charge per call (one minute of speech). Actual amount is billed
    // dynamically by the generation endpoint per audio length (issue #482).
    creditCost: 17,
    description:
      'Generate speech audio from text using text-to-speech. If you do not already have a catalog or cloned voiceId, omit voiceId and call prepare_voice_clone instead so the user can pick a voice from the catalog. Do not ask the user to open Library → Voices.',
    name: 'generate_voice',
    parameters: {
      properties: {
        text: {
          description: 'The text to convert to speech',
          type: 'string',
        },
        voiceId: {
          description:
            'Optional ElevenLabs or catalog voice ID. Omit when unknown so the run can dock the voice generate card.',
          type: 'string',
        },
      },
      required: ['text'],
      type: 'object',
    },
    requiredRole: 'user',
  },
];
