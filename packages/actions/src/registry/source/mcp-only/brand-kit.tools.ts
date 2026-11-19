import type { SourceTool } from '../../../interfaces/source-tool.interface';

const text = { type: 'string' } as const;
const texts = { type: 'array', items: text } as const;

export const MCP_BRAND_KIT_TOOLS: SourceTool[] = [
  {
    name: 'manage_brand_kit',
    description:
      'Save one Brand Kit section for an explicit brand. Use visual_identity for colors and fonts (owner or admin), writing_voice for tone and writing guidance, or strategy for goals, platforms, and cadence. Send only fields for that section.',
    creditCost: 0,
    requiredRole: 'user',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: {
          type: 'string',
          enum: ['visual_identity', 'writing_voice', 'strategy'],
        },
        brandId: {
          type: 'string',
          description: 'The ID of the brand to edit.',
        },
        fields: {
          type: 'object',
          additionalProperties: false,
          properties: {
            backgroundColor: text,
            fontFamily: text,
            primaryColor: text,
            secondaryColor: text,
            colorPalette: {
              type: 'array',
              items: {
                type: 'object',
                properties: { name: text, hex: text, usage: text },
                required: ['name', 'hex'],
              },
            },
            fontRoles: {
              type: 'object',
              description:
                'Heading, body and caption assignments using the Brand Kit font role format.',
            },
            approvedHooks: texts,
            audience: texts,
            bannedPhrases: texts,
            canonicalSource: {
              type: 'string',
              enum: ['brand', 'founder', 'hybrid'],
            },
            doNotSoundLike: texts,
            exemplarTexts: texts,
            hashtags: texts,
            messagingPillars: texts,
            sampleOutput: text,
            style: text,
            taglines: texts,
            tone: text,
            values: texts,
            writingRules: texts,
            competitors: texts,
            contentTypes: texts,
            frequency: text,
            goals: texts,
            offers: texts,
            platforms: texts,
            topics: texts,
          },
        },
      },
      required: ['action', 'brandId', 'fields'],
    },
  },
];
