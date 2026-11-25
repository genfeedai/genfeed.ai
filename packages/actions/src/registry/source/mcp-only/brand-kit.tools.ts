import {
  brandFontRolesSchema,
  brandPaletteSchema,
} from '@genfeedai/contracts/api-types/contracts/brand-kit-style.contract';
import type { SourceTool } from '../../../interfaces/source-tool.interface';

const text = { type: 'string' } as const;
const texts = { type: 'array', items: text } as const;
const schemaOptions = { io: 'input', target: 'draft-7' } as const;
const { $schema: _paletteDialect, ...colorPalette } =
  brandPaletteSchema.toJSONSchema(schemaOptions);
const { $schema: _fontDialect, ...fontRoles } =
  brandFontRolesSchema.toJSONSchema(schemaOptions);

export const MCP_BRAND_KIT_TOOLS: SourceTool[] = [
  {
    name: 'manage_brand_kit',
    description:
      'Save one Brand Kit section for an explicit brand. Use visual_identity for colors, fonts and the visual direction of images and video (owner or admin), writing_voice for tone and writing guidance, or strategy for goals, platforms, and cadence. Send only fields for that section.',
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
            visualDirection: {
              ...text,
              description:
                'The look of the brand images and video, in plain sentences (medium, light, mood, composition). Image and video generation use it; text generation never does.',
            },
            colorPalette,
            fontRoles: {
              ...fontRoles,
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
