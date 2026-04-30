import type { ClientService } from '@mcp/services/client.service';
import { isSocialPlatform } from '@mcp/tools/tool-validators';

export function createContentListTool(client: ClientService) {
  return {
    description:
      'List content from the Genfeed library. Filter by type, status, or tags.',

    async handler(params: { type?: string; status?: string; limit?: number }) {
      const result = await client.listImages({
        limit: params.limit || 20,
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
        limit: {
          description: 'Max items to return (default: 20)',
          type: 'number',
        },
        status: {
          description: 'Filter by status (draft, generated, published)',
          type: 'string',
        },
        type: {
          description: 'Content type (image, video, music, avatar)',
          type: 'string',
        },
      },
      required: [],
      type: 'object' as const,
    },
    name: 'list_content',
  };
}

export function createPostListTool(client: ClientService) {
  return {
    description:
      'List published or scheduled posts across social media platforms.',

    async handler(params: {
      platform?: string;
      status?: string;
      limit?: number;
    }) {
      const result = await client.listPosts({
        limit: params.limit || 20,
        platform: params.platform
          ? params.platform === 'all'
            ? 'all'
            : isSocialPlatform(params.platform)
              ? params.platform
              : undefined
          : undefined,
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
        limit: {
          description: 'Max items to return',
          type: 'number',
        },
        platform: {
          description:
            'Filter by platform (twitter, instagram, linkedin, tiktok)',
          type: 'string',
        },
        status: {
          description: 'Post status (draft, scheduled, published)',
          type: 'string',
        },
      },
      required: [],
      type: 'object' as const,
    },
    name: 'list_posts',
  };
}
