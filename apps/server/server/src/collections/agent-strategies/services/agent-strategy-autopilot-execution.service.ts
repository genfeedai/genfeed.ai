import { randomUUID } from 'node:crypto';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  ContentFormat,
  IngredientCategory,
  PersistedReviewDecision,
  PostCategory,
  TargetExecutionState,
} from '@genfeedai/enums';
import { toPrismaJson } from '@genfeedai/prisma';
import { scopedWhere } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { ActivitiesService } from '@server/collections/activities/services/activities.service';
import type { AgentStrategyDocument } from '@server/collections/agent-strategies/schemas/agent-strategy.schema';
import type { AgentStrategyOpportunityDocument } from '@server/collections/agent-strategies/schemas/agent-strategy-opportunity.schema';
import {
  buildImagePrompt,
  documentId,
  draftContent as getDraftContent,
  draftGenerationSettings as getDraftGenerationSettings,
  draftId as getDraftId,
  draftMediaUrls as getDraftMediaUrls,
  draftMetadata as getDraftMetadata,
  draftTargetSettings as getDraftTargetSettings,
  opportunityId as getOpportunityId,
  strategyBrandId as getStrategyBrandId,
  strategyId as getStrategyId,
  strategyOrganizationId as getStrategyOrganizationId,
  normalizeOpportunitySourceType,
  resolveOpportunityPlatform,
  shouldAutoPublish,
  strategySkillSlugs,
} from '@server/collections/agent-strategies/services/agent-strategy-autopilot.helpers';
import type {
  FinalizeOpportunityInput,
  ImageEvaluationResult,
  OptimizerAnalysisResult,
  PublishGateResult,
} from '@server/collections/agent-strategies/services/agent-strategy-autopilot.types';
import { AgentStrategyOpportunitiesService } from '@server/collections/agent-strategies/services/agent-strategy-opportunities.service';
import { EvaluationsOperationsService } from '@server/collections/evaluations/services/evaluations-operations.service';
import { OptimizersService } from '@server/collections/optimizers/services/optimizers.service';
import type { PostDocument } from '@server/collections/posts/post.schema';
import { PostAccountFanoutService } from '@server/collections/posts/services/post-account-fanout.service';
import type { PostCreateInput } from '@server/collections/posts/services/posts.service';
import { PostsService } from '@server/collections/posts/services/posts.service';
import { BatchGenerationService } from '@server/services/batch-generation/batch-generation.service';
import { ReviewBatchItemFormat } from '@server/services/batch-generation/constants/review-batch-item-format.constant';
import { ContentGatewayService } from '@server/services/content-gateway/content-gateway.service';

@Injectable()
export class AgentStrategyAutopilotExecutionService {
  constructor(
    private readonly opportunitiesService: AgentStrategyOpportunitiesService,
    private readonly activitiesService: ActivitiesService,
    private readonly contentGatewayService: ContentGatewayService,
    private readonly optimizersService: OptimizersService,
    private readonly evaluationsOperationsService: EvaluationsOperationsService,
    private readonly postsService: PostsService,
    private readonly postAccountFanoutService: PostAccountFanoutService,
    private readonly batchGenerationService: BatchGenerationService,
    private readonly logger: LoggerService,
  ) {}

  async executeOpportunity(
    strategy: AgentStrategyDocument,
    opportunity: AgentStrategyOpportunityDocument,
    userId: string,
    defaultModel?: string,
  ): Promise<{ contentGenerated: number; creditsUsed: number }> {
    const strategyOrganizationId = getStrategyOrganizationId(strategy);
    const targetPlatform = resolveOpportunityPlatform(strategy, opportunity);

    await this.opportunitiesService.updateStatus(
      getOpportunityId(opportunity),
      strategyOrganizationId,
      'generating',
    );

    const format = opportunity.formatCandidates[0] ?? 'text';

    if (format === 'video') {
      return this.handleVideoHold(opportunity, strategyOrganizationId);
    }

    const draft = await this.generateAutopilotDraft({
      defaultModel,
      format,
      opportunity,
      organizationId: strategyOrganizationId,
      platform: targetPlatform,
      strategy,
      userId,
    });
    if (!draft) {
      await this.opportunitiesService.updateStatus(
        getOpportunityId(opportunity),
        strategyOrganizationId,
        'held',
        { decisionReason: 'No content draft was produced.' },
      );
      return { contentGenerated: 0, creditsUsed: 0 };
    }

    const autopilotMetadata = await this.persistAutopilotMetadata({
      draft,
      format,
      opportunity,
      strategy,
    });
    const draftContent = getDraftContent(draft);

    const gate = await this.evaluateDraft(
      strategy,
      strategyOrganizationId,
      format,
      draftContent,
      getDraftMediaUrls(draft)[0],
      targetPlatform,
    );

    if (gate.decision === 'revise' && format === 'text') {
      const revision = await this.reviseAndReEvaluate({
        autopilotMetadata,
        draft,
        draftContent,
        format,
        gate,
        opportunity,
        organizationId: strategyOrganizationId,
        platform: targetPlatform,
        strategy,
        userId,
      });

      if (revision.terminal) {
        return revision.result;
      }
    } else if (gate.decision !== 'approved') {
      return this.handleGateRejection({
        draft,
        gate,
        opportunity,
        organizationId: strategyOrganizationId,
      });
    }

    return this.finalizeApprovalAndHandoff({
      draft,
      draftContent,
      format,
      gate,
      opportunity,
      organizationId: strategyOrganizationId,
      platform: targetPlatform,
      strategy,
      userId,
    });
  }

  private async generateAutopilotDraft(input: {
    defaultModel?: string;
    format: string;
    opportunity: AgentStrategyOpportunityDocument;
    organizationId: string;
    platform: string;
    strategy: AgentStrategyDocument;
    userId: string;
  }): Promise<PostDocument | undefined> {
    const generation = await this.contentGatewayService.processManualRequest(
      input.organizationId,
      getStrategyBrandId(input.strategy) ?? '',
      input.format === 'image' ? 'image-generation' : 'content-writing',
      input.format === 'image'
        ? {
            model: input.defaultModel,
            prompt: buildImagePrompt(input.strategy, input.opportunity),
            skillSlugs: strategySkillSlugs(input.strategy, [
              'image-generation',
            ]),
          }
        : {
            model: input.defaultModel,
            platform: input.platform,
            skillSlugs: strategySkillSlugs(input.strategy, ['content-writing']),
            topic: input.opportunity.topic,
            variationsCount: 1,
          },
      input.userId,
    );

    return generation.posts[0];
  }

  private async persistAutopilotMetadata(input: {
    draft: PostDocument;
    format: string;
    opportunity: AgentStrategyOpportunityDocument;
    strategy: AgentStrategyDocument;
  }): Promise<Record<string, unknown>> {
    const metadata: Record<string, unknown> = {
      ...getDraftMetadata(input.draft),
      autopilotFormat: input.format,
      autopilotOpportunityId: getOpportunityId(input.opportunity),
      autopilotSourceType: input.opportunity.sourceType,
      autopilotStrategyId: getStrategyId(input.strategy),
      budgetCost: input.opportunity.estimatedCreditCost,
      goalProfile: input.strategy.goalProfile,
    };

    await this.postsService.patch(getDraftId(input.draft), {
      agentStrategyId: getStrategyId(input.strategy),
      targetSettings: toPrismaJson({
        ...getDraftTargetSettings(input.draft),
        generation: {
          ...getDraftGenerationSettings(input.draft),
          metadata,
        },
      }),
    });

    return metadata;
  }

  private async handleVideoHold(
    opportunity: AgentStrategyOpportunityDocument,
    organizationId: string,
  ): Promise<{ contentGenerated: number; creditsUsed: number }> {
    await this.opportunitiesService.updateStatus(
      getOpportunityId(opportunity),
      organizationId,
      'held',
      {
        decisionReason:
          'Video opportunities remain draft-only until stronger evaluation and generation support lands.',
      },
    );
    return { contentGenerated: 0, creditsUsed: 0 };
  }

  private async reviseAndReEvaluate(input: {
    autopilotMetadata: Record<string, unknown>;
    draft: PostDocument;
    draftContent: string;
    format: string;
    gate: PublishGateResult;
    opportunity: AgentStrategyOpportunityDocument;
    organizationId: string;
    platform: string;
    strategy: AgentStrategyDocument;
    userId: string;
  }): Promise<
    | {
        result: { contentGenerated: number; creditsUsed: number };
        terminal: true;
      }
    | { terminal: false }
  > {
    const draftId = getDraftId(input.draft);
    const optimization = await this.optimizersService.optimizeContent(
      {
        content: input.draftContent,
        contentType: 'caption',
        goals: ['engagement', 'reach'],
        platform: input.platform,
      },
      input.organizationId,
      input.userId,
    );

    await this.postsService.patch(draftId, {
      description: optimization.optimized,
      targetSettings: toPrismaJson({
        ...getDraftTargetSettings(input.draft),
        generation: {
          ...getDraftGenerationSettings(input.draft),
          metadata: {
            ...input.autopilotMetadata,
            revisionInstructions: input.gate.revisionInstructions,
          },
        },
      }),
    });

    const revisedGate = await this.evaluateDraft(
      input.strategy,
      input.organizationId,
      input.format,
      optimization.optimized,
      undefined,
      input.platform,
    );

    if (revisedGate.decision !== 'approved') {
      await this.postsService.patch(draftId, {
        reviewDecision: PersistedReviewDecision.REJECTED,
        reviewFeedback: revisedGate.reasons.join(' '),
        reviewedAt: new Date(),
      });
      await this.opportunitiesService.updateStatus(
        getOpportunityId(input.opportunity),
        input.organizationId,
        'discarded',
        { decisionReason: revisedGate.reasons.join(' ') },
      );
      return {
        result: {
          contentGenerated: 1,
          creditsUsed: input.opportunity.estimatedCreditCost,
        },
        terminal: true,
      };
    }

    return { terminal: false };
  }

  private async handleGateRejection(input: {
    draft: PostDocument;
    gate: PublishGateResult;
    opportunity: AgentStrategyOpportunityDocument;
    organizationId: string;
  }): Promise<{ contentGenerated: number; creditsUsed: number }> {
    if (input.gate.decision === 'discard' || input.gate.decision === 'hold') {
      await this.postsService.patch(getDraftId(input.draft), {
        reviewDecision: PersistedReviewDecision.REJECTED,
        reviewFeedback: input.gate.reasons.join(' '),
        reviewedAt: new Date(),
      });
    }

    await this.opportunitiesService.updateStatus(
      getOpportunityId(input.opportunity),
      input.organizationId,
      input.gate.decision === 'hold' ? 'held' : 'discarded',
      { decisionReason: input.gate.reasons.join(' ') },
    );

    return {
      contentGenerated: 1,
      creditsUsed: input.opportunity.estimatedCreditCost,
    };
  }

  private async finalizeApprovalAndHandoff(
    input: FinalizeOpportunityInput,
  ): Promise<{ contentGenerated: number; creditsUsed: number }> {
    if (input.format === 'text' && shouldAutoPublish(input.strategy)) {
      return this.finalizeAutoPublish(input);
    }

    return this.finalizeManualReviewHandoff(input);
  }

  private async finalizeAutoPublish(
    input: FinalizeOpportunityInput,
  ): Promise<{ contentGenerated: number; creditsUsed: number }> {
    const {
      draftContent,
      gate,
      opportunity,
      organizationId,
      platform,
      strategy,
      userId,
    } = input;
    const draftId = getDraftId(input.draft);
    const opportunityId = getOpportunityId(opportunity);

    const publishResult = await this.publishTextDraft(
      strategy,
      input.draft,
      draftContent,
      opportunity.platformCandidates,
      userId,
    );

    if (publishResult.published) {
      await this.opportunitiesService.updateStatus(
        opportunityId,
        organizationId,
        'published',
        {
          decisionReason:
            'Draft passed publish gate and was converted into pending posts.',
        },
      );
      return {
        contentGenerated: 1,
        creditsUsed: opportunity.estimatedCreditCost,
      };
    }

    const reviewHandoff = await this.createPublishingInboxHandoff({
      draftContent,
      draftId,
      format: this.resolveReviewBatchItemFormat(platform),
      gate,
      opportunity,
      organizationId,
      platform,
      strategy,
      userId,
    });

    await this.opportunitiesService.updateStatus(
      opportunityId,
      organizationId,
      'approved',
      {
        decisionReason: reviewHandoff
          ? `Draft passed publish gate but no connected credential was available, so it was handed off to publishing inbox batch ${reviewHandoff.batchId}.`
          : 'Draft passed publish gate but no connected credential was available.',
      },
    );

    return {
      contentGenerated: 1,
      creditsUsed: opportunity.estimatedCreditCost,
    };
  }

  private async finalizeManualReviewHandoff(
    input: FinalizeOpportunityInput,
  ): Promise<{ contentGenerated: number; creditsUsed: number }> {
    const {
      draft,
      draftContent,
      format,
      gate,
      opportunity,
      organizationId,
      platform,
      strategy,
      userId,
    } = input;
    const draftId = getDraftId(draft);

    const reviewHandoff =
      format === 'image'
        ? await this.createPublishingInboxHandoff({
            draftContent,
            draftId,
            format: ContentFormat.IMAGE,
            gate,
            mediaUrl: getDraftMediaUrls(draft)[0],
            opportunity,
            organizationId,
            platform,
            strategy,
            userId,
          })
        : format === 'text'
          ? await this.createPublishingInboxHandoff({
              draftContent,
              draftId,
              format: this.resolveReviewBatchItemFormat(platform),
              gate,
              opportunity,
              organizationId,
              platform,
              strategy,
              userId,
            })
          : null;

    await this.opportunitiesService.updateStatus(
      getOpportunityId(opportunity),
      organizationId,
      'approved',
      {
        decisionReason:
          format === 'image'
            ? reviewHandoff
              ? `Image passed quality gate and was handed off to publishing inbox batch ${reviewHandoff.batchId}.`
              : 'Image passed quality gate and was approved for downstream review/publishing.'
            : reviewHandoff
              ? `Draft passed publish gate and was handed off to publishing inbox batch ${reviewHandoff.batchId}.`
              : 'Draft passed publish gate and was approved.',
      },
    );

    return {
      contentGenerated: 1,
      creditsUsed: opportunity.estimatedCreditCost,
    };
  }

  private async evaluateDraft(
    strategy: AgentStrategyDocument,
    organizationId: string,
    format: string,
    content: string,
    mediaUrl: string | undefined,
    platform: string,
  ): Promise<PublishGateResult> {
    if (format === 'image') {
      if (!mediaUrl) {
        return {
          decision: 'hold',
          overallScore: 0,
          reasons: ['Image draft has no media URL to evaluate.'],
          revisionInstructions: [],
          scoreBreakdown: {},
        };
      }

      const evaluation = (await this.evaluationsOperationsService.evaluateImage(
        mediaUrl,
        {
          platform,
          prompt: content,
        },
        organizationId,
      )) as ImageEvaluationResult;

      const technicalOverall = Number(
        evaluation?.scores?.technical?.overall ?? evaluation?.overallScore ?? 0,
      );
      const brandOverall = Number(
        evaluation?.scores?.brand?.overall ?? evaluation?.overallScore ?? 0,
      );
      const engagementOverall = Number(
        evaluation?.scores?.engagement?.overall ??
          evaluation?.overallScore ??
          0,
      );
      const overallScore = Number(evaluation?.overallScore ?? 0);

      return {
        decision:
          overallScore >= (strategy.publishPolicy?.minImageScore ?? 75)
            ? 'approved'
            : 'hold',
        overallScore,
        reasons:
          overallScore >= (strategy.publishPolicy?.minImageScore ?? 75)
            ? ['Image cleared the autopilot quality gate.']
            : ['Image quality score did not meet the publish threshold.'],
        revisionInstructions:
          overallScore >= (strategy.publishPolicy?.minImageScore ?? 75)
            ? []
            : [
                'Improve composition and scroll-stop strength.',
                'Increase brand fit and reduce visible generation artifacts.',
              ],
        scoreBreakdown: {
          artifactRisk: technicalOverall,
          brandFit: brandOverall,
          composition: technicalOverall,
          lightingContrast: technicalOverall,
          overlayLegibility: technicalOverall,
          scrollStopStrength: engagementOverall,
        },
      };
    }

    const analysis = (await this.optimizersService.analyzeContent(
      {
        content,
        contentType: 'caption',
        goals: ['engagement', 'reach'],
        platform,
      },
      organizationId,
    )) as OptimizerAnalysisResult;

    const hasCTA =
      analysis.metadata?.hasCallToAction ??
      /comment|click|learn more|reply|share|visit/i.test(content);
    const overallScore = Number(analysis.overallScore ?? 0);
    const ctaRequired = strategy.goalProfile === 'reach_traffic';
    const minPostScore = strategy.publishPolicy?.minPostScore ?? 70;
    const reasons: string[] = [];

    if (overallScore < minPostScore) {
      reasons.push('Post quality score fell below the publish threshold.');
    }
    if (ctaRequired && !hasCTA) {
      reasons.push('Reach/traffic mode requires a visible call-to-action.');
    }

    return {
      decision:
        reasons.length === 0
          ? 'approved'
          : overallScore >= Math.max(50, minPostScore - 10)
            ? 'revise'
            : 'discard',
      overallScore,
      reasons:
        reasons.length === 0
          ? [
              'Post cleared the autopilot quality gate.',
              ...(ctaRequired && hasCTA
                ? [
                    'Draft includes a visible call-to-action for traffic intent.',
                  ]
                : []),
            ]
          : reasons,
      revisionInstructions: [
        'Strengthen the opening hook.',
        'Improve clarity and readability.',
        'Add a clear call-to-action aligned to traffic intent.',
      ],
      scoreBreakdown: {
        clarity: Number(analysis.breakdown?.clarity ?? 0),
        hook: Number(analysis.breakdown?.engagement ?? 0),
        platformFit: Number(analysis.breakdown?.platformOptimization ?? 0),
        readability: Number(analysis.breakdown?.readability ?? 0),
      },
    };
  }

  private async createPublishingInboxHandoff(input: {
    draftContent: string;
    draftId: string;
    format: ReviewBatchItemFormat;
    gate: PublishGateResult;
    mediaUrl?: string;
    opportunity: AgentStrategyOpportunityDocument;
    organizationId: string;
    platform?: string;
    strategy: AgentStrategyDocument;
    userId: string;
  }): Promise<{
    batchId: string;
    postId?: string;
    reviewItemId?: string;
  } | null> {
    if (input.format === ContentFormat.IMAGE && !input.mediaUrl) {
      return null;
    }

    const batch = await this.batchGenerationService.createManualReviewBatch(
      {
        brandId: getStrategyBrandId(input.strategy) ?? '',
        items: [
          {
            caption: input.draftContent,
            format: input.format,
            gateOverallScore: input.gate.overallScore,
            gateReasons: input.gate.reasons,
            label: `Autopilot ${input.format} review: ${input.opportunity.topic}`,
            mediaUrl: input.mediaUrl,
            opportunitySourceType: normalizeOpportunitySourceType(
              input.opportunity.sourceType,
            ),
            opportunityTopic: input.opportunity.topic,
            platform: input.platform,
            postId: input.draftId,
            prompt: input.draftContent,
            sourceActionId: getOpportunityId(input.opportunity),
            sourceWorkflowId: getStrategyId(input.strategy),
            sourceWorkflowName: input.strategy.label ?? undefined,
          },
        ],
      },
      input.userId,
      input.organizationId,
    );

    const reviewItem = batch.items[0];
    const linkedPost = await this.postsService.findOne(
      scopedWhere(input.organizationId, { id: input.draftId }),
    );

    if (linkedPost) {
      await this.postsService.patch(input.draftId, {
        targetSettings: toPrismaJson({
          ...getDraftTargetSettings(linkedPost),
          generation: {
            ...getDraftGenerationSettings(linkedPost),
            metadata: {
              ...getDraftMetadata(linkedPost),
              reviewBatchId: batch.id,
              reviewItemId: reviewItem?.id,
              reviewPostId: reviewItem?.postId,
            },
          },
        }),
      });
    }

    if (reviewItem?.postId) {
      await this.createPublishingInboxActivity({
        batchId: batch.id,
        format: input.format,
        mediaUrl: input.mediaUrl,
        organizationId: input.organizationId,
        platform: input.platform,
        postId: reviewItem.postId,
        reviewItemId: reviewItem?.id,
        strategy: input.strategy,
        topic: input.opportunity.topic,
        userId: input.userId,
      });
    }

    return {
      batchId: batch.id,
      postId: reviewItem?.postId,
      reviewItemId: reviewItem?.id,
    };
  }

  private resolveReviewBatchItemFormat(
    platform?: string,
  ): ReviewBatchItemFormat {
    const normalizedPlatform = platform?.toLowerCase();

    if (
      normalizedPlatform === 'beehiiv' ||
      normalizedPlatform === 'substack' ||
      normalizedPlatform === 'email'
    ) {
      return 'newsletter';
    }

    return 'post';
  }

  private async createPublishingInboxActivity(input: {
    batchId: string;
    format: ReviewBatchItemFormat;
    mediaUrl?: string;
    organizationId: string;
    platform?: string;
    postId: string;
    reviewItemId?: string;
    strategy: AgentStrategyDocument;
    topic: string;
    userId: string;
  }): Promise<void> {
    const href = `/publishing/review?batch=${input.batchId}${
      input.reviewItemId ? `&item=${input.reviewItemId}` : ''
    }`;
    const label = `Autopilot ${input.format} ready for review`;
    const description = `${input.topic} is ready in the publishing inbox.`;

    try {
      await this.activitiesService.create({
        brandId: getStrategyBrandId(input.strategy) ?? '',
        entityId: input.postId,
        entityModel: ActivityEntityModel.POST,
        key: ActivityKey.POST_GENERATED,
        organizationId: input.organizationId,
        source: ActivitySource.POST_GENERATION,
        userId: input.userId,
        value: JSON.stringify({
          batchId: input.batchId,
          description,
          format: input.format,
          href,
          label,
          mediaUrl: input.mediaUrl,
          platform: input.platform,
          resultId: input.postId,
          resultType:
            input.format === ContentFormat.IMAGE
              ? IngredientCategory.IMAGE
              : input.format === ContentFormat.VIDEO
                ? IngredientCategory.VIDEO
                : undefined,
          reviewItemId: input.reviewItemId,
          sentence: description,
          topic: input.topic,
        }),
      });
    } catch (error) {
      this.logger.warn('Failed to create publishing inbox activity', {
        batchId: input.batchId,
        error,
        postId: input.postId,
        reviewItemId: input.reviewItemId,
      });
    }
  }

  private async publishTextDraft(
    strategy: AgentStrategyDocument,
    draft: PostDocument,
    content: string,
    platforms: string[],
    userId: string,
  ): Promise<{ postIds: string[]; published: boolean }> {
    const createdPostIds: string[] = [];
    const draftId = getDraftId(draft);
    const brandId = getStrategyBrandId(strategy) ?? '';
    const organizationId = getStrategyOrganizationId(strategy);
    let reusedDraft = false;

    // A brand may hold several accounts on one platform, so auto-publish
    // addresses every connected account rather than whichever row a
    // platform-only lookup happened to return first. The draft becomes the
    // first account's post; the rest are siblings sharing one groupId.
    const targets = await this.postAccountFanoutService.resolveTargets({
      brandId,
      caption: content,
      organizationId,
      platforms,
    });
    const groupId = randomUUID();

    for (const target of targets) {
      const post = reusedDraft
        ? await this.postsService.create({
            agentStrategyId: getStrategyId(strategy),
            brandId,
            category: PostCategory.TEXT,
            contentRunId: draft.contentRunId ?? undefined,
            credentialId: target.credentialId,
            description: target.caption,
            groupId,
            organizationId,
            platform: target.platform,
            promptUsed: draft.promptUsed ?? undefined,
            scheduledDate: new Date(),
            source: draft.source ?? undefined,
            targetAttachments: draft.targetAttachments,
            targetExecutionState: TargetExecutionState.SCHEDULED,
            targetSettings: draft.targetSettings,
            userId,
          } as PostCreateInput)
        : await this.postsService.patch(draftId, {
            credentialId: target.credentialId,
            groupId,
            platform: target.platform,
            scheduledDate: new Date(),
            targetExecutionState: TargetExecutionState.SCHEDULED,
            userId,
          });

      createdPostIds.push(documentId(post));
      reusedDraft = true;
    }

    if (createdPostIds.length > 0) {
      return {
        postIds: createdPostIds,
        published: true,
      };
    }

    return {
      postIds: [],
      published: false,
    };
  }
}
