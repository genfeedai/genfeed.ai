import { CreateAgentStrategyDto } from '@api/collections/agent-strategies/dto/create-agent-strategy.dto';
import { UpdateAgentStrategyDto } from '@api/collections/agent-strategies/dto/update-agent-strategy.dto';
import {
  AgentStrategy,
  type AgentStrategyDocument,
} from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { AgentRunStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Injectable()
export class AgentStrategiesService extends BaseService<
  AgentStrategyDocument,
  CreateAgentStrategyDto,
  UpdateAgentStrategyDto
> {
  constructor(
    @InjectModel(AgentStrategy.name, DB_CONNECTIONS.AGENT)
    model: AggregatePaginateModel<AgentStrategyDocument>,
    logger: LoggerService,
  ) {
    super(model, logger);
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
      _id: new Types.ObjectId(id),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
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
    await this.model.updateOne(
      // @ts-expect-error TS2769
      { _id: new Types.ObjectId(id) },
      {
        $inc: {
          creditsUsedThisWeek: run.creditsUsed,
          creditsUsedToday: run.creditsUsed,
          dailyCreditsUsed: run.creditsUsed,
          monthToDateCreditsUsed: run.creditsUsed,
        },
        $push: {
          runHistory: {
            $each: [run],
            $slice: -50,
          },
        },
        $set: {
          lastRunAt: run.completedAt,
        },
      },
    );
  }

  /**
   * Increment consecutiveFailures and return the new count.
   * Used by the processor after a run fails.
   */
  async incrementFailures(id: string): Promise<number> {
    const result = await (
      this.model as unknown as {
        findOneAndUpdate: (
          filter: unknown,
          update: unknown,
          options: unknown,
        ) => Promise<AgentStrategyDocument | null>;
      }
    ).findOneAndUpdate(
      { _id: new Types.ObjectId(id) },
      { $inc: { consecutiveFailures: 1 } },
      { returnDocument: 'after' },
    );

    return result?.consecutiveFailures ?? 0;
  }

  /**
   * Reset consecutiveFailures to 0.
   * Used by the processor after a successful run.
   */
  async resetFailures(id: string): Promise<void> {
    await this.model.updateOne(
      // @ts-expect-error TS2769
      { _id: new Types.ObjectId(id) },
      { $set: { consecutiveFailures: 0 } },
    );
  }

  /**
   * Pause a strategy — sets isActive=false and clears nextRunAt.
   * Used for auto-pause after consecutive failures.
   */
  async pauseStrategy(id: string): Promise<void> {
    await this.model.updateOne(
      // @ts-expect-error TS2769
      { _id: new Types.ObjectId(id) },
      { $set: { isActive: false, nextRunAt: null } },
    );
  }

  /**
   * Find all enabled strategies for scheduler queries.
   * Only returns strategies that are both isEnabled and not deleted.
   */
  async findEnabledStrategies(
    filter: Record<string, unknown> = {},
  ): Promise<AgentStrategyDocument[]> {
    return this.model.find({
      isDeleted: false,
      isEnabled: true,
      ...filter,
    });
  }

  /**
   * Mark strategy for manual reactivation after repeated failures.
   */
  async requireManualReactivation(id: string): Promise<void> {
    await this.model.updateOne(
      // @ts-expect-error TS2769
      { _id: new Types.ObjectId(id) },
      {
        $set: {
          isActive: false,
          nextRunAt: null,
          requiresManualReactivation: true,
        },
      },
    );
  }
}
