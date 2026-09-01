import {
  AgentAutonomyMode,
  AgentRunFrequency,
  AgentThreadStatus,
} from '@genfeedai/enums';
import { toPrismaJson } from '@genfeedai/prisma';
import { scopedWhere } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { Inject, Injectable } from '@nestjs/common';
import { AgentGoalsService } from '@server/collections/agent-goals/services/agent-goals.service';
import { AgentThreadsService } from '@server/collections/agent-threads/services/agent-threads.service';
import { CreditsUtilsService } from '@server/collections/credits/services/credits.utils.service';
import { OrganizationSettingsService } from '@server/collections/organization-settings/services/organization-settings.service';
import { AUTOMATION_WORKFLOW_IDS } from '@server/collections/workflows/services/automation-workflow-definitions';
import type { SystemWorkflowRunnerService } from '@server/collections/workflows/system-workflow-runner.service';
import { SYSTEM_WORKFLOW_RUNNER } from '@server/collections/workflows/workflows.tokens';
import { CacheService } from '@server/services/cache/cache.service';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';

type AgentAutopilotWorkflowAction =
  typeof AUTOMATION_WORKFLOW_IDS.AGENT_PROACTIVE;

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

type AgentStrategySnapshot = {
  brandId?: string;
  config: AgentStrategyConfig;
  goalId?: string;
  id: string;
  label?: string;
  organizationId: string;
  userId: string;
};

export interface AgentAutopilotWorkflowResult {
  action: AgentAutopilotWorkflowAction;
  executionIds?: string[];
  enqueued: number;
  generated: number;
  organizationId: string;
  reason?: string;
  skipped: number;
  status: 'completed' | 'enqueued' | 'skipped';
  workflowExecutionId?: string;
  workflowId?: string;
  workflowRunId?: string;
}

export interface AgentWorkflowHandoffContext {
  workflowExecutionId?: string;
  workflowId?: string;
  workflowNodeId?: string;
  workflowNodeType?: string;
  workflowRunId?: string;
}

const MAX_CONSECUTIVE_FAILURES = 5;
const MAX_STRATEGIES_PER_CYCLE = 20;
const FAILURES_BEFORE_PAUSE = 3;
const FAILURE_RETRY_MINUTES = 30;
const PROACTIVE_LOCK_TTL_SECONDS = 900;

@Injectable()
export class AgentAutopilotWorkflowService {
  private readonly logContext = 'AgentAutopilotWorkflowService';

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentThreadsService: AgentThreadsService,
    @Inject(SYSTEM_WORKFLOW_RUNNER)
    private readonly workflowRunner: SystemWorkflowRunnerService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly agentGoalsService: AgentGoalsService,
    private readonly cacheService: CacheService,
    private readonly logger: LoggerService,
  ) {}

  async beginProactiveStrategies(
    organizationId: string,
  ): Promise<Record<string, unknown>> {
    const lockKey = this.lockKey(organizationId);
    const acquired = await this.cacheService.acquireLock(
      lockKey,
      PROACTIVE_LOCK_TTL_SECONDS,
    );
    return {
      acquired,
      lockKey,
      organizationId,
      ...(!acquired ? { reason: 'proactive_agent_already_running' } : {}),
    };
  }

  async discoverCreditResetStrategies(
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (this.readRecord(input.state).acquired !== true) {
      return { baseInput: { organizationId }, items: [] };
    }
    const now = new Date();
    const strategies = await this.prisma.agentStrategy.findMany({
      select: {
        brandId: true,
        config: true,
        goalId: true,
        id: true,
        label: true,
        organizationId: true,
        userId: true,
      },
      where: scopedWhere(organizationId, { isActive: true }),
    });
    return {
      baseInput: { now: now.toISOString(), organizationId },
      items: strategies
        .map((strategy) => this.toStrategySnapshot(strategy))
        .filter((strategy) => this.requiresCreditReset(strategy, now)),
    };
  }

  async resetCreditWindow(
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const strategy = this.readStrategySnapshot(input.item);
    const now = new Date(this.requiredString(input.now, 'now'));
    const config = this.readConfig(strategy);
    const updatedConfig: AgentStrategyConfig = { ...config };

    const dailyResetAt = this.parseDate(config.dailyResetAt);
    if (!dailyResetAt || dailyResetAt <= now) {
      const nextDailyReset = this.getNextDailyReset();
      updatedConfig.creditsUsedToday = 0;
      updatedConfig.dailyCreditsUsed = 0;
      updatedConfig.dailyResetAt = nextDailyReset.toISOString();
      updatedConfig.dailyCreditResetAt = nextDailyReset.toISOString();
    }

    const weeklyResetAt = this.parseDate(config.weeklyResetAt);
    if (!weeklyResetAt || weeklyResetAt <= now) {
      updatedConfig.creditsUsedThisWeek = 0;
      updatedConfig.weeklyResetAt = this.getNextWeeklyReset().toISOString();
    }

    await this.prisma.agentStrategy.update({
      data: { config: toPrismaJson(updatedConfig) },
      where: scopedWhere(organizationId, { id: strategy.id }),
    });
    return { status: 'reset', strategyId: strategy.id };
  }

  async discoverProactiveStrategies(
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const state = this.readRecord(input.state);
    if (state.acquired !== true) {
      return { baseInput: { organizationId }, items: [], organizationId };
    }
    const now = new Date();
    const strategies = await this.prisma.agentStrategy.findMany({
      select: {
        brandId: true,
        config: true,
        goalId: true,
        id: true,
        label: true,
        organizationId: true,
        userId: true,
      },
      take: MAX_STRATEGIES_PER_CYCLE * 5,
      where: scopedWhere(organizationId, { isActive: true }),
    });
    const items = strategies
      .map((strategy) => this.toStrategySnapshot(strategy))
      .filter((strategy) => this.isDueStrategy(strategy, now))
      .slice(0, MAX_STRATEGIES_PER_CYCLE);
    return { baseInput: { organizationId }, items, organizationId };
  }

  async dispatchProactiveStrategy(
    input: Record<string, unknown>,
    workflowHandoff?: AgentWorkflowHandoffContext,
  ): Promise<Record<string, unknown>> {
    const strategy = this.readStrategySnapshot(input.item);
    const executionId = await this.executeStrategy(strategy, workflowHandoff);
    return { executionId, status: executionId ? 'enqueued' : 'skipped' };
  }

  async finalizeProactiveStrategies(
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<AgentAutopilotWorkflowResult> {
    const state = this.readRecord(input.state);
    const results = this.readBatchResults(input.batch);
    if (state.acquired === true) {
      await this.cacheService.releaseLock(this.lockKey(organizationId));
    }
    if (state.acquired !== true) {
      return this.skipped(
        AUTOMATION_WORKFLOW_IDS.AGENT_PROACTIVE,
        organizationId,
        'proactive_agent_already_running',
        0,
      );
    }
    const executionIds = results
      .map((entry) => this.readRecord(entry.result).executionId)
      .filter(
        (executionId): executionId is string => typeof executionId === 'string',
      );
    return this.result(
      AUTOMATION_WORKFLOW_IDS.AGENT_PROACTIVE,
      organizationId,
      executionIds.length,
      0,
      results.length - executionIds.length,
      results.length === 0 ? 'no_due_strategies' : undefined,
      undefined,
      executionIds,
    );
  }

  async failProactiveStrategies(
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const state = this.readRecord(input.state);
    if (state.acquired === true) {
      await this.cacheService.releaseLock(this.lockKey(organizationId));
    }
    return { organizationId, released: state.acquired === true };
  }

  private isDueStrategy(strategy: AgentStrategySnapshot, now: Date): boolean {
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
    strategy: AgentStrategySnapshot,
    workflowHandoff?: AgentWorkflowHandoffContext,
  ): Promise<string | null> {
    const organizationId = strategy.organizationId;
    const userId = strategy.userId;
    const strategyId = strategy.id;
    const config = this.readConfig(strategy);

    const organizationSettings = await this.organizationSettingsService.findOne(
      {
        organizationId: organizationId,
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
      return null;
    }

    const creditsUsedThisWeek = config.creditsUsedThisWeek ?? 0;
    if (creditsUsedThisWeek >= weeklyCreditBudget) {
      await this.scheduleNextRun(strategyId, config.runFrequency);
      return null;
    }

    if (brandDailyCap && strategy.brandId) {
      const brandCreditsUsedToday = await this.getBrandCreditsUsedToday(
        organizationId,
        strategy.brandId,
      );

      if (brandCreditsUsedToday >= brandDailyCap) {
        await this.scheduleNextRun(strategyId, config.runFrequency);
        return null;
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
      return null;
    }

    const remainingBudget = Math.min(
      effectiveDailyBudget - dailyCreditsUsed,
      weeklyCreditBudget - creditsUsedThisWeek,
    );
    const objective = await this.buildSyntheticUserMessage(strategy);

    try {
      const thread = await this.agentThreadsService.create({
        brandId: strategy.brandId ?? undefined,
        organizationId: organizationId,
        source: 'proactive',
        status: AgentThreadStatus.ACTIVE,
        title: `Proactive · ${strategy.label ?? strategyId}`,
        userId: userId,
      });
      const { executionId } = await this.workflowRunner.enqueueWorkflow({
        actionType: 'agent.turn.execute',
        canonicalId: 'agent.turn.execute',
        inputValues: {
          request: {
            content: objective,
            creditBudget: remainingBudget,
            strategyId,
            threadId: String(thread.id),
            ...(config.agentType ? { agentType: config.agentType } : {}),
            ...(config.autonomyMode
              ? { autonomyMode: config.autonomyMode }
              : {}),
            ...(strategy.brandId ? { brandId: strategy.brandId } : {}),
            ...(config.model ? { model: config.model } : {}),
          },
        },
        metadata: {
          ...(this.buildExecutionMetadata(strategy, workflowHandoff) ?? {}),
          label: `Proactive: ${strategy.label}`,
          source: 'proactive',
          strategyId,
          threadId: String(thread.id),
        },
        organizationId,
        source: 'AgentAutopilotWorkflowService.executeStrategy',
        userId,
      });

      await this.scheduleNextRun(strategyId, config.runFrequency);
      return executionId;
    } catch (error) {
      await this.recordStrategyFailure(strategy, config, error);
      return null;
    }
  }

  private async recordStrategyFailure(
    strategy: AgentStrategySnapshot,
    config: AgentStrategyConfig,
    error: unknown,
  ): Promise<void> {
    const newFailureCount = (config.consecutiveFailures ?? 0) + 1;
    const updatedConfig: AgentStrategyConfig = {
      ...config,
      consecutiveFailures: newFailureCount,
    };

    await this.prisma.agentStrategy.update({
      data: {
        config: toPrismaJson(updatedConfig),
        ...(newFailureCount >= FAILURES_BEFORE_PAUSE
          ? { isActive: false }
          : {}),
      },
      where: scopedWhere(strategy.organizationId, { id: strategy.id }),
    });

    if (newFailureCount >= MAX_CONSECUTIVE_FAILURES) {
      await this.prisma.agentStrategy.update({
        data: {
          config: toPrismaJson({
            ...updatedConfig,
            requiresManualReactivation: true,
          }),
        },
        where: scopedWhere(strategy.organizationId, { id: strategy.id }),
      });
    }

    await this.scheduleNextRun(
      strategy.id,
      config.runFrequency,
      FAILURE_RETRY_MINUTES,
    );
    this.logger.error(`${this.logContext} strategy execution failed`, {
      error,
      organizationId: strategy.organizationId,
      strategyId: strategy.id,
    });
  }

  private buildExecutionMetadata(
    strategy: AgentStrategySnapshot,
    workflowHandoff?: AgentWorkflowHandoffContext,
  ): Record<string, unknown> | undefined {
    const workflowHandoffMetadata =
      this.buildWorkflowHandoffMetadata(workflowHandoff);

    if (!workflowHandoffMetadata) {
      return undefined;
    }

    return {
      workflowHandoff: {
        ...workflowHandoffMetadata,
        agentStrategyId: strategy.id,
      },
    };
  }

  private buildWorkflowHandoffMetadata(
    workflowHandoff?: AgentWorkflowHandoffContext,
  ): Record<string, string> | null {
    if (!workflowHandoff) {
      return null;
    }

    const entries = Object.entries(workflowHandoff).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === 'string' && entry[1].length > 0,
    );

    return entries.length > 0 ? Object.fromEntries(entries) : null;
  }

  private async buildSyntheticUserMessage(
    strategy: AgentStrategySnapshot,
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

  private requiresCreditReset(
    strategy: AgentStrategySnapshot,
    now: Date,
  ): boolean {
    const config = this.readConfig(strategy);
    const dailyResetAt = this.parseDate(config.dailyResetAt);
    const weeklyResetAt = this.parseDate(config.weeklyResetAt);
    return (
      !dailyResetAt ||
      dailyResetAt <= now ||
      !weeklyResetAt ||
      weeklyResetAt <= now
    );
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
        config: toPrismaJson({
          ...existingConfig,
          nextRunAt: nextRun.toISOString(),
        }),
      },
      where: scopedWhere(record.organizationId, { id: strategyId }),
    });
  }

  private async getBrandCreditsUsedToday(
    organizationId: string,
    brandId: string,
  ): Promise<number> {
    const strategies = await this.prisma.agentStrategy.findMany({
      select: {
        brandId: true,
        config: true,
        goalId: true,
        id: true,
        label: true,
        organizationId: true,
        userId: true,
      },
      where: scopedWhere(organizationId, { brandId }),
    });

    return strategies
      .map((strategy) => this.toStrategySnapshot(strategy))
      .reduce((sum, strategy) => {
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
    workflowHandoff?: AgentWorkflowHandoffContext,
    executionIds: string[] = [],
  ): AgentAutopilotWorkflowResult {
    if (enqueued === 0 && generated === 0) {
      return this.skipped(
        action,
        organizationId,
        emptyReason ?? 'no_agent_autopilot_work_enqueued',
        skipped,
        workflowHandoff,
      );
    }

    return {
      action,
      ...(executionIds.length > 0 ? { executionIds } : {}),
      enqueued,
      generated,
      organizationId,
      skipped,
      status: enqueued > 0 ? 'enqueued' : 'completed',
      ...this.buildWorkflowResultMetadata(workflowHandoff),
    };
  }

  private skipped(
    action: AgentAutopilotWorkflowAction,
    organizationId: string,
    reason: string,
    skipped: number = 0,
    workflowHandoff?: AgentWorkflowHandoffContext,
  ): AgentAutopilotWorkflowResult {
    return {
      action,
      enqueued: 0,
      generated: 0,
      organizationId,
      reason,
      skipped,
      status: 'skipped',
      ...this.buildWorkflowResultMetadata(workflowHandoff),
    };
  }

  private buildWorkflowResultMetadata(
    workflowHandoff?: AgentWorkflowHandoffContext,
  ): Pick<
    AgentAutopilotWorkflowResult,
    'workflowExecutionId' | 'workflowId' | 'workflowRunId'
  > {
    return {
      ...(workflowHandoff?.workflowExecutionId
        ? { workflowExecutionId: workflowHandoff.workflowExecutionId }
        : {}),
      ...(workflowHandoff?.workflowId
        ? { workflowId: workflowHandoff.workflowId }
        : {}),
      ...(workflowHandoff?.workflowRunId
        ? { workflowRunId: workflowHandoff.workflowRunId }
        : {}),
    };
  }

  private readConfig(strategy: AgentStrategySnapshot): AgentStrategyConfig {
    return strategy.config ?? {};
  }

  private readStrategySnapshot(value: unknown): AgentStrategySnapshot {
    const strategy = this.readRecord(value);
    return {
      config: this.readRecord(strategy.config) as AgentStrategyConfig,
      id: this.requiredString(strategy.id, 'strategy.id'),
      organizationId: this.requiredString(
        strategy.organizationId,
        'strategy.organizationId',
      ),
      userId: this.requiredString(strategy.userId, 'strategy.userId'),
      ...(typeof strategy.brandId === 'string'
        ? { brandId: strategy.brandId }
        : {}),
      ...(typeof strategy.goalId === 'string'
        ? { goalId: strategy.goalId }
        : {}),
      ...(typeof strategy.label === 'string' ? { label: strategy.label } : {}),
    };
  }

  private toStrategySnapshot(strategy: {
    brandId: string | null;
    config: unknown;
    goalId: string | null;
    id: string;
    label: string | null;
    organizationId: string;
    userId: string;
  }): AgentStrategySnapshot {
    return {
      config: this.readRecord(strategy.config) as AgentStrategyConfig,
      id: strategy.id,
      organizationId: strategy.organizationId,
      userId: strategy.userId,
      ...(strategy.brandId ? { brandId: strategy.brandId } : {}),
      ...(strategy.goalId ? { goalId: strategy.goalId } : {}),
      ...(strategy.label ? { label: strategy.label } : {}),
    };
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

  private lockKey(organizationId: string): string {
    return `workflow-agent-autopilot:${AUTOMATION_WORKFLOW_IDS.AGENT_PROACTIVE}:${organizationId}`;
  }

  private readBatchResults(value: unknown): Array<{ result?: unknown }> {
    const batch = this.readRecord(value);
    return Array.isArray(batch.results)
      ? (batch.results as Array<{ result?: unknown }>)
      : [];
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private requiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`${field} is required`);
    }
    return value;
  }
}
