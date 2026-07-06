import type { SourceTool } from '../../../interfaces/source-tool.interface.js';

export const AGENT_CONTENT_TOOLS: SourceTool[] = [
  {
    creditCost: 2,
    description:
      'Generate social media content (caption, post text, article outline) for a given topic or brief.',
    name: 'generate_content',
    parameters: {
      properties: {
        brandId: {
          description: 'Brand ID to use for tone and voice',
          type: 'string',
        },
        platform: {
          description: 'Target social platform',
          enum: [
            'instagram',
            'twitter',
            'linkedin',
            'tiktok',
            'youtube',
            'facebook',
          ],
          type: 'string',
        },
        topic: {
          description: 'Topic or brief for the content',
          type: 'string',
        },
        type: {
          description: 'Type of content to generate',
          enum: ['caption', 'post', 'article_outline', 'thread', 'script'],
          type: 'string',
        },
      },
      required: ['topic', 'type'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
  },
  {
    creditCost: 1,
    description:
      'Schedule an existing draft post for a specific date and time.',
    name: 'schedule_post',
    parameters: {
      properties: {
        postId: {
          description: 'ID of the post to schedule',
          type: 'string',
        },
        scheduledAt: {
          description: 'ISO 8601 datetime string for when to publish',
          type: 'string',
        },
      },
      required: ['postId', 'scheduledAt'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
  },
  {
    creditCost: 0,
    description:
      'Get the content calendar for the coming week. Returns scheduled and draft posts with gap analysis showing days without content.',
    name: 'get_content_calendar',
    parameters: {
      properties: {
        days: {
          description: 'Number of days ahead to look (default 7)',
          type: 'number',
        },
      },
      required: [],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
  },
  {
    creditCost: 5,
    description:
      'Generate a full month of content (30 days) for a brand. Creates a content plan with a mix of tweets, images, and videos, then executes it. Requires credits.',
    name: 'generate_monthly_content',
    parameters: {
      properties: {
        brandId: {
          description: 'Brand ID to generate content for',
          type: 'string',
        },
        platforms: {
          description: 'Target platforms for content',
          items: { type: 'string' },
          type: 'array',
        },
      },
      required: ['brandId', 'platforms'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
  },
  {
    creditCost: 0,
    description:
      'Spawn a specialized sub-agent to create a specific type of content. Use for video, image, article, or tweet/thread creation. The sub-agent inherits brand context and applies platform-specific expertise and tools. Sub-agent charges its own credits for content it generates.',
    name: 'spawn_content_agent',
    parameters: {
      properties: {
        agentType: {
          description:
            'Type of content specialist to spawn. x_content for tweets/threads, image_creator for images/carousels, video_creator for short-form video, ai_avatar for AI avatar videos, article_writer for long-form articles/blog posts.',
          enum: [
            'x_content',
            'image_creator',
            'video_creator',
            'ai_avatar',
            'article_writer',
          ],
          type: 'string',
        },
        credentialId: {
          description:
            'Target social account credential ID. Provides the sub-agent with account-specific context (handle, platform, audience).',
          type: 'string',
        },
        task: {
          description:
            'Detailed content brief for the sub-agent. Include topic, tone, format, and any specific requirements.',
          type: 'string',
        },
      },
      required: ['agentType', 'task'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
  },
  {
    creditCost: 0,
    description:
      'Rate content quality from 1-10 and return actionable feedback and improvement suggestions.',
    name: 'rate_content',
    parameters: {
      properties: {
        contentId: {
          description: 'ID of the content item to rate',
          type: 'string',
        },
        contentType: {
          description: 'Type of content to rate',
          enum: ['image', 'video', 'post'],
          type: 'string',
        },
        context: {
          description:
            'Optional context for scoring criteria, campaign goals, or audience',
          type: 'string',
        },
      },
      required: ['contentId'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
  },
  {
    creditCost: 0,
    description:
      'Score a piece of content (article or post) for SEO against a 7-dimension rubric. Returns a 0-100 score, per-dimension breakdown, and prioritized improvement suggestions. Persists the result on the entity.',
    name: 'score_seo',
    parameters: {
      properties: {
        contentId: {
          description: 'ID of the article or post to score',
          type: 'string',
        },
        contentType: {
          description: 'Type of content to score (defaults to article)',
          enum: ['article', 'post'],
          type: 'string',
        },
        targetKeyword: {
          description:
            'Optional primary keyword to audit placement against (title, slug, meta, headings, density)',
          type: 'string',
        },
      },
      required: ['contentId'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: true, cliAgentVisible: true, mcp: false },
  },
];
