import type { SourceTool } from '../../../interfaces/source-tool.interface';

const ARTICLE_BRAND_ID_PROPERTY = {
  description:
    'Brand the article lives in. Defaults to your active brand; pass it when the article belongs to another brand of the organization.',
  type: 'string',
} as const;

const CONFIRMED_PROPERTY = {
  description:
    'Set true only after the person has explicitly agreed, in this conversation, to publish this article. Without it nothing is published.',
  type: 'boolean',
} as const;

const ARTICLE_IMAGE_URL_NOTE =
  'Use the hosted https url of a Library asset or of a finished media upload.';

const ARTICLE_SELECTOR_PROPERTIES = {
  articleId: { type: 'string' },
  brandId: { type: 'string' },
  query: { type: 'string' },
  category: { type: 'string' },
  limit: { type: 'number' },
} as const;

export const MCP_CONTENT_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description:
      'Import a complete reviewed HTML article into the connected organization as an unpublished draft. Preserves supplied content without generation. Review the draft before publishing it separately.',
    mcpDescription:
      'Import reviewed HTML unchanged as an unpublished organization article draft. Review before separate publication; no generation.',
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
          description: `Optional absolute HTTPS cover image URL. ${ARTICLE_IMAGE_URL_NOTE}`,
        },
        brandId: {
          description:
            'Brand that owns the article. Defaults to your active brand.',
          type: 'string',
        },
      },
    },
  },
  {
    creditCost: 0,
    description:
      'Change an existing article in the connected organization: title, slug, summary, HTML content and cover image. Never changes publication status; publish separately. Inline images are <img src> tags in the content HTML that use a hosted Library or upload URL.',
    mcpDescription:
      'Update an existing article: label, slug, summary, HTML content and coverImageUrl. Pass only the fields to change. Never publishes. Inline images are <img> tags in content. Pass brandId when the article is not in your active brand.',
    name: 'update_article_draft',
    requiredRole: 'user',
    parameters: {
      type: 'object',
      required: ['articleId'],
      properties: {
        articleId: {
          type: 'string',
          minLength: 1,
          description: 'Article to update',
        },
        brandId: ARTICLE_BRAND_ID_PROPERTY,
        label: {
          type: 'string',
          minLength: 1,
          maxLength: 200,
          description: 'New article title',
        },
        slug: {
          type: 'string',
          minLength: 1,
          maxLength: 160,
          pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
          description: 'New canonical URL slug',
        },
        summary: {
          type: 'string',
          minLength: 1,
          maxLength: 500,
          description: 'New search-facing summary',
        },
        content: {
          type: 'string',
          minLength: 1,
          maxLength: 250000,
          description: `Full replacement article HTML. Put inline images as <img src="https://..."> tags. ${ARTICLE_IMAGE_URL_NOTE}`,
        },
        coverImageUrl: {
          type: 'string',
          description: `New absolute HTTPS cover image URL. ${ARTICLE_IMAGE_URL_NOTE}`,
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
        brandId: ARTICLE_BRAND_ID_PROPERTY,
      },
    },
  },
  {
    creditCost: 0,
    description:
      'Publish an owned reviewed article on the public website. Confirm with the person first: the first call publishes nothing, and after they agree in this conversation you repeat it with confirmed true. Review the article before requesting publication. Changes publication status without regenerating the body or replacing an existing publication date.',
    mcpDescription:
      'Publish an owned reviewed article publicly. First call publishes nothing; after the person agrees in this conversation, repeat with confirmed true. Review before requesting publication. Changes status only; preserves body and existing publication date.',
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
        brandId: ARTICLE_BRAND_ID_PROPERTY,
        confirmed: CONFIRMED_PROPERTY,
      },
    },
  },
  {
    creditCost: 0,
    description:
      'Get one article by articleId, or search published articles by query (optionally filtered by category). Pass exactly one of articleId or query.',
    mcpDescription:
      'Read by articleId or search published articles by query, optionally category-filtered. Pass exactly one of articleId or query.',
    name: 'get_articles',
    parameters: {
      oneOf: [
        {
          additionalProperties: false,
          properties: ARTICLE_SELECTOR_PROPERTIES,
          required: ['articleId'],
          type: 'object',
        },
        {
          additionalProperties: false,
          properties: ARTICLE_SELECTOR_PROPERTIES,
          required: ['query'],
          type: 'object',
        },
      ],
      properties: {
        articleId: {
          description: 'The article to retrieve.',
          minLength: 1,
          pattern: '\\S',
          type: 'string',
        },
        brandId: {
          description:
            'Only with articleId: the brand the article lives in (defaults to your active brand). Not allowed with query: a search covers the whole organization.',
          type: 'string',
        },
        query: {
          description: 'Search query over published articles.',
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
      },
      type: 'object',
    },
    requiredRole: 'user',
  },
];
