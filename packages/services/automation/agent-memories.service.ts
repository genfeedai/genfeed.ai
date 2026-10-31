import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type {
  IAgentMemoryEntry,
  IAgentMemoryRevision,
  ICorrectAgentMemoryInput,
} from '@genfeedai/contracts/interfaces';
import type { OrgMemoryEntry } from '@genfeedai/contracts/interfaces/settings/org-memory.interface';
import { PagesService } from '@services/content/pages.service';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

interface OrgMemoryPage {
  docs: OrgMemoryEntry[];
  page: number;
  totalDocs: number;
  totalPages: number;
}

export class AgentMemoriesService extends HTTPBaseService {
  constructor(token: string) {
    super(
      `${EnvironmentService.apiEndpoint}${API_ENDPOINTS.AGENT_MEMORIES}`,
      token,
    );
  }

  public static getInstance(token: string): AgentMemoriesService {
    return HTTPBaseService.getBaseServiceInstance(
      AgentMemoriesService,
      token,
    ) as AgentMemoriesService;
  }

  /** The requesting user's own personal memories. */
  async listPersonal(signal?: AbortSignal): Promise<IAgentMemoryEntry[]> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      '/personal',
      { signal },
    );
    return deserializeCollection<IAgentMemoryEntry>(response.data);
  }

  /** Brand-scope memories for a brand in the active organization (read-only). */
  async listForBrand(
    brandId: string,
    signal?: AbortSignal,
  ): Promise<IAgentMemoryEntry[]> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      `/brands/${brandId}`,
      { signal },
    );
    return deserializeCollection<IAgentMemoryEntry>(response.data);
  }

  /** Archive one of the requesting user's own personal memories. */
  async archivePersonal(memoryId: string): Promise<IAgentMemoryEntry> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      `/personal/${memoryId}/archive`,
    );
    return deserializeResource<IAgentMemoryEntry>(response.data);
  }

  /**
   * One server page of brand and org-wide memories, newest first. The API
   * answers with a page envelope; its totals are published for
   * `<AutoPagination />`.
   */
  async listOrganization(
    query: { limit?: number; page?: number } = {},
    signal?: AbortSignal,
  ): Promise<OrgMemoryEntry[]> {
    const { data } = await this.instance.get<OrgMemoryPage>('/organization', {
      params: query,
      signal,
    });
    if (query.page) {
      PagesService.setCurrentPage(data.page);
      PagesService.setTotalPages(data.totalPages);
      PagesService.setTotalDocs(data.totalDocs);
    }
    return data.docs;
  }

  /**
   * Corrects a memory: the API appends an immutable revision and makes it
   * current. A stale `expectedRevisionId` answers 409.
   */
  async correct(
    memoryId: string,
    input: ICorrectAgentMemoryInput,
  ): Promise<IAgentMemoryRevision> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      `/${memoryId}/revisions`,
      input,
    );
    return deserializeResource<IAgentMemoryRevision>(response.data);
  }

  /** One page of a memory's revisions, newest first. */
  async listRevisions(
    memoryId: string,
    query: { cursor?: string; limit?: number } = {},
    signal?: AbortSignal,
  ): Promise<{ items: IAgentMemoryRevision[]; nextCursor: string | null }> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      `/${memoryId}/revisions`,
      { params: query, signal },
    );
    const nextCursor = response.data.meta?.nextCursor;
    return {
      items: deserializeCollection<IAgentMemoryRevision>(response.data),
      nextCursor: typeof nextCursor === 'string' ? nextCursor : null,
    };
  }

  async archive(memoryId: string): Promise<OrgMemoryEntry> {
    return await this.instance
      .post<OrgMemoryEntry>(`/${memoryId}/archive`)
      .then((res) => res.data);
  }

  async promote(memoryId: string): Promise<OrgMemoryEntry> {
    return await this.instance
      .post<OrgMemoryEntry>(`/${memoryId}/promote`)
      .then((res) => res.data);
  }

  async reject(memoryId: string): Promise<OrgMemoryEntry> {
    return await this.instance
      .post<OrgMemoryEntry>(`/${memoryId}/reject`)
      .then((res) => res.data);
  }
}
