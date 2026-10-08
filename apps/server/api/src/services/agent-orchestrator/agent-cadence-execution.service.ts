import { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import { AgentStrategyAutopilotService } from '@api/collections/agent-strategies/services/agent-strategy-autopilot.service';
import type {
  CadenceDraftGenerator,
  OptimizerAnalysisResult,
} from '@api/collections/agent-strategies/services/agent-strategy-autopilot.types';
import {
  CadenceGenerationUnavailableError,
  resolveCadencePolicy,
} from '@api/collections/agent-strategies/services/agent-strategy-cadence.util';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OptimizersService } from '@api/collections/optimizers/services/optimizers.service';
import type { PostDocument } from '@api/collections/posts/post.schema';
import { PostsService } from '@api/collections/posts/services/posts.service';
import {
  currentWorkflowAccountingScope,
  runWithWorkflowAccounting,
} from '@api/collections/workflow-executions/services/workflow-accounting.context';
import type {
  AgentTurnWorkflowResult,
  PreparedAgentTurnState,
} from '@api/services/agent-orchestrator/agent-turn-workflow-execution.service';
import { AgentMediaTextGenerationService } from '@api/services/agent-orchestrator/tools/agent-media-text-generation.service';
import {
  ActivitySource,
  AgentStrategyRunStatus,
  ContentIntelligencePlatform,
  PostCategory,
  parsePlatform,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { GENERATE_CONTENT_TEXT_CREDITS } from '@genfeedai/contracts/constants';
import { readRecord } from '@genfeedai/utils/data/extract.util';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AgentCadenceExecutionService {
  constructor(
    private readonly strategies: AgentStrategiesService,
    private readonly autopilot: AgentStrategyAutopilotService,
    private readonly textGeneration: AgentMediaTextGenerationService,
    private readonly posts: PostsService,
    private readonly optimizers: OptimizersService,
    private readonly credits: CreditsUtilsService,
  ) {}

  async tryExecute(
    state: PreparedAgentTurnState,
  ): Promise<AgentTurnWorkflowResult | null> {
    if (state.request.source !== 'proactive' || !state.strategyId) return null;
    const strategyId = state.strategyId;
    const strategy = await this.strategies.findOneById(
      strategyId,
      state.organizationId,
    );
    if (
      !strategy?.isActive ||
      strategy.isEnabled === false ||
      strategy.userId !== state.userId ||
      strategy.brandId !== state.request.brandId
    )
      throw new Error(
        'Cadence strategy is no longer authorized in this scope.',
      );
    if (!resolveCadencePolicy(strategy).separate) return null;
    const previous = strategy.runHistory?.find(
      (run) => run.executionId === state.executionId,
    );
    if (previous)
      return this.result(
        state,
        'This cadence run was already recorded; inspect its existing drafts and report.',
        0,
      );
    let charged = 0;
    let generatedCount = 0;
    let completed = false;
    const startedAt = new Date();
    try {
      const execution = await this.withAccounting(state, () =>
        this.autopilot.executeQueuedRun({
          organizationId: state.organizationId,
          strategyId,
          userId: state.userId,
          runId: state.executionId,
          creditBudget: state.request.creditBudget,
          draftGenerator: async (input) => {
            if (input.format !== 'text')
              throw new CadenceGenerationUnavailableError(
                'Cadence generation requires an authoritative credit quote for this media format; the opportunity is held without provider dispatch.',
              );
            if (
              !(
                Object.values(ContentIntelligencePlatform) as string[]
              ).includes(input.platform)
            )
              throw new CadenceGenerationUnavailableError(
                'Cadence generation is unavailable for this platform; no provider was called.',
              );
            if (input.creditBudget < GENERATE_CONTENT_TEXT_CREDITS)
              return { creditsUsed: 0 };
            const result = await this.textGeneration.generateContent(
              {
                brandId: strategy.brandId,
                topic: input.opportunity.topic,
                platform: input.platform,
                variationsCount: 1,
              },
              {
                organizationId: state.organizationId,
                userId: state.userId,
                brandId: strategy.brandId ?? undefined,
                strategyId,
                runId: state.executionId,
                sourceActionId: input.opportunity.id,
                creditBudget: input.creditBudget,
                requestedSkillSlugs: strategy.skillSlugs,
              },
            );
            charged += result.creditsUsed;
            let opportunitySpend = result.creditsUsed;
            const data = readRecord(result.data);
            if (
              !result.success ||
              typeof data.content !== 'string' ||
              !data.content.trim()
            )
              return { creditsUsed: result.creditsUsed };
            const draft = await this.posts.create({
              agentStrategyId: strategyId,
              brandId: strategy.brandId ?? undefined,
              category: PostCategory.TEXT,
              description: data.content,
              label: input.opportunity.topic,
              ingredients: [],
              organizationId: state.organizationId,
              userId: state.userId,
              platform: parsePlatform(input.platform) ?? undefined,
              source: 'agent-cadence',
              sourceActionId: input.opportunity.id,
              workflowExecutionId: state.executionId,
              agentThreadId: state.threadId,
              targetExecutionState: TargetExecutionState.DRAFT,
            });
            generatedCount++;
            return {
              draft: draft as PostDocument,
              creditsUsed: result.creditsUsed,
              evaluateQuality: (content, platform) =>
                this.evaluateQuality(
                  state,
                  { ...input, platform: platform ?? input.platform },
                  content ?? (data.content as string),
                  input.creditBudget - opportunitySpend,
                  (fee) => {
                    charged += fee;
                    opportunitySpend += fee;
                  },
                ),
            };
          },
        }),
      );
      completed = true;
      return this.result(state, execution.summary, charged);
    } finally {
      await this.strategies.recordRun(
        strategyId,
        {
          startedAt,
          completedAt: new Date(),
          executionId: state.executionId,
          threadId: state.threadId,
          status: completed
            ? AgentStrategyRunStatus.COMPLETED
            : AgentStrategyRunStatus.FAILED,
          creditsUsed: charged,
          contentGenerated: generatedCount,
        },
        state.organizationId,
      );
    }
  }

  private async evaluateQuality(
    state: PreparedAgentTurnState,
    input: Parameters<CadenceDraftGenerator>[0],
    content: string,
    remaining: number,
    onCharge: (fee: number) => void,
  ): Promise<{ analysis: OptimizerAnalysisResult; creditsUsed: number }> {
    let fee = 0;
    const cap = Math.max(
      0,
      Math.min(
        remaining,
        await this.credits.getOrganizationCreditsBalance(state.organizationId),
      ),
    );
    try {
      const analysis = await this.optimizers.analyzeContent(
        {
          content,
          contentType: 'caption',
          platform: input.platform,
          goals: ['engagement', 'reach'],
        },
        state.organizationId,
        state.userId,
        (amount) => {
          fee += amount;
        },
        cap,
      );
      return {
        analysis: readRecord(
          analysis.data ?? analysis,
        ) as OptimizerAnalysisResult,
        creditsUsed: fee,
      };
    } finally {
      if (fee > 0) {
        await this.credits.deductCreditsFromOrganization(
          state.organizationId,
          state.userId,
          fee,
          'Cadence quality evaluation',
          ActivitySource.SCRIPT,
          { brandId: input.strategy.brandId },
        );
        onCharge(fee);
      }
    }
  }

  private withAccounting<T>(
    state: PreparedAgentTurnState,
    execute: () => Promise<T>,
  ): Promise<T> {
    const current = currentWorkflowAccountingScope();
    if (
      current?.organizationId === state.organizationId &&
      current.workflowExecutionId === state.executionId
    )
      return execute();
    return runWithWorkflowAccounting(
      {
        organizationId: state.organizationId,
        workflowExecutionId: state.executionId,
        workflowNodeId: 'agent.turn.execute',
        workflowOperationId: `cadence:${state.executionId}`,
      },
      execute,
    );
  }

  private result(
    state: PreparedAgentTurnState,
    summary: string,
    creditsUsed: number,
  ): AgentTurnWorkflowResult {
    return {
      artifactReferences: [],
      artifactVersionPinIds: [],
      content: summary,
      summary,
      creditsUsed,
      model: null,
      threadId: state.threadId,
    };
  }
}
