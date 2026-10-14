import { GenerationBillingService } from '@api/collections/credits/services/generation-billing.service';
import { AvatarVideoBillingService } from '@api/collections/videos/services/avatar-video-billing.service';
import { estimateAvatarSpeechSeconds } from '@api/collections/videos/services/avatar-video-duration.util';
import type {
  AvatarVideoSubmissionHold,
  AvatarVideoSubmissionPlan,
} from '@api/services/avatar-video/avatar-video-provider.interface';
import { ActivitySource, ByokProvider } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

/**
 * Funds one HeyGen avatar clip. The clip result is the hold's workload: the
 * hold is bound to it before HeyGen sees the job, and the HeyGen clip webhook
 * settles it to the duration HeyGen returns or releases it on failure. A
 * customer HeyGen connection holds nothing.
 */
@Injectable()
export class ClipAvatarBillingService {
  constructor(
    private readonly avatarBilling: AvatarVideoBillingService,
    private readonly generationBilling: GenerationBillingService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Holds the clip at its estimated speech length on the engine row it renders
   * with (`heygen/avatar` for a photo, the engine row for a trained look).
   */
  async fund(input: {
    clipResultId: string;
    organizationId: string;
    plan: AvatarVideoSubmissionPlan;
    script: string;
    userId: string;
  }): Promise<AvatarVideoSubmissionHold | undefined> {
    if (input.plan.isByok) return undefined;
    const quote = await this.avatarBilling.quoteRender(
      input.plan.selection,
      estimateAvatarSpeechSeconds(input.script),
    );
    const request = await this.generationBilling.holdForService({
      credits: quote.credits,
      description: `Clip avatar video generation - ${input.plan.selection.modelKey}`,
      organizationId: input.organizationId,
      source: ActivitySource.VIDEO_GENERATION,
      userId: input.userId,
    });
    try {
      await this.generationBilling.bindOutput(request, {
        credits: quote.credits,
        ingredientId: input.clipResultId,
        ...(quote.durationQuote
          ? { metadata: { avatarDurationQuote: quote.durationQuote } }
          : {}),
        submissionIntentProvider: ByokProvider.HEYGEN,
      });
    } finally {
      await this.generationBilling.releasePool(request);
    }
    return {
      release: () => this.release(input.clipResultId, input.organizationId),
    };
  }

  /** Settles the clip's hold at the duration HeyGen billed. */
  async settle(
    clipResultId: string,
    organizationId: string,
    durationSeconds?: number,
  ): Promise<void> {
    try {
      await this.generationBilling.settleOutput(
        clipResultId,
        organizationId,
        durationSeconds === undefined ? {} : { durationSeconds },
      );
    } catch (error: unknown) {
      this.loggerService.error(
        'ClipAvatarBillingService clip settlement failed',
        error,
        { clipResultId, organizationId },
      );
    }
  }

  async release(clipResultId: string, organizationId: string): Promise<void> {
    try {
      await this.generationBilling.releaseOutput(clipResultId, organizationId);
    } catch (error: unknown) {
      this.loggerService.error(
        'ClipAvatarBillingService clip hold release failed',
        error,
        { clipResultId, organizationId },
      );
    }
  }
}
