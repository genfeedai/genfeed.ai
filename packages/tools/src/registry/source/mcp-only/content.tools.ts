import type { SourceTool } from '../../../interfaces/source-tool.interface.js';

export const MCP_CONTENT_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description:
      'Generate viral AI-powered articles with SEO optimization. Specify topic, tone, length, target audience, and keywords for maximum engagement.',
    name: 'create_article',
    parameters: {
      properties: {
        keywords: {
          description: 'SEO keywords to include',
          items: { type: 'string' },
          type: 'array',
        },
        length: {
          default: 'medium',
          description: 'Article length',
          enum: ['short', 'medium', 'long'],
          type: 'string',
        },
        targetAudience: {
          description: 'Target audience for the article',
          type: 'string',
        },
        tone: {
          default: 'professional',
          description: 'Writing tone and style',
          enum: [
            'professional',
            'casual',
            'humorous',
            'technical',
            'storytelling',
          ],
          type: 'string',
        },
        topic: {
          description: 'Article topic or main idea',
          type: 'string',
        },
      },
      required: ['topic'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Search published articles by query, category, or tags. Filter and find content quickly.',
    name: 'search_articles',
    parameters: {
      properties: {
        category: {
          description: 'Filter by category',
          type: 'string',
        },
        limit: {
          default: 10,
          description: 'Maximum results to return',
          maximum: 50,
          type: 'number',
        },
        query: {
          description: 'Search query',
          type: 'string',
        },
      },
      required: ['query'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description: 'Get a specific article by ID',
    name: 'get_article',
    parameters: {
      properties: {
        articleId: {
          description: 'The ID of the article to retrieve',
          type: 'string',
        },
      },
      required: ['articleId'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
  {
    creditCost: 0,
    description:
      'Generate LinkedIn-optimized post text for a given topic or brief. Returns ready-to-publish text content with hook, body, CTA, and hashtags.',
    name: 'generate_linkedin_content',
    parameters: {
      properties: {
        brandId: {
          description: 'Brand ID to apply tone and voice profile',
          type: 'string',
        },
        topic: {
          description:
            'Topic, brief, or sales objection to turn into LinkedIn content',
          type: 'string',
        },
        variationsCount: {
          default: 3,
          description: 'Number of content variations to generate (1-5)',
          maximum: 5,
          minimum: 1,
          type: 'number',
        },
      },
      required: ['topic'],
      type: 'object',
    },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
  },
];
