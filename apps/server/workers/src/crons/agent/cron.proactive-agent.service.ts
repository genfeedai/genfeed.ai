import { AgentGoalsService } from '@api/collections/agent-goals/services/agent-goals.service';
import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { AgentRunQueueService } from '@api/queues/agent-run/agent-run-queue.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  AgentAutonomyMode,
  AgentExecutionTrigger,
  AgentRunFrequency,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { AgentStrategy } from '@prisma/client';

const MAX_CONSECUTIVE_FAILURES = 5;
const MAX_STRATEGIES_PER_CYCLE = 20;
const FAILURES_BEFORE_PAUSE = 3;
const FAILURE_RETRY_MINUTES = 30;

type ContentMixConfig = {
  imagePercent: number;
  videoPercent: number;
  carouselPercent: number;
};

type AgentStrategyConfig = {
  agentType?: string;
  autonomyMode?: AgentAutonomyMode;
  topics?: string[];
  voice?: string;
  platforms?: string[];
  postsPerWeek?: number;
  contentMix?: ContentMixConfig;
  runFrequency?: AgentRunFrequency;
  dailyCreditBudget?: number;
  weeklyCreditBudget?: number;
  minCreditThreshold?: number;
  creditsUsedToday?: number;
  dailyCreditsUsed?: number;
  creditsUsedThisWeek?: number;
  dailyResetAt?: string;
  weeklyResetAt?: string;
  dailyCreditResetAt?: string;
  nextRunAt?: string;
  consecutiveFailures?: number;
  requiresManualReactivation?: boolean;
  engagementEnabled?: boolean;
  engagementKeywords?: string[];
  engagementTone?: string;
  maxEngagementsPerDay?: number;
  model?: string;
};

type AgentStrategyWithConfig = AgentStrategy & { config: AgentStrategyConfig };

@Injectable()
export class CronProactiveAgentService {
  private static readonly LOCK_KEY = 'cron:proactive-agent';
  private static readonly LOCK_TTL_SECONDS = 900; // 15 minutes

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentRunsService: AgentRunsService,
    private readonly agentRunQueueService: AgentRunQueueService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly agentGoalsService: AgentGoalsService,
    private readonly cacheService: CacheService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Main cron entry point — runs every minute
   * Finds due strategies and executes proactive agent runs
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async processProactiveStrategies(): Promise<void> {
    const acquired = await this.cacheService.acquireLock(
      CronProactiveAgentService.LOCK_KEY,
      CronProactiveAgentService.LOCK_TTL_SECONDS,
    );

    if (!acquired) {
      this.logger.debug(
        'Proactive agent cron already running (lock held), skipping',
        'CronProactiveAgentService',
      );
      return;
    }

    const startTime = Date.now();

    try {
      this.logger.log(
        'Starting proactive agent cycle',
        'CronProactiveAgentService',
      );

      // Reset daily/weekly credit counters where needed
      await this.resetCreditCounters();

      const now = new Date();

      // Fetch active, non-deleted strategies; filter in-memory for nextRunAt and budget/failure constraints
      const allActive = (await this.prisma.agentStrategy.findMany({
        take: MAX_STRATEGIES_PER_CYCLE * 5, // over-fetch to compensate for in-memory filter
        where: {
          isActive: true,
          isDeleted: false,
        },
      })) as AgentStrategyWithConfig[];

      const dueStrategies = allActive
        .filter((s) => {
          const cfg = (s.config ?? {}) as AgentStrategyConfig;
          const consecutiveFailures = cfg.consecutiveFailures ?? 0;
          const requiresManualReactivation =
            cfg.requiresManualReactivation ?? false;
          const nextRunAt = cfg.nextRunAt ? new Date(cfg.nextRunAt) : null;
          return (
            consecutiveFailures < MAX_CONSECUTIVE_FAILURES &&
            !requiresManualReactivation &&
            (!nextRunAt || nextRunAt <= now)
          );
        })
        .slice(0, MAX_STRATEGIES_PER_CYCLE);

      this.logger.log(
        `Found ${dueStrategies.length} strategies due for execution`,
        'CronProactiveAgentService',
      );

      for (const strategy of dueStrategies) {
        try {
          await this.executeStrategy(strategy);
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(
            `Strategy ${strategy.id} failed: ${message}`,
            'CronProactiveAgentService',
          );
        }
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `Proactive agent cycle completed in ${duration}ms (${dueStrategies.length} strategies)`,
        'CronProactiveAgentService',
      );
    } catch (error: unknown) {
      this.logger.error(
        'Proactive agent cycle failed',
        error,
        'CronProactiveAgentService',
      );
    } finally {
      await this.cacheService.releaseLock(CronProactiveAgentService.LOCK_KEY);
    }
  }

  /**
   * Execute a single strategy — build prompt, call orchestrator, record results
   */
  private async executeStrategy(
    strategy: AgentStrategyWithConfig,
  ): Promise<void> {
    const orgId = strategy.organizationId;
    const userId = strategy.userId;
    const strategyId = strategy.id;
    const cfg = (strategy.config ?? {}) as AgentStrategyConfig;

    const organizationSettings = await this.organizationSettingsService.findOne(
      {
        isDeleted: false,
        organization: orgId,
      },
    );
    const orgAgentDailyCap =
      organizationSettings?.agentPolicy?.creditGovernance
        ?.agentDailyCreditCap ?? null;
    const brandDailyCap =
      organizationSettings?.agentPolicy?.creditGovernance
        ?.brandDailyCreditCap ?? null;

    const dailyCreditBudget = cfg.dailyCreditBudget ?? 0;
    const weeklyCreditBudget = cfg.weeklyCreditBudget ?? 0;
    const effectiveDailyBudget = orgAgentDailyCap
      ? Math.min(dailyCreditBudget, orgAgentDailyCap)
      : dailyCreditBudget;

    // Budget check
    const dailyCreditsUsed = Math.max(
      cfg.creditsUsedToday ?? 0,
      cfg.dailyCreditsUsed ?? 0,
    );

    if (dailyCreditsUsed >= effectiveDailyBudget) {
      this.logger.log(
        `Strategy ${strategyId} daily budget exhausted (${dailyCreditsUsed}/${effectiveDailyBudget})`,
        'CronProactiveAgentService',
      );
      await this.scheduleNextRun(strategyId, cfg.runFrequency);
      return;
    }

    const creditsUsedThisWeek = cfg.creditsUsedThisWeek ?? 0;
    if (creditsUsedThisWeek >= weeklyCreditBudget) {
      this.logger.log(
        `Strategy ${strategyId} weekly budget exhausted (${creditsUsedThisWeek}/${weeklyCreditBudget})`,
        'CronProactiveAgentService',
      );
      await this.scheduleNextRun(strategyId, cfg.runFrequency);
      return;
    }

    if (brandDailyCap && strategy.brandId) {
      const brandCreditsUsedToday = await this.getBrandCreditsUsedToday(
        orgId,
        strategy.brandId,
      );

      if (brandCreditsUsedToday >= brandDailyCap) {
        this.logger.log(
          `Brand ${strategy.brandId} daily cap exhausted (${brandCreditsUsedToday}/${brandDailyCap}) for strategy ${strategyId}`,
          'CronProactiveAgentService',
        );
        await this.scheduleNextRun(strategyId, cfg.runFrequency);
        return;
      }
    }

    // Check org has enough credits (min threshold)
    const orgBalance =
      await this.creditsUtilsService.getOrganizationCreditsBalance(orgId);

    const minCreditThreshold = cfg.minCreditThreshold ?? 50;
    if (orgBalance < minCreditThreshold) {
      this.logger.warn(
        `Organization ${orgId} credits below threshold (${orgBalance} < ${minCreditThreshold}) — pausing strategy ${strategyId}`,
        'CronProactiveAgentService',
      );
      // Auto-pause the strategy
      const updatedCfg: AgentStrategyConfig = { ...cfg };
      await this.prisma.agentStrategy.update({
        data: { isActive: false },
        where: { id: strategyId },
      });
      return;
    }

    const remainingBudget = Math.min(
      effectiveDailyBudget - dailyCreditsUsed,
      weeklyCreditBudget - creditsUsedThisWeek,
    );

    // Build the synthetic user message for the objective
    const userMessage = await this.buildSyntheticUserMessage(strategy);

    try {
      // Create agent-runs record
      const run = await this.agentRunsService.create({
        creditBudget: remainingBudget,
        label: `Proactive: ${strategy.label}`,
        objective: userMessage,
        organization: orgId,
        strategy: strategyId,
        trigger: AgentExecutionTrigger.CRON,
        user: userId,
      });

      // Enqueue for async processing instead of direct execution
      await this.agentRunQueueService.queueRun({
        agentType: cfg.agentType,
        autonomyMode: cfg.autonomyMode,
        creditBudget: remainingBudget,
        model: cfg.model,
        objective: userMessage,
        organizationId: orgId,
        runId: run.id,
        strategyId,
        userId,
      });

      // Strategy state updates (recordRun, consecutiveFailures reset) happen
      // in the processor after actual execution — not here at queue time.
      // See: agent-run.processor.ts (fix for #420)

      await this.scheduleNextRun(strategyId, cfg.runFrequency);

      this.logger.log(
        `Strategy ${strategyId} queued as agent run ${run.id}`,
        'CronProactiveAgentService',
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      // Increment failure counter
      const consecutiveFailures = cfg.consecutiveFailures ?? 0;
      const newFailureCount = consecutiveFailures + 1;
      const shouldPause = newFailureCount >= FAILURES_BEFORE_PAUSE;

      const updatedCfg: AgentStrategyConfig = {
        ...cfg,
        consecutiveFailures: newFailureCount,
      };

      await this.prisma.agentStrategy.update({
        data: {
          config: updatedCfg as never,
          ...(shouldPause ? { isActive: false } : {}),
        },
        where: { id: strategyId },
      });

      if (shouldPause) {
        this.logger.warn(
          `Strategy ${strategyId} paused after ${newFailureCount} consecutive failures`,
          'CronProactiveAgentService',
        );

        if (newFailureCount >= MAX_CONSECUTIVE_FAILURES) {
          const cfgWithReactivation: AgentStrategyConfig = {
            ...updatedCfg,
            requiresManualReactivation: true,
          };
          await this.prisma.agentStrategy.update({
            data: { config: cfgWithReactivation as never },
            where: { id: strategyId },
          });
        }
      }

      await this.scheduleNextRun(
        strategyId,
        cfg.runFrequency,
        FAILURE_RETRY_MINUTES,
      );

      this.logger.error(
        `Strategy ${strategyId} execution failed: ${message}`,
        'CronProactiveAgentService',
      );
    }
  }

  /**
   * Build the strategy-aware system prompt for the proactive agent
   */
  private buildProactiveSystemPrompt(
    strategy: AgentStrategyWithConfig,
  ): string {
    const cfg = (strategy.config ?? {}) as AgentStrategyConfig;
    const dailyCreditBudget = cfg.dailyCreditBudget ?? 0;
    const creditsUsedToday = cfg.creditsUsedToday ?? 0;
    const remainingDaily = Math.max(0, dailyCreditBudget - creditsUsedToday);

    const contentMix = cfg.contentMix;
    const mixDescription = contentMix
      ? `${contentMix.imagePercent}% images, ${contentMix.videoPercent}% videos, ${contentMix.carouselPercent}% carousels`
      : 'default mix';

    const engagementSection = cfg.engagementEnabled
      ? `
ENGAGEMENT CONFIG:
- Keywords: ${(cfg.engagementKeywords ?? []).join(', ')}
- Tone: ${cfg.engagementTone ?? 'professional'}
- Max per day: ${cfg.maxEngagementsPerDay ?? 0}`
      : '';

    return `You are the GenFeed Proactive Agent running autonomously for an organization.

STRATEGY: ${strategy.label ?? ''}
TOPICS: ${(cfg.topics ?? []).join(', ')}
VOICE: ${cfg.voice ?? 'Professional and engaging'}
PLATFORMS: ${(cfg.platforms ?? []).join(', ')}
TARGET: ${cfg.postsPerWeek ?? 0} posts/week
CONTENT MIX: ${mixDescription}
CREDIT BUDGET REMAINING TODAY: ${remainingDaily}
${engagementSection}

TASKS (priority order):
1. Use get_content_calendar to see what's scheduled and find gaps
2. Use analyze_performance to understand what content works best
3. Use get_top_ingredients to identify the most-voted ingredients in the organization
4. When top-voted ingredients exist, use replicate_top_ingredient and create variations before net-new generation
5. Use generate_content_batch to fill weekly content gaps (target: ${cfg.postsPerWeek ?? 0} posts/week)
${cfg.engagementEnabled ? '6. Use discover_engagements to find relevant posts to engage with\n7. Use draft_engagement_reply to create replies for the best opportunities' : ''}
8. Use get_approval_summary to check pending items
9. Use update_strategy_state to record what you accomplished

AUTONOMY MODE: ${cfg.autonomyMode === AgentAutonomyMode.AUTO_PUBLISH ? 'AUTO-PUBLISH — content above confidence threshold is published directly' : 'SUPERVISED — ALL content goes to the review queue, never publish directly'}

RULES:
- Stay within the credit budget (${remainingDaily} credits remaining today)
- Use the brand voice consistently: ${cfg.voice ?? 'professional'}
- Be efficient — accomplish as much as possible within budget
- If budget is nearly exhausted, prioritize content generation over engagement

Today's date: {{date}}`;
  }

  /**
   * Build the synthetic user message that triggers the proactive session
   */
  private async buildSyntheticUserMessage(
    strategy: AgentStrategyWithConfig,
  ): Promise<string> {
    const cfg = (strategy.config ?? {}) as AgentStrategyConfig;
    const tasks: string[] = [
      'Check the content calendar for gaps this week',
      `Generate content to maintain ${cfg.postsPerWeek ?? 0} posts/week cadence`,
    ];

    if (strategy.goalId) {
      const goalSummary = await this.agentGoalsService.getGoalSummary(
        strategy.goalId,
        strategy.organizationId,
      );
      tasks.push(`Advance the linked goal: ${goalSummary}`);
    }

    if (cfg.engagementEnabled) {
      tasks.push(
        `Find engagement opportunities for keywords: ${(cfg.engagementKeywords ?? []).join(', ')}`,
        'Draft replies for the most relevant opportunities',
      );
    }

    tasks.push('Summarize what you accomplished');

    return `Run proactive session for strategy "${strategy.label ?? ''}". Tasks:\n${tasks.map((t, i) => `${i + 1}. ${t}`).join('\n')}`;
  }

  /**
   * Calculate and set the next run time based on frequency
   */
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

    // Read current config, update nextRunAt, write back
    const record = await this.prisma.agentStrategy.findFirst({
      where: { id: strategyId },
    });
    if (!record) return;
    const existingCfg = (record.config ?? {}) as AgentStrategyConfig;
    const updatedCfg: AgentStrategyConfig = {
      ...existingCfg,
      nextRunAt: nextRun.toISOString(),
    };
    await this.prisma.agentStrategy.update({
      data: { config: updatedCfg as never },
      where: { id: strategyId },
    });
  }

  /**
   * Reset daily/weekly credit counters for strategies past their reset window
   */
  private async resetCreditCounters(): Promise<void> {
    const now = new Date();

    // Fetch all active, non-deleted strategies to reset in-memory (no JSON filter in Prisma)
    const strategies = (await this.prisma.agentStrategy.findMany({
      where: { isActive: true, isDeleted: false },
    })) as AgentStrategyWithConfig[];

    for (const strategy of strategies) {
      const cfg = (strategy.config ?? {}) as AgentStrategyConfig;
      let updated = false;
      const updatedCfg: AgentStrategyConfig = { ...cfg };

      // Reset daily counters
      const dailyResetAt = cfg.dailyResetAt ? new Date(cfg.dailyResetAt) : null;
      if (!dailyResetAt || dailyResetAt <= now) {
        updatedCfg.creditsUsedToday = 0;
        updatedCfg.dailyCreditsUsed = 0;
        updatedCfg.dailyResetAt = this.getNextDailyReset().toISOString();
        updatedCfg.dailyCreditResetAt = this.getNextDailyReset().toISOString();
        updated = true;
      }

      // Reset weekly counters
      const weeklyResetAt = cfg.weeklyResetAt
        ? new Date(cfg.weeklyResetAt)
        : null;
      if (!weeklyResetAt || weeklyResetAt <= now) {
        updatedCfg.creditsUsedThisWeek = 0;
        updatedCfg.weeklyResetAt = this.getNextWeeklyReset().toISOString();
        updated = true;
      }

      if (updated) {
        await this.prisma.agentStrategy.update({
          data: { config: updatedCfg as never },
          where: { id: strategy.id },
        });
      }
    }
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

    return strategies.reduce((sum, s) => {
      const cfg = (s.config ?? {}) as AgentStrategyConfig;
      return (
        sum + Math.max(cfg.creditsUsedToday ?? 0, cfg.dailyCreditsUsed ?? 0)
      );
    }, 0);
  }
}
