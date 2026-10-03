import { randomUUID } from 'node:crypto';
import { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { GenerationQuoteGroupService } from '@api/collections/credits/services/generation-quote-group.service';
import { CreditDeductionQueueService } from '@api/queues/credit-deduction/credit-deduction-queue.service';
import { ActivitySource } from '@genfeedai/contracts';
import type { CreditsConfig } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { from, Observable, throwError } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';

export type DeferredCreditsConfig = CreditsConfig & {
  deferred?: boolean;
  maxOverdraftCredits?: number;
  reservationId?: string;
};

export interface CreditsInterceptorRequest {
  body?: unknown;
  creditsConfig?: DeferredCreditsConfig;
  user?: AuthenticatedUser;
}

@Injectable()
export class CreditsInterceptor implements NestInterceptor {
  constructor(
    private creditDeductionQueueService: CreditDeductionQueueService,
    private creditsUtilsService: CreditsUtilsService,
    private loggerService: LoggerService,
    private readonly quoteGroups: GenerationQuoteGroupService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<CreditsInterceptorRequest>();

    if (!request.creditsConfig || !request.user) {
      return next.handle(); // No credits to deduct
    }

    return next.handle().pipe(
      mergeMap((response: unknown) => this.settle(request, response)),
      catchError((error: unknown) =>
        from(this.release(request)).pipe(
          mergeMap(() => throwError(() => error)),
        ),
      ),
    );
  }

  /**
   * Explicit-input settlement of a successful billable call. Shared by the HTTP
   * interceptor adapter above and by the in-process agent generation gateway.
   * Returns the response untouched so it can be piped.
   */
  async settle(
    request: CreditsInterceptorRequest,
    response: unknown,
  ): Promise<unknown> {
    const identity = request.user;
    if (!identity) {
      return response;
    }

    const currentCreditsConfig = request.creditsConfig;

    if (
      !currentCreditsConfig ||
      currentCreditsConfig.amount === undefined ||
      currentCreditsConfig.deferred === true ||
      (currentCreditsConfig.amount ?? 0) <= 0
    ) {
      if (
        currentCreditsConfig?.reservationId &&
        currentCreditsConfig.deferred !== true
      ) {
        await this.releaseReservation(
          currentCreditsConfig.reservationId,
          identity.organizationId,
        );
      }
      this.loggerService.debug(
        'Credits deduction skipped: no finalized credits config',
        {
          organizationId: identity.organizationId,
        },
      );
      return response;
    }

    if (currentCreditsConfig.isByokBypass) {
      if (currentCreditsConfig.settlement === 'completion') return response;
      await this.creditDeductionQueueService.queueByokUsage({
        amount: currentCreditsConfig.amount || 0,
        description: currentCreditsConfig.description,
        idempotencyKey: this.chargeKey('byok-usage', currentCreditsConfig),
        organizationId: identity.organizationId,
        source: currentCreditsConfig.source || ActivitySource.SCRIPT,
        type: 'record-byok-usage',
      });
    } else {
      if (currentCreditsConfig.settlement === 'completion') {
        await this.releaseUnboundPool(currentCreditsConfig, identity);
        return response;
      }
      const assetId = this.readResponseAssetId(response);
      await this.creditDeductionQueueService.queueDeduction({
        amount: currentCreditsConfig.amount || 0,
        description: currentCreditsConfig.description,
        idempotencyKey: this.chargeKey('credit-settle', currentCreditsConfig),
        maxOverdraftCredits: currentCreditsConfig.maxOverdraftCredits,
        metadata:
          currentCreditsConfig.pricingMetadata || assetId
            ? {
                ...currentCreditsConfig.pricingMetadata,
                ...(assetId ? { assetId } : {}),
              }
            : undefined,
        ...(currentCreditsConfig.reservationId
          ? { reservationId: currentCreditsConfig.reservationId }
          : {}),
        organizationId: identity.organizationId,
        source: currentCreditsConfig.source || ActivitySource.SCRIPT,
        type: 'deduct-credits',
        userId: identity.userId,
      });
    }

    this.loggerService.log('Credit deduction job queued', {
      amount: currentCreditsConfig.amount || 0,
      description: currentCreditsConfig.description,
      isByokBypass: currentCreditsConfig.isByokBypass,
      userId: identity.id,
    });
    return response;
  }

  /**
   * Names the one logical charge this response settles. A reservation is
   * settled at most once, so its id is the stable identity. A request with no
   * hold has no other identity the interceptor can derive, so the charge gets
   * a fresh id here, once per settlement, never inside the queue job: the id
   * travels in the job payload and survives every retry and redelivery.
   */
  private chargeKey(
    prefix: 'byok-usage' | 'credit-settle',
    config: DeferredCreditsConfig,
  ): string {
    return config.reservationId
      ? `${prefix}:${config.reservationId}`
      : `${prefix}:${randomUUID()}`;
  }

  /**
   * Explicit-input release of the reservation held for a failed billable call.
   */
  async release(request: CreditsInterceptorRequest): Promise<void> {
    const identity = request.user;
    if (!identity) {
      return;
    }

    await this.releaseFailedReservation(
      request.creditsConfig,
      identity.organizationId,
    );
  }

  /**
   * A completion-settled route keeps nothing open on the response: each accepted
   * output already owns its hold, so only credits no output claimed (a dispatch
   * that never reached the provider) are given back.
   */
  private readResponseAssetId(response: unknown): string | undefined {
    if (!response || typeof response !== 'object' || !('data' in response))
      return undefined;
    const data = response.data;
    return data &&
      typeof data === 'object' &&
      'id' in data &&
      typeof data.id === 'string'
      ? data.id
      : undefined;
  }

  private async releaseUnboundPool(
    config: DeferredCreditsConfig,
    identity: NonNullable<CreditsInterceptorRequest['user']>,
  ): Promise<void> {
    if (!config.reservationId || config.isPoolReleaseDeferred) {
      return;
    }
    if (config.modelQuote) {
      await this.quoteGroups.closeDispatch(
        config.reservationId,
        identity.organizationId,
      );
      return;
    }
    if (!config.boundOutputCount) {
      this.loggerService.warn(
        'Completion-settled request bound no output; releasing its hold',
        {
          amount: config.amount,
          organizationId: identity.organizationId,
          reservationId: config.reservationId,
        },
      );
    }
    await this.releaseReservation(
      config.reservationId,
      identity.organizationId,
    );
  }

  private async releaseFailedReservation(
    config: DeferredCreditsConfig | undefined,
    organizationId: string,
  ): Promise<void> {
    this.loggerService.debug('Operation failed, credits not deducted', {
      amount: config?.amount,
      organizationId,
    });
    if (config?.reservationId && !config.isPoolReleaseDeferred) {
      if (config.settlement === 'completion' && config.modelQuote) {
        await this.quoteGroups.closeDispatch(
          config.reservationId,
          organizationId,
        );
        return;
      }
      await this.releaseReservation(config.reservationId, organizationId);
    }
  }

  private async releaseReservation(
    reservationId: string,
    organizationId: string,
  ): Promise<void> {
    try {
      await this.creditsUtilsService.releaseReservation({
        organizationId,
        reservationId,
      });
    } catch (error: unknown) {
      this.loggerService.error('Credit reservation release failed', error, {
        organizationId,
        reservationId,
      });
    }
  }
}
