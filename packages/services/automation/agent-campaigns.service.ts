import { API_ENDPOINTS } from '@genfeedai/constants';
import type {
  IAgentCampaign,
  IAgentCampaignStatusResponse,
} from '@genfeedai/interfaces';
import type { IServiceSerializer } from '@genfeedai/interfaces/utils/error.interface';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';

const agentCampaignSerializer: IServiceSerializer<AgentCampaign> = {
  serialize: (data) => data,
};

export interface CreateAgentCampaignInput {
  agents?: string[];
  brief?: string;
  brand?: string;
  campaignLeadStrategyId?: string;
  contentQuota?: { posts?: number; images?: number; videos?: number };
  creditsAllocated?: number;
  endDate?: string;
  label: string;
  startDate: string;
  status?: 'draft' | 'active' | 'paused' | 'completed';
}

export class AgentCampaign implements IAgentCampaign {
  id!: string;
  organization!: string;
  user!: string;
  brand?: string;
  label!: string;
  brief?: string;
  agents!: string[];
  campaignLeadStrategyId?: string;
  startDate!: string;
  endDate?: string;
  status!: IAgentCampaign['status'];
  contentQuota?: { posts?: number; images?: number; videos?: number };
  creditsAllocated!: number;
  creditsUsed!: number;
  orchestrationEnabled?: boolean;
  orchestrationIntervalHours?: number;
  lastOrchestratedAt?: string;
  nextOrchestratedAt?: string;
  lastOrchestrationSummary?: string;
  createdAt!: string;
  updatedAt!: string;

  constructor(partial: Partial<IAgentCampaign>) {
    Object.assign(this, partial);
  }
}

export class AgentCampaignsService extends BaseService<
  AgentCampaign,
  CreateAgentCampaignInput,
  Partial<CreateAgentCampaignInput>
> {
  constructor(token: string) {
    super(
      API_ENDPOINTS.AGENT_CAMPAIGNS,
      token,
      AgentCampaign,
      agentCampaignSerializer,
    );
  }

  public static getInstance(token: string): AgentCampaignsService {
    return BaseService.getDataServiceInstance(
      AgentCampaignsService,
      token,
    ) as AgentCampaignsService;
  }

  async list(params?: { status?: string }): Promise<AgentCampaign[]> {
    return this.findAll(params as Record<string, unknown>);
  }

  async getById(id: string): Promise<AgentCampaign> {
    return this.findOne(id);
  }

  async create(data: CreateAgentCampaignInput): Promise<AgentCampaign> {
    return this.post(data);
  }

  async update(
    id: string,
    data: Partial<CreateAgentCampaignInput>,
  ): Promise<AgentCampaign> {
    return this.patch(id, data);
  }

  async remove(id: string): Promise<AgentCampaign> {
    return this.delete(id);
  }

  async execute(id: string): Promise<AgentCampaign> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      `/${id}/execute`,
    );
    return new AgentCampaign(
      this.extractResource<Partial<IAgentCampaign>>(response.data),
    );
  }

  async pause(id: string): Promise<AgentCampaign> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      `/${id}/pause`,
    );
    return new AgentCampaign(
      this.extractResource<Partial<IAgentCampaign>>(response.data),
    );
  }

  async getStatus(id: string): Promise<IAgentCampaignStatusResponse> {
    const response = await this.instance.get<IAgentCampaignStatusResponse>(
      `/${id}/status`,
    );
    return response.data;
  }
}
