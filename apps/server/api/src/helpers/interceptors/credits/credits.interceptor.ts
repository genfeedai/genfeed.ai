import { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { CreditDeductionQueueService } from '@api/queues/credit-deduction/credit-deduction-queue.service';
import { ActivitySource } from '@genfeedai/enums';
import type { CreditsConfig } from '@genfeedai/interfaces';
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
      await this.creditDeductionQueueService.queueByokUsage({
        amount: currentCreditsConfig.amount || 0,
        description: currentCreditsConfig.description,
        organizationId: identity.organizationId,
        source: currentCreditsConfig.source || ActivitySource.SCRIPT,
        type: 'record-byok-usage',
      });
    } else {
      const sourceActionId = this.readSourceActionId(request.body);
      const settlementAssetId = this.readResponseAssetId(response);
      if (sourceActionId && !settlementAssetId) {
        if (currentCreditsConfig.reservationId) {
          await this.releaseReservation(
            currentCreditsConfig.reservationId,
            identity.organizationId,
          );
        }
        this.loggerService.warn(
          'Confirmed media returned no persisted asset; credits not queued',
          {
            organizationId: identity.organizationId,
            sourceActionId,
          },
        );
        return response;
      }
      await this.creditDeductionQueueService.queueDeduction({
        amount: currentCreditsConfig.amount || 0,
        description: currentCreditsConfig.description,
        maxOverdraftCredits: currentCreditsConfig.maxOverdraftCredits,
        metadata: currentCreditsConfig.pricingMetadata
          ? { ...currentCreditsConfig.pricingMetadata }
          : undefined,
        ...(sourceActionId
          ? {
              idempotencyKey: `agent-media-${sourceActionId}-${settlementAssetId}`,
              referenceId: settlementAssetId,
              referenceType: 'agent-media:generation',
              settlementAssetId,
            }
          : {}),
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

  private readResponseAssetId(response: unknown): string | undefined {
    if (!response || typeof response !== 'object') {
      return undefined;
    }
    const data = (response as { data?: unknown }).data;
    if (!data || typeof data !== 'object') {
      return undefined;
    }
    const id = (data as { id?: unknown }).id;
    return typeof id === 'string' && id.trim() ? id.trim() : undefined;
  }

  private readSourceActionId(body: unknown): string | undefined {
    if (!body || typeof body !== 'object') return undefined;
    const bodyRecord = body as Record<string, unknown>;
    const data = bodyRecord.data as Record<string, unknown> | undefined;
    const attributes =
      (data?.attributes as Record<string, unknown> | undefined) ??
      (bodyRecord.attributes as Record<string, unknown> | undefined);
    const raw = bodyRecord.sourceActionId ?? attributes?.sourceActionId;
    return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
  }

  private async releaseFailedReservation(
    config: DeferredCreditsConfig | undefined,
    organizationId: string,
  ): Promise<void> {
    this.loggerService.debug('Operation failed, credits not deducted', {
      amount: config?.amount,
      organizationId,
    });
    if (config?.reservationId) {
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
