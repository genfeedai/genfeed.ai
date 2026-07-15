import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { InsufficientCreditsException } from '@api/helpers/exceptions/business/business-logic.exception';
import type { CreditsConfig } from '@genfeedai/interfaces';
import { Injectable } from '@nestjs/common';
import type { Request } from 'express';

export const VOICE_CLONE_CREDITS = 17;
export const VOICE_CREDITS_PER_MINUTE = 17;

type VoiceCreditsRequest = Request & {
  creditsConfig?: CreditsConfig & {
    deferred?: boolean;
  };
};

@Injectable()
export class VoiceCreditsService {
  constructor(private readonly creditsUtilsService: CreditsUtilsService) {}

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

  async settleGenerationCredits(
    request: Request,
    organizationId: string,
    durationSeconds: number,
  ): Promise<void> {
    const seconds = Number(durationSeconds) || 0;
    const credits = Math.max(
      1,
      Math.ceil((seconds / 60) * VOICE_CREDITS_PER_MINUTE),
    );

    await this.assertOrganizationCanAfford(organizationId, credits);
    this.finalizeRequestCredits(request, credits);
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
