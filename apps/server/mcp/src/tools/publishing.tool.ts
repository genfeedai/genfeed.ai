import type { ClientService } from '@mcp/services/client.service';
import type { SocialPlatform } from '@mcp/shared/interfaces/post.interface';

export interface PublishParams {
  ingredientId: string;
  platforms: string[];
  caption?: string;
  scheduledAt?: string;
}

function isSocialPlatform(value: string): value is SocialPlatform {
  return ['twitter', 'linkedin', 'instagram', 'tiktok', 'youtube'].includes(
    value,
  );
}

export function createPublishingTool(client: ClientService) {
  return {
    description:
      'Publish content to one or more social media platforms (Instagram, Twitter, LinkedIn, TikTok, YouTube).',

    async handler(params: PublishParams) {
      const platforms = params.platforms.filter(isSocialPlatform);
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
          items: { type: 'string' },
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
