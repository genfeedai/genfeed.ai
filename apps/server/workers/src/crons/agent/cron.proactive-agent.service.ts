import { AgentGoalsService } from '@api/collections/agent-goals/services/agent-goals.service';
import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import {
  AgentStrategy,
  type AgentStrategyDocument,
} from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { AgentRunQueueService } from '@api/queues/agent-run/agent-run-queue.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import {
  AgentAutonomyMode,
  AgentExecutionTrigger,
  AgentRunFrequency,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';

const MAX_CONSECUTIVE_FAILURES = 5;
const MAX_STRATEGIES_PER_CYCLE = 20;
const FAILURES_BEFORE_PAUSE = 3;
const FAILURE_RETRY_MINUTES = 30;

@Injectable()
export class CronProactiveAgentService {
  private static readonly LOCK_KEY = 'cron:proactive-agent';
  private static readonly LOCK_TTL_SECONDS = 900; // 15 minutes

  constructor(
    @InjectModel(AgentStrategy.name, DB_CONNECTIONS.AGENT)
    private readonly agentStrategyModel: Model<AgentStrategyDocument>,
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

      // Find strategies that are due to run
      const dueStrategies = await this.agentStrategyModel
        .find({
          consecutiveFailures: { $lt: MAX_CONSECUTIVE_FAILURES },
          isActive: true,
          isDeleted: false,
          nextRunAt: { $lte: now },
          requiresManualReactivation: { $ne: true },
        })
        .limit(MAX_STRATEGIES_PER_CYCLE)
        .exec();

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
            `Strategy ${strategy._id} failed: ${message}`,
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
    strategy: AgentStrategyDocument,
  ): Promise<void> {
    const orgId = strategy.organization.toString();
    const userId = strategy.user.toString();
    const strategyId = String(strategy._id);
    const organizationSettings = await this.organizationSettingsService.findOne(
      {
        isDeleted: false,
        organization: new Types.ObjectId(orgId),
      },
    );
    const orgAgentDailyCap =
      organizationSettings?.agentPolicy?.creditGovernance
        ?.agentDailyCreditCap ?? null;
    const brandDailyCap =
      organizationSettings?.agentPolicy?.creditGovernance
        ?.brandDailyCreditCap ?? null;
    const effectiveDailyBudget = orgAgentDailyCap
      ? Math.min(strategy.dailyCreditBudget, orgAgentDailyCap)
      : strategy.dailyCreditBudget;

    // Budget check
    const dailyCreditsUsed = Math.max(
      strategy.creditsUsedToday || 0,
      strategy.dailyCreditsUsed || 0,
    );

    if (dailyCreditsUsed >= effectiveDailyBudget) {
      this.logger.log(
        `Strategy ${strategyId} daily budget exhausted (${dailyCreditsUsed}/${effectiveDailyBudget})`,
        'CronProactiveAgentService',
      );
      await this.scheduleNextRun(strategyId, strategy.runFrequency);
      return;
    }

    if (strategy.creditsUsedThisWeek >= strategy.weeklyCreditBudget) {
      this.logger.log(
        `Strategy ${strategyId} weekly budget exhausted (${strategy.creditsUsedThisWeek}/${strategy.weeklyCreditBudget})`,
        'CronProactiveAgentService',
      );
      await this.scheduleNextRun(strategyId, strategy.runFrequency);
      return;
    }

    if (brandDailyCap && strategy.brand) {
      const brandCreditsUsedToday = await this.getBrandCreditsUsedToday(
        orgId,
        strategy.brand.toString(),
      );

      if (brandCreditsUsedToday >= brandDailyCap) {
        this.logger.log(
          `Brand ${strategy.brand.toString()} daily cap exhausted (${brandCreditsUsedToday}/${brandDailyCap}) for strategy ${strategyId}`,
          'CronProactiveAgentService',
        );
        await this.scheduleNextRun(strategyId, strategy.runFrequency);
        return;
      }
    }

    // Check org has enough credits (min threshold)
    const orgBalance =
      await this.creditsUtilsService.getOrganizationCreditsBalance(orgId);

    const minCreditThreshold = strategy.minCreditThreshold || 50;
    if (orgBalance < minCreditThreshold) {
      this.logger.warn(
        `Organization ${orgId} credits below threshold (${orgBalance} < ${minCreditThreshold}) — pausing strategy ${strategyId}`,
        'CronProactiveAgentService',
      );
      // Auto-pause the strategy
      await this.agentStrategyModel.updateOne(
        { _id: strategy._id },
        { $set: { isActive: false } },
      );
      return;
    }

    const remainingBudget = Math.min(
      effectiveDailyBudget - dailyCreditsUsed,
      strategy.weeklyCreditBudget - strategy.creditsUsedThisWeek,
    );

    // Build the synthetic user message for the objective
    const userMessage = await this.buildSyntheticUserMessage(strategy);

    try {
      // Create agent-runs record
      const run = await this.agentRunsService.create({
        creditBudget: remainingBudget,
        label: `Proactive: ${strategy.label}`,
        objective: userMessage,
        organization: strategy.organization,
        strategy: strategy._id as unknown as import('mongoose').Types.ObjectId,
        trigger: AgentExecutionTrigger.CRON,
        user: strategy.user,
      });

      // Enqueue for async processing instead of direct execution
      await this.agentRunQueueService.queueRun({
        agentType: strategy.agentType,
        autonomyMode: strategy.autonomyMode,
        creditBudget: remainingBudget,
        model: strategy.model,
        objective: userMessage,
        organizationId: orgId,
        runId: String(run._id),
        strategyId,
        userId,
      });

      // Strategy state updates (recordRun, consecutiveFailures reset) happen
      // in the processor after actual execution — not here at queue time.
      // See: agent-run.processor.ts (fix for #420)

      await this.scheduleNextRun(strategyId, strategy.runFrequency);

      this.logger.log(
        `Strategy ${strategyId} queued as agent run ${String(run._id)}`,
        'CronProactiveAgentService',
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      // Increment failure counter
      const newFailureCount = strategy.consecutiveFailures + 1;
      const shouldPause = newFailureCount >= FAILURES_BEFORE_PAUSE;

      await this.agentStrategyModel.updateOne(
        { _id: strategy._id },
        {
          $inc: { consecutiveFailures: 1 },
          ...(shouldPause ? { $set: { isActive: false } } : {}),
        },
      );

      if (shouldPause) {
        this.logger.warn(
          `Strategy ${strategyId} paused after ${newFailureCount} consecutive failures`,
          'CronProactiveAgentService',
        );

        if (newFailureCount >= MAX_CONSECUTIVE_FAILURES) {
          await this.agentStrategyModel.updateOne(
            { _id: strategy._id },
            { $set: { requiresManualReactivation: true } },
          );
        }
      }

      await this.scheduleNextRun(
        strategyId,
        strategy.runFrequency,
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
  private buildProactiveSystemPrompt(strategy: AgentStrategyDocument): string {
    const remainingDaily = Math.max(
      0,
      strategy.dailyCreditBudget - strategy.creditsUsedToday,
    );

    const contentMix = strategy.contentMix;
    const mixDescription = contentMix
      ? `${contentMix.imagePercent}% images, ${contentMix.videoPercent}% videos, ${contentMix.carouselPercent}% carousels`
      : 'default mix';

    const engagementSection = strategy.engagementEnabled
      ? `
ENGAGEMENT CONFIG:
- Keywords: ${strategy.engagementKeywords.join(', ')}
- Tone: ${strategy.engagementTone || 'professional'}
- Max per day: ${strategy.maxEngagementsPerDay}`
      : '';

    return `You are the GenFeed Proactive Agent running autonomously for an organization.

STRATEGY: ${strategy.label}
TOPICS: ${strategy.topics.join(', ')}
VOICE: ${strategy.voice || 'Professional and engaging'}
PLATFORMS: ${strategy.platforms.join(', ')}
TARGET: ${strategy.postsPerWeek} posts/week
CONTENT MIX: ${mixDescription}
CREDIT BUDGET REMAINING TODAY: ${remainingDaily}
${engagementSection}

TASKS (priority order):
1. Use get_content_calendar to see what's scheduled and find gaps
2. Use analyze_performance to understand what content works best
3. Use get_top_ingredients to identify the most-voted ingredients in the organization
4. When top-voted ingredients exist, use replicate_top_ingredient and create variations before net-new generation
5. Use generate_content_batch to fill weekly content gaps (target: ${strategy.postsPerWeek} posts/week)
${strategy.engagementEnabled ? '6. Use discover_engagements to find relevant posts to engage with\n7. Use draft_engagement_reply to create replies for the best opportunities' : ''}
8. Use get_approval_summary to check pending items
9. Use update_strategy_state to record what you accomplished

AUTONOMY MODE: ${strategy.autonomyMode === AgentAutonomyMode.AUTO_PUBLISH ? 'AUTO-PUBLISH — content above confidence threshold is published directly' : 'SUPERVISED — ALL content goes to the review queue, never publish directly'}

RULES:
- Stay within the credit budget (${remainingDaily} credits remaining today)
- Use the brand voice consistently: ${strategy.voice || 'professional'}
- Be efficient — accomplish as much as possible within budget
- If budget is nearly exhausted, prioritize content generation over engagement

Today's date: {{date}}`;
  }

  /**
   * Build the synthetic user message that triggers the proactive session
   */
  private async buildSyntheticUserMessage(
    strategy: AgentStrategyDocument,
  ): Promise<string> {
    const tasks: string[] = [
      'Check the content calendar for gaps this week',
      `Generate content to maintain ${strategy.postsPerWeek} posts/week cadence`,
    ];

    if (strategy.goalId) {
      const goalSummary = await this.agentGoalsService.getGoalSummary(
        String(strategy.goalId),
        String(strategy.organization),
      );
      tasks.push(`Advance the linked goal: ${goalSummary}`);
    }

    if (strategy.engagementEnabled) {
      tasks.push(
        `Find engagement opportunities for keywords: ${strategy.engagementKeywords.join(', ')}`,
        'Draft replies for the most relevant opportunities',
      );
    }

    tasks.push('Summarize what you accomplished');

    return `Run proactive session for strategy "${strategy.label}". Tasks:\n${tasks.map((t, i) => `${i + 1}. ${t}`).join('\n')}`;
  }

  /**
   * Calculate and set the next run time based on frequency
   */
  private async scheduleNextRun(
    strategyId: string,
    frequency: AgentRunFrequency,
    retryInMinutes?: number,
  ): Promise<void> {
    const now = new Date();
    let nextRun: Date;

    if (retryInMinutes && retryInMinutes > 0) {
      nextRun = new Date(now.getTime() + retryInMinutes * 60 * 1000);
      await this.agentStrategyModel.updateOne(
        { _id: strategyId },
        { $set: { nextRunAt: nextRun } },
      );
      return;
    }

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

    await this.agentStrategyModel.updateOne(
      { _id: strategyId },
      { $set: { nextRunAt: nextRun } },
    );
  }

  /**
   * Reset daily/weekly credit counters for strategies past their reset window
   */
  private async resetCreditCounters(): Promise<void> {
    const now = new Date();

    // Reset daily counters (includes strategies with unset dailyResetAt)
    await this.agentStrategyModel.updateMany(
      {
        $or: [
          { dailyResetAt: { $lte: now } },
          { dailyResetAt: { $exists: false } },
          { dailyResetAt: null },
        ],
        isActive: true,
        isDeleted: false,
      },
      {
        $set: {
          creditsUsedToday: 0,
          dailyCreditResetAt: this.getNextDailyReset(),
          dailyCreditsUsed: 0,
          dailyResetAt: this.getNextDailyReset(),
        },
      },
    );

    // Reset weekly counters (includes strategies with unset weeklyResetAt)
    await this.agentStrategyModel.updateMany(
      {
        $or: [
          { weeklyResetAt: { $lte: now } },
          { weeklyResetAt: { $exists: false } },
          { weeklyResetAt: null },
        ],
        isActive: true,
        isDeleted: false,
      },
      {
        $set: {
          creditsUsedThisWeek: 0,
          weeklyResetAt: this.getNextWeeklyReset(),
        },
      },
    );
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
    const results = await this.agentStrategyModel.aggregate<{
      totalCreditsUsedToday?: number;
    }>([
      {
        $match: {
          brand: new Types.ObjectId(brandId),
          isDeleted: false,
          organization: new Types.ObjectId(organizationId),
        },
      },
      {
        $group: {
          _id: null,
          totalCreditsUsedToday: {
            $sum: {
              $max: [
                { $ifNull: ['$creditsUsedToday', 0] },
                { $ifNull: ['$dailyCreditsUsed', 0] },
              ],
            },
          },
        },
      },
    ]);

    return results[0]?.totalCreditsUsedToday ?? 0;
  }
}
