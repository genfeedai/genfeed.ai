import type {
  OrganizationOption,
  OrganizationOptionBrand,
} from '@genfeedai/contracts/interfaces';
import type { CreditsUsage } from '@mcp/shared/interfaces/post.interface';
import type { AxiosResponse } from 'axios';
import type { BaseApiClient } from './base-api-client';
import type {
  ApiError,
  CreateTurboRunParams,
  JsonApiResource,
  ListTurboRunsParams,
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

  /**
   * Every organization the token's user has an active membership in, with the
   * one this token is bound to flagged `isActive`. Cross-org read — the same
   * `?mine=true` list the web organization switcher uses.
   */
  listOrganizations(): Promise<OrganizationOption[]> {
    this.base.logger.debug('Listing organizations');

    return this.base.request(
      'listing organizations',
      async (http) => {
        const response = await http.get('/organizations', {
          params: { mine: true },
        });
        const data = response.data?.data ?? response.data;
        return Array.isArray(data) ? (data as OrganizationOption[]) : [];
      },
      this.base.failWith('Failed to list organizations'),
    );
  }

  /** Whether the user let this connection move between organizations. */
  canSwitchOrganizations(): Promise<boolean> {
    return this.base.request(
      'checking organization switching',
      async (http) => {
        const response = await http.get('/auth/whoami');
        return response.data?.data?.canSwitchOrganizations === true;
      },
      this.base.failWith('Failed to read the connection'),
    );
  }

  switchOrganization(organizationId: string): Promise<void> {
    this.base.logger.debug('Switching organization', { organizationId });

    return this.base.request(
      'switching organization',
      async (http) => {
        await http.post('/auth/switch-organization', { organizationId });
      },
      this.base.failWithDetail('Failed to switch organization'),
    );
  }

  /** Brands the caller can see in the organization this connection is in. */
  listBrands(): Promise<OrganizationOptionBrand[]> {
    return this.base.request(
      'listing brands',
      async (http) => {
        const response = await http.get('/brands');
        return this.base
          .unwrapList<JsonApiResource>(response)
          .map((brand) => ({
            id: brand.id || String(brand.attributes?.id || ''),
            label: String(brand.attributes?.label || 'Brand'),
          }))
          .filter((brand) => brand.id);
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

  createTurboRun(
    params: CreateTurboRunParams,
  ): Promise<Record<string, unknown>> {
    this.base.logger.debug('Creating content batch', { params });

    return this.base.request(
      'creating batch',
      async (http) => {
        const response = await http.post('/turbo-runs', {
          data: {
            attributes: params,
            type: 'turbo-runs',
          },
        });

        return this.base.unwrapAttributes(response);
      },
      this.base.failWithDetail('Failed to create batch'),
    );
  }

  listTurboRuns(
    params: ListTurboRunsParams = {},
  ): Promise<Array<Record<string, unknown>>> {
    this.base.logger.debug('Listing content batches', { params });

    return this.base.request(
      'listing batches',
      async (http) => {
        const response = await http.get('/turbo-runs', {
          params: {
            'filter[turboRunId]': params.turboRunId,
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
        let response: AxiosResponse | undefined;
        try {
          response = await http.get(
            `/ingredients/batch?ids=${encodeURIComponent(jobId)}`,
          );
        } catch (error: unknown) {
          if ((error as ApiError).response?.status !== 404) throw error;
        }
        const collection = response?.data?.data;
        const row = Array.isArray(collection) ? collection[0] : collection;
        if (!row || typeof row !== 'object') {
          const approval = await http.get(
            `/mcp-approvals/${encodeURIComponent(jobId)}/status`,
          );
          return { id: jobId, ...this.base.unwrapAttributes(approval) };
        }
        const record = row as Record<string, unknown>;
        if (record.id !== jobId) {
          throw new Error(`Job ${jobId} was not found`);
        }
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
      this.base.failWithDetail('Failed to get job status'),
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
