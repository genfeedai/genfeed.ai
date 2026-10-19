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
import { replacePostIngredientLinks } from '@api/collections/posts/services/post-ingredient-links.util';
import { PostsService } from '@api/collections/posts/services/posts.service';
import {
  currentWorkflowAccountingScope,
  runWithWorkflowAccounting,
} from '@api/collections/workflow-executions/services/workflow-accounting.context';
import {
  AgentCadenceMediaGenerationService,
  type CadenceMediaKind,
  type CadenceMediaQuote,
  type CadenceMediaResult,
} from '@api/services/agent-orchestrator/agent-cadence-media-generation.service';
import type {
  AgentTurnWorkflowResult,
  PreparedAgentTurnState,
} from '@api/services/agent-orchestrator/agent-turn-workflow-execution.service';
import { AgentMediaTextGenerationService } from '@api/services/agent-orchestrator/tools/agent-media-text-generation.service';
import { buildCadenceMediaPrompt } from '@api/services/agent-orchestrator/utils/agent-cadence-media-prompt.util';
import {
  ActivitySource,
  AgentStrategyRunStatus,
  ContentIntelligencePlatform,
  PersistedReviewDecision,
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
    private readonly media: AgentCadenceMediaGenerationService,
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
      (strategy.brandId ?? undefined) !== state.request.brandId
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
            const media = await this.quoteMedia(state, strategy, input);
            if (media && !media.isAvailable)
              return { creditsUsed: 0, heldReason: media.reason };
            const mediaCredits = media?.credits ?? 0;
            if (
              input.creditBudget <
              GENERATE_CONTENT_TEXT_CREDITS + mediaCredits
            )
              return {
                creditsUsed: 0,
                ...(media
                  ? {
                      heldReason: `The ${media.kind} quote of ${mediaCredits} credits plus ${GENERATE_CONTENT_TEXT_CREDITS} for its caption exceeds the remaining run budget of ${input.creditBudget} credits; the opportunity is held without provider dispatch.`,
                    }
                  : {}),
              };
            const result = await this.textGeneration.generateContent(
              {
                brandId: strategy.brandId,
                topic: input.opportunity.topic,
                platform: input.platform,
                variationsCount: 1,
                ...(input.format === 'thread' ? { type: 'thread' } : {}),
              },
              {
                organizationId: state.organizationId,
                userId: state.userId,
                brandId: strategy.brandId ?? undefined,
                strategyId,
                runId: state.executionId,
                sourceActionId: input.opportunity.id,
                creditBudget: input.creditBudget - mediaCredits,
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
            const caption = data.content;
            if (media) {
              const outcome = await this.generateMediaDraft(
                state,
                strategyId,
                strategy.brandId ?? undefined,
                input,
                data,
                media,
                opportunitySpend,
              );
              charged += outcome.mediaCredits;
              if (outcome.result.draft) generatedCount++;
              return outcome.result;
            }
            const draft = await this.adoptDraft(
              state,
              strategyId,
              strategy.brandId ?? undefined,
              input,
              data,
            );
            generatedCount++;
            return {
              draft: draft as PostDocument,
              creditsUsed: result.creditsUsed,
              evaluateQuality: (content, platform) =>
                this.evaluateQuality(
                  state,
                  { ...input, platform: platform ?? input.platform },
                  content ?? caption,
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

  private async adoptDraft(
    state: PreparedAgentTurnState,
    strategyId: string,
    brandId: string | undefined,
    input: Parameters<CadenceDraftGenerator>[0],
    data: Record<string, unknown>,
    media?:
      | {
          asset: Extract<CadenceMediaResult, { isGenerated: true }>;
          kind: CadenceMediaKind;
        }
      | { rejectionReason: string },
  ): Promise<PostDocument> {
    const asset = media && 'asset' in media ? media : undefined;
    const rejectionReason =
      media && 'rejectionReason' in media ? media.rejectionReason : undefined;
    if (typeof data.postId !== 'string' || typeof data.receiptId !== 'string')
      throw new CadenceGenerationUnavailableError(
        'Cadence generation did not return a receipt-bound draft. No replacement draft was created.',
      );
    const draft = await this.posts.patchOneWhere(
      {
        id: data.postId,
        organizationId: state.organizationId,
        brandId: brandId,
        userId: state.userId,
        isDeleted: false,
        targetExecutionState: TargetExecutionState.DRAFT,
      },
      {
        agentStrategyId: strategyId,
        brandId: brandId ?? undefined,
        category: asset
          ? asset.kind === 'video'
            ? PostCategory.VIDEO
            : PostCategory.IMAGE
          : PostCategory.TEXT,
        label: input.opportunity.topic,
        // Media are ordered links; a bare id array is not a Prisma payload.
        ingredientLinks: replacePostIngredientLinks(
          state.organizationId,
          asset ? [asset.asset.ingredientId] : [],
        ),
        ...(asset ? { targetAttachments: [asset.asset.mediaUrl] } : {}),
        ...(rejectionReason
          ? {
              reviewDecision: PersistedReviewDecision.REJECTED,
              reviewFeedback: rejectionReason,
              reviewedAt: new Date(),
            }
          : {}),
        organizationId: state.organizationId,
        userId: state.userId,
        platform: parsePlatform(input.platform) ?? undefined,
        source: 'agent-cadence',
        sourceActionId: input.opportunity.id,
        workflowExecutionId: state.executionId,
        agentThreadId: state.threadId,
        targetExecutionState: TargetExecutionState.DRAFT,
        brandedReceiptId: data.receiptId,
        brandedReceiptState:
          typeof data.receiptState === 'string'
            ? data.receiptState
            : 'needs_review',
      },
      [],
    );
    if (!draft)
      throw new CadenceGenerationUnavailableError(
        'The receipt-bound cadence draft is no longer available in this scope.',
      );
    return draft;
  }

  /**
   * Dispatches the quoted media for a generated caption and adopts the media
   * draft. A failed dispatch rejects the caption draft and holds the
   * opportunity; media credits are charged only for a generated asset.
   */
  private async generateMediaDraft(
    state: PreparedAgentTurnState,
    strategyId: string,
    brandId: string | undefined,
    input: Parameters<CadenceDraftGenerator>[0],
    data: Record<string, unknown>,
    media: Extract<CadenceMediaQuote, { isAvailable: true }>,
    captionSpend: number,
  ): Promise<{
    mediaCredits: number;
    result: Awaited<ReturnType<CadenceDraftGenerator>>;
  }> {
    const asset = await this.media.generate(
      media,
      buildCadenceMediaPrompt(input.opportunity.topic, String(data.content)),
      {
        organizationId: state.organizationId,
        runId: state.executionId,
        sourceActionId: `${input.opportunity.id}:${media.kind}`,
        strategyId,
        userId: state.userId,
      },
    );
    if (!asset.isGenerated) {
      await this.adoptDraft(state, strategyId, brandId, input, data, {
        rejectionReason: asset.reason,
      });
      return {
        mediaCredits: 0,
        result: {
          creditsUsed: captionSpend,
          heldReason: `${asset.reason} Its caption draft was rejected; no media draft was created.`,
        },
      };
    }
    const draft = await this.adoptDraft(
      state,
      strategyId,
      brandId,
      input,
      data,
      {
        asset,
        kind: media.kind,
      },
    );
    return {
      mediaCredits: media.credits,
      result: { draft, creditsUsed: captionSpend + media.credits },
    };
  }

  /** Null for text and threads; otherwise the authoritative quote media dispatch will be held to. */
  private async quoteMedia(
    state: PreparedAgentTurnState,
    strategy: { brandId?: string | null },
    input: Parameters<CadenceDraftGenerator>[0],
  ): Promise<CadenceMediaQuote | null> {
    if (
      input.format !== 'text' &&
      input.format !== 'thread' &&
      input.format !== 'image' &&
      input.format !== 'video'
    )
      throw new CadenceGenerationUnavailableError(
        'Cadence generation is unavailable for this format; no provider was called.',
      );
    if (
      !(Object.values(ContentIntelligencePlatform) as string[]).includes(
        input.platform,
      )
    )
      throw new CadenceGenerationUnavailableError(
        'Cadence generation is unavailable for this platform; no provider was called.',
      );
    if (input.format === 'text' || input.format === 'thread') return null;
    if (!strategy.brandId)
      return {
        isAvailable: false,
        reason:
          'Cadence media requires a brand to apply its identity; the opportunity is held without provider dispatch.',
      };
    return this.media.quote(
      input.format,
      buildCadenceMediaPrompt(input.opportunity.topic),
      {
        brandId: strategy.brandId,
        organizationId: state.organizationId,
        userId: state.userId,
      },
    );
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
