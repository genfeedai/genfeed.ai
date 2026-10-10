import type { SourceTool } from '../../../interfaces/source-tool.interface';

const ARTICLE_SELECTOR_PROPERTIES = {
  articleId: {
    description: 'The article to retrieve.',
    minLength: 1,
    pattern: '\\S',
    type: 'string',
  },
  category: {
    description: 'Search only. Filter by category.',
    type: 'string',
  },
  limit: {
    default: 10,
    description: 'Search only. Maximum results to return.',
    maximum: 50,
    type: 'number',
  },
  query: {
    description: 'Search query over published articles.',
    minLength: 1,
    pattern: '\\S',
    type: 'string',
  },
} as const;

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
      'Publish an owned reviewed article on the public website. Requires approval. Use get_articles and get_article_preview before requesting publication. Changes publication status without regenerating the body or replacing an existing publication date.',
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
      'Get one article by articleId, or search published articles by query (optionally filtered by category). Pass exactly one of articleId or query.',
    name: 'get_articles',
    parameters: {
      // Strict-mode JSON Schema requires each branch to declare the property
      // it requires, and the engine requires closed branch objects. Supplying
      // both selectors matches both branches, which `oneOf` rejects.
      oneOf: [
        {
          additionalProperties: false,
          properties: ARTICLE_SELECTOR_PROPERTIES,
          required: ['articleId'],
        },
        {
          additionalProperties: false,
          properties: ARTICLE_SELECTOR_PROPERTIES,
          required: ['query'],
        },
      ],
      properties: ARTICLE_SELECTOR_PROPERTIES,
      type: 'object',
    },
    requiredRole: 'user',
  },
];
