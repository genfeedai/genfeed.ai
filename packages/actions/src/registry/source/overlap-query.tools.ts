import type { SourceTool } from '../../interfaces/source-tool.interface';

/**
 * Read/list overlap definitions split out of `overlap.tools.ts` to keep that
 * module under the per-file line budget (`source-tools.test.ts`). Surface
 * availability is declared only in `curated-action-catalog.ts`.
 */
export const OVERLAP_QUERY_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description:
      'Get available credits balance and usage information for your account',
    name: 'get_credits_balance',
    parameters: {
      properties: {},
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Get trending topics and content ideas based on current trends across social media and news.',
    name: 'get_trends',
    parameters: {
      properties: {
        category: {
          default: 'all',
          description: 'Content category',
          enum: [
            'all',
            'tech',
            'business',
            'entertainment',
            'sports',
            'science',
            'health',
            'politics',
          ],
          type: 'string',
        },
        timeframe: {
          default: '24h',
          description: 'Timeframe for trends',
          enum: ['24h', '7d', '30d'],
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
      "List the user's brands with their names, descriptions, and tone profiles.",
    name: 'list_brands',
    parameters: {
      properties: {
        limit: {
          default: 20,
          description: 'Maximum number of brands to return',
          type: 'number',
        },
      },
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      "List the current brand's active named characters (handle, label, description, whether a reference image exists). Tenant-scoped.",
    name: 'list_characters',
    parameters: {
      properties: {
        q: {
          description: 'Optional handle or label prefix filter',
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
      'List recent posts for the user. Can filter by target execution state (draft, scheduled, published).',
    name: 'list_posts',
    parameters: {
      properties: {
        executionState: {
          description: 'Filter by canonical target execution state',
          enum: [
            'draft',
            'scheduled',
            'paused',
            'cancelled',
            'publishing',
            'published',
            'failed',
            'skipped',
          ],
          type: 'string',
        },
        limit: {
          description: 'Maximum number of posts to return (default 10)',
          type: 'number',
        },
      },
      required: [],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Get one post by id. Returns the same item shape as list_posts: channel target, execution state, media, and timestamps.',
    name: 'get_post',
    parameters: {
      properties: {
        postId: {
          description: 'Post id returned by list_posts or a scheduling tool.',
          type: 'string',
        },
      },
      required: ['postId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Reserve a pending asset for the selected brand and return uploadUrl, assetId, method, and constraints. For PUT, send file bytes with the returned headers. For POST_JSON, send localUpload fields plus source containing base64 file bytes as JSON. Then call complete_media_upload. Does not publish or attach the file.',
    name: 'request_media_upload',
    parameters: {
      properties: {
        category: {
          default: 'image',
          description: 'Media category for the pending asset.',
          enum: ['image', 'video', 'audio', 'music'],
          type: 'string',
        },
        contentType: {
          description:
            'MIME type signed into the upload URL. The PUT Content-Type must match it.',
          type: 'string',
        },
        filename: {
          description: 'Original filename, including the extension.',
          type: 'string',
        },
      },
      required: ['filename', 'contentType'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Finalize a presigned media upload. Returns assetId and, when available, the hosted URL. Pass assetId as create_scheduled_release media[].assetId or as create_post contentId / ingredientId. Pass the hosted URL as create_post mediaUrls.',
    name: 'complete_media_upload',
    parameters: {
      properties: {
        assetId: {
          description: 'assetId returned by request_media_upload.',
          type: 'string',
        },
      },
      required: ['assetId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'List all workflows in your organization with optional status filtering.',
    name: 'list_workflows',
    parameters: {
      properties: {
        limit: {
          default: 10,
          description: 'Maximum number of workflows to return',
          type: 'number',
        },
        status: {
          description: 'Filter by workflow status',
          enum: ['draft', 'active', 'paused', 'completed', 'failed'],
          type: 'string',
        },
      },
      type: 'object',
    },
    requiredRole: 'user',
  },
];
