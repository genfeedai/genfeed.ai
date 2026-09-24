import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import type { ModelDocument } from '@api/collections/models/schemas/model.schema';
import { CreditDeductionQueueService } from '@api/queues/credit-deduction/credit-deduction-queue.service';
import { ByokService } from '@api/services/byok/byok.service';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import {
  ActivitySource,
  ByokProvider,
  CreditTransactionCategory,
} from '@genfeedai/contracts';
import type { CreditsConfig } from '@genfeedai/contracts/interfaces';
import type { CreditDeductionJobData } from '@genfeedai/contracts/queue';
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
    private readonly transactions: CreditTransactionsService,
    private readonly queue: CreditDeductionQueueService,
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
            actorUserId: input.user.id,
            amount: input.amount,
            expiresAt: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000),
            idempotencyKey: `interpolation:${input.ingredientId}`,
            organizationId: input.user.organizationId,
            workloadId: input.ingredientId,
            workloadType: 'interpolation',
          })
        : undefined;
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
    if (!externalId) return undefined;
    await this.recordAccepted(input, externalId, reservation?.id);
    return externalId;
  }

  private async recordAccepted(
    input: InterpolationDispatch,
    externalId: string,
    reservationId?: string,
  ): Promise<void> {
    const data: CreditDeductionJobData = {
      acceptedGeneration: { ingredientId: input.ingredientId, externalId },
      amount: input.amount,
      description: input.description,
      idempotencyKey: `interpolation-${input.ingredientId}`,
      organizationId: input.user.organizationId,
      reservationId,
      source: ActivitySource.VIDEO_GENERATION,
      type: input.apiKey ? 'record-byok-usage' : 'deduct-credits',
      userId: input.user.id,
    };
    let queued = false;
    try {
      if (input.apiKey) await this.queue.queueByokUsage(data);
      else await this.queue.queueDeduction(data);
      queued = true;
    } catch (error: unknown) {
      this.logger.error(
        'Accepted interpolation enqueue failed; attempting durable fallback',
        error,
        data.acceptedGeneration,
      );
    }
    let attached = false;
    try {
      await this.metadata.patch(
        input.metadataId,
        new MetadataEntity({ externalId }),
      );
      attached = true;
    } catch (error: unknown) {
      this.logger.error(
        'Accepted interpolation metadata requires recovery',
        error,
        data.acceptedGeneration,
      );
    }
    if (queued) return;
    if (!attached) {
      this.logger.error(
        'Accepted interpolation evidence requires operator reconciliation',
        { ...data, isByokBypass: Boolean(input.apiKey) },
      );
      return;
    }
    try {
      await this.settleFallback(data);
    } catch (error: unknown) {
      this.logger.error(
        'Accepted interpolation billing requires operator reconciliation',
        error,
        data,
      );
    }
  }

  private async settleFallback(data: CreditDeductionJobData): Promise<void> {
    if (data.type === 'record-byok-usage') {
      const balance = await this.credits.getOrganizationCreditsBalance(
        data.organizationId,
      );
      await this.transactions.createTransactionEntry(
        data.organizationId,
        CreditTransactionCategory.BYOK_USAGE,
        data.amount,
        balance,
        balance,
        data.source,
        `[BYOK] ${data.description}`,
        undefined,
        undefined,
        {
          idempotencyKey: `byok:${data.organizationId}:${data.idempotencyKey}`,
        },
      );
    } else if (data.reservationId && data.userId) {
      await this.credits.settleReservation({
        actorUserId: data.userId,
        actualAmount: data.amount,
        description: data.description,
        organizationId: data.organizationId,
        reservationId: data.reservationId,
        source: data.source,
      });
    }
  }
}
