import type { CreditsUsage } from '@mcp/shared/interfaces/post.interface';
import type { BaseApiClient } from './base-api-client';
import type {
  CreateBatchParams,
  JsonApiResource,
  ListBatchesParams,
  PersonaResponse,
} from './client.types';

/**
 * Account-scoped reads and content-batch orchestration: credits, personas,
 * batches, job status, and agent chat threads.
 */
export class WorkspaceClient {
  constructor(private readonly base: BaseApiClient) {}

  getCredits(): Promise<CreditsUsage> {
    this.base.logger.debug('Getting credits usage');

    return this.base.request(
      'getting credits',
      async (http) => {
        const response = await http.get('/credits/usage');
        // Inline unwrap: the result is destructured below, so it must keep the
        // axios `any` shape rather than the helper's typed return.
        const data =
          response.data?.data?.attributes || response.data?.data || {};

        return {
          available: data.available || 0,
          breakdown: {
            articles: data.breakdown?.articles || 0,
            avatars: data.breakdown?.avatars || 0,
            images: data.breakdown?.images || 0,
            music: data.breakdown?.music || 0,
            videos: data.breakdown?.videos || 0,
          },
          resetDate: data.resetDate,
          total: data.total || 0,
          used: data.used || 0,
        };
      },
      this.base.failWith('Failed to get credits usage'),
    );
  }

  listPersonas(
    params: { status?: string; limit?: number; offset?: number } = {},
  ): Promise<PersonaResponse[]> {
    this.base.logger.debug('Listing personas', { params });

    return this.base.request(
      'listing personas',
      async (http) => {
        const response = await http.get('/personas', {
          params: {
            'filter[status]': params.status,
            'page[limit]': params.limit || 10,
            'page[offset]': params.offset || 0,
          },
        });

        return (
          response.data?.data?.map((persona: JsonApiResource) => ({
            id: persona.id || String(persona.attributes?.id || ''),
            name: String(persona.attributes?.name || 'Unnamed'),
            status: persona.attributes?.status
              ? String(persona.attributes.status)
              : undefined,
            ...(persona.attributes || {}),
          })) || []
        );
      },
      this.base.failWith('Failed to list personas'),
    );
  }

  createBatch(params: CreateBatchParams): Promise<Record<string, unknown>> {
    this.base.logger.debug('Creating content batch', { params });

    return this.base.request(
      'creating batch',
      async (http) => {
        const response = await http.post('/batches', {
          data: {
            attributes: params,
            type: 'batches',
          },
        });

        return this.base.unwrapAttributes(response);
      },
      this.base.failWithDetail('Failed to create batch'),
    );
  }

  listBatches(
    params: ListBatchesParams = {},
  ): Promise<Array<Record<string, unknown>>> {
    this.base.logger.debug('Listing content batches', { params });

    return this.base.request(
      'listing batches',
      async (http) => {
        const response = await http.get('/batches', {
          params: {
            'filter[batchId]': params.batchId,
            'filter[status]': params.status,
            'page[limit]': params.limit || 20,
            'page[offset]': params.offset || 0,
          },
        });

        if (!Array.isArray(response.data?.data)) {
          return [];
        }

        return response.data.data.map((item: JsonApiResource) => ({
          id: item.id || String(item.attributes?.id || ''),
          ...(item.attributes || {}),
        }));
      },
      this.base.failWith('Failed to list batches'),
    );
  }

  getJobStatus(jobId: string): Promise<Record<string, unknown>> {
    return this.base.request(
      'getting job status',
      async (http) => {
        const response = await http.get(
          `/ingredients/batch?ids=${encodeURIComponent(jobId)}`,
        );
        const collection = response.data?.data;
        const row = Array.isArray(collection) ? collection[0] : collection;
        if (!row || typeof row !== 'object') {
          throw new Error(`Job ${jobId} was not found`);
        }
        const record = row as Record<string, unknown>;
        const rawAttributes = record.attributes;
        const attributes =
          rawAttributes &&
          typeof rawAttributes === 'object' &&
          !Array.isArray(rawAttributes)
            ? (rawAttributes as Record<string, unknown>)
            : record;
        const id = String(record.id ?? jobId) || jobId;
        const url =
          (typeof attributes.cdnUrl === 'string' && attributes.cdnUrl) ||
          (typeof attributes.url === 'string' && attributes.url) ||
          undefined;
        // Video (and other long-running) generations report progress on the
        // ingredient; surface it under the stable `progress`/`stage` names.
        const progress =
          typeof attributes.generationProgress === 'number'
            ? attributes.generationProgress
            : undefined;
        const stage =
          typeof attributes.generationStage === 'string'
            ? attributes.generationStage
            : undefined;
        return {
          id,
          ...attributes,
          ...(progress !== undefined ? { progress } : {}),
          ...(stage ? { stage } : {}),
          ...(url ? { url } : {}),
        };
      },
      this.base.failWith('Failed to get job status'),
    );
  }

  createChat(): Promise<Record<string, unknown>> {
    return this.base.request(
      'creating chat',
      async (http) => this.base.unwrapObject(await http.post('/agent/threads')),
      this.base.failWith('Failed to create chat'),
    );
  }

  sendChatMessage(
    threadId: string,
    message: string,
  ): Promise<Record<string, unknown>> {
    return this.base.request(
      'sending chat message',
      async (http) =>
        this.base.unwrapObject(
          await http.post(`/agent/threads/${threadId}/messages`, {
            content: message,
          }),
        ),
      this.base.failWith('Failed to send chat message'),
    );
  }
}
