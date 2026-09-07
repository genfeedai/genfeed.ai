import type { SourceTool } from '../../interfaces/source-tool.interface';

const PURPOSE_ENUM = ['BRAND_TRUTH', 'INSPIRATION', 'RESEARCH'] as const;
const PROCESSING_STATE_ENUM = [
  'QUEUED',
  'PROCESSING',
  'READY',
  'FAILED',
] as const;

/**
 * Brand Knowledge actions shared by the in-app Agent and the MCP server.
 * Every executor resolves the tenant and brand from the authenticated
 * request; ids in parameters never widen scope. Surface intent lives in
 * `curated-action-catalog.ts`.
 */
export const OVERLAP_KNOWLEDGE_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description:
      'Search the brand Knowledge library (saved pages, documents and notes) and return cited passages with their source, purpose and relevance. Use it before writing anything that must be accurate about the brand.',
    name: 'search_knowledge',
    parameters: {
      properties: {
        limit: {
          description: 'Maximum passages to return (1-12)',
          maximum: 12,
          minimum: 1,
          type: 'integer',
        },
        purposes: {
          description:
            'Restrict to sources with these purposes; omit for all purposes',
          items: { enum: [...PURPOSE_ENUM], type: 'string' },
          type: 'array',
        },
        query: {
          description: 'What you need to know, phrased as a question or topic',
          type: 'string',
        },
        sourceIds: {
          description: 'Restrict to these Knowledge source ids',
          items: { type: 'string' },
          maxItems: 50,
          type: 'array',
        },
      },
      required: ['query'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'List the brand Knowledge sources with their purpose, processing state and failure reason.',
    name: 'list_knowledge_sources',
    parameters: {
      properties: {
        limit: {
          description: 'Page size (1-100)',
          maximum: 100,
          minimum: 1,
          type: 'integer',
        },
        page: {
          description: 'Page number starting at 1',
          minimum: 1,
          type: 'integer',
        },
        processingState: {
          description: 'Only sources whose current version is in this state',
          enum: [...PROCESSING_STATE_ENUM],
          type: 'string',
        },
        purpose: {
          description: 'Only sources with this purpose',
          enum: [...PURPOSE_ENUM],
          type: 'string',
        },
      },
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Read one Knowledge source: metadata, current version state, provenance, a bounded text preview and the spaces it belongs to.',
    name: 'read_knowledge_source',
    parameters: {
      properties: {
        sourceId: { description: 'Knowledge source id', type: 'string' },
      },
      required: ['sourceId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Save a page, document or pasted text into the brand Knowledge library and start ingestion. Default purpose is INSPIRATION; pass BRAND_TRUTH only for material the brand owns and vouches for.',
    name: 'capture_knowledge',
    parameters: {
      properties: {
        kind: {
          description:
            'TEXT for pasted text, URL for a web page, DOCUMENT for a PDF or file URL',
          enum: ['TEXT', 'URL', 'DOCUMENT'],
          type: 'string',
        },
        purpose: {
          description: 'How retrieval should treat the source',
          enum: [...PURPOSE_ENUM],
          type: 'string',
        },
        referenceUrl: {
          description: 'HTTP(S) location for URL and DOCUMENT sources',
          type: 'string',
        },
        text: { description: 'Captured text for TEXT sources', type: 'string' },
        title: {
          description: 'Short human title for the source',
          type: 'string',
        },
      },
      required: ['kind', 'title'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Change the purpose of a Knowledge source (Brand Truth, Inspiration, Research) and optionally hide it from retrieval.',
    name: 'assign_knowledge_purpose',
    parameters: {
      properties: {
        isVisible: {
          description: 'False hides the source from every retrieval',
          type: 'boolean',
        },
        purpose: { enum: [...PURPOSE_ENUM], type: 'string' },
        sourceId: { description: 'Knowledge source id', type: 'string' },
      },
      required: ['sourceId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Archive a Knowledge source so it never appears in retrieval again. Its receipts on past outputs are kept.',
    name: 'archive_knowledge_source',
    parameters: {
      properties: {
        sourceId: { description: 'Knowledge source id', type: 'string' },
      },
      required: ['sourceId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Requeue ingestion for a Knowledge source whose last attempt failed. Never creates a duplicate.',
    name: 'retry_knowledge_ingestion',
    parameters: {
      properties: {
        sourceId: { description: 'Knowledge source id', type: 'string' },
      },
      required: ['sourceId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
];
