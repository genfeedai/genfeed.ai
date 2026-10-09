import { AccountPublishingContextService } from '@api/collections/credentials/services/account-publishing-context.service';
import { ModelRegistrationService } from '@api/collections/models/services/model-registration.service';
import { OptimizersService } from '@api/collections/optimizers/services/optimizers.service';
import { reserveBreakoutLiveCapacityPlan } from '@api/collections/outliers/services/breakout-capacity-plan.util';
import { loadBreakoutPublication } from '@api/collections/outliers/services/breakout-publication-source.util';
import { BrandValidationService } from '@api/services/brand-validation/brand-validation.service';
import { BrandIdentitySnapshotService } from '@api/services/branded-generation-receipts/brand-identity-snapshot.service';
import { isOpenRouterTextModel } from '@api/services/integrations/openrouter/openrouter-model.util';
import { RouterService } from '@api/services/router/router.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ModelCategory, Platform } from '@genfeedai/contracts';
import { GENERATE_CONTENT_TEXT_CREDITS } from '@genfeedai/contracts/constants';
import type {
  AccountPublishingConstraints,
  BreakoutLiveCapacityReservationResult,
  BreakoutObservationScope,
  BreakoutPublicationSource,
  LearningFormat,
} from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import { BadRequestException, HttpException, Injectable } from '@nestjs/common';

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
  ) {}

  async prepare(
    request: BreakoutGenerationPlanRequest,
  ): Promise<BreakoutGenerationPlanResult> {
    const source = await this.readSource(request);
    if ('status' in source) return source;
    if (
      source.format !== 'text' &&
      source.format !== 'thread' &&
      source.platform !== Platform.TWITTER
    )
      return this.mediaCapabilityHold(request, source.format);
    const models = await this.registry.listCallableGenerationModels(
      request.scope.organizationId,
      'text',
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
    return this.reservePlan(
      request,
      source,
      resolution.key,
      account.constraints,
    );
  }

  private async readSource(request: BreakoutGenerationPlanRequest) {
    await request.reauthorize(this.prisma);
    const response = await this.prisma.breakoutResponse.findFirst({
      where: { ...request.scope, id: request.responseId, isDeleted: false },
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
  ): Promise<BreakoutGenerationPlanResult> {
    const maximum =
      constraints.maxCharacters ?? constraints.maxWeightedCharacters;
    if (!maximum || !Number.isSafeInteger(maximum) || maximum < 1)
      return { status: 'held', reason: 'account_constraints_unavailable' };
    // This explicit output bound is enforced again by the concrete text preparation consumer.
    const segmentCharacterLimit = Math.min(
      maximum,
      source.format === 'thread' ? 1500 : 16000,
    );
    const totalCharacterLimit =
      source.format === 'thread'
        ? segmentCharacterLimit * 9 + 16
        : segmentCharacterLimit;
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
    const supportedFormats: LearningFormat[] = ['text'];
    if (constraints.supportsThreads) supportedFormats.push('thread');
    const reservation = await this.prisma.$transaction(async (tx) => {
      await request.reauthorize(tx);
      const result = await reserveBreakoutLiveCapacityPlan(tx, {
        responseId: request.responseId,
        source,
        strategyId: request.strategyId,
        requestedTotalOutputs: 5,
        supportedFormats,
        costsByFormat: {
          text: {
            generationCredits: GENERATE_CONTENT_TEXT_CREDITS,
            qualityCredits,
          },
          thread: {
            generationCredits: GENERATE_CONTENT_TEXT_CREDITS,
            qualityCredits,
          },
        },
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
      segmentCharacterLimit,
      totalCharacterLimit,
      reservation,
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

  private async mediaCapabilityHold(
    request: BreakoutGenerationPlanRequest,
    format: LearningFormat,
  ) {
    const image = format === 'image' || format === 'carousel';
    const category = image ? ModelCategory.IMAGE : ModelCategory.VIDEO;
    const models = await this.registry.listCallableGenerationModels(
      request.scope.organizationId,
      category,
    );
    await request.reauthorize(this.prisma);
    const resolution = await this.resolveModel(
      request,
      category,
      models.map((model) => model.key),
    );
    await request.reauthorize(this.prisma);
    if (!resolution)
      return { status: 'held' as const, reason: 'model_unavailable' };
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
      mediaKind: image ? 'image' : 'video',
    });
    return {
      status: 'held' as const,
      reason:
        capability.status === 'blocked'
          ? 'media_brand_capability_unavailable'
          : 'media_quality_capability_unavailable',
    };
  }
}
