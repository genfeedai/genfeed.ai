import { CreateAgentStrategyDto } from '@api/collections/agent-strategies/dto/create-agent-strategy.dto';
import { UpdateAgentStrategyDto } from '@api/collections/agent-strategies/dto/update-agent-strategy.dto';
import type { AgentStrategyDocument } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { AgentRunStatus } from '@genfeedai/enums';
import type { PopulateOption } from '@genfeedai/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import { scopedWhere } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

type PopulateInput = (string | PopulateOption)[] | 'none';

type AgentStrategyWriteDto = Partial<
  Omit<
    CreateAgentStrategyDto & UpdateAgentStrategyDto,
    'brand' | 'lastRunAt' | 'nextRunAt'
  >
> & {
  brand?: string | null;
  config?: unknown;
  consecutiveFailures?: number;
  creditsUsedThisWeek?: number;
  creditsUsedToday?: number;
  dailyCreditsUsed?: number;
  lastRunAt?: Date | null;
  monthToDateCreditsUsed?: number;
  nextRunAt?: Date | null;
  organization?: string;
  policies?: unknown;
  requiresManualReactivation?: boolean;
  reserveTrendBudgetRemaining?: number;
  runHistory?: unknown;
  user?: string;
};

/**
 * Prisma `AgentStrategy` is a slim table: scalars + `config`/`policies` JSON.
 * Domain fields from the Mongo-era document live in those bags; reads expand
 * them via BaseService.normalizeDocument. Writes must pack them back.
 */
const CONFIG_BACKED_KEYS = [
  'autoPublishConfidenceThreshold',
  'autonomyMode',
  'consecutiveFailures',
  'contentMix',
  'creditsUsedThisWeek',
  'creditsUsedToday',
  'dailyCreditBudget',
  'dailyCreditResetAt',
  'dailyCreditsUsed',
  'dailyResetAt',
  'displayRole',
  'engagementEnabled',
  'engagementKeywords',
  'engagementTone',
  'expectedSpendToDate',
  'isEnabled',
  'lastRunAt',
  'maxEngagementsPerDay',
  'minCreditThreshold',
  'model',
  'monthToDateCreditsUsed',
  'monthlyResetAt',
  'nextRunAt',
  'opportunitySources',
  'postsPerWeek',
  'preferredPostingTimes',
  'qualityTier',
  'reportsToLabel',
  'requiresManualReactivation',
  'reserveTrendBudgetRemaining',
  'runFrequency',
  'runHistory',
  'skillSlugs',
  'teamGroup',
  'timezone',
  'topics',
  'voice',
  'weeklyCreditBudget',
  'weeklyResetAt',
] as const;

const POLICIES_BACKED_KEYS = [
  'budgetPolicy',
  'goalProfile',
  'publishPolicy',
  'rankingPolicy',
  'reportingPolicy',
] as const;

@Injectable()
export class AgentStrategiesService extends BaseService<
  AgentStrategyDocument,
  CreateAgentStrategyDto,
  UpdateAgentStrategyDto,
  Prisma.AgentStrategyWhereInput
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'agentStrategy', logger);
  }

  /**
   * Create strategy with scheduler defaults.
   * If strategy starts active, queue first run immediately.
   */
  override async create(
    createDto: CreateAgentStrategyDto,
    populate: PopulateInput = [],
  ): Promise<AgentStrategyDocument> {
    const now = new Date();

    const payload: AgentStrategyWriteDto = {
      ...createDto,
      ...(createDto.isActive ? { nextRunAt: now } : {}),
      ...(createDto.dailyCreditResetAt ? {} : { dailyCreditResetAt: now }),
      ...(createDto.dailyResetAt ? {} : { dailyResetAt: now }),
      ...(createDto.monthlyResetAt ? {} : { monthlyResetAt: now }),
      ...(createDto.budgetPolicy?.reserveTrendBudget !== undefined
        ? {
            reserveTrendBudgetRemaining:
              createDto.budgetPolicy.reserveTrendBudget,
          }
        : {}),
      // Defaults for counters that live in config
      consecutiveFailures: 0,
      creditsUsedThisWeek: 0,
      creditsUsedToday: 0,
      dailyCreditsUsed: 0,
      isEnabled: createDto.isEnabled ?? true,
      monthToDateCreditsUsed: 0,
      runHistory: [],
    };

    return super.create(
      this.toPrismaWriteData(
        payload,
        'create',
      ) as unknown as CreateAgentStrategyDto,
      populate,
    );
  }

  override async patch(
    id: string,
    updateDto: Partial<UpdateAgentStrategyDto>,
    populate: PopulateInput = [],
  ): Promise<AgentStrategyDocument> {
    const existing = await this.findOne({ _id: id });
    const existingRecord = existing as Record<string, unknown> | null;
    const existingConfig = this.readRecord(existingRecord?.config) ?? {};
    const existingPolicies = this.readRecord(existingRecord?.policies) ?? {};

    return super.patch(
      id,
      this.toPrismaWriteData(
        updateDto as AgentStrategyWriteDto,
        'update',
        existingConfig,
        existingPolicies,
      ) as unknown as Partial<UpdateAgentStrategyDto>,
      populate,
    );
  }

  /**
   * Find strategy by ID and organization
   */
  findOneById(
    id: string,
    organizationId: string,
  ): Promise<AgentStrategyDocument | null> {
    return this.findOne(scopedWhere(organizationId, { id }));
  }

  /**
   * Set a strategy's active state, applying the scheduler derived-field resets
   * on transition: activation queues the next run and clears failure state;
   * deactivation clears the schedule. Returns null when the strategy is missing.
   * Backs the `isActive` field on `PATCH /agent-strategies/:id`.
   */
  async setActive(
    id: string,
    organizationId: string,
    isActive: boolean,
  ): Promise<AgentStrategyDocument | null> {
    const strategy = await this.findOneById(id, organizationId);
    if (!strategy) {
      return null;
    }

    const updateData: AgentStrategyWriteDto = { isActive };

    if (isActive && !strategy.isActive) {
      updateData.nextRunAt = new Date();
      updateData.consecutiveFailures = 0;
      updateData.requiresManualReactivation = false;
    } else if (!isActive && strategy.isActive) {
      updateData.nextRunAt = null;
    }

    return this.patch(id, updateData as UpdateAgentStrategyDto);
  }

  /**
   * Record a run execution in the strategy history
   */
  async recordRun(
    id: string,
    run: {
      startedAt: Date;
      completedAt: Date;
      status: AgentRunStatus;
      creditsUsed: number;
      contentGenerated: number;
      threadId?: string;
    },
  ): Promise<void> {
    const current = (await this.delegate.findFirst({
      where: { id },
    })) as AgentStrategyDocument | null;
    if (!current) return;

    const config = this.readRecord(current.config) ?? {};
    const existingHistory = Array.isArray(config.runHistory)
      ? (config.runHistory as unknown[])
      : Array.isArray(current.runHistory)
        ? (current.runHistory as unknown[])
        : [];
    const trimmedHistory = [...existingHistory, run].slice(-50);

    const creditsUsedThisWeek =
      Number(config.creditsUsedThisWeek ?? current.creditsUsedThisWeek ?? 0) +
      run.creditsUsed;
    const creditsUsedToday =
      Number(config.creditsUsedToday ?? 0) + run.creditsUsed;
    const dailyCreditsUsed =
      Number(config.dailyCreditsUsed ?? current.dailyCreditsUsed ?? 0) +
      run.creditsUsed;
    const monthToDateCreditsUsed =
      Number(
        config.monthToDateCreditsUsed ?? current.monthToDateCreditsUsed ?? 0,
      ) + run.creditsUsed;

    await this.delegate.update({
      where: { id },
      data: {
        config: {
          ...config,
          creditsUsedThisWeek,
          creditsUsedToday,
          dailyCreditsUsed,
          lastRunAt: run.completedAt,
          monthToDateCreditsUsed,
          runHistory: trimmedHistory,
        },
      },
    });
  }

  /**
   * Increment consecutiveFailures and return the new count.
   * Used by the processor after a run fails.
   */
  async incrementFailures(id: string): Promise<number> {
    const current = (await this.delegate.findFirst({
      where: { id },
    })) as AgentStrategyDocument | null;
    if (!current) {
      return 0;
    }

    const config = this.readRecord(current.config) ?? {};
    const next =
      Number(config.consecutiveFailures ?? current.consecutiveFailures ?? 0) +
      1;

    await this.delegate.update({
      where: { id },
      data: {
        config: {
          ...config,
          consecutiveFailures: next,
        },
      },
    });

    return next;
  }

  /**
   * Reset consecutiveFailures to 0.
   * Used by the processor after a successful run.
   */
  async resetFailures(id: string): Promise<void> {
    const current = (await this.delegate.findFirst({
      where: { id, isDeleted: false },
    })) as AgentStrategyDocument | null;
    if (!current) {
      return;
    }

    const config = this.readRecord(current.config) ?? {};
    await this.delegate.update({
      where: { id },
      data: {
        config: {
          ...config,
          consecutiveFailures: 0,
        },
      },
    });
  }

  /**
   * Pause a strategy — sets isActive=false and clears nextRunAt.
   * Used for auto-pause after consecutive failures.
   */
  async pauseStrategy(id: string): Promise<void> {
    const current = (await this.delegate.findFirst({
      where: { id, isDeleted: false },
    })) as AgentStrategyDocument | null;
    if (!current) {
      return;
    }

    const config = this.readRecord(current.config) ?? {};
    await this.delegate.update({
      where: { id },
      data: {
        config: {
          ...config,
          nextRunAt: null,
        },
        isActive: false,
      },
    });
  }

  /**
   * Find all enabled strategies for scheduler queries.
   * Only returns strategies that are both isEnabled and not deleted.
   */
  async findEnabledStrategies(
    filter: Record<string, unknown> = {},
  ): Promise<AgentStrategyDocument[]> {
    return this.delegate.findMany({
      where: {
        isDeleted: false,
        isActive: true,
        ...filter,
      },
    }) as Promise<AgentStrategyDocument[]>;
  }

  /**
   * Mark strategy for manual reactivation after repeated failures.
   */
  async requireManualReactivation(id: string): Promise<void> {
    const current = (await this.delegate.findFirst({
      where: { id, isDeleted: false },
    })) as AgentStrategyDocument | null;
    if (!current) {
      return;
    }

    const config = this.readRecord(current.config) ?? {};
    await this.delegate.update({
      where: { id },
      data: {
        config: {
          ...config,
          nextRunAt: null,
          requiresManualReactivation: true,
        },
        isActive: false,
      },
    });
  }

  private toPrismaWriteData(
    dto: AgentStrategyWriteDto,
    mode: 'create' | 'update',
    existingConfig: Record<string, unknown> = {},
    existingPolicies: Record<string, unknown> = {},
  ): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    const config: Record<string, unknown> = { ...existingConfig };
    const policies: Record<string, unknown> = { ...existingPolicies };

    if (Object.hasOwn(dto, 'label')) {
      data.label = dto.label;
    }

    if (Object.hasOwn(dto, 'description')) {
      data.description = (dto as { description?: string }).description ?? null;
    }

    if (typeof dto.organization === 'string') {
      data.organizationId = dto.organization;
    } else if (
      mode === 'create' &&
      typeof (dto as { organizationId?: string }).organizationId === 'string'
    ) {
      data.organizationId = (dto as { organizationId: string }).organizationId;
    }

    if (typeof dto.user === 'string') {
      data.userId = dto.user;
    } else if (
      mode === 'create' &&
      typeof (dto as { userId?: string }).userId === 'string'
    ) {
      data.userId = (dto as { userId: string }).userId;
    }

    if (Object.hasOwn(dto, 'brand')) {
      data.brandId = dto.brand ?? null;
    } else if (Object.hasOwn(dto, 'brandId')) {
      data.brandId = (dto as { brandId?: string | null }).brandId ?? null;
    }

    if (Object.hasOwn(dto, 'goalId')) {
      data.goalId = dto.goalId ?? null;
    }

    if (Object.hasOwn(dto, 'isActive')) {
      data.isActive = dto.isActive;
    }

    if (Object.hasOwn(dto, 'agentType')) {
      data.agentType = dto.agentType ?? null;
    }

    if (Object.hasOwn(dto, 'platforms')) {
      data.platforms = Array.isArray(dto.platforms) ? dto.platforms : [];
    }

    for (const key of CONFIG_BACKED_KEYS) {
      if (Object.hasOwn(dto, key)) {
        config[key] = (dto as Record<string, unknown>)[key];
      }
    }

    for (const key of POLICIES_BACKED_KEYS) {
      if (Object.hasOwn(dto, key)) {
        policies[key] = (dto as Record<string, unknown>)[key];
      }
    }

    const suppliedConfig = this.readRecord(dto.config);
    const suppliedPolicies = this.readRecord(dto.policies);

    if (
      mode === 'create' ||
      suppliedConfig ||
      CONFIG_BACKED_KEYS.some((key) => Object.hasOwn(dto, key))
    ) {
      data.config = suppliedConfig ? { ...config, ...suppliedConfig } : config;
    }

    if (
      mode === 'create' ||
      suppliedPolicies ||
      POLICIES_BACKED_KEYS.some((key) => Object.hasOwn(dto, key))
    ) {
      data.policies = suppliedPolicies
        ? { ...policies, ...suppliedPolicies }
        : policies;
    }

    return data;
  }

  private readRecord(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }
}
