import { CreateAgentCampaignDto } from '@api/collections/agent-campaigns/dto/create-agent-campaign.dto';
import { UpdateAgentCampaignDto } from '@api/collections/agent-campaigns/dto/update-agent-campaign.dto';
import type { AgentCampaignDocument } from '@api/collections/agent-campaigns/schemas/agent-campaign.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  BaseService,
  type PopulateInput,
} from '@api/shared/services/base/base.service';
import { scopedWhere } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

type AgentCampaignWriteDto = Partial<
  CreateAgentCampaignDto & UpdateAgentCampaignDto
> & {
  config?: unknown;
  organizationId?: string;
  userId?: string;
};

type AgentCampaignCreateInput = CreateAgentCampaignDto & {
  organizationId: string;
  userId: string;
};

/** Payload-only keys that remain in config JSON. */
const CONFIG_BACKED_KEYS = ['contentQuota', 'contentRotation'] as const;

/** First-class columns — not config JSON. */
const COLUMN_BACKED_KEYS = [
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

  protected override normalizeDocument(
    document: unknown,
  ): AgentCampaignDocument {
    const record = super.normalizeDocument(document) as Record<string, unknown>;
    const config = this.readRecord(record.config) ?? {};
    const brief =
      typeof record.description === 'string'
        ? record.description
        : typeof config.brief === 'string'
          ? config.brief
          : undefined;

    return {
      ...config,
      ...record,
      ...(brief !== undefined ? { brief } : {}),
    } as AgentCampaignDocument;
  }

  override async create(
    createDto: AgentCampaignCreateInput,
    populate: PopulateInput = [],
  ): Promise<AgentCampaignDocument> {
    return await super.create(
      this.toPrismaWriteData(
        createDto,
        'create',
      ) as unknown as CreateAgentCampaignDto,
      populate,
    );
  }

  override async patch(
    id: string,
    updateDto: Partial<UpdateAgentCampaignDto>,
    populate: PopulateInput = [],
  ): Promise<AgentCampaignDocument> {
    const existing = await this.findOne({ id: id });
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
    return this.findOne(scopedWhere(organizationId, { id }));
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

    if (typeof dto.organizationId === 'string') {
      data.organizationId = dto.organizationId;
    }

    if (typeof dto.userId === 'string') {
      data.userId = dto.userId;
    }

    if (Object.hasOwn(dto, 'brandId')) {
      data.brandId = dto.brandId ?? null;
    }

    if (Object.hasOwn(dto, 'campaignLeadStrategyId')) {
      data.campaignLeadStrategyId = dto.campaignLeadStrategyId ?? null;
    }

    if (Object.hasOwn(dto, 'agentStrategyIds')) {
      const agentStrategyIds = Array.isArray(dto.agentStrategyIds)
        ? dto.agentStrategyIds
        : [];
      data.agents =
        mode === 'create'
          ? { connect: agentStrategyIds.map((id) => ({ id })) }
          : { set: agentStrategyIds.map((id) => ({ id })) };
    }

    for (const key of COLUMN_BACKED_KEYS) {
      if (Object.hasOwn(dto, key)) {
        data[key] = (dto as Record<string, unknown>)[key];
        delete config[key];
      }
    }

    for (const key of CONFIG_BACKED_KEYS) {
      if (Object.hasOwn(dto, key)) {
        config[key] = (dto as Record<string, unknown>)[key];
      }
    }

    // brief lives only on description — never re-stash into config
    delete config.brief;
    delete config.status;
    delete config.startDate;
    delete config.endDate;
    delete config.creditsAllocated;
    delete config.creditsUsed;
    delete config.orchestrationEnabled;
    delete config.orchestrationIntervalHours;
    delete config.nextOrchestratedAt;
    delete config.lastOrchestratedAt;
    delete config.lastOrchestrationSummary;

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
