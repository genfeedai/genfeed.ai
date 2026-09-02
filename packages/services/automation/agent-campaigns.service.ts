import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type {
  IAgentCampaign,
  IAgentCampaignContentRotation,
  IAgentCampaignStatusResponse,
} from '@genfeedai/contracts/interfaces';
import type { IServiceSerializer } from '@genfeedai/contracts/interfaces/utils/error.interface';
import { BaseService } from '@services/core/base.service';

const agentCampaignSerializer: IServiceSerializer<AgentCampaign> = {
  serialize: (data) => data,
};

export interface CreateAgentCampaignInput {
  agentStrategyIds?: string[];
  brief?: string;
  brandId?: string;
  campaignLeadStrategyId?: string;
  contentRotation?: IAgentCampaignContentRotation;
  contentQuota?: { posts?: number; images?: number; videos?: number };
  creditsAllocated?: number;
  endDate?: string;
  label: string;
  startDate: string;
  status?: 'draft' | 'active' | 'paused' | 'completed';
}

export interface CreateAgentCampaignFromTemplateInput
  extends Omit<CreateAgentCampaignInput, 'campaignLeadStrategyId' | 'status'> {
  brandId: string;
  templateId: string;
}

export class AgentCampaign implements IAgentCampaign {
  id!: string;
  organizationId!: string;
  userId!: string;
  brandId?: string;
  label!: string;
  brief?: string;
  agents!: string[];
  campaignLeadStrategyId?: string;
  startDate!: string;
  endDate?: string;
  status!: IAgentCampaign['status'];
  contentRotation?: IAgentCampaignContentRotation;
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
    return BaseService.getDataServiceInstance(AgentCampaignsService, token);
  }

  async list(params?: {
    brandId?: string;
    status?: string;
  }): Promise<AgentCampaign[]> {
    return this.findAll(params as Record<string, unknown>);
  }

  async getById(id: string): Promise<AgentCampaign> {
    return this.findOne(id);
  }

  async create(data: CreateAgentCampaignInput): Promise<AgentCampaign> {
    return this.post(data);
  }

  async createFromTemplate(
    data: CreateAgentCampaignFromTemplateInput,
  ): Promise<AgentCampaign> {
    return this.post('from-template', data);
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
    return this.patch(id, { status: 'active' });
  }

  async pause(id: string): Promise<AgentCampaign> {
    return this.patch(id, { status: 'paused' });
  }

  async getStatus(id: string): Promise<IAgentCampaignStatusResponse> {
    const response = await this.instance.get<IAgentCampaignStatusResponse>(
      `/${id}/status`,
    );
    return response.data;
  }
}
