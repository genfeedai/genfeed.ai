import { AccountPublishingContextService } from '@api/collections/credentials/services/account-publishing-context.service';
import { ModelRegistrationService } from '@api/collections/models/services/model-registration.service';
import { OptimizersService } from '@api/collections/optimizers/services/optimizers.service';
import { reserveBreakoutLiveCapacityPlan } from '@api/collections/outliers/services/breakout-capacity-plan.util';
import {
  type BreakoutMediaFormatPlan,
  isBreakoutMediaFormat,
  resolveBreakoutMediaFormat,
} from '@api/collections/outliers/services/breakout-media-format.util';
import { loadBreakoutPublication } from '@api/collections/outliers/services/breakout-publication-source.util';
import { breakoutTextOutputLimits } from '@api/collections/outliers/services/breakout-text-output-limits.util';
import { BreakoutVisualQualityService } from '@api/collections/outliers/services/breakout-visual-quality.service';
import { BrandValidationService } from '@api/services/brand-validation/brand-validation.service';
import { BrandIdentitySnapshotService } from '@api/services/branded-generation-receipts/brand-identity-snapshot.service';
import { isOpenRouterTextModel } from '@api/services/integrations/openrouter/openrouter-model.util';
import { AgentGenerationEstimateService } from '@api/services/router/agent-generation-estimate.service';
import { RouterService } from '@api/services/router/router.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { isSelfHostedDeployment } from '@genfeedai/config';
import { ModelCategory, Platform } from '@genfeedai/contracts';
import { GENERATE_CONTENT_TEXT_CREDITS } from '@genfeedai/contracts/constants';
import type {
  AccountPublishingConstraints,
  BreakoutFormatCostEstimate,
  BreakoutLiveCapacityReservationResult,
  BreakoutObservationScope,
  BreakoutPublicationSource,
} from '@genfeedai/contracts/interfaces';
import type { LearningFormat } from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import type { Prisma } from '@genfeedai/prisma';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
} from '@nestjs/common';

/** Native preparation passes this separately from customer input after checking the pinned execution. */
export type BreakoutGenerationPlanRequest = Readonly<{
  scope: Readonly<Omit<BreakoutObservationScope, 'format'>>;
  responseId: string;
  strategyId: string;
  actorUserId: string;
  reauthorize: (tx: Prisma.TransactionClient) => Promise<void>;
}>;
export type BreakoutGenerationPlanResult =
  | { status: 'held'; reason: string }
  | {
      status: 'prepared';
      source: BreakoutPublicationSource;
      textModelKey: string;
      /** The visual generation model, when the source's own format is planned as follow-ups. */
      mediaModelKey: string | null;
      segmentCharacterLimit: number;
      totalCharacterLimit: number;
      reservation: BreakoutLiveCapacityReservationResult;
    };

/** Actual catalog/quality quote → live accounting → immutable output reservation. Never calls a provider. */
@Injectable()
export class BreakoutGenerationPlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ModelRegistrationService,
    private readonly router: RouterService,
    private readonly accounts: AccountPublishingContextService,
    private readonly optimizers: OptimizersService,
    private readonly snapshots: BrandIdentitySnapshotService,
    private readonly brandValidation: BrandValidationService,
    private readonly estimates: AgentGenerationEstimateService,
    private readonly visualQuality: BreakoutVisualQualityService,
  ) {}

  async prepare(
    request: BreakoutGenerationPlanRequest,
  ): Promise<BreakoutGenerationPlanResult> {
    const source = await this.readSource(request);
    if ('status' in source) return source;
    // A visual original is answered in its own format wherever the channel catalog publishes it;
    // an X original always keeps its useful text quote even when its own format is held.
    const support = isBreakoutMediaFormat(source.format)
      ? resolveBreakoutMediaFormat(source.platform, source.format)
      : null;
    if (support?.status === 'held' && source.platform !== Platform.TWITTER)
      return { status: 'held', reason: support.reason };
    const models = await this.registry.listCallableTextModels(
      request.scope.organizationId,
    );
    await request.reauthorize(this.prisma);
    const eligibleModelKeys = models
      .map((model) => model.key)
      .filter(isOpenRouterTextModel);
    if (!eligibleModelKeys.length)
      return { status: 'held', reason: 'model_unavailable' };
    const resolution = await this.resolveModel(
      request,
      ModelCategory.TEXT,
      eligibleModelKeys,
    );
    await request.reauthorize(this.prisma);
    if (!resolution) return { status: 'held', reason: 'model_unavailable' };
    const account = await this.accounts.resolveDraft({
      brandId: request.scope.brandId,
      organizationId: request.scope.organizationId,
      platform: request.scope.platform,
    });
    await request.reauthorize(this.prisma);
    const media =
      support?.status === 'supported'
        ? await this.resolveMedia(request, support.plan)
        : null;
    // Without a usable visual path only an X quote stays plannable; every other channel holds.
    if (media?.status === 'held' && source.platform !== Platform.TWITTER)
      return { status: 'held', reason: media.reason };
    return this.reservePlan(
      request,
      source,
      resolution.key,
      account.constraints,
      support?.status === 'supported' && media?.status === 'ready'
        ? { plan: support.plan, modelKey: media.modelKey }
        : null,
    );
  }

  private async readSource(request: BreakoutGenerationPlanRequest) {
    await request.reauthorize(this.prisma);
    const response = await this.prisma.breakoutResponse.findFirst({
      where: scopedWhere(request.scope.organizationId, {
        ...request.scope,
        id: request.responseId,
      }),
    });
    await request.reauthorize(this.prisma);
    if (!response || !['detected', 'planned'].includes(response.state))
      return { status: 'held' as const, reason: 'response_unavailable' };
    const source = await loadBreakoutPublication(this.prisma, {
      ...request.scope,
      postId: response.sourcePostId,
      nativeSourcePostId: response.nativeSourcePostId,
      externalId: response.externalId,
    });
    await request.reauthorize(this.prisma);
    if (
      !source ||
      source.isResponse ||
      source.logicalPostId !== response.logicalPostId ||
      source.contentDigest !== response.contentDigest ||
      source.publicationFingerprint !== response.publicationFingerprint
    )
      return { status: 'held' as const, reason: 'source_changed' };
    return source;
  }

  private async reservePlan(
    request: BreakoutGenerationPlanRequest,
    source: BreakoutPublicationSource,
    textModelKey: string,
    constraints: AccountPublishingConstraints,
    visual: Readonly<{
      plan: BreakoutMediaFormatPlan;
      modelKey: string;
    }> | null,
  ): Promise<BreakoutGenerationPlanResult> {
    const limits = breakoutTextOutputLimits(
      source.format === 'thread' ? 'thread' : 'text',
      constraints,
    );
    if (!limits)
      return { status: 'held', reason: 'account_constraints_unavailable' };
    const { segmentCharacterLimit, totalCharacterLimit } = limits;
    const qualityCredits = await this.optimizers.estimateAnalysisCredits(
      {
        content: 'x'.repeat(totalCharacterLimit),
        contentType: 'caption',
        platform: source.platform,
        goals: ['engagement', 'reach'],
      },
      () => request.reauthorize(this.prisma),
    );
    await request.reauthorize(this.prisma);
    // Text outputs exist for a text original and for the X quote of any original.
    const supportedFormats: LearningFormat[] = [];
    const costsByFormat: Partial<
      Record<LearningFormat, BreakoutFormatCostEstimate>
    > = {};
    if (!visual || source.platform === Platform.TWITTER) {
      supportedFormats.push('text');
      costsByFormat.text = {
        generationCredits: GENERATE_CONTENT_TEXT_CREDITS,
        qualityCredits,
      };
      if (constraints.supportsThreads && !visual) {
        supportedFormats.push('thread');
        costsByFormat.thread = costsByFormat.text;
      }
    }
    if (visual) {
      supportedFormats.push(visual.plan.format);
      costsByFormat[visual.plan.format] = await this.visualCosts(
        request,
        visual,
        qualityCredits,
      );
    }
    const reservation = await this.prisma.$transaction(async (tx) => {
      await request.reauthorize(tx);
      const result = await reserveBreakoutLiveCapacityPlan(tx, {
        responseId: request.responseId,
        source,
        strategyId: request.strategyId,
        requestedTotalOutputs: 5,
        supportedFormats,
        costsByFormat,
        nowMs: Date.now(),
      });
      await request.reauthorize(tx);
      return result;
    });
    await request.reauthorize(this.prisma);
    return {
      status: 'prepared',
      source,
      textModelKey,
      mediaModelKey: visual?.modelKey ?? null,
      segmentCharacterLimit,
      totalCharacterLimit,
      reservation,
    };
  }

  /**
   * One visual output's price: the approved-brand caption plus every visual at the product's own
   * generation quote, and its quality as the caption score plus one visual judgement each. An
   * unavailable price stays null; it is never guessed and holds the format as `cost_unavailable`.
   */
  private async visualCosts(
    request: BreakoutGenerationPlanRequest,
    visual: Readonly<{ plan: BreakoutMediaFormatPlan; modelKey: string }>,
    captionQualityCredits: number,
  ): Promise<BreakoutFormatCostEstimate> {
    const { plan, modelKey } = visual;
    const quote = await this.estimates.estimate({
      category: plan.mediaKind,
      modelKey,
      organizationId: request.scope.organizationId,
      aspectRatio: plan.aspectRatio,
      width: plan.width,
      height: plan.height,
      outputs: 1,
      ...(plan.durationSeconds !== null
        ? { duration: plan.durationSeconds }
        : {}),
    });
    await request.reauthorize(this.prisma);
    let visualQuality: number | null = null;
    try {
      visualQuality = await this.visualQuality.estimateCredits(
        plan.mediaKind,
        () => request.reauthorize(this.prisma),
      );
    } catch (error: unknown) {
      if (!(error instanceof ConflictException)) throw error;
    }
    await request.reauthorize(this.prisma);
    const unit = quote.isAvailable ? quote.credits : null;
    return {
      generationCredits:
        unit === null
          ? null
          : GENERATE_CONTENT_TEXT_CREDITS + unit * plan.parts,
      qualityCredits:
        visualQuality === null
          ? null
          : captionQualityCredits + visualQuality * plan.parts,
    };
  }

  private async resolveModel(
    request: BreakoutGenerationPlanRequest,
    category: ModelCategory,
    eligibleModelKeys: string[],
  ) {
    // Admission stays outside this catalog-error conversion so a native denial always propagates.
    try {
      return await this.router.resolveModelKey({
        category,
        organizationId: request.scope.organizationId,
        eligibleModelKeys,
      });
    } catch (error) {
      if (
        (error instanceof HttpException && error.getStatus() === 404) ||
        error instanceof BadRequestException
      )
        return null;
      throw error;
    }
  }

  /** The visual model the output's format needs, with the brand and quality capabilities it requires. */
  private async resolveMedia(
    request: BreakoutGenerationPlanRequest,
    plan: BreakoutMediaFormatPlan,
  ): Promise<
    { status: 'ready'; modelKey: string } | { status: 'held'; reason: string }
  > {
    const models = await this.registry.listCallableGenerationModels(
      request.scope.organizationId,
      plan.modelCategory,
    );
    await request.reauthorize(this.prisma);
    const resolution = await this.resolveModel(
      request,
      plan.modelCategory,
      models.map((model) => model.key),
    );
    await request.reauthorize(this.prisma);
    if (!resolution) return { status: 'held', reason: 'model_unavailable' };
    const model = await this.registry.validateModelForOrg(
      resolution.key,
      request.scope.organizationId,
    );
    await request.reauthorize(this.prisma);
    const snapshot = await this.snapshots.preview({
      organizationId: request.scope.organizationId,
      brandId: request.scope.brandId,
      actorId: request.actorUserId,
    });
    await request.reauthorize(this.prisma);
    const capability = this.brandValidation.preflightBrandCapabilities({
      snapshot,
      provider: model.provider,
      model: model.key,
      mediaKind: plan.mediaKind,
    });
    if (capability.status === 'blocked')
      return { status: 'held', reason: 'media_brand_capability_unavailable' };
    // The visual judge samples video frames through cloud storage; local storage cannot serve it.
    if (plan.mediaKind === 'video' && isSelfHostedDeployment())
      return { status: 'held', reason: 'media_quality_capability_unavailable' };
    return { status: 'ready', modelKey: resolution.key };
  }
}
