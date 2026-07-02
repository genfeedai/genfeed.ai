import { Platform } from '@genfeedai/enums';
import type { ClientService } from '@mcp/services/client.service';
import { isPlatform } from '@mcp/tools/tool-validators';

export interface PublishParams {
  ingredientId: string;
  platforms: string[];
  caption?: string;
  scheduledAt?: string;
}

export function createPublishingTool(client: ClientService) {
  return {
    description:
      'Publish content to one or more connected platforms (e.g. Instagram, Twitter/X, LinkedIn, TikTok, YouTube, Facebook, Pinterest, Reddit, Threads, Discord, Telegram, Medium, WordPress).',

    async handler(params: PublishParams) {
      const platforms = params.platforms.filter(isPlatform);
      if (platforms.length === 0) {
        throw new Error('At least one valid platform is required');
      }

      const result = await client.publishContent({
        contentId: params.ingredientId,
        customMessage: params.caption,
        platforms,
        scheduleAt: params.scheduledAt,
      });
      return {
        content: [
          {
            text: JSON.stringify(result, null, 2),
            type: 'text' as const,
          },
        ],
      };
    },
    inputSchema: {
      properties: {
        caption: {
          description: 'Post caption/text',
          type: 'string',
        },
        ingredientId: {
          description: 'ID of the content to publish',
          type: 'string',
        },
        platforms: {
          description: 'Target platforms',
          items: { enum: Object.values(Platform), type: 'string' },
          type: 'array',
        },
        scheduledAt: {
          description: 'ISO date for scheduled publish (omit for immediate)',
          type: 'string',
        },
      },
      required: ['ingredientId', 'platforms'],
      type: 'object' as const,
    },
    name: 'create_post',
  };
}
