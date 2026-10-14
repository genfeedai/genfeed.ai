import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import type {
  AccountGenerationFunding,
  AccountGenerationScope,
} from '@api/collections/posts/services/post-account-generation.types';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { createInsufficientCreditsException } from '@api/helpers/utils/credits/insufficient-credits.util';
import { assertOrganizationCreditsAvailable } from '@api/helpers/utils/credits/organization-credits-gate.util';
import { getMinimumTextCredits } from '@api/helpers/utils/text-pricing/text-pricing.util';
import { textDispatchApiKey } from '@api/services/byok/text-dispatch-byok.util';
import { TextGenerationCreditsService } from '@api/services/byok/text-generation-credits.service';
import { ActivitySource } from '@genfeedai/contracts';
import {
  GENERATION_POOL_WORKLOAD_TYPE,
  MEDIA_GENERATION_HOLD_TTL_MS,
  TEXT_GENERATION_WORKLOAD_TYPE,
} from '@genfeedai/contracts/constants';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

const DESCRIPTION = 'Account text generation';
/** A run has no fixed size, so its pool outlives the standard hold by this much per dispatch. */
const DISPATCH_WINDOW_MS = 2 * 60 * 1000;
const MAX_UNFUNDED_DISPATCHES = 50;

/**
 * Funding of one account or thread generation run (#5786). The run takes ONE
 * up-front hold for every dispatch it may make and refuses when the balance
 * cannot cover it. Each dispatch then carves its share out of that pool
 * (`bindDispatch`), settles it once the provider accepted the attempt, or
 * releases it; whatever no dispatch claimed goes back with `releaseRun`.
 * BYOK runs and free models take no hold.
 */
@Injectable()
export class PostAccountGenerationBillingService {
  private readonly logContext = 'PostAccountGenerationBillingService';

  constructor(
    private readonly credits: CreditsUtilsService,
    private readonly models: ModelsService,
    private readonly textCredits: TextGenerationCreditsService,
    private readonly logger: LoggerService,
  ) {}

  /** Throws 402 before any placeholder exists when the wallet cannot cover the run. */
  async reserveRun(params: {
    dispatchCount: number;
    model: string;
    runId: string;
    scope: AccountGenerationScope;
  }): Promise<AccountGenerationFunding> {
    const { dispatchCount, model, runId, scope } = params;
    const dispatch = await this.textCredits.resolveDispatch(
      scope.organizationId,
      [model],
    );
    const apiKey = textDispatchApiKey(dispatch, model);
    if (dispatch) {
      this.assertBatchSize(dispatchCount, 0);
      return { apiKey, creditsPerDispatch: 0, poolReservationId: null };
    }
    const pricedModel = await this.models.findOne({
      key: baseModelKey(model),
      isDeleted: false,
    });
    if (!pricedModel)
      throw new ServiceUnavailableException({
        code: 'PRICING_UNAVAILABLE',
        message: 'Account generation pricing is unavailable for this model.',
      });
    const creditsPerDispatch =
      pricedModel.pricingType === 'per-token'
        ? getMinimumTextCredits(pricedModel)
        : pricedModel.cost;
    if (
      creditsPerDispatch === null ||
      creditsPerDispatch === undefined ||
      !Number.isSafeInteger(creditsPerDispatch) ||
      creditsPerDispatch < 0
    )
      throw new ServiceUnavailableException(
        'account_generation_pricing_invalid',
      );
    if (creditsPerDispatch <= 0) {
      this.assertBatchSize(dispatchCount, 0);
      return { apiKey, creditsPerDispatch: 0, poolReservationId: null };
    }
    const total = creditsPerDispatch * dispatchCount;
    if (!Number.isSafeInteger(total))
      throw new ConflictException('account_generation_credit_amount_invalid');
    await assertOrganizationCreditsAvailable(
      this.credits,
      scope.organizationId,
      total,
    );
    try {
      const pool = await this.credits.reserveCredits({
        actorUserId: scope.actorUserId,
        amount: total,
        brandId: scope.brandId,
        description: DESCRIPTION,
        expiresAt: new Date(
          Date.now() +
            MEDIA_GENERATION_HOLD_TTL_MS +
            Math.min(
              dispatchCount * DISPATCH_WINDOW_MS,
              30 * 24 * 60 * 60 * 1000,
            ),
        ),
        idempotencyKey: `${GENERATION_POOL_WORKLOAD_TYPE}:account-text:${runId}`,
        organizationId: scope.organizationId,
        source: ActivitySource.POST_GENERATION,
        workloadId: runId,
        workloadType: GENERATION_POOL_WORKLOAD_TYPE,
      });
      return { apiKey, creditsPerDispatch, poolReservationId: pool.id };
    } catch (error: unknown) {
      if (
        error instanceof BusinessLogicException &&
        error.errorCode === 'INSUFFICIENT_CREDITS'
      ) {
        throw createInsufficientCreditsException(
          total,
          await this.credits.getOrganizationCreditsBalance(
            scope.organizationId,
          ),
        );
      }
      throw error;
    }
  }

  assertBatchSize(dispatchCount: number, creditsPerDispatch: number): void {
    if (creditsPerDispatch <= 0 && dispatchCount > MAX_UNFUNDED_DISPATCHES)
      throw new BadRequestException({
        code: 'account_generation_batch_limit',
        message:
          'BYOK and free-model batches are limited to 50 posts. Split larger requests into smaller batches.',
      });
  }

  async queuedApiKey(
    model: string,
    scope: AccountGenerationScope,
    isByok: boolean,
  ): Promise<string | undefined> {
    if (!isByok) return undefined;
    const dispatch = await this.textCredits.resolveDispatch(
      scope.organizationId,
      [model],
    );
    if (!dispatch)
      throw new ConflictException('account_generation_byok_unavailable');
    return textDispatchApiKey(dispatch, model);
  }

  /** The dispatch's own hold, carved out of the pool just before the provider call. */
  async bindDispatch(
    funding: AccountGenerationFunding,
    scope: AccountGenerationScope,
    dispatchKey: string,
  ): Promise<string | null> {
    if (!funding.poolReservationId) return null;
    const hold = await this.credits.bindReservationOutput({
      amount: funding.creditsPerDispatch,
      expiresAt: new Date(Date.now() + MEDIA_GENERATION_HOLD_TTL_MS),
      organizationId: scope.organizationId,
      reservationId: funding.poolReservationId,
      workloadId: dispatchKey,
      workloadType: TEXT_GENERATION_WORKLOAD_TYPE,
    });
    return hold.id;
  }

  /** Charges the dispatch's known price once the provider recorded an attempt. */
  async settleDispatch(
    funding: AccountGenerationFunding,
    scope: AccountGenerationScope,
    holdId: string,
    dispatchKey: string,
  ): Promise<void> {
    await this.credits.settleReservation({
      actorUserId: scope.actorUserId,
      actualAmount: funding.creditsPerDispatch,
      brandId: scope.brandId,
      description: DESCRIPTION,
      organizationId: scope.organizationId,
      reservationId: holdId,
      settlementIdempotencyKey: `${TEXT_GENERATION_WORKLOAD_TYPE}:${dispatchKey}:settled`,
      source: ActivitySource.POST_GENERATION,
    });
  }

  /** Returns a hold whose dispatch never reached the provider. */
  async releaseDispatch(
    scope: AccountGenerationScope,
    holdId: string,
  ): Promise<void> {
    await this.release(scope, holdId);
  }

  /** Returns whatever no dispatch claimed. Idempotent. */
  async releaseRun(
    funding: AccountGenerationFunding,
    scope: AccountGenerationScope,
  ): Promise<void> {
    if (funding.poolReservationId)
      await this.release(scope, funding.poolReservationId);
  }

  private async release(
    scope: AccountGenerationScope,
    reservationId: string,
  ): Promise<void> {
    try {
      await this.credits.releaseReservation({
        organizationId: scope.organizationId,
        reservationId,
      });
    } catch (error: unknown) {
      // Expiry returns an unreleased hold, so a failed release is logged, never fatal.
      this.logger.warn(`${this.logContext} release failed`, {
        error: error instanceof Error ? error.name : 'unknown',
        reservationId,
      });
    }
  }
}
