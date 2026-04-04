import type { ClientService } from '@mcp/services/client.service';

export interface BatchGenerationParams {
  count: number;
  brandId: string;
  platforms: string[];
  topics?: string[];
  dateRange?: { start: string; end: string };
  style?: string;
}

export function createBatchGenerationTool(client: ClientService) {
  return {
    description:
      'Generate a batch of content (images, videos, carousels) for a brand. Creates draft posts with AI-generated captions scheduled across a date range.',

    async handler(params: BatchGenerationParams) {
      const result = await client.createBatch({
        brandId: params.brandId,
        count: params.count,
        dateRange: params.dateRange || {
          end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          start: new Date().toISOString(),
        },
        platforms: params.platforms,
        style: params.style,
        topics: params.topics,
      });
      return {
        content: [
          {
            text: JSON.stringify(result, null, 2),
            type: 'text' as const,
          },
        ],
      };
    },
    inputSchema: {
      properties: {
        brandId: {
          description: 'Brand ID to generate content for',
          type: 'string',
        },
        count: {
          description: 'Number of content pieces to generate (1-100)',
          type: 'number',
        },
        dateRange: {
          description:
            'Date range for scheduling (object with start and end ISO dates)',
          properties: {
            end: { type: 'string' },
            start: { type: 'string' },
          },
          type: 'object',
        },
        platforms: {
          description: 'Target platforms (e.g., instagram, twitter)',
          items: { type: 'string' },
          type: 'array',
        },
        style: {
          description: 'Style direction (e.g., lifestyle, professional, urban)',
          type: 'string',
        },
        topics: {
          description: 'Content topics or themes',
          items: { type: 'string' },
          type: 'array',
        },
      },
      required: ['count', 'brandId', 'platforms'],
      type: 'object' as const,
    },
    name: 'generate_content_batch',
  };
}

export interface BatchReviewParams {
  batchId?: string;
  status?: string;
  limit?: number;
}

export function createBatchReviewTool(client: ClientService) {
  return {
    description:
      'List and review batch-generated content items. Filter by batch ID and status.',

    async handler(params: BatchReviewParams) {
      const result = await client.listBatches({
        batchId: params.batchId,
        limit: params.limit || 20,
        status: params.status,
      });
      return {
        content: [
          {
            text: JSON.stringify(result, null, 2),
            type: 'text' as const,
          },
        ],
      };
    },
    inputSchema: {
      properties: {
        batchId: {
          description: 'Specific batch ID to review',
          type: 'string',
        },
        limit: {
          description: 'Max items to return (default: 20)',
          type: 'number',
        },
        status: {
          description: 'Filter by item status (pending, completed, failed)',
          type: 'string',
        },
      },
      required: [],
      type: 'object' as const,
    },
    name: 'list_batch_items',
  };
}
