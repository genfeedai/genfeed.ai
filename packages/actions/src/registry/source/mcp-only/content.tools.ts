import type { SourceTool } from '../../../interfaces/source-tool.interface';

export const MCP_CONTENT_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description:
      'Import a complete reviewed HTML article into the connected organization as an unpublished draft. Preserves supplied content without generation. Use get_article_preview to review, then publish_article separately.',
    name: 'create_article_draft',
    requiredRole: 'user',
    parameters: {
      type: 'object',
      required: ['label', 'slug', 'summary', 'content'],
      properties: {
        label: {
          type: 'string',
          minLength: 1,
          maxLength: 200,
          description: 'Article title',
        },
        slug: {
          type: 'string',
          minLength: 1,
          maxLength: 160,
          pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
          description: 'Stable canonical URL slug',
        },
        summary: {
          type: 'string',
          minLength: 1,
          maxLength: 500,
          description: 'Search-facing article summary',
        },
        content: {
          type: 'string',
          minLength: 1,
          maxLength: 250000,
          description: 'Full reviewed article HTML; no generation prompt',
        },
        coverImageUrl: {
          type: 'string',
          description: 'Optional absolute HTTPS cover image URL',
        },
      },
    },
  },
  {
    creditCost: 0,
    description:
      'Get an expiring signed preview URL for an owned article in the connected organization. Treat the URL as a bearer credential; do not send it to analytics or logs.',
    name: 'get_article_preview',
    requiredRole: 'user',
    parameters: {
      type: 'object',
      required: ['articleId'],
      properties: {
        articleId: {
          type: 'string',
          minLength: 1,
          description: 'Owned article ID',
        },
      },
    },
  },
  {
    creditCost: 0,
    description:
      'Publish an owned reviewed article on the public website. Requires approval. Use get_article and get_article_preview before requesting publication. Changes publication status without regenerating the body or replacing an existing publication date.',
    name: 'publish_article',
    requiredRole: 'user',
    parameters: {
      type: 'object',
      required: ['articleId'],
      properties: {
        articleId: {
          type: 'string',
          minLength: 1,
          description: 'Reviewed article ID to publish',
        },
      },
    },
  },
  {
    creditCost: 0,
    description:
      'Generate an article draft from a topic, tone, audience and keywords. To import an already written article without regeneration, use create_article_draft.',
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
  },
];
