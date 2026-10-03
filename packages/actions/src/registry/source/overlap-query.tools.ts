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
      'Get account details in one call: profile (user, organization, scoped brand, role), credits (current balance) and usage (balance, 7 and 30 day credit spend, trend and spend breakdown by source). Defaults to all three; pass include to fetch fewer.',
    name: 'get_account',
    parameters: {
      properties: {
        include: {
          description:
            'Sections to return. Defaults to profile, credits and usage.',
          items: { enum: ['profile', 'credits', 'usage'], type: 'string' },
          type: 'array',
        },
      },
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
      "Read the organization's brands. Without brand it lists every brand with name, description and tone profile. With brand it returns that one brand, matched by id, slug, name or label. When more than one brand exists, pass the chosen brand's id as brandId to other tools; the first brand is never used implicitly.",
    name: 'get_brands',
    parameters: {
      properties: {
        brand: {
          description:
            'Return only this brand: its id, slug, name or label. Omit to list all brands in the organization.',
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
      'Read posts. postId returns one post (exclusive with the other fields). days returns the content calendar for the coming days: scheduled and draft posts with gap analysis showing days without content. With neither, lists recent posts, optionally filtered by executionState and capped by limit. Post items carry channel target, execution state, media, and timestamps.',
    name: 'get_posts',
    parameters: {
      properties: {
        days: {
          description:
            'Content calendar mode: number of days ahead to look (for example 7).',
          type: 'number',
        },
        executionState: {
          description:
            'List mode only. Filter by canonical target execution state.',
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
          description:
            'List mode only. Maximum number of posts to return (default 10).',
          type: 'number',
        },
        postId: {
          description:
            'Return this one post. Use an id from get_posts or a scheduling tool. Cannot be combined with the other fields.',
          type: 'string',
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
      'List library assets of one type, newest first, for one brand: brandId, else the thread brand, else your current brand; with none of those it lists the whole organization. Failed, archived and rejected assets are left out. Types image, video, music and avatar return id, category, status, url, label or prompt, origin and createdAt. Type character lists the active named characters the brand can use (handle, label, description, whether a reference image exists).',
    name: 'list_assets',
    parameters: {
      properties: {
        brandId: {
          description:
            'Brand to list. Defaults to the thread brand, then your current brand.',
          type: 'string',
        },
        limit: {
          default: 10,
          description:
            'Maximum number of assets to return (default 10, max 50). Not used with type character.',
          type: 'number',
        },
        offset: {
          default: 0,
          description: 'Offset for pagination. Not used with type character.',
          type: 'number',
        },
        origin: {
          description:
            'Only assets with this permanent origin: UPLOADED (a member added the file), GENERATED (Genfeed produced it), IMPORTED (saved from an external post or page) or UNKNOWN (legacy). Not used with type character.',
          enum: ['UPLOADED', 'GENERATED', 'IMPORTED', 'UNKNOWN'],
          type: 'string',
        },
        q: {
          description:
            'Type character only. Optional handle or label prefix filter.',
          type: 'string',
        },
        type: {
          description: 'Which kind of asset to list.',
          enum: ['image', 'video', 'music', 'avatar', 'character'],
          type: 'string',
        },
      },
      required: ['type'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Reserve a pending asset for the selected brand and return uploadUrl, assetId, method, and constraints. For PUT, send file bytes with the returned headers. For POST_JSON, send localUpload as JSON, adding base64 file bytes in localUpload.source.data. Then call complete_media_upload. Does not publish or attach the file.',
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
