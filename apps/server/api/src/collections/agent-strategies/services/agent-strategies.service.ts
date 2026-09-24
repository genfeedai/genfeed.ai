import { getAgentTypeWorkflowDefault } from '@api/collections/agent-strategies/constants/agent-type-workflow-defaults.constant';
import { CreateAgentStrategyDto } from '@api/collections/agent-strategies/dto/create-agent-strategy.dto';
import { UpdateAgentStrategyDto } from '@api/collections/agent-strategies/dto/update-agent-strategy.dto';
import type { AgentStrategyDocument } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { ValidationException } from '@api/exceptions/validation.exception';
import type { PrismaTransactionClient } from '@api/helpers/utils/transaction/transaction.util';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  BaseService,
  type PopulateInput,
} from '@api/shared/services/base/base.service';
import { AgentStrategyRunStatus } from '@genfeedai/contracts';
import { Prisma, toPrismaJson } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

type AgentStrategyWriteDto = Partial<
  Omit<
    CreateAgentStrategyDto & UpdateAgentStrategyDto,
    'lastRunAt' | 'nextRunAt'
  >
> & {
  config?: unknown;
  consecutiveFailures?: number;
  creditsUsedThisWeek?: number;
  creditsUsedToday?: number;
  dailyCreditsUsed?: number;
  lastRunAt?: Date | null;
  monthToDateCreditsUsed?: number;
  nextRunAt?: Date | null;
  organizationId?: string;
  policies?: unknown;
  requiresManualReactivation?: boolean;
  reserveTrendBudgetRemaining?: number;
  runHistory?: unknown;
  userId?: string;
};

export type AgentStrategyCreateInput = CreateAgentStrategyDto & {
  organizationId: string;
  userId: string;
};

/**
 * Prisma `AgentStrategy` stores domain extension fields in `config` and
 * `policies`. This service owns both decoding and encoding those JSON columns.
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

/** First-class columns — not config JSON. */
const COLUMN_BACKED_KEYS = [
  'preferredWorkflowId',
  'preferredWorkflowTemplateId',
  'workflowInputOverrides',
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

  protected override normalizeDocument(
    document: unknown,
  ): AgentStrategyDocument {
    const record = super.normalizeDocument(document) as Record<string, unknown>;
    const config = this.readRecord(record.config) ?? {};
    const policies = this.readRecord(record.policies) ?? {};
    const normalized = { ...config, ...policies, ...record };

    return {
      ...normalized,
      platforms: Array.isArray(normalized.platforms)
        ? normalized.platforms
        : [],
      runHistory: Array.isArray(normalized.runHistory)
        ? normalized.runHistory
        : [],
      skillSlugs: Array.isArray(normalized.skillSlugs)
        ? normalized.skillSlugs
        : [],
      topics: Array.isArray(normalized.topics) ? normalized.topics : [],
      workflowInputOverrides: normalizeWorkflowInputOverrides(
        normalized.workflowInputOverrides,
      ),
    } as AgentStrategyDocument;
  }

  /**
   * Create strategy with scheduler defaults.
   * If strategy starts active, queue first run immediately.
   */
  override async create(
    createDto: AgentStrategyCreateInput,
    populate: PopulateInput = [],
  ): Promise<AgentStrategyDocument> {
    return super.create(
      this.buildCreateWriteData(createDto) as unknown as CreateAgentStrategyDto,
      populate,
    );
  }

  /** Create through an existing transaction while preserving all defaults. */
  async createWithClient(
    createDto: AgentStrategyCreateInput,
    client: PrismaTransactionClient,
  ): Promise<AgentStrategyDocument> {
    const document = await client.agentStrategy.create({
      data: this.buildCreateWriteData(
        createDto,
      ) as Prisma.AgentStrategyUncheckedCreateInput,
    });

    return this.normalizeDocument(document);
  }

  private buildCreateWriteData(
    createDto: AgentStrategyCreateInput,
  ): Record<string, unknown> {
    const now = new Date();
    // Pin deterministic graph on create when client omits binding (wizard/autopilot).
    const typeDefault = getAgentTypeWorkflowDefault(createDto.agentType);
    const preferredWorkflowTemplateId =
      typeof createDto.preferredWorkflowTemplateId === 'string' &&
      createDto.preferredWorkflowTemplateId.trim()
        ? createDto.preferredWorkflowTemplateId.trim()
        : (typeDefault?.templateId ?? undefined);
    const skillSlugs =
      createDto.skillSlugs === undefined
        ? typeDefault?.skillSlugs
        : createDto.skillSlugs;

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
      ...(preferredWorkflowTemplateId ? { preferredWorkflowTemplateId } : {}),
      ...(skillSlugs !== undefined ? { skillSlugs } : {}),
      // Defaults for counters that live in config
      weeklyCreditBudget:
        createDto.weeklyCreditBudget ?? (createDto.dailyCreditBudget ?? 0) * 5,
      consecutiveFailures: 0,
      creditsUsedThisWeek: 0,
      creditsUsedToday: 0,
      dailyCreditsUsed: 0,
      isEnabled: createDto.isEnabled ?? true,
      monthToDateCreditsUsed: 0,
      runHistory: [],
    };

    return this.toPrismaWriteData(payload, 'create');
  }

  override async patch(
    id: string,
    updateDto: Partial<UpdateAgentStrategyDto>,
    populate: PopulateInput = [],
  ): Promise<AgentStrategyDocument> {
    if (!id) throw new ValidationException('Document ID is required');
    if (!updateDto || typeof updateDto !== 'object')
      throw new ValidationException('Update data is required');
    return this.prisma.$transaction(async (transaction) => {
      await lockAgentStrategy(transaction, id);
      // tenant-scope-ignore: the collection controller authorizes the opaque strategy id; resolve its organization before the scoped write
      const existing = await transaction.agentStrategy.findFirst({
        where: { id, isDeleted: false },
      });
      if (!existing) throw new NotFoundException('Agent strategy', id);
      const existingConfig = this.readRecord(existing.config) ?? {};
      const existingPolicies = this.readRecord(existing.policies) ?? {};
      const data = this.toPrismaWriteData(
        {
          ...updateDto,
          weeklyCreditBudget:
            updateDto.weeklyCreditBudget ??
            (updateDto.dailyCreditBudget !== undefined
              ? updateDto.dailyCreditBudget * 5
              : Number(
                  existingConfig.weeklyCreditBudget ??
                    Number(existingConfig.dailyCreditBudget ?? 0) * 5,
                )),
        } as AgentStrategyWriteDto,
        'update',
        existingConfig,
        existingPolicies,
      );
      const include = this.populateToInclude(populate);
      return this.normalizeDocument(
        await transaction.agentStrategy.update({
          ...(include ? { include } : {}),
          where: scopedWhere(existing.organizationId, { id }),
          data: this.normalizeData(data) as Prisma.AgentStrategyUpdateInput,
        }),
      );
    });
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
      status: AgentStrategyRunStatus;
      creditsUsed: number;
      contentGenerated: number;
      executionId?: string;
      threadId?: string;
    },
    organizationId: string,
    client?: Prisma.TransactionClient,
  ): Promise<void> {
    const record = async (
      transaction: Prisma.TransactionClient,
    ): Promise<void> => {
      await lockAgentStrategy(transaction, id);
      const current = await transaction.agentStrategy.findFirst({
        where: { id, organizationId, isDeleted: false },
      });
      if (!current) return;
      const config = this.readRecord(current.config) ?? {};
      const history = Array.isArray(config.runHistory) ? config.runHistory : [];
      const failures =
        run.status === AgentStrategyRunStatus.FAILED
          ? Number(config.consecutiveFailures ?? 0) + 1
          : 0;
      await transaction.agentStrategy.update({
        where: { id, organizationId, isDeleted: false },
        data: {
          ...(failures >= 3 ? { isActive: false } : {}),
          config: toPrismaJson({
            ...config,
            consecutiveFailures: failures,
            ...(failures >= 3 ? { nextRunAt: null } : {}),
            ...(failures >= 5 ? { requiresManualReactivation: true } : {}),
            creditsUsedThisWeek: new Prisma.Decimal(
              Number(config.creditsUsedThisWeek ?? 0),
            )
              .plus(run.creditsUsed)
              .toNumber(),
            creditsUsedToday: new Prisma.Decimal(
              Number(config.creditsUsedToday ?? 0),
            )
              .plus(run.creditsUsed)
              .toNumber(),
            dailyCreditsUsed: new Prisma.Decimal(
              Number(config.dailyCreditsUsed ?? 0),
            )
              .plus(run.creditsUsed)
              .toNumber(),
            monthToDateCreditsUsed: new Prisma.Decimal(
              Number(config.monthToDateCreditsUsed ?? 0),
            )
              .plus(run.creditsUsed)
              .toNumber(),
            lastRunAt: run.completedAt.toISOString(),
            runHistory: [
              ...history,
              {
                ...run,
                startedAt: run.startedAt.toISOString(),
                completedAt: run.completedAt.toISOString(),
              },
            ].slice(-50),
          }),
        },
      });
    };
    if (client) await record(client);
    else await this.prisma.$transaction(record);
  }

  /**
   * Increment consecutiveFailures and return the new count.
   * Used by the processor after a run fails.
   */
  async incrementFailures(id: string): Promise<number> {
    const config = await this.mutateConfig(id, (latest) => ({
      config: {
        ...latest,
        consecutiveFailures: Number(latest.consecutiveFailures ?? 0) + 1,
      },
    }));
    return Number(config?.consecutiveFailures ?? 0);
  }

  /**
   * Reset consecutiveFailures to 0.
   * Used by the processor after a successful run.
   */
  async resetFailures(id: string): Promise<void> {
    await this.mutateConfig(id, (config) => ({
      config: { ...config, consecutiveFailures: 0 },
    }));
  }

  /**
   * Pause a strategy — sets isActive=false and clears nextRunAt.
   * Used for auto-pause after consecutive failures.
   */
  async pauseStrategy(id: string): Promise<void> {
    await this.mutateConfig(id, (config) => ({
      config: { ...config, nextRunAt: null },
      isActive: false,
    }));
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
    await this.mutateConfig(id, (config) => ({
      config: { ...config, nextRunAt: null, requiresManualReactivation: true },
      isActive: false,
    }));
  }

  private async mutateConfig(
    id: string,
    mutate: (config: Record<string, unknown>) => {
      config: Record<string, unknown>;
      isActive?: boolean;
    },
  ): Promise<Record<string, unknown> | null> {
    return this.prisma.$transaction(async (transaction) => {
      await lockAgentStrategy(transaction, id);
      // tenant-scope-ignore: internal callers supply an authorized opaque strategy id; resolve its tenant under the lock before the scoped update
      const current = await transaction.agentStrategy.findFirst({
        where: { id, isDeleted: false },
      });
      if (!current) return null;
      const data = mutate(this.readRecord(current.config) ?? {});
      await transaction.agentStrategy.update({
        where: { id, organizationId: current.organizationId, isDeleted: false },
        data: { ...data, config: toPrismaJson(data.config) },
      });
      return data.config;
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

    if (typeof dto.organizationId === 'string') {
      data.organizationId = dto.organizationId;
    }

    if (typeof dto.userId === 'string') {
      data.userId = dto.userId;
    }

    if (Object.hasOwn(dto, 'brandId')) {
      data.brandId = dto.brandId ?? null;
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

    for (const key of COLUMN_BACKED_KEYS) {
      if (!Object.hasOwn(dto, key)) {
        continue;
      }
      const value = (dto as Record<string, unknown>)[key];
      if (key === 'workflowInputOverrides') {
        data.workflowInputOverrides = normalizeWorkflowInputOverrides(value);
        continue;
      }
      data[key] =
        typeof value === 'string' && value.trim() ? value.trim() : null;
      // Keep config clean if a legacy write still carries these keys.
      delete config[key];
      delete config.workflowInputDefaults;
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

function normalizeWorkflowInputOverrides(
  value: unknown,
): Array<{ key: string; value: string | number | boolean }> {
  if (!Array.isArray(value)) {
    return [];
  }

  const out: Array<{ key: string; value: string | number | boolean }> = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const key = typeof record.key === 'string' ? record.key.trim() : '';
    if (!key) {
      continue;
    }
    const raw = record.value;
    if (
      typeof raw === 'string' ||
      typeof raw === 'number' ||
      typeof raw === 'boolean'
    ) {
      out.push({ key, value: raw });
    }
  }
  return out.slice(0, 40);
}

export async function lockAgentStrategy(
  transaction: Prisma.TransactionClient,
  strategyId: string,
): Promise<void> {
  const key = `agent-strategy-config:${strategyId}`;
  await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
}
