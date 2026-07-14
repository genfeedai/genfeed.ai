import type { SourceTool } from '../../../interfaces/source-tool.interface.js';

export const AGENT_OTHER_TOOLS: SourceTool[] = [
  {
    creditCost: 1,
    description:
      'Perform an AI text action: enhance, rewrite, shorten, expand, generate hashtags, or translate text.',
    name: 'ai_action',
    parameters: {
      properties: {
        action: {
          description: 'The AI action to perform',
          enum: [
            'enhance',
            'rewrite',
            'shorten',
            'expand',
            'hashtags',
            'translate',
          ],
          type: 'string',
        },
        language: {
          description: 'Target language for translate action',
          type: 'string',
        },
        text: {
          description: 'The input text to process',
          type: 'string',
        },
      },
      required: ['action', 'text'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Get connection status for a social platform (connected/disconnected) for the current organization.',
    name: 'get_connection_status',
    parameters: {
      properties: {
        platform: {
          description: 'Platform name to check',
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
      'Return deep links for handing off image/video editing to Studio UX.',
    name: 'open_studio_handoff',
    parameters: {
      properties: {
        ingredientId: {
          description: 'Optional ingredient/image ID to open directly',
          type: 'string',
        },
        type: {
          description: 'Studio generator type to open',
          enum: ['image', 'video', 'avatar', 'music'],
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
      'Resolve a social media handle (@username) to the connected credential and platform. Returns credential ID, platform, and brand ID.',
    name: 'resolve_handle',
    parameters: {
      properties: {
        handle: {
          description:
            'Social media handle to resolve (e.g., "@shaylamonroe" or "shaylamonroe")',
          type: 'string',
        },
      },
      required: ['handle'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'List content items in the review queue. Can filter by batch ID and status.',
    name: 'list_review_queue',
    parameters: {
      properties: {
        batchId: {
          description: 'Filter by specific batch ID',
          type: 'string',
        },
        limit: {
          description: 'Maximum number of items to return (default 20)',
          type: 'number',
        },
        status: {
          description: 'Filter by item status',
          enum: ['pending', 'completed', 'failed'],
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
      'Reject items in a batch. Approval is intentionally unavailable to model tools and requires the authenticated version-bound review control.',
    name: 'batch_approve_reject',
    parameters: {
      properties: {
        action: {
          description: 'Action to perform on selected items',
          enum: ['reject'],
          type: 'string',
        },
        batchId: {
          description: 'Batch ID containing the items',
          type: 'string',
        },
        itemIds: {
          description: 'Array of item IDs to act on',
          items: { type: 'string' },
          type: 'array',
        },
      },
      required: ['batchId', 'action', 'itemIds'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Present credit pack payment options to the user as a UI action card. Shows pricing tiers with a checkout button.',
    name: 'present_payment_options',
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
      'Save content, examples, preferences, or winners into agent memory and optionally route them to brand knowledge.',
    name: 'capture_memory',
    parameters: {
      properties: {
        brandId: {
          description: 'Optional brand ID for brand-scoped saves',
          type: 'string',
        },
        confidence: {
          description:
            'How confident the system should be in reusing this memory (0-1)',
          type: 'number',
        },
        content: {
          description: 'The content or instruction to save',
          type: 'string',
        },
        contentType: {
          description: 'What kind of content this memory applies to',
          enum: ['newsletter', 'tweet', 'thread', 'article', 'post', 'generic'],
          type: 'string',
        },
        importance: {
          description: 'Importance weight for retrieval (0-1)',
          type: 'number',
        },
        kind: {
          description: 'How this memory should be interpreted',
          enum: [
            'preference',
            'positive_example',
            'negative_example',
            'winner',
            'reference',
            'instruction',
            'pattern',
          ],
          type: 'string',
        },
        performanceSnapshot: {
          description:
            'Optional performance data associated with the saved content',
          type: 'object',
        },
        platform: {
          description:
            'Optional platform label such as twitter, beehiiv, or linkedin',
          type: 'string',
        },
        saveToContextMemory: {
          description:
            'Whether to also save this content to the brand context memory layer',
          type: 'boolean',
        },
        scope: {
          description: 'Whether the save is personal or brand-scoped',
          enum: ['user', 'brand'],
          type: 'string',
        },
        sourceContentId: {
          description: 'Optional ID of the related content item',
          type: 'string',
        },
        sourceMessageId: {
          description: 'Optional thread message ID this came from',
          type: 'string',
        },
        sourceType: {
          description: 'Where this memory came from',
          type: 'string',
        },
        sourceUrl: {
          description: 'Optional URL for the source material',
          type: 'string',
        },
        summary: {
          description: 'Short reusable summary of the saved content',
          type: 'string',
        },
        tags: {
          description: 'Optional retrieval tags',
          items: { type: 'string' },
          type: 'array',
        },
      },
      required: ['content'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Create a YouTube or Twitch livestream chat bot for the current organization and brand, then return a bot card with links and basic control actions.',
    name: 'create_livestream_bot',
    parameters: {
      properties: {
        botChannelLabel: {
          description:
            'Optional human-readable label for the YouTube or Twitch channel.',
          type: 'string',
        },
        botChannelUrl: {
          description:
            'Optional URL for the YouTube or Twitch channel or profile.',
          type: 'string',
        },
        brandId: {
          description:
            'Optional explicit brand ID to attach to the bot; otherwise uses the current selected brand when available.',
          type: 'string',
        },
        channelId: {
          description:
            'Required platform target identifier for the livestream channel or account.',
          type: 'string',
        },
        contextTemplate: {
          description:
            'Optional context-aware question template for automatic chat prompts.',
          type: 'string',
        },
        credentialId: {
          description:
            'Optional credential ID used to post to the livestream target.',
          type: 'string',
        },
        description: {
          description: 'Optional bot description.',
          type: 'string',
        },
        hostPromptTemplate: {
          description:
            'Optional host prompt template for scheduled automatic posts.',
          type: 'string',
        },
        label: {
          description: 'Bot label shown in the bots area.',
          type: 'string',
        },
        linkLabel: {
          description: 'Optional label for the primary chat link drop.',
          type: 'string',
        },
        linkUrl: {
          description: 'Optional URL used for scheduled link drops.',
          type: 'string',
        },
        liveChatId: {
          description: 'Optional YouTube Live chat identifier when available.',
          type: 'string',
        },
        maxAutoPostsPerHour: {
          description:
            'Optional maximum number of automatic posts per hour per platform.',
          type: 'number',
        },
        minimumMessageGapSeconds: {
          description:
            'Optional minimum number of seconds between automatic posts.',
          type: 'number',
        },
        platform: {
          description: 'Livestream platform for the bot.',
          enum: ['youtube', 'twitch'],
          type: 'string',
        },
        scheduledCadenceMinutes: {
          description:
            'Optional number of minutes between scheduled automatic posts.',
          type: 'number',
        },
        senderId: {
          description: 'Optional Twitch sender ID used for message delivery.',
          type: 'string',
        },
        transcriptEnabled: {
          description: 'Optional flag controlling transcript-assisted context.',
          type: 'boolean',
        },
      },
      required: ['channelId', 'label', 'platform'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Manage an existing YouTube or Twitch livestream chat bot session by starting, pausing, resuming, stopping, setting a manual override, or sending a message immediately.',
    name: 'manage_livestream_bot',
    parameters: {
      properties: {
        action: {
          description: 'The livestream bot action to perform.',
          enum: [
            'start_session',
            'pause_session',
            'resume_session',
            'stop_session',
            'set_override',
            'send_now',
          ],
          type: 'string',
        },
        activeLinkId: {
          description: 'Optional active link ID for a manual override.',
          type: 'string',
        },
        botId: {
          description: 'Existing bot ID to manage.',
          type: 'string',
        },
        message: {
          description:
            'Optional explicit message for send_now. If omitted, the bot will generate one.',
          type: 'string',
        },
        platform: {
          description: 'Platform to target for send_now actions.',
          enum: ['youtube', 'twitch'],
          type: 'string',
        },
        promotionAngle: {
          description: 'Optional promotion angle for manual override context.',
          type: 'string',
        },
        topic: {
          description: 'Optional topic for manual override context.',
          type: 'string',
        },
        type: {
          description:
            'Optional message type for send_now when the message should be generated automatically.',
          enum: [
            'scheduled_link_drop',
            'scheduled_host_prompt',
            'context_aware_question',
          ],
          type: 'string',
        },
      },
      required: ['action', 'botId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Create a measurable agent goal for the current organization or brand using one analytics metric.',
    name: 'create_goal',
    parameters: {
      properties: {
        brandId: { type: 'string' },
        description: { type: 'string' },
        endDate: { type: 'string' },
        isActive: { type: 'boolean' },
        label: { type: 'string' },
        metric: {
          enum: ['engagement_rate', 'posts', 'views'],
          type: 'string',
        },
        startDate: { type: 'string' },
        targetValue: { type: 'number' },
      },
      required: ['label', 'metric', 'targetValue'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Check progress for an existing agent goal using current analytics data.',
    name: 'check_goal_progress',
    parameters: {
      properties: {
        goalId: { type: 'string' },
      },
      required: ['goalId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Update an existing agent goal to change its target, dates, description, or active state.',
    name: 'update_goal',
    parameters: {
      properties: {
        description: { type: 'string' },
        endDate: { type: 'string' },
        goalId: { type: 'string' },
        isActive: { type: 'boolean' },
        label: { type: 'string' },
        metric: {
          enum: ['engagement_rate', 'posts', 'views'],
          type: 'string',
        },
        startDate: { type: 'string' },
        targetValue: { type: 'number' },
      },
      required: ['goalId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
];
