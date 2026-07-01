import type { SourceTool } from '../../../interfaces/source-tool.interface.js';

export const MCP_SOCIAL_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description:
      'Get current account info including user, organization, scopes, and active brand',
    name: 'get_account_info',
    parameters: {
      properties: {},
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description: 'Get details of the currently active brand',
    name: 'get_brand',
    parameters: {
      properties: {},
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description: 'List connected Meta (Facebook) ad accounts',
    name: 'list_meta_ad_accounts',
    parameters: {
      properties: {},
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'List social inbox conversations across connected YouTube and Instagram accounts, with filters for review state, assignee, tags, and platform.',
    name: 'list_social_conversations',
    parameters: {
      properties: {
        assignedOwnerId: {
          description: 'Filter to conversations assigned to this user id',
          type: 'string',
        },
        automationState: {
          description: 'Filter by automation lifecycle state',
          enum: [
            'manual',
            'drafted',
            'pending_approval',
            'approved',
            'automated',
            'failed',
          ],
          type: 'string',
        },
        conversationType: {
          description: 'Filter by conversation type',
          enum: ['comment', 'dm', 'mention', 'reply'],
          type: 'string',
        },
        credentialId: {
          description: 'Filter to one connected social credential',
          type: 'string',
        },
        limit: {
          default: 25,
          description: 'Maximum number of conversations to return',
          maximum: 100,
          minimum: 1,
          type: 'number',
        },
        needsReview: {
          description:
            'Return only conversations that do or do not need review',
          type: 'boolean',
        },
        page: {
          default: 1,
          description: 'Page number',
          minimum: 1,
          type: 'number',
        },
        platform: {
          description: 'Filter by social platform',
          enum: ['youtube', 'instagram', 'twitter', 'linkedin', 'unipile'],
          type: 'string',
        },
        search: {
          description: 'Search participant, source title, or latest message',
          type: 'string',
        },
        status: {
          description: 'Filter by inbox status',
          enum: ['open', 'needs_review', 'resolved', 'archived'],
          type: 'string',
        },
        tag: {
          description: 'Filter to conversations with this tag',
          type: 'string',
        },
        unread: {
          description: 'Return only unread conversations',
          type: 'boolean',
        },
      },
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Get one social inbox conversation and, by default, its recent messages.',
    name: 'get_social_conversation',
    parameters: {
      properties: {
        conversationId: {
          description: 'Social conversation id',
          type: 'string',
        },
        includeMessages: {
          default: true,
          description: 'Include recent message history',
          type: 'boolean',
        },
        limit: {
          default: 50,
          description: 'Maximum messages to include',
          maximum: 100,
          minimum: 1,
          type: 'number',
        },
      },
      required: ['conversationId'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Create a draft reply or DM in the social inbox for later approval. This does not send externally.',
    name: 'create_social_reply_draft',
    parameters: {
      properties: {
        agentRunId: {
          description: 'Optional agent run id for provenance',
          type: 'string',
        },
        conversationId: {
          description: 'Social conversation id',
          type: 'string',
        },
        idempotencyKey: {
          description: 'Optional idempotency key',
          type: 'string',
        },
        messageType: {
          default: 'reply',
          description: 'Create a public reply draft or DM draft',
          enum: ['reply', 'dm'],
          type: 'string',
        },
        recipientId: {
          description:
            'Recipient id for DM drafts when it differs from the conversation participant',
          type: 'string',
        },
        text: {
          description: 'Draft message text',
          maxLength: 5000,
          minLength: 1,
          type: 'string',
        },
        workflowRunId: {
          description: 'Optional workflow run id for provenance',
          type: 'string',
        },
      },
      required: ['conversationId', 'text'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Approve a social inbox draft and publish it externally as a reply or DM. Requires approval before execution.',
    name: 'approve_social_draft',
    parameters: {
      properties: {
        conversationId: {
          description: 'Social conversation id',
          type: 'string',
        },
        messageId: {
          description: 'Draft message id',
          type: 'string',
        },
      },
      required: ['conversationId', 'messageId'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Reject a social inbox draft without publishing it externally.',
    name: 'reject_social_draft',
    parameters: {
      properties: {
        conversationId: {
          description: 'Social conversation id',
          type: 'string',
        },
        messageId: {
          description: 'Draft message id',
          type: 'string',
        },
        reason: {
          description: 'Optional rejection reason',
          maxLength: 1000,
          type: 'string',
        },
      },
      required: ['conversationId', 'messageId'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Publish a reply in a social inbox conversation. Requires approval before execution.',
    name: 'post_social_reply',
    parameters: {
      properties: {
        agentRunId: {
          description: 'Optional agent run id for provenance',
          type: 'string',
        },
        conversationId: {
          description: 'Social conversation id',
          type: 'string',
        },
        idempotencyKey: {
          description: 'Optional idempotency key',
          type: 'string',
        },
        text: {
          description: 'Reply text',
          maxLength: 5000,
          minLength: 1,
          type: 'string',
        },
        workflowRunId: {
          description: 'Optional workflow run id for provenance',
          type: 'string',
        },
      },
      required: ['conversationId', 'text'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Send a direct message from a social inbox conversation. Requires approval before execution.',
    name: 'send_social_dm',
    parameters: {
      properties: {
        agentRunId: {
          description: 'Optional agent run id for provenance',
          type: 'string',
        },
        conversationId: {
          description: 'Social conversation id',
          type: 'string',
        },
        idempotencyKey: {
          description: 'Optional idempotency key',
          type: 'string',
        },
        recipientId: {
          description: 'Optional recipient id override',
          type: 'string',
        },
        text: {
          description: 'DM text',
          maxLength: 5000,
          minLength: 1,
          type: 'string',
        },
        workflowRunId: {
          description: 'Optional workflow run id for provenance',
          type: 'string',
        },
      },
      required: ['conversationId', 'text'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description: 'Replace tags on a social inbox conversation.',
    name: 'tag_social_conversation',
    parameters: {
      properties: {
        conversationId: {
          description: 'Social conversation id',
          type: 'string',
        },
        tags: {
          description: 'Tags to set on the conversation',
          items: { type: 'string' },
          maxItems: 20,
          type: 'array',
        },
      },
      required: ['conversationId', 'tags'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description: 'Assign or unassign a social inbox conversation.',
    name: 'assign_social_conversation',
    parameters: {
      properties: {
        assignedOwnerId: {
          description:
            'User id to assign, or omit/null to unassign the conversation',
          type: ['string', 'null'],
        },
        conversationId: {
          description: 'Social conversation id',
          type: 'string',
        },
      },
      required: ['conversationId'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description: 'Mark a social inbox conversation as resolved.',
    name: 'mark_social_conversation_resolved',
    parameters: {
      properties: {
        conversationId: {
          description: 'Social conversation id',
          type: 'string',
        },
      },
      required: ['conversationId'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
];
