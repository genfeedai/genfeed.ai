import type { SourceTool } from '../../../interfaces/source-tool.interface.js';

export const AGENT_PROACTIVE_TOOLS: SourceTool[] = [
  {
    creditCost: 1,
    description:
      'Search for relevant posts and tweets to engage with. Returns a list of posts matching the given keywords and platform, sorted by relevance and recency.',
    name: 'discover_engagements',
    parameters: {
      properties: {
        keywords: {
          description: 'Keywords to search for engagement opportunities',
          items: { type: 'string' },
          type: 'array',
        },
        limit: {
          description: 'Maximum number of results (default 20)',
          type: 'number',
        },
        platform: {
          description: 'Platform to search on',
          enum: ['twitter', 'instagram', 'linkedin'],
          type: 'string',
        },
      },
      required: ['keywords', 'platform'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
  },
  {
    creditCost: 1,
    description:
      'Draft a reply to a target post and add it to the review queue as an engagement item. The reply will NOT be published until approved.',
    name: 'draft_engagement_reply',
    parameters: {
      properties: {
        brandId: {
          description: 'Brand ID to use for voice and tone',
          type: 'string',
        },
        platform: {
          description: 'Platform of the target post',
          enum: ['twitter', 'instagram', 'linkedin'],
          type: 'string',
        },
        replyContent: {
          description: 'The drafted reply text',
          type: 'string',
        },
        targetAuthor: {
          description: 'Author of the target post',
          type: 'string',
        },
        targetPostContent: {
          description: 'Content of the post being replied to',
          type: 'string',
        },
        targetPostId: {
          description: 'External ID of the post to reply to',
          type: 'string',
        },
        targetPostUrl: {
          description: 'URL of the post to reply to',
          type: 'string',
        },
      },
      required: ['targetPostId', 'replyContent', 'platform'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
  },
  {
    creditCost: 0,
    description:
      'Get a summary of items pending approval in the review queue. Returns counts by type (content vs engagement), oldest pending age, and breakdown by status.',
    name: 'get_approval_summary',
    parameters: {
      properties: {},
      required: [],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
  },
  {
    creditCost: 0,
    description:
      'Internal bookkeeping tool — records what the proactive agent accomplished during this run. Call this at the end of a proactive session.',
    name: 'update_strategy_state',
    parameters: {
      properties: {
        contentGenerated: {
          description: 'Number of content items generated this run',
          type: 'number',
        },
        engagementsFound: {
          description: 'Number of engagement opportunities found',
          type: 'number',
        },
        repliesDrafted: {
          description: 'Number of engagement replies drafted',
          type: 'number',
        },
        summary: {
          description: 'Brief summary of what was accomplished',
          type: 'string',
        },
      },
      required: ['summary'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
  },
];
