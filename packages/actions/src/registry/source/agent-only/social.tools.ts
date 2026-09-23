import type { SourceTool } from '../../../interfaces/source-tool.interface';

export const AGENT_SOCIAL_TOOLS: SourceTool[] = [
  {
    creditCost: 1,
    description:
      'Search recent posts on X by topic. Returns posts with author, text, stats, and link. Explains clearly if the connected account cannot search.',
    name: 'search_x_posts',
    parameters: {
      properties: {
        brandId: {
          description:
            'Brand whose connected X account searches. Required when the session has no brand. Use an id from list_brands.',
          type: 'string',
        },
        limit: {
          description: 'How many posts to return (default 10, max 25)',
          type: 'number',
        },
        query: {
          description: 'What to search for on X',
          type: 'string',
        },
        sortOrder: {
          description: 'Sort by best match or newest first',
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
      'Open one X post from a link or post id and return its text and stats.',
    name: 'fetch_x_post',
    parameters: {
      properties: {
        postIdOrUrl: {
          description: 'Post link or post id',
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
      "List recent posts from an X account. Uses the brand's connected account when no username is given.",
    name: 'list_x_account_activity',
    parameters: {
      properties: {
        brandId: {
          description: 'Brand to use when no username is given',
          type: 'string',
        },
        credentialId: {
          description:
            "Which of the brand's connected X accounts to read as (optional; defaults to the brand's first connected account)",
          type: 'string',
        },
        excludeReplies: {
          description: 'Hide replies',
          type: 'boolean',
        },
        excludeRetweets: {
          description: 'Hide reposts',
          type: 'boolean',
        },
        limit: {
          description: 'How many posts to return (default 20, max 50)',
          type: 'number',
        },
        username: {
          description:
            'X username without @ (optional if a brand is connected)',
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
      'Draft a quote of an X post for review. Does not publish until approved. Different from a repost.',
    name: 'draft_x_quote',
    parameters: {
      properties: {
        brandId: {
          description: 'Brand to quote from',
          type: 'string',
        },
        quoteContent: {
          description: 'Your text for the quote',
          type: 'string',
        },
        targetAuthor: {
          description: 'Author of the original post',
          type: 'string',
        },
        targetPostContent: {
          description: 'Text of the original post',
          type: 'string',
        },
        targetPostIdOrUrl: {
          description: 'Original post link or id',
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
      'Draft a repost of an X post for review. Does not publish until approved. Different from a quote.',
    name: 'draft_x_repost',
    parameters: {
      properties: {
        brandId: {
          description: 'Brand to repost from',
          type: 'string',
        },
        targetAuthor: {
          description: 'Author of the original post',
          type: 'string',
        },
        targetPostContent: {
          description: 'Text of the original post',
          type: 'string',
        },
        targetPostIdOrUrl: {
          description: 'Original post link or id',
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
      'Start connecting a social account and return a durable connection request plus a connect button.',
    name: 'initiate_oauth_connect',
    parameters: {
      properties: {
        brandId: {
          description:
            'Brand to attach the account to. Required when the organization has more than one brand.',
          type: 'string',
        },
        connectionId: {
          description: 'Existing connection request to replay.',
          type: 'string',
        },
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
    description: 'Get the brand currently selected for this workspace.',
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
      'Start a resumable social-account connection. Returns a connectionId and browser authorization URL. Poll get_connection_status until authorized.',
    name: 'connect_social_account',
    parameters: {
      properties: {
        brandId: {
          description:
            'Brand to attach the account to. Required when the organization has more than one brand.',
          type: 'string',
        },
        connectionId: {
          description:
            'Existing connection request to replay without creating another credential.',
          type: 'string',
        },
        platform: {
          description: 'Platform to connect',
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
