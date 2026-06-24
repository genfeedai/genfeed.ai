import { AgentGoalsService } from '@api/collections/agent-goals/services/agent-goals.service';
import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { AgentRunQueueService } from '@api/queues/agent-run/agent-run-queue.service';
import { AiInfluencerService } from '@api/services/ai-influencer/ai-influencer.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  AgentAutonomyMode,
  AgentExecutionTrigger,
  AgentRunFrequency,
} from '@genfeedai/enums';
import type { AgentStrategy } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

type AgentAutopilotWorkflowAction =
  | 'proactiveAgentStrategies'
  | 'aiInfluencerDailyPosts';

type ContentMixConfig = {
  carouselPercent: number;
  imagePercent: number;
  videoPercent: number;
};

type AgentStrategyConfig = {
  agentType?: string;
  autonomyMode?: AgentAutonomyMode;
  contentMix?: ContentMixConfig;
  consecutiveFailures?: number;
  creditsUsedThisWeek?: number;
  creditsUsedToday?: number;
  dailyCreditBudget?: number;
  dailyCreditResetAt?: string;
  dailyCreditsUsed?: number;
  dailyResetAt?: string;
  engagementEnabled?: boolean;
  engagementKeywords?: string[];
  engagementTone?: string;
  maxEngagementsPerDay?: number;
  minCreditThreshold?: number;
  model?: string;
  nextRunAt?: string;
  platforms?: string[];
  postsPerWeek?: number;
  requiresManualReactivation?: boolean;
  runFrequency?: AgentRunFrequency;
  topics?: string[];
  voice?: string;
  weeklyCreditBudget?: number;
  weeklyResetAt?: string;
};

type AgentStrategyWithConfig = AgentStrategy & {
  config: AgentStrategyConfig;
};

export interface AgentAutopilotWorkflowResult {
  action: AgentAutopilotWorkflowAction;
  enqueued: number;
  generated: number;
  organizationId: string;
  reason?: string;
  skipped: number;
  status: 'completed' | 'enqueued' | 'skipped';
}

const MAX_CONSECUTIVE_FAILURES = 5;
const MAX_STRATEGIES_PER_CYCLE = 20;
const FAILURES_BEFORE_PAUSE = 3;
const FAILURE_RETRY_MINUTES = 30;
const PROACTIVE_LOCK_TTL_SECONDS = 900;
const AI_INFLUENCER_LOCK_TTL_SECONDS = 1800;

@Injectable()
export class AgentAutopilotWorkflowService {
  private readonly logContext = 'AgentAutopilotWorkflowService';

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentRunsService: AgentRunsService,
    private readonly agentRunQueueService: AgentRunQueueService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly agentGoalsService: AgentGoalsService,
    private readonly aiInfluencerService: AiInfluencerService,
    private readonly cacheService: CacheService,
    private readonly logger: LoggerService,
  ) {}

  async runProactiveStrategies(
    organizationId: string,
  ): Promise<AgentAutopilotWorkflowResult> {
    const action: AgentAutopilotWorkflowAction = 'proactiveAgentStrategies';
    const lockKey = this.lockKey(action, organizationId);
    const acquired = await this.cacheService.acquireLock(
      lockKey,
      PROACTIVE_LOCK_TTL_SECONDS,
    );

    if (!acquired) {
      return this.skipped(
        action,
        organizationId,
        'proactive_agent_already_running',
      );
    }

    try {
      await this.resetCreditCounters(organizationId);

      const now = new Date();
      const strategies = (await this.prisma.agentStrategy.findMany({
        take: MAX_STRATEGIES_PER_CYCLE * 5,
        where: {
          isActive: true,
          isDeleted: false,
          organizationId,
        },
      })) as AgentStrategyWithConfig[];

      const dueStrategies = strategies
        .filter((strategy) => this.isDueStrategy(strategy, now))
        .slice(0, MAX_STRATEGIES_PER_CYCLE);

      let enqueued = 0;
      let skipped = 0;

      for (const strategy of dueStrategies) {
        const queued = await this.executeStrategy(strategy);
        if (queued) {
          enqueued++;
        } else {
          skipped++;
        }
      }

      return this.result(
        action,
        organizationId,
        enqueued,
        0,
        skipped,
        dueStrategies.length === 0 ? 'no_due_strategies' : undefined,
      );
    } catch (error) {
      this.logger.error(`${this.logContext} proactive agent cycle failed`, {
        error,
        organizationId,
      });
      return this.skipped(
        action,
        organizationId,
        'proactive_agent_cycle_failed',
      );
    } finally {
      await this.cacheService.releaseLock(lockKey);
    }
  }

  async runAiInfluencerDailyPosts(
    organizationId: string,
  ): Promise<AgentAutopilotWorkflowResult> {
    const action: AgentAutopilotWorkflowAction = 'aiInfluencerDailyPosts';
    const lockKey = this.lockKey(action, organizationId);
    const acquired = await this.cacheService.acquireLock(
      lockKey,
      AI_INFLUENCER_LOCK_TTL_SECONDS,
    );

    if (!acquired) {
      return this.skipped(
        action,
        organizationId,
        'ai_influencer_already_running',
      );
    }

    try {
      const results = await this.aiInfluencerService.scheduleDailyPosts({
        organizationId,
      });

      return this.result(
        action,
        organizationId,
        0,
        results.length,
        0,
        results.length === 0 ? 'no_ai_influencer_posts_generated' : undefined,
      );
    } catch (error) {
      this.logger.error(`${this.logContext} AI influencer cycle failed`, {
        error,
        organizationId,
      });
      return this.skipped(action, organizationId, 'ai_influencer_cycle_failed');
    } finally {
      await this.cacheService.releaseLock(lockKey);
    }
  }

  private isDueStrategy(strategy: AgentStrategyWithConfig, now: Date): boolean {
    const config = this.readConfig(strategy);
    const consecutiveFailures = config.consecutiveFailures ?? 0;
    const requiresManualReactivation =
      config.requiresManualReactivation ?? false;
    const nextRunAt = this.parseDate(config.nextRunAt);

    return (
      consecutiveFailures < MAX_CONSECUTIVE_FAILURES &&
      !requiresManualReactivation &&
      (!nextRunAt || nextRunAt <= now)
    );
  }

  private async executeStrategy(
    strategy: AgentStrategyWithConfig,
  ): Promise<boolean> {
    const organizationId = strategy.organizationId;
    const userId = strategy.userId;
    const strategyId = strategy.id;
    const config = this.readConfig(strategy);

    const organizationSettings = await this.organizationSettingsService.findOne(
      {
        isDeleted: false,
        organization: organizationId,
      },
    );
    const orgAgentDailyCap =
      organizationSettings?.agentPolicy?.creditGovernance
        ?.agentDailyCreditCap ?? null;
    const brandDailyCap =
      organizationSettings?.agentPolicy?.creditGovernance
        ?.brandDailyCreditCap ?? null;

    const dailyCreditBudget = config.dailyCreditBudget ?? 0;
    const weeklyCreditBudget = config.weeklyCreditBudget ?? 0;
    const effectiveDailyBudget = orgAgentDailyCap
      ? Math.min(dailyCreditBudget, orgAgentDailyCap)
      : dailyCreditBudget;

    const dailyCreditsUsed = Math.max(
      config.creditsUsedToday ?? 0,
      config.dailyCreditsUsed ?? 0,
    );

    if (dailyCreditsUsed >= effectiveDailyBudget) {
      await this.scheduleNextRun(strategyId, config.runFrequency);
      return false;
    }

    const creditsUsedThisWeek = config.creditsUsedThisWeek ?? 0;
    if (creditsUsedThisWeek >= weeklyCreditBudget) {
      await this.scheduleNextRun(strategyId, config.runFrequency);
      return false;
    }

    if (brandDailyCap && strategy.brandId) {
      const brandCreditsUsedToday = await this.getBrandCreditsUsedToday(
        organizationId,
        strategy.brandId,
      );

      if (brandCreditsUsedToday >= brandDailyCap) {
        await this.scheduleNextRun(strategyId, config.runFrequency);
        return false;
      }
    }

    const orgBalance =
      await this.creditsUtilsService.getOrganizationCreditsBalance(
        organizationId,
      );

    const minCreditThreshold = config.minCreditThreshold ?? 50;
    if (orgBalance < minCreditThreshold) {
      await this.prisma.agentStrategy.update({
        data: { isActive: false },
        where: { id: strategyId },
      });
      return false;
    }

    const remainingBudget = Math.min(
      effectiveDailyBudget - dailyCreditsUsed,
      weeklyCreditBudget - creditsUsedThisWeek,
    );
    const objective = await this.buildSyntheticUserMessage(strategy);

    try {
      const run = await this.agentRunsService.create({
        creditBudget: remainingBudget,
        label: `Proactive: ${strategy.label}`,
        objective,
        organization: organizationId,
        strategy: strategyId,
        trigger: AgentExecutionTrigger.CRON,
        user: userId,
      });

      await this.agentRunQueueService.queueRun({
        agentType: config.agentType,
        autonomyMode: config.autonomyMode,
        creditBudget: remainingBudget,
        model: config.model,
        objective,
        organizationId,
        runId: run.id,
        strategyId,
        userId,
      });

      await this.scheduleNextRun(strategyId, config.runFrequency);
      return true;
    } catch (error) {
      const consecutiveFailures = config.consecutiveFailures ?? 0;
      const newFailureCount = consecutiveFailures + 1;
      const shouldPause = newFailureCount >= FAILURES_BEFORE_PAUSE;
      const updatedConfig: AgentStrategyConfig = {
        ...config,
        consecutiveFailures: newFailureCount,
      };

      await this.prisma.agentStrategy.update({
        data: {
          config: updatedConfig as never,
          ...(shouldPause ? { isActive: false } : {}),
        },
        where: { id: strategyId },
      });

      if (newFailureCount >= MAX_CONSECUTIVE_FAILURES) {
        await this.prisma.agentStrategy.update({
          data: {
            config: {
              ...updatedConfig,
              requiresManualReactivation: true,
            } as never,
          },
          where: { id: strategyId },
        });
      }

      await this.scheduleNextRun(
        strategyId,
        config.runFrequency,
        FAILURE_RETRY_MINUTES,
      );

      this.logger.error(`${this.logContext} strategy execution failed`, {
        error,
        organizationId,
        strategyId,
      });
      return false;
    }
  }

  private async buildSyntheticUserMessage(
    strategy: AgentStrategyWithConfig,
  ): Promise<string> {
    const config = this.readConfig(strategy);
    const tasks: string[] = [
      'Check the content calendar for gaps this week',
      `Generate content to maintain ${config.postsPerWeek ?? 0} posts/week cadence`,
    ];

    if (strategy.goalId) {
      const goalSummary = await this.agentGoalsService.getGoalSummary(
        strategy.goalId,
        strategy.organizationId,
      );
      tasks.push(`Advance the linked goal: ${goalSummary}`);
    }

    if (config.engagementEnabled) {
      tasks.push(
        `Find engagement opportunities for keywords: ${(config.engagementKeywords ?? []).join(', ')}`,
        'Draft replies for the most relevant opportunities',
      );
    }

    tasks.push('Summarize what you accomplished');

    return `Run proactive session for strategy "${strategy.label ?? ''}". Tasks:\n${tasks.map((task, index) => `${index + 1}. ${task}`).join('\n')}`;
  }

  private async resetCreditCounters(organizationId: string): Promise<void> {
    const now = new Date();
    const strategies = (await this.prisma.agentStrategy.findMany({
      where: {
        isActive: true,
        isDeleted: false,
        organizationId,
      },
    })) as AgentStrategyWithConfig[];

    for (const strategy of strategies) {
      const config = this.readConfig(strategy);
      let updated = false;
      const updatedConfig: AgentStrategyConfig = { ...config };

      const dailyResetAt = this.parseDate(config.dailyResetAt);
      if (!dailyResetAt || dailyResetAt <= now) {
        const nextDailyReset = this.getNextDailyReset();
        updatedConfig.creditsUsedToday = 0;
        updatedConfig.dailyCreditsUsed = 0;
        updatedConfig.dailyResetAt = nextDailyReset.toISOString();
        updatedConfig.dailyCreditResetAt = nextDailyReset.toISOString();
        updated = true;
      }

      const weeklyResetAt = this.parseDate(config.weeklyResetAt);
      if (!weeklyResetAt || weeklyResetAt <= now) {
        updatedConfig.creditsUsedThisWeek = 0;
        updatedConfig.weeklyResetAt = this.getNextWeeklyReset().toISOString();
        updated = true;
      }

      if (updated) {
        await this.prisma.agentStrategy.update({
          data: { config: updatedConfig as never },
          where: { id: strategy.id },
        });
      }
    }
  }

  private async scheduleNextRun(
    strategyId: string,
    frequency: AgentRunFrequency | undefined,
    retryInMinutes?: number,
  ): Promise<void> {
    const now = new Date();
    let nextRun: Date;

    if (retryInMinutes && retryInMinutes > 0) {
      nextRun = new Date(now.getTime() + retryInMinutes * 60 * 1000);
    } else {
      switch (frequency) {
        case AgentRunFrequency.EVERY_6_HOURS:
          nextRun = new Date(now.getTime() + 6 * 60 * 60 * 1000);
          break;
        case AgentRunFrequency.TWICE_DAILY:
          nextRun = new Date(now.getTime() + 12 * 60 * 60 * 1000);
          break;
        default:
          nextRun = new Date(now.getTime() + 24 * 60 * 60 * 1000);
          break;
      }
    }

    const record = await this.prisma.agentStrategy.findFirst({
      where: { id: strategyId },
    });
    if (!record) {
      return;
    }

    const existingConfig = (record.config ?? {}) as AgentStrategyConfig;
    await this.prisma.agentStrategy.update({
      data: {
        config: {
          ...existingConfig,
          nextRunAt: nextRun.toISOString(),
        } as never,
      },
      where: { id: strategyId },
    });
  }

  private async getBrandCreditsUsedToday(
    organizationId: string,
    brandId: string,
  ): Promise<number> {
    const strategies = (await this.prisma.agentStrategy.findMany({
      where: {
        brandId,
        isDeleted: false,
        organizationId,
      },
    })) as AgentStrategyWithConfig[];

    return strategies.reduce((sum, strategy) => {
      const config = this.readConfig(strategy);
      return (
        sum +
        Math.max(config.creditsUsedToday ?? 0, config.dailyCreditsUsed ?? 0)
      );
    }, 0);
  }

  private result(
    action: AgentAutopilotWorkflowAction,
    organizationId: string,
    enqueued: number,
    generated: number,
    skipped: number,
    emptyReason?: string,
  ): AgentAutopilotWorkflowResult {
    if (enqueued === 0 && generated === 0) {
      return this.skipped(
        action,
        organizationId,
        emptyReason ?? 'no_agent_autopilot_work_enqueued',
        skipped,
      );
    }

    return {
      action,
      enqueued,
      generated,
      organizationId,
      skipped,
      status: enqueued > 0 ? 'enqueued' : 'completed',
    };
  }

  private skipped(
    action: AgentAutopilotWorkflowAction,
    organizationId: string,
    reason: string,
    skipped: number = 0,
  ): AgentAutopilotWorkflowResult {
    return {
      action,
      enqueued: 0,
      generated: 0,
      organizationId,
      reason,
      skipped,
      status: 'skipped',
    };
  }

  private readConfig(strategy: AgentStrategyWithConfig): AgentStrategyConfig {
    return strategy.config ?? {};
  }

  private parseDate(value: unknown): Date | null {
    if (typeof value !== 'string' && !(value instanceof Date)) {
      return null;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private getNextDailyReset(): Date {
    const next = new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(0, 0, 0, 0);
    return next;
  }

  private getNextWeeklyReset(): Date {
    const next = new Date();
    const dayOfWeek = next.getDay();
    const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
    next.setDate(next.getDate() + daysUntilMonday);
    next.setHours(0, 0, 0, 0);
    return next;
  }

  private lockKey(
    action: AgentAutopilotWorkflowAction,
    organizationId: string,
  ): string {
    return `workflow-agent-autopilot:${action}:${organizationId}`;
  }
}
