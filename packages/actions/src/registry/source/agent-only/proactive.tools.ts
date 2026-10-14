import { AgentRunFrequency, AgentType } from '@genfeedai/contracts';
import type { SourceTool } from '../../../interfaces/source-tool.interface';

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
  },
  {
    creditCost: 1,
    description:
      'Draft a reply to a post for review. Nothing posts until it is approved.',
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
  },
  {
    creditCost: 0,
    description:
      'Summarize what is waiting for review: counts by type, oldest pending item, and status breakdown.',
    name: 'get_approval_summary',
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
  },
  {
    creditCost: 0,
    description:
      'Create or update a content agent for a brand. Ask for the role, topics, platforms, and posts per week when they are missing. New agents stay supervised. Set autoPublish only after the user explicitly allows the agent to publish on its own. Pass strategyId to update an existing agent and leave out fields that should stay unchanged.',
    name: 'save_content_agent',
    parameters: {
      properties: {
        agentType: {
          description: 'Content role. Defaults to general on create.',
          enum: Object.values(AgentType),
          type: 'string',
        },
        autoPublish: {
          description:
            'True only when the user explicitly allows this agent to publish on its own. False keeps it supervised. Omit on update to leave the current permission unchanged.',
          type: 'boolean',
        },
        brandId: {
          description: 'Brand that owns the agent. Required when creating.',
          type: 'string',
        },
        label: {
          description: 'Name of the content agent. Required when creating.',
          type: 'string',
        },
        platforms: {
          description:
            'Platforms to publish on, such as twitter, linkedin, instagram, or youtube.',
          items: { type: 'string' },
          type: 'array',
        },
        postsPerWeek: {
          description: 'Weekly posting target from 1 to 100. Defaults to 7.',
          type: 'number',
        },
        runFrequency: {
          description: 'How often the agent runs. Defaults to daily.',
          enum: Object.values(AgentRunFrequency),
          type: 'string',
        },
        strategyId: {
          description: 'Existing content agent id. Omit to create a new agent.',
          type: 'string',
        },
        topics: {
          description: 'Subjects the agent should publish about.',
          items: { type: 'string' },
          type: 'array',
        },
        voice: {
          description: 'Optional voice note for this agent.',
          type: 'string',
        },
      },
      required: [],
      type: 'object',
    },
    requiredRole: 'user',
  },
];
