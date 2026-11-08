import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ModelCreditQuoteService } from '@api/collections/models/services/model-credit-quote.service';
import { quoteSpeechSnapshot } from '@api/collections/voices/utils/speech-quote.util';
import { InsufficientCreditsException } from '@api/exceptions/business-logic.exception';
import { ActivitySource } from '@genfeedai/contracts';
import type {
  CreditsConfig,
  ModelBillableQuoteSnapshot,
} from '@genfeedai/contracts/interfaces';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';
import type { Request } from 'express';

type VoiceCreditsRequest = Request & {
  creditsConfig?: CreditsConfig & {
    deferred?: boolean;
  };
};

@Traced()
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

  /** The reviewed per-character speech quote; see {@link quoteSpeechSnapshot}. */
  quoteSpeech(params: {
    characters: number;
    modelKey: string;
    organizationId: string;
    provider: string;
  }): Promise<ModelBillableQuoteSnapshot> {
    return quoteSpeechSnapshot(this.modelCreditQuoteService, params);
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

  /**
   * A clone made on the workspace's own provider account costs no platform
   * credits: the provider bills the account that owns the voice.
   */
  waivePersonalCloneCredits(request: Request): void {
    this.finalizeRequestCredits(request, 0);
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
