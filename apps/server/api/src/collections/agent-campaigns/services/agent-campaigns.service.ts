import { CreateAgentCampaignDto } from '@api/collections/agent-campaigns/dto/create-agent-campaign.dto';
import { CreateAgentCampaignFromTemplateDto } from '@api/collections/agent-campaigns/dto/create-agent-campaign-from-template.dto';
import { UpdateAgentCampaignDto } from '@api/collections/agent-campaigns/dto/update-agent-campaign.dto';
import type { AgentCampaignDocument } from '@api/collections/agent-campaigns/schemas/agent-campaign.schema';
import {
  AgentStrategiesService,
  type AgentStrategyCreateInput,
} from '@api/collections/agent-strategies/services/agent-strategies.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { PrismaTransactionClient } from '@api/helpers/utils/transaction/transaction.util';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  BaseService,
  type PopulateInput,
} from '@api/shared/services/base/base.service';
import { paginatedQueryCacheTag } from '@api/shared/utils/query-cache/query-cache.util';
import { getAgentProgramTemplate } from '@genfeedai/constants';
import { AgentAutonomyMode, AgentRunFrequency } from '@genfeedai/enums';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

export type AgentCampaignWriteDto = Partial<
  CreateAgentCampaignDto & UpdateAgentCampaignDto
> & {
  config?: unknown;
  creditsUsed?: number;
  /** Internal scheduler timestamps are persisted as nullable Prisma columns. */
  lastOrchestratedAt?: Date | null;
  lastOrchestrationSummary?: string | null;
  nextOrchestratedAt?: Date | null;
  organizationId?: string;
  userId?: string;
};

export type AgentCampaignCreateInput = CreateAgentCampaignDto & {
  organizationId: string;
  userId: string;
};

export type AgentCampaignFromTemplateInput =
  CreateAgentCampaignFromTemplateDto & {
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
    private readonly agentStrategiesService: AgentStrategiesService,
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
    const agents = Array.isArray(record.agents)
      ? record.agents.flatMap((agent) => {
          if (typeof agent === 'string') {
            return [agent];
          }
          if (
            agent &&
            typeof agent === 'object' &&
            'id' in agent &&
            typeof agent.id === 'string'
          ) {
            return [agent.id];
          }
          return [];
        })
      : [];

    return {
      ...config,
      ...record,
      agents,
      ...(brief !== undefined ? { brief } : {}),
    } as AgentCampaignDocument;
  }

  override async create(
    createDto: AgentCampaignCreateInput,
    populate: PopulateInput = [],
  ): Promise<AgentCampaignDocument> {
    await this.assertWriteScope(
      this.prisma,
      createDto.organizationId,
      createDto.brandId,
      createDto.agentStrategyIds,
      createDto.campaignLeadStrategyId,
    );

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
    updateDto: AgentCampaignWriteDto,
    populate: PopulateInput = [],
  ): Promise<AgentCampaignDocument> {
    const organizationId = updateDto.organizationId;
    if (!organizationId) {
      throw new BadRequestException(
        'Organization scope is required to update a Program',
      );
    }

    const existing = await this.prisma.agentCampaign.findFirst({
      include: { agents: { select: { id: true } } },
      where: scopedWhere(organizationId, { id }),
    });
    if (!existing) {
      throw new NotFoundException('Program', id);
    }

    const changesRelations =
      Object.hasOwn(updateDto, 'brandId') ||
      Object.hasOwn(updateDto, 'agentStrategyIds') ||
      Object.hasOwn(updateDto, 'campaignLeadStrategyId');

    if (changesRelations) {
      const brandId = Object.hasOwn(updateDto, 'brandId')
        ? updateDto.brandId
        : (existing.brandId ?? undefined);
      const agentStrategyIds = Object.hasOwn(updateDto, 'agentStrategyIds')
        ? (updateDto.agentStrategyIds ?? [])
        : existing.agents.map((agent) => agent.id);
      const campaignLeadStrategyId = Object.hasOwn(
        updateDto,
        'campaignLeadStrategyId',
      )
        ? updateDto.campaignLeadStrategyId
        : (existing.campaignLeadStrategyId ?? undefined);

      await this.assertWriteScope(
        this.prisma,
        existing.organizationId,
        brandId,
        agentStrategyIds,
        campaignLeadStrategyId,
      );
    }

    const existingConfig = this.readRecord(existing.config);

    const include = this.populateToInclude(populate);
    const updated = await this.delegate.update({
      data: this.toPrismaWriteData(updateDto, 'update', existingConfig ?? {}),
      ...(include ? { include } : {}),
      where: scopedWhere(organizationId, { id }),
    });

    if (this.cacheService) {
      await this.cacheService.invalidateByTags([
        this.collectionName,
        `collection:${this.collectionName}`,
        `query:${this.collectionName}`,
        paginatedQueryCacheTag(this.collectionName),
      ]);
    }

    return this.normalizeDocument(updated);
  }

  /**
   * Find campaign by ID and organization
   */
  findOneById(
    id: string,
    organizationId: string,
  ): Promise<AgentCampaignDocument | null> {
    return this.findOne(scopedWhere(organizationId, { id }), ['agents']);
  }

  /**
   * Create a draft Program and every agent in a server-owned template as one
   * transaction. A failed write leaves no orphan agents behind.
   */
  createFromTemplate(
    input: AgentCampaignFromTemplateInput,
  ): Promise<AgentCampaignDocument> {
    const template = getAgentProgramTemplate(input.templateId);
    if (!template) {
      throw new BadRequestException('Unknown Program template');
    }

    return this.prisma.$transaction(async (transactionClient) => {
      const client = transactionClient as unknown as PrismaTransactionClient;
      const existingAgentIds = input.agentStrategyIds ?? [];

      await this.assertWriteScope(
        client,
        input.organizationId,
        input.brandId,
        existingAgentIds,
      );

      const createdAgentIds: string[] = [];
      for (const role of template.roles) {
        const strategy = await this.agentStrategiesService.createWithClient(
          this.buildTemplateStrategyInput(input, role),
          client,
        );
        createdAgentIds.push(strategy.id);
      }

      const allAgentIds = [...existingAgentIds, ...createdAgentIds];
      const campaignLeadStrategyId = createdAgentIds[0] ?? existingAgentIds[0];

      return this.createWithClient(
        {
          agentStrategyIds: allAgentIds,
          brief: input.brief,
          brandId: input.brandId,
          campaignLeadStrategyId,
          creditsAllocated: input.creditsAllocated,
          endDate: input.endDate,
          label: input.label,
          organizationId: input.organizationId,
          startDate: input.startDate,
          status: 'draft',
          userId: input.userId,
        },
        client,
      );
    });
  }

  private async createWithClient(
    createDto: AgentCampaignCreateInput,
    client: PrismaTransactionClient,
  ): Promise<AgentCampaignDocument> {
    const document = await client.agentCampaign.create({
      data: this.toPrismaWriteData(
        createDto,
        'create',
      ) as Prisma.AgentCampaignUncheckedCreateInput,
      include: { agents: { select: { id: true } } },
    });

    return this.normalizeDocument(document);
  }

  private buildTemplateStrategyInput(
    input: AgentCampaignFromTemplateInput,
    role: NonNullable<
      ReturnType<typeof getAgentProgramTemplate>
    >['roles'][number],
  ): AgentStrategyCreateInput {
    return {
      agentType: role.agentType,
      autonomyMode: AgentAutonomyMode.SUPERVISED,
      brandId: input.brandId,
      dailyCreditBudget: role.dailyCreditBudget,
      displayRole: role.displayRole,
      // Template Programs are created as drafts. Their agents must remain
      // inert until AgentCampaignExecutionService starts the Program.
      isActive: false,
      label: role.defaultLabel,
      minCreditThreshold: Math.max(25, Math.floor(role.dailyCreditBudget / 2)),
      organizationId: input.organizationId,
      platforms: role.platforms,
      postsPerWeek: 7,
      reportsToLabel: 'Main Orchestrator',
      runFrequency: AgentRunFrequency.DAILY,
      teamGroup: role.teamGroup,
      topics: [],
      userId: input.userId,
      weeklyCreditBudget: role.dailyCreditBudget * 5,
    };
  }

  private async assertWriteScope(
    client: PrismaTransactionClient,
    organizationId: string,
    brandId?: string,
    agentStrategyIds: string[] = [],
    campaignLeadStrategyId?: string,
  ): Promise<void> {
    if (brandId) {
      const brand = await client.brand.findFirst({
        select: { id: true },
        where: scopedWhere(organizationId, { id: brandId }),
      });
      if (!brand) {
        throw new BadRequestException(
          'The selected brand is unavailable for this Program',
        );
      }
    }

    const uniqueAgentIds = [...new Set(agentStrategyIds)];
    if (
      campaignLeadStrategyId &&
      !uniqueAgentIds.includes(campaignLeadStrategyId)
    ) {
      throw new BadRequestException(
        'The Program lead must be attached to the Program',
      );
    }

    if (uniqueAgentIds.length === 0) {
      return;
    }

    const strategies = await client.agentStrategy.findMany({
      select: { id: true },
      where: scopedWhere(organizationId, {
        ...(brandId ? { brandId } : {}),
        id: { in: uniqueAgentIds },
      }),
    });

    if (strategies.length !== uniqueAgentIds.length) {
      throw new BadRequestException(
        'One or more selected agents are unavailable for this Program',
      );
    }
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
