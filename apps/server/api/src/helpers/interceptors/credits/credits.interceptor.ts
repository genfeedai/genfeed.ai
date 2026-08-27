import { AuthenticatedUser } from '@server/auth/interfaces/authenticated-user.interface';
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
import { Observable } from 'rxjs';
import { mergeMap, tap } from 'rxjs/operators';

type DeferredCreditsConfig = CreditsConfig & {
  deferred?: boolean;
  maxOverdraftCredits?: number;
};

@Injectable()
export class CreditsInterceptor implements NestInterceptor {
  constructor(
    private creditDeductionQueueService: CreditDeductionQueueService,
    private loggerService: LoggerService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const initialCreditsConfig: DeferredCreditsConfig | undefined =
      request.creditsConfig;

    if (!initialCreditsConfig) {
      return next.handle(); // No credits to deduct
    }

    const user = request.user;
    if (!user) {
      return next.handle();
    }

    const identity: AuthenticatedUser = user;

    return next.handle().pipe(
      tap({
        error: () => {
          const currentCreditsConfig: DeferredCreditsConfig | undefined =
            request.creditsConfig;

          // Don't deduct credits if the operation failed
          this.loggerService.debug('Operation failed, credits not deducted', {
            amount: currentCreditsConfig?.amount,
            organizationId: identity.organizationId,
          });
        },
      }),
      mergeMap(async (response: unknown) => {
        const currentCreditsConfig: DeferredCreditsConfig | undefined =
          request.creditsConfig;

        if (
          !currentCreditsConfig ||
          currentCreditsConfig.amount === undefined ||
          currentCreditsConfig.deferred === true ||
          (currentCreditsConfig.amount ?? 0) <= 0
        ) {
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
          const sourceActionId =
            typeof request.body?.sourceActionId === 'string'
              ? request.body.sourceActionId.trim()
              : undefined;
          const settlementAssetId = this.readResponseAssetId(response);
          if (sourceActionId && !settlementAssetId) {
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
          userId: user.id,
        });
        return response;
      }),
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
}
