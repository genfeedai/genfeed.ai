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
      'Save one Brand Kit section for an explicit brand, or approve its draft. Use identity for the brand name (label) and description (owner or admin), visual_identity for colors and fonts (owner or admin), writing_voice for tone and writing guidance, or strategy for goals, platforms, and cadence. Send only fields for that section. A brand whose approved Brand Kit has no name fails every branded text generation, so set the name with identity, then use approve (owner or admin): the first approve call approves nothing and returns the draft to show the person; after they agree in this conversation, repeat it with confirmed true and the revisionId and updatedAt it returned.',
    creditCost: 0,
    requiredRole: 'user',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: {
          type: 'string',
          enum: [
            'visual_identity',
            'writing_voice',
            'strategy',
            'identity',
            'approve',
          ],
        },
        brandId: {
          type: 'string',
          description: 'The ID of the brand to edit.',
        },
        confirmed: {
          type: 'boolean',
          description:
            'For approve only. Set true only after the person has explicitly agreed, in this conversation, to approve this draft. Without it nothing is approved and the call returns what to confirm.',
        },
        revisionId: {
          type: 'string',
          description:
            'For approve with confirmed true: the revisionId the first approve call returned.',
        },
        updatedAt: {
          type: 'string',
          description:
            'For approve with confirmed true: the updatedAt the first approve call returned, unchanged.',
        },
        fields: {
          type: 'object',
          description:
            'For every action except approve. For identity send label (the brand name) and optionally description.',
          additionalProperties: false,
          properties: {
            description: text,
            label: text,
            backgroundColor: text,
            fontFamily: text,
            primaryColor: text,
            secondaryColor: text,
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
      required: ['action', 'brandId'],
    },
  },
];
