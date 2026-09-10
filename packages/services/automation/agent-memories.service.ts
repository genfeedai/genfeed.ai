import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type { OrgMemoryEntry } from '@props/settings/org-memory.props';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';

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
