import type {
  CreditsUsage,
  UsageStats,
} from '@mcp/shared/interfaces/post.interface';
import type { BaseApiClient } from './base-api-client';
import type {
  BrandResponse,
  CreateBatchParams,
  JsonApiResource,
  ListBatchesParams,
  PersonaResponse,
} from './client.types';

/**
 * Account-scoped reads and content-batch orchestration: credits/usage, brands,
 * personas, batches, account/job status, and agent chat threads.
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

  getUsageStats(timeRange: string = '30d'): Promise<UsageStats> {
    this.base.logger.debug(`Getting usage stats for timeRange: ${timeRange}`);

    return this.base.request(
      'getting usage stats',
      async (http) => {
        const response = await http.get('/usage/stats', {
          params: { timeRange },
        });
        const data =
          response.data?.data?.attributes || response.data?.data || {};

        return {
          contentCreated: {
            articles: data.contentCreated?.articles || 0,
            avatars: data.contentCreated?.avatars || 0,
            images: data.contentCreated?.images || 0,
            music: data.contentCreated?.music || 0,
            videos: data.contentCreated?.videos || 0,
          },
          creditsUsed: data.creditsUsed || 0,
          postsPublished: data.postsPublished || 0,
          timeRange,
          totalEngagement: data.totalEngagement || 0,
        };
      },
      this.base.failWith('Failed to get usage stats'),
    );
  }

  listBrands(): Promise<BrandResponse[]> {
    this.base.logger.debug('Listing brands');

    return this.base.request(
      'listing brands',
      async (http) => {
        const response = await http.get('/brands');
        return (
          response.data?.data?.map((brand: JsonApiResource) => ({
            id: brand.id || String(brand.attributes?.id || ''),
            name: String(brand.attributes?.name || 'Unnamed'),
            status: brand.attributes?.status
              ? String(brand.attributes.status)
              : undefined,
            ...(brand.attributes || {}),
          })) || []
        );
      },
      this.base.failWith('Failed to list brands'),
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

  getAccountInfo(): Promise<Record<string, unknown>> {
    return this.base.request(
      'getting account info',
      async (http) => {
        const response = await http.get('/accounts');
        const account = response.data?.data?.[0] || response.data?.data;
        return {
          id: account?.id,
          ...(account?.attributes || account || {}),
        };
      },
      this.base.failWith('Failed to get account info'),
    );
  }

  getJobStatus(jobId: string): Promise<Record<string, unknown>> {
    return this.base.request(
      'getting job status',
      async (http) => {
        const response = await http.get(`/ingredients/${jobId}`);
        const data = response.data?.data;
        return {
          id: data?.id,
          ...(data?.attributes || data || {}),
        };
      },
      this.base.failWith('Failed to get job status'),
    );
  }

  createChat(): Promise<Record<string, unknown>> {
    return this.base.request(
      'creating chat',
      async (http) => this.base.unwrapObject(await http.post('/threads')),
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
          await http.post(`/threads/${threadId}/messages`, {
            content: message,
          }),
        ),
      this.base.failWith('Failed to send chat message'),
    );
  }
}
