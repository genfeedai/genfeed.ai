import type { SourceTool } from '../../interfaces/source-tool.interface';

export const OVERLAP_PUBLISHING_TOOLS: SourceTool[] = [
  {
    creditCost: 1,
    description:
      'Repurpose an existing post into a draft for another channel. Deterministic mode adapts the caption instantly through the channel capability catalog (length, hashtags, links, media compatibility); agent mode rewrites it with the content engine and lands the draft in the review queue. Never publishes or schedules anything.',
    name: 'repurpose_post',
    parameters: {
      properties: {
        credentialId: {
          description:
            'Optional connected credential ID for the target channel; resolved at scheduling time when omitted.',
          type: 'string',
        },
        mode: {
          description:
            'deterministic = instant rule-based adaptation, no LLM; agent = content-engine rewrite that enters the review queue.',
          enum: ['deterministic', 'agent'],
          type: 'string',
        },
        platform: {
          description: 'Target channel to repurpose the post for.',
          enum: ['instagram', 'twitter', 'linkedin', 'tiktok', 'youtube'],
          type: 'string',
        },
        postId: {
          description: 'ID of the existing post to repurpose.',
          type: 'string',
        },
      },
      required: ['postId', 'platform', 'mode'],
      type: 'object',
    },
    requiredRole: 'user',
  },
];
