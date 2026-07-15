import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import type { AgentStrategyDocument } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import type { AgentStrategyOpportunityDocument } from '@api/collections/agent-strategies/schemas/agent-strategy-opportunity.schema';
import {
  buildImagePrompt,
  documentId,
  draftId as getDraftId,
  opportunityId as getOpportunityId,
  strategyBrandId as getStrategyBrandId,
  strategyId as getStrategyId,
  strategyOrganizationId as getStrategyOrganizationId,
  normalizeOpportunitySourceType,
  resolveOpportunityPlatform,
  shouldAutoPublish,
  strategySkillSlugs,
} from '@api/collections/agent-strategies/services/agent-strategy-autopilot.helpers';
import type {
  FinalizeOpportunityInput,
  ImageEvaluationResult,
  OptimizerAnalysisResult,
  PublishGateResult,
} from '@api/collections/agent-strategies/services/agent-strategy-autopilot.types';
import { AgentStrategyOpportunitiesService } from '@api/collections/agent-strategies/services/agent-strategy-opportunities.service';
import type { ContentDraftDocument } from '@api/collections/content-drafts/schemas/content-draft.schema';
import { ContentDraftsService } from '@api/collections/content-drafts/services/content-drafts.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { EvaluationsOperationsService } from '@api/collections/evaluations/services/evaluations-operations.service';
import { OptimizersService } from '@api/collections/optimizers/services/optimizers.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { BatchGenerationService } from '@api/services/batch-generation/batch-generation.service';
import { ReviewBatchItemFormat } from '@api/services/batch-generation/constants/review-batch-item-format.constant';
import { ContentGatewayService } from '@api/services/content-gateway/content-gateway.service';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  ContentDraftStatus,
  ContentFormat,
  IngredientCategory,
  PostCategory,
  PostStatus,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AgentStrategyAutopilotExecutionService {
  constructor(
    private readonly opportunitiesService: AgentStrategyOpportunitiesService,
    private readonly activitiesService: ActivitiesService,
    private readonly contentGatewayService: ContentGatewayService,
    private readonly contentDraftsService: ContentDraftsService,
    private readonly optimizersService: OptimizersService,
    private readonly evaluationsOperationsService: EvaluationsOperationsService,
    private readonly credentialsService: CredentialsService,
    private readonly postsService: PostsService,
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
    const draftContent = draft.content ?? '';

    const gate = await this.evaluateDraft(
      strategy,
      strategyOrganizationId,
      format,
      draftContent,
      draft.mediaUrls?.[0],
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
  }): Promise<ContentDraftDocument | undefined> {
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
    );

    return generation.drafts[0];
  }

  private async persistAutopilotMetadata(input: {
    draft: ContentDraftDocument;
    format: string;
    opportunity: AgentStrategyOpportunityDocument;
    strategy: AgentStrategyDocument;
  }): Promise<Record<string, unknown>> {
    const metadata: Record<string, unknown> = {
      ...((input.draft.metadata ?? {}) as Record<string, unknown>),
      autopilotFormat: input.format,
      autopilotOpportunityId: getOpportunityId(input.opportunity),
      autopilotSourceType: input.opportunity.sourceType,
      autopilotStrategyId: getStrategyId(input.strategy),
      budgetCost: input.opportunity.estimatedCreditCost,
      goalProfile: input.strategy.goalProfile,
    };

    await this.contentDraftsService.patch(getDraftId(input.draft), {
      metadata,
    } as never);

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
    draft: ContentDraftDocument;
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

    await this.contentDraftsService.patch(draftId, {
      content: optimization.optimized,
      metadata: {
        ...input.autopilotMetadata,
        revisionInstructions: input.gate.revisionInstructions,
      },
    } as never);

    const revisedGate = await this.evaluateDraft(
      input.strategy,
      input.organizationId,
      input.format,
      optimization.optimized,
      undefined,
      input.platform,
    );

    if (revisedGate.decision !== 'approved') {
      await this.contentDraftsService.reject(
        draftId,
        input.organizationId,
        revisedGate.reasons.join(' '),
      );
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
    draft: ContentDraftDocument;
    gate: PublishGateResult;
    opportunity: AgentStrategyOpportunityDocument;
    organizationId: string;
  }): Promise<{ contentGenerated: number; creditsUsed: number }> {
    if (input.gate.decision === 'discard' || input.gate.decision === 'hold') {
      await this.contentDraftsService.reject(
        getDraftId(input.draft),
        input.organizationId,
        input.gate.reasons.join(' '),
      );
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
      draftId,
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

    await this.contentDraftsService.approve(draftId, organizationId, userId);

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

    await this.contentDraftsService.approve(draftId, organizationId, userId);

    const reviewHandoff =
      format === 'image'
        ? await this.createPublishingInboxHandoff({
            draftContent,
            draftId,
            format: ContentFormat.IMAGE,
            gate,
            mediaUrl: draft.mediaUrls?.[0],
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
        brandId: String(input.strategy.brand),
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

    // TODO: metadata nested field patch — retrieve current then spread when contentDraftsService supports it
    await this.contentDraftsService.patch(input.draftId, {
      metadata: {
        reviewBatchId: batch.id,
        reviewItemId: reviewItem?.id,
        reviewPostId: reviewItem?.postId,
      },
    } as never);

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
    const href = `/posts/review?batch=${input.batchId}${
      input.reviewItemId ? `&item=${input.reviewItemId}` : ''
    }`;
    const label = `Autopilot ${input.format} ready for review`;
    const description = `${input.topic} is ready in the publishing inbox.`;

    try {
      await this.activitiesService.create({
        brandId: String(getStrategyBrandId(input.strategy)),
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
      } as never);
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
    draftId: string,
    content: string,
    platforms: string[],
    userId: string,
  ): Promise<{ postIds: string[]; published: boolean }> {
    const createdPostIds: string[] = [];

    for (const platform of platforms) {
      const credential = await this.credentialsService.findOne({
        brandId: getStrategyBrandId(strategy) ?? String(strategy.brand),
        isConnected: true,
        isDeleted: false,
        organizationId: getStrategyOrganizationId(strategy),
        platform,
      });

      if (!credential) {
        continue;
      }

      const post = await this.postsService.create({
        brandId: String(getStrategyBrandId(strategy)),
        category: PostCategory.TEXT,
        credentialId: documentId(credential),
        description: content,
        organizationId: getStrategyOrganizationId(strategy),
        platform: credential.platform,
        scheduledDate: new Date(),
        status: PostStatus.PENDING,
        userId: userId,
      } as never);

      createdPostIds.push(documentId(post));
    }

    if (createdPostIds.length > 0) {
      await this.contentDraftsService.patch(draftId, {
        metadata: {
          publishedPostIds: createdPostIds,
        },
        status: ContentDraftStatus.PUBLISHED,
      } as never);
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
