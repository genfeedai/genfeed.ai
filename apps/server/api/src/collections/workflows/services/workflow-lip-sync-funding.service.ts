import { GenerationBillingService } from '@api/collections/credits/services/generation-billing.service';
import { ModelCreditQuoteService } from '@api/collections/models/services/model-credit-quote.service';
import { AvatarVideoBillingService } from '@api/collections/videos/services/avatar-video-billing.service';
import { readAvatarDurationSeconds } from '@api/collections/videos/services/avatar-video-duration.util';
import { ByokService } from '@api/services/byok/byok.service';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivitySource,
  ByokProvider,
  PricingType,
} from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

/** What a lip-sync node dispatches with and how its output is funded. */
export interface WorkflowLipSyncFunding {
  /** The provider key to dispatch with; absent means the platform Replicate key. */
  apiKey?: string;
  isByok: boolean;
  /** Binds the output to its hold before the provider sees the job. */
  bind(ingredientId: string): Promise<void>;
  /** A definitive rejection: the output hold goes back. */
  reject(ingredientId: string): Promise<void>;
  /** Returns whatever no output claimed. Always runs after dispatch. */
  releasePool(): Promise<void>;
}

interface LipSyncFundingInput {
  audioIngredientId: string;
  brandId: string;
  organizationId: string;
  userId: string;
}

/**
 * Funds a workflow lip-sync node before it dispatches. Photo animation holds
 * the per-second `heygen/avatar` row at the voice's measured length and the
 * HeyGen webhook (or poll) settles it to the clip HeyGen returns. Video mode
 * holds the lip-sync model's own tariff at the same measured length and the
 * Replicate webhook settles it. A customer key holds nothing.
 */
@Injectable()
export class WorkflowLipSyncFundingService {
  constructor(
    private readonly avatarBilling: AvatarVideoBillingService,
    private readonly generationBilling: GenerationBillingService,
    private readonly modelQuotes: ModelCreditQuoteService,
    private readonly heygenService: HeyGenService,
    private readonly byokService: ByokService,
    private readonly prisma: PrismaService,
    private readonly loggerService: LoggerService,
  ) {}

  async fundPhotoAnimation(
    input: LipSyncFundingInput,
  ): Promise<WorkflowLipSyncFunding> {
    // One connection decides both who pays and which key dispatches.
    const connection = await this.heygenService.resolveOrganizationConnection(
      input.organizationId,
    );
    const isByok = connection.binding.kind === 'byok';
    const funded = await this.avatarBilling.fundLipSync({
      audioIngredientId: input.audioIngredientId,
      brandId: input.brandId,
      organizationId: input.organizationId,
      useCustomerKey: isByok,
      userId: input.userId,
    });
    const request = funded.request;
    return {
      apiKey: connection.apiKey,
      isByok,
      bind: (ingredientId) =>
        request
          ? this.avatarBilling.bindRender(request, funded.funding, ingredientId)
          : Promise.resolve(),
      reject: (ingredientId) =>
        request
          ? this.avatarBilling.releaseGenerationHold(
              ingredientId,
              input.organizationId,
            )
          : Promise.resolve(),
      releasePool: () =>
        request ? this.avatarBilling.releasePool(request) : Promise.resolve(),
    };
  }

  async fundVideoLipSync(
    input: LipSyncFundingInput & { model: string },
  ): Promise<WorkflowLipSyncFunding> {
    const credential = await this.byokService.lookupApiKey(
      input.organizationId,
      ByokProvider.REPLICATE,
    );
    if (credential) {
      return {
        apiKey: credential.apiKey,
        isByok: true,
        bind: () => Promise.resolve(),
        reject: () => Promise.resolve(),
        releasePool: () => Promise.resolve(),
      };
    }
    const seconds = await this.measuredSeconds(input);
    // Unpriced models are refused here (PRICING_UNAVAILABLE), never guessed.
    const snapshot = await this.modelQuotes.quoteSnapshotByKey(input.model, {
      duration: seconds,
      organizationId: input.organizationId,
    });
    if (!Number.isFinite(snapshot.credits) || !(snapshot.credits > 0))
      throw new BadRequestException(
        `Pricing is unavailable for ${input.model}.`,
      );
    const request = await this.generationBilling.holdForService({
      brandId: input.brandId,
      credits: snapshot.credits,
      description: `Workflow lip-sync video generation - ${input.model}`,
      organizationId: input.organizationId,
      source: ActivitySource.VIDEO_GENERATION,
      userId: input.userId,
    });
    const isPerSecond =
      snapshot.pricingProfile.pricingType === PricingType.PER_SECOND;
    return {
      isByok: false,
      bind: (ingredientId) =>
        this.generationBilling.bindOutput(request, {
          credits: snapshot.credits,
          ingredientId,
          // Settlement re-prices a per-second hold at the stored output length.
          ...(isPerSecond
            ? {
                metadata: {
                  avatarDurationQuote: { estimatedSeconds: seconds, snapshot },
                },
              }
            : {}),
          submissionIntentProvider: ByokProvider.REPLICATE,
        }),
      reject: (ingredientId) =>
        this.releaseOutput(ingredientId, input.organizationId),
      releasePool: () => this.generationBilling.releasePool(request),
    };
  }

  /** The voice's measured length: the meter both modes are held at. */
  private async measuredSeconds(input: LipSyncFundingInput): Promise<number> {
    const audio = await this.prisma.ingredient.findFirst({
      select: { metadata: { select: { duration: true } } },
      where: {
        id: input.audioIngredientId,
        isDeleted: false,
        organizationId: input.organizationId,
      },
    });
    const measured = readAvatarDurationSeconds(audio?.metadata?.duration);
    if (measured === undefined)
      throw new BadRequestException(
        'Add a saved narration with a known length to price this lip-sync.',
      );
    return Math.ceil(measured);
  }

  private async releaseOutput(
    ingredientId: string,
    organizationId: string,
  ): Promise<void> {
    try {
      await this.generationBilling.releaseOutput(ingredientId, organizationId);
    } catch (error: unknown) {
      this.loggerService.error(
        'WorkflowLipSyncFundingService output hold release failed',
        error,
        { ingredientId, organizationId },
      );
    }
  }
}
