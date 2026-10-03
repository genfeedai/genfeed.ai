import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { GenerationBillingService } from '@api/collections/credits/services/generation-billing.service';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import type { ModelDocument } from '@api/collections/models/schemas/model.schema';
import { ByokService } from '@api/services/byok/byok.service';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { ActivitySource, ByokProvider } from '@genfeedai/contracts';
import {
  MEDIA_GENERATION_HOLD_TTL_MS,
  MEDIA_GENERATION_WORKLOAD_TYPE,
} from '@genfeedai/contracts/constants';
import type { CreditsConfig } from '@genfeedai/contracts/interfaces';
import {
  billCreditsFromProviderCost,
  calculateVideoGenerationCredits,
  getVideoGenerationResolutionCreditMultiplier,
} from '@genfeedai/pricing';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

type InterpolationDispatch = {
  amount: number;
  apiKey?: string;
  description: string;
  ingredientId: string;
  metadataId: string;
  modelKey: string;
  promptParams: Record<string, unknown>;
  user: AuthenticatedUser;
};

@Injectable()
export class BatchInterpolationBillingService {
  constructor(
    private readonly credits: CreditsUtilsService,
    private readonly generationBilling: GenerationBillingService,
    private readonly byok: ByokService,
    private readonly replicate: ReplicateService,
    private readonly metadata: MetadataService,
    private readonly logger: LoggerService,
  ) {}

  quote(
    model: ModelDocument,
    duration: number,
    width: number,
    height: number,
    builtInput: Record<string, unknown>,
  ): number {
    const fixedFrames =
      builtInput.num_frames !== undefined ||
      builtInput.frames_per_second !== undefined;
    const providerDuration = builtInput.duration ?? builtInput.seconds;
    if (providerDuration !== undefined) duration = Number(providerDuration);
    else if (fixedFrames && model.pricingType === 'per-second') {
      if (!model.defaultDuration)
        throw new BadRequestException(
          'Fixed-frame interpolation requires catalog duration for pricing',
        );
      duration = model.defaultDuration;
    }
    if (builtInput.width !== undefined) width = Number(builtInput.width);
    if (builtInput.height !== undefined) height = Number(builtInput.height);
    if (![width, height].every((value) => Number.isFinite(value) && value > 0))
      throw new BadRequestException(
        'Interpolation dimensions must be finite and positive',
      );
    const resolution =
      typeof builtInput.resolution === 'string'
        ? builtInput.resolution
        : undefined;
    if (!Number.isFinite(duration) || duration <= 0)
      throw new BadRequestException(
        'Interpolation duration must be finite and positive',
      );
    const providerCredits = billCreditsFromProviderCost(model, {
      duration,
      width,
      height,
    });
    const amount =
      providerCredits === null
        ? calculateVideoGenerationCredits({
            resolution,
            pricing: model,
            modelKey: model.key,
            duration,
            width,
            height,
            isBatchSupported: false,
            outputs: 1,
          }).credits
        : Math.ceil(
            providerCredits *
              getVideoGenerationResolutionCreditMultiplier(
                model.key,
                resolution,
              ),
          );
    if (!Number.isFinite(amount) || amount < 0) {
      throw new BadRequestException(
        'Interpolation price must be finite and non-negative',
      );
    }
    return amount;
  }

  async resolveApiKey(
    config: CreditsConfig | undefined,
    organizationId: string,
  ): Promise<string | undefined> {
    if (!config?.isByokBypass) return undefined;
    if (config.provider !== ByokProvider.REPLICATE) {
      throw new BadRequestException(
        'Interpolation BYOK requires a Replicate key',
      );
    }
    const key = await this.byok.resolveApiKey(
      organizationId,
      ByokProvider.REPLICATE,
    );
    if (!key?.apiKey)
      throw new BadRequestException('Interpolation BYOK key is unavailable');
    return key.apiKey;
  }

  async dispatch(input: InterpolationDispatch): Promise<string | undefined> {
    const reservation =
      !input.apiKey && input.amount > 0
        ? await this.credits.reserveCredits({
            actorUserId: input.user.userId ?? input.user.id,
            amount: input.amount,
            ...(input.user.brandId ? { brandId: input.user.brandId } : {}),
            expiresAt: new Date(Date.now() + MEDIA_GENERATION_HOLD_TTL_MS),
            description: input.description,
            source: ActivitySource.VIDEO_GENERATION,
            metadata: { assetId: input.ingredientId },
            idempotencyKey: `interpolation:${input.ingredientId}`,
            organizationId: input.user.organizationId,
            workloadId: input.ingredientId,
            workloadType: MEDIA_GENERATION_WORKLOAD_TYPE,
          })
        : undefined;
    if (input.apiKey) {
      await this.generationBilling.bindOutput(
        {
          user: input.user,
          creditsConfig: {
            amount: input.amount,
            description: input.description,
            source: ActivitySource.VIDEO_GENERATION,
            settlement: 'completion',
            isByokBypass: true,
          },
        },
        { credits: input.amount, ingredientId: input.ingredientId },
      );
    }
    let externalId: string | undefined;
    try {
      externalId = await this.replicate.generateTextToVideo(
        input.modelKey,
        input.promptParams,
        input.apiKey,
      );
    } catch (error: unknown) {
      this.logger.error('Interpolation provider dispatch failed', error, {
        ingredientId: input.ingredientId,
      });
    }
    if (!externalId && reservation) {
      try {
        await this.credits.releaseReservation({
          organizationId: input.user.organizationId,
          reservationId: reservation.id,
        });
      } catch (error: unknown) {
        this.logger.error(
          'Unaccepted interpolation hold requires release recovery',
          error,
          {
            organizationId: input.user.organizationId,
            ingredientId: input.ingredientId,
            reservationId: reservation.id,
          },
        );
      }
    }
    if (!externalId) {
      if (input.apiKey)
        await this.generationBilling.releaseOutput(
          input.ingredientId,
          input.user.organizationId,
        );
      return undefined;
    }
    await this.recordAccepted(input, externalId);
    return externalId;
  }

  private async recordAccepted(
    input: InterpolationDispatch,
    externalId: string,
  ): Promise<void> {
    try {
      await this.metadata.patch(
        input.metadataId,
        new MetadataEntity({ externalId }),
      );
    } catch (error: unknown) {
      this.logger.error(
        'Accepted interpolation metadata requires recovery',
        error,
        {
          ingredientId: input.ingredientId,
          organizationId: input.user.organizationId,
        },
      );
      try {
        await this.generationBilling.rememberAcceptedOutput({
          ingredientId: input.ingredientId,
          externalId,
          organizationId: input.user.organizationId,
          userId: input.user.userId ?? input.user.id,
        });
      } catch (recoveryError: unknown) {
        this.logger.error(
          'Accepted interpolation evidence requires operator reconciliation',
          recoveryError,
          {
            ingredientId: input.ingredientId,
            externalId,
            organizationId: input.user.organizationId,
          },
        );
      }
    }
  }
}
