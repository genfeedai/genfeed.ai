import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type { IAgentMemoryEntry } from '@genfeedai/contracts/interfaces';
import type { OrgMemoryEntry } from '@props/settings/org-memory.props';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

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

  async listOrganization(): Promise<OrgMemoryEntry[]> {
    return await this.instance
      .get<OrgMemoryEntry[]>('/organization')
      .then((res) => res.data);
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
