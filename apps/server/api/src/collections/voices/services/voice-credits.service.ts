import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ModelCreditQuoteService } from '@api/collections/models/services/model-credit-quote.service';
import { InsufficientCreditsException } from '@api/exceptions/business-logic.exception';
import { ActivitySource } from '@genfeedai/contracts';
import type {
  CreditsConfig,
  ModelBillableQuoteSnapshot,
} from '@genfeedai/contracts/interfaces';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { Request } from 'express';

export const VOICE_CLONE_CREDITS = 17;

type VoiceCreditsRequest = Request & {
  creditsConfig?: CreditsConfig & {
    deferred?: boolean;
  };
};

@Injectable()
export class VoiceCreditsService {
  constructor(
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly modelCreditQuoteService: ModelCreditQuoteService,
  ) {}

  async assertOrganizationCanAfford(
    organizationId: string,
    credits: number,
  ): Promise<void> {
    const hasCredits =
      await this.creditsUtilsService.checkOrganizationCreditsAvailable(
        organizationId,
        credits,
      );

    if (hasCredits) {
      return;
    }

    const balance =
      await this.creditsUtilsService.getOrganizationCreditsBalance(
        organizationId,
      );
    throw new InsufficientCreditsException(credits, balance);
  }

  /**
   * Speech is billed per submitted character through the model's reviewed
   * `character` rate. Any other cost source reads `providerCostUsd` as a
   * per-run price and would undercharge long text, so it is refused.
   */
  async quoteSpeech(params: {
    characters: number;
    modelKey: string;
    organizationId: string;
    provider: string;
  }): Promise<ModelBillableQuoteSnapshot> {
    const snapshot = await this.modelCreditQuoteService.quoteSnapshotByKey(
      params.modelKey,
      {
        characters: params.characters,
        organizationId: params.organizationId,
        provider: params.provider,
      },
    );
    if (snapshot.costSource !== 'reviewed-provider')
      throw new ServiceUnavailableException({
        code: 'PRICING_UNAVAILABLE',
        detail: `${params.modelKey} has no reviewed per-character rate`,
        message: 'Speech pricing is unavailable right now',
        modelKey: params.modelKey,
        title: 'Pricing unavailable',
      });
    return snapshot;
  }

  /** Charges a settled speech quote once per ingredient. */
  async settleSpeechCredits(params: {
    brandId?: string | null;
    credits: number;
    ingredientId: string;
    organizationId: string;
    userId: string;
  }): Promise<void> {
    await this.creditsUtilsService.deductCreditsFromOrganization(
      params.organizationId,
      params.userId,
      params.credits,
      'Voice generation (TTS)',
      ActivitySource.VOICE_GENERATION,
      {
        brandId: params.brandId,
        idempotencyKey: `voice-generation:${params.ingredientId}`,
        maxOverdraftCredits: params.credits,
        referenceId: params.ingredientId,
        referenceType: 'agent-media:voice-generation',
      },
    );
  }

  async settleElevenLabsCloneCredits(
    request: Request,
    organizationId: string,
  ): Promise<void> {
    await this.assertOrganizationCanAfford(organizationId, VOICE_CLONE_CREDITS);
    this.finalizeRequestCredits(request, VOICE_CLONE_CREDITS);
  }

  private finalizeRequestCredits(request: Request, amount: number): void {
    const creditsRequest = request as VoiceCreditsRequest;

    if (!creditsRequest.creditsConfig) {
      return;
    }

    creditsRequest.creditsConfig = {
      ...creditsRequest.creditsConfig,
      amount,
      deferred: false,
    };
  }
}
