import { CreateAgentStrategyDto } from '@api/collections/agent-strategies/dto/create-agent-strategy.dto';
import { UpdateAgentStrategyDto } from '@api/collections/agent-strategies/dto/update-agent-strategy.dto';
import type { AgentStrategyDocument } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { AgentRunStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AgentStrategiesService extends BaseService<
  AgentStrategyDocument,
  CreateAgentStrategyDto,
  UpdateAgentStrategyDto
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
  async create(
    createDto: CreateAgentStrategyDto,
  ): Promise<AgentStrategyDocument> {
    const now = new Date();

    const payload: CreateAgentStrategyDto = {
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
    };

    return super.create(payload);
  }

  /**
   * Find strategy by ID and organization
   */
  findOneById(
    id: string,
    organizationId: string,
  ): Promise<AgentStrategyDocument | null> {
    return this.findOne({
      id,
      isDeleted: false,
      organizationId,
    });
  }

  /**
   * Toggle strategy active state
   */
  async toggleActive(
    id: string,
    organizationId: string,
  ): Promise<AgentStrategyDocument | null> {
    const strategy = await this.findOneById(id, organizationId);
    if (!strategy) {
      return null;
    }

    const now = new Date();
    const updateData: Record<string, unknown> = {
      isActive: !strategy.isActive,
    };

    // When activating, calculate nextRunAt
    if (!strategy.isActive) {
      updateData.nextRunAt = now;
      updateData.consecutiveFailures = 0;
      updateData.requiresManualReactivation = false;
    } else {
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

    const existingHistory = (current.runHistory as unknown[]) ?? [];
    // Keep last 50 entries
    const trimmedHistory = [...existingHistory, run].slice(-50);

    await this.delegate.update({
      where: { id },
      data: {
        creditsUsedThisWeek: { increment: run.creditsUsed },
        creditsUsedToday: { increment: run.creditsUsed },
        dailyCreditsUsed: { increment: run.creditsUsed },
        monthToDateCreditsUsed: { increment: run.creditsUsed },
        lastRunAt: run.completedAt,
        runHistory: trimmedHistory,
      },
    });
  }

  /**
   * Increment consecutiveFailures and return the new count.
   * Used by the processor after a run fails.
   */
  async incrementFailures(id: string): Promise<number> {
    const result = (await this.delegate.update({
      where: { id },
      data: { consecutiveFailures: { increment: 1 } },
    })) as AgentStrategyDocument | null;

    return (result?.consecutiveFailures as number) ?? 0;
  }

  /**
   * Reset consecutiveFailures to 0.
   * Used by the processor after a successful run.
   */
  async resetFailures(id: string): Promise<void> {
    await this.delegate.updateMany({
      where: { id },
      data: { consecutiveFailures: 0 },
    });
  }

  /**
   * Pause a strategy — sets isActive=false and clears nextRunAt.
   * Used for auto-pause after consecutive failures.
   */
  async pauseStrategy(id: string): Promise<void> {
    await this.delegate.updateMany({
      where: { id },
      data: { isActive: false, nextRunAt: null },
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
        isEnabled: true,
        ...filter,
      },
    }) as Promise<AgentStrategyDocument[]>;
  }

  /**
   * Mark strategy for manual reactivation after repeated failures.
   */
  async requireManualReactivation(id: string): Promise<void> {
    await this.delegate.updateMany({
      where: { id },
      data: {
        isActive: false,
        nextRunAt: null,
        requiresManualReactivation: true,
      },
    });
  }
}
