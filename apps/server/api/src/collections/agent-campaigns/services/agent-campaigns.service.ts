import { CreateAgentCampaignDto } from '@api/collections/agent-campaigns/dto/create-agent-campaign.dto';
import { UpdateAgentCampaignDto } from '@api/collections/agent-campaigns/dto/update-agent-campaign.dto';
import type { AgentCampaignDocument } from '@api/collections/agent-campaigns/schemas/agent-campaign.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import type { PopulateOption } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

type PopulateInput = (string | PopulateOption)[] | 'none';

type AgentCampaignWriteDto = Partial<
  CreateAgentCampaignDto & UpdateAgentCampaignDto
> & {
  brand?: string;
  config?: unknown;
  organization?: string;
  user?: string;
};

const CONFIG_BACKED_KEYS = [
  'brief',
  'contentQuota',
  'contentRotation',
  'creditsAllocated',
  'creditsUsed',
  'endDate',
  'lastOrchestratedAt',
  'lastOrchestrationSummary',
  'nextOrchestratedAt',
  'orchestrationEnabled',
  'orchestrationIntervalHours',
  'startDate',
  'status',
] as const;

@Injectable()
export class AgentCampaignsService extends BaseService<
  AgentCampaignDocument,
  CreateAgentCampaignDto,
  UpdateAgentCampaignDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'agentCampaign', logger);
  }

  override async create(
    createDto: CreateAgentCampaignDto,
    populate: PopulateInput = [],
  ): Promise<AgentCampaignDocument> {
    return await super.create(
      this.toPrismaWriteData(createDto, 'create'),
      populate,
    );
  }

  override async patch(
    id: string,
    updateDto: Partial<UpdateAgentCampaignDto>,
    populate: PopulateInput = [],
  ): Promise<AgentCampaignDocument> {
    const existing = await this.findOne({ _id: id });
    const existingConfig = this.readRecord(
      (existing as Record<string, unknown> | null)?.config,
    );

    return await super.patch(
      id,
      this.toPrismaWriteData(updateDto, 'update', existingConfig ?? {}),
      populate,
    );
  }

  /**
   * Find campaign by ID and organization
   */
  findOneById(
    id: string,
    organizationId: string,
  ): Promise<AgentCampaignDocument | null> {
    return this.findOne({
      id,
      isDeleted: false,
      organizationId,
    });
  }

  private toPrismaWriteData(
    dto: AgentCampaignWriteDto,
    mode: 'create' | 'update',
    existingConfig: Record<string, unknown> = {},
  ): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    const config: Record<string, unknown> = { ...existingConfig };

    if (Object.hasOwn(dto, 'label')) {
      data.label = dto.label;
    }

    if (Object.hasOwn(dto, 'brief')) {
      data.description = dto.brief;
    }

    if (typeof dto.organization === 'string') {
      data.organizationId = dto.organization;
    }

    if (typeof dto.user === 'string') {
      data.userId = dto.user;
    }

    if (Object.hasOwn(dto, 'brand')) {
      data.brandId = dto.brand ?? null;
    }

    if (Object.hasOwn(dto, 'campaignLeadStrategyId')) {
      data.campaignLeadStrategyId = dto.campaignLeadStrategyId ?? null;
    }

    if (Object.hasOwn(dto, 'agents')) {
      const agents = Array.isArray(dto.agents) ? dto.agents : [];
      data.agents =
        mode === 'create'
          ? { connect: agents.map((id) => ({ id })) }
          : { set: agents.map((id) => ({ id })) };
    }

    for (const key of CONFIG_BACKED_KEYS) {
      if (Object.hasOwn(dto, key)) {
        config[key] = dto[key];
      }
    }

    const suppliedConfig = this.readRecord(dto.config);
    data.config = suppliedConfig ? { ...config, ...suppliedConfig } : config;

    return data;
  }

  private readRecord(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }
}
