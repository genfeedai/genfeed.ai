import type { SourceTool } from '../../../interfaces/source-tool.interface.js';

export const AGENT_SOCIAL_TOOLS: SourceTool[] = [
  {
    creditCost: 1,
    description:
      'Search recent posts on X (Twitter) by keyword query. Returns post id, author, text, metrics, and URL. Surfaces tier-limit errors instead of empty success when the connected account cannot read.',
    name: 'search_x_posts',
    parameters: {
      properties: {
        limit: {
          description: 'Maximum number of posts to return (default 10, max 25)',
          type: 'number',
        },
        query: {
          description: 'Search query for recent X posts',
          type: 'string',
        },
        sortOrder: {
          description: 'Sort by relevancy (default) or recency',
          enum: ['relevancy', 'recency'],
          type: 'string',
        },
      },
      required: ['query'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 1,
    description:
      'Fetch a single X post by status URL or numeric post id. Resolves x.com/twitter.com links deterministically.',
    name: 'fetch_x_post',
    parameters: {
      properties: {
        postIdOrUrl: {
          description:
            'X post URL (x.com/.../status/...) or bare numeric post id',
          type: 'string',
        },
      },
      required: ['postIdOrUrl'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 1,
    description:
      "List recent posts from an X account. Defaults to the brand's connected X username when username is omitted.",
    name: 'list_x_account_activity',
    parameters: {
      properties: {
        brandId: {
          description:
            'Brand whose connected X account to read when username is omitted',
          type: 'string',
        },
        excludeReplies: {
          description: 'When true, omit replies from the timeline',
          type: 'boolean',
        },
        excludeRetweets: {
          description: 'When true, omit native reposts from the timeline',
          type: 'boolean',
        },
        limit: {
          description: 'Maximum posts to return (default 20, max 50)',
          type: 'number',
        },
        username: {
          description:
            'X username without @. Optional when a brand is connected.',
          type: 'string',
        },
      },
      required: [],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 1,
    description:
      'Draft a quote post for an X source post and add it to the review queue. Does NOT publish until approved. Distinct from native repost.',
    name: 'draft_x_quote',
    parameters: {
      properties: {
        brandId: {
          description: 'Brand ID for voice and publishing account',
          type: 'string',
        },
        quoteContent: {
          description: 'Commentary text for the quote post',
          type: 'string',
        },
        targetAuthor: {
          description: 'Author username of the source post',
          type: 'string',
        },
        targetPostContent: {
          description: 'Text of the source post being quoted',
          type: 'string',
        },
        targetPostIdOrUrl: {
          description: 'Source post id or x.com status URL',
          type: 'string',
        },
      },
      required: ['targetPostIdOrUrl', 'quoteContent'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 1,
    description:
      'Draft a repost of an X post for review (no added text). Does NOT publish until approved. Distinct from quote.',
    name: 'draft_x_repost',
    parameters: {
      properties: {
        brandId: {
          description: 'Brand ID for the publishing X account',
          type: 'string',
        },
        targetAuthor: {
          description: 'Author username of the source post',
          type: 'string',
        },
        targetPostContent: {
          description: 'Text of the source post being reposted',
          type: 'string',
        },
        targetPostIdOrUrl: {
          description: 'Source post id or x.com status URL',
          type: 'string',
        },
      },
      required: ['targetPostIdOrUrl'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Initiate OAuth connect flow for a platform and return a connect action card.',
    name: 'initiate_oauth_connect',
    parameters: {
      properties: {
        platform: {
          description: 'Platform to connect',
          enum: [
            'twitter',
            'instagram',
            'youtube',
            'tiktok',
            'linkedin',
            'facebook',
            'fanvue',
          ],
          type: 'string',
        },
      },
      required: ['platform'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      "Get the user's currently selected brand profile for the active organization.",
    name: 'get_current_brand',
    parameters: {
      properties: {},
      required: [],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Prompt the user to connect a social media account via OAuth. Sends a UI action card to the frontend with a connect button for the specified platform.',
    name: 'connect_social_account',
    parameters: {
      properties: {
        platform: {
          description: 'Social platform to connect',
          enum: [
            'twitter',
            'instagram',
            'linkedin',
            'tiktok',
            'youtube',
            'facebook',
          ],
          type: 'string',
        },
      },
      required: ['platform'],
      type: 'object',
    },
    requiredRole: 'user',
  },
];
